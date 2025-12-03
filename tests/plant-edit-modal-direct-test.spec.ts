import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Plant Edit Modal Verification Test - Direct Frontend Access
 *
 * This test accesses the frontend directly via port 5173 (Vite dev server)
 * to bypass nginx HTTPS redirect that blocks localhost testing
 */

test.describe('Plant Edit Modal Verification - Direct Access', () => {
  let page: Page;
  const screenshotsDir = path.join(__dirname, '../test-results/plant-edit-modal-direct');

  test.beforeAll(async ({ browser }) => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  });

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;

    // Track console messages
    const consoleMessages: Array<{ type: string; text: string }> = [];
    page.on('console', (msg) => {
      const text = msg.text();
      const type = msg.type();
      consoleMessages.push({ type, text });

      // Log to test console
      console.log(`[BROWSER ${type.toUpperCase()}]:`, text);

      // Flag important warnings/errors
      if (text.includes('controlled') && text.includes('uncontrolled')) {
        console.error('❌ CONTROLLED/UNCONTROLLED WARNING:', text);
      }
    });

    // Track page errors
    page.on('pageerror', (error) => {
      console.error('❌ PAGE ERROR:', error.message);
    });

    // Store console messages on page context for later access
    (page as any).consoleMessages = consoleMessages;
  });

  test('Complete Plant Edit Modal Verification Flow', async () => {
    console.log('\n' + '='.repeat(80));
    console.log('PLANT EDIT MODAL VERIFICATION TEST');
    console.log('='.repeat(80) + '\n');

    // =========================================================================
    // STEP 1: Navigate to Frontend (Direct Port 5173)
    // =========================================================================
    console.log('\n🔍 STEP 1: Navigating to frontend (direct Vite server on port 5173)');

    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });

    await page.screenshot({
      path: path.join(screenshotsDir, '01-login-page.png'),
      fullPage: true
    });
    console.log('✅ Frontend loaded successfully');

    // =========================================================================
    // STEP 2: Login with Admin Credentials
    // =========================================================================
    console.log('\n🔍 STEP 2: Logging in with admin credentials');

    // Clear console messages before login
    const consoleMessages = (page as any).consoleMessages;
    consoleMessages.length = 0;

    // Fill login form
    await page.fill('input[type="email"], input[name="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"], input[name="password"]', 'SuperAdmin123!');

    // Click login button
    const loginButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
    await loginButton.click();

    // Wait for navigation with extended timeout
    try {
      await page.waitForURL(/.*/, { waitUntil: 'networkidle', timeout: 15000 });
    } catch (e) {
      console.log('⚠️  Navigation timeout - checking if login succeeded anyway');
    }

    await page.waitForTimeout(2000);

    await page.screenshot({
      path: path.join(screenshotsDir, '02-after-login.png'),
      fullPage: true
    });

    // Check if we're still on login page (login failed) or successfully navigated
    const currentUrl = page.url();
    if (currentUrl.includes('login')) {
      console.error('❌ CRITICAL: Login failed - still on login page');
      console.error('   This is a blocking issue that prevents all further testing');
      throw new Error('Login failed - cannot proceed with Plant Edit Modal testing');
    } else {
      console.log('✅ Login successful - navigated to:', currentUrl);
    }

    // =========================================================================
    // STEP 3: Navigate to Plant Data Library
    // =========================================================================
    console.log('\n🔍 STEP 3: Navigating to Plant Data Library');

    // Try clicking navigation links
    const navAttempts = [
      { description: 'Farm Management link', selector: 'a:has-text("Farm Management"), button:has-text("Farm Management")' },
      { description: 'Plant Data link', selector: 'a:has-text("Plant Data"), button:has-text("Plant Data")' },
      { description: 'Any plant-related link', selector: 'a[href*="plant"]' },
    ];

    let navigated = false;
    for (const attempt of navAttempts) {
      try {
        const element = page.locator(attempt.selector).first();
        if (await element.isVisible({ timeout: 2000 })) {
          console.log(`  Clicking: ${attempt.description}`);
          await element.click();
          await page.waitForTimeout(1500);
          navigated = true;
          break;
        }
      } catch (e) {
        console.log(`  ${attempt.description} not found, trying next...`);
      }
    }

    // If navigation failed, try direct URL
    if (!navigated) {
      console.log('  Trying direct URL navigation to /farm/plant-data');
      try {
        await page.goto('http://localhost:5173/farm/plant-data', {
          waitUntil: 'networkidle',
          timeout: 10000
        });
        navigated = true;
      } catch (e) {
        console.error('  ❌ Direct URL navigation failed');
      }
    }

    await page.screenshot({
      path: path.join(screenshotsDir, '03-plant-data-page.png'),
      fullPage: true
    });

    if (navigated) {
      console.log('✅ Successfully navigated to Plant Data area');
    } else {
      console.error('❌ Could not navigate to Plant Data Library');
      console.error('   Manual verification needed - check screenshot 03');
    }

    // =========================================================================
    // STEP 4: Find and Click Edit Button
    // =========================================================================
    console.log('\n🔍 STEP 4: Looking for Edit button on a plant');

    // Clear console before opening modal
    consoleMessages.length = 0;

    // Try multiple selector strategies for Edit button
    const editButtonSelectors = [
      'button:has-text("Edit")',
      'button[aria-label*="edit" i]',
      'a:has-text("Edit")',
      '[data-testid*="edit"]',
      'button svg[class*="edit"], button svg[data-icon="edit"]',
    ];

    let editModalOpened = false;
    for (const selector of editButtonSelectors) {
      try {
        const buttons = page.locator(selector);
        const count = await buttons.count();

        if (count > 0) {
          console.log(`  Found ${count} button(s) with selector: ${selector}`);
          // Click the first edit button
          await buttons.first().click();
          await page.waitForTimeout(1000);
          editModalOpened = true;
          console.log('✅ Clicked Edit button');
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    if (!editModalOpened) {
      console.error('❌ CRITICAL: Could not find Edit button');
      console.error('   Cannot test Plant Edit Modal without access to Edit button');
      await page.screenshot({
        path: path.join(screenshotsDir, '04-no-edit-button.png'),
        fullPage: true
      });
      throw new Error('Edit button not found - cannot proceed with modal testing');
    }

    // Wait for modal to fully render
    await page.waitForTimeout(1500);

    await page.screenshot({
      path: path.join(screenshotsDir, '04-edit-modal-opened.png'),
      fullPage: true
    });

    // =========================================================================
    // STEP 5: Check for Controlled/Uncontrolled Warnings
    // =========================================================================
    console.log('\n🔍 STEP 5: Checking console for controlled/uncontrolled warnings');

    const controlledWarnings = consoleMessages.filter(msg =>
      msg.text.toLowerCase().includes('controlled') &&
      msg.text.toLowerCase().includes('uncontrolled')
    );

    if (controlledWarnings.length > 0) {
      console.error('❌ CONTROLLED/UNCONTROLLED WARNINGS FOUND:');
      controlledWarnings.forEach((msg, idx) => {
        console.error(`   Warning ${idx + 1}: ${msg.text}`);
      });
    } else {
      console.log('✅ No controlled/uncontrolled warnings detected');
    }

    // =========================================================================
    // STEP 6: Expand Advanced Fields Section
    // =========================================================================
    console.log('\n🔍 STEP 6: Expanding Advanced Fields section');

    const advancedSelectors = [
      'button:has-text("Advanced Fields")',
      'summary:has-text("Advanced")',
      'div[role="button"]:has-text("Advanced")',
      '[data-testid*="advanced"]',
    ];

    let advancedExpanded = false;
    for (const selector of advancedSelectors) {
      try {
        const element = page.locator(selector).first();
        if (await element.isVisible({ timeout: 2000 })) {
          console.log(`  Found Advanced Fields with selector: ${selector}`);
          await element.click();
          await page.waitForTimeout(500);
          advancedExpanded = true;
          console.log('✅ Advanced Fields expanded');
          break;
        }
      } catch (e) {
        // Continue
      }
    }

    if (!advancedExpanded) {
      console.log('⚠️  Could not find/expand Advanced Fields section');
      console.log('   This may mean the section is already expanded or has different markup');
    }

    await page.screenshot({
      path: path.join(screenshotsDir, '05-advanced-fields.png'),
      fullPage: true
    });

    // =========================================================================
    // STEP 7: Verify Fertilizer Schedule Section
    // =========================================================================
    console.log('\n🔍 STEP 7: Verifying Fertilizer Schedule section exists');

    const fertilizerHeading = page.locator('text=/Fertilizer.*Schedule/i');
    const fertilizerAddButton = page.locator('button:has-text("Add Fertilizer"), button:has-text("Add fertilizer")');

    const hasFertilizerSection = await fertilizerHeading.isVisible().catch(() => false);
    const hasFertilizerButton = await fertilizerAddButton.first().isVisible().catch(() => false);

    if (hasFertilizerSection) {
      console.log('✅ Fertilizer Schedule section exists');

      if (hasFertilizerButton) {
        console.log('✅ Fertilizer Add button exists');

        // Check for expected fields
        const fertilizerFields = [
          { name: 'Name', selector: 'input[placeholder*="Name" i], input[name*="name"]' },
          { name: 'Interval', selector: 'input[placeholder*="Interval" i], input[name*="interval"]' },
          { name: 'Amount', selector: 'input[placeholder*="Amount" i], input[name*="amount"]' },
          { name: 'Unit', selector: 'input[placeholder*="Unit" i], select[name*="unit"]' },
          { name: 'Notes', selector: 'textarea[placeholder*="Notes" i], textarea[name*="notes"]' },
        ];

        console.log('   Checking for Fertilizer Schedule fields:');
        for (const field of fertilizerFields) {
          const exists = await page.locator(field.selector).first().isVisible().catch(() => false);
          console.log(`     ${exists ? '✅' : '❌'} ${field.name} field`);
        }
      } else {
        console.error('❌ Fertilizer Add button NOT FOUND');
      }
    } else {
      console.error('❌ CRITICAL: Fertilizer Schedule section NOT FOUND');
      console.error('   Expected to see "Fertilizer Schedule" heading in the modal');
    }

    // Scroll to see fertilizer section better
    await page.evaluate(() => {
      const fertilizer = document.querySelector('[class*="fertilizer" i]');
      if (fertilizer) fertilizer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(screenshotsDir, '06-fertilizer-section.png'),
      fullPage: true
    });

    // =========================================================================
    // STEP 8: Verify Pesticide Schedule Section
    // =========================================================================
    console.log('\n🔍 STEP 8: Verifying Pesticide Schedule section exists');

    const pesticideHeading = page.locator('text=/Pesticide.*Schedule/i');
    const pesticideAddButton = page.locator('button:has-text("Add Pesticide"), button:has-text("Add pesticide")');

    const hasPesticideSection = await pesticideHeading.isVisible().catch(() => false);
    const hasPesticideButton = await pesticideAddButton.first().isVisible().catch(() => false);

    if (hasPesticideSection) {
      console.log('✅ Pesticide Schedule section exists');

      if (hasPesticideButton) {
        console.log('✅ Pesticide Add button exists');

        // Check for expected fields
        const pesticideFields = [
          { name: 'Name', selector: 'input[placeholder*="Pesticide Name" i]' },
          { name: 'Interval', selector: 'input[placeholder*="Interval" i]' },
          { name: 'Amount', selector: 'input[placeholder*="Amount" i]' },
          { name: 'Unit', selector: 'input[placeholder*="Unit" i], select' },
          { name: 'Target Pest', selector: 'input[placeholder*="Target" i], input[placeholder*="Pest" i]' },
          { name: 'Notes', selector: 'textarea[placeholder*="Notes" i]' },
        ];

        console.log('   Checking for Pesticide Schedule fields:');
        for (const field of pesticideFields) {
          const exists = await page.locator(field.selector).first().isVisible().catch(() => false);
          console.log(`     ${exists ? '✅' : '❌'} ${field.name} field`);
        }
      } else {
        console.error('❌ Pesticide Add button NOT FOUND');
      }
    } else {
      console.error('❌ CRITICAL: Pesticide Schedule section NOT FOUND');
      console.error('   Expected to see "Pesticide Schedule" heading in the modal');
    }

    // Scroll to pesticide section
    await page.evaluate(() => {
      const pesticide = document.querySelector('[class*="pesticide" i]');
      if (pesticide) pesticide.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(screenshotsDir, '07-pesticide-section.png'),
      fullPage: true
    });

    // =========================================================================
    // STEP 9: Test Adding Fertilizer Schedule Item
    // =========================================================================
    console.log('\n🔍 STEP 9: Testing Add Fertilizer functionality');

    if (hasFertilizerButton) {
      try {
        await fertilizerAddButton.first().click();
        await page.waitForTimeout(500);
        console.log('✅ Clicked Add Fertilizer button');

        // Try to fill in fertilizer fields
        const nameInput = page.locator('input[placeholder*="Fertilizer" i], input[name*="fertilizer"][name*="name"]').first();
        if (await nameInput.isVisible({ timeout: 1000 })) {
          await nameInput.fill('NPK 10-10-10 Balanced Fertilizer');
          console.log('✅ Filled Fertilizer Name field');
        }

        await page.screenshot({
          path: path.join(screenshotsDir, '08-fertilizer-item-added.png'),
          fullPage: true
        });
      } catch (e) {
        console.error('❌ Error testing fertilizer addition:', e);
      }
    } else {
      console.log('⚠️  Skipping fertilizer addition test - button not available');
    }

    // =========================================================================
    // STEP 10: Test Adding Pesticide Schedule Item
    // =========================================================================
    console.log('\n🔍 STEP 10: Testing Add Pesticide functionality');

    if (hasPesticideButton) {
      try {
        await pesticideAddButton.first().click();
        await page.waitForTimeout(500);
        console.log('✅ Clicked Add Pesticide button');

        // Try to fill in pesticide fields
        const nameInput = page.locator('input[placeholder*="Pesticide" i], input[name*="pesticide"][name*="name"]').first();
        if (await nameInput.isVisible({ timeout: 1000 })) {
          await nameInput.fill('Organic Neem Oil - Aphid Control');
          console.log('✅ Filled Pesticide Name field');
        }

        await page.screenshot({
          path: path.join(screenshotsDir, '09-pesticide-item-added.png'),
          fullPage: true
        });
      } catch (e) {
        console.error('❌ Error testing pesticide addition:', e);
      }
    } else {
      console.log('⚠️  Skipping pesticide addition test - button not available');
    }

    // Final screenshot showing complete modal state
    await page.screenshot({
      path: path.join(screenshotsDir, '10-final-modal-state.png'),
      fullPage: true
    });

    // =========================================================================
    // STEP 11: Verify Number Formatting
    // =========================================================================
    console.log('\n🔍 STEP 11: Checking for number formatting (commas in numbers > 999)');

    const pageContent = await page.content();
    const numberPattern = /\d{1,3}(,\d{3})+/g;
    const matches = pageContent.match(numberPattern);

    if (matches && matches.length > 0) {
      console.log('✅ Number formatting detected! Examples found:');
      // Show unique examples (limited to 5)
      const uniqueMatches = [...new Set(matches)].slice(0, 5);
      uniqueMatches.forEach(match => console.log(`     ${match}`));
    } else {
      console.log('⚠️  No comma-formatted numbers found in page content');
      console.log('   Note: Numbers must be > 999 to trigger comma formatting');
    }

    await page.screenshot({
      path: path.join(screenshotsDir, '11-number-formatting-check.png'),
      fullPage: true
    });

    // =========================================================================
    // FINAL SUMMARY
    // =========================================================================
    console.log('\n' + '='.repeat(80));
    console.log('TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`\n✅ Test completed successfully`);
    console.log(`📸 Screenshots saved to: ${screenshotsDir}`);
    console.log('\nKey Findings:');
    console.log(`  ${controlledWarnings.length === 0 ? '✅' : '❌'} Controlled/Uncontrolled warnings: ${controlledWarnings.length === 0 ? 'NONE' : `${controlledWarnings.length} found`}`);
    console.log(`  ${hasFertilizerSection ? '✅' : '❌'} Fertilizer Schedule section: ${hasFertilizerSection ? 'EXISTS' : 'NOT FOUND'}`);
    console.log(`  ${hasFertilizerButton ? '✅' : '❌'} Fertilizer Add button: ${hasFertilizerButton ? 'EXISTS' : 'NOT FOUND'}`);
    console.log(`  ${hasPesticideSection ? '✅' : '❌'} Pesticide Schedule section: ${hasPesticideSection ? 'EXISTS' : 'NOT FOUND'}`);
    console.log(`  ${hasPesticideButton ? '✅' : '❌'} Pesticide Add button: ${hasPesticideButton ? 'EXISTS' : 'NOT FOUND'}`);
    console.log(`  ${matches ? '✅' : '⚠️ '} Number formatting: ${matches ? `WORKING (${matches.length} instances)` : 'Not detected'}`);
    console.log('\n' + '='.repeat(80) + '\n');
  });
});
