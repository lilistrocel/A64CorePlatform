const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('🚀 Starting Plant Manager UI Test...\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Create screenshots directory
  const screenshotsDir = path.join(__dirname, 'test-screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
  }

  // Collect console logs and errors
  const consoleLogs = [];
  const errors = [];

  page.on('console', msg => {
    const logEntry = `[${msg.type()}] ${msg.text()}`;
    consoleLogs.push(logEntry);
    console.log(logEntry);
  });

  page.on('pageerror', error => {
    const errorMsg = `PAGE ERROR: ${error.message}\n${error.stack}`;
    errors.push(errorMsg);
    console.error(errorMsg);
  });

  try {
    // Step 1: Navigate to the application
    console.log('📍 Step 1: Navigating to http://localhost...');
    await page.goto('http://localhost', { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: path.join(screenshotsDir, '01-homepage.png'), fullPage: true });
    console.log('✅ Homepage loaded\n');

    // Step 2: Login
    console.log('📍 Step 2: Logging in...');

    // Wait for login form
    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });

    // Fill in credentials
    await page.fill('input[type="email"], input[name="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"], input[name="password"]', 'SuperAdmin123!');
    await page.screenshot({ path: path.join(screenshotsDir, '02-login-form-filled.png'), fullPage: true });

    // Click login button
    await page.click('button[type="submit"]');

    // Wait for navigation after login
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    await page.screenshot({ path: path.join(screenshotsDir, '03-after-login.png'), fullPage: true });
    console.log('✅ Login successful\n');

    // Step 3: Navigate to Plant Manager
    console.log('📍 Step 3: Navigating to Plant Manager...');

    // Wait a moment for the page to fully load
    await page.waitForTimeout(2000);

    // Try to find and click Plant Manager link
    // Check multiple possible selectors
    const plantManagerSelectors = [
      'text=Plant Manager',
      'a:has-text("Plant Manager")',
      '[href*="plant"]',
      'nav a:has-text("Plant")',
      'text=Plant Data',
      'a:has-text("Plant Data")'
    ];

    let foundPlantManager = false;
    for (const selector of plantManagerSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible({ timeout: 2000 })) {
          console.log(`Found Plant Manager using selector: ${selector}`);
          await element.click();
          foundPlantManager = true;
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }

    if (!foundPlantManager) {
      console.log('⚠️  Could not find Plant Manager link. Taking screenshot of current page...');
      await page.screenshot({ path: path.join(screenshotsDir, '04-plant-manager-not-found.png'), fullPage: true });

      // Get all navigation links
      const navLinks = await page.$$eval('a', links => links.map(l => ({ text: l.textContent, href: l.href })));
      console.log('Available navigation links:', JSON.stringify(navLinks, null, 2));
    } else {
      await page.waitForLoadState('networkidle', { timeout: 15000 });
      await page.screenshot({ path: path.join(screenshotsDir, '04-plant-manager-page.png'), fullPage: true });
      console.log('✅ Plant Manager page loaded\n');

      // Step 4: Find and click Edit button
      console.log('📍 Step 4: Finding Edit button for a plant...');

      // Wait for plant list to load
      await page.waitForTimeout(2000);

      // Try to find edit buttons
      const editSelectors = [
        'button:has-text("Edit")',
        '[aria-label*="edit"]',
        '[title*="edit"]',
        'button[class*="edit"]',
        'svg[class*="edit"]'
      ];

      let foundEditButton = false;
      for (const selector of editSelectors) {
        try {
          const element = await page.locator(selector).first();
          if (await element.isVisible({ timeout: 2000 })) {
            console.log(`Found Edit button using selector: ${selector}`);
            await page.screenshot({ path: path.join(screenshotsDir, '05-before-clicking-edit.png'), fullPage: true });

            await element.click();
            foundEditButton = true;
            console.log('✅ Clicked Edit button\n');
            break;
          }
        } catch (e) {
          // Try next selector
        }
      }

      if (!foundEditButton) {
        console.log('⚠️  Could not find Edit button. Taking screenshot...');
        await page.screenshot({ path: path.join(screenshotsDir, '05-edit-button-not-found.png'), fullPage: true });

        // Get page content structure
        const pageStructure = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          return buttons.map(b => ({ text: b.textContent, class: b.className }));
        });
        console.log('Available buttons:', JSON.stringify(pageStructure, null, 2));
      } else {
        // Wait for modal to appear
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(screenshotsDir, '06-edit-modal-opened.png'), fullPage: true });
        console.log('✅ Edit modal opened\n');

        // Step 5: Analyze the edit modal
        console.log('📍 Step 5: Analyzing edit modal fields...');

        // Get all form fields in the modal
        const formFields = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
          return inputs.map(input => ({
            type: input.type || input.tagName.toLowerCase(),
            name: input.name,
            id: input.id,
            placeholder: input.placeholder,
            value: input.value,
            label: input.labels?.[0]?.textContent || null
          }));
        });

        console.log('📋 Form Fields in Edit Modal:');
        console.log(JSON.stringify(formFields, null, 2));

        // Check for fertilizer and pesticide schedule fields
        const hasFertilizerSchedule = formFields.some(f =>
          f.name?.toLowerCase().includes('fertilizer') ||
          f.id?.toLowerCase().includes('fertilizer') ||
          f.label?.toLowerCase().includes('fertilizer')
        );

        const hasPesticideSchedule = formFields.some(f =>
          f.name?.toLowerCase().includes('pesticide') ||
          f.id?.toLowerCase().includes('pesticide') ||
          f.label?.toLowerCase().includes('pesticide')
        );

        console.log(`\n🔍 Fertilizer Schedule Field Present: ${hasFertilizerSchedule ? '✅ YES' : '❌ NO'}`);
        console.log(`🔍 Pesticide Schedule Field Present: ${hasPesticideSchedule ? '✅ YES' : '❌ NO'}`);

        await page.screenshot({ path: path.join(screenshotsDir, '07-edit-modal-full.png'), fullPage: true });
      }
    }

    // Final summary
    console.log('\n\n📊 TEST SUMMARY');
    console.log('================\n');

    console.log(`📸 Screenshots saved to: ${screenshotsDir}`);
    console.log(`📝 Total console logs: ${consoleLogs.length}`);
    console.log(`❌ Total errors: ${errors.length}\n`);

    if (errors.length > 0) {
      console.log('🚨 ERRORS ENCOUNTERED:');
      errors.forEach((err, idx) => {
        console.log(`\n${idx + 1}. ${err}`);
      });
    }

    // Save full report
    const report = {
      timestamp: new Date().toISOString(),
      screenshotsDirectory: screenshotsDir,
      consoleLogs,
      errors,
      summary: {
        totalConsoleLogs: consoleLogs.length,
        totalErrors: errors.length,
        testCompleted: foundEditButton || false
      }
    };

    fs.writeFileSync(
      path.join(__dirname, 'test-plant-manager-report.json'),
      JSON.stringify(report, null, 2)
    );

    console.log('\n✅ Full report saved to test-plant-manager-report.json');

  } catch (error) {
    console.error('❌ TEST FAILED:', error.message);
    console.error(error.stack);
    await page.screenshot({ path: path.join(screenshotsDir, 'error-screenshot.png'), fullPage: true });
  } finally {
    await browser.close();
    console.log('\n🏁 Test completed');
  }
})();
