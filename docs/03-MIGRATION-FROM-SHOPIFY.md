# Migration from Shopify

Commerce Core accepts Shopify product JSON and the standard Shopify product CSV. The importer signs into your own admin API, so it works the same locally or on a server.

## Admin API import

```bash
node scripts/shopify-import.js --shop myshop.myshopify.com --token shpat_xxx
```

What it does:

1. Signs in to `http://localhost:4000` with `CC_EMAIL` / `CC_PASSWORD` (defaults `admin@demo.com` / `Admin123!`).
2. Pages through Shopify's Admin API (`products.json`, `customers.json`, `orders.json`, `limit=250` with Link pagination).
3. POSTs products in batches to `/api/admin/products/import-shopify`. `body_html`, `product_type`, images, tags, options and all variants (price, compare-at, SKU, inventory) are mapped.
4. Creates customers via `/api/admin/customers` (duplicates by email are skipped).
5. Rebuilds orders by matching Shopify line-item SKUs to local variants. Orders with no matching SKUs are skipped and reported. Paid Shopify orders are imported as paid.

Options: `--api https://your-store.example`, `--dry-run`, `--email`, `--password`.

The Shopify token needs `read_products`, `read_customers`, `read_orders` scopes. API version used: `2024-01`.

## CSV import

```bash
node scripts/shopify-import.js --csv products.csv
```

or upload the file in **Admin → Products → Import CSV**. Both hit `POST /api/admin/products/import-csv`, which groups Shopify's one-row-per-variant export into products and upserts by handle. Re-importing updates the existing product and replaces its variants.

Export a compatible CSV from **Admin → Products → Export CSV** (`GET /api/admin/products/export.csv`).

## Themes

Shopify Liquid themes work through the LiquidJS renderer:

- **Admin → Themes → Upload theme ZIP** (max 10MB; `.liquid`, `.json`, `.css`, `.js`, `.svg`)
- The archive must contain `layout/theme.liquid`
- `templates/index.json` composes sections; `sections/*.liquid` receive `section.settings`
- `{% render 'snippet' %}` is inlined from `snippets/`
- Theme metadata (`settings_schema.json`, `config/settings_data.json`) is preserved but not interpreted yet

The bundled `themes/dawn-clone` can be installed from the admin with one click.
