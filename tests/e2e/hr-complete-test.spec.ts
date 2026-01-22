import { test, expect } from '@playwright/test';

const BASE_URL = 'https://a64core.com';
const HR_URL = `${BASE_URL}/hr/employees`;

test.describe('HR Module - Complete Functional Tests', () => {
  let createdEmployeeId: string | null = null;

  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"]', 'SuperAdmin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
  });

  test('1. View Employee List', async ({ page }) => {
    console.log('=== Test 1: View Employee List ===\n');

    // Navigate to HR
    await page.goto(HR_URL);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/hr-test1-employee-list.png', fullPage: true });

    // Check page loaded
    const pageContent = await page.locator('body').textContent();
    console.log('HR Page content (first 400 chars):', pageContent?.substring(0, 400));

    // Verify page elements
    const hasTitle = pageContent?.includes('Employee Management');
    const hasNewBtn = await page.locator('button:has-text("New Employee")').isVisible().catch(() => false);
    const hasSearchInput = await page.locator('input[placeholder="Search employees..."]').isVisible().catch(() => false);

    console.log('Has "Employee Management" title:', hasTitle);
    console.log('Has "New Employee" button:', hasNewBtn);
    console.log('Has search input:', hasSearchInput);

    expect(hasTitle).toBeTruthy();
    expect(hasNewBtn).toBeTruthy();
  });

  test('2. Create New Employee', async ({ page }) => {
    console.log('=== Test 2: Create New Employee ===\n');

    // Listen for API responses
    let apiError: string | null = null;
    let apiResponse: any = null;

    page.on('response', async (response) => {
      if (response.url().includes('/api/v1/hr/employees')) {
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

    // Navigate to HR
    await page.goto(HR_URL);
    await page.waitForLoadState('networkidle');

    // Click "New Employee" button
    const newBtn = page.locator('button:has-text("New Employee")');
    await expect(newBtn).toBeVisible();
    console.log('Step 1: Clicking "New Employee" button');
    await newBtn.click();

    // Wait for the form to load
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/hr-test2-new-form.png', fullPage: true });

    // Generate unique employee data
    const timestamp = Date.now();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const testEmployee = {
      firstName: `E2E`,
      lastName: `Test${timestamp}`,
      email: `e2etest${timestamp}@example.com`,
      phone: '+1-555-123-4567',
      department: 'Engineering',
      position: 'Software Engineer',
      hireDate: today
    };

    console.log('Step 2: Filling form with:', testEmployee);

    // Fill the form (all required fields)
    await page.locator('input[placeholder="Enter first name"]').fill(testEmployee.firstName);
    await page.locator('input[placeholder="Enter last name"]').fill(testEmployee.lastName);
    await page.locator('input[placeholder="email@example.com"]').fill(testEmployee.email);
    await page.locator('input[placeholder="+1 (555) 123-4567"]').first().fill(testEmployee.phone);
    await page.locator('input[placeholder="Engineering, Sales, etc."]').fill(testEmployee.department);
    await page.locator('input[placeholder="Software Engineer, Manager, etc."]').fill(testEmployee.position);
    await page.locator('input[type="date"]').fill(testEmployee.hireDate);

    console.log('Step 3: Form filled successfully');
    await page.screenshot({ path: 'test-results/hr-test2-form-filled.png', fullPage: true });

    // Click the Create Employee button
    const submitBtn = page.locator('button:has-text("Create Employee")');
    await expect(submitBtn).toBeVisible();
    console.log('Step 4: Clicking "Create Employee" button');
    await submitBtn.click();

    // Wait for navigation or response
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/hr-test2-after-submit.png', fullPage: true });

    // Check for errors
    if (apiError) {
      console.log('API Error occurred:', apiError);
    }

    // Verify the employee was created
    const currentUrl = page.url();
    console.log('Current URL after submit:', currentUrl);

    // Check if we're on an employee detail page (ID in URL)
    const urlMatch = currentUrl.match(/\/hr\/employees\/([^/]+)$/);
    if (urlMatch && urlMatch[1] !== 'new') {
      createdEmployeeId = urlMatch[1];
      console.log('SUCCESS: Employee created with ID:', createdEmployeeId);

      // Verify employee details on the page
      const pageContent = await page.locator('body').textContent();
      expect(pageContent).toContain(testEmployee.firstName);
      expect(pageContent).toContain(testEmployee.lastName);
      console.log('Verified employee name appears on page');
    }

    expect(apiError).toBeNull();
  });

  test('3. View Employee Details', async ({ page }) => {
    console.log('=== Test 3: View Employee Details ===\n');

    await page.goto(HR_URL);
    await page.waitForLoadState('networkidle');

    // Find first employee row
    const employeeRow = page.locator('table tbody tr').first();
    const hasEmployees = await employeeRow.isVisible().catch(() => false);

    if (hasEmployees) {
      // Get employee name before clicking
      const employeeName = await employeeRow.locator('td').first().textContent();
      console.log('Viewing employee:', employeeName);

      // Click View button in the row
      const viewBtn = employeeRow.locator('button:has-text("View")');
      await expect(viewBtn).toBeVisible();
      await viewBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'test-results/hr-test3-detail.png', fullPage: true });

      // Verify we're on the employee detail page
      const currentUrl = page.url();
      console.log('Current URL:', currentUrl);
      expect(currentUrl).toContain('/hr/employees/');
      expect(currentUrl).not.toContain('/new');

      // Check for tabs
      const hasOverviewTab = await page.locator('button:has-text("Overview")').isVisible().catch(() => false);
      const hasContractsTab = await page.locator('button:has-text("Contracts")').isVisible().catch(() => false);
      const hasVisasTab = await page.locator('button:has-text("Visas")').isVisible().catch(() => false);
      const hasInsuranceTab = await page.locator('button:has-text("Insurance")').isVisible().catch(() => false);
      const hasPerformanceTab = await page.locator('button:has-text("Performance")').isVisible().catch(() => false);

      console.log('Has Overview tab:', hasOverviewTab);
      console.log('Has Contracts tab:', hasContractsTab);
      console.log('Has Visas tab:', hasVisasTab);
      console.log('Has Insurance tab:', hasInsuranceTab);
      console.log('Has Performance tab:', hasPerformanceTab);

      expect(hasOverviewTab).toBeTruthy();
      expect(hasContractsTab).toBeTruthy();
    } else {
      console.log('No employees found');
    }
  });

  test('4. Search Employees', async ({ page }) => {
    console.log('=== Test 4: Search Employees ===\n');

    await page.goto(HR_URL);
    await page.waitForLoadState('networkidle');

    // Look for search input
    const searchInput = page.locator('input[placeholder="Search employees..."]');
    const hasSearch = await searchInput.isVisible().catch(() => false);

    if (hasSearch) {
      console.log('Found search input');
      await searchInput.fill('test');
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'test-results/hr-test4-search.png', fullPage: true });

      const resultsCount = await page.locator('table tbody tr').count();
      console.log('Search results count:', resultsCount);
    } else {
      console.log('No search input found');
    }
  });

  test('5. Filter Employees by Status', async ({ page }) => {
    console.log('=== Test 5: Filter by Status ===\n');

    await page.goto(HR_URL);
    await page.waitForLoadState('networkidle');

    // Look for status filter buttons
    const activeFilter = page.locator('button:has-text("Active")').first();
    if (await activeFilter.isVisible().catch(() => false)) {
      console.log('Found Active filter button');
      await activeFilter.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'test-results/hr-test5-filter-active.png', fullPage: true });

      const resultsCount = await page.locator('table tbody tr').count();
      console.log('Filtered results count:', resultsCount);
    }

    // Try On Leave filter
    const onLeaveFilter = page.locator('button:has-text("On Leave")');
    if (await onLeaveFilter.isVisible().catch(() => false)) {
      console.log('Found On Leave filter button');
      await onLeaveFilter.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'test-results/hr-test5-filter-onleave.png', fullPage: true });
    }
  });

  test('6. Toggle View Mode (Table/Grid)', async ({ page }) => {
    console.log('=== Test 6: Toggle View Mode ===\n');

    await page.goto(HR_URL);
    await page.waitForLoadState('networkidle');

    // Look for Grid view toggle
    const gridBtn = page.locator('button:has-text("Grid")');
    if (await gridBtn.isVisible().catch(() => false)) {
      console.log('Found Grid view button');
      await gridBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'test-results/hr-test6-grid-view.png', fullPage: true });

      // Verify grid layout appeared
      const hasGrid = await page.locator('[class*="grid"], [class*="Grid"]').isVisible().catch(() => false);
      console.log('Grid view visible:', hasGrid);

      // Switch back to Table
      const tableBtn = page.locator('button:has-text("Table")');
      if (await tableBtn.isVisible().catch(() => false)) {
        await tableBtn.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: 'test-results/hr-test6-table-view.png', fullPage: true });
      }
    }
  });
});
