import { test, expect } from '@playwright/test';

const BASE_URL = 'https://a64core.com';
const HR_URL = `${BASE_URL}/hr/employees`;

test.describe('HR Module - Edit and Delete Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"]', 'SuperAdmin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
  });

  test('1. Edit Employee Details', async ({ page }) => {
    console.log('=== Test: Edit Employee Details ===\n');

    // Listen for API responses
    let updateApiCalled = false;
    let updateSuccess = false;

    page.on('response', async (response) => {
      if (response.url().includes('/api/v1/hr/employees/') && response.request().method() === 'PATCH') {
        updateApiCalled = true;
        updateSuccess = response.status() === 200;
        console.log(`Update API Response: ${response.status()}`);
      }
    });

    // Navigate to HR
    await page.goto(HR_URL);
    await page.waitForLoadState('networkidle');

    // Find the first employee row
    const employeeRow = page.locator('table tbody tr').first();
    const hasEmployees = await employeeRow.isVisible().catch(() => false);

    if (!hasEmployees) {
      console.log('No employees found - creating one first');
      await page.locator('button:has-text("New Employee")').click();
      await page.waitForTimeout(500);
      const timestamp = Date.now();
      const today = new Date().toISOString().split('T')[0];
      await page.locator('input[placeholder="Enter first name"]').fill('Edit');
      await page.locator('input[placeholder="Enter last name"]').fill(`Test${timestamp}`);
      await page.locator('input[placeholder="email@example.com"]').fill(`edit${timestamp}@test.com`);
      await page.locator('input[placeholder="Engineering, Sales, etc."]').fill('Engineering');
      await page.locator('input[placeholder="Software Engineer, Manager, etc."]').fill('Developer');
      await page.locator('input[type="date"]').fill(today);
      await page.locator('button:has-text("Create Employee")').click();
      await page.waitForTimeout(2000);
      // Navigate back to list
      await page.goto(HR_URL);
      await page.waitForLoadState('networkidle');
    }

    await page.screenshot({ path: 'test-results/hr-edit-1-list.png', fullPage: true });

    // Click View button to go to detail page first
    const viewBtn = page.locator('table tbody tr').first().locator('button:has-text("View")');
    const hasViewBtn = await viewBtn.isVisible().catch(() => false);

    if (hasViewBtn) {
      console.log('Found View button - clicking to go to detail page');
      await viewBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'test-results/hr-edit-2-detail.png', fullPage: true });

      // Now click Edit button on detail page
      const editBtn = page.locator('button:has-text("Edit")');
      const hasEditBtn = await editBtn.isVisible().catch(() => false);

      if (hasEditBtn) {
        console.log('Found Edit button - clicking');
        await editBtn.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'test-results/hr-edit-3-edit-form.png', fullPage: true });

        // We should be in edit mode now - find the first name field
        const firstNameInput = page.locator('input[placeholder="Enter first name"]');
        const hasFirstNameInput = await firstNameInput.isVisible().catch(() => false);

        if (hasFirstNameInput) {
          const originalName = await firstNameInput.inputValue();
          const newName = `${originalName}Edited`;

          await firstNameInput.clear();
          await firstNameInput.fill(newName);
          console.log(`Changed first name from "${originalName}" to "${newName}"`);

          await page.screenshot({ path: 'test-results/hr-edit-4-modified.png', fullPage: true });

          // Save changes
          const saveBtn = page.locator('button:has-text("Update Employee")');
          if (await saveBtn.isVisible().catch(() => false)) {
            await saveBtn.click();
            await page.waitForTimeout(2000);
            await page.screenshot({ path: 'test-results/hr-edit-5-saved.png', fullPage: true });

            // Verify the change
            const pageContent = await page.locator('body').textContent();
            const nameUpdated = pageContent?.includes(newName);
            console.log('Name updated on page:', nameUpdated);

            expect(updateApiCalled).toBeTruthy();
            expect(updateSuccess).toBeTruthy();
          }
        }
      }
    } else {
      console.log('View button not found - trying Edit button in row');
      const editBtnInRow = page.locator('table tbody tr').first().locator('button:has-text("Edit")');
      if (await editBtnInRow.isVisible().catch(() => false)) {
        await editBtnInRow.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'test-results/hr-edit-via-row.png', fullPage: true });
      }
    }
  });

  test('2. Delete Employee', async ({ page }) => {
    console.log('=== Test: Delete Employee ===\n');

    // First, create an employee to delete
    console.log('Step 1: Creating an employee to delete...');
    await page.goto(HR_URL);
    await page.waitForLoadState('networkidle');

    // Create an employee
    await page.locator('button:has-text("New Employee")').click();
    await page.waitForTimeout(500);

    const timestamp = Date.now();
    const today = new Date().toISOString().split('T')[0];
    const employeeName = `Delete Test ${timestamp}`;
    await page.locator('input[placeholder="Enter first name"]').fill('Delete');
    await page.locator('input[placeholder="Enter last name"]').fill(`Test${timestamp}`);
    await page.locator('input[placeholder="email@example.com"]').fill(`delete${timestamp}@test.com`);
    await page.locator('input[placeholder="Engineering, Sales, etc."]').fill('Engineering');
    await page.locator('input[placeholder="Software Engineer, Manager, etc."]').fill('Developer');
    await page.locator('input[type="date"]').fill(today);
    await page.locator('button:has-text("Create Employee")').click();
    await page.waitForTimeout(2000);

    console.log(`Created employee: ${employeeName}`);
    await page.screenshot({ path: 'test-results/hr-delete-1-created.png', fullPage: true });

    // Now we should be on the employee detail page
    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);

    // Look for delete button
    const deleteBtn = page.locator('button:has-text("Delete")');
    const hasDeleteBtn = await deleteBtn.isVisible().catch(() => false);

    if (hasDeleteBtn) {
      console.log('Step 2: Found Delete button');

      // Set up dialog handler for confirmation
      page.on('dialog', async (dialog) => {
        console.log(`Dialog appeared: ${dialog.message()}`);
        await dialog.accept();
      });

      // Listen for delete API call
      let deleteSuccess = false;
      page.on('response', async (response) => {
        if (response.request().method() === 'DELETE' && response.url().includes('/api/v1/hr/employees/')) {
          deleteSuccess = response.status() === 200;
          console.log(`Delete API Response: ${response.status()}`);
        }
      });

      await deleteBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'test-results/hr-delete-2-after-delete.png', fullPage: true });

      // Should redirect to employee list
      const urlAfterDelete = page.url();
      console.log('URL after delete:', urlAfterDelete);

      // Verify the employee is no longer in the list
      const pageContent = await page.locator('body').textContent();
      const employeeStillExists = pageContent?.includes(employeeName);
      console.log('Employee still in list:', employeeStillExists);

      expect(employeeStillExists).toBeFalsy();
    } else {
      console.log('Delete button not found');
      await page.screenshot({ path: 'test-results/hr-delete-no-button.png', fullPage: true });
    }
  });

  test('3. View Employee Tabs', async ({ page }) => {
    console.log('=== Test: View Employee Tabs ===\n');

    await page.goto(HR_URL);
    await page.waitForLoadState('networkidle');

    // Find first employee row
    const employeeRow = page.locator('table tbody tr').first();
    const hasEmployees = await employeeRow.isVisible().catch(() => false);

    if (hasEmployees) {
      // Get employee name
      const employeeName = await employeeRow.locator('td').first().textContent();
      console.log('Testing tabs for employee:', employeeName);

      // Click View button
      const viewBtn = employeeRow.locator('button:has-text("View")');
      await expect(viewBtn).toBeVisible();
      await viewBtn.click();
      await page.waitForTimeout(1000);

      // Test each tab
      const tabs = ['Overview', 'Contracts', 'Visas', 'Insurance', 'Performance'];

      for (const tabName of tabs) {
        const tab = page.locator(`button:has-text("${tabName}")`);
        if (await tab.isVisible().catch(() => false)) {
          console.log(`Clicking ${tabName} tab`);
          await tab.click();
          await page.waitForTimeout(500);
          await page.screenshot({ path: `test-results/hr-tab-${tabName.toLowerCase()}.png`, fullPage: true });

          // Verify tab content loaded (no error displayed)
          const errorContainer = page.locator('[class*="error" i], [class*="Error"]');
          const hasError = await errorContainer.isVisible().catch(() => false);
          console.log(`${tabName} tab - has error:`, hasError);
          expect(hasError).toBeFalsy();
        }
      }
    } else {
      console.log('No employees found');
    }
  });
});
