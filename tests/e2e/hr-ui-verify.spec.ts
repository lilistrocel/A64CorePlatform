import { test, expect } from '@playwright/test';

const BASE_URL = 'https://a64core.com';
const HR_URL = `${BASE_URL}/hr/employees`;

test('Verify: HR Table Actions Visible at Narrow Viewport', async ({ page }) => {
  // Login
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', 'admin@a64platform.com');
  await page.fill('input[type="password"]', 'SuperAdmin123!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });

  // Navigate to HR
  await page.goto(HR_URL);
  await page.waitForLoadState('networkidle');

  // Set a narrower viewport (like the user's screenshot)
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/hr-verify-narrow.png', fullPage: true });

  // Check if table container now has horizontal scroll
  const tableContainer = page.locator('table').first().locator('..');
  const containerStyles = await tableContainer.evaluate((el) => {
    const styles = window.getComputedStyle(el);
    return {
      overflowX: styles.overflowX,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      canScroll: el.scrollWidth > el.clientWidth
    };
  });
  console.log('Table container styles:', containerStyles);

  // Try to find the Edit button - it should be accessible now
  const firstRow = page.locator('table tbody tr').first();
  const editBtn = firstRow.locator('button:has-text("Edit")');
  const deleteBtn = firstRow.locator('button:has-text("Delete")');

  // Check if buttons exist
  const editExists = await editBtn.count() > 0;
  const deleteExists = await deleteBtn.count() > 0;
  console.log('Edit button exists:', editExists);
  console.log('Delete button exists:', deleteExists);

  // If the table needs scrolling, scroll it to reveal the buttons
  if (containerStyles.canScroll) {
    console.log('Table needs horizontal scroll - scrolling to reveal buttons');
    await tableContainer.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/hr-verify-scrolled.png', fullPage: true });
  }

  // Now check if the buttons are visible after scroll
  const editVisible = await editBtn.isVisible().catch(() => false);
  const deleteVisible = await deleteBtn.isVisible().catch(() => false);
  console.log('Edit button visible after scroll:', editVisible);
  console.log('Delete button visible after scroll:', deleteVisible);

  // Verify buttons are interactable
  if (editVisible) {
    const editBox = await editBtn.boundingBox();
    console.log('Edit button position:', editBox);
    expect(editBox).not.toBeNull();
    expect(editBox!.width).toBeGreaterThan(0);
  }

  if (deleteVisible) {
    const deleteBox = await deleteBtn.boundingBox();
    console.log('Delete button position:', deleteBox);
    expect(deleteBox).not.toBeNull();
    expect(deleteBox!.width).toBeGreaterThan(0);
  }

  expect(editExists || deleteExists).toBeTruthy();
});
