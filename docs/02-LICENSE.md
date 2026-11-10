# License System — buy once

CommerceCore licenses are RSA-2048 signed payloads. The customer's backend verifies locally with a public key; no phone-home is required. An optional heartbeat checks revocation.

## Generate the keypair (you, the seller)

```bash
npm run keys
```

This writes `keys/license-private.pem` (secret) and `keys/license-public.pem`, and prints one-line `LICENSE_PUBLIC_KEY`, `LICENSE_PRIVATE_KEY` and `LICENSE_ADMIN_TOKEN` values for `.env`. Never ship the private key to a customer image.

## Issue a license

```bash
npm run license -- --domain shop.example.com --tier agency --updates 365
```

Output is `<base64url(payload)>.<base64url(RSA-SHA256 signature)>`. The payload contains `id`, `domain`, `tier`, `issued_at`, optional `updates_until` and optional `expires_at`. Keys without `expires_at` are perpetual.

To issue through the running server instead, set `LICENSE_ADMIN_TOKEN` and call:

```bash
curl -X POST http://localhost:4000/api/license/generate \
  -H "Content-Type: application/json" \
  -H "X-License-Admin-Token: $LICENSE_ADMIN_TOKEN" \
  -d '{"domain":"shop.example.com","tier":"agency","updatesDays":365}'
```

The key is stored in the `License` table so it can be revoked.

## Verify / activate

```bash
curl -X POST http://localhost:4000/api/license/verify \
  -H "Content-Type: application/json" \
  -d '{"license_key":"...","domain":"shop.example.com"}'
```

- Missing/malformed signature → `400`
- Domain mismatch → `401`
- Revoked key → `403`
- Wildcards (`*.example.com`) are supported, `www.` is stripped, and ports/protocols are ignored.

`POST /api/license/activate` stores the domain binding and activation timestamp. `GET /api/license/status?license_key=...` is the 7-day heartbeat used to detect revocation.

## Demo mode

`DEMO-PERPETUAL-1234` is accepted only when `ALLOW_DEMO_LICENSE=true` (default outside production). Set it to `false` in production and rotate `JWT_SECRET` before going live.
