# Deployment

## VPS (Ubuntu 22.04 + Docker)

```bash
git clone <your-repo> /opt/commercecore && cd /opt/commercecore
cp .env.example .env
# edit .env: JWT_SECRET, URLs, LICENSE_*, STRIPE_*
npm run keys                       # only if you have not created license keys yet
docker compose up -d --build
docker compose exec backend npm run seed
```

Put Caddy in front for automatic TLS:

```
store.example.com {
  reverse_proxy localhost:3000
}
admin.example.com {
  reverse_proxy localhost:3001
}
api.example.com {
  reverse_proxy localhost:4000
}
```

Set `FRONTEND_URL`, `ADMIN_URL`, `CORS_ORIGINS` and `NEXT_PUBLIC_API_URL` to the public HTTPS origins, rebuild the frontends (build args), and set `SECURE_COOKIES=true`.

The backend container runs `prisma migrate deploy` before starting, so schema updates apply on deploy. Migrations live in `backend/prisma/migrations`.

## Scaling

The API keeps no session state (JWT + Postgres), so it scales horizontally:

```bash
docker compose up -d --scale backend=3
```

Place Caddy/nginx in front for load balancing. Postgres, Redis and Meilisearch remain single services (or move to managed instances). Meilisearch is optional; without `MEILI_HOST` search falls back to SQL.

## Backups

```bash
DATABASE_URL=postgresql://... npm run backup
```

Writes `backups/commercecore-<timestamp>.sql.gz` and mirrors MinIO/S3 assets when `mc` is configured. Schedule with cron and copy off-box.

## Payments

Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, then point Stripe at:

```
https://api.example.com/api/webhooks/stripe
```

The storefront only offers card payment when Stripe is configured; manual and cash-on-delivery always work. The webhook marks orders paid and emits `orders/paid`.

## Mobile admin APK

```bash
cd mobile-admin
npm install
npx expo prebuild
eas build --platform android --profile production --local
```

Update `API_BASE` in `mobile-admin/App.js` to your public API URL before building. The APK logs in with the same admin credentials.

## Verification checklist

- `curl https://api.example.com/health` → `{ok:true}`
- Sign in at the admin, create a product, see it on the storefront
- Place a manual order; confirm it appears in admin and email lands in SMTP logs/MailHog
- `POST /api/license/verify` with a real key and the production domain
- Stripe test card → webhook marks the order paid
