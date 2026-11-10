import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import speakeasy from 'speakeasy';
import Stripe from 'stripe';
import { startTestEnvironment } from './harness.js';

let env;
let token;
let refreshToken;
let product;
let variant;
let collection;
let discount;
let orderId;
let buyerOrderNumber;
let customerToken;
let customerEmail;
let customerPassword;

const suffix = Date.now().toString(36);
const buyerEmail = `buyer-${suffix}@example.com`;
const discountCode = `E2E${suffix.toUpperCase()}`;

async function request(
  pathname,
  { method = 'GET', body, useAuth = true, token: overrideToken, headers: extraHeaders = {} } = {},
) {
  const headers = { Accept: 'application/json', ...extraHeaders };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const authToken = overrideToken ?? token;
  if (useAuth && authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await fetch(`${env.baseUrl}${pathname}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // CSV or HTML response
  }
  return { status: response.status, data, text, headers: response.headers };
}

before(
  async () => {
    env = await startTestEnvironment();
    const login = await request('/api/auth/login', {
      method: 'POST',
      useAuth: false,
      body: { email: 'admin@demo.com', password: 'Admin123!' },
    });
    assert.equal(login.status, 200, `login failed: ${JSON.stringify(login.data)}`);
    token = login.data.token;
    refreshToken = login.data.refresh_token;
  },
  { timeout: 180000 },
);

after(async () => {
  await env?.stop();
});

test('health and seeded catalog are available', async () => {
  const health = await request('/health', { useAuth: false });
  assert.equal(health.status, 200);
  assert.equal(health.data.ok, true);

  const products = await request('/api/storefront/products?limit=100', { useAuth: false });
  assert.equal(products.status, 200);
  assert.ok(products.data.products.length >= 12, 'seed should create at least 12 products');
  assert.ok(products.data.products.some((item) => item.handle === 'heavyweight-organic-tee'));

  const collections = await request('/api/storefront/collections', { useAuth: false });
  assert.ok(collections.data.collections.some((item) => item.handle === 'essentials'));

  const analytics = await request('/api/admin/analytics/summary');
  assert.equal(analytics.status, 200);
  assert.ok(analytics.data.revenue > 0, 'seeded paid orders should produce revenue');
  assert.equal(analytics.data.sales_last_30_days.length, 30);
});

test('admin routes reject unauthenticated requests', async () => {
  const response = await request('/api/admin/products', { useAuth: false });
  assert.equal(response.status, 401);
});

test('session, refresh rotation and current user', async () => {
  const me = await request('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, 'admin@demo.com');
  assert.equal(me.data.stores.length, 1);
  assert.equal(me.data.stores[0].name, 'Commerce Core');

  const refreshed = await request('/api/auth/refresh', {
    method: 'POST',
    useAuth: false,
    body: { refresh_token: refreshToken },
  });
  assert.equal(refreshed.status, 200);
  assert.ok(refreshed.data.token);
  assert.notEqual(refreshed.data.refresh_token, refreshToken);

  const replay = await request('/api/auth/refresh', {
    method: 'POST',
    useAuth: false,
    body: { refresh_token: refreshToken },
  });
  assert.equal(replay.status, 401, 'rotated refresh tokens must not be reusable');
  refreshToken = refreshed.data.refresh_token;
});

test('self-serve signup provisions a storefront isolated from other stores', async () => {
  const email = `merchant-${suffix}@example.com`;
  const registered = await request('/api/auth/register', {
    method: 'POST',
    useAuth: false,
    body: {
      email,
      password: 'Merchant123!',
      name: 'Merchant One',
      storeName: `Acme ${suffix}`,
      currency: 'USD',
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const store = registered.data.store;
  assert.ok(store.domain.endsWith('.localhost'), 'new stores get a subdomain under the platform domain');
  assert.equal(store.storefront_url, `http://${store.domain}:3000`);
  assert.equal(store.role, 'owner');
  const merchantToken = registered.data.token;

  const merchantSession = await request('/api/auth/me', { token: merchantToken });
  assert.equal(merchantSession.data.stores.length, 1);
  assert.equal(merchantSession.data.stores[0].id, store.id);
  assert.equal(merchantSession.data.stores[0].storefront_url, store.storefront_url);

  // A brand-new store starts empty, while the original store keeps its catalog.
  const empty = await request('/api/storefront/products', {
    useAuth: false,
    headers: { 'x-store-domain': store.domain },
  });
  assert.equal(empty.status, 200);
  assert.equal(empty.data.count, 0);

  const created = await request('/api/admin/products', {
    method: 'POST',
    token: merchantToken,
    headers: { 'x-store-id': store.id },
    body: {
      title: 'Merchant Mug',
      status: 'active',
      variants: [{ title: 'Default Title', sku: `MER-${suffix}`, price: 18, inventory: 5 }],
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));

  const ownCatalog = await request('/api/storefront/products', {
    useAuth: false,
    headers: { 'x-store-domain': store.domain },
  });
  assert.equal(ownCatalog.data.count, 1);
  assert.equal(ownCatalog.data.products[0].title, 'Merchant Mug');

  const primaryCatalog = await request('/api/storefront/products?limit=100', {
    useAuth: false,
    headers: { 'x-store-domain': 'localhost' },
  });
  assert.ok(primaryCatalog.data.products.length >= 12);
  assert.ok(
    !primaryCatalog.data.products.some((item) => item.title === 'Merchant Mug'),
    'a tenant product must not leak into another storefront',
  );

  const unknown = await request('/api/storefront/products', {
    useAuth: false,
    headers: { 'x-store-domain': `missing-${suffix}.localhost` },
  });
  assert.equal(unknown.status, 404, 'an unknown storefront host must not fall back to the first store');

  const ownerSession = await request('/api/auth/me');
  const primaryStoreId = ownerSession.data.stores[0].id;
  const forbidden = await request('/api/admin/products', {
    token: merchantToken,
    headers: { 'x-store-id': primaryStoreId },
  });
  assert.equal(forbidden.status, 403, 'a merchant cannot manage another store');

  const second = await request('/api/auth/stores', {
    method: 'POST',
    token: merchantToken,
    body: { name: `Second ${suffix}`, currency: 'EUR' },
  });
  assert.equal(second.status, 201, JSON.stringify(second.data));
  assert.equal(second.data.store.currency, 'EUR');
  assert.notEqual(second.data.store.domain, store.domain);
});

test('product CRUD', async () => {
  const created = await request('/api/admin/products', {
    method: 'POST',
    body: {
      title: `E2E Tee ${suffix}`,
      descriptionHtml: '<p>Created by the e2e suite</p>',
      vendor: 'E2E',
      productType: 'Test',
      status: 'active',
      tags: ['e2e'],
      images: [],
      variants: [{ title: 'M', sku: `E2E-${suffix}`, price: 25, inventory: 10 }],
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  product = created.data.product;
  variant = product.variants[0];
  assert.equal(product.title, `E2E Tee ${suffix}`);
  assert.equal(product.price, 25);
  assert.equal(variant.inventory, 10);

  const list = await request(`/api/admin/products?search=${encodeURIComponent(`E2E Tee ${suffix}`)}`);
  assert.equal(list.status, 200);
  assert.equal(list.data.count, 1);

  const detail = await request(`/api/admin/products/${product.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.data.product.handle, product.handle);

  const updated = await request(`/api/admin/products/${product.id}`, {
    method: 'PUT',
    body: {
      title: `E2E Tee Updated ${suffix}`,
      variants: [{ id: variant.id, title: 'M', sku: variant.sku, price: 25, inventory: 10 }],
    },
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  assert.match(updated.data.product.title, /Updated/);
  product = updated.data.product;

  const storefront = await request(`/api/storefront/products/${product.handle}`, { useAuth: false });
  assert.equal(storefront.status, 200);
  assert.equal(storefront.data.product.id, product.id);
});

test('collection CRUD links products', async () => {
  const created = await request('/api/admin/collections', {
    method: 'POST',
    body: { title: `E2E Collection ${suffix}`, productIds: [product.id] },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  collection = created.data.collection;
  assert.equal(collection.products_count, 1);

  const detail = await request(`/api/admin/collections/${collection.id}`);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.data.collection.product_ids, [product.id]);

  const storefront = await request(`/api/storefront/collections/${collection.handle}`, { useAuth: false });
  assert.equal(storefront.status, 200);
  assert.ok(storefront.data.products.some((item) => item.id === product.id));
});

test('customer and discount creation', async () => {
  const customer = await request('/api/admin/customers', {
    method: 'POST',
    body: { email: `crm-${suffix}@example.com`, firstName: 'E2E', lastName: 'Customer' },
  });
  assert.equal(customer.status, 201, JSON.stringify(customer.data));
  assert.equal(customer.data.customer.email, `crm-${suffix}@example.com`);

  const createdDiscount = await request('/api/admin/discounts', {
    method: 'POST',
    body: { code: discountCode, type: 'percentage', value: 10, active: true },
  });
  assert.equal(createdDiscount.status, 201, JSON.stringify(createdDiscount.data));
  discount = createdDiscount.data.discount;
  assert.equal(discount.value, 10);
});

test('cart pricing is computed server-side', async () => {
  const cart = await request('/api/storefront/cart', {
    method: 'POST',
    useAuth: false,
    body: {
      items: [{ variantId: variant.id, quantity: 2 }],
      discountCode,
    },
  });
  assert.equal(cart.status, 200, JSON.stringify(cart.data));
  assert.equal(cart.data.cart.subtotal, 50);
  assert.equal(cart.data.cart.discount_total, 5);
  assert.equal(cart.data.cart.shipping_total, 6.95);
  assert.equal(cart.data.cart.total, 51.95);
  assert.equal(cart.data.cart.item_count, 2);

  const invalid = await request('/api/storefront/discounts/validate', {
    method: 'POST',
    useAuth: false,
    body: { code: 'NOT-A-REAL-CODE' },
  });
  assert.equal(invalid.status, 404);
});

test('checkout creates an order, decrements stock and supports lookup', async () => {
  const checkout = await request('/api/storefront/checkout', {
    method: 'POST',
    useAuth: false,
    body: {
      email: buyerEmail,
      items: [{ variantId: variant.id, quantity: 2 }],
      discountCode,
      paymentMethod: 'manual',
      shippingAddress: {
        first_name: 'E2E',
        last_name: 'Buyer',
        address1: '1 Test Street',
        city: 'Testville',
        region: 'TS',
        postal_code: '12345',
        country: 'United States',
      },
    },
  });
  assert.equal(checkout.status, 201, JSON.stringify(checkout.data));
  const order = checkout.data.order;
  assert.equal(order.email, buyerEmail);
  assert.equal(order.total, 51.95);
  assert.equal(order.financial_status, 'pending');
  assert.equal(order.fulfillment_status, 'unfulfilled');
  assert.equal(order.line_items[0].quantity, 2);
  assert.equal(order.discount_code, discountCode);

  const lookup = await request(
    `/api/storefront/orders/${order.number}?email=${encodeURIComponent(buyerEmail)}`,
    { useAuth: false },
  );
  assert.equal(lookup.status, 200);
  assert.equal(lookup.data.order.number, order.number);

  const wrongEmail = await request(
    `/api/storefront/orders/${order.number}?email=not-${encodeURIComponent(buyerEmail)}`,
    { useAuth: false },
  );
  assert.equal(wrongEmail.status, 404);

  const fresh = await request(`/api/admin/products/${product.id}`);
  assert.equal(fresh.data.product.variants[0].inventory, 8);

  orderId = order.id;
  buyerOrderNumber = order.number;
});

test('customer accounts verify email, save addresses and show order history', async () => {
  const password = 'Customer123!';
  const registered = await request('/api/storefront/account/register', {
    method: 'POST',
    useAuth: false,
    body: {
      email: buyerEmail,
      password,
      firstName: 'E2E',
      lastName: 'Buyer',
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const code = String(registered.data.verification_code || '');
  assert.match(code, /^\d{6}$/, 'local registration should expose the verification code');

  const unverifiedLogin = await request('/api/storefront/account/login', {
    method: 'POST',
    useAuth: false,
    body: { email: buyerEmail, password },
  });
  assert.equal(unverifiedLogin.status, 403);
  assert.equal(unverifiedLogin.data.verification_required, true);

  const wrongCode = code === '000000' ? '111111' : '000000';
  const rejected = await request('/api/storefront/account/verify', {
    method: 'POST',
    useAuth: false,
    body: { email: buyerEmail, code: wrongCode },
  });
  assert.equal(rejected.status, 400);

  const verified = await request('/api/storefront/account/verify', {
    method: 'POST',
    useAuth: false,
    body: { email: buyerEmail, code },
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.data));
  assert.equal(verified.data.customer.email_verified, true);
  customerToken = verified.data.token;
  assert.ok(customerToken);

  const login = await request('/api/storefront/account/login', {
    method: 'POST',
    useAuth: false,
    body: { email: buyerEmail, password },
  });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  customerToken = login.data.token;
  customerEmail = buyerEmail;
  customerPassword = password;
  const customerHeaders = { Authorization: `Bearer ${customerToken}` };

  const account = await request('/api/storefront/account', {
    useAuth: false,
    headers: customerHeaders,
  });
  assert.equal(account.status, 200, JSON.stringify(account.data));
  assert.equal(account.data.customer.email, buyerEmail);
  assert.ok(
    account.data.orders.some((order) => order.number === buyerOrderNumber),
    'a verified guest order should appear in the account order history',
  );

  const firstAddress = await request('/api/storefront/account/addresses', {
    method: 'POST',
    useAuth: false,
    headers: customerHeaders,
    body: {
      label: 'Home',
      firstName: 'E2E',
      lastName: 'Buyer',
      address1: '1 Test Street',
      city: 'Testville',
      region: 'TS',
      postalCode: '12345',
      country: 'United States',
      isDefault: true,
    },
  });
  assert.equal(firstAddress.status, 201, JSON.stringify(firstAddress.data));
  assert.equal(firstAddress.data.address.is_default, true);

  const secondAddress = await request('/api/storefront/account/addresses', {
    method: 'POST',
    useAuth: false,
    headers: customerHeaders,
    body: {
      label: 'Work',
      firstName: 'E2E',
      lastName: 'Buyer',
      address1: '2 Second Street',
      city: 'Testville',
      region: 'TS',
      postalCode: '12345',
      country: 'United States',
      isDefault: true,
    },
  });
  assert.equal(secondAddress.status, 201, JSON.stringify(secondAddress.data));

  let addresses = await request('/api/storefront/account/addresses', {
    useAuth: false,
    headers: customerHeaders,
  });
  assert.equal(addresses.status, 200);
  assert.equal(addresses.data.addresses.length, 2);
  assert.equal(
    addresses.data.addresses.filter((address) => address.is_default).length,
    1,
    'only one address may be the default',
  );
  const first = addresses.data.addresses.find((address) => address.id === firstAddress.data.address.id);
  assert.equal(first.is_default, false);

  const renamed = await request(`/api/storefront/account/addresses/${secondAddress.data.address.id}`, {
    method: 'PATCH',
    useAuth: false,
    headers: customerHeaders,
    body: { label: 'Office' },
  });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.data));
  assert.equal(renamed.data.address.label, 'Office');

  const orderDetail = await request(`/api/storefront/account/orders/${buyerOrderNumber}`, {
    useAuth: false,
    headers: customerHeaders,
  });
  assert.equal(orderDetail.status, 200, JSON.stringify(orderDetail.data));
  assert.equal(orderDetail.data.order.number, buyerOrderNumber);

  const deleted = await request(`/api/storefront/account/addresses/${secondAddress.data.address.id}`, {
    method: 'DELETE',
    useAuth: false,
    headers: customerHeaders,
  });
  assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
  addresses = await request('/api/storefront/account/addresses', {
    useAuth: false,
    headers: customerHeaders,
  });
  assert.equal(addresses.data.addresses.length, 1);
  assert.equal(addresses.data.addresses[0].is_default, true, 'deleting the default promotes another address');

  const rotated = await request('/api/storefront/account/refresh', {
    method: 'POST',
    useAuth: false,
    body: { refresh_token: login.data.refresh_token },
  });
  assert.equal(rotated.status, 200, JSON.stringify(rotated.data));
  const replay = await request('/api/storefront/account/refresh', {
    method: 'POST',
    useAuth: false,
    body: { refresh_token: login.data.refresh_token },
  });
  assert.equal(replay.status, 401, 'customer refresh tokens must rotate');

  const loggedOut = await request('/api/storefront/account/logout', {
    method: 'POST',
    useAuth: false,
    body: { refresh_token: rotated.data.refresh_token },
  });
  assert.equal(loggedOut.status, 200);
});

test('customer password reset, email change and session control', async () => {
  const signIn = async (password) =>
    request('/api/storefront/account/login', {
      method: 'POST',
      useAuth: false,
      body: { email: customerEmail, password },
    });

  const first = await signIn(customerPassword);
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const firstHeaders = { Authorization: `Bearer ${first.data.token}` };
  const sessions = await request('/api/storefront/account/sessions', {
    useAuth: false,
    headers: firstHeaders,
  });
  assert.equal(sessions.status, 200);
  assert.ok(sessions.data.sessions.length >= 1);
  assert.ok(sessions.data.sessions.some((session) => session.current), 'the current session should be identified');

  const second = await signIn(customerPassword);
  assert.equal(second.status, 200);
  const secondHeaders = { Authorization: `Bearer ${second.data.token}` };
  const revoked = await request('/api/storefront/account/sessions/revoke-others', {
    method: 'POST',
    useAuth: false,
    headers: secondHeaders,
  });
  assert.equal(revoked.status, 200);
  assert.ok(revoked.data.revoked >= 1, 'other sessions should be revoked');
  const revokedAccess = await request('/api/storefront/account', {
    useAuth: false,
    headers: firstHeaders,
  });
  assert.equal(revokedAccess.status, 401, 'a revoked session must reject its existing access token');
  const remaining = await request('/api/storefront/account/sessions', {
    useAuth: false,
    headers: secondHeaders,
  });
  assert.equal(remaining.data.sessions.length, 1);
  assert.equal(remaining.data.sessions[0].current, true);

  const changed = await request('/api/storefront/account/change-password', {
    method: 'POST',
    useAuth: false,
    headers: secondHeaders,
    body: { currentPassword: customerPassword, newPassword: 'ChangedPass123!' },
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.equal((await signIn(customerPassword)).status, 401, 'the old password must stop working');
  assert.equal((await signIn('ChangedPass123!')).status, 200);

  const forgot = await request('/api/storefront/account/forgot-password', {
    method: 'POST',
    useAuth: false,
    body: { email: customerEmail },
  });
  assert.equal(forgot.status, 200, JSON.stringify(forgot.data));
  const resetCode = String(forgot.data.reset_code || '');
  assert.match(resetCode, /^\d{6}$/, 'local password resets should expose the code');

  const reset = await request('/api/storefront/account/reset-password', {
    method: 'POST',
    useAuth: false,
    body: { email: customerEmail, code: resetCode, password: 'ResetPass123!' },
  });
  assert.equal(reset.status, 200, JSON.stringify(reset.data));
  assert.equal((await signIn('ChangedPass123!')).status, 401);

  const afterReset = await signIn('ResetPass123!');
  assert.equal(afterReset.status, 200);
  const resetHeaders = { Authorization: `Bearer ${afterReset.data.token}` };

  const newEmail = `buyer-moved-${suffix}@example.com`;
  const emailChange = await request('/api/storefront/account/email', {
    method: 'PATCH',
    useAuth: false,
    headers: resetHeaders,
    body: { email: newEmail, password: 'ResetPass123!' },
  });
  assert.equal(emailChange.status, 200, JSON.stringify(emailChange.data));
  const emailCode = String(emailChange.data.verification_code || '');
  assert.match(emailCode, /^\d{6}$/, 'local email changes should expose the code');

  const emailVerified = await request('/api/storefront/account/email/verify', {
    method: 'POST',
    useAuth: false,
    headers: resetHeaders,
    body: { code: emailCode },
  });
  assert.equal(emailVerified.status, 200, JSON.stringify(emailVerified.data));
  assert.equal(emailVerified.data.customer.email, newEmail);

  customerEmail = newEmail;
  customerPassword = 'ResetPass123!';
  customerToken = emailVerified.data.token;
  const account = await request('/api/storefront/account', {
    useAuth: false,
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  assert.equal(account.status, 200);
  assert.ok(
    account.data.orders.some((order) => order.number === buyerOrderNumber),
    'changing email must not lose the existing order history',
  );
});

test('admin order actions mark paid, fulfil and refund', async () => {
  assert.ok(orderId, 'checkout should have produced an order');

  const paid = await request(`/api/admin/orders/${orderId}/mark-paid`, { method: 'POST' });
  assert.equal(paid.status, 200);
  assert.equal(paid.data.order.financial_status, 'paid');

  const detail = await request(`/api/admin/orders/${orderId}`);
  assert.equal(detail.status, 200);
  const variantId = detail.data.order.line_items[0].variantId;

  const partial = await request(`/api/admin/orders/${orderId}/fulfill`, {
    method: 'POST',
    body: {
      items: [{ variantId, quantity: 1 }],
      trackingNumber: 'E2E-TRACK-1',
      trackingUrl: 'https://example.com/track/1',
      carrier: 'UPS',
      notifyCustomer: false,
    },
  });
  assert.equal(partial.status, 200, JSON.stringify(partial.data));
  assert.equal(partial.data.order.fulfillment_status, 'partially_fulfilled');
  assert.equal(partial.data.order.fulfillments.length, 1);
  assert.equal(partial.data.fulfillment.line_items[0].quantity, 1);
  assert.equal(partial.data.fulfillment.tracking_url, 'https://example.com/track/1');

  const fulfilled = await request(`/api/admin/orders/${orderId}/fulfill`, {
    method: 'POST',
    body: {
      items: [{ variantId, quantity: 1 }],
      trackingNumber: 'E2E-TRACK-2',
      notifyCustomer: false,
    },
  });
  assert.equal(fulfilled.status, 200);
  assert.equal(fulfilled.data.order.fulfillment_status, 'fulfilled');
  assert.equal(fulfilled.data.order.fulfillments.length, 2);
  assert.equal(fulfilled.data.order.tracking_number, 'E2E-TRACK-2');

  const overFulfill = await request(`/api/admin/orders/${orderId}/fulfill`, {
    method: 'POST',
    body: { items: [{ variantId, quantity: 1 }], notifyCustomer: false },
  });
  assert.equal(overFulfill.status, 400);

  const refunded = await request(`/api/admin/orders/${orderId}/refund`, {
    method: 'POST',
    body: { notifyCustomer: false },
  });
  assert.equal(refunded.status, 200);
  assert.equal(refunded.data.order.financial_status, 'refunded');

  const usage = await request('/api/admin/discounts');
  const used = usage.data.discounts.find((item) => item.code === discountCode);
  assert.equal(used.usage_count, 1);
});

test('line-item returns restock, refund and exchange', async () => {
  const checkout = await request('/api/storefront/checkout', {
    method: 'POST',
    useAuth: false,
    body: {
      email: customerEmail,
      items: [{ variantId: variant.id, quantity: 2 }],
      paymentMethod: 'manual',
      shippingAddress: {
        first_name: 'E2E',
        last_name: 'Buyer',
        address1: '1 Test Street',
        city: 'Testville',
        region: 'TS',
        postal_code: '12345',
        country: 'United States',
      },
    },
  });
  assert.equal(checkout.status, 201, JSON.stringify(checkout.data));
  const returnOrder = checkout.data.order;

  await request(`/api/admin/orders/${returnOrder.id}/mark-paid`, { method: 'POST' });
  const fulfilled = await request(`/api/admin/orders/${returnOrder.id}/fulfill`, {
    method: 'POST',
    body: { notifyCustomer: false },
  });
  assert.equal(fulfilled.status, 200, JSON.stringify(fulfilled.data));
  assert.equal(fulfilled.data.order.fulfillment_status, 'fulfilled');

  const customerLogin = await request('/api/storefront/account/login', {
    method: 'POST',
    useAuth: false,
    body: { email: customerEmail, password: customerPassword },
  });
  assert.equal(customerLogin.status, 200, JSON.stringify(customerLogin.data));
  const customerHeaders = { Authorization: `Bearer ${customerLogin.data.token}` };

  const requested = await request(`/api/storefront/account/orders/${returnOrder.number}/returns`, {
    method: 'POST',
    useAuth: false,
    headers: customerHeaders,
    body: {
      items: [{ variantId: variant.id, quantity: 1, reason: 'damaged' }],
      resolution: 'refund',
      note: 'Arrived damaged',
    },
  });
  assert.equal(requested.status, 201, JSON.stringify(requested.data));
  assert.equal(requested.data.return.status, 'requested');
  assert.equal(requested.data.return.line_items[0].reason, 'damaged');
  const refundReturnId = requested.data.return.id;

  const adminReturns = await request('/api/admin/returns');
  assert.equal(adminReturns.status, 200);
  assert.ok(adminReturns.data.returns.some((item) => item.id === refundReturnId));

  const received = await request(`/api/admin/returns/${refundReturnId}/receive`, {
    method: 'POST',
    body: { restock: true },
  });
  assert.equal(received.status, 200, JSON.stringify(received.data));
  assert.equal(received.data.return.status, 'received');

  const refunded = await request(`/api/admin/returns/${refundReturnId}/refund`, {
    method: 'POST',
    body: { notifyCustomer: false },
  });
  assert.equal(refunded.status, 200, JSON.stringify(refunded.data));
  assert.equal(refunded.data.return.status, 'refunded');
  assert.equal(refunded.data.order.financial_status, 'partially_refunded');
  assert.equal(refunded.data.order.refunded_total, 25);

  const afterRefund = await request(`/api/admin/orders/${returnOrder.id}`);
  assert.equal(afterRefund.data.order.refunded_total, 25);
  assert.equal(afterRefund.data.order.returnable_items[0].quantity, 1);

  const exchangeRequested = await request(`/api/storefront/account/orders/${returnOrder.number}/returns`, {
    method: 'POST',
    useAuth: false,
    headers: customerHeaders,
    body: {
      items: [{ variantId: variant.id, quantity: 1, reason: 'wrong_size' }],
      resolution: 'exchange',
      note: 'Please send the next size up',
    },
  });
  assert.equal(exchangeRequested.status, 201, JSON.stringify(exchangeRequested.data));
  const exchangeId = exchangeRequested.data.return.id;

  await request(`/api/admin/returns/${exchangeId}/receive`, {
    method: 'POST',
    body: { restock: true },
  });
  const exchanged = await request(`/api/admin/returns/${exchangeId}/exchange`, {
    method: 'POST',
    body: {
      carrier: 'UPS',
      trackingNumber: 'EXCHANGE-1',
      trackingUrl: 'https://example.com/track/exchange-1',
    },
  });
  assert.equal(exchanged.status, 200, JSON.stringify(exchanged.data));
  assert.equal(exchanged.data.return.status, 'exchanged');
  assert.equal(exchanged.data.return.exchange_tracking_number, 'EXCHANGE-1');

  const productAfterReturns = await request(`/api/admin/products/${product.id}`);
  assert.equal(productAfterReturns.data.product.variants[0].inventory, 8);

  const accountOrder = await request(`/api/storefront/account/orders/${returnOrder.number}`, {
    useAuth: false,
    headers: customerHeaders,
  });
  assert.equal(accountOrder.status, 200);
  assert.equal(accountOrder.data.order.returns.length, 2);
  assert.equal(accountOrder.data.order.refunded_total, 25);
});

test('gift card covers the order and marks it paid', async () => {
  const cart = await request('/api/storefront/cart', {
    method: 'POST',
    useAuth: false,
    body: { items: [{ variantId: variant.id, quantity: 1 }], giftCardCode: 'GC-DEMO-50' },
  });
  assert.equal(cart.status, 200, JSON.stringify(cart.data));
  assert.equal(cart.data.cart.gift_card_applied, 31.95);
  assert.equal(cart.data.cart.total, 0);

  const checkout = await request('/api/storefront/checkout', {
    method: 'POST',
    useAuth: false,
    body: {
      email: `gift-${suffix}@example.com`,
      items: [{ variantId: variant.id, quantity: 1 }],
      giftCardCode: 'GC-DEMO-50',
      paymentMethod: 'manual',
    },
  });
  assert.equal(checkout.status, 201, JSON.stringify(checkout.data));
  assert.equal(checkout.data.order.total, 0);
  assert.equal(checkout.data.order.financial_status, 'paid');

  const cards = await request('/api/admin/gift-cards');
  const card = cards.data.gift_cards.find((item) => item.code === 'GC-DEMO-50');
  assert.equal(card.balance, 18.05);
});

test('CSV import and export round-trip', async () => {
  const csv = [
    'Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Variant SKU,Variant Inventory Qty,Variant Price',
    `csv-${suffix},CSV ${suffix},<p>csv</p>,E2E,Test,e2e,TRUE,CSV-${suffix},4,12.50`,
  ].join('\n');

  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'products.csv');
  const imported = await fetch(`${env.baseUrl}/api/admin/products/import-csv`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  assert.equal(imported.status, 200);
  const importData = await imported.json();
  assert.equal(importData.imported, 1);

  const exported = await fetch(`${env.baseUrl}/api/admin/products/export.csv`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get('content-type') || '', /text\/csv/);
  const text = await exported.text();
  assert.match(text, /^Handle,Title/);
  assert.match(text, new RegExp(`CSV-${suffix}`));
});

test('Shopify Admin API product and customer import', async () => {
  const imported = await request('/api/admin/products/import-shopify', {
    method: 'POST',
    body: {
      products: [
        {
          title: `Shopify Import ${suffix}`,
          handle: `shopify-import-${suffix}`,
          body_html: '<p>Imported from the Shopify Admin API</p>',
          vendor: 'Shopify Vendor',
          product_type: 'Imported',
          tags: 'shopify, imported',
          status: 'active',
          images: [{ src: 'https://cdn.example.com/shopify.jpg', alt: 'Imported' }],
          variants: [
            {
              title: 'Default Title',
              sku: `SHOP-${suffix}`,
              price: '19.95',
              inventory_quantity: 7,
              option1: 'Default',
            },
          ],
        },
      ],
    },
  });
  assert.equal(imported.status, 200, JSON.stringify(imported.data));
  assert.equal(imported.data.imported, 1);

  const product = imported.data.products[0];
  assert.equal(product.title, `Shopify Import ${suffix}`);
  assert.equal(product.handle, `shopify-import-${suffix}`);
  assert.equal(product.description_html, '<p>Imported from the Shopify Admin API</p>');
  assert.equal(product.product_type, 'Imported');
  assert.deepEqual(product.tags, ['shopify', 'imported']);
  assert.equal(product.variants[0].price, 19.95);
  assert.equal(product.variants[0].inventory, 7);
  assert.equal(product.variants[0].sku, `SHOP-${suffix}`);

  const storefront = await request(`/api/storefront/products/${product.handle}`, { useAuth: false });
  assert.equal(storefront.status, 200);
  assert.equal(storefront.data.product.id, product.id);

  // The Shopify Admin importer sends customers through the admin customer endpoint.
  const customer = await request('/api/admin/customers', {
    method: 'POST',
    body: {
      email: `shopify-customer-${suffix}@example.com`,
      firstName: 'Ada',
      lastName: 'Shopify',
      phone: '+15550123456',
    },
  });
  assert.equal(customer.status, 201, JSON.stringify(customer.data));
  assert.equal(customer.data.customer.email, `shopify-customer-${suffix}@example.com`);
  assert.equal(customer.data.customer.name, 'Ada Shopify');
  assert.equal(customer.data.customer.phone, '+15550123456');

  const search = await request(`/api/admin/customers?search=${encodeURIComponent(`shopify-customer-${suffix}@example.com`)}`);
  assert.equal(search.status, 200);
  assert.equal(search.data.count, 1);
});

test('Shopify importer CLI imports products, customers and orders from a mock Admin API', async () => {
  const sku = `CLI-${suffix}`;
  const email = `cli-customer-${suffix}@example.com`;
  let products = [
    {
      id: 7001,
      title: `CLI Imported ${suffix}`,
      handle: `cli-import-${suffix}`,
      body_html: '<p>Imported by the CLI</p>',
      vendor: 'CLI Vendor',
      product_type: 'CLI',
      tags: 'cli, importer',
      status: 'active',
      images: [{ src: 'https://cdn.example.com/cli.jpg' }],
      variants: [
        {
          id: 1,
          title: 'Default Title',
          sku,
          price: '24.00',
          inventory_quantity: 5,
          option1: 'Default',
        },
      ],
    },
  ];
  let customers = [
    { id: 7002, email, first_name: 'Grace', last_name: 'CLI', phone: '+15550001111' },
  ];
  let orders = [
    {
      id: 7003,
      name: '#3001',
      email,
      financial_status: 'paid',
      line_items: [{ sku, quantity: 2 }],
      shipping_address: {
        first_name: 'Grace',
        last_name: 'CLI',
        address1: '1 CLI Way',
        city: 'Testville',
        province: 'TS',
        zip: '12345',
        country: 'United States',
      },
    },
  ];

  const requests = [];
  const mock = http.createServer((req, res) => {
    requests.push({ url: req.url, token: req.headers['x-shopify-access-token'] });
    const resource = new URL(req.url, 'http://127.0.0.1').pathname.split('/').pop().replace('.json', '');
    const payload = { products, customers, orders }[resource];
    if (!payload) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ [resource]: payload }));
  });

  const mockPort = await new Promise((resolve, reject) => {
    mock.once('error', reject);
    mock.listen(0, '127.0.0.1', () => resolve(mock.address().port));
  });

  const scriptPath = fileURLToPath(new URL('../../scripts/shopify-import.js', import.meta.url));
  const runImporter = () =>
    new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [scriptPath, '--shopify-api', `http://127.0.0.1:${mockPort}`, '--token', 'shpat_e2e', '--api', env.baseUrl],
        { env: { ...process.env, CC_EMAIL: 'admin@demo.com', CC_PASSWORD: 'Admin123!' } },
      );
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Shopify importer timed out.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
      }, 60000);

      child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    });

  let first;
  let second;
  try {
    first = await runImporter();
    assert.equal(first.code, 0, `importer failed.\nstdout:\n${first.stdout}\nstderr:\n${first.stderr}`);
    assert.match(first.stdout, /imported products 1-1 \(1\)/);
    assert.match(first.stdout, /imported\/updated 1 customers/);
    assert.match(first.stdout, /imported 1\/1 orders/);
    assert.match(first.stdout, /Done\. Check the admin/);

    const firstCustomer = await request(`/api/admin/customers?search=${encodeURIComponent(email)}`);
    assert.equal(firstCustomer.data.count, 1);
    assert.equal(firstCustomer.data.customers[0].name, 'Grace CLI');

    // Re-run with an updated customer and no new products/orders. The customer
    // must be updated in place instead of being rejected by the unique email.
    products = [];
    orders = [];
    customers = [{ ...customers[0], first_name: 'Grace', last_name: 'Updated', phone: '+15550002222' }];
    requests.length = 0;
    second = await runImporter();
  } finally {
    await new Promise((resolve) => mock.close(resolve));
  }

  assert.equal(second.code, 0, `importer rerun failed.\nstdout:\n${second.stdout}\nstderr:\n${second.stderr}`);
  assert.match(second.stdout, /imported\/updated 1 customers \(0 created, 1 updated\)/);

  for (const resource of ['products', 'customers', 'orders']) {
    assert.ok(
      requests.some((req) => req.url.includes(`/admin/api/2024-01/${resource}.json`) && req.token === 'shpat_e2e'),
      `expected a Shopify ${resource} request with the access token`,
    );
  }

  const productSearch = await request(`/api/admin/products?search=${encodeURIComponent(sku)}`);
  assert.equal(productSearch.data.count, 1);
  const importedProduct = productSearch.data.products[0];
  assert.equal(importedProduct.variants[0].sku, sku);
  assert.equal(importedProduct.variants[0].inventory, 3, 'the imported order should decrement inventory by 2');

  const customerSearch = await request(`/api/admin/customers?search=${encodeURIComponent(email)}`);
  assert.equal(customerSearch.data.count, 1);

  const orderSearch = await request(`/api/admin/orders?search=${encodeURIComponent(email)}`);
  assert.equal(orderSearch.data.count, 1);
  const importedOrder = orderSearch.data.orders[0];
  assert.equal(importedOrder.financial_status, 'paid');
  assert.equal(importedOrder.line_items[0].sku, sku);
  assert.equal(importedOrder.line_items[0].quantity, 2);
  assert.match(importedOrder.notes, /Imported from Shopify #3001/);

  // The second import updated the existing customer rather than creating a duplicate.
  const updatedCustomer = await request(`/api/admin/customers?search=${encodeURIComponent(email)}`);
  assert.equal(updatedCustomer.data.count, 1);
  assert.equal(updatedCustomer.data.customers[0].name, 'Grace Updated');
  assert.equal(updatedCustomer.data.customers[0].phone, '+15550002222');

  const ordersAfterRerun = await request(`/api/admin/orders?search=${encodeURIComponent(email)}`);
  assert.equal(ordersAfterRerun.data.count, 1);
  assert.equal(ordersAfterRerun.data.orders[0].id, importedOrder.id);
});

test('Shopify importer follows pagination Link headers', async () => {
  const handles = [`paged-one-${suffix}`, `paged-two-${suffix}`];
  const seen = [];
  const mock = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    seen.push(`${url.pathname}${url.search}`);
    const send = (payload, headers = {}) => {
      res.writeHead(200, { 'Content-Type': 'application/json', ...headers });
      res.end(JSON.stringify(payload));
    };

    if (url.pathname.endsWith('/products.json')) {
      const secondPage = url.searchParams.get('page_info') === 'page-2';
      const product = secondPage
        ? {
            id: 9002,
            title: `Paged Two ${suffix}`,
            handle: handles[1],
            status: 'active',
            variants: [
              { title: 'Default Title', sku: `PAGED-2-${suffix}`, price: '22.00', inventory_quantity: 3 },
            ],
          }
        : {
            id: 9001,
            title: `Paged One ${suffix}`,
            handle: handles[0],
            status: 'active',
            variants: [
              { title: 'Default Title', sku: `PAGED-1-${suffix}`, price: '11.00', inventory_quantity: 4 },
            ],
          };
      const headers = secondPage
        ? {}
        : {
            Link: `<http://127.0.0.1:${mock.address().port}/admin/api/2024-01/products.json?limit=250&page_info=page-2>; rel="next"`,
          };
      return send({ products: [product] }, headers);
    }
    if (url.pathname.endsWith('/customers.json')) return send({ customers: [] });
    if (url.pathname.endsWith('/orders.json')) return send({ orders: [] });
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'not found' }));
  });

  const port = await new Promise((resolve, reject) => {
    mock.once('error', reject);
    mock.listen(0, '127.0.0.1', () => resolve(mock.address().port));
  });

  const scriptPath = fileURLToPath(new URL('../../scripts/shopify-import.js', import.meta.url));
  let result;
  try {
    result = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          scriptPath,
          '--shopify-api',
          `http://127.0.0.1:${port}`,
          '--token',
          'shpat_pages',
          '--api',
          env.baseUrl,
        ],
        { env: { ...process.env, CC_EMAIL: 'admin@demo.com', CC_PASSWORD: 'Admin123!' } },
      );
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Paginated importer timed out.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
      }, 60000);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    });
  } finally {
    await new Promise((resolve) => mock.close(resolve));
  }

  assert.equal(result.code, 0, `importer failed.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(result.stdout, /fetched 1 products/);
  assert.match(result.stdout, /fetched 2 products/);
  assert.match(result.stdout, /imported products 1-2 \(2\)/);
  assert.ok(
    seen.some((entry) => entry.includes('page_info=page-2')),
    'the importer should request the Link header next page',
  );

  for (const handle of handles) {
    const product = await request(`/api/storefront/products/${handle}`, { useAuth: false });
    assert.equal(product.status, 200, JSON.stringify(product.data));
    assert.equal(product.data.product.handle, handle);
  }
});

test('Stripe webhook verifies signatures and marks an order paid', async () => {
  const created = await request('/api/admin/orders', {
    method: 'POST',
    body: {
      email: `stripe-${suffix}@example.com`,
      items: [{ variantId: variant.id, quantity: 1 }],
      paymentMethod: 'manual',
      markPaid: false,
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const stripeOrder = created.data.order;
  assert.equal(stripeOrder.financial_status, 'pending');

  const payload = JSON.stringify({
    id: `evt_e2e_${suffix}`,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_test_${suffix}`,
        object: 'checkout.session',
        payment_status: 'paid',
        payment_intent: `pi_e2e_${suffix}`,
        metadata: { orderId: stripeOrder.id },
      },
    },
  });

  const rejected = await fetch(`${env.baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 't=1,v1=deadbeef' },
    body: payload,
  });
  assert.equal(rejected.status, 400, 'an invalid Stripe signature must be rejected');

  const stillPending = await request(`/api/admin/orders/${stripeOrder.id}`);
  assert.equal(stillPending.data.order.financial_status, 'pending');

  const stripe = new Stripe('sk_test_e2e');
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_e2e' });
  const webhook = await fetch(`${env.baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
    body: payload,
  });
  assert.equal(webhook.status, 200);
  assert.deepEqual(await webhook.json(), { received: true });

  const paid = await request(`/api/admin/orders/${stripeOrder.id}`);
  assert.equal(paid.status, 200);
  assert.equal(paid.data.order.financial_status, 'paid');
  assert.ok(paid.data.order.paid_at, 'paid order should record paid_at');
  const paidAt = paid.data.order.paid_at;

  await new Promise((resolve) => setTimeout(resolve, 20));
  const duplicate = await fetch(`${env.baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
    body: payload,
  });
  assert.equal(duplicate.status, 200);
  assert.deepEqual(await duplicate.json(), { received: true });

  const afterDuplicate = await request(`/api/admin/orders/${stripeOrder.id}`);
  assert.equal(afterDuplicate.data.order.financial_status, 'paid');
  assert.equal(afterDuplicate.data.order.paid_at, paidAt, 'duplicate delivery must not capture payment again');
});

test('Stripe payment_intent webhook marks paid and duplicate delivery is idempotent', async () => {
  const created = await request('/api/admin/orders', {
    method: 'POST',
    body: {
      email: `stripe-intent-${suffix}@example.com`,
      items: [{ variantId: variant.id, quantity: 1 }],
      paymentMethod: 'manual',
      markPaid: false,
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const intentOrder = created.data.order;
  assert.equal(intentOrder.financial_status, 'pending');

  const payload = JSON.stringify({
    id: `evt_intent_${suffix}`,
    object: 'event',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: `pi_direct_${suffix}`,
        object: 'payment_intent',
        metadata: { orderId: intentOrder.id },
      },
    },
  });
  const stripe = new Stripe('sk_test_e2e');
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_e2e' });
  const deliver = () =>
    fetch(`${env.baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
      body: payload,
    });

  const first = await deliver();
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { received: true });

  const paid = await request(`/api/admin/orders/${intentOrder.id}`);
  assert.equal(paid.data.order.financial_status, 'paid');
  assert.ok(paid.data.order.paid_at);
  const paidAt = paid.data.order.paid_at;

  await new Promise((resolve) => setTimeout(resolve, 20));
  const duplicate = await deliver();
  assert.equal(duplicate.status, 200);

  const afterDuplicate = await request(`/api/admin/orders/${intentOrder.id}`);
  assert.equal(afterDuplicate.data.order.financial_status, 'paid');
  assert.equal(afterDuplicate.data.order.paid_at, paidAt, 'a duplicate webhook must not capture payment again');
});

test('Stripe checkout async payment and unhandled events are handled safely', async () => {
  const createPending = (label) =>
    request('/api/admin/orders', {
      method: 'POST',
      body: {
        email: `stripe-${label}-${suffix}@example.com`,
        items: [{ variantId: variant.id, quantity: 1 }],
        paymentMethod: 'manual',
        markPaid: false,
      },
    });

  const asyncOrderResponse = await createPending('async');
  assert.equal(asyncOrderResponse.status, 201, JSON.stringify(asyncOrderResponse.data));
  const asyncOrder = asyncOrderResponse.data.order;
  assert.equal(asyncOrder.financial_status, 'pending');

  const stripe = new Stripe('sk_test_e2e');
  const send = (payload) => {
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_e2e' });
    return fetch(`${env.baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
      body: payload,
    });
  };

  const asyncPayload = JSON.stringify({
    id: `evt_async_${suffix}`,
    object: 'event',
    type: 'checkout.session.async_payment_succeeded',
    data: {
      object: {
        id: `cs_async_${suffix}`,
        object: 'checkout.session',
        payment_status: 'paid',
        payment_intent: `pi_async_${suffix}`,
        metadata: { orderId: asyncOrder.id },
      },
    },
  });
  const asyncWebhook = await send(asyncPayload);
  assert.equal(asyncWebhook.status, 200);
  assert.deepEqual(await asyncWebhook.json(), { received: true });

  const paidAsyncOrder = await request(`/api/admin/orders/${asyncOrder.id}`);
  assert.equal(paidAsyncOrder.data.order.financial_status, 'paid');
  assert.ok(paidAsyncOrder.data.order.paid_at);

  const ignoredOrderResponse = await createPending('ignored');
  assert.equal(ignoredOrderResponse.status, 201, JSON.stringify(ignoredOrderResponse.data));
  const ignoredOrder = ignoredOrderResponse.data.order;

  const ignoredPayload = JSON.stringify({
    id: `evt_ignored_${suffix}`,
    object: 'event',
    type: 'charge.refunded',
    data: { object: { id: `ch_${suffix}`, object: 'charge' } },
  });
  const ignoredWebhook = await send(ignoredPayload);
  assert.equal(ignoredWebhook.status, 200);
  assert.deepEqual(await ignoredWebhook.json(), { received: true });

  const unchanged = await request(`/api/admin/orders/${ignoredOrder.id}`);
  assert.equal(unchanged.data.order.financial_status, 'pending');
  assert.equal(unchanged.data.order.paid_at, null);
});

test('duplicate Stripe event IDs are ignored before payment is captured', async () => {
  const created = await request('/api/admin/orders', {
    method: 'POST',
    body: {
      email: `dedupe-${suffix}@example.com`,
      items: [{ variantId: variant.id, quantity: 1 }],
      paymentMethod: 'manual',
      markPaid: false,
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const order = created.data.order;
  assert.equal(order.financial_status, 'pending');

  const stripe = new Stripe('sk_test_e2e');
  const eventId = `evt_once_${suffix}`;
  const session = { id: `cs_once_${suffix}`, object: 'checkout.session', metadata: { orderId: order.id } };
  const send = (event) => {
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_e2e' });
    return fetch(`${env.baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
      body: payload,
    });
  };

  // The first delivery is recorded before the order is paid.
  const first = await send({
    id: eventId,
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: { ...session, payment_status: 'unpaid' } },
  });
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { received: true });

  const stillPending = await request(`/api/admin/orders/${order.id}`);
  assert.equal(stillPending.data.order.financial_status, 'pending');

  // A replay of that event id cannot capture payment, even though the payload
  // now reports a successful payment.
  const replay = await send({
    id: eventId,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: { ...session, payment_status: 'paid', payment_intent: `pi_once_${suffix}` },
    },
  });
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { received: true });

  const afterReplay = await request(`/api/admin/orders/${order.id}`);
  assert.equal(afterReplay.data.order.financial_status, 'pending');
  assert.equal(afterReplay.data.order.paid_at, null);

  // A genuinely new event id is still processed normally.
  const fresh = await send({
    id: `evt_once_pay_${suffix}`,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: { ...session, payment_status: 'paid', payment_intent: `pi_once_${suffix}` },
    },
  });
  assert.equal(fresh.status, 200);

  const paid = await request(`/api/admin/orders/${order.id}`);
  assert.equal(paid.data.order.financial_status, 'paid');
  assert.ok(paid.data.order.paid_at);
});

test('two-factor login requires and accepts a TOTP code', async () => {
  const setup = await request('/api/auth/2fa/setup', { method: 'POST' });
  assert.equal(setup.status, 200, JSON.stringify(setup.data));
  assert.ok(setup.data.secret);

  const code = speakeasy.totp({ secret: setup.data.secret, encoding: 'base32' });
  const enabled = await request('/api/auth/2fa/enable', { method: 'POST', body: { code } });
  assert.equal(enabled.status, 200, JSON.stringify(enabled.data));
  assert.equal(enabled.data.twoFAEnabled, true);

  const passwordOnly = await request('/api/auth/login', {
    method: 'POST',
    useAuth: false,
    body: { email: 'admin@demo.com', password: 'Admin123!' },
  });
  assert.equal(passwordOnly.status, 401);
  assert.equal(passwordOnly.data.twoFactorRequired, true);

  const wrongCode = code === '000000' ? '111111' : '000000';
  const rejected = await request('/api/auth/login', {
    method: 'POST',
    useAuth: false,
    body: { email: 'admin@demo.com', password: 'Admin123!', totp: wrongCode },
  });
  assert.equal(rejected.status, 401);

  const signedIn = await request('/api/auth/login', {
    method: 'POST',
    useAuth: false,
    body: { email: 'admin@demo.com', password: 'Admin123!', totp: code },
  });
  assert.equal(signedIn.status, 200, JSON.stringify(signedIn.data));
  assert.ok(signedIn.data.token);

  const disabled = await request('/api/auth/2fa/disable', {
    method: 'POST',
    body: { password: 'Admin123!' },
  });
  assert.equal(disabled.status, 200);
  assert.equal(disabled.data.twoFAEnabled, false);

  const passwordOnlyAgain = await request('/api/auth/login', {
    method: 'POST',
    useAuth: false,
    body: { email: 'admin@demo.com', password: 'Admin123!' },
  });
  assert.equal(passwordOnlyAgain.status, 200);
});

test('shipping zones and regional tax rates price by destination', async () => {
  const zoneProduct = await request('/api/admin/products', {
    method: 'POST',
    body: {
      title: `Zone Product ${suffix}`,
      status: 'active',
      variants: [{ title: 'Default Title', sku: `ZONE-${suffix}`, price: 25, inventory: 50 }],
    },
  });
  assert.equal(zoneProduct.status, 201, JSON.stringify(zoneProduct.data));
  const zoneVariant = zoneProduct.data.product.variants[0];

  const zones = await request('/api/admin/settings/shipping-zones', {
    method: 'PUT',
    body: {
      zones: [
        {
          name: 'United States',
          countries: ['United States'],
          regions: [],
          position: 0,
          active: true,
          rates: [{ name: 'Standard', rate: 12, position: 0, active: true }],
        },
      ],
    },
  });
  assert.equal(zones.status, 200, JSON.stringify(zones.data));
  assert.equal(zones.data.zones[0].rates[0].rate, 12);

  const taxRegions = await request('/api/admin/settings/tax-regions', {
    method: 'PUT',
    body: {
      regions: [
        { name: 'United States', country: 'United States', rate: 8.25, position: 0, active: true },
        { name: 'Texas', country: 'United States', region: 'TS', rate: 10, position: 1, active: true },
      ],
    },
  });
  assert.equal(taxRegions.status, 200, JSON.stringify(taxRegions.data));
  assert.equal(taxRegions.data.regions.length, 2);

  const cart = await request('/api/storefront/cart', {
    method: 'POST',
    useAuth: false,
    body: {
      items: [{ variantId: zoneVariant.id, quantity: 2 }],
      shippingAddress: { country: 'United States', region: 'TS', postal_code: '12345' },
    },
  });
  assert.equal(cart.status, 200, JSON.stringify(cart.data));
  assert.equal(cart.data.cart.shipping_total, 12);
  assert.equal(cart.data.cart.tax_total, 5);
  assert.equal(cart.data.cart.total, 67);

  const checkout = await request('/api/storefront/checkout', {
    method: 'POST',
    useAuth: false,
    body: {
      email: `zones-${suffix}@example.com`,
      items: [{ variantId: zoneVariant.id, quantity: 2 }],
      paymentMethod: 'manual',
      shippingAddress: {
        first_name: 'Zone',
        last_name: 'Buyer',
        address1: '1 Zone Street',
        city: 'Austin',
        region: 'TS',
        postal_code: '78701',
        country: 'United States',
      },
    },
  });
  assert.equal(checkout.status, 201, JSON.stringify(checkout.data));
  assert.equal(checkout.data.order.shipping_total, 12);
  assert.equal(checkout.data.order.tax_total, 5);
  assert.equal(checkout.data.order.total, 67);

  const fallback = await request('/api/storefront/cart', {
    method: 'POST',
    useAuth: false,
    body: {
      items: [{ variantId: zoneVariant.id, quantity: 1 }],
      shippingAddress: { country: 'Canada', region: 'Ontario', postal_code: 'M5V 2T6' },
    },
  });
  assert.equal(fallback.status, 200, JSON.stringify(fallback.data));
  assert.equal(fallback.data.cart.shipping_total, 6.95);
  assert.equal(fallback.data.cart.tax_total, 0);
});

test('deleting a product removes it from the catalog', async () => {
  const deleted = await request(`/api/admin/products/${product.id}`, { method: 'DELETE' });
  assert.equal(deleted.status, 200);

  const gone = await request(`/api/admin/products/${product.id}`);
  assert.equal(gone.status, 404);

  const products = await request('/api/admin/products?limit=250');
  assert.ok(!products.data.products.some((item) => item.id === product.id));
});
