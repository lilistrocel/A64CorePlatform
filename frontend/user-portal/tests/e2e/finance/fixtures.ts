/**
 * Shared Playwright fixtures for Wave 2 finance smoke tests.
 *
 * Provides a `loggedInPage` fixture that authenticates as the default super_admin
 * (admin@a64platform.com / SuperAdmin123!) before each test.  All finance spec
 * files import from here instead of calling login inline.
 *
 * Login approach: navigates to /login, fills credentials, clicks "Sign In",
 * and waits for the dashboard to confirm auth.  No division / org picker is
 * present on the login page — auth is org-scoped server-side.
 *
 * Console error collection is also wired here.  Each test that wants it calls
 * `consoleErrors` and asserts the array is empty at the end.
 */

import { test as base, expect, type Page } from '@playwright/test';

// ─── Types ────────────────────────────────────────────────────────────────────

type FinanceFixtures = {
  /** Fully authenticated page object. Ready to navigate to any /finance/* route. */
  loggedInPage: Page;
  /**
   * Array of console error messages collected since login.
   * Populated automatically; assert `expect(consoleErrors).toEqual([])` in tests
   * where console cleanliness matters.
   */
  consoleErrors: string[];
};

// ─── Credentials ─────────────────────────────────────────────────────────────

const ADMIN_EMAIL = 'admin@a64platform.com';
const ADMIN_PASSWORD = 'SuperAdmin123!';

// ─── Auth helper ─────────────────────────────────────────────────────────────

/**
 * Perform login flow on the given page, including division selection.
 *
 * The A64 login flow is:
 *   1. /login → fill credentials → submit → redirects to /select-division or /dashboard
 *   2. Ensure a division is selected in the client-side Zustand store (persisted to
 *      localStorage as "division-storage"). The server may auto-select via defaultDivisionId
 *      but does NOT update the client localStorage — we must do that explicitly.
 *
 * Strategy:
 *   - After login, check if "division-storage" in localStorage has a currentDivision set.
 *   - If not, navigate to /select-division and click "Vegetable & Fruits Division" card.
 *   - This ensures the Zustand persist middleware writes currentDivision to localStorage
 *     so that subsequent page.goto() calls don't get redirected back to /select-division
 *     when ProtectedRoute detects no selected division.
 *
 * Uses ARIA / text selectors throughout.
 */
export async function doLogin(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });

  // The Login page uses react-hook-form with <Input label="Email" /> — the shared
  // component renders an <input> whose associated <label> text is "Email".
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Wait until redirected away from /login — either to /select-division or /dashboard.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 30_000,
  });

  // Check if the division is already set in the client-side Zustand store (localStorage).
  // The server may auto-select via defaultDivisionId without updating localStorage.
  const divisionStorage = await page.evaluate(() => {
    const raw = localStorage.getItem('division-storage');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed?.state?.currentDivision ?? null;
    } catch {
      return null;
    }
  });

  if (divisionStorage !== null) {
    // Division already selected in Zustand — nothing more to do.
    return;
  }

  // Division NOT selected in client localStorage. Navigate to /select-division explicitly
  // so that the Zustand persist middleware saves the selection to localStorage.
  // This ensures subsequent page.goto() calls to /finance/* don't get redirected
  // back to /select-division by ProtectedRoute.
  await page.goto('/select-division', { waitUntil: 'domcontentloaded' });

  // Wait for the division cards to appear.
  const divisionHeading = page.getByText('Select Your Division', { exact: false });
  await divisionHeading.waitFor({ state: 'visible', timeout: 15_000 });

  // Prefer "Vegetable & Fruits Division" — the primary finance-bearing division.
  // Use the button's aria-label for precision (avoids matching text inside the card).
  const vegFruitsBtn = page.getByRole('button', { name: /Select Vegetable.*Fruits.*Division/i });
  const vegVisible = await vegFruitsBtn.isVisible({ timeout: 5_000 }).catch(() => false);

  if (vegVisible) {
    await vegFruitsBtn.click();
  } else {
    // Fallback: click the first available division card button.
    const firstCard = page.getByRole('button', { name: /Select .* division/i }).first();
    await firstCard.click();
  }

  // Wait for navigation to /dashboard after division selection.
  await page.waitForURL((url) => url.pathname.includes('/dashboard'), {
    timeout: 30_000,
  });

  // Verify the division is now persisted in localStorage.
  const divisionAfter = await page.evaluate(() => {
    const raw = localStorage.getItem('division-storage');
    if (!raw) return null;
    try {
      return JSON.parse(raw)?.state?.currentDivision?.name ?? null;
    } catch {
      return null;
    }
  });

  if (!divisionAfter) {
    throw new Error(
      'doLogin: division selection did not persist to localStorage. ' +
        'ProtectedRoute will redirect subsequent navigations to /select-division.'
    );
  }
}

// ─── Fixture extension ────────────────────────────────────────────────────────

export const test = base.extend<FinanceFixtures>({
  /**
   * loggedInPage — provides an already-authenticated page.
   *
   * Authentication is handled by global setup (tests/e2e/global-setup.ts) which
   * runs once before the suite and saves browser storage state (localStorage +
   * cookies) to tests/e2e/.auth/admin.json. The playwright.config.ts `use.storageState`
   * option loads that file into every browser context, so each test starts
   * pre-authenticated with cookies + localStorage already populated (including
   * the "division-storage" Zustand key with currentDivision set).
   *
   * No per-test login is needed. The fixture simply passes the pre-authenticated
   * page to the test.
   */
  loggedInPage: async ({ page }, use) => {
    // storageState (auth + division localStorage) is pre-loaded by playwright.config.ts.
    // Nothing to do here — the page is already authenticated.
    await use(page);
  },

  consoleErrors: async ({ loggedInPage }, use) => {
    const errors: string[] = [];
    loggedInPage.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    await use(errors);
  },
});

export { expect };
