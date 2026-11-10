# Security checklist

## Implemented

- bcrypt password hashing at 12 rounds.
- JWT access tokens (15 min, `cc_access` httpOnly cookie or Bearer header) and rotating refresh tokens (7 days, SHA-256 hashed in `RefreshToken`, revocable).
- httpOnly, SameSite=Lax cookies; `secure` toggled with `SECURE_COOKIES`/production.
- TOTP 2FA (speakeasy) with QR enrolment and password-confirmed disable.
- Store-scoped authorisation: every admin query filters by `storeId` from the authenticated membership; write routes require `owner`/`admin`.
- Passwords and refresh tokens are never returned in API responses.
- Zod validation on every write route and query parsing with clamps.
- Prisma parameterised queries throughout.
- Rate limits: 300 req/min global, 30 per 15 min on auth, 30 per min on checkout.
- CORS allowlist via `CORS_ORIGINS` (localhost allowed outside production) with credentials.
- Helmet headers; CSP disabled only because themes and emails use inline styles.
- File uploads: ZIP themes only, 10MB cap, path traversal and extension filtering; CSV capped at 10MB.
- Server-side pricing, stock and discount validation — client prices are never trusted.
- Atomic inventory decrement (`inventory >= quantity` guard) to prevent overselling.
- Stripe webhook signature verification on the raw body.
- Outgoing webhooks signed with HMAC-SHA256 (`X-CommerceCore-Hmac-SHA256`), retried with backoff and logged.
- RSA-2048 license verification; private key never needed at runtime; revocation checked against Postgres.
- Order lookup requires the matching order number **and** email.
- Audit log table exists for admin actions (`AuditLog`).
- Secrets only in environment variables; `.env`, `keys/` and backups are gitignored.

## Before production

- [ ] Set a long random `JWT_SECRET` and rotate it from the demo value.
- [ ] Set `ALLOW_DEMO_LICENSE=false`; run `npm run keys` and issue real licenses.
- [ ] Set `SECURE_COOKIES=true` and serve everything over HTTPS.
- [ ] Change the demo admin password; enable 2FA.
- [ ] Restrict `CORS_ORIGINS` to exact production origins.
- [ ] Add a virus-scanning hook for uploaded themes if you accept untrusted archives.
- [ ] Keep Postgres and MinIO private (no public ports in production compose).
- [ ] Schedule backups and test a restore.

## Known limitations

- No built-in WAF or bot protection; put Cloudflare/Caddy in front.
- Theme Liquid is rendered with LiquidJS, not Shopify's exact runtime; unusual custom tags or Ruby-specific filters may need porting.
- Search indexing is best-effort: product writes do not block on Meilisearch, and the SQL fallback may lag on typo tolerance.
