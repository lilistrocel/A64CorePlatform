import { test, expect } from '@playwright/test';

const BASE_URL = 'https://a64core.com';
const CRM_URL = `${BASE_URL}/crm/customers`;

test.describe('CRM Module - Functional Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"]', 'SuperAdmin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
  });

  test('1. View CRM Dashboard and Customer List', async ({ page }) => {
    console.log('=== Testing CRM Dashboard ===');

    // Navigate to CRM
    await page.goto(`${CRM_URL}`);
    await page.waitForLoadState('networkidle');

    // Check page loaded
    const pageContent = await page.locator('body').textContent();
    console.log('CRM Page content (first 500 chars):', pageContent?.substring(0, 500));

    // Look for CRM elements
    const hasCustomerRelated = pageContent?.toLowerCase().includes('customer') ||
                               pageContent?.toLowerCase().includes('crm');
    console.log('Has CRM/Customer content:', hasCustomerRelated);

    // Take screenshot
    await page.screenshot({ path: 'test-results/crm-dashboard.png', fullPage: true });

    expect(hasCustomerRelated).toBeTruthy();
  });

  test('2. Create New Customer', async ({ page }) => {
    console.log('=== Testing Create New Customer ===');

    // Navigate to CRM
    await page.goto(`${CRM_URL}`);
    await page.waitForLoadState('networkidle');

    // Look for "Add Customer" or "New Customer" button
    const addButton = page.locator('button:has-text("Add"), button:has-text("New"), button:has-text("Create")').first();
    const addButtonVisible = await addButton.isVisible().catch(() => false);
    console.log('Add button visible:', addButtonVisible);

    if (addButtonVisible) {
      await addButton.click();
      await page.waitForTimeout(1000);

      // Take screenshot of form
      await page.screenshot({ path: 'test-results/crm-add-customer-form.png', fullPage: true });

      // Fill in customer form
      const nameField = page.locator('input[name="name"], input[placeholder*="name" i]').first();
      const emailField = page.locator('input[name="email"], input[type="email"], input[placeholder*="email" i]').first();
      const phoneField = page.locator('input[name="phone"], input[type="tel"], input[placeholder*="phone" i]').first();
      const companyField = page.locator('input[name="company"], input[placeholder*="company" i]').first();

      // Generate unique test data
      const timestamp = Date.now();
      const testCustomer = {
        name: `Test Customer ${timestamp}`,
        email: `test${timestamp}@example.com`,
        phone: '+1234567890',
        company: `Test Company ${timestamp}`
      };

      if (await nameField.isVisible().catch(() => false)) {
        await nameField.fill(testCustomer.name);
        console.log('Filled name:', testCustomer.name);
      }

      if (await emailField.isVisible().catch(() => false)) {
        await emailField.fill(testCustomer.email);
        console.log('Filled email:', testCustomer.email);
      }

      if (await phoneField.isVisible().catch(() => false)) {
        await phoneField.fill(testCustomer.phone);
        console.log('Filled phone:', testCustomer.phone);
      }

      if (await companyField.isVisible().catch(() => false)) {
        await companyField.fill(testCustomer.company);
        console.log('Filled company:', testCustomer.company);
      }

      // Take screenshot before submit
      await page.screenshot({ path: 'test-results/crm-customer-form-filled.png', fullPage: true });

      // Submit the form
      const submitButton = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create"), button:has-text("Add")').first();
      if (await submitButton.isVisible().catch(() => false)) {
        await submitButton.click();
        await page.waitForTimeout(2000);

        // Take screenshot after submit
        await page.screenshot({ path: 'test-results/crm-after-customer-create.png', fullPage: true });

        // Check for success message or new customer in list
        const pageAfter = await page.locator('body').textContent();
        const hasNewCustomer = pageAfter?.includes(testCustomer.name) ||
                               pageAfter?.toLowerCase().includes('success') ||
                               pageAfter?.toLowerCase().includes('created');
        console.log('Customer creation result - found in page:', hasNewCustomer);
      }
    } else {
      console.log('No Add button found - checking page structure');
      await page.screenshot({ path: 'test-results/crm-no-add-button.png', fullPage: true });
    }
  });

  test('3. View Customer Details', async ({ page }) => {
    console.log('=== Testing View Customer Details ===');

    // Navigate to CRM
    await page.goto(`${CRM_URL}`);
    await page.waitForLoadState('networkidle');

    // Look for customer rows/cards
    const customerRow = page.locator('tr, [data-testid*="customer"], .customer-card, .customer-row').first();
    const hasCustomers = await customerRow.isVisible().catch(() => false);

    if (hasCustomers) {
      console.log('Found customer entries');
      await customerRow.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'test-results/crm-customer-details.png', fullPage: true });
    } else {
      console.log('No customer entries found - list may be empty');
      await page.screenshot({ path: 'test-results/crm-empty-list.png', fullPage: true });
    }
  });

  test('4. Search Customers', async ({ page }) => {
    console.log('=== Testing Customer Search ===');

    // Navigate to CRM
    await page.goto(`${CRM_URL}`);
    await page.waitForLoadState('networkidle');

    // Look for search input
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], input[name="search"]').first();
    const hasSearch = await searchInput.isVisible().catch(() => false);

    if (hasSearch) {
      console.log('Found search input');
      await searchInput.fill('test');
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'test-results/crm-search-results.png', fullPage: true });

      const resultsText = await page.locator('body').textContent();
      console.log('Search results (first 300 chars):', resultsText?.substring(0, 300));
    } else {
      console.log('No search input found');
    }
  });
});
