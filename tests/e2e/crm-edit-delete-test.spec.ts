import { test, expect } from '@playwright/test';

const BASE_URL = 'https://a64core.com';
const CRM_URL = `${BASE_URL}/crm/customers`;

test.describe('CRM Module - Edit and Delete Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"]', 'SuperAdmin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
  });

  test('1. Edit Customer Details', async ({ page }) => {
    console.log('=== Test: Edit Customer Details ===\n');

    // Listen for API responses
    let updateApiCalled = false;
    let updateSuccess = false;

    page.on('response', async (response) => {
      if (response.url().includes('/api/v1/crm/customers/') && response.request().method() === 'PATCH') {
        updateApiCalled = true;
        updateSuccess = response.status() === 200;
        console.log(`Update API Response: ${response.status()}`);
      }
    });

    // Navigate to CRM
    await page.goto(CRM_URL);
    await page.waitForLoadState('networkidle');

    // Find the first customer row
    const customerRow = page.locator('table tbody tr').first();
    const hasCustomers = await customerRow.isVisible().catch(() => false);

    if (!hasCustomers) {
      console.log('No customers found - creating one first');
      await page.locator('button:has-text("New Customer")').click();
      await page.waitForTimeout(500);
      const timestamp = Date.now();
      await page.locator('input[placeholder="Enter customer name"]').fill(`Edit Test ${timestamp}`);
      await page.locator('input[placeholder="email@example.com"]').fill(`edit${timestamp}@test.com`);
      await page.locator('button:has-text("Create Customer")').click();
      await page.waitForTimeout(2000);
      // Navigate back to list
      await page.goto(CRM_URL);
      await page.waitForLoadState('networkidle');
    }

    await page.screenshot({ path: 'test-results/crm-edit-1-list.png', fullPage: true });

    // Click Edit button in the first row (table has View, Edit, Delete buttons)
    const editBtnInRow = page.locator('table tbody tr').first().locator('button:has-text("Edit")');
    const hasEditBtn = await editBtnInRow.isVisible().catch(() => false);

    if (hasEditBtn) {
      console.log('Found Edit button in row - clicking');
      await editBtnInRow.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'test-results/crm-edit-2-edit-page.png', fullPage: true });

      // We should be on the customer detail page in edit mode
      const nameInput = page.locator('input[placeholder="Enter customer name"]');
      const hasNameInput = await nameInput.isVisible().catch(() => false);

      if (hasNameInput) {
        const originalName = await nameInput.inputValue();
        const newName = `${originalName} (Edited ${Date.now()})`;

        await nameInput.clear();
        await nameInput.fill(newName);
        console.log(`Changed name from "${originalName}" to "${newName}"`);

        await page.screenshot({ path: 'test-results/crm-edit-3-modified.png', fullPage: true });

        // Save changes - look for "Save Changes" or "Update" button
        const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update")').first();
        if (await saveBtn.isVisible().catch(() => false)) {
          await saveBtn.click();
          await page.waitForTimeout(2000);
          await page.screenshot({ path: 'test-results/crm-edit-4-saved.png', fullPage: true });

          // Verify the change
          const pageContent = await page.locator('body').textContent();
          const nameUpdated = pageContent?.includes('(Edited');
          console.log('Name updated on page:', nameUpdated);

          expect(updateApiCalled).toBeTruthy();
          expect(updateSuccess).toBeTruthy();
        }
      }
    } else {
      console.log('Edit button not found in row');
      await page.screenshot({ path: 'test-results/crm-edit-no-button.png', fullPage: true });
    }
  });

  test('2. Delete Customer', async ({ page }) => {
    console.log('=== Test: Delete Customer ===\n');

    // First, create a customer to delete
    console.log('Step 1: Creating a customer to delete...');
    await page.goto(CRM_URL);
    await page.waitForLoadState('networkidle');

    // Create a customer
    await page.locator('button:has-text("New Customer")').click();
    await page.waitForTimeout(500);

    const timestamp = Date.now();
    const customerName = `Delete Test ${timestamp}`;
    await page.locator('input[placeholder="Enter customer name"]').fill(customerName);
    await page.locator('input[placeholder="email@example.com"]').fill(`delete${timestamp}@test.com`);
    await page.locator('button:has-text("Create Customer")').click();
    await page.waitForTimeout(2000);

    console.log(`Created customer: ${customerName}`);
    await page.screenshot({ path: 'test-results/crm-delete-1-created.png', fullPage: true });

    // Now we should be on the customer detail page
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
        if (response.request().method() === 'DELETE' && response.url().includes('/api/v1/crm/customers/')) {
          deleteSuccess = response.status() === 200;
          console.log(`Delete API Response: ${response.status()}`);
        }
      });

      await deleteBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'test-results/crm-delete-2-after-delete.png', fullPage: true });

      // Should redirect to customer list
      const urlAfterDelete = page.url();
      console.log('URL after delete:', urlAfterDelete);

      // Verify the customer is no longer in the list
      const pageContent = await page.locator('body').textContent();
      const customerStillExists = pageContent?.includes(customerName);
      console.log('Customer still in list:', customerStillExists);

      expect(customerStillExists).toBeFalsy();
    } else {
      console.log('Delete button not found');
      await page.screenshot({ path: 'test-results/crm-delete-no-button.png', fullPage: true });
    }
  });

  test('3. View Customer Details (Read-only)', async ({ page }) => {
    console.log('=== Test: View Customer Details ===\n');

    await page.goto(CRM_URL);
    await page.waitForLoadState('networkidle');

    // Find first customer row
    const customerRow = page.locator('table tbody tr').first();
    const hasCustomers = await customerRow.isVisible().catch(() => false);

    if (hasCustomers) {
      // Get customer name before clicking
      const customerName = await customerRow.locator('td').first().textContent();
      console.log('Viewing customer:', customerName);

      // Click View button in the row
      const viewBtn = customerRow.locator('button:has-text("View")');
      await expect(viewBtn).toBeVisible();
      await viewBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'test-results/crm-view-detail.png', fullPage: true });

      // Verify we're on the customer detail page
      const currentUrl = page.url();
      console.log('Current URL:', currentUrl);
      expect(currentUrl).toContain('/crm/customers/');
      expect(currentUrl).not.toContain('/edit');
      expect(currentUrl).not.toContain('/new');

      // Verify we can see customer details (should be in view mode)
      const pageContent = await page.locator('body').textContent();

      // Check for expected elements
      const hasBackLink = pageContent?.includes('Back to Customers') || await page.locator('text=Back').isVisible().catch(() => false);
      const hasEditButton = await page.locator('button:has-text("Edit")').isVisible().catch(() => false);
      const hasDeleteButton = await page.locator('button:has-text("Delete")').isVisible().catch(() => false);

      console.log('Has Back link:', hasBackLink);
      console.log('Has Edit button:', hasEditButton);
      console.log('Has Delete button:', hasDeleteButton);
      console.log('Page content (first 300 chars):', pageContent?.substring(0, 300));

      // Customer name should appear on the page
      const hasCustomerName = pageContent?.includes(customerName?.split('\n')[0] || '');
      console.log('Customer name on page:', hasCustomerName);

      expect(hasEditButton || hasDeleteButton).toBeTruthy();
    } else {
      console.log('No customers found');
    }
  });
});
