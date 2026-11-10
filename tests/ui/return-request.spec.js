import { test, expect } from '@playwright/test';
import {
  createFulfilledOrder,
  getAccountOrder,
  loginViaUi,
  registerCustomer,
  signInApi,
} from './helpers.js';

test('customer submits a return request for a fulfilled order', async ({ page }) => {
  const customer = await registerCustomer('return');
  const order = await createFulfilledOrder(customer.email);

  await loginViaUi(page, customer.email, customer.password);
  await page.goto(`/account/orders/${order.number}`);
  await expect(page.getByRole('heading', { name: `Order #${order.number}` })).toBeVisible();

  await page.getByRole('button', { name: 'Request a return' }).click();
  const form = page.locator('form.account-form');
  await form.locator('input[type="number"]').first().fill('1');
  await form.locator('select').first().selectOption('damaged');
  await form.locator('#returnResolution').selectOption('refund');
  await form.locator('#returnNote').fill('Arrived with a torn seam');
  await form.getByRole('button', { name: 'Submit request' }).click();

  await expect(page.getByText('Arrived with a torn seam')).toBeVisible();
  await expect(page.getByText('requested', { exact: true })).toBeVisible();

  const login = await signInApi(customer.email, customer.password);
  const detail = await getAccountOrder(login.token, order.number);
  expect(detail.order.returns).toHaveLength(1);
  expect(detail.order.returns[0]).toMatchObject({
    resolution: 'refund',
    status: 'requested',
    line_items: [{ reason: 'damaged', quantity: 1 }],
  });
});
