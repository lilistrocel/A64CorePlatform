import { test, expect } from '@playwright/test';

const BASE_URL = 'https://a64core.com';
const HR_URL = `${BASE_URL}/hr/employees`;

test('Verify: HR Table Works on Mobile/Tablet', async ({ page }) => {
  // Login
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', 'admin@a64platform.com');
  await page.fill('input[type="password"]', 'SuperAdmin123!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });

  // Navigate to HR
  await page.goto(HR_URL);
  await page.waitForLoadState('networkidle');

  // Test tablet size (iPad)
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/hr-tablet-before-scroll.png', fullPage: true });

  // Check scroll capability
  const tableContainer = page.locator('table').first().locator('..');
  const containerInfo = await tableContainer.evaluate((el) => {
    return {
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      canScroll: el.scrollWidth > el.clientWidth,
      currentScrollLeft: el.scrollLeft
    };
  });
  console.log('Container info at 1024px:', containerInfo);

  if (containerInfo.canScroll) {
    console.log('Table is scrollable - scrolling to right');
    await tableContainer.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/hr-tablet-after-scroll.png', fullPage: true });
  }

  // Check if buttons are accessible
  const firstRow = page.locator('table tbody tr').first();
  const editBtn = firstRow.locator('button:has-text("Edit")');
  const deleteBtn = firstRow.locator('button:has-text("Delete")');

  const editExists = await editBtn.count() > 0;
  const deleteExists = await deleteBtn.count() > 0;
  console.log('Edit button exists:', editExists);
  console.log('Delete button exists:', deleteExists);

  expect(editExists).toBeTruthy();
  expect(deleteExists).toBeTruthy();
});
