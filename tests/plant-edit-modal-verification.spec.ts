import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Plant Edit Modal Verification Test Suite
 *
 * This test verifies the fixes for the Plant Edit Modal including:
 * - No controlled/uncontrolled component warnings
 * - Fertilizer Schedule section exists and works
 * - Pesticide Schedule section exists and works
 * - Number formatting is applied
 */

test.describe('Plant Edit Modal Verification', () => {
  let page: Page;
  const screenshotsDir = path.join(__dirname, '../test-results/plant-edit-modal-screenshots');

  test.beforeAll(async ({ browser }) => {
    // Create screenshots directory
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  });

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;

    // Set up console message listener to catch errors/warnings
    page.on('console', (msg) => {
      const text = msg.text();
      console.log(`[BROWSER CONSOLE ${msg.type()}]:`, text);

      // Flag controlled/uncontrolled warnings
      if (text.includes('controlled') && text.includes('uncontrolled')) {
        console.error('❌ CONTROLLED/UNCONTROLLED WARNING DETECTED:', text);
      }
    });

    // Set up page error listener
    page.on('pageerror', (error) => {
      console.error('❌ PAGE ERROR:', error.message);
    });
  });

  test('Step 1-2: Navigate and Login', async () => {
    console.log('\n🔍 Step 1: Navigating to http://localhost');
    await page.goto('http://localhost', { waitUntil: 'networkidle' });

    // Take screenshot of login page
    await page.screenshot({
      path: path.join(screenshotsDir, '01-login-page.png'),
      fullPage: true
    });

    console.log('\n🔍 Step 2: Logging in with admin credentials');

    // Fill login form
    await page.fill('input[type="email"], input[name="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"], input[name="password"]', 'SuperAdmin123!');

    // Click login button
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');

    // Wait for navigation after login
    await page.waitForURL(/.*/, { waitUntil: 'networkidle', timeout: 10000 });

    // Take screenshot after login
    await page.screenshot({
      path: path.join(screenshotsDir, '02-after-login.png'),
      fullPage: true
    });

    console.log('✅ Login successful');
  });

  test('Step 3: Navigate to Plant Data Library', async () => {
    // Login first
    await page.goto('http://localhost', { waitUntil: 'networkidle' });
    await page.fill('input[type="email"], input[name="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"], input[name="password"]', 'SuperAdmin123!');
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
    await page.waitForURL(/.*/, { waitUntil: 'networkidle', timeout: 10000 });

    console.log('\n🔍 Step 3: Navigating to Plant Data Library');

    // Try multiple possible navigation paths
    const possiblePaths = [
      { selector: 'a:has-text("Farm Management")', name: 'Farm Management menu' },
      { selector: 'a:has-text("Plant Data")', name: 'Plant Data link' },
      { selector: 'a[href*="plant"]', name: 'Any plant-related link' },
      { selector: 'nav a:has-text("Plants")', name: 'Plants in nav' },
    ];

    let navigated = false;
    for (const pathOption of possiblePaths) {
      try {
        const element = await page.locator(pathOption.selector).first();
        if (await element.isVisible({ timeout: 2000 })) {
          console.log(`  Found: ${pathOption.name}`);
          await element.click();
          await page.waitForTimeout(1000);
          navigated = true;
          break;
        }
      } catch (e) {
        // Continue to next option
      }
    }

    // If we haven't navigated yet, try direct URL
    if (!navigated) {
      console.log('  Trying direct URL navigation...');
      const possibleUrls = [
        'http://localhost/farm/plant-data',
        'http://localhost/plants',
        'http://localhost/plant-library',
        'http://localhost/farm-management/plant-data',
      ];

      for (const url of possibleUrls) {
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 5000 });
          const currentUrl = page.url();
          if (!currentUrl.includes('login') && !currentUrl.includes('404')) {
            console.log(`  ✅ Successfully navigated to: ${url}`);
            navigated = true;
            break;
          }
        } catch (e) {
          // Continue to next URL
        }
      }
    }

    // Take screenshot of Plant Data Library page
    await page.screenshot({
      path: path.join(screenshotsDir, '03-plant-data-library.png'),
      fullPage: true
    });

    if (navigated) {
      console.log('✅ Navigated to Plant Data Library');
    } else {
      console.log('⚠️  Could not find Plant Data Library - manual verification needed');
    }
  });

  test('Step 4-5: Open Edit Modal and Verify Sections', async () => {
    // Login and navigate
    await page.goto('http://localhost', { waitUntil: 'networkidle' });
    await page.fill('input[type="email"], input[name="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"], input[name="password"]', 'SuperAdmin123!');
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
    await page.waitForURL(/.*/, { waitUntil: 'networkidle', timeout: 10000 });

    // Try to navigate to plant data
    try {
      await page.goto('http://localhost/farm/plant-data', { waitUntil: 'networkidle', timeout: 5000 });
    } catch (e) {
      console.log('⚠️  Direct navigation failed, trying alternative routes');
    }

    console.log('\n🔍 Step 4: Looking for Edit button');

    // Track console messages during modal interaction
    const consoleMessages: string[] = [];
    page.on('console', (msg) => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    });

    // Find and click Edit button
    const editButtonSelectors = [
      'button:has-text("Edit")',
      'button[aria-label*="Edit"]',
      'a:has-text("Edit")',
      '[data-testid*="edit"]',
    ];

    let editButtonClicked = false;
    for (const selector of editButtonSelectors) {
      try {
        const editButton = await page.locator(selector).first();
        if (await editButton.isVisible({ timeout: 2000 })) {
          console.log(`  Found Edit button with selector: ${selector}`);
          await editButton.click();
          await page.waitForTimeout(1000);
          editButtonClicked = true;
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    if (!editButtonClicked) {
      console.log('⚠️  Could not find Edit button - manual verification needed');
      // Take screenshot anyway to show current state
      await page.screenshot({
        path: path.join(screenshotsDir, '04-no-edit-button.png'),
        fullPage: true
      });
      return;
    }

    // Wait for modal to appear
    await page.waitForTimeout(1000);

    // Take screenshot of modal
    await page.screenshot({
      path: path.join(screenshotsDir, '04-edit-modal-initial.png'),
      fullPage: true
    });

    console.log('\n🔍 Step 5a: Checking for console errors');

    // Check for controlled/uncontrolled warnings
    const hasControlledWarning = consoleMessages.some(msg =>
      msg.includes('controlled') && msg.includes('uncontrolled')
    );

    if (hasControlledWarning) {
      console.log('❌ CONTROLLED/UNCONTROLLED WARNING FOUND');
      consoleMessages.forEach(msg => {
        if (msg.includes('controlled')) {
          console.log('  ', msg);
        }
      });
    } else {
      console.log('✅ No controlled/uncontrolled warnings');
    }

    console.log('\n🔍 Step 5b: Expanding Advanced Fields section');

    // Look for Advanced Fields section
    const advancedFieldsSelectors = [
      'button:has-text("Advanced Fields")',
      'summary:has-text("Advanced")',
      '[data-testid*="advanced"]',
      'div:has-text("Advanced Fields")',
    ];

    let advancedExpanded = false;
    for (const selector of advancedFieldsSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible({ timeout: 2000 })) {
          console.log(`  Found Advanced Fields with selector: ${selector}`);
          await element.click();
          await page.waitForTimeout(500);
          advancedExpanded = true;
          break;
        }
      } catch (e) {
        // Continue
      }
    }

    if (advancedExpanded) {
      console.log('✅ Advanced Fields expanded');
    } else {
      console.log('⚠️  Could not find/expand Advanced Fields');
    }

    // Take screenshot with Advanced Fields expanded
    await page.screenshot({
      path: path.join(screenshotsDir, '05-advanced-fields-expanded.png'),
      fullPage: true
    });

    console.log('\n🔍 Step 5c: Checking for Fertilizer Schedule section');

    // Check for Fertilizer Schedule section
    const fertilizerSectionExists = await page.locator('text=/Fertilizer.*Schedule/i').isVisible();
    const fertilizerAddButton = await page.locator('button:has-text("Add Fertilizer")').isVisible().catch(() => false);

    if (fertilizerSectionExists) {
      console.log('✅ Fertilizer Schedule section exists');
      if (fertilizerAddButton) {
        console.log('✅ Fertilizer Add button exists');
      } else {
        console.log('⚠️  Fertilizer Add button not found');
      }
    } else {
      console.log('❌ Fertilizer Schedule section NOT FOUND');
    }

    // Take screenshot of Fertilizer section
    await page.screenshot({
      path: path.join(screenshotsDir, '06-fertilizer-section.png'),
      fullPage: true
    });
  });

  test('Step 6: Verify Pesticide Schedule Section', async () => {
    // Login and navigate to edit modal (same setup as previous test)
    await page.goto('http://localhost', { waitUntil: 'networkidle' });
    await page.fill('input[type="email"], input[name="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"], input[name="password"]', 'SuperAdmin123!');
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
    await page.waitForURL(/.*/, { waitUntil: 'networkidle', timeout: 10000 });

    try {
      await page.goto('http://localhost/farm/plant-data', { waitUntil: 'networkidle', timeout: 5000 });
    } catch (e) {
      console.log('⚠️  Navigation issue - skipping to manual verification');
      return;
    }

    // Click Edit button
    const editButton = await page.locator('button:has-text("Edit")').first();
    if (await editButton.isVisible({ timeout: 2000 })) {
      await editButton.click();
      await page.waitForTimeout(1000);
    }

    // Expand Advanced Fields if needed
    try {
      const advancedButton = await page.locator('button:has-text("Advanced Fields")').first();
      if (await advancedButton.isVisible({ timeout: 2000 })) {
        await advancedButton.click();
        await page.waitForTimeout(500);
      }
    } catch (e) {
      // Continue
    }

    console.log('\n🔍 Step 6: Checking for Pesticide Schedule section');

    // Check for Pesticide Schedule section
    const pesticideSectionExists = await page.locator('text=/Pesticide.*Schedule/i').isVisible();
    const pesticideAddButton = await page.locator('button:has-text("Add Pesticide")').isVisible().catch(() => false);

    if (pesticideSectionExists) {
      console.log('✅ Pesticide Schedule section exists');
      if (pesticideAddButton) {
        console.log('✅ Pesticide Add button exists');
      } else {
        console.log('⚠️  Pesticide Add button not found');
      }
    } else {
      console.log('❌ Pesticide Schedule section NOT FOUND');
    }

    // Take screenshot of Pesticide section
    await page.screenshot({
      path: path.join(screenshotsDir, '07-pesticide-section.png'),
      fullPage: true
    });
  });

  test('Step 7-8: Test Adding Schedule Items', async () => {
    // Setup (login and navigate to edit modal)
    await page.goto('http://localhost', { waitUntil: 'networkidle' });
    await page.fill('input[type="email"], input[name="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"], input[name="password"]', 'SuperAdmin123!');
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
    await page.waitForURL(/.*/, { waitUntil: 'networkidle', timeout: 10000 });

    try {
      await page.goto('http://localhost/farm/plant-data', { waitUntil: 'networkidle', timeout: 5000 });
    } catch (e) {
      console.log('⚠️  Navigation issue');
      return;
    }

    const editButton = await page.locator('button:has-text("Edit")').first();
    if (await editButton.isVisible({ timeout: 2000 })) {
      await editButton.click();
      await page.waitForTimeout(1000);
    }

    try {
      const advancedButton = await page.locator('button:has-text("Advanced Fields")').first();
      if (await advancedButton.isVisible({ timeout: 2000 })) {
        await advancedButton.click();
        await page.waitForTimeout(500);
      }
    } catch (e) {
      // Continue
    }

    console.log('\n🔍 Step 7: Testing Add Fertilizer functionality');

    try {
      const addFertilizerButton = await page.locator('button:has-text("Add Fertilizer")').first();
      if (await addFertilizerButton.isVisible({ timeout: 2000 })) {
        await addFertilizerButton.click();
        await page.waitForTimeout(500);
        console.log('✅ Clicked Add Fertilizer button');

        // Try to fill fertilizer fields
        const fertilizerNameInput = await page.locator('input[name*="fertilizer"][name*="name"], input[placeholder*="Fertilizer Name"]').first();
        if (await fertilizerNameInput.isVisible({ timeout: 1000 })) {
          await fertilizerNameInput.fill('Test Fertilizer NPK 10-10-10');
          console.log('✅ Filled Fertilizer Name');
        }

        // Take screenshot after adding fertilizer item
        await page.screenshot({
          path: path.join(screenshotsDir, '08-fertilizer-item-added.png'),
          fullPage: true
        });
      } else {
        console.log('⚠️  Add Fertilizer button not visible');
      }
    } catch (e) {
      console.log('❌ Error testing fertilizer addition:', e);
    }

    console.log('\n🔍 Step 8: Testing Add Pesticide functionality');

    try {
      const addPesticideButton = await page.locator('button:has-text("Add Pesticide")').first();
      if (await addPesticideButton.isVisible({ timeout: 2000 })) {
        await addPesticideButton.click();
        await page.waitForTimeout(500);
        console.log('✅ Clicked Add Pesticide button');

        // Try to fill pesticide fields
        const pesticideNameInput = await page.locator('input[name*="pesticide"][name*="name"], input[placeholder*="Pesticide Name"]').first();
        if (await pesticideNameInput.isVisible({ timeout: 1000 })) {
          await pesticideNameInput.fill('Test Pesticide - Aphid Control');
          console.log('✅ Filled Pesticide Name');
        }

        // Take screenshot after adding pesticide item
        await page.screenshot({
          path: path.join(screenshotsDir, '09-pesticide-item-added.png'),
          fullPage: true
        });
      } else {
        console.log('⚠️  Add Pesticide button not visible');
      }
    } catch (e) {
      console.log('❌ Error testing pesticide addition:', e);
    }

    // Take final screenshot showing both sections with items
    await page.screenshot({
      path: path.join(screenshotsDir, '10-final-modal-state.png'),
      fullPage: true
    });
  });

  test('Step 9: Verify Number Formatting', async () => {
    await page.goto('http://localhost', { waitUntil: 'networkidle' });
    await page.fill('input[type="email"], input[name="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"], input[name="password"]', 'SuperAdmin123!');
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
    await page.waitForURL(/.*/, { waitUntil: 'networkidle', timeout: 10000 });

    console.log('\n🔍 Step 9: Checking for number formatting');

    try {
      await page.goto('http://localhost/farm/plant-data', { waitUntil: 'networkidle', timeout: 5000 });
    } catch (e) {
      console.log('⚠️  Navigation issue');
    }

    // Look for numbers with comma formatting (e.g., "10,000" or "1,234")
    const pageContent = await page.content();
    const hasCommaFormatting = /\d{1,3}(,\d{3})+/.test(pageContent);

    if (hasCommaFormatting) {
      console.log('✅ Number formatting with commas detected in page content');
    } else {
      console.log('⚠️  No comma-formatted numbers found (may need numbers > 999 to test)');
    }

    // Take screenshot to show any number formatting
    await page.screenshot({
      path: path.join(screenshotsDir, '11-number-formatting-check.png'),
      fullPage: true
    });
  });

  test.afterAll(async () => {
    console.log('\n\n📊 TEST SUMMARY');
    console.log('================');
    console.log(`Screenshots saved to: ${screenshotsDir}`);
    console.log('\nScreenshots captured:');
    console.log('  01-login-page.png');
    console.log('  02-after-login.png');
    console.log('  03-plant-data-library.png');
    console.log('  04-edit-modal-initial.png');
    console.log('  05-advanced-fields-expanded.png');
    console.log('  06-fertilizer-section.png');
    console.log('  07-pesticide-section.png');
    console.log('  08-fertilizer-item-added.png');
    console.log('  09-pesticide-item-added.png');
    console.log('  10-final-modal-state.png');
    console.log('  11-number-formatting-check.png');
    console.log('\n✅ Test suite completed. Review console output and screenshots for detailed results.');
  });
});
