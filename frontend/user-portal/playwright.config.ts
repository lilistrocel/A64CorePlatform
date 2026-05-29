/**
 * Playwright configuration for A64 Core Platform — Wave 2 Finance UI smoke tests.
 *
 * Base URL: http://localhost (Nginx proxy in front of Vite dev server + backend).
 * The full stack must be running before tests execute:
 *   docker compose -f docker-compose.yml -f docker-compose.finance.yml --profile finance up -d
 *
 * Auth: admin@a64platform.com / SuperAdmin123!
 * Finance module: must be enabled for the default org (financeEnabled=true).
 *
 * Run: npx playwright test  (from frontend/user-portal/)
 *    or: npm run test:e2e
 */

import { defineConfig, devices } from '@playwright/test';

// Path to the storage state file saved by global-setup.ts.
// Must match STORAGE_STATE_PATH in tests/e2e/global-setup.ts.
const STORAGE_STATE_PATH = './tests/e2e/.auth/admin.json';

export default defineConfig({
  testDir: './tests/e2e',

  // Run the global setup once before all tests to authenticate and save storage state.
  globalSetup: './tests/e2e/global-setup.ts',

  // Run each spec file in parallel; tests within a file run sequentially
  // (important for tests that share login state within a describe block).
  fullyParallel: false,
  forbidOnly: !!process.env.CI,

  // 1 retry in CI to absorb transient flakes; 0 locally so failures are obvious.
  retries: process.env.CI ? 1 : 0,

  // Single worker in CI to avoid session conflicts; 2 locally for speed.
  workers: process.env.CI ? 1 : 2,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: 'http://localhost',
    headless: true,

    // Pre-loaded auth state from global setup — avoids per-test login and
    // eliminates rate-limit issues when running many tests in parallel.
    storageState: STORAGE_STATE_PATH,

    // Navigation timeout — 30 s for slow page loads (finance queries can be heavy).
    navigationTimeout: 30_000,

    // Default action timeout — 10 s for element interactions.
    actionTimeout: 10_000,

    // Capture a screenshot on every test failure.
    screenshot: 'only-on-failure',

    // Record a video trace on first retry so failures can be replayed.
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Firefox and Safari are defined but skipped by default in local runs.
    // Run explicitly: npx playwright test --project=firefox
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
});
