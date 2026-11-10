# API SPEC

All admin routes require a JWT (`Authorization: Bearer <token>`) or the httpOnly `cc_access` cookie. Access tokens last 15 minutes; `POST /api/auth/refresh` rotates the refresh token (7 days) using the `cc_refresh` cookie.

Admin routes are scoped to a store: the first store membership is used, or pass `X-Store-Id`. Write routes require the `owner` or `admin` store role.

## Auth

| Method | Path | Body |
| --- | --- | --- |
| POST | /api/auth/register | `{email, password, name?, storeName, currency?}` |
| POST | /api/auth/login | `{email, password, totp?}` |
| POST | /api/auth/refresh | cookie or `{refresh_token}` |
| POST | /api/auth/logout | — |
| GET | /api/auth/me | — |
| POST | /api/auth/2fa/setup \| enable \| disable | `{code}` / `{password}` |
| POST | /api/auth/change-password | `{currentPassword, newPassword}` |

## Admin API

| Method | Path | Notes |
| --- | --- | --- |
| GET | /api/admin/products?limit=&page=&search=&status=&collectionId= | paginated |
| POST | /api/admin/products | `{title, handle?, descriptionHtml?, vendor?, productType?, status?, tags[], images[], variants[]}` |
| GET/PUT/DELETE | /api/admin/products/:id | variants are reconciled by id |
| POST | /api/admin/products/import-shopify | `{products:[shopifyProduct]}` |
| POST | /api/admin/products/import-csv | multipart `file` or `{csv}` |
| GET | /api/admin/products/export.csv | Shopify-compatible CSV |
| GET/POST | /api/admin/collections | `{title, handle?, productIds[]}` |
| GET/PUT/DELETE | /api/admin/collections/:id | |
| POST | /api/admin/collections/:id/products | `{productIds[]}` |
| GET | /api/admin/orders?search=&financial_status=&fulfillment_status= | |
| GET | /api/admin/orders/:id | includes shipment history and per-shipment tracking |
| POST | /api/admin/orders | manual order |
| POST | /api/admin/orders/:id/fulfill | `{items?, trackingNumber?, trackingUrl?, carrier?, notifyCustomer}` — `items` enables partial shipments; omit it to fulfill all remaining items |
| POST | /api/admin/orders/:id/refund | `{amount?, notifyCustomer}` |
| POST | /api/admin/orders/:id/cancel | `{reason?, restock}` |
| POST | /api/admin/orders/:id/mark-paid | |
| GET/POST | /api/admin/customers | |
| GET/PUT/DELETE | /api/admin/customers/:id | |
| GET/POST | /api/admin/discounts | `{code, type, value, usageLimit?, minSubtotal?, active?, startsAt?, endsAt?}` |
| PUT/DELETE | /api/admin/discounts/:id | |
| GET/POST | /api/admin/gift-cards | `{code?, balance, currency?, active?, expiresAt?}` |
| PUT/DELETE | /api/admin/gift-cards/:id | DELETE disables |
| GET | /api/admin/themes | |
| POST | /api/admin/themes/upload | multipart `file` (ZIP), optional `name` |
| POST | /api/admin/themes/install-bundled | `{name}` |
| POST | /api/admin/themes/:id/activate | |
| GET | /api/admin/themes/:id/preview?template= | HTML preview |
| GET/POST | /api/admin/webhooks | `{topic, url, secret?, active?}` |
| POST | /api/admin/webhooks/:id/test | signed test delivery |
| GET | /api/admin/webhooks/:id/deliveries | last 50 attempts |
| GET/POST | /api/admin/api-keys | POST returns plaintext key once |
| DELETE | /api/admin/api-keys/:id | revokes |
| GET | /api/admin/apps | integration catalog + configured flags |
| GET | /api/admin/analytics/summary | revenue, AOV, 30-day series, top products |
| GET/PUT | /api/admin/settings | store name, domain, currency, tax/shipping settings |

## Storefront API (public)

Identify the store with `X-API-Key` (from the admin), `X-Store-Domain`, or the first store.

| Method | Path | Notes |
| --- | --- | --- |
| GET | /api/storefront/settings | public store config + payment methods |
| GET | /api/storefront/products?limit=&page=&search=&collection=&sort=featured\|newest\|price_asc\|price_desc\|title | |
| GET | /api/storefront/products/:handle | includes related products |
| GET | /api/storefront/collections | |
| GET | /api/storefront/collections/:handle | |
| POST | /api/storefront/cart | `{items:[{variantId, quantity}], discountCode?, giftCardCode?}` — server-side pricing |
| POST | /api/storefront/discounts/validate | `{code, items?}` |
| POST | /api/storefront/gift-cards/validate | `{code}` |
| POST | /api/storefront/checkout | `{email, items, shippingAddress, discountCode?, giftCardCode?, paymentMethod: manual\|cod\|card, notes?}` |
| GET | /api/storefront/orders/:number?email= | guest order lookup |
| POST | /api/storefront/account/register | `{email, password, firstName?, lastName?, phone?}` — creates a pending customer and emails a 6-digit code |
| POST | /api/storefront/account/verify | `{email, code}` — verifies the email and starts a customer session |
| POST | /api/storefront/account/resend-verification | `{email}` |
| POST | /api/storefront/account/login | `{email, password}` — sets customer cookies |
| POST | /api/storefront/account/refresh | cookie or `{refresh_token}` — rotates the refresh session |
| POST | /api/storefront/account/logout | revokes the refresh session and clears cookies |
| POST | /api/storefront/account/forgot-password | `{email}` — emails a 6-digit reset code; always returns `{ok:true}` |
| POST | /api/storefront/account/reset-password | `{email, code, password}` — sets a new password and revokes every customer session |
| POST | /api/storefront/account/change-password | `{currentPassword, newPassword}` — re-issues the current session and revokes the others |
| PATCH | /api/storefront/account/email | `{email, password}` — sends a verification code to the pending email |
| POST | /api/storefront/account/email/verify | `{code}` — completes the email change and re-issues the session |
| GET | /api/storefront/account/sessions | active sessions with a `current` flag |
| POST | /api/storefront/account/sessions/revoke-others | revokes every session except the current one |
| DELETE | /api/storefront/account/sessions/:id | revoke one session |
| GET/PATCH | /api/storefront/account | customer profile plus saved addresses and order history |
| GET | /api/storefront/account/orders | authenticated order history |
| GET | /api/storefront/account/orders/:number | authenticated order detail with shipments and returns |
| POST | /api/storefront/account/orders/:number/returns | `{items:[{variantId,quantity,reason}], resolution:refund\|exchange, note?}` |
| GET/POST | /api/storefront/account/addresses | list or create a saved address (max 20) |
| PATCH/DELETE | /api/storefront/account/addresses/:id | update, delete, or set the default address |
| GET | /api/storefront/search?q= | Meilisearch, falls back to SQL |

Checkout decrements stock atomically (`inventory >= quantity` guards), re-prices everything, records customer totals, applies discount usage and gift-card balance, emails the confirmation, and emits webhooks. Card checkout returns `{payment:{url}}` for Stripe hosted checkout; the Stripe webhook marks the order paid.

Customer accounts are store-scoped. Registration must be completed with the emailed six-digit code before login succeeds, and existing guest orders with the same verified email are included in the account's order history. Sessions use the httpOnly `cc_customer_access` (30 minutes) and `cc_customer_refresh` (30 days, rotated on use) cookies. When SMTP is not configured outside production, registration, password reset and email-change responses include the development code for local testing.

Orders can be fulfilled in multiple shipments. Each shipment stores its own line items, carrier, tracking number and tracking URL. The order status becomes `partially_fulfilled` until every ordered quantity has shipped, then `fulfilled`.

Returns are line-item records on an order. A customer can request a refund or exchange only for shipped quantities that have not already been returned. Admin endpoints are `POST /api/admin/orders/:id/returns`, `GET /api/admin/returns`, `POST /api/admin/returns/:id/receive`, `/refund`, `/exchange` and `/reject`. Receiving restocks inventory by default; refunds are capped at the returned item value and the order's remaining refundable balance. The order tracks `refunded_total` and moves to `partially_refunded` or `refunded`.

Shipping is priced from the first active zone matching destination country and region, then the first rate matching the discounted subtotal. Zones and rates are managed through `GET/PUT /api/admin/settings/shipping-zones`; regional tax rates through `GET/PUT /api/admin/settings/tax-regions`. The store-wide tax rate and flat shipping rate remain fallbacks when no zone or region matches.

## License API

| Method | Path | Notes |
| --- | --- | --- |
| POST | /api/license/verify | `{license_key, domain}` → 401 on domain mismatch |
| POST | /api/license/activate | binds a key to a domain/store |
| GET | /api/license/status?license_key=&domain= | revocation heartbeat |
| POST | /api/license/generate | requires `X-License-Admin-Token` |
| POST | /api/license/revoke | requires `X-License-Admin-Token` |

## Webhooks (outgoing)

Topics: `orders/create`, `orders/paid`, `orders/fulfilled`, `orders/refunded`, `orders/cancelled`, `products/create`, `products/update`, `products/delete`, `customers/create`, `customers/update`, `*`.

Headers: `X-CommerceCore-Topic`, `X-CommerceCore-Hmac-SHA256` (base64 HMAC of the raw JSON body), `X-CommerceCore-Delivery`. Failures retry with backoff and are recorded in `WebhookDelivery`.
