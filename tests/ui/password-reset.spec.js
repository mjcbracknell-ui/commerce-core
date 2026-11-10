import { test, expect } from '@playwright/test';
import { registerCustomer } from './helpers.js';

test('customer resets a forgotten password and signs in with it', async ({ page }) => {
  const customer = await registerCustomer('reset');
  const newPassword = 'ResetFlow123!';

  await page.goto('/account/login');
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page).toHaveURL(/\/account\/forgot-password$/);

  await page.getByLabel('Email').fill(customer.email);
  await page.getByRole('button', { name: 'Send reset code' }).click();
  await expect(page).toHaveURL(/\/account\/reset-password\?email=/);
  await expect(page.getByLabel('Reset code')).toHaveValue(/^\d{6}$/);

  await page.getByLabel('New password').fill(newPassword);
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page).toHaveURL(/\/account\/login\?reset=1$/);
  await expect(page.getByText('Password updated. Sign in with your new password.')).toBeVisible();

  await page.getByLabel('Email').fill(customer.email);
  await page.getByLabel('Password').fill(newPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { name: /^Hello,/ })).toBeVisible();
});
