/**
 * Playwright E2E Test: IoT Automation Tab
 * Tests the IoT controller configuration and sensor/relay display
 */

const { chromium } = require('playwright');

const BASE_URL = 'https://a64core.com';
const CREDENTIALS = {
  email: 'admin@a64platform.com',
  password: 'SuperAdmin123!'
};

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('🚀 Starting IoT Automation Tab E2E Test\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 300
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    ignoreHTTPSErrors: true  // Ignore SSL certificate errors
  });

  const page = await context.newPage();

  // Handle alert dialogs automatically
  page.on('dialog', async dialog => {
    console.log(`   Alert: "${dialog.message()}"`);
    await dialog.dismiss();
  });

  try {
    // ========================================
    // Step 1: Login
    // ========================================
    console.log('📝 Step 1: Logging in...');
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    await page.fill('input[type="email"]', CREDENTIALS.email);
    await page.fill('input[type="password"]', CREDENTIALS.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard**', { timeout: 15000 });
    console.log('✅ Logged in successfully\n');

    // ========================================
    // Step 2: Navigate to Block Monitor
    // ========================================
    console.log('📝 Step 2: Navigating to Block Monitor...');
    await page.goto(`${BASE_URL}/farm/block-monitor`);
    await page.waitForLoadState('networkidle');
    await delay(2000);
    console.log('✅ Block Monitor page loaded\n');

    // ========================================
    // Step 3: Click on a block to open modal
    // ========================================
    console.log('📝 Step 3: Opening a block modal...');

    // Wait for blocks to load - look for block code F006-001
    await page.waitForSelector('text=F006-001', { timeout: 10000 });
    console.log('   Found block F006-001');

    // Click on the block card with GROWING status (F006-001)
    // The block card contains both the block code and GROWING text
    const blockCard = await page.locator('text=F006-001').first();
    await blockCard.click();
    await delay(2000);
    console.log('✅ Block modal opened\n');

    // Take screenshot of modal
    await page.screenshot({ path: 'test-screenshots/01-block-modal.png' });

    // ========================================
    // Step 4: Click on Automation tab
    // ========================================
    console.log('📝 Step 4: Clicking on Automation tab...');

    // Find and click the Automation tab
    const automationTab = await page.locator('text=Automation').first();
    await automationTab.click();
    await delay(1500);
    console.log('✅ Automation tab clicked\n');

    // Take screenshot
    await page.screenshot({ path: 'test-screenshots/02-automation-tab.png' });

    // ========================================
    // Step 5: Configure IoT Controller
    // ========================================
    console.log('📝 Step 5: Configuring IoT Controller...');

    // Look for "Configure IoT Controller" button
    const configButton = await page.locator('button:has-text("Configure IoT Controller")').first();

    if (await configButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await configButton.click();
      await delay(1000);

      // Fill in IoT controller details
      const addressInput = await page.locator('input[placeholder*="192.168"], input[placeholder*="iot"]').first();
      await addressInput.fill('iot-simulator');

      const portInput = await page.locator('input[placeholder*="8090"], input[type="number"]').first();
      await portInput.fill('8090');

      console.log('   Filled address: iot-simulator:8090');

      // Take screenshot of config form
      await page.screenshot({ path: 'test-screenshots/03-config-form.png' });

      // Click Test Connection
      const testButton = await page.locator('button:has-text("Test")').first();
      if (await testButton.isVisible()) {
        await testButton.click();
        await delay(3000);
        console.log('   Test Connection clicked');
      }

      // Click Save
      const saveButton = await page.locator('button:has-text("Save")').first();
      await saveButton.click();
      await delay(3000);

      // Verify the config was saved by checking if "iot-simulator" is displayed
      const configText = await page.locator('text=iot-simulator').first().isVisible({ timeout: 5000 }).catch(() => false);
      if (configText) {
        console.log('✅ IoT Controller configured and saved successfully!\n');
      } else {
        console.log('⚠️ Save clicked but config may not have been saved\n');
      }
    } else {
      // Check if already configured (Edit button visible)
      const editButton = await page.locator('button:has-text("Edit")').first();
      if (await editButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('   IoT Controller already configured\n');
      } else {
        console.log('   No configuration button found\n');
      }
    }

    // Take screenshot after config
    await page.screenshot({ path: 'test-screenshots/04-after-config.png' });

    // ========================================
    // Step 6: Verify Sensor Data
    // ========================================
    console.log('📝 Step 6: Checking for sensor data...');
    await delay(2000);

    // Check for sensor-related text
    const hasSensorData = await page.locator('text=SHT20, text=temperature, text=humidity, text=Soil').first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasSensorData) {
      console.log('✅ Sensor data is displaying!\n');
    } else {
      console.log('⚠️ Sensor data not visible (may need controller connection)\n');
    }

    // Take screenshot of sensors
    await page.screenshot({ path: 'test-screenshots/05-sensors.png' });

    // ========================================
    // Step 7: Test Relay Toggle
    // ========================================
    console.log('📝 Step 7: Looking for relay controls...');

    const relayButton = await page.locator('button:has-text("Turn ON"), button:has-text("Turn OFF")').first();

    if (await relayButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      const buttonText = await relayButton.textContent();
      console.log(`   Found relay button: "${buttonText}"`);

      await relayButton.click();
      await delay(2000);

      const newButtonText = await relayButton.textContent();
      console.log(`   After click: "${newButtonText}"`);

      if (buttonText !== newButtonText) {
        console.log('✅ Relay toggled successfully!\n');
      }
    } else {
      console.log('⚠️ No relay toggle buttons visible\n');
    }

    // Take final screenshot
    await page.screenshot({ path: 'test-screenshots/06-final.png' });

    // ========================================
    // Step 8: Check Refresh functionality
    // ========================================
    console.log('📝 Step 8: Testing refresh button...');

    // Use more specific selector - find Refresh button INSIDE the modal (near RefreshCw icon)
    const refreshButton = await page.locator('.sc-bXhvzi:has-text("Refresh")').first();
    if (await refreshButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Use force:true to click even if slightly covered
      await refreshButton.click({ force: true });
      await delay(2000);
      console.log('✅ Refresh button clicked\n');
    } else {
      console.log('⚠️ Refresh button not visible in modal\n');
    }

    await page.screenshot({ path: 'test-screenshots/07-after-refresh.png' });

    console.log('🎉 TEST COMPLETE!\n');
    console.log('Screenshots saved in test-screenshots/');
    console.log('- 01-block-modal.png');
    console.log('- 02-automation-tab.png');
    console.log('- 03-config-form.png');
    console.log('- 04-after-config.png');
    console.log('- 05-sensors.png');
    console.log('- 06-final.png');
    console.log('- 07-after-refresh.png');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    await page.screenshot({ path: 'test-screenshots/error.png' });
    console.log('📸 Error screenshot saved: test-screenshots/error.png');
  } finally {
    console.log('\n⏳ Keeping browser open for 20 seconds...');
    await delay(20000);
    await browser.close();
  }
}

const fs = require('fs');
if (!fs.existsSync('test-screenshots')) {
  fs.mkdirSync('test-screenshots');
}

runTest().catch(console.error);
