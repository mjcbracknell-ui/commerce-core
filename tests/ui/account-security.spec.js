import { test, expect } from '@playwright/test';
import {
  apiRequest,
  getUiInfo,
  loginViaUi,
  registerCustomer,
  signInApi,
} from './helpers.js';

test('account security updates email, password and other sessions', async ({ page }) => {
  const customer = await registerCustomer('security');
  const newPassword = 'SecurityFlow123!';
  const newEmail = `ui-security-moved-${Date.now()}@example.com`;

  await loginViaUi(page, customer.email, customer.password);
  await expect(page.getByRole('heading', { name: /^Hello,/ })).toBeVisible();

  const secondSession = await signInApi(customer.email, customer.password);
  await page.reload();

  const security = page.locator('#security');
  await expect(security.getByText(/[2-9] active sessions/)).toBeVisible();
  await expect(security.getByRole('button', { name: 'Sign out other sessions' })).toBeVisible();
  await security.getByRole('button', { name: 'Sign out other sessions' }).click();
  await expect(page.getByText('All other sessions were signed out.')).toBeVisible();
  await expect(security.getByText(/1 active session/)).toBeVisible();
  await expect(security.getByRole('button', { name: 'Sign out other sessions' })).toHaveCount(0);

  const { apiUrl } = getUiInfo();
  await expect
    .poll(async () => {
      const response = await fetch(`${apiUrl}/api/storefront/account/sessions`, {
        headers: { Authorization: `Bearer ${secondSession.token}` },
      });
      return response.status;
    })
    .toBe(401);

  await security.locator('#newEmail').fill(newEmail);
  await security.locator('#emailPassword').fill(customer.password);
  await security.getByRole('button', { name: 'Send confirmation code' }).click();
  await expect(page.getByText(/Development code:/)).toBeVisible();
  await expect(security.locator('#emailChangeCode')).toHaveValue(/^\d{6}$/);
  await security.getByRole('button', { name: 'Confirm new email' }).click();
  await expect(page.getByText('Email address updated.')).toBeVisible();
  await expect(page.locator('#profileEmail')).toHaveValue(newEmail);

  await security.locator('#currentPassword').fill(customer.password);
  await security.locator('#newPassword').fill(newPassword);
  await security.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password changed. Other sessions were signed out.')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: /^Hello,/ })).toBeVisible();
  const login = await signInApi(newEmail, newPassword);
  expect(login.token).toBeTruthy();
  const account = await apiRequest('/api/storefront/account', { token: login.token });
  expect(account.customer.email).toBe(newEmail);
});
