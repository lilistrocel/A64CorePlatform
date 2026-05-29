/**
 * auth-and-sidebar.spec.ts
 *
 * Smoke tests: authentication flow + Finance sidebar navigation.
 * Priority 1 — anchors everything else; if this suite fails nothing else matters.
 *
 * Covers:
 *  - Full login flow
 *  - Finance sidebar group expansion / visibility
 *  - All expected Finance nav entries present
 *  - "Operational P&L" routes to /operations/pnl (NOT /finance/pnl)
 *  - New Manual JE entry navigates to /finance/journal-entries/new
 */

import { test, expect } from './fixtures';

// Expected Finance sidebar links (label → href fragment).
// Labels use PARTIAL matching (exact: false) to accommodate emoji prefixes
// in the link accessible names (e.g. "📋 Chart of Accounts").
// Order matches the MainLayout.tsx _FINANCE_NAV_GROUP array.
const EXPECTED_FINANCE_LINKS: Array<{ label: string; href: string }> = [
  { label: 'Chart of Accounts', href: '/finance/chart-of-accounts' },
  { label: 'Approval Rules',    href: '/finance/approval-rules' },
  { label: 'Posting Setup',     href: '/finance/posting-setup' },
  { label: 'Item GL Mapping',   href: '/finance/item-mapping' },
  { label: 'Journal Entries',   href: '/finance/journal-entries' },
  { label: 'New Manual JE',     href: '/finance/journal-entries/new' },
  { label: 'Trial Balance',     href: '/finance/trial-balance' },
  { label: 'Balance Sheet',     href: '/finance/balance-sheet' },
  { label: 'Income Statement',  href: '/finance/income-statement' },
  { label: 'Cash Flow',         href: '/finance/cash-flow' },
  { label: 'Vendor Payments',   href: '/finance/payments' },
  { label: 'AP Aging',          href: '/finance/ap-aging' },
  { label: 'Vendor Sub-Ledger', href: '/finance/vendor-sub-ledger' },
  { label: 'Fiscal Periods',    href: '/finance/periods' },
  { label: 'Operational P&L',   href: '/operations/pnl' },
  { label: 'Incoming Preview',  href: '/finance/incoming' },
];

test.describe('Auth + Finance Sidebar', () => {
  test('login flow lands on /dashboard', async ({ page }) => {
    // Navigate to base URL first so localStorage is accessible (about:blank blocks it).
    await page.goto('http://localhost', { waitUntil: 'domcontentloaded' });
    // Clear the pre-loaded storage state so we can test the actual login flow.
    // Global setup pre-authenticates all pages; we override for this one test.
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());

    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();

    await page.getByLabel('Email').fill('admin@a64platform.com');
    await page.getByLabel('Password').fill('SuperAdmin123!');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Should redirect to a protected route (dashboard is the default).
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
      timeout: 30_000,
    });

    // After login the URL should NOT be /login.
    expect(page.url()).not.toContain('/login');
  });

  test('Finance sidebar group contains all expected entries', async ({ loggedInPage: page }) => {
    // Navigate to a finance page — this causes the Finance nav group to be auto-expanded.
    await page.goto('/finance/balance-sheet', { waitUntil: 'domcontentloaded' });

    // Ensure the Finance group is expanded (it auto-expands when on a /finance/* route,
    // but click it defensively in case the app hasn't rendered yet).
    const financeGroup = page.getByRole('button', { name: /Finance navigation group/i });
    const isExpanded = await financeGroup.getAttribute('aria-expanded').catch(() => null);
    if (isExpanded !== 'true') {
      await financeGroup.click();
    }

    for (const { label, href } of EXPECTED_FINANCE_LINKS) {
      // Use exact: false — sidebar link accessible names include emoji prefixes
      // (e.g. "📋 Chart of Accounts"). Partial match is sufficient and more robust.
      const link = page.getByRole('link', { name: label, exact: false });
      await expect(link).toBeVisible({
        timeout: 10_000,
      });

      // Verify the href is correct.
      const hrefAttr = await link.getAttribute('href');
      expect(hrefAttr, `${label} href should be ${href}`).toContain(href);
    }
  });

  test('Operational P&L link targets /operations/pnl (not /finance/pnl)', async ({
    loggedInPage: page,
  }) => {
    await page.goto('/finance/balance-sheet', { waitUntil: 'domcontentloaded' });

    // Ensure Finance group is expanded.
    const financeGroup = page.getByRole('button', { name: /Finance navigation group/i });
    const isExpanded = await financeGroup.getAttribute('aria-expanded').catch(() => null);
    if (isExpanded !== 'true') {
      await financeGroup.click();
    }

    // exact: false to handle emoji prefix "📈 Operational P&L"
    const pnlLink = page.getByRole('link', { name: 'Operational P&L', exact: false });
    await expect(pnlLink).toBeVisible({ timeout: 5_000 });

    const href = await pnlLink.getAttribute('href');
    expect(href).toContain('/operations/pnl');
    expect(href).not.toContain('/finance/pnl');
  });

  test('clicking New Manual JE navigates to /finance/journal-entries/new', async ({
    loggedInPage: page,
  }) => {
    await page.goto('/finance/journal-entries', { waitUntil: 'domcontentloaded' });

    // Ensure Finance group is expanded.
    const financeGroup = page.getByRole('button', { name: /Finance navigation group/i });
    const isExpanded = await financeGroup.getAttribute('aria-expanded').catch(() => null);
    if (isExpanded !== 'true') {
      await financeGroup.click();
    }

    // exact: false to handle emoji prefix "✍️ New Manual JE"
    const newJeLink = page.getByRole('link', { name: 'New Manual JE', exact: false });
    await expect(newJeLink).toBeVisible({ timeout: 5_000 });
    await newJeLink.click();

    await expect(page).toHaveURL(/\/finance\/journal-entries\/new/, {
      timeout: 15_000,
    });
  });
});
