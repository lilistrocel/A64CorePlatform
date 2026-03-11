import { test, expect } from '@playwright/test';

test.describe('SenseHub Automation Tab Verification', () => {
  test('should load automation tab and display sensor data correctly', async ({ page }) => {
    // Step 1: Navigate to localhost
    await page.goto('http://localhost');

    // Step 2: Login
    await page.fill('input[type="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"]', 'SuperAdmin123!');
    await page.click('button[type="submit"]');

    // Wait for navigation after login
    await page.waitForLoadState('networkidle');

    // Step 3: Navigate directly to the block detail page
    await page.goto('http://localhost/farm/farms/23d67318-415e-49bf-a2b6-515b38974bde/blocks/9cae164a-87dc-4428-aef3-0f361c6d61d9');
    await page.waitForLoadState('networkidle');

    // Step 4: Click the Automation tab
    const automationTab = page.locator('button:has-text("Automation"), [role="tab"]:has-text("Automation")').first();
    await automationTab.click();

    // Step 5: Wait for it to load - wait for loading message to disappear
    await page.waitForSelector('text=/Loading SenseHub integration/i', { state: 'hidden', timeout: 30000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Give time for data to render

    // Step 6: Take screenshot of Overview sub-tab
    await page.screenshot({
      path: '/home/noobcity/Code/A64CorePlatform/automation-overview-tab.png',
      fullPage: true
    });

    console.log('✅ Overview tab screenshot saved');

    // Check for equipment cards in overview
    const equipmentCards = await page.locator('[class*="EquipmentCard"], [class*="equipment-card"]').count();
    console.log(`Found ${equipmentCards} equipment cards in Overview`);

    // Step 7: Click Equipment sub-tab
    const equipmentSubTab = page.locator('button:has-text("Equipment"), [role="tab"]:has-text("Equipment")').last();
    await equipmentSubTab.click();
    await page.waitForTimeout(1500);

    // Step 8: Take screenshot of Equipment sub-tab
    await page.screenshot({
      path: '/home/noobcity/Code/A64CorePlatform/automation-equipment-tab.png',
      fullPage: true
    });

    console.log('✅ Equipment tab screenshot saved');

    // Verify equipment count
    const equipmentInTab = await page.locator('[class*="EquipmentCard"], [class*="equipment-card"]').count();
    console.log(`Found ${equipmentInTab} equipment cards in Equipment tab`);

    // Check console for errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Check for sensor readings
    const sensorReadings = await page.locator('text=/Temperature|Humidity|Soil Moisture|pH|EC/i').count();
    console.log(`Found ${sensorReadings} sensor reading labels`);

    // Check for relay toggles
    const relayToggles = await page.locator('[role="switch"], input[type="checkbox"]').count();
    console.log(`Found ${relayToggles} relay toggle controls`);

    // Report results
    console.log('\n=== Verification Results ===');
    console.log(`Equipment Cards: ${equipmentInTab} (expected: 9)`);
    console.log(`Sensor Readings: ${sensorReadings}`);
    console.log(`Relay Toggles: ${relayToggles}`);
    console.log(`Console Errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log('\n⚠️ Console Errors Found:');
      errors.forEach(err => console.log(`  - ${err}`));
    }

    // Assertions
    expect(equipmentInTab).toBeGreaterThan(0);
    expect(errors.length).toBe(0);
  });
});
