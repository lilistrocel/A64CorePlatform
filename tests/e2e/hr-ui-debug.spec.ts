import { test, expect } from '@playwright/test';

const BASE_URL = 'https://a64core.com';
const HR_URL = `${BASE_URL}/hr/employees`;

test('Debug: HR Table Layout Issue', async ({ page }) => {
  // Login
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', 'admin@a64platform.com');
  await page.fill('input[type="password"]', 'SuperAdmin123!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });

  // Navigate to HR
  await page.goto(HR_URL);
  await page.waitForLoadState('networkidle');

  // Take a wide screenshot
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: 'test-results/hr-debug-wide.png', fullPage: true });

  // Check the table container and table widths
  const tableContainer = page.locator('table').first();
  const tableBox = await tableContainer.boundingBox();
  console.log('Table bounding box:', tableBox);

  // Check the Actions column header
  const actionsHeader = page.locator('th:has-text("Actions")');
  const actionsHeaderBox = await actionsHeader.boundingBox().catch(() => null);
  console.log('Actions header box:', actionsHeaderBox);

  // Check the first row's action buttons
  const firstRow = page.locator('table tbody tr').first();
  const actionButtons = firstRow.locator('button');
  const buttonCount = await actionButtons.count();
  console.log('Number of action buttons in first row:', buttonCount);

  for (let i = 0; i < buttonCount; i++) {
    const btn = actionButtons.nth(i);
    const text = await btn.textContent();
    const box = await btn.boundingBox().catch(() => null);
    const isVisible = await btn.isVisible().catch(() => false);
    console.log(`Button ${i}: "${text}", visible: ${isVisible}, box:`, box);
  }

  // Check viewport vs page width
  const viewportSize = page.viewportSize();
  console.log('Viewport size:', viewportSize);

  // Get the main content area width
  const mainContent = page.locator('main, [class*="Container"], [class*="content"]').first();
  const mainBox = await mainContent.boundingBox().catch(() => null);
  console.log('Main content box:', mainBox);

  // Check if table has overflow issues
  const tableStyles = await tableContainer.evaluate((el) => {
    const styles = window.getComputedStyle(el);
    const parent = el.parentElement;
    const parentStyles = parent ? window.getComputedStyle(parent) : null;
    return {
      tableWidth: el.offsetWidth,
      tableScrollWidth: el.scrollWidth,
      parentWidth: parent?.offsetWidth,
      parentOverflow: parentStyles?.overflow,
      parentOverflowX: parentStyles?.overflowX,
    };
  });
  console.log('Table styles:', tableStyles);

  // Check specifically for the TableContainer component
  const styledTableContainer = page.locator('[class*="TableContainer"]').first();
  if (await styledTableContainer.isVisible().catch(() => false)) {
    const containerStyles = await styledTableContainer.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        width: el.offsetWidth,
        overflow: styles.overflow,
        overflowX: styles.overflowX,
      };
    });
    console.log('TableContainer styles:', containerStyles);
  }

  // Scroll right to see if buttons are there but just hidden
  await page.evaluate(() => {
    const table = document.querySelector('table');
    if (table?.parentElement) {
      table.parentElement.scrollLeft = 500;
    }
  });
  await page.screenshot({ path: 'test-results/hr-debug-scrolled.png', fullPage: true });

  // Check column widths
  const headers = await page.locator('table thead th').all();
  for (let i = 0; i < headers.length; i++) {
    const text = await headers[i].textContent();
    const box = await headers[i].boundingBox();
    console.log(`Column ${i} (${text?.trim()}): width=${box?.width}`);
  }
});
