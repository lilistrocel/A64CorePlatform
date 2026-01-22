import { test, expect } from '@playwright/test';

test.describe('Dashboard Visual Verification - Production', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('https://a64core.com/login');

    // Login with admin credentials
    await page.fill('input[type="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"]', 'SuperAdmin123!');
    await page.click('button[type="submit"]');

    // Wait for navigation after login
    await page.waitForURL(/https:\/\/a64core\.com\/(?!login)/);
  });

  test('HR Dashboard - Visual Verification', async ({ page }) => {
    console.log('Navigating to HR Dashboard...');

    // Navigate to HR dashboard
    await page.goto('https://a64core.com/hr');

    // Wait for page to load (give it time to render)
    await page.waitForLoadState('networkidle');

    // Wait a bit more to ensure content renders
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({
      path: 'tests/e2e/screenshots/hr-dashboard-production.png',
      fullPage: true
    });

    // Verify loading message is NOT present
    const loadingMessage = page.locator('text=Loading dashboard...');
    await expect(loadingMessage).not.toBeVisible();

    // Check for error messages
    const errorMessages = page.locator('text=/error|Error|ERROR/i');
    const errorCount = await errorMessages.count();

    console.log(`HR Dashboard - Found ${errorCount} error messages`);

    // Log page content for debugging
    const bodyText = await page.textContent('body');
    console.log('HR Dashboard body text (first 500 chars):', bodyText?.substring(0, 500));

    // Check if actual dashboard content is visible
    const hasDashboardContent = await page.locator('[class*="dashboard"], [class*="card"], [class*="stat"]').count() > 0;
    console.log(`HR Dashboard - Has dashboard content elements: ${hasDashboardContent}`);
  });

  test('Sales Dashboard - Visual Verification', async ({ page }) => {
    console.log('Navigating to Sales Dashboard...');

    // Navigate to Sales dashboard
    await page.goto('https://a64core.com/sales');

    // Wait for page to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({
      path: 'tests/e2e/screenshots/sales-dashboard-production.png',
      fullPage: true
    });

    // Verify loading message is NOT present
    const loadingMessage = page.locator('text=Loading dashboard...');
    await expect(loadingMessage).not.toBeVisible();

    // Check for error messages
    const errorMessages = page.locator('text=/error|Error|ERROR/i');
    const errorCount = await errorMessages.count();

    console.log(`Sales Dashboard - Found ${errorCount} error messages`);

    // Log page content
    const bodyText = await page.textContent('body');
    console.log('Sales Dashboard body text (first 500 chars):', bodyText?.substring(0, 500));

    // Check if actual dashboard content is visible
    const hasDashboardContent = await page.locator('[class*="dashboard"], [class*="card"], [class*="stat"]').count() > 0;
    console.log(`Sales Dashboard - Has dashboard content elements: ${hasDashboardContent}`);
  });

  test('Logistics Dashboard - Visual Verification', async ({ page }) => {
    console.log('Navigating to Logistics Dashboard...');

    // Navigate to Logistics dashboard
    await page.goto('https://a64core.com/logistics');

    // Wait for page to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({
      path: 'tests/e2e/screenshots/logistics-dashboard-production.png',
      fullPage: true
    });

    // Verify loading message is NOT present
    const loadingMessage = page.locator('text=Loading dashboard...');
    await expect(loadingMessage).not.toBeVisible();

    // Check for error messages
    const errorMessages = page.locator('text=/error|Error|ERROR/i');
    const errorCount = await errorMessages.count();

    console.log(`Logistics Dashboard - Found ${errorCount} error messages`);

    // Log page content
    const bodyText = await page.textContent('body');
    console.log('Logistics Dashboard body text (first 500 chars):', bodyText?.substring(0, 500));

    // Check if actual dashboard content is visible
    const hasDashboardContent = await page.locator('[class*="dashboard"], [class*="card"], [class*="stat"]').count() > 0;
    console.log(`Logistics Dashboard - Has dashboard content elements: ${hasDashboardContent}`);
  });
});
