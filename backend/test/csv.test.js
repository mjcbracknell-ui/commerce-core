import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseCsvObjects, productsToShopifyCsv, shopifyCsvToProducts } from '../src/lib/csv.js';

test('parses quoted fields, embedded commas and newlines', () => {
  const rows = parseCsv('a,b\n"x,y","line1\nline2"\n"he said ""hi""",2');
  assert.deepEqual(rows, [
    ['a', 'b'],
    ['x,y', 'line1\nline2'],
    ['he said "hi"', '2'],
  ]);
});

test('maps csv rows to objects', () => {
  const [row] = parseCsvObjects('Title,Price\nShirt,19.99');
  assert.deepEqual(row, { Title: 'Shirt', Price: '19.99' });
});

test('groups Shopify products.csv rows into one product with variants', () => {
  const csv = [
    'Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Variant SKU,Variant Inventory Qty,Variant Price,Variant Compare At Price,Image Src',
    'classic-tee,Classic Tee,<p>Soft</p>,Acme,Apparel,"shirts, basics",TRUE,TS-S,4,19.99,24.99,https://img/tee.jpg',
    'classic-tee,,,,,,,TS-M,2,19.99,,',
  ].join('\n');
  const products = shopifyCsvToProducts(csv);
  assert.equal(products.length, 1);
  assert.equal(products[0].title, 'Classic Tee');
  assert.deepEqual(products[0].tags, ['shirts', 'basics']);
  assert.equal(products[0].variants.length, 2);
  assert.equal(products[0].variants[1].sku, 'TS-M');
  assert.equal(products[0].featuredImage, 'https://img/tee.jpg');
});

test('exports Shopify-compatible CSV with escaped values', () => {
  const csv = productsToShopifyCsv([
    {
      handle: 'tee',
      title: 'Tee, "soft"',
      descriptionHtml: '<p>Hi</p>',
      vendor: 'Acme',
      productType: 'Apparel',
      tags: ['a', 'b'],
      status: 'active',
      featuredImage: 'https://img/x.jpg',
      variants: [
        { sku: 'S', inventory: 3, price: 19.99, compareAtPrice: 24.99 },
        { sku: 'M', inventory: 1, price: 19.99 },
      ],
    },
  ]);
  const lines = csv.split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^Handle,Title/);
  assert.match(lines[1], /"Tee, ""soft"""/);
  assert.match(lines[1], /TRUE/);
  assert.match(lines[2], /,M,1,19\.99,,/);
});
