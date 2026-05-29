/**
 * global-setup.ts
 *
 * Playwright global setup — runs ONCE before all tests.
 *
 * Performs a full login + division selection for admin@a64platform.com and saves
 * the resulting browser storage state (cookies + localStorage) to
 * tests/e2e/.auth/admin.json.
 *
 * All tests then start with this storage state pre-loaded, so no test needs to
 * re-authenticate. This avoids hammering the login rate-limiter when running 49
 * tests in parallel.
 *
 * The division is explicitly selected via the /select-division UI so that the
 * Zustand `division-storage` localStorage key is populated. Without this, the
 * ProtectedRoute redirects every /finance/* navigation back to /select-division
 * once loadDivisions() completes and reveals that currentDivision = null.
 */

import { chromium, type FullConfig } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname replacement.
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const ADMIN_EMAIL    = 'admin@a64platform.com';
const ADMIN_PASSWORD = 'SuperAdmin123!';

const STORAGE_STATE_PATH = path.join(
  __dirname,
  '.auth',
  'admin.json'
);

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Ensure output directory exists.
  const authDir = path.dirname(STORAGE_STATE_PATH);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: 'http://localhost',
  });
  const page = await context.newPage();

  // ── Step 1: Login ──────────────────────────────────────────────────────────
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Wait for redirect away from /login.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 30_000,
  });

  // ── Step 2: Division selection ─────────────────────────────────────────────
  // After login, check if a division is already selected in localStorage.
  // The server may auto-select via defaultDivisionId without updating the
  // client-side Zustand store. We must ensure division-storage is populated.
  const divisionStorage = await page.evaluate(() => {
    const raw = localStorage.getItem('division-storage');
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as { state?: { currentDivision?: unknown } })?.state?.currentDivision ?? null;
    } catch {
      return null;
    }
  });

  if (divisionStorage === null) {
    // Explicitly navigate to /select-division to trigger the Zustand store update.
    await page.goto('/select-division', { waitUntil: 'domcontentloaded' });

    // Wait for division cards to appear.
    await page.getByText('Select Your Division', { exact: false }).waitFor({
      state: 'visible',
      timeout: 15_000,
    });

    // Click "Vegetable & Fruits Division" (primary finance division).
    const vegBtn = page.getByRole('button', { name: /Select Vegetable.*Fruits.*Division/i });
    const vegVisible = await vegBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (vegVisible) {
      await vegBtn.click();
    } else {
      // Fallback: click first division button.
      await page.getByRole('button', { name: /Select .* division/i }).first().click();
    }

    // Wait for redirect to /dashboard.
    await page.waitForURL((url) => url.pathname.includes('/dashboard'), {
      timeout: 30_000,
    });

    // Verify division is now persisted.
    const divisionAfter = await page.evaluate(() => {
      const raw = localStorage.getItem('division-storage');
      if (!raw) return null;
      try {
        return (JSON.parse(raw) as { state?: { currentDivision?: { name?: string } } })?.state?.currentDivision?.name ?? null;
      } catch {
        return null;
      }
    });

    if (!divisionAfter) {
      throw new Error(
        '[global-setup] Division selection did not persist to localStorage. ' +
          'Subsequent finance tests will be redirected to /select-division.'
      );
    }

    console.log(`[global-setup] Division selected: ${divisionAfter}`);
  } else {
    console.log('[global-setup] Division already persisted, skipping selection step.');
  }

  // ── Step 3: Save storage state ─────────────────────────────────────────────
  await context.storageState({ path: STORAGE_STATE_PATH });
  console.log(`[global-setup] Storage state saved → ${STORAGE_STATE_PATH}`);

  await browser.close();
}
