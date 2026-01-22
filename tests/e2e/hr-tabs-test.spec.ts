import { test, expect } from '@playwright/test';

const BASE_URL = 'https://a64core.com';
const HR_URL = `${BASE_URL}/hr/employees`;

test.describe('HR Module - Tabs Functionality Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"]', 'SuperAdmin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
  });

  test('1. Contracts Tab - Add Contract', async ({ page }) => {
    console.log('=== Test: Add Contract ===\n');

    // Navigate to HR and view an employee
    await page.goto(HR_URL);
    await page.waitForLoadState('networkidle');

    // Click View on first employee
    const viewBtn = page.locator('table tbody tr').first().locator('button:has-text("View")');
    await expect(viewBtn).toBeVisible();
    await viewBtn.click();
    await page.waitForTimeout(1000);

    // Click Contracts tab
    const contractsTab = page.locator('button:has-text("Contracts")');
    await expect(contractsTab).toBeVisible();
    await contractsTab.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/hr-contracts-tab.png', fullPage: true });

    // Check for Add Contract button
    const addBtn = page.locator('button:has-text("Add Contract")');
    const hasAddBtn = await addBtn.isVisible().catch(() => false);
    console.log('Has Add Contract button:', hasAddBtn);

    if (hasAddBtn) {
      // Click Add Contract
      await addBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'test-results/hr-contracts-modal.png', fullPage: true });

      // Check modal appeared
      const modal = page.locator('text=Add Contract').first();
      const modalVisible = await modal.isVisible().catch(() => false);
      console.log('Contract modal visible:', modalVisible);

      if (modalVisible) {
        // Fill the form
        const today = new Date().toISOString().split('T')[0];
        const endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        await page.locator('select').first().selectOption('full_time');
        await page.locator('input[type="date"]').first().fill(today);
        await page.locator('input[type="date"]').nth(1).fill(endDate);
        await page.locator('input[type="number"]').fill('50000');

        console.log('Form filled, clicking Create');
        await page.screenshot({ path: 'test-results/hr-contracts-filled.png', fullPage: true });

        // Listen for API response
        let apiSuccess = false;
        page.on('response', async (response) => {
          if (response.url().includes('/api/v1/hr/employees/') &&
              response.url().includes('/contracts') &&
              response.request().method() === 'POST') {
            apiSuccess = response.status() === 201;
            console.log('Contract API Response:', response.status());
          }
        });

        // Click Create
        const createBtn = page.locator('button:has-text("Create")');
        await createBtn.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'test-results/hr-contracts-created.png', fullPage: true });

        // Check if contract appeared in list
        const pageContent = await page.locator('body').textContent();
        const hasContract = pageContent?.includes('Full Time') || pageContent?.includes('50,000');
        console.log('Contract created and visible:', hasContract);
      }
    }

    expect(hasAddBtn).toBeTruthy();
  });

  test('2. Visas Tab - Add Visa', async ({ page }) => {
    console.log('=== Test: Add Visa ===\n');

    // Navigate to HR and view an employee
    await page.goto(HR_URL);
    await page.waitForLoadState('networkidle');

    // Click View on first employee
    const viewBtn = page.locator('table tbody tr').first().locator('button:has-text("View")');
    await expect(viewBtn).toBeVisible();
    await viewBtn.click();
    await page.waitForTimeout(1000);

    // Click Visas tab
    const visasTab = page.locator('button:has-text("Visas")');
    await expect(visasTab).toBeVisible();
    await visasTab.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/hr-visas-tab.png', fullPage: true });

    // Check for Add Visa button
    const addBtn = page.locator('button:has-text("Add Visa")');
    const hasAddBtn = await addBtn.isVisible().catch(() => false);
    console.log('Has Add Visa button:', hasAddBtn);

    if (hasAddBtn) {
      // Click Add Visa
      await addBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'test-results/hr-visas-modal.png', fullPage: true });

      // Check modal appeared
      const modal = page.locator('text=Add Visa').first();
      const modalVisible = await modal.isVisible().catch(() => false);
      console.log('Visa modal visible:', modalVisible);

      if (modalVisible) {
        // Fill the form
        const today = new Date().toISOString().split('T')[0];
        const expiryDate = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        await page.locator('input[placeholder*="Work Visa"]').fill('Work Visa');
        await page.locator('input[placeholder*="USA"]').fill('United States');
        await page.locator('input[type="date"]').first().fill(today);
        await page.locator('input[type="date"]').nth(1).fill(expiryDate);

        console.log('Form filled, clicking Create');
        await page.screenshot({ path: 'test-results/hr-visas-filled.png', fullPage: true });

        // Listen for API response
        let apiSuccess = false;
        page.on('response', async (response) => {
          if (response.url().includes('/api/v1/hr/employees/') &&
              response.url().includes('/visas') &&
              response.request().method() === 'POST') {
            apiSuccess = response.status() === 201;
            console.log('Visa API Response:', response.status());
          }
        });

        // Click Create
        const createBtn = page.locator('button:has-text("Create")');
        await createBtn.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'test-results/hr-visas-created.png', fullPage: true });

        // Check if visa appeared in list
        const pageContent = await page.locator('body').textContent();
        const hasVisa = pageContent?.includes('Work Visa') || pageContent?.includes('United States');
        console.log('Visa created and visible:', hasVisa);
      }
    }

    expect(hasAddBtn).toBeTruthy();
  });

  test('3. Insurance Tab - Add Insurance', async ({ page }) => {
    console.log('=== Test: Add Insurance ===\n');

    // Navigate to HR and view an employee
    await page.goto(HR_URL);
    await page.waitForLoadState('networkidle');

    // Click View on first employee
    const viewBtn = page.locator('table tbody tr').first().locator('button:has-text("View")');
    await expect(viewBtn).toBeVisible();
    await viewBtn.click();
    await page.waitForTimeout(1000);

    // Click Insurance tab
    const insuranceTab = page.locator('button:has-text("Insurance")');
    await expect(insuranceTab).toBeVisible();
    await insuranceTab.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/hr-insurance-tab.png', fullPage: true });

    // Check for Add Insurance button
    const addBtn = page.locator('button:has-text("Add Insurance")');
    const hasAddBtn = await addBtn.isVisible().catch(() => false);
    console.log('Has Add Insurance button:', hasAddBtn);

    if (hasAddBtn) {
      // Click Add Insurance
      await addBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'test-results/hr-insurance-modal.png', fullPage: true });

      // Check modal appeared
      const modal = page.locator('text=Add Insurance').first();
      const modalVisible = await modal.isVisible().catch(() => false);
      console.log('Insurance modal visible:', modalVisible);

      if (modalVisible) {
        // Fill the form
        const today = new Date().toISOString().split('T')[0];
        const endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Find and fill form fields
        const inputs = await page.locator('input[type="text"]').all();
        if (inputs.length >= 2) {
          await inputs[0].fill('Blue Cross Blue Shield');  // Provider
          await inputs[1].fill('POL-123456');  // Policy Number
        }

        // Fill number inputs
        const numberInputs = await page.locator('input[type="number"]').all();
        if (numberInputs.length >= 2) {
          await numberInputs[0].fill('100000');  // Coverage
          await numberInputs[1].fill('500');  // Monthly Cost
        }

        // Fill dates
        const dateInputs = await page.locator('input[type="date"]').all();
        if (dateInputs.length >= 2) {
          await dateInputs[0].fill(today);
          await dateInputs[1].fill(endDate);
        }

        console.log('Form filled, clicking Create');
        await page.screenshot({ path: 'test-results/hr-insurance-filled.png', fullPage: true });

        // Listen for API response
        page.on('response', async (response) => {
          if (response.url().includes('/api/v1/hr/employees/') &&
              response.url().includes('/insurance') &&
              response.request().method() === 'POST') {
            console.log('Insurance API Response:', response.status());
          }
        });

        // Click Create
        const createBtn = page.locator('button:has-text("Create")');
        await createBtn.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'test-results/hr-insurance-created.png', fullPage: true });

        // Check if insurance appeared in list
        const pageContent = await page.locator('body').textContent();
        const hasInsurance = pageContent?.includes('Blue Cross') || pageContent?.includes('POL-123456');
        console.log('Insurance created and visible:', hasInsurance);
      }
    }

    expect(hasAddBtn).toBeTruthy();
  });

  test('4. Performance Tab - Add Performance Review', async ({ page }) => {
    console.log('=== Test: Add Performance Review ===\n');

    // Navigate to HR and view an employee
    await page.goto(HR_URL);
    await page.waitForLoadState('networkidle');

    // Click View on first employee
    const viewBtn = page.locator('table tbody tr').first().locator('button:has-text("View")');
    await expect(viewBtn).toBeVisible();
    await viewBtn.click();
    await page.waitForTimeout(1000);

    // Click Performance tab
    const performanceTab = page.locator('button:has-text("Performance")');
    await expect(performanceTab).toBeVisible();
    await performanceTab.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/hr-performance-tab.png', fullPage: true });

    // Check for Add Review button
    const addBtn = page.locator('button:has-text("Add Review"), button:has-text("Add Performance")');
    const hasAddBtn = await addBtn.isVisible().catch(() => false);
    console.log('Has Add Review button:', hasAddBtn);

    if (hasAddBtn) {
      // Click Add Review
      await addBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'test-results/hr-performance-modal.png', fullPage: true });

      // Check modal appeared
      const modal = page.locator('text=Add Review, text=Add Performance').first();
      const modalVisible = await modal.isVisible().catch(() => false);
      console.log('Performance modal visible:', modalVisible);

      if (modalVisible) {
        // Fill the form
        const today = new Date().toISOString().split('T')[0];

        // Fill date
        const dateInput = page.locator('input[type="date"]').first();
        if (await dateInput.isVisible().catch(() => false)) {
          await dateInput.fill(today);
        }

        // Fill number inputs (rating, happiness score)
        const numberInputs = await page.locator('input[type="number"]').all();
        for (let i = 0; i < numberInputs.length && i < 2; i++) {
          await numberInputs[i].fill(i === 0 ? '4' : '8');  // Rating: 4, Happiness: 8
        }

        // Fill text areas or inputs
        const textInputs = await page.locator('input[type="text"], textarea').all();
        for (const input of textInputs) {
          const placeholder = await input.getAttribute('placeholder');
          if (placeholder?.toLowerCase().includes('strength')) {
            await input.fill('Great communication, Technical skills');
          } else if (placeholder?.toLowerCase().includes('improvement')) {
            await input.fill('Time management');
          } else if (placeholder?.toLowerCase().includes('goal')) {
            await input.fill('Complete certification');
          }
        }

        console.log('Form filled, clicking Create');
        await page.screenshot({ path: 'test-results/hr-performance-filled.png', fullPage: true });

        // Listen for API response
        page.on('response', async (response) => {
          if (response.url().includes('/api/v1/hr/employees/') &&
              response.url().includes('/performance') &&
              response.request().method() === 'POST') {
            console.log('Performance API Response:', response.status());
          }
        });

        // Click Create
        const createBtn = page.locator('button:has-text("Create")');
        await createBtn.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'test-results/hr-performance-created.png', fullPage: true });
      }
    }

    // Log what we found
    const pageContent = await page.locator('body').textContent();
    console.log('Performance tab content (first 500 chars):', pageContent?.substring(0, 500));
  });

  test('5. Full Tab Navigation Test', async ({ page }) => {
    console.log('=== Test: Tab Navigation ===\n');

    // Navigate to HR and view an employee
    await page.goto(HR_URL);
    await page.waitForLoadState('networkidle');

    // Click View on first employee
    const viewBtn = page.locator('table tbody tr').first().locator('button:has-text("View")');
    await expect(viewBtn).toBeVisible();
    await viewBtn.click();
    await page.waitForTimeout(1000);

    // Test all tabs
    const tabs = ['Overview', 'Contracts', 'Visas', 'Insurance', 'Performance'];

    for (const tabName of tabs) {
      console.log(`Testing ${tabName} tab...`);
      const tab = page.locator(`button:has-text("${tabName}")`);

      if (await tab.isVisible().catch(() => false)) {
        await tab.click();
        await page.waitForTimeout(500);

        // Check for errors
        const pageContent = await page.locator('body').textContent();
        const hasError = pageContent?.toLowerCase().includes('error') &&
                        !pageContent?.toLowerCase().includes('no ');  // Exclude "no contracts" etc

        // Check for loading state
        const isLoading = pageContent?.includes('Loading');

        // Check for content
        const hasContent = pageContent?.includes('Add') ||
                          pageContent?.includes('No ') ||
                          (tabName === 'Overview' && pageContent?.includes('Contact'));

        console.log(`  ${tabName}: loaded=${!isLoading}, hasContent=${hasContent}, hasError=${hasError}`);

        await page.screenshot({ path: `test-results/hr-nav-${tabName.toLowerCase()}.png`, fullPage: true });

        expect(hasError).toBeFalsy();
      } else {
        console.log(`  ${tabName} tab not found!`);
      }
    }
  });
});
