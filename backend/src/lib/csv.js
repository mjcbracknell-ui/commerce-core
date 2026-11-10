/** Minimal RFC-4180-ish CSV parser (handles quotes, escaped quotes, CRLF, newlines). */
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

export function parseCsvObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((row) => {
    const obj = {};
    header.forEach((key, index) => {
      obj[key] = row[index] ?? '';
    });
    return obj;
  });
}

const escapeCell = (value) => {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(header, rows) {
  const lines = [header.map(escapeCell).join(',')];
  for (const row of rows) lines.push(row.map(escapeCell).join(','));
  return lines.join('\n');
}

const tagsToString = (tags) => (Array.isArray(tags) ? tags.join(', ') : tags || '');
const boolFromStatus = (status) => (status === 'active' ? 'TRUE' : 'FALSE');

/** Shopify-compatible products.csv export (one row per variant). */
export function productsToShopifyCsv(products) {
  const header = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published',
    'Variant SKU', 'Variant Inventory Qty', 'Variant Price', 'Variant Compare At Price',
    'Image Src',
  ];
  const rows = [];
  for (const product of products) {
    const variants = product.variants?.length ? product.variants : [{ title: 'Default Title' }];
    variants.forEach((variant, index) => {
      rows.push([
        index === 0 ? product.handle : '',
        index === 0 ? product.title : '',
        index === 0 ? product.descriptionHtml || '' : '',
        index === 0 ? product.vendor || '' : '',
        index === 0 ? product.productType || '' : '',
        index === 0 ? tagsToString(product.tags) : '',
        index === 0 ? boolFromStatus(product.status) : '',
        variant.sku || '',
        variant.inventory ?? 0,
        Number(variant.price ?? 0).toFixed(2),
        variant.compareAtPrice != null ? Number(variant.compareAtPrice).toFixed(2) : '',
        index === 0 ? product.featuredImage || (product.images?.[0] ?? '') : '',
      ]);
    });
  }
  return toCsv(header, rows);
}

/**
 * Group Shopify CSV rows into product payloads
 * (supports the standard products.csv export as well as a flat single-row CSV).
 */
export function shopifyCsvToProducts(text) {
  const rows = parseCsvObjects(text);
  const products = new Map();

  for (const row of rows) {
    const handle = (row.Handle || row.handle || '').trim();
    const title = (row.Title || row.title || '').trim();
    if (!handle && !title) continue;
    const key = handle || title.toLowerCase();

    if (!products.has(key)) {
      const tags = (row.Tags || row.tags || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      products.set(key, {
        handle: handle || undefined,
        title: title || handle,
        descriptionHtml: row['Body (HTML)'] || row.Body || '',
        vendor: row.Vendor || '',
        productType: row.Type || '',
        tags,
        status: String(row.Published || '').toLowerCase() === 'false' ? 'draft' : 'active',
        images: row['Image Src'] || row.Image ? [{ src: row['Image Src'] || row.Image }] : [],
        featuredImage: row['Image Src'] || row.Image || null,
        variants: [],
      });
    }

    const product = products.get(key);
    if (row['Variant Price'] || row.Price || row['Variant SKU'] || row.SKU) {
      product.variants.push({
        title: row['Variant Title'] || row.Variant || 'Default Title',
        sku: row['Variant SKU'] || row.SKU || null,
        price: Number(row['Variant Price'] || row.Price || 0),
        compareAtPrice: row['Variant Compare At Price'] ? Number(row['Variant Compare At Price']) : null,
        inventory: Number(row['Variant Inventory Qty'] || row.Inventory || 0),
        option1: row['Option1 Value'] || null,
        option2: row['Option2 Value'] || null,
        option3: row['Option3 Value'] || null,
      });
    }
  }

  const result = [...products.values()];
  for (const product of result) {
    if (!product.variants.length) {
      product.variants.push({ title: 'Default Title', price: 0, inventory: 0 });
    }
  }
  return result;
}
