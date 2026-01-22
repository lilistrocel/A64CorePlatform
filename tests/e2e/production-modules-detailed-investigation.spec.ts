import { test, expect } from '@playwright/test';

/**
 * Detailed Investigation: Why Business Module Pages Show Login Instead of Content
 *
 * Tests authentication state persistence when navigating to business module pages
 */

const BASE_URL = 'https://a64core.com';
const LOGIN_CREDENTIALS = {
  email: 'admin@a64platform.com',
  password: 'SuperAdmin123!'
};

test.describe('Detailed Business Modules Investigation', () => {
  test.use({
    viewport: { width: 1920, height: 1080 },
    // Preserve authentication state
    storageState: undefined
  });

  test('Investigate authentication state when navigating to HR module', async ({ page }) => {
    console.log('\n=== DETAILED INVESTIGATION: HR MODULE ===\n');

    // Setup comprehensive logging
    const consoleMessages: string[] = [];
    const networkErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', msg => {
      const message = `[${msg.type().toUpperCase()}] ${msg.text()}`;
      consoleMessages.push(message);
      console.log(message);
    });

    page.on('pageerror', error => {
      const message = `[PAGE ERROR] ${error.message}`;
      pageErrors.push(message);
      console.error(message);
    });

    page.on('response', async response => {
      if (!response.ok() && (response.request().resourceType() === 'xhr' || response.request().resourceType() === 'fetch')) {
        const message = `[NETWORK ERROR] ${response.status()} ${response.url()}`;
        networkErrors.push(message);
        console.error(message);
        try {
          const body = await response.text();
          console.error(`[ERROR BODY] ${body.substring(0, 500)}`);
        } catch (e) {
          // Ignore
        }
      }
    });

    // Step 1: Login
    console.log('\n--- Step 1: Login ---');
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', LOGIN_CREDENTIALS.email);
    await page.fill('input[type="password"]', LOGIN_CREDENTIALS.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|admin)/, { timeout: 15000 });
    console.log(`✓ Logged in, redirected to: ${page.url()}`);

    // Check authentication state after login
    const tokenAfterLogin = await page.evaluate(() => {
      return {
        token: localStorage.getItem('token'),
        user: localStorage.getItem('user'),
        allKeys: Object.keys(localStorage)
      };
    });
    console.log('\n--- Authentication State After Login ---');
    console.log('Token exists:', !!tokenAfterLogin.token);
    console.log('Token (first 50 chars):', tokenAfterLogin.token?.substring(0, 50));
    console.log('User data exists:', !!tokenAfterLogin.user);
    console.log('All localStorage keys:', tokenAfterLogin.allKeys);

    // Check cookies
    const cookiesAfterLogin = await page.context().cookies();
    console.log('\n--- Cookies After Login ---');
    cookiesAfterLogin.forEach(cookie => {
      console.log(`Cookie: ${cookie.name} = ${cookie.value.substring(0, 50)}... (domain: ${cookie.domain}, secure: ${cookie.secure}, httpOnly: ${cookie.httpOnly})`);
    });

    await page.screenshot({ path: 'test-results/detailed-01-after-login.png', fullPage: true });

    // Step 2: Navigate to HR page
    console.log('\n--- Step 2: Navigate to HR page ---');
    console.log('Current URL before navigation:', page.url());

    await page.goto(`${BASE_URL}/hr`);
    console.log('Navigated to HR page');

    // Wait for page to load
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    console.log('✓ Page load state: networkidle');
    console.log('Current URL after navigation:', page.url());

    // Check if redirected to login
    const currentUrl = page.url();
    const isOnLoginPage = currentUrl.includes('/login');
    console.log('Is on login page:', isOnLoginPage);

    // Check authentication state after navigation
    const tokenAfterNavigation = await page.evaluate(() => {
      return {
        token: localStorage.getItem('token'),
        user: localStorage.getItem('user'),
        allKeys: Object.keys(localStorage)
      };
    });
    console.log('\n--- Authentication State After Navigation to /hr ---');
    console.log('Token exists:', !!tokenAfterNavigation.token);
    console.log('Token (first 50 chars):', tokenAfterNavigation.token?.substring(0, 50));
    console.log('User data exists:', !!tokenAfterNavigation.user);
    console.log('All localStorage keys:', tokenAfterNavigation.allKeys);

    // Check cookies after navigation
    const cookiesAfterNav = await page.context().cookies();
    console.log('\n--- Cookies After Navigation to /hr ---');
    cookiesAfterNav.forEach(cookie => {
      console.log(`Cookie: ${cookie.name} = ${cookie.value.substring(0, 50)}... (domain: ${cookie.domain}, secure: ${cookie.secure}, httpOnly: ${cookie.httpOnly})`);
    });

    // Check page content
    const pageTitle = await page.title();
    const bodyText = await page.textContent('body');
    const hasLoginForm = await page.locator('input[type="email"]').count() > 0;

    console.log('\n--- Page Content Analysis ---');
    console.log('Page title:', pageTitle);
    console.log('Has login form:', hasLoginForm);
    console.log('Body text length:', bodyText?.length);
    console.log('Body text preview:', bodyText?.substring(0, 200));

    await page.screenshot({ path: 'test-results/detailed-02-hr-page.png', fullPage: true });

    // Step 3: Try clicking HR from sidebar instead of direct navigation
    console.log('\n--- Step 3: Navigate to HR via sidebar ---');
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('networkidle');
    console.log('Back on dashboard');

    // Check if HR link exists in sidebar
    const hrLinkExists = await page.locator('a[href*="/hr"], button:has-text("HR")').count() > 0;
    console.log('HR link in sidebar exists:', hrLinkExists);

    if (hrLinkExists) {
      await page.click('a[href*="/hr"], button:has-text("HR")');
      await page.waitForLoadState('networkidle', { timeout: 15000 });
      console.log('Clicked HR from sidebar');
      console.log('Current URL:', page.url());

      const isStillOnLogin = page.url().includes('/login');
      console.log('Is on login page after sidebar click:', isStillOnLogin);

      await page.screenshot({ path: 'test-results/detailed-03-hr-via-sidebar.png', fullPage: true });
    }

    // Summary
    console.log('\n=== INVESTIGATION SUMMARY ===');
    console.log('1. Login successful:', !currentUrl.includes('/login'));
    console.log('2. Token persists after login:', !!tokenAfterLogin.token);
    console.log('3. Token persists after navigation:', !!tokenAfterNavigation.token);
    console.log('4. Direct navigation to /hr redirects to login:', isOnLoginPage);
    console.log('5. Total console messages:', consoleMessages.length);
    console.log('6. Total page errors:', pageErrors.length);
    console.log('7. Total network errors:', networkErrors.length);

    if (pageErrors.length > 0) {
      console.log('\n--- All Page Errors ---');
      pageErrors.forEach(err => console.error(err));
    }

    if (networkErrors.length > 0) {
      console.log('\n--- All Network Errors ---');
      networkErrors.forEach(err => console.error(err));
    }

    // Check if this is a routing issue in React
    console.log('\n--- Checking React Router ---');
    const reactRouterInfo = await page.evaluate(() => {
      // Check if React Router is present
      const rootElement = document.getElementById('root');
      return {
        hasReactRoot: !!rootElement,
        rootChildren: rootElement?.children.length,
        rootHTML: rootElement?.innerHTML.substring(0, 300)
      };
    });
    console.log('React Router Info:', reactRouterInfo);
  });

  test('Compare: Navigate to existing Farm Manager page', async ({ page }) => {
    console.log('\n=== COMPARISON TEST: Farm Manager (Working Module) ===\n');

    // Login first
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', LOGIN_CREDENTIALS.email);
    await page.fill('input[type="password"]', LOGIN_CREDENTIALS.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|admin)/, { timeout: 15000 });
    console.log('✓ Logged in');

    // Navigate to Farm Manager
    console.log('\n--- Navigate to Farm Manager (should work) ---');
    await page.goto(`${BASE_URL}/farm`);
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    const farmUrl = page.url();
    const isOnLoginPage = farmUrl.includes('/login');
    console.log('Current URL:', farmUrl);
    console.log('Is on login page:', isOnLoginPage);

    const bodyText = await page.textContent('body');
    console.log('Body text length:', bodyText?.length);

    await page.screenshot({ path: 'test-results/detailed-04-farm-manager-comparison.png', fullPage: true });

    console.log('\n--- Comparison Result ---');
    console.log('Farm Manager works:', !isOnLoginPage);
    console.log('This confirms other modules should also work if routing is correct');
  });
});
