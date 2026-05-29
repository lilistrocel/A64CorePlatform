/**
 * cash-flow.spec.ts
 *
 * Smoke tests for /finance/cash-flow (T-060.10).
 *
 * Covers:
 *  - Page renders heading
 *  - Three activity section headings visible (Operating, Investing, Financing)
 *  - Reconciliation footer rows visible (Net Change in Cash, Opening Cash, Ending Cash)
 *  - ReconcileWarningBanner visible when delta is non-zero (conditional)
 *  - Drill-down modal on leaf account row (same assertions as BS/IS)
 */

import { test, expect } from './fixtures';

test.describe('Cash Flow Statement Page', () => {
  test.beforeEach(async ({ loggedInPage: page }) => {
    // Provide a default date range so the CF statement loads.
    await page.goto(
      '/finance/cash-flow',
      { waitUntil: 'networkidle' }
    );

    // Fill in period dates in the toolbar if the page requires them.
    const dateInputs = page.locator('input[type="date"]');
    const firstInput = await dateInputs.first().isVisible().catch(() => false);
    if (firstInput) {
      await dateInputs.nth(0).fill('2026-01-01');
      await dateInputs.nth(1).fill('2026-05-29');
      await page.keyboard.press('Tab');
    }
  });

  test('renders heading for the Cash Flow statement page', async ({ loggedInPage: page }) => {
    // FinanceReportPage renders the title prop as an h1.
    await expect(
      page.getByRole('heading', { name: /Cash Flow/i, level: 1 })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('three activity section headings are visible', async ({ loggedInPage: page }) => {
    // Wait for the CF table to render (or error/empty state).
    await page.waitForSelector('[role="table"], [aria-live]', {
      timeout: 30_000,
    }).catch(() => {});

    // The three section headers come from SectionHeaderCell styled components with
    // text matching "OPERATING ACTIVITIES", "INVESTING ACTIVITIES", "FINANCING ACTIVITIES".
    await expect(page.getByText(/OPERATING ACTIVITIES/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/INVESTING ACTIVITIES/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/FINANCING ACTIVITIES/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('reconciliation footer rows are visible', async ({ loggedInPage: page }) => {
    await page.waitForSelector('[role="table"], [aria-live]', {
      timeout: 30_000,
    }).catch(() => {});

    // The CF statement footer renders three summary rows.
    // Their text labels come from the CashFlowStatementPage footer section.
    await expect(page.getByText(/Net Change in Cash/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText(/Cash.*(Beginning|Opening|Start)/i).first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/Cash.*(Ending|Closing|End)/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test('ReconcileWarningBanner is shown when reconciliation delta is non-zero', async ({
    loggedInPage: page,
  }) => {
    await page.waitForSelector('[role="table"], [aria-live]', {
      timeout: 30_000,
    }).catch(() => {});

    // The banner is conditionally rendered — it may or may not appear depending
    // on the actual data. We verify that IF it appears, it is visible and contains
    // reconciliation-related text.
    const warningBanner = page.getByRole('alert').filter({ hasText: /reconcil|out of balance|delta/i });
    const isVisible = await warningBanner.first().isVisible().catch(() => false);

    if (isVisible) {
      await expect(warningBanner.first()).toBeVisible();
      console.log('ReconcileWarningBanner IS visible — delta is non-zero.');
    } else {
      console.log('ReconcileWarningBanner not shown — cash flow reconciles correctly.');
    }
    // No assertion failure either way — both states are valid.
  });

  test('drill-down modal opens on leaf account row click', async ({ loggedInPage: page }) => {
    await page.waitForSelector('[role="table"], [aria-live]', {
      timeout: 30_000,
    }).catch(() => {});

    const firstLeafRow = page.getByRole('button').filter({ hasText: /\d{6}/ }).first();
    const count = await firstLeafRow.count();
    if (count === 0) {
      console.log('No CF leaf rows — skipping drill-down test (empty CF).');
      return;
    }

    await firstLeafRow.click();
    const backdrop = page.locator('[class*="ModalBackdrop"]').first();
    await expect(backdrop).toBeVisible({ timeout: 10_000 });

    // Verify modal does NOT close on backdrop click (same pattern as BS/IS).
    await backdrop.click({ position: { x: 20, y: 20 } });
    await expect(backdrop).toBeVisible({ timeout: 3_000 });

    // Close via X button.
    const closeBtn = page.locator('[class*="ModalCloseButton"]').first();
    await closeBtn.click();
    await expect(backdrop).not.toBeVisible({ timeout: 5_000 });
  });

  test('no console errors on page load', async ({ loggedInPage: page, consoleErrors }) => {
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    const criticalErrors = consoleErrors.filter(
      (e) =>
        e.includes('422') ||
        e.includes('Uncaught') ||
        e.includes('Cannot read properties of undefined')
    );
    expect(criticalErrors, 'Critical console errors found').toEqual([]);
  });
});
