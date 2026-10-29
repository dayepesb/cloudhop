import { defineConfig, devices } from '@playwright/test';

// Web UI end-to-end tests: each test starts `cloudhop ui` (the built bundle) on a sandbox.
export default defineConfig({
  testDir: 'e2e/web',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
