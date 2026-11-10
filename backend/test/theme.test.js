import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineSnippets, loadBundledTheme, renderTheme } from '../src/lib/theme.js';

const files = {
  'layout/theme.liquid':
    '<!doctype html><html><head><title>{{ shop.name }}</title></head><body>{% render "header" %}{{ content_for_layout }}{% render "footer" %}</body></html>',
  'snippets/header.liquid': '<header>HEADER {{ shop.name }}</header>',
  'snippets/footer.liquid': '<footer>FOOTER</footer>',
  'templates/index.json': JSON.stringify({
    sections: {
      hero: { type: 'hero', settings: { heading: 'Big sale' } },
      featured: { type: 'featured-products' },
    },
    order: ['hero', 'featured'],
  }),
  'sections/hero.liquid': '<section><h1>{{ section.settings.heading }}</h1></section>',
  'sections/featured-products.liquid':
    '<div class="grid">{% for product in products %}{% render "product-card" %}{% endfor %}</div>',
  'snippets/product-card.liquid': '<article>{{ product.title }} - {{ product.price }}</article>',
};

test('inlines snippets recursively', () => {
  assert.equal(inlineSnippets(files, '{% render "header" %}'), '<header>HEADER {{ shop.name }}</header>');
});

test('renders layout, sections, settings and snippets', async () => {
  const html = await renderTheme({
    files,
    data: {
      shop: { name: 'Demo Shop' },
      products: [
        { title: 'Tee', price: 19.99 },
        { title: 'Hat', price: 9.5 },
      ],
    },
  });
  assert.match(html, /<title>Demo Shop<\/title>/);
  assert.match(html, /<header>HEADER Demo Shop<\/header>/);
  assert.match(html, /<h1>Big sale<\/h1>/);
  assert.match(html, /<article>Tee - 19.99<\/article>/);
  assert.match(html, /<article>Hat - 9.5<\/article>/);
  assert.match(html, /<footer>FOOTER<\/footer>/);
});

test('renders an empty theme without throwing', async () => {
  const html = await renderTheme({ files: {}, data: { shop: { name: 'Empty' } } });
  assert.match(html, /Empty/);
});

test('bundled Dawn clone loads and renders its templates', async () => {
  const bundled = loadBundledTheme('dawn-clone');
  assert.ok(bundled, 'bundled theme should exist');
  assert.ok(bundled.files['layout/theme.liquid']);
  const html = await renderTheme({
    files: bundled.files,
    data: {
      shop: { name: 'Bundled Store', currency: 'USD' },
      products: [{ title: 'Sample Shirt', price: 19.99, featured_image: null, available: true, variants: [{}] }],
      collections: [{ title: 'All', handle: 'all' }],
      cart: { item_count: 0 },
    },
  });
  assert.match(html, /Bundled Store/);
  assert.match(html, /Sample Shirt/);
});
