import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import speakeasy from 'speakeasy';
import Stripe from 'stripe';
import { startTestEnvironment } from './harness.js';

let env;
let token;
let refreshToken;
let product;
let variant;
let collection;
let discount;
let orderId;

const suffix = Date.now().toString(36);
const buyerEmail = `buyer-${suffix}@example.com`;
const discountCode = `E2E${suffix.toUpperCase()}`;

async function request(pathname, { method = 'GET', body, useAuth = true, token: overrideToken } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const authToken = overrideToken ?? token;
  if (useAuth && authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await fetch(`${env.baseUrl}${pathname}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // CSV or HTML response
  }
  return { status: response.status, data, text, headers: response.headers };
}

before(
  async () => {
    env = await startTestEnvironment();
    const login = await request('/api/auth/login', {
      method: 'POST',
      useAuth: false,
      body: { email: 'admin@demo.com', password: 'Admin123!' },
    });
    assert.equal(login.status, 200, `login failed: ${JSON.stringify(login.data)}`);
    token = login.data.token;
    refreshToken = login.data.refresh_token;
  },
  { timeout: 180000 },
);

after(async () => {
  await env?.stop();
});

test('health and seeded catalog are available', async () => {
  const health = await request('/health', { useAuth: false });
  assert.equal(health.status, 200);
  assert.equal(health.data.ok, true);

  const products = await request('/api/storefront/products?limit=100', { useAuth: false });
  assert.equal(products.status, 200);
  assert.ok(products.data.products.length >= 12, 'seed should create at least 12 products');
  assert.ok(products.data.products.some((item) => item.handle === 'heavyweight-organic-tee'));

  const collections = await request('/api/storefront/collections', { useAuth: false });
  assert.ok(collections.data.collections.some((item) => item.handle === 'essentials'));

  const analytics = await request('/api/admin/analytics/summary');
  assert.equal(analytics.status, 200);
  assert.ok(analytics.data.revenue > 0, 'seeded paid orders should produce revenue');
  assert.equal(analytics.data.sales_last_30_days.length, 30);
});

test('admin routes reject unauthenticated requests', async () => {
  const response = await request('/api/admin/products', { useAuth: false });
  assert.equal(response.status, 401);
});

test('session, refresh rotation and current user', async () => {
  const me = await request('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, 'admin@demo.com');
  assert.equal(me.data.stores.length, 1);
  assert.equal(me.data.stores[0].name, 'Northwind Supply');

  const refreshed = await request('/api/auth/refresh', {
    method: 'POST',
    useAuth: false,
    body: { refresh_token: refreshToken },
  });
  assert.equal(refreshed.status, 200);
  assert.ok(refreshed.data.token);
  assert.notEqual(refreshed.data.refresh_token, refreshToken);

  const replay = await request('/api/auth/refresh', {
    method: 'POST',
    useAuth: false,
    body: { refresh_token: refreshToken },
  });
  assert.equal(replay.status, 401, 'rotated refresh tokens must not be reusable');
  refreshToken = refreshed.data.refresh_token;
});

test('product CRUD', async () => {
  const created = await request('/api/admin/products', {
    method: 'POST',
    body: {
      title: `E2E Tee ${suffix}`,
      descriptionHtml: '<p>Created by the e2e suite</p>',
      vendor: 'E2E',
      productType: 'Test',
      status: 'active',
      tags: ['e2e'],
      images: [],
      variants: [{ title: 'M', sku: `E2E-${suffix}`, price: 25, inventory: 10 }],
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  product = created.data.product;
  variant = product.variants[0];
  assert.equal(product.title, `E2E Tee ${suffix}`);
  assert.equal(product.price, 25);
  assert.equal(variant.inventory, 10);

  const list = await request(`/api/admin/products?search=${encodeURIComponent(`E2E Tee ${suffix}`)}`);
  assert.equal(list.status, 200);
  assert.equal(list.data.count, 1);

  const detail = await request(`/api/admin/products/${product.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.data.product.handle, product.handle);

  const updated = await request(`/api/admin/products/${product.id}`, {
    method: 'PUT',
    body: {
      title: `E2E Tee Updated ${suffix}`,
      variants: [{ id: variant.id, title: 'M', sku: variant.sku, price: 25, inventory: 10 }],
    },
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  assert.match(updated.data.product.title, /Updated/);
  product = updated.data.product;

  const storefront = await request(`/api/storefront/products/${product.handle}`, { useAuth: false });
  assert.equal(storefront.status, 200);
  assert.equal(storefront.data.product.id, product.id);
});

test('collection CRUD links products', async () => {
  const created = await request('/api/admin/collections', {
    method: 'POST',
    body: { title: `E2E Collection ${suffix}`, productIds: [product.id] },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  collection = created.data.collection;
  assert.equal(collection.products_count, 1);

  const detail = await request(`/api/admin/collections/${collection.id}`);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.data.collection.product_ids, [product.id]);

  const storefront = await request(`/api/storefront/collections/${collection.handle}`, { useAuth: false });
  assert.equal(storefront.status, 200);
  assert.ok(storefront.data.products.some((item) => item.id === product.id));
});

test('customer and discount creation', async () => {
  const customer = await request('/api/admin/customers', {
    method: 'POST',
    body: { email: `crm-${suffix}@example.com`, firstName: 'E2E', lastName: 'Customer' },
  });
  assert.equal(customer.status, 201, JSON.stringify(customer.data));
  assert.equal(customer.data.customer.email, `crm-${suffix}@example.com`);

  const createdDiscount = await request('/api/admin/discounts', {
    method: 'POST',
    body: { code: discountCode, type: 'percentage', value: 10, active: true },
  });
  assert.equal(createdDiscount.status, 201, JSON.stringify(createdDiscount.data));
  discount = createdDiscount.data.discount;
  assert.equal(discount.value, 10);
});

test('cart pricing is computed server-side', async () => {
  const cart = await request('/api/storefront/cart', {
    method: 'POST',
    useAuth: false,
    body: {
      items: [{ variantId: variant.id, quantity: 2 }],
      discountCode,
    },
  });
  assert.equal(cart.status, 200, JSON.stringify(cart.data));
  assert.equal(cart.data.cart.subtotal, 50);
  assert.equal(cart.data.cart.discount_total, 5);
  assert.equal(cart.data.cart.shipping_total, 6.95);
  assert.equal(cart.data.cart.total, 51.95);
  assert.equal(cart.data.cart.item_count, 2);

  const invalid = await request('/api/storefront/discounts/validate', {
    method: 'POST',
    useAuth: false,
    body: { code: 'NOT-A-REAL-CODE' },
  });
  assert.equal(invalid.status, 404);
});

test('checkout creates an order, decrements stock and supports lookup', async () => {
  const checkout = await request('/api/storefront/checkout', {
    method: 'POST',
    useAuth: false,
    body: {
      email: buyerEmail,
      items: [{ variantId: variant.id, quantity: 2 }],
      discountCode,
      paymentMethod: 'manual',
      shippingAddress: {
        first_name: 'E2E',
        last_name: 'Buyer',
        address1: '1 Test Street',
        city: 'Testville',
        region: 'TS',
        postal_code: '12345',
        country: 'United States',
      },
    },
  });
  assert.equal(checkout.status, 201, JSON.stringify(checkout.data));
  const order = checkout.data.order;
  assert.equal(order.email, buyerEmail);
  assert.equal(order.total, 51.95);
  assert.equal(order.financial_status, 'pending');
  assert.equal(order.fulfillment_status, 'unfulfilled');
  assert.equal(order.line_items[0].quantity, 2);
  assert.equal(order.discount_code, discountCode);

  const lookup = await request(
    `/api/storefront/orders/${order.number}?email=${encodeURIComponent(buyerEmail)}`,
    { useAuth: false },
  );
  assert.equal(lookup.status, 200);
  assert.equal(lookup.data.order.number, order.number);

  const wrongEmail = await request(
    `/api/storefront/orders/${order.number}?email=not-${encodeURIComponent(buyerEmail)}`,
    { useAuth: false },
  );
  assert.equal(wrongEmail.status, 404);

  const fresh = await request(`/api/admin/products/${product.id}`);
  assert.equal(fresh.data.product.variants[0].inventory, 8);

  orderId = order.id;
});

test('admin order actions mark paid, fulfil and refund', async () => {
  assert.ok(orderId, 'checkout should have produced an order');

  const paid = await request(`/api/admin/orders/${orderId}/mark-paid`, { method: 'POST' });
  assert.equal(paid.status, 200);
  assert.equal(paid.data.order.financial_status, 'paid');

  const fulfilled = await request(`/api/admin/orders/${orderId}/fulfill`, {
    method: 'POST',
    body: { trackingNumber: 'E2E-TRACK-1', notifyCustomer: false },
  });
  assert.equal(fulfilled.status, 200);
  assert.equal(fulfilled.data.order.fulfillment_status, 'fulfilled');
  assert.equal(fulfilled.data.order.tracking_number, 'E2E-TRACK-1');

  const refunded = await request(`/api/admin/orders/${orderId}/refund`, {
    method: 'POST',
    body: { notifyCustomer: false },
  });
  assert.equal(refunded.status, 200);
  assert.equal(refunded.data.order.financial_status, 'refunded');

  const usage = await request('/api/admin/discounts');
  const used = usage.data.discounts.find((item) => item.code === discountCode);
  assert.equal(used.usage_count, 1);
});

test('gift card covers the order and marks it paid', async () => {
  const cart = await request('/api/storefront/cart', {
    method: 'POST',
    useAuth: false,
    body: { items: [{ variantId: variant.id, quantity: 1 }], giftCardCode: 'GC-DEMO-50' },
  });
  assert.equal(cart.status, 200, JSON.stringify(cart.data));
  assert.equal(cart.data.cart.gift_card_applied, 31.95);
  assert.equal(cart.data.cart.total, 0);

  const checkout = await request('/api/storefront/checkout', {
    method: 'POST',
    useAuth: false,
    body: {
      email: `gift-${suffix}@example.com`,
      items: [{ variantId: variant.id, quantity: 1 }],
      giftCardCode: 'GC-DEMO-50',
      paymentMethod: 'manual',
    },
  });
  assert.equal(checkout.status, 201, JSON.stringify(checkout.data));
  assert.equal(checkout.data.order.total, 0);
  assert.equal(checkout.data.order.financial_status, 'paid');

  const cards = await request('/api/admin/gift-cards');
  const card = cards.data.gift_cards.find((item) => item.code === 'GC-DEMO-50');
  assert.equal(card.balance, 18.05);
});

test('CSV import and export round-trip', async () => {
  const csv = [
    'Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Variant SKU,Variant Inventory Qty,Variant Price',
    `csv-${suffix},CSV ${suffix},<p>csv</p>,E2E,Test,e2e,TRUE,CSV-${suffix},4,12.50`,
  ].join('\n');

  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'products.csv');
  const imported = await fetch(`${env.baseUrl}/api/admin/products/import-csv`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  assert.equal(imported.status, 200);
  const importData = await imported.json();
  assert.equal(importData.imported, 1);

  const exported = await fetch(`${env.baseUrl}/api/admin/products/export.csv`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get('content-type') || '', /text\/csv/);
  const text = await exported.text();
  assert.match(text, /^Handle,Title/);
  assert.match(text, new RegExp(`CSV-${suffix}`));
});

test('Shopify Admin API product and customer import', async () => {
  const imported = await request('/api/admin/products/import-shopify', {
    method: 'POST',
    body: {
      products: [
        {
          title: `Shopify Import ${suffix}`,
          handle: `shopify-import-${suffix}`,
          body_html: '<p>Imported from the Shopify Admin API</p>',
          vendor: 'Shopify Vendor',
          product_type: 'Imported',
          tags: 'shopify, imported',
          status: 'active',
          images: [{ src: 'https://cdn.example.com/shopify.jpg', alt: 'Imported' }],
          variants: [
            {
              title: 'Default Title',
              sku: `SHOP-${suffix}`,
              price: '19.95',
              inventory_quantity: 7,
              option1: 'Default',
            },
          ],
        },
      ],
    },
  });
  assert.equal(imported.status, 200, JSON.stringify(imported.data));
  assert.equal(imported.data.imported, 1);

  const product = imported.data.products[0];
  assert.equal(product.title, `Shopify Import ${suffix}`);
  assert.equal(product.handle, `shopify-import-${suffix}`);
  assert.equal(product.description_html, '<p>Imported from the Shopify Admin API</p>');
  assert.equal(product.product_type, 'Imported');
  assert.deepEqual(product.tags, ['shopify', 'imported']);
  assert.equal(product.variants[0].price, 19.95);
  assert.equal(product.variants[0].inventory, 7);
  assert.equal(product.variants[0].sku, `SHOP-${suffix}`);

  const storefront = await request(`/api/storefront/products/${product.handle}`, { useAuth: false });
  assert.equal(storefront.status, 200);
  assert.equal(storefront.data.product.id, product.id);

  // The Shopify Admin importer sends customers through the admin customer endpoint.
  const customer = await request('/api/admin/customers', {
    method: 'POST',
    body: {
      email: `shopify-customer-${suffix}@example.com`,
      firstName: 'Ada',
      lastName: 'Shopify',
      phone: '+15550123456',
    },
  });
  assert.equal(customer.status, 201, JSON.stringify(customer.data));
  assert.equal(customer.data.customer.email, `shopify-customer-${suffix}@example.com`);
  assert.equal(customer.data.customer.name, 'Ada Shopify');
  assert.equal(customer.data.customer.phone, '+15550123456');

  const search = await request(`/api/admin/customers?search=${encodeURIComponent(`shopify-customer-${suffix}@example.com`)}`);
  assert.equal(search.status, 200);
  assert.equal(search.data.count, 1);
});

test('Shopify importer CLI imports products, customers and orders from a mock Admin API', async () => {
  const sku = `CLI-${suffix}`;
  const email = `cli-customer-${suffix}@example.com`;
  let products = [
    {
      id: 7001,
      title: `CLI Imported ${suffix}`,
      handle: `cli-import-${suffix}`,
      body_html: '<p>Imported by the CLI</p>',
      vendor: 'CLI Vendor',
      product_type: 'CLI',
      tags: 'cli, importer',
      status: 'active',
      images: [{ src: 'https://cdn.example.com/cli.jpg' }],
      variants: [
        {
          id: 1,
          title: 'Default Title',
          sku,
          price: '24.00',
          inventory_quantity: 5,
          option1: 'Default',
        },
      ],
    },
  ];
  let customers = [
    { id: 7002, email, first_name: 'Grace', last_name: 'CLI', phone: '+15550001111' },
  ];
  let orders = [
    {
      id: 7003,
      name: '#3001',
      email,
      financial_status: 'paid',
      line_items: [{ sku, quantity: 2 }],
      shipping_address: {
        first_name: 'Grace',
        last_name: 'CLI',
        address1: '1 CLI Way',
        city: 'Testville',
        province: 'TS',
        zip: '12345',
        country: 'United States',
      },
    },
  ];

  const requests = [];
  const mock = http.createServer((req, res) => {
    requests.push({ url: req.url, token: req.headers['x-shopify-access-token'] });
    const resource = new URL(req.url, 'http://127.0.0.1').pathname.split('/').pop().replace('.json', '');
    const payload = { products, customers, orders }[resource];
    if (!payload) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ [resource]: payload }));
  });

  const mockPort = await new Promise((resolve, reject) => {
    mock.once('error', reject);
    mock.listen(0, '127.0.0.1', () => resolve(mock.address().port));
  });

  const scriptPath = fileURLToPath(new URL('../../scripts/shopify-import.js', import.meta.url));
  const runImporter = () =>
    new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [scriptPath, '--shopify-api', `http://127.0.0.1:${mockPort}`, '--token', 'shpat_e2e', '--api', env.baseUrl],
        { env: { ...process.env, CC_EMAIL: 'admin@demo.com', CC_PASSWORD: 'Admin123!' } },
      );
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Shopify importer timed out.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
      }, 60000);

      child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    });

  let first;
  let second;
  try {
    first = await runImporter();
    assert.equal(first.code, 0, `importer failed.\nstdout:\n${first.stdout}\nstderr:\n${first.stderr}`);
    assert.match(first.stdout, /imported products 1-1 \(1\)/);
    assert.match(first.stdout, /imported\/updated 1 customers/);
    assert.match(first.stdout, /imported 1\/1 orders/);
    assert.match(first.stdout, /Done\. Check the admin/);

    const firstCustomer = await request(`/api/admin/customers?search=${encodeURIComponent(email)}`);
    assert.equal(firstCustomer.data.count, 1);
    assert.equal(firstCustomer.data.customers[0].name, 'Grace CLI');

    // Re-run with an updated customer and no new products/orders. The customer
    // must be updated in place instead of being rejected by the unique email.
    products = [];
    orders = [];
    customers = [{ ...customers[0], first_name: 'Grace', last_name: 'Updated', phone: '+15550002222' }];
    requests.length = 0;
    second = await runImporter();
  } finally {
    await new Promise((resolve) => mock.close(resolve));
  }

  assert.equal(second.code, 0, `importer rerun failed.\nstdout:\n${second.stdout}\nstderr:\n${second.stderr}`);
  assert.match(second.stdout, /imported\/updated 1 customers \(0 created, 1 updated\)/);

  for (const resource of ['products', 'customers', 'orders']) {
    assert.ok(
      requests.some((req) => req.url.includes(`/admin/api/2024-01/${resource}.json`) && req.token === 'shpat_e2e'),
      `expected a Shopify ${resource} request with the access token`,
    );
  }

  const productSearch = await request(`/api/admin/products?search=${encodeURIComponent(sku)}`);
  assert.equal(productSearch.data.count, 1);
  const importedProduct = productSearch.data.products[0];
  assert.equal(importedProduct.variants[0].sku, sku);
  assert.equal(importedProduct.variants[0].inventory, 3, 'the imported order should decrement inventory by 2');

  const customerSearch = await request(`/api/admin/customers?search=${encodeURIComponent(email)}`);
  assert.equal(customerSearch.data.count, 1);

  const orderSearch = await request(`/api/admin/orders?search=${encodeURIComponent(email)}`);
  assert.equal(orderSearch.data.count, 1);
  const importedOrder = orderSearch.data.orders[0];
  assert.equal(importedOrder.financial_status, 'paid');
  assert.equal(importedOrder.line_items[0].sku, sku);
  assert.equal(importedOrder.line_items[0].quantity, 2);
  assert.match(importedOrder.notes, /Imported from Shopify #3001/);

  // The second import updated the existing customer rather than creating a duplicate.
  const updatedCustomer = await request(`/api/admin/customers?search=${encodeURIComponent(email)}`);
  assert.equal(updatedCustomer.data.count, 1);
  assert.equal(updatedCustomer.data.customers[0].name, 'Grace Updated');
  assert.equal(updatedCustomer.data.customers[0].phone, '+15550002222');

  const ordersAfterRerun = await request(`/api/admin/orders?search=${encodeURIComponent(email)}`);
  assert.equal(ordersAfterRerun.data.count, 1);
  assert.equal(ordersAfterRerun.data.orders[0].id, importedOrder.id);
});

test('Stripe webhook verifies signatures and marks an order paid', async () => {
  const created = await request('/api/admin/orders', {
    method: 'POST',
    body: {
      email: `stripe-${suffix}@example.com`,
      items: [{ variantId: variant.id, quantity: 1 }],
      paymentMethod: 'manual',
      markPaid: false,
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const stripeOrder = created.data.order;
  assert.equal(stripeOrder.financial_status, 'pending');

  const payload = JSON.stringify({
    id: `evt_e2e_${suffix}`,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_test_${suffix}`,
        object: 'checkout.session',
        payment_status: 'paid',
        payment_intent: `pi_e2e_${suffix}`,
        metadata: { orderId: stripeOrder.id },
      },
    },
  });

  const rejected = await fetch(`${env.baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 't=1,v1=deadbeef' },
    body: payload,
  });
  assert.equal(rejected.status, 400, 'an invalid Stripe signature must be rejected');

  const stillPending = await request(`/api/admin/orders/${stripeOrder.id}`);
  assert.equal(stillPending.data.order.financial_status, 'pending');

  const stripe = new Stripe('sk_test_e2e');
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_e2e' });
  const webhook = await fetch(`${env.baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
    body: payload,
  });
  assert.equal(webhook.status, 200);
  assert.deepEqual(await webhook.json(), { received: true });

  const paid = await request(`/api/admin/orders/${stripeOrder.id}`);
  assert.equal(paid.status, 200);
  assert.equal(paid.data.order.financial_status, 'paid');
  assert.ok(paid.data.order.paid_at, 'paid order should record paid_at');
  const paidAt = paid.data.order.paid_at;

  await new Promise((resolve) => setTimeout(resolve, 20));
  const duplicate = await fetch(`${env.baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
    body: payload,
  });
  assert.equal(duplicate.status, 200);
  assert.deepEqual(await duplicate.json(), { received: true });

  const afterDuplicate = await request(`/api/admin/orders/${stripeOrder.id}`);
  assert.equal(afterDuplicate.data.order.financial_status, 'paid');
  assert.equal(afterDuplicate.data.order.paid_at, paidAt, 'duplicate delivery must not capture payment again');
});

test('Stripe payment_intent webhook marks paid and duplicate delivery is idempotent', async () => {
  const created = await request('/api/admin/orders', {
    method: 'POST',
    body: {
      email: `stripe-intent-${suffix}@example.com`,
      items: [{ variantId: variant.id, quantity: 1 }],
      paymentMethod: 'manual',
      markPaid: false,
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const intentOrder = created.data.order;
  assert.equal(intentOrder.financial_status, 'pending');

  const payload = JSON.stringify({
    id: `evt_intent_${suffix}`,
    object: 'event',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: `pi_direct_${suffix}`,
        object: 'payment_intent',
        metadata: { orderId: intentOrder.id },
      },
    },
  });
  const stripe = new Stripe('sk_test_e2e');
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_e2e' });
  const deliver = () =>
    fetch(`${env.baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
      body: payload,
    });

  const first = await deliver();
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { received: true });

  const paid = await request(`/api/admin/orders/${intentOrder.id}`);
  assert.equal(paid.data.order.financial_status, 'paid');
  assert.ok(paid.data.order.paid_at);
  const paidAt = paid.data.order.paid_at;

  await new Promise((resolve) => setTimeout(resolve, 20));
  const duplicate = await deliver();
  assert.equal(duplicate.status, 200);

  const afterDuplicate = await request(`/api/admin/orders/${intentOrder.id}`);
  assert.equal(afterDuplicate.data.order.financial_status, 'paid');
  assert.equal(afterDuplicate.data.order.paid_at, paidAt, 'a duplicate webhook must not capture payment again');
});

test('Stripe checkout async payment and unhandled events are handled safely', async () => {
  const createPending = (label) =>
    request('/api/admin/orders', {
      method: 'POST',
      body: {
        email: `stripe-${label}-${suffix}@example.com`,
        items: [{ variantId: variant.id, quantity: 1 }],
        paymentMethod: 'manual',
        markPaid: false,
      },
    });

  const asyncOrderResponse = await createPending('async');
  assert.equal(asyncOrderResponse.status, 201, JSON.stringify(asyncOrderResponse.data));
  const asyncOrder = asyncOrderResponse.data.order;
  assert.equal(asyncOrder.financial_status, 'pending');

  const stripe = new Stripe('sk_test_e2e');
  const send = (payload) => {
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_e2e' });
    return fetch(`${env.baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
      body: payload,
    });
  };

  const asyncPayload = JSON.stringify({
    id: `evt_async_${suffix}`,
    object: 'event',
    type: 'checkout.session.async_payment_succeeded',
    data: {
      object: {
        id: `cs_async_${suffix}`,
        object: 'checkout.session',
        payment_status: 'paid',
        payment_intent: `pi_async_${suffix}`,
        metadata: { orderId: asyncOrder.id },
      },
    },
  });
  const asyncWebhook = await send(asyncPayload);
  assert.equal(asyncWebhook.status, 200);
  assert.deepEqual(await asyncWebhook.json(), { received: true });

  const paidAsyncOrder = await request(`/api/admin/orders/${asyncOrder.id}`);
  assert.equal(paidAsyncOrder.data.order.financial_status, 'paid');
  assert.ok(paidAsyncOrder.data.order.paid_at);

  const ignoredOrderResponse = await createPending('ignored');
  assert.equal(ignoredOrderResponse.status, 201, JSON.stringify(ignoredOrderResponse.data));
  const ignoredOrder = ignoredOrderResponse.data.order;

  const ignoredPayload = JSON.stringify({
    id: `evt_ignored_${suffix}`,
    object: 'event',
    type: 'charge.refunded',
    data: { object: { id: `ch_${suffix}`, object: 'charge' } },
  });
  const ignoredWebhook = await send(ignoredPayload);
  assert.equal(ignoredWebhook.status, 200);
  assert.deepEqual(await ignoredWebhook.json(), { received: true });

  const unchanged = await request(`/api/admin/orders/${ignoredOrder.id}`);
  assert.equal(unchanged.data.order.financial_status, 'pending');
  assert.equal(unchanged.data.order.paid_at, null);
});

test('two-factor login requires and accepts a TOTP code', async () => {
  const setup = await request('/api/auth/2fa/setup', { method: 'POST' });
  assert.equal(setup.status, 200, JSON.stringify(setup.data));
  assert.ok(setup.data.secret);

  const code = speakeasy.totp({ secret: setup.data.secret, encoding: 'base32' });
  const enabled = await request('/api/auth/2fa/enable', { method: 'POST', body: { code } });
  assert.equal(enabled.status, 200, JSON.stringify(enabled.data));
  assert.equal(enabled.data.twoFAEnabled, true);

  const passwordOnly = await request('/api/auth/login', {
    method: 'POST',
    useAuth: false,
    body: { email: 'admin@demo.com', password: 'Admin123!' },
  });
  assert.equal(passwordOnly.status, 401);
  assert.equal(passwordOnly.data.twoFactorRequired, true);

  const wrongCode = code === '000000' ? '111111' : '000000';
  const rejected = await request('/api/auth/login', {
    method: 'POST',
    useAuth: false,
    body: { email: 'admin@demo.com', password: 'Admin123!', totp: wrongCode },
  });
  assert.equal(rejected.status, 401);

  const signedIn = await request('/api/auth/login', {
    method: 'POST',
    useAuth: false,
    body: { email: 'admin@demo.com', password: 'Admin123!', totp: code },
  });
  assert.equal(signedIn.status, 200, JSON.stringify(signedIn.data));
  assert.ok(signedIn.data.token);

  const disabled = await request('/api/auth/2fa/disable', {
    method: 'POST',
    body: { password: 'Admin123!' },
  });
  assert.equal(disabled.status, 200);
  assert.equal(disabled.data.twoFAEnabled, false);

  const passwordOnlyAgain = await request('/api/auth/login', {
    method: 'POST',
    useAuth: false,
    body: { email: 'admin@demo.com', password: 'Admin123!' },
  });
  assert.equal(passwordOnlyAgain.status, 200);
});

test('deleting a product removes it from the catalog', async () => {
  const deleted = await request(`/api/admin/products/${product.id}`, { method: 'DELETE' });
  assert.equal(deleted.status, 200);

  const gone = await request(`/api/admin/products/${product.id}`);
  assert.equal(gone.status, 404);

  const products = await request('/api/admin/products?limit=250');
  assert.ok(!products.data.products.some((item) => item.id === product.id));
});
