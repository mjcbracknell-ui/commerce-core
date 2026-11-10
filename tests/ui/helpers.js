import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const environmentPath = path.join(rootDir, 'backend', '.tmp', 'ui-test-env.json');

let adminToken = null;

export function getUiInfo() {
  return JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
}

export async function apiRequest(
  pathname,
  { method = 'GET', body, token, headers: extraHeaders = {} } = {},
) {
  const { apiUrl } = getUiInfo();
  const headers = { Accept: 'application/json', ...extraHeaders };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${apiUrl}${pathname}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Keep non-JSON responses as text for the error message.
  }
  if (!response.ok) {
    throw new Error(
      `${method} ${pathname} failed (${response.status}): ${data?.error || data || response.statusText}`,
    );
  }
  return data;
}

export async function registerCustomer(prefix = 'ui') {
  const email = `ui-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'Customer123!';
  const registration = await apiRequest('/api/storefront/account/register', {
    method: 'POST',
    body: { email, password, firstName: 'UI', lastName: 'Tester' },
  });
  const code = String(registration.verification_code || '');
  if (!/^\d{6}$/.test(code)) {
    throw new Error('The test API did not expose a six-digit registration code');
  }
  await apiRequest('/api/storefront/account/verify', {
    method: 'POST',
    body: { email, code },
  });
  return { email, password, firstName: 'UI', lastName: 'Tester' };
}

export async function signInApi(email, password) {
  return apiRequest('/api/storefront/account/login', {
    method: 'POST',
    body: { email, password },
  });
}

async function getAdminToken() {
  if (adminToken) return adminToken;
  const login = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@demo.com', password: 'Admin123!' },
  });
  adminToken = login.token;
  return adminToken;
}

export async function createFulfilledOrder(email) {
  const catalog = await apiRequest('/api/storefront/products?limit=100');
  const product = (catalog.products || []).find((item) =>
    (item.variants || []).some((variant) => Number(variant.inventory) > 0),
  );
  const variant = product?.variants?.find((item) => Number(item.inventory) > 0);
  if (!product || !variant) throw new Error('No in-stock product was available for the UI order');

  const checkout = await apiRequest('/api/storefront/checkout', {
    method: 'POST',
    body: {
      email,
      items: [{ variantId: variant.id, quantity: 1 }],
      paymentMethod: 'manual',
      shippingAddress: {
        first_name: 'UI',
        last_name: 'Tester',
        address1: '1 Browser Test Way',
        city: 'Testville',
        region: 'TS',
        postal_code: '12345',
        country: 'United States',
      },
    },
  });
  const order = checkout.order;
  const token = await getAdminToken();
  await apiRequest(`/api/admin/orders/${order.id}/mark-paid`, { method: 'POST', token });
  await apiRequest(`/api/admin/orders/${order.id}/fulfill`, {
    method: 'POST',
    token,
    body: { notifyCustomer: false },
  });
  return { id: order.id, number: order.number, variantId: variant.id };
}

export function getAccountOrder(token, number) {
  return apiRequest(`/api/storefront/account/orders/${encodeURIComponent(number)}`, { token });
}

export async function loginViaUi(page, email, password) {
  await page.goto('/account/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/account');
}
