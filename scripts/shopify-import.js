import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const [rawKey, inline] = argv[i].slice(2).split('=');
    const next = argv[i + 1];
    if (inline !== undefined) {
      args[rawKey] = inline;
    } else if (next && !next.startsWith('--')) {
      args[rawKey] = next;
      i += 1;
    } else {
      args[rawKey] = true;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const shop = String(args.shop || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
// Allows pointing the importer at a Shopify-compatible endpoint (self-hosted or a test mock).
const shopifyApi = String(args['shopify-api'] || (shop ? `https://${shop}` : '')).replace(/\/$/, '');
const token = args.token || process.env.SHOPIFY_ADMIN_TOKEN;
const apiBase = String(args.api || 'http://localhost:4000').replace(/\/$/, '');
const email = args.email || process.env.CC_EMAIL || 'admin@demo.com';
const password = args.password || process.env.CC_PASSWORD || 'Admin123!';
const csvPath = args.csv;
const dryRun = Boolean(args['dry-run']);

const log = (...values) => console.log(...values);

async function api(pathname, options = {}) {
  const response = await fetch(`${apiBase}${pathname}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body instanceof FormData ? {} : options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${pathname} → ${response.status}: ${data?.error || 'request failed'}`);
  return data;
}

async function login() {
  const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  return data.token;
}

async function fetchShopify(pathname, loginToken) {
  const url = /^https?:/.test(pathname) ? pathname : `${shopifyApi}/admin/api/2024-01/${pathname}`;
  const response = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': loginToken, 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error(`Shopify ${url} → ${response.status} ${await response.text()}`);
  return response;
}

async function fetchAll(resource) {
  let next = `${resource}.json?limit=250`;
  const rows = [];
  while (next) {
    const response = await fetchShopify(next, token);
    const data = await response.json();
    rows.push(...(data[resource] || []));
    const link = response.headers.get('link') || '';
    const match = link.match(/<([^>]+)>;\s*rel="next"/);
    next = match ? match[1] : null;
    log(`  fetched ${rows.length} ${resource}…`);
  }
  return rows;
}

async function importProducts(authToken) {
  const products = await fetchAll('products');
  if (dryRun) {
    log(`[dry-run] would import ${products.length} products`);
    return;
  }
  const chunkSize = 25;
  for (let i = 0; i < products.length; i += chunkSize) {
    const chunk = products.slice(i, i + chunkSize);
    const result = await api('/api/admin/products/import-shopify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ products: chunk }),
    });
    log(`  imported products ${i + 1}-${i + chunk.length} (${result.imported})`);
  }
}

async function fetchLocalCustomers(authToken) {
  const customers = [];
  let page = 1;
  for (;;) {
    const data = await api(`/api/admin/customers?limit=250&page=${page}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    customers.push(...(data.customers || []));
    if (page >= (data.pages || 1)) break;
    page += 1;
  }
  return customers;
}

async function importCustomers(authToken) {
  const customers = await fetchAll('customers');
  if (dryRun) {
    log(`[dry-run] would import ${customers.length} customers`);
    return;
  }

  // Match on email so a re-import refreshes existing people instead of failing
  // on the unique customer constraint.
  const existing = await fetchLocalCustomers(authToken);
  const byEmail = new Map(existing.map((customer) => [String(customer.email).toLowerCase(), customer]));
  let created = 0;
  let updated = 0;

  for (const customer of customers) {
    const email = String(customer.email || '').trim().toLowerCase();
    if (!email) {
      log('  skipped a customer without an email');
      continue;
    }
    const body = JSON.stringify({
      email,
      firstName: customer.first_name || null,
      lastName: customer.last_name || null,
      phone: customer.phone || null,
    });
    const local = byEmail.get(email);
    try {
      if (local) {
        const result = await api(`/api/admin/customers/${local.id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${authToken}` },
          body,
        });
        byEmail.set(email, result.customer);
        updated += 1;
      } else {
        const result = await api('/api/admin/customers', {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
          body,
        });
        byEmail.set(email, result.customer);
        created += 1;
      }
    } catch (error) {
      log(`  skipped customer ${email}: ${error.message}`);
    }
  }
  log(`  imported/updated ${customers.length} customers (${created} created, ${updated} updated)`);
}

async function importOrders(authToken) {
  const orders = await fetchAll('orders');
  if (dryRun) {
    log(`[dry-run] would import ${orders.length} orders`);
    return;
  }
  const { products } = await api('/api/admin/products?limit=250', { headers: { Authorization: `Bearer ${authToken}` } });
  const bySku = new Map();
  for (const product of products) {
    for (const variant of product.variants) {
      if (variant.sku) bySku.set(variant.sku, variant.id);
    }
  }

  let imported = 0;
  for (const order of orders) {
    const items = [];
    for (const line of order.line_items || []) {
      const variantId = bySku.get(line.sku);
      if (variantId) items.push({ variantId, quantity: line.quantity });
    }
    if (!items.length) {
      log(`  skipped order ${order.name}: no matching local SKUs`);
      continue;
    }
    await api('/api/admin/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        email: order.email || order.contact_email || 'imported@example.com',
        items,
        shippingAddress: order.shipping_address
          ? {
              first_name: order.shipping_address.first_name,
              last_name: order.shipping_address.last_name,
              address1: order.shipping_address.address1,
              city: order.shipping_address.city,
              region: order.shipping_address.province,
              postal_code: order.shipping_address.zip,
              country: order.shipping_address.country,
            }
          : null,
        notes: `Imported from Shopify ${order.name}`,
        paymentMethod: 'manual',
        markPaid: order.financial_status === 'paid',
      }),
    }).catch((error) => log(`  skipped order ${order.name}: ${error.message}`));
    imported += 1;
  }
  log(`  imported ${imported}/${orders.length} orders`);
}

async function importCsv(authToken) {
  const file = fs.readFileSync(path.resolve(process.cwd(), csvPath));
  const form = new FormData();
  form.append('file', new Blob([file], { type: 'text/csv' }), path.basename(csvPath));
  const result = await api('/api/admin/products/import-csv', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: form,
  });
  log(`CSV import complete: ${result.imported} products`);
}

async function main() {
  if (!csvPath && (!shopifyApi || !token)) {
    console.error(`Usage:
  node scripts/shopify-import.js --shop my-store.myshopify.com --token shpat_xxx [--api http://localhost:4000]
  node scripts/shopify-import.js --shopify-api http://localhost:8080 --token shpat_xxx [--api http://localhost:4000]
  node scripts/shopify-import.js --csv products.csv [--api http://localhost:4000]`);
    process.exit(1);
  }

  log(`Signing in to CommerceCore at ${apiBase} as ${email}…`);
  const authToken = await login();

  if (csvPath) {
    await importCsv(authToken);
    return;
  }

  log(`Importing from ${shop || shopifyApi}…`);
  await importProducts(authToken);
  await importCustomers(authToken);
  await importOrders(authToken);
  log('\nDone. Check the admin to review imported data.');
}

main().catch((error) => {
  console.error('Import failed:', error.message);
  process.exit(1);
});
