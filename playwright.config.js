import { defineConfig, devices } from '@playwright/test';

const port = process.env.UI_PORT || '3100';

export default defineConfig({
  testDir: './tests/ui',
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: './tests/ui/global-setup.js',
  globalTeardown: './tests/ui/global-teardown.js',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
