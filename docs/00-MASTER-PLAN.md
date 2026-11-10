# MASTER PLAN - Everything Needed

## Business Model
You sell CommerceCore ONCE. Customer gets Docker image + license key + updates for 12 months (optional renewal for updates only, NOT required to keep running).
Price tiers: Single Store $299, Unlimited Stores $899, Agency $1499.
Revenue also: Theme Store (30% cut), App Store (20% cut), Priority Support $49/mo optional.

## Tech Decisions (Locked)
Backend: Node 20, Express, Prisma, Postgres, Redis, Meilisearch, MinIO S3, LiquidJS
Frontend: Next.js 14 App Router, Tailwind, Zustand, React Query
Admin: Next.js, shadcn/ui
Mobile: Expo SDK 51, EAS Build -> APK/AAB
Payments for merchants: Stripe, PayPal, Manual, COD. Built-in via plugins.
Auth: JWT + refresh, bcrypt, 2FA TOTP
License: RSA-2048 sign/verify, offline + online heartbeat

> Implementation note: the shipped storefront/admin use hand-written CSS (no Tailwind/shadcn/React Query dependency) with Zustand for the cart. Everything else above is implemented.

## Phases
1. Auth + Stores + Products — DONE (JWT/refresh, 2FA, store scoping, variants, CSV/Shopify import)
2. Cart + Checkout + Orders + Discounts + Gift Cards — DONE (server-side pricing, stock guards, refunds, fulfilment, gift cards)
3. Themes + Liquid + Storefront — DONE (ZIP upload, sections/snippets, preview, bundled Dawn clone)
4. Apps + Webhooks + API Keys — DONE (integration catalog, signed webhooks with delivery logs, storefront API keys)
5. Email + POS + Multi-vendor + Marketplace — Email DONE (SMTP order/fulfilment/refund mail). POS, multi-vendor and marketplace are not included.
6. License + Billing for YOUR sales + APK — DONE (RSA-2048 keys, verify/activate/revoke, Expo admin app)

## Shopify Interchangeability Checklist
- Product JSON shape identical — DONE (`/api/admin/products/import-shopify`)
- Liquid sections/blocks/snippets — DONE (sections + snippets; blocks stored but not rendered yet)
- Theme ZIP upload — DONE
- CSV import/export — DONE (Shopify products.csv)
- Admin REST /api/admin/* — DONE
- Storefront API /api/storefront/* — DONE
- Webhook topics: orders/create, products/update etc — DONE with HMAC signatures
