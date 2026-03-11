import { test, expect } from '@playwright/test';

test.describe('SenseHub Automation Tab - Detailed Verification', () => {
  test('verify automation tab loads and displays equipment correctly', async ({ page }) => {
    // Capture console messages
    const consoleMessages: { type: string; text: string }[] = [];
    page.on('console', msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text()
      });
    });

    // Capture network requests
    const networkRequests: { url: string; status: number; method: string }[] = [];
    page.on('response', async response => {
      networkRequests.push({
        url: response.url(),
        status: response.status(),
        method: response.request().method()
      });
    });

    console.log('=== Step 1: Navigate to localhost ===');
    await page.goto('http://localhost');

    console.log('=== Step 2: Login ===');
    await page.fill('input[type="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"]', 'SuperAdmin123!');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    console.log('=== Step 3: Navigate to block detail page ===');
    await page.goto('http://localhost/farm/farms/23d67318-415e-49bf-a2b6-515b38974bde/blocks/9cae164a-87dc-4428-aef3-0f361c6d61d9');
    await page.waitForLoadState('networkidle');

    console.log('=== Step 4: Click Automation tab ===');
    const automationTab = page.locator('button:has-text("Automation"), [role="tab"]:has-text("Automation")').first();
    await automationTab.click();

    console.log('=== Step 5: Wait for loading to complete ===');
    try {
      // Wait for loading message to appear first
      await page.waitForSelector('text=/Loading SenseHub integration/i', { timeout: 5000 });
      console.log('✅ Loading message appeared');

      // Then wait for it to disappear
      await page.waitForSelector('text=/Loading SenseHub integration/i', { state: 'hidden', timeout: 30000 });
      console.log('✅ Loading message disappeared');
    } catch (e) {
      console.log('⚠️ Loading message behavior:', e instanceof Error ? e.message : String(e));
    }

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    console.log('=== Step 6: Take Overview screenshot ===');
    await page.screenshot({
      path: '/home/noobcity/Code/A64CorePlatform/automation-overview-detailed.png',
      fullPage: true
    });

    console.log('=== Step 7: Click Equipment sub-tab ===');
    const equipmentSubTab = page.locator('button:has-text("Equipment"), [role="tab"]:has-text("Equipment")').last();
    await equipmentSubTab.click();
    await page.waitForTimeout(2000);

    console.log('=== Step 8: Take Equipment screenshot ===');
    await page.screenshot({
      path: '/home/noobcity/Code/A64CorePlatform/automation-equipment-detailed.png',
      fullPage: true
    });

    // Analyze page content
    console.log('\n=== CONTENT ANALYSIS ===');

    // Check for equipment cards - try multiple selectors
    const cardSelectors = [
      '[class*="EquipmentCard"]',
      '[class*="equipment-card"]',
      '[class*="Card"]',
      'div:has-text("A6065 Relay Board")',
      'div:has-text("A6V05 Weatherstation")',
    ];

    for (const selector of cardSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        console.log(`✅ Selector "${selector}": ${count} elements found`);
      }
    }

    // Check for specific text content
    const expectedTexts = [
      'SenseHub Connection',
      'A6065 Relay Board',
      'A6V05 Weatherstation',
      'Relay 1',
      'Temperature',
      'Humidity',
      'Connected to'
    ];

    console.log('\n=== TEXT CONTENT CHECK ===');
    for (const text of expectedTexts) {
      const count = await page.locator(`text="${text}"`).count();
      console.log(`${count > 0 ? '✅' : '❌'} "${text}": ${count} occurrences`);
    }

    // Check for toggle buttons
    const toggles = await page.locator('button:has-text("ON"), button:has-text("OFF")').count();
    console.log(`\n✅ Toggle buttons found: ${toggles}`);

    // Check console errors
    const errors = consoleMessages.filter(m => m.type === 'error');
    console.log(`\n=== CONSOLE MESSAGES (${consoleMessages.length} total) ===`);
    console.log(`Errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log('\n⚠️ Console Errors:');
      errors.slice(0, 10).forEach((err, i) => {
        console.log(`  ${i + 1}. ${err.text}`);
      });
    }

    // Check network requests
    const senseHubRequests = networkRequests.filter(r => r.url.includes('sensehub'));
    console.log(`\n=== NETWORK REQUESTS (SenseHub: ${senseHubRequests.length}) ===`);
    senseHubRequests.forEach(req => {
      console.log(`  ${req.method} ${req.url} - Status: ${req.status}`);
    });

    // Final verification
    const hasContent = await page.locator('text="SenseHub Connection"').count() > 0;
    console.log(`\n=== FINAL RESULT ===`);
    console.log(`SenseHub integration loaded: ${hasContent ? '✅ YES' : '❌ NO'}`);
    console.log(`Console errors: ${errors.length}`);
    console.log(`Network errors: ${networkRequests.filter(r => r.status >= 400).length}`);

    // Assertions
    expect(hasContent).toBeTruthy();
    expect(errors.length).toBe(0);
  });
});
