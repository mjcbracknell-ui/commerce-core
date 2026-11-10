# Commerce Core — multi-store commerce platform

[![Tests](../../actions/workflows/tests.yml/badge.svg)](../../actions/workflows/tests.yml)

Run your own Shopify-style platform. Merchants sign up, get an isolated store with its own catalog, customers,
orders, checkout, themes and a storefront on their own domain — all from one deployment you own outright. No
subscription, no per-transaction platform fee, no vendor lock-in.

One codebase ships a multi-tenant storefront, a merchant admin dashboard, a Shopify-compatible API, Liquid themes, RSA licensing, and a mobile admin app.

## What is included

| Area | Implementation |
| --- | --- |
| Backend | Node 20, Express, Prisma + Postgres, JWT access/refresh tokens, bcrypt, TOTP 2FA |
| Storefront | Next.js 14 App Router store with cart, discounts, gift cards, checkout, order lookup |
| Admin | Next.js dashboard for products, variants, collections, orders, customers, discounts, themes, API keys, webhooks, analytics, settings |
| Themes | LiquidJS renderer with layout/sections/snippets, ZIP upload, preview, bundled Dawn clone |
| Commerce | Server-side pricing, inventory, tax, flat/free shipping, percentage/fixed/free-shipping discounts, gift cards |
| Payments | Stripe Checkout + webhook, manual payment, cash on delivery |
| Integrations | Meilisearch with SQL fallback, SMTP email (MailHog locally), S3/MinIO config, signed outgoing webhooks |
| Licensing | RSA-2048 signed perpetual license keys, domain binding, activation and revocation |
| Migration | Shopify Admin API importer (products, customers, orders) and Shopify CSV import/export |
| Mobile | Expo admin app for revenue, orders and one-tap fulfilment |

## Quick start (Docker)

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec backend npm run seed
```

| Service | URL |
| --- | --- |
| Storefront | http://localhost:3000 |
| Admin | http://localhost:3001 |
| API | http://localhost:4000 |
| Meilisearch | http://localhost:7700 |
| MailHog | http://localhost:8025 |
| MinIO console | http://localhost:9001 |

Demo login: `admin@demo.com` / `Admin123!` — change it immediately on a real deployment.

## Create a storefront

Open http://localhost:3001/register, enter a store name and account details, and the platform provisions an
isolated store with an owner membership. The demo store lives at http://localhost:3000; each new store gets a
subdomain such as `acme.localhost` (open `http://acme.localhost:3000`).

The storefront resolves its tenant from the request host and sends that domain to the API; an unknown host
returns 404 instead of falling back to another store. Administrators can switch stores from the sidebar and
create more under **Storefronts**. In production set `PLATFORM_DOMAIN` to your apex domain (for example
`shop.example.com`) and point a wildcard DNS record at the storefront.

Demo promotions: `WELCOME10` (10% off), `SAVE20` ($20 off over $100), `FREESHIP`, gift card `GC-DEMO-50`.

The seed is idempotent: it creates/refreshes the demo user, store, catalog, collections, customers, discounts and theme, and only creates orders when the store has none.

## Local development without Docker

Requires Node 20 and Postgres 16 (or a hosted Postgres connection string).

```bash
cp .env.example .env          # point DATABASE_URL at your Postgres
npm run setup                 # installs backend, storefront, admin
npm --prefix backend run prisma:deploy
npm run seed
npm --prefix backend run dev  # :4000
npm --prefix storefront run dev  # :3000
npm --prefix admin run dev    # :3001
```

Set `INTERNAL_API_URL=http://localhost:4000` when running the storefront outside Docker; `NEXT_PUBLIC_API_URL` is baked into the browser bundles.

## Licensing (your sales, not the merchant's)

```bash
npm run keys                                   # writes keys/*.pem and prints env values
npm run license -- --domain shop.example.com --tier agency --updates 365
```

The backend verifies keys with `LICENSE_PUBLIC_KEY` (`POST /api/license/verify`), binds activation to a domain, and checks revocation in Postgres. Keys are perpetual unless `--expires` is supplied. A demo key (`DEMO-PERPETUAL-1234`) is accepted only while `ALLOW_DEMO_LICENSE=true`.

To sell licenses server-side, set `LICENSE_ADMIN_TOKEN` and call `POST /api/license/generate` with header `X-License-Admin-Token`. `POST /api/license/revoke` retires a key.

## Shopify migration

```bash
# Admin API (products, customers, orders; maps variants by SKU)
node scripts/shopify-import.js --shop my-store.myshopify.com --token shpat_xxx

# Standard Shopify products.csv
node scripts/shopify-import.js --csv products.csv

# Any Shopify-compatible endpoint (self-hosted proxy or local mock)
node scripts/shopify-import.js --shopify-api http://localhost:8080 --token shpat_xxx
```

The importer signs into your Commerce Core admin (defaults `admin@demo.com` / `Admin123!`, override with `CC_EMAIL` / `CC_PASSWORD`), imports in batches, and skips orders whose SKUs do not exist locally. Re-running it updates existing customers by email and upserts products instead of failing on duplicates. CSV export: **Admin → Products → Export CSV** (`GET /api/admin/products/export.csv`).

Themes: **Admin → Themes → Upload theme ZIP**. Theme archives must contain `layout/theme.liquid`; sections are composed by `templates/index.json`, and `{% render 'snippet' %}` is supported. The bundled Dawn clone can be installed with one click.

## Tests

```bash
npm test          # unit tests
npm run test:e2e  # HTTP API against a disposable Postgres
```

Unit tests cover cart pricing/tax/discounts/gift cards, RSA license sign/verify (domain binding, tampering, expiry, wildcards), CSV parsing/Shopify mapping, Liquid theme rendering, and slugs/domain normalisation.

The e2e suite provisions a throwaway Postgres 16 cluster with `embedded-postgres` (no Docker or system Postgres needed), applies the Prisma migrations, runs the seed, boots the real API on a random port, and exercises seed data, login and refresh-token rotation, two-factor login, self-serve store creation with per-tenant catalog isolation and unknown-host 404s, product/collection/customer/discount CRUD, Shopify Admin API product and customer imports plus an idempotent importer re-run, paginated importer responses via `Link` headers, server-side cart pricing, checkout and inventory decrement, order lookup, admin fulfil/refund, gift cards, Stripe webhook signature verification, checkout and payment-intent events, duplicate delivery, event-id deduplication before payment, payment capture, and Shopify CSV import/export. The cluster and its data directory are removed when the run ends.

GitHub Actions runs both suites on every push and pull request (`.github/workflows/tests.yml`).

## Project layout

```
backend/        Express API, Prisma schema + migration, Liquid renderer, seed
storefront/     Next.js customer storefront
admin/          Next.js admin dashboard
mobile-admin/   Expo admin app (APK via EAS)
themes/         Bundled dawn-clone Liquid theme
scripts/        Seed wrapper, key/license generation, Shopify importer, backup
docs/           Master plan, API spec, licensing, migration, deployment, security
```

## API surface

- Account (`JWT`): `/api/auth/register`, `/api/auth/login`, `/api/auth/me`, `/api/auth/stores`
- Admin (`JWT`, store from `X-Store-Id`): `/api/admin/products`, `/collections`, `/orders`, `/customers`, `/discounts`, `/gift-cards`, `/themes`, `/webhooks`, `/api-keys`, `/apps`, `/analytics/summary`, `/settings`
- Storefront (public or `X-API-Key`): `/api/storefront/products`, `/collections/:handle`, `/cart`, `/checkout`, `/search`, `/orders/:number`
- Webhooks in: `POST /api/webhooks/stripe`
- Webhooks out: `orders/create|paid|fulfilled|refunded|cancelled`, `products/create|update|delete`, `customers/create|update`, signed with `X-CommerceCore-Hmac-SHA256`
- License: `/api/license/verify`, `/activate`, `/status`, `/generate`, `/revoke`

## Production notes

- Set a strong `JWT_SECRET`, generate real license keys, set `ALLOW_DEMO_LICENSE=false`, and serve over HTTPS (`SECURE_COOKIES=true`).
- Set `PLATFORM_DOMAIN` and add wildcard DNS (`*.shop.example.com`) so every merchant storefront resolves to the app.
- Processed Stripe webhook event IDs are retained for 30 days; the API prunes older rows on startup and every 24 hours.
- Back up Postgres with `npm run backup` (pg_dump + optional MinIO mirror).
- The API is stateless; scale with `docker compose up --scale backend=3` behind a load balancer.
- Build the Android APK: `cd mobile-admin && npx eas build --platform android --profile production --local`.

See `docs/` for the API spec, licensing, migration, deployment and security checklists.
