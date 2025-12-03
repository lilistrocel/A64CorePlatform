const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('🚀 Starting Plant Manager UI Test v2...\n');

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
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(logEntry);
    }
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
    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
    await page.fill('input[type="email"], input[name="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"], input[name="password"]', 'SuperAdmin123!');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    await page.screenshot({ path: path.join(screenshotsDir, '02-after-login.png'), fullPage: true });
    console.log('✅ Login successful\n');

    // Step 3: Try Farm Manager first
    console.log('📍 Step 3: Navigating to Farm Manager...');
    await page.waitForTimeout(1000);

    const farmManagerLink = await page.locator('text=Farm Manager').first();
    await farmManagerLink.click();
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    await page.screenshot({ path: path.join(screenshotsDir, '03-farm-manager.png'), fullPage: true });
    console.log('✅ Farm Manager page loaded\n');

    // Check if there's a Plant Manager or Plant Data option here
    console.log('📍 Step 4: Looking for Plant Manager/Plant Data links...');
    await page.waitForTimeout(1000);

    const pageContent = await page.content();
    const hasPlantManager = pageContent.toLowerCase().includes('plant manager') ||
                           pageContent.toLowerCase().includes('plant data');

    console.log(`Plant Manager/Data found on page: ${hasPlantManager}`);

    // Get all links on the page
    const allLinks = await page.$$eval('a', links =>
      links.map(l => ({
        text: l.textContent.trim(),
        href: l.href,
        visible: l.offsetParent !== null
      })).filter(l => l.visible && l.text)
    );

    console.log('\n📋 Available links on Farm Manager page:');
    console.log(JSON.stringify(allLinks, null, 2));

    // Look for Plant-related links
    const plantLinks = allLinks.filter(l =>
      l.text.toLowerCase().includes('plant') ||
      l.href.toLowerCase().includes('plant')
    );

    if (plantLinks.length > 0) {
      console.log('\n🌱 Found Plant-related links:');
      console.log(JSON.stringify(plantLinks, null, 2));

      // Click the first plant link
      console.log('\n📍 Step 5: Clicking on Plant link...');
      await page.click(`text=${plantLinks[0].text}`);
      await page.waitForLoadState('networkidle', { timeout: 15000 });
      await page.screenshot({ path: path.join(screenshotsDir, '04-plant-page.png'), fullPage: true });
      console.log('✅ Plant page loaded\n');
    } else {
      console.log('\n⚠️  No Plant links found. Checking Operations page...\n');

      // Try Operations
      await page.goto('http://localhost/operations', { waitUntil: 'networkidle', timeout: 30000 });
      await page.screenshot({ path: path.join(screenshotsDir, '04-operations-page.png'), fullPage: true });

      const operationsLinks = await page.$$eval('a', links =>
        links.map(l => ({
          text: l.textContent.trim(),
          href: l.href,
          visible: l.offsetParent !== null
        })).filter(l => l.visible && l.text)
      );

      console.log('📋 Links on Operations page:');
      console.log(JSON.stringify(operationsLinks, null, 2));

      const plantLinksOps = operationsLinks.filter(l =>
        l.text.toLowerCase().includes('plant') ||
        l.href.toLowerCase().includes('plant')
      );

      if (plantLinksOps.length > 0) {
        console.log('\n🌱 Found Plant links on Operations:');
        console.log(JSON.stringify(plantLinksOps, null, 2));
        await page.click(`text=${plantLinksOps[0].text}`);
        await page.waitForLoadState('networkidle', { timeout: 15000 });
        await page.screenshot({ path: path.join(screenshotsDir, '05-plant-page-from-ops.png'), fullPage: true });
      } else {
        // Try direct URL
        console.log('\n⚠️  Trying direct URLs...');
        const plantUrls = [
          'http://localhost/plant-manager',
          'http://localhost/plants',
          'http://localhost/plant-data',
          'http://localhost/farm/plants',
          'http://localhost/farm/plant-manager',
          'http://localhost/farm/plant-data'
        ];

        for (const url of plantUrls) {
          console.log(`Trying: ${url}`);
          const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => null);
          if (response && response.ok()) {
            console.log(`✅ Found Plant Manager at: ${url}`);
            await page.screenshot({ path: path.join(screenshotsDir, '05-plant-page-direct.png'), fullPage: true });
            break;
          }
        }
      }
    }

    // Step 6: Look for Edit buttons
    console.log('\n📍 Step 6: Looking for Edit buttons...');
    await page.waitForTimeout(2000);

    // Get all buttons
    const buttons = await page.$$eval('button, [role="button"]', btns =>
      btns.map(b => ({
        text: b.textContent.trim(),
        className: b.className,
        visible: b.offsetParent !== null
      })).filter(b => b.visible)
    );

    console.log('📋 All buttons on page:');
    console.log(JSON.stringify(buttons.slice(0, 20), null, 2)); // First 20 buttons

    // Look for edit buttons
    const editButtons = buttons.filter(b =>
      b.text.toLowerCase().includes('edit') ||
      b.className.toLowerCase().includes('edit')
    );

    console.log('\n✏️ Edit buttons found:');
    console.log(JSON.stringify(editButtons, null, 2));

    if (editButtons.length > 0) {
      console.log('\n📍 Step 7: Clicking first Edit button...');
      await page.screenshot({ path: path.join(screenshotsDir, '06-before-edit-click.png'), fullPage: true });

      // Click the first edit button
      const editSelector = editButtons[0].text ? `button:has-text("${editButtons[0].text}")` : 'button[class*="edit"]';
      await page.click(editSelector);
      await page.waitForTimeout(1000);

      await page.screenshot({ path: path.join(screenshotsDir, '07-after-edit-click.png'), fullPage: true });
      console.log('✅ Clicked Edit button\n');

      // Step 8: Analyze the edit modal/form
      console.log('📍 Step 8: Analyzing edit form...');
      await page.waitForTimeout(1000);

      // Get all form fields
      const formFields = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
        return inputs.map(input => ({
          type: input.type || input.tagName.toLowerCase(),
          name: input.name,
          id: input.id,
          placeholder: input.placeholder,
          value: input.value,
          label: input.labels?.[0]?.textContent?.trim() ||
                 input.previousElementSibling?.textContent?.trim() ||
                 input.closest('label')?.textContent?.trim() || null
        })).filter(f => f.type !== 'hidden');
      });

      console.log('\n📋 Form Fields:');
      console.log(JSON.stringify(formFields, null, 2));

      // Check for specific fields
      const hasFertilizerSchedule = formFields.some(f =>
        (f.name?.toLowerCase().includes('fertilizer') ||
        f.id?.toLowerCase().includes('fertilizer') ||
        f.label?.toLowerCase().includes('fertilizer')) &&
        (f.name?.toLowerCase().includes('schedule') ||
        f.id?.toLowerCase().includes('schedule') ||
        f.label?.toLowerCase().includes('schedule'))
      );

      const hasPesticideSchedule = formFields.some(f =>
        (f.name?.toLowerCase().includes('pesticide') ||
        f.id?.toLowerCase().includes('pesticide') ||
        f.label?.toLowerCase().includes('pesticide')) &&
        (f.name?.toLowerCase().includes('schedule') ||
        f.id?.toLowerCase().includes('schedule') ||
        f.label?.toLowerCase().includes('schedule'))
      );

      console.log(`\n🔍 Field Analysis:`);
      console.log(`   Fertilizer Schedule Field: ${hasFertilizerSchedule ? '✅ PRESENT' : '❌ MISSING'}`);
      console.log(`   Pesticide Schedule Field: ${hasPesticideSchedule ? '✅ PRESENT' : '❌ MISSING'}`);

      // Capture console errors during modal interaction
      console.log('\n📍 Step 9: Checking for console errors...');
      if (errors.length > 0) {
        console.log(`\n🚨 ${errors.length} PAGE ERRORS DETECTED:`);
        errors.forEach((err, idx) => {
          console.log(`\n${idx + 1}. ${err}`);
        });
      } else {
        console.log('✅ No page errors detected');
      }

      // Check console logs for errors
      const consoleErrors = consoleLogs.filter(log =>
        log.includes('[error]') || log.includes('[warning]')
      );

      if (consoleErrors.length > 0) {
        console.log(`\n⚠️  ${consoleErrors.length} CONSOLE ERRORS/WARNINGS:`);
        consoleErrors.forEach((log, idx) => {
          console.log(`${idx + 1}. ${log}`);
        });
      }

      await page.screenshot({ path: path.join(screenshotsDir, '08-edit-modal-full.png'), fullPage: true });
    } else {
      console.log('\n❌ No Edit buttons found on the page');
      await page.screenshot({ path: path.join(screenshotsDir, '06-no-edit-buttons.png'), fullPage: true });
    }

    // Final summary
    console.log('\n\n📊 TEST SUMMARY');
    console.log('================\n');
    console.log(`📸 Screenshots: ${screenshotsDir}`);
    console.log(`📝 Console logs: ${consoleLogs.length}`);
    console.log(`❌ Page errors: ${errors.length}`);
    console.log(`⚠️  Console errors: ${consoleLogs.filter(l => l.includes('[error]')).length}`);

    // Save full report
    const report = {
      timestamp: new Date().toISOString(),
      screenshotsDirectory: screenshotsDir,
      consoleLogs,
      errors,
      summary: {
        totalConsoleLogs: consoleLogs.length,
        totalErrors: errors.length,
        consoleErrors: consoleLogs.filter(l => l.includes('[error]')).length
      }
    };

    fs.writeFileSync(
      path.join(__dirname, 'test-plant-manager-report.json'),
      JSON.stringify(report, null, 2)
    );

    console.log('\n✅ Full report saved to test-plant-manager-report.json');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    await page.screenshot({ path: path.join(screenshotsDir, 'error-screenshot.png'), fullPage: true });
  } finally {
    await browser.close();
    console.log('\n🏁 Test completed');
  }
})();
