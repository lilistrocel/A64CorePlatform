import { test, expect } from '@playwright/test';

/**
 * Production Business Modules Investigation
 * Testing why new module pages are showing blank/gray on https://a64core.com
 *
 * Modules to test:
 * - /hr (HR Dashboard - reported blank)
 * - /crm/customers (CRM)
 * - /logistics (Logistics)
 * - /sales (Sales)
 * - /marketing (Marketing)
 */

const BASE_URL = 'https://a64core.com';
const LOGIN_CREDENTIALS = {
  email: 'admin@a64platform.com',
  password: 'SuperAdmin123!'
};

// Module pages to test
const MODULE_PAGES = [
  { path: '/hr', name: 'HR Dashboard', reported: 'blank' },
  { path: '/crm/customers', name: 'CRM Customers', reported: 'unknown' },
  { path: '/logistics', name: 'Logistics', reported: 'unknown' },
  { path: '/sales', name: 'Sales', reported: 'unknown' },
  { path: '/marketing', name: 'Marketing', reported: 'unknown' }
];

test.describe('Production Business Modules Investigation', () => {
  let authToken: string;

  test.beforeAll(async ({ browser }) => {
    console.log('\n=== Starting Production Modules Investigation ===\n');
  });

  test('Step 1: Login to production site', async ({ page }) => {
    console.log('\n--- Step 1: Navigating to login page ---');

    // Listen for console messages
    page.on('console', msg => {
      console.log(`[BROWSER CONSOLE - ${msg.type().toUpperCase()}]:`, msg.text());
    });

    // Listen for page errors
    page.on('pageerror', error => {
      console.error(`[PAGE ERROR]:`, error.message);
    });

    // Listen for network requests
    page.on('request', request => {
      if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
        console.log(`[NETWORK REQUEST]: ${request.method()} ${request.url()}`);
      }
    });

    page.on('response', async response => {
      if (response.request().resourceType() === 'xhr' || response.request().resourceType() === 'fetch') {
        console.log(`[NETWORK RESPONSE]: ${response.status()} ${response.url()}`);
        if (!response.ok()) {
          try {
            const body = await response.text();
            console.error(`[RESPONSE ERROR BODY]:`, body);
          } catch (e) {
            console.error(`[RESPONSE ERROR]: Could not read error body`);
          }
        }
      }
    });

    // Navigate to login page
    await page.goto(`${BASE_URL}/login`);
    console.log('✓ Navigated to login page');

    // Take screenshot of login page
    await page.screenshot({ path: 'test-results/01-login-page.png', fullPage: true });
    console.log('✓ Screenshot saved: 01-login-page.png');

    // Wait for login form to be visible
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    console.log('✓ Login form visible');

    // Fill in credentials
    await page.fill('input[type="email"]', LOGIN_CREDENTIALS.email);
    await page.fill('input[type="password"]', LOGIN_CREDENTIALS.password);
    console.log('✓ Credentials entered');

    // Take screenshot before login
    await page.screenshot({ path: 'test-results/02-before-login.png', fullPage: true });

    // Click login button
    await page.click('button[type="submit"]');
    console.log('✓ Login button clicked');

    // Wait for navigation after login
    await page.waitForURL(/\/(dashboard|admin|farm|hr|crm|logistics|sales|marketing)/, { timeout: 15000 });
    console.log(`✓ Redirected to: ${page.url()}`);

    // Take screenshot after login
    await page.screenshot({ path: 'test-results/03-after-login.png', fullPage: true });

    // Check if we have a token in localStorage
    const token = await page.evaluate(() => localStorage.getItem('token'));
    if (token) {
      authToken = token;
      console.log('✓ Authentication token found');
    } else {
      console.warn('⚠ No authentication token found in localStorage');
    }

    // Wait a bit for any initial page loading
    await page.waitForTimeout(2000);
  });

  test('Step 2: Test HR Dashboard (/hr) - REPORTED BLANK', async ({ page }) => {
    console.log('\n--- Step 2: Testing HR Dashboard (/hr) ---');

    const moduleInfo = MODULE_PAGES[0]; // /hr

    // Navigate to HR page
    console.log(`Navigating to ${BASE_URL}${moduleInfo.path}...`);
    await page.goto(`${BASE_URL}${moduleInfo.path}`);

    // Wait for page to load
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    console.log('✓ Page load state: networkidle');

    // Take screenshot
    await page.screenshot({ path: `test-results/04-hr-page.png`, fullPage: true });
    console.log('✓ Screenshot saved: 04-hr-page.png');

    // Check page content
    const bodyText = await page.textContent('body');
    const hasContent = bodyText && bodyText.trim().length > 0;
    console.log(`Page has text content: ${hasContent}`);
    console.log(`Body text length: ${bodyText?.length || 0} characters`);

    // Check for blank/gray page indicators
    const bodyBg = await page.evaluate(() => {
      const body = document.querySelector('body');
      return window.getComputedStyle(body!).backgroundColor;
    });
    console.log(`Body background color: ${bodyBg}`);

    // Check for main content area
    const mainContent = await page.$('main, [role="main"], .main-content, #root > div');
    console.log(`Main content area found: ${mainContent !== null}`);

    // Check for error messages
    const errorText = await page.textContent('body');
    if (errorText?.includes('error') || errorText?.includes('Error') || errorText?.includes('failed')) {
      console.error(`⚠ Error text detected on page: ${errorText.substring(0, 200)}`);
    }

    // Get all console errors
    console.log('\n--- Checking for JavaScript errors ---');
  });

  test('Step 3: Test CRM Customers (/crm/customers)', async ({ page }) => {
    console.log('\n--- Step 3: Testing CRM Customers (/crm/customers) ---');

    const moduleInfo = MODULE_PAGES[1]; // /crm/customers

    await page.goto(`${BASE_URL}${moduleInfo.path}`);
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    await page.screenshot({ path: `test-results/05-crm-customers-page.png`, fullPage: true });
    console.log('✓ Screenshot saved: 05-crm-customers-page.png');

    const bodyText = await page.textContent('body');
    console.log(`Page has content: ${bodyText && bodyText.trim().length > 0}`);
    console.log(`Body text length: ${bodyText?.length || 0} characters`);
  });

  test('Step 4: Test Logistics (/logistics)', async ({ page }) => {
    console.log('\n--- Step 4: Testing Logistics (/logistics) ---');

    const moduleInfo = MODULE_PAGES[2]; // /logistics

    await page.goto(`${BASE_URL}${moduleInfo.path}`);
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    await page.screenshot({ path: `test-results/06-logistics-page.png`, fullPage: true });
    console.log('✓ Screenshot saved: 06-logistics-page.png');

    const bodyText = await page.textContent('body');
    console.log(`Page has content: ${bodyText && bodyText.trim().length > 0}`);
    console.log(`Body text length: ${bodyText?.length || 0} characters`);
  });

  test('Step 5: Test Sales (/sales)', async ({ page }) => {
    console.log('\n--- Step 5: Testing Sales (/sales) ---');

    const moduleInfo = MODULE_PAGES[3]; // /sales

    await page.goto(`${BASE_URL}${moduleInfo.path}`);
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    await page.screenshot({ path: `test-results/07-sales-page.png`, fullPage: true });
    console.log('✓ Screenshot saved: 07-sales-page.png');

    const bodyText = await page.textContent('body');
    console.log(`Page has content: ${bodyText && bodyText.trim().length > 0}`);
    console.log(`Body text length: ${bodyText?.length || 0} characters`);
  });

  test('Step 6: Test Marketing (/marketing)', async ({ page }) => {
    console.log('\n--- Step 6: Testing Marketing (/marketing) ---');

    const moduleInfo = MODULE_PAGES[4]; // /marketing

    await page.goto(`${BASE_URL}${moduleInfo.path}`);
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    await page.screenshot({ path: `test-results/08-marketing-page.png`, fullPage: true });
    console.log('✓ Screenshot saved: 08-marketing-page.png');

    const bodyText = await page.textContent('body');
    console.log(`Page has content: ${bodyText && bodyText.trim().length > 0}`);
    console.log(`Body text length: ${bodyText?.length || 0} characters`);
  });
});
