const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('🚀 Starting Plant Manager UI Test - FINAL VERSION\n');
  console.log('Target URL: http://localhost/farm/plants\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Create screenshots directory
  const screenshotsDir = path.join(__dirname, 'plant-manager-test-screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
  }

  // Collect console logs and errors
  const consoleLogs = [];
  const errors = [];
  const consoleErrors = [];

  page.on('console', msg => {
    const logEntry = `[${msg.type().toUpperCase()}] ${msg.text()}`;
    consoleLogs.push(logEntry);

    if (msg.type() === 'error') {
      consoleErrors.push(logEntry);
      console.log('🚨 CONSOLE ERROR:', logEntry);
    } else if (msg.type() === 'warning') {
      console.log('⚠️  CONSOLE WARNING:', logEntry);
    }
  });

  page.on('pageerror', error => {
    const errorMsg = {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    };
    errors.push(errorMsg);
    console.error('\n🚨 PAGE ERROR:');
    console.error(`   Message: ${error.message}`);
    console.error(`   Stack: ${error.stack}\n`);
  });

  // Track network errors
  page.on('response', response => {
    if (!response.ok() && response.url().includes('/api/')) {
      const errorLog = `API ERROR: ${response.status()} ${response.statusText()} - ${response.url()}`;
      consoleErrors.push(errorLog);
      console.log('🚨', errorLog);
    }
  });

  try {
    // ===== STEP 1: Navigate to the application =====
    console.log('📍 STEP 1: Navigating to http://localhost...');
    await page.goto('http://localhost', { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: path.join(screenshotsDir, 'step-01-homepage.png'), fullPage: true });
    console.log('   ✅ Homepage loaded\n');

    // ===== STEP 2: Login =====
    console.log('📍 STEP 2: Logging in...');
    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
    await page.fill('input[type="email"], input[name="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"], input[name="password"]', 'SuperAdmin123!');
    await page.screenshot({ path: path.join(screenshotsDir, 'step-02-login-form.png'), fullPage: true });

    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    await page.screenshot({ path: path.join(screenshotsDir, 'step-03-after-login.png'), fullPage: true });
    console.log('   ✅ Login successful\n');

    // ===== STEP 3: Navigate to Plant Data Library =====
    console.log('📍 STEP 3: Navigating to Plant Data Library (/farm/plants)...');
    await page.goto('http://localhost/farm/plants', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000); // Wait for data to load
    await page.screenshot({ path: path.join(screenshotsDir, 'step-04-plant-data-library.png'), fullPage: true });
    console.log('   ✅ Plant Data Library loaded\n');

    // Check page title and content
    const pageTitle = await page.textContent('h1, h2, [class*="title"]').catch(() => 'No title found');
    console.log(`   Page Title: ${pageTitle}`);

    // ===== STEP 4: Find plant cards/items =====
    console.log('\n📍 STEP 4: Looking for plant items...');

    // Check different possible structures
    const plantCardSelectors = [
      '[data-testid*="plant"]',
      '[class*="PlantCard"]',
      '[class*="plant-card"]',
      'article',
      '[class*="Card"]'
    ];

    let plantCards = [];
    for (const selector of plantCardSelectors) {
      plantCards = await page.$$(selector);
      if (plantCards.length > 0) {
        console.log(`   ✅ Found ${plantCards.length} items using selector: ${selector}`);
        break;
      }
    }

    if (plantCards.length === 0) {
      console.log('   ⚠️  No plant cards found. Checking page structure...');

      const pageStructure = await page.evaluate(() => {
        return {
          buttons: Array.from(document.querySelectorAll('button')).map(b => ({
            text: b.textContent?.trim(),
            className: b.className
          })).filter(b => b.text),
          headings: Array.from(document.querySelectorAll('h1, h2, h3, h4')).map(h => h.textContent?.trim()),
          mainContent: document.querySelector('main')?.innerHTML?.substring(0, 500)
        };
      });

      console.log('\n   📋 Page Structure:');
      console.log('   Buttons:', JSON.stringify(pageStructure.buttons.slice(0, 10), null, 2));
      console.log('   Headings:', JSON.stringify(pageStructure.headings, null, 2));
    }

    // ===== STEP 5: Find and click Edit button =====
    console.log('\n📍 STEP 5: Looking for Edit button on any plant...');

    const editButtonSelectors = [
      'button:has-text("Edit")',
      '[aria-label*="Edit"]',
      '[aria-label*="edit"]',
      'button[title*="Edit"]',
      'button[title*="edit"]',
      'button:has(svg[data-icon="edit"])',
      'button:has(svg[class*="edit"])',
      '[data-testid*="edit"]'
    ];

    let editButtonFound = false;
    let editButtonSelector = null;

    for (const selector of editButtonSelectors) {
      try {
        const button = page.locator(selector).first();
        if (await button.isVisible({ timeout: 1000 })) {
          editButtonSelector = selector;
          editButtonFound = true;
          console.log(`   ✅ Found Edit button using: ${selector}`);
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }

    if (!editButtonFound) {
      // Get all buttons to see what's available
      const allButtons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button')).map(btn => ({
          text: btn.textContent?.trim(),
          title: btn.title,
          ariaLabel: btn.getAttribute('aria-label'),
          className: btn.className,
          innerHTML: btn.innerHTML.substring(0, 100)
        })).filter(b => b.text || b.ariaLabel || b.title);
      });

      console.log('\n   ⚠️  Edit button not found. All available buttons:');
      console.log(JSON.stringify(allButtons, null, 2));

      await page.screenshot({ path: path.join(screenshotsDir, 'step-05-no-edit-button.png'), fullPage: true });
    } else {
      // Click the edit button
      await page.screenshot({ path: path.join(screenshotsDir, 'step-05-before-edit-click.png'), fullPage: true });
      console.log('\n   🖱️  Clicking Edit button...');

      await page.locator(editButtonSelector).first().click();
      await page.waitForTimeout(1000); // Wait for modal to appear

      await page.screenshot({ path: path.join(screenshotsDir, 'step-06-after-edit-click.png'), fullPage: true });
      console.log('   ✅ Edit button clicked\n');

      // ===== STEP 6: Analyze Edit Modal =====
      console.log('📍 STEP 6: Analyzing Edit Modal...\n');

      // Check if modal appeared
      const modalVisible = await page.evaluate(() => {
        const modals = document.querySelectorAll('[role="dialog"], [class*="Modal"], [class*="modal"]');
        return modals.length > 0 && Array.from(modals).some(m => m.offsetParent !== null);
      });

      console.log(`   Modal Visible: ${modalVisible ? '✅ YES' : '❌ NO'}`);

      if (modalVisible) {
        // Get modal title
        const modalTitle = await page.evaluate(() => {
          const modal = document.querySelector('[role="dialog"], [class*="Modal"], [class*="modal"]');
          const title = modal?.querySelector('h1, h2, h3, h4, [class*="title"], [class*="Title"]');
          return title?.textContent?.trim() || 'No title found';
        });
        console.log(`   Modal Title: "${modalTitle}"\n`);

        // Get all form fields
        const formFields = await page.evaluate(() => {
          const modal = document.querySelector('[role="dialog"], [class*="Modal"], [class*="modal"]');
          if (!modal) return [];

          const inputs = Array.from(modal.querySelectorAll('input, textarea, select'));
          return inputs.map(input => {
            // Try multiple ways to find the label
            let label = null;

            // Method 1: <label> tag
            if (input.labels && input.labels[0]) {
              label = input.labels[0].textContent?.trim();
            }

            // Method 2: Previous sibling
            if (!label && input.previousElementSibling) {
              const prevText = input.previousElementSibling.textContent?.trim();
              if (prevText && prevText.length < 50) {
                label = prevText;
              }
            }

            // Method 3: Parent label
            if (!label) {
              const parentLabel = input.closest('label');
              if (parentLabel) {
                label = parentLabel.textContent?.trim().replace(input.value || '', '').trim();
              }
            }

            // Method 4: Closest div with label
            if (!label) {
              const container = input.closest('div');
              const containerLabel = container?.querySelector('label, [class*="label"], [class*="Label"]');
              if (containerLabel) {
                label = containerLabel.textContent?.trim();
              }
            }

            return {
              type: input.type || input.tagName.toLowerCase(),
              name: input.name || null,
              id: input.id || null,
              placeholder: input.placeholder || null,
              value: input.value ? input.value.substring(0, 50) : null,
              label: label,
              ariaLabel: input.getAttribute('aria-label'),
              required: input.required
            };
          }).filter(f => f.type !== 'hidden');
        });

        console.log('   📋 FORM FIELDS IN EDIT MODAL:');
        console.log('   ===============================\n');

        if (formFields.length === 0) {
          console.log('   ⚠️  NO FORM FIELDS FOUND IN MODAL\n');
        } else {
          formFields.forEach((field, idx) => {
            console.log(`   ${idx + 1}. Field:`);
            console.log(`      Label: ${field.label || field.ariaLabel || 'NO LABEL'}`);
            console.log(`      Type: ${field.type}`);
            console.log(`      Name: ${field.name || 'none'}`);
            console.log(`      ID: ${field.id || 'none'}`);
            console.log(`      Placeholder: ${field.placeholder || 'none'}`);
            console.log(`      Required: ${field.required ? 'YES' : 'NO'}`);
            if (field.value) console.log(`      Value: ${field.value}`);
            console.log('');
          });
        }

        // ===== CRITICAL CHECK: Fertilizer & Pesticide Schedule Fields =====
        console.log('\n   🔍 CRITICAL FIELD CHECK:');
        console.log('   ========================\n');

        const hasFertilizerSchedule = formFields.some(f => {
          const checkString = `${f.name} ${f.id} ${f.label} ${f.ariaLabel} ${f.placeholder}`.toLowerCase();
          return checkString.includes('fertilizer') && checkString.includes('schedule');
        });

        const hasPesticideSchedule = formFields.some(f => {
          const checkString = `${f.name} ${f.id} ${f.label} ${f.ariaLabel} ${f.placeholder}`.toLowerCase();
          return checkString.includes('pesticide') && checkString.includes('schedule');
        });

        const hasFertilizerAny = formFields.some(f => {
          const checkString = `${f.name} ${f.id} ${f.label} ${f.ariaLabel} ${f.placeholder}`.toLowerCase();
          return checkString.includes('fertilizer');
        });

        const hasPesticideAny = formFields.some(f => {
          const checkString = `${f.name} ${f.id} ${f.label} ${f.ariaLabel} ${f.placeholder}`.toLowerCase();
          return checkString.includes('pesticide');
        });

        console.log(`   Fertilizer Schedule Field: ${hasFertilizerSchedule ? '✅ PRESENT' : '❌ MISSING'}`);
        console.log(`   Pesticide Schedule Field: ${hasPesticideSchedule ? '✅ PRESENT' : '❌ MISSING'}`);
        console.log(`   Any Fertilizer Field: ${hasFertilizerAny ? '✅ PRESENT' : '❌ MISSING'}`);
        console.log(`   Any Pesticide Field: ${hasPesticideAny ? '✅ PRESENT' : '❌ MISSING'}`);

        await page.screenshot({ path: path.join(screenshotsDir, 'step-07-edit-modal-full.png'), fullPage: true });

        // Save form fields to JSON
        fs.writeFileSync(
          path.join(__dirname, 'edit-modal-form-fields.json'),
          JSON.stringify(formFields, null, 2)
        );
        console.log('\n   💾 Form fields saved to: edit-modal-form-fields.json');
      }
    }

    // ===== STEP 7: Check for Console Errors =====
    console.log('\n\n📍 STEP 7: Console Errors Summary\n');
    console.log('   ================================\n');

    if (errors.length > 0) {
      console.log(`   🚨 ${errors.length} PAGE ERRORS DETECTED:\n`);
      errors.forEach((err, idx) => {
        console.log(`   ${idx + 1}. ${err.message}`);
        if (err.stack) {
          console.log(`      Stack: ${err.stack.split('\n').slice(0, 3).join('\n      ')}`);
        }
        console.log('');
      });
    } else {
      console.log('   ✅ No page errors detected');
    }

    if (consoleErrors.length > 0) {
      console.log(`\n   ⚠️  ${consoleErrors.length} CONSOLE ERRORS:\n`);
      consoleErrors.forEach((log, idx) => {
        console.log(`   ${idx + 1}. ${log}`);
      });
    } else {
      console.log('   ✅ No console errors detected');
    }

    // ===== FINAL SUMMARY =====
    console.log('\n\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST SUMMARY                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`📸 Screenshots Directory: ${screenshotsDir}`);
    console.log(`📝 Total Console Logs: ${consoleLogs.length}`);
    console.log(`❌ Page Errors: ${errors.length}`);
    console.log(`⚠️  Console Errors: ${consoleErrors.length}`);
    console.log(`🖼️  Screenshots Captured: ${fs.readdirSync(screenshotsDir).length}`);

    // Save full report
    const report = {
      timestamp: new Date().toISOString(),
      testUrl: 'http://localhost/farm/plants',
      screenshotsDirectory: screenshotsDir,
      summary: {
        totalConsoleLogs: consoleLogs.length,
        totalPageErrors: errors.length,
        totalConsoleErrors: consoleErrors.length,
        editButtonFound: editButtonFound
      },
      consoleLogs: consoleLogs,
      pageErrors: errors,
      consoleErrors: consoleErrors
    };

    fs.writeFileSync(
      path.join(__dirname, 'plant-manager-test-report.json'),
      JSON.stringify(report, null, 2)
    );

    console.log('\n✅ Full report saved to: plant-manager-test-report.json');
    console.log('✅ Form fields saved to: edit-modal-form-fields.json');

  } catch (error) {
    console.error('\n\n❌ TEST FAILED WITH ERROR:');
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
    await page.screenshot({ path: path.join(screenshotsDir, 'CRITICAL-ERROR.png'), fullPage: true });
  } finally {
    await browser.close();
    console.log('\n🏁 Test completed\n');
  }
})();
