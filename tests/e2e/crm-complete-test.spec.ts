import { test, expect } from '@playwright/test';

const BASE_URL = 'https://a64core.com';
const CRM_URL = `${BASE_URL}/crm/customers`;

test.describe('CRM Module - Complete Functional Tests', () => {
  let createdCustomerId: string | null = null;

  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"]', 'SuperAdmin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
  });

  test('1. Create New Customer - Full Flow', async ({ page }) => {
    console.log('=== Test 1: Create New Customer ===\n');

    // Listen for API responses
    let apiError: string | null = null;
    let apiResponse: any = null;

    page.on('response', async (response) => {
      if (response.url().includes('/api/v1/crm/customers')) {
        const status = response.status();
        console.log(`API Response: ${response.url()} - Status: ${status}`);
        if (status >= 400) {
          try {
            const body = await response.json();
            apiError = JSON.stringify(body);
            console.log('API Error:', apiError);
          } catch (e) {
            apiError = `Status ${status}`;
          }
        } else if (response.request().method() === 'POST') {
          try {
            apiResponse = await response.json();
            console.log('API Success Response:', JSON.stringify(apiResponse, null, 2));
          } catch (e) {}
        }
      }
    });

    // Navigate to CRM Customers
    await page.goto(CRM_URL);
    await page.waitForLoadState('networkidle');

    // Click "New Customer" button
    const newBtn = page.locator('button:has-text("New Customer")');
    await expect(newBtn).toBeVisible();
    console.log('Step 1: Found "New Customer" button');
    await newBtn.click();

    // Wait for the form page/modal to appear
    await page.waitForTimeout(1000);

    // Generate unique customer data
    const timestamp = Date.now();
    const testCustomer = {
      name: `E2E Test Customer ${timestamp}`,
      email: `e2etest${timestamp}@example.com`,
      phone: '+1-555-123-4567',
      company: `E2E Test Company ${timestamp}`
    };

    console.log('Step 2: Filling form with:', testCustomer);

    // Fill the form - using exact selectors based on placeholder
    await page.locator('input[placeholder="Enter customer name"]').fill(testCustomer.name);
    await page.locator('input[placeholder="email@example.com"]').fill(testCustomer.email);
    await page.locator('input[placeholder="+1 (555) 123-4567"]').fill(testCustomer.phone);
    await page.locator('input[placeholder="Company name"]').fill(testCustomer.company);

    console.log('Step 3: Form filled successfully');
    await page.screenshot({ path: 'test-results/crm-test1-form-filled.png', fullPage: true });

    // Click the Create Customer button
    const submitBtn = page.locator('button:has-text("Create Customer")');
    await expect(submitBtn).toBeVisible();
    console.log('Step 4: Clicking "Create Customer" button');
    await submitBtn.click();

    // Wait for navigation or response
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/crm-test1-after-submit.png', fullPage: true });

    // Check for errors
    if (apiError) {
      console.log('API Error occurred:', apiError);
    }

    // Verify the customer was created
    const currentUrl = page.url();
    console.log('Current URL after submit:', currentUrl);

    // Check if we're on a customer detail page (ID in URL)
    const urlMatch = currentUrl.match(/\/crm\/customers\/([^/]+)$/);
    if (urlMatch && urlMatch[1] !== 'new') {
      createdCustomerId = urlMatch[1];
      console.log('SUCCESS: Customer created with ID:', createdCustomerId);

      // Verify customer details on the page
      const pageContent = await page.locator('body').textContent();
      expect(pageContent).toContain(testCustomer.name);
      console.log('Verified customer name appears on page');
    } else {
      // Check for success message or customer in list
      const pageContent = await page.locator('body').textContent();
      console.log('Page content (first 500 chars):', pageContent?.substring(0, 500));

      // Check for error message
      const errorEl = page.locator('[class*="error"], [class*="Error"], .alert-error');
      if (await errorEl.isVisible().catch(() => false)) {
        const errorText = await errorEl.textContent();
        console.log('Error message found:', errorText);
      }
    }

    expect(apiError).toBeNull();
  });

  test('2. View Customer List', async ({ page }) => {
    console.log('=== Test 2: View Customer List ===\n');

    await page.goto(CRM_URL);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/crm-test2-customer-list.png', fullPage: true });

    const pageContent = await page.locator('body').textContent();
    console.log('Customer list page content (first 400 chars):', pageContent?.substring(0, 400));

    // Check for table or grid
    const hasTable = await page.locator('table, [class*="table"], [class*="grid"]').first().isVisible().catch(() => false);
    console.log('Has table/grid:', hasTable);

    // Check for "No customers" message or customer rows
    const hasNoCustomers = pageContent?.includes('No customers');
    const hasCustomerRows = await page.locator('tr, [data-testid*="customer"]').count();
    console.log('No customers message:', hasNoCustomers);
    console.log('Customer row count:', hasCustomerRows);

    expect(hasTable || hasNoCustomers).toBeTruthy();
  });

  test('3. Search Customers', async ({ page }) => {
    console.log('=== Test 3: Search Customers ===\n');

    await page.goto(CRM_URL);
    await page.waitForLoadState('networkidle');

    // Look for search input
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();
    const hasSearch = await searchInput.isVisible().catch(() => false);

    if (hasSearch) {
      console.log('Found search input');
      await searchInput.fill('test');
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'test-results/crm-test3-search.png', fullPage: true });

      const resultsCount = await page.locator('tr, [data-testid*="customer"]').count();
      console.log('Search results count:', resultsCount);
    } else {
      console.log('No search input found - checking page');
      await page.screenshot({ path: 'test-results/crm-test3-no-search.png', fullPage: true });
    }
  });

  test('4. Filter Customers by Type', async ({ page }) => {
    console.log('=== Test 4: Filter by Type ===\n');

    await page.goto(CRM_URL);
    await page.waitForLoadState('networkidle');

    // Look for type filter
    const typeFilter = page.locator('select, [data-testid*="type-filter"]').first();
    if (await typeFilter.isVisible().catch(() => false)) {
      console.log('Found type filter');

      // Select "Business"
      await typeFilter.selectOption({ label: 'Business' }).catch(async () => {
        // Try clicking if it's a custom dropdown
        await typeFilter.click();
        await page.locator('text=Business').first().click();
      });

      await page.waitForTimeout(500);
      await page.screenshot({ path: 'test-results/crm-test4-filter-type.png', fullPage: true });

      const urlParams = new URL(page.url()).searchParams;
      console.log('URL params after filter:', urlParams.toString());
    }
  });

  test('5. Filter Customers by Status', async ({ page }) => {
    console.log('=== Test 5: Filter by Status ===\n');

    await page.goto(CRM_URL);
    await page.waitForLoadState('networkidle');

    // Look for status filter
    const statusFilter = page.locator('select, button').filter({ hasText: /Active|Lead|Prospect/ }).first();
    if (await statusFilter.isVisible().catch(() => false)) {
      console.log('Found status filter');

      // Try to click Active
      await page.locator('text=Active').first().click().catch(() => {});
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'test-results/crm-test5-filter-status.png', fullPage: true });
    }
  });
});
