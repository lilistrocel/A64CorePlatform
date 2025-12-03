const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('🚀 Plant Edit Modal Complete Analysis\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  const screenshotsDir = path.join(__dirname, 'plant-edit-modal-complete');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
  }

  const consoleLogs = [];
  const errors = [];

  page.on('console', msg => {
    const logEntry = `[${msg.type().toUpperCase()}] ${msg.text()}`;
    consoleLogs.push(logEntry);
    if (msg.type() === 'error') {
      console.log('🚨 CONSOLE ERROR:', logEntry);
    }
  });

  page.on('pageerror', error => {
    errors.push({ message: error.message, stack: error.stack });
    console.error('🚨 PAGE ERROR:', error.message);
  });

  try {
    // Login
    console.log('Logging in...');
    await page.goto('http://localhost', { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('input[type="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"]', 'SuperAdmin123!');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    console.log('✅ Logged in\n');

    // Navigate to Plant Data Library
    console.log('Navigating to Plant Data Library...');
    await page.goto('http://localhost/farm/plants', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    console.log('✅ Plant Data Library loaded\n');

    // Click Edit button
    console.log('Clicking Edit button...');
    await page.click('button:has-text("Edit")');
    await page.waitForTimeout(1500);
    console.log('✅ Edit button clicked\n');

    // Wait for modal to be fully visible
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 });
    console.log('✅ Modal is visible\n');

    // Take screenshot of modal top
    await page.screenshot({ path: path.join(screenshotsDir, '01-modal-top.png'), fullPage: false });

    // Get modal element
    const modal = await page.locator('[role="dialog"]');

    // Scroll within modal to see all content
    console.log('Scrolling through modal to capture all content...\n');

    // Get scrollable container within modal
    const modalContent = await page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"]');
      const scrollable = modal.querySelector('[class*="scroll"], [style*="overflow"]') || modal;
      return {
        scrollHeight: scrollable.scrollHeight,
        clientHeight: scrollable.clientHeight,
        hasScroll: scrollable.scrollHeight > scrollable.clientHeight
      };
    });

    console.log(`Modal scroll info: ${JSON.stringify(modalContent, null, 2)}\n`);

    if (modalContent.hasScroll) {
      // Take multiple screenshots while scrolling
      for (let i = 0; i < 5; i++) {
        await page.evaluate((scrollPosition) => {
          const modal = document.querySelector('[role="dialog"]');
          const scrollable = modal.querySelector('[class*="scroll"], [style*="overflow"]') || modal;
          scrollable.scrollTop = scrollPosition;
        }, i * 200);
        await page.waitForTimeout(300);
        await page.screenshot({
          path: path.join(screenshotsDir, `02-modal-scroll-${i}.png`),
          fullPage: false
        });
      }
    }

    // Scroll to bottom of modal
    await page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"]');
      const scrollable = modal.querySelector('[class*="scroll"], [style*="overflow"]') || modal;
      scrollable.scrollTop = scrollable.scrollHeight;
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotsDir, '03-modal-bottom.png'), fullPage: false });

    console.log('📸 Screenshots captured\n');

    // Now extract ALL fields from the modal
    console.log('📋 Extracting ALL form fields from Edit Modal...\n');

    const allFields = await page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"]');
      if (!modal) return { error: 'Modal not found' };

      const results = {
        modalTitle: modal.querySelector('h1, h2, h3, [class*="Title"]')?.textContent?.trim(),
        sections: [],
        allInputs: [],
        textContent: modal.textContent
      };

      // Get all section headings
      const headings = modal.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="section"], [class*="Section"]');
      results.sectionHeadings = Array.from(headings).map(h => h.textContent?.trim());

      // Get ALL inputs, textareas, and selects
      const inputs = modal.querySelectorAll('input, textarea, select');

      inputs.forEach(input => {
        if (input.type === 'hidden') return;

        // Try multiple strategies to find label
        let label = null;
        let context = '';

        // Strategy 1: Proper label element
        if (input.labels && input.labels[0]) {
          label = input.labels[0].textContent?.trim();
        }

        // Strategy 2: aria-label
        if (!label && input.getAttribute('aria-label')) {
          label = input.getAttribute('aria-label');
        }

        // Strategy 3: Previous sibling text
        if (!label) {
          let prev = input.previousElementSibling;
          while (prev && !label) {
            const text = prev.textContent?.trim();
            if (text && text.length < 100 && !text.includes('\n')) {
              label = text;
              break;
            }
            prev = prev.previousElementSibling;
          }
        }

        // Strategy 4: Parent container label
        if (!label) {
          const container = input.closest('div');
          const containerLabel = container?.querySelector('label');
          if (containerLabel) {
            label = containerLabel.textContent?.trim();
          }
        }

        // Strategy 5: Look at nearby text
        if (!label) {
          const parent = input.parentElement;
          const parentText = parent?.textContent?.trim();
          if (parentText && parentText.length < 100) {
            label = parentText.replace(input.value || '', '').trim();
          }
        }

        // Get surrounding context
        const grandparent = input.closest('div[class], section');
        if (grandparent) {
          const gpText = grandparent.textContent?.substring(0, 200);
          context = gpText;
        }

        results.allInputs.push({
          type: input.type || input.tagName.toLowerCase(),
          name: input.name || null,
          id: input.id || null,
          placeholder: input.placeholder || null,
          value: input.value ? input.value.substring(0, 100) : null,
          label: label,
          className: input.className,
          required: input.required,
          context: context?.substring(0, 150)
        });
      });

      return results;
    });

    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('                  EDIT MODAL ANALYSIS\n');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`Modal Title: "${allFields.modalTitle}"\n`);

    console.log(`Section Headings Found: ${allFields.sectionHeadings?.length || 0}`);
    if (allFields.sectionHeadings) {
      allFields.sectionHeadings.forEach((heading, idx) => {
        console.log(`  ${idx + 1}. ${heading}`);
      });
    }
    console.log('');

    console.log(`Total Form Fields: ${allFields.allInputs.length}\n`);

    console.log('DETAILED FIELD LIST:');
    console.log('═══════════════════════════════════════════════════════════\n');

    allFields.allInputs.forEach((field, idx) => {
      console.log(`${idx + 1}. ${field.label || 'UNLABELED FIELD'}`);
      console.log(`   Type: ${field.type}`);
      console.log(`   Name: ${field.name || 'none'}`);
      console.log(`   ID: ${field.id || 'none'}`);
      if (field.placeholder) console.log(`   Placeholder: ${field.placeholder}`);
      if (field.value) console.log(`   Current Value: ${field.value}`);
      if (field.required) console.log(`   Required: YES`);
      console.log('');
    });

    // Critical check for fertilizer and pesticide schedule
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('       CRITICAL: FERTILIZER & PESTICIDE SCHEDULE CHECK');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Check in field labels, names, IDs, placeholders
    const fertilizerFields = allFields.allInputs.filter(f => {
      const searchStr = `${f.label} ${f.name} ${f.id} ${f.placeholder} ${f.context}`.toLowerCase();
      return searchStr.includes('fertilizer');
    });

    const pesticideFields = allFields.allInputs.filter(f => {
      const searchStr = `${f.label} ${f.name} ${f.id} ${f.placeholder} ${f.context}`.toLowerCase();
      return searchStr.includes('pesticide');
    });

    const fertilizerScheduleFields = allFields.allInputs.filter(f => {
      const searchStr = `${f.label} ${f.name} ${f.id} ${f.placeholder} ${f.context}`.toLowerCase();
      return searchStr.includes('fertilizer') && searchStr.includes('schedule');
    });

    const pesticideScheduleFields = allFields.allInputs.filter(f => {
      const searchStr = `${f.label} ${f.name} ${f.id} ${f.placeholder} ${f.context}`.toLowerCase();
      return searchStr.includes('pesticide') && searchStr.includes('schedule');
    });

    console.log(`Fertilizer-related fields: ${fertilizerFields.length > 0 ? '✅ FOUND' : '❌ NONE'}`);
    if (fertilizerFields.length > 0) {
      fertilizerFields.forEach(f => {
        console.log(`  - ${f.label || f.name || f.id || 'Unlabeled'} (${f.type})`);
      });
    }

    console.log(`\nPesticide-related fields: ${pesticideFields.length > 0 ? '✅ FOUND' : '❌ NONE'}`);
    if (pesticideFields.length > 0) {
      pesticideFields.forEach(f => {
        console.log(`  - ${f.label || f.name || f.id || 'Unlabeled'} (${f.type})`);
      });
    }

    console.log(`\nFertilizer SCHEDULE fields: ${fertilizerScheduleFields.length > 0 ? '✅ FOUND' : '❌ MISSING'}`);
    if (fertilizerScheduleFields.length > 0) {
      fertilizerScheduleFields.forEach(f => {
        console.log(`  - ${f.label || f.name || f.id} (${f.type})`);
      });
    }

    console.log(`\nPesticide SCHEDULE fields: ${pesticideScheduleFields.length > 0 ? '✅ FOUND' : '❌ MISSING'}`);
    if (pesticideScheduleFields.length > 0) {
      pesticideScheduleFields.forEach(f => {
        console.log(`  - ${f.label || f.name || f.id} (${f.type})`);
      });
    }

    // Also check if these terms appear ANYWHERE in the modal text
    console.log('\n\nText Content Search:');
    console.log('───────────────────────────────────────────────────────────');
    const modalText = allFields.textContent.toLowerCase();
    console.log(`"fertilizer" appears in modal: ${modalText.includes('fertilizer') ? '✅ YES' : '❌ NO'}`);
    console.log(`"pesticide" appears in modal: ${modalText.includes('pesticide') ? '✅ YES' : '❌ NO'}`);
    console.log(`"fertilizer schedule" appears in modal: ${modalText.includes('fertilizer schedule') ? '✅ YES' : '❌ NO'}`);
    console.log(`"pesticide schedule" appears in modal: ${modalText.includes('pesticide schedule') ? '✅ YES' : '❌ NO'}`);

    // Console errors summary
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('                   CONSOLE ERRORS');
    console.log('═══════════════════════════════════════════════════════════\n');

    const consoleErrors = consoleLogs.filter(log => log.includes('[ERROR]'));
    if (consoleErrors.length > 0) {
      console.log(`Found ${consoleErrors.length} console error(s):\n`);
      consoleErrors.forEach((err, idx) => {
        console.log(`${idx + 1}. ${err}\n`);
      });
    } else {
      console.log('✅ No console errors');
    }

    if (errors.length > 0) {
      console.log(`\nFound ${errors.length} page error(s):\n`);
      errors.forEach((err, idx) => {
        console.log(`${idx + 1}. ${err.message}\n`);
      });
    } else {
      console.log('✅ No page errors');
    }

    // Save complete report
    const report = {
      timestamp: new Date().toISOString(),
      modalAnalysis: allFields,
      fertilizerFields: fertilizerFields,
      pesticideFields: pesticideFields,
      fertilizerScheduleFields: fertilizerScheduleFields,
      pesticideScheduleFields: pesticideScheduleFields,
      consoleErrors: consoleErrors,
      pageErrors: errors,
      screenshotsDirectory: screenshotsDir
    };

    fs.writeFileSync(
      path.join(__dirname, 'plant-edit-modal-complete-report.json'),
      JSON.stringify(report, null, 2)
    );

    console.log('\n✅ Complete report saved to: plant-edit-modal-complete-report.json');
    console.log(`✅ Screenshots saved to: ${screenshotsDir}/`);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    await page.screenshot({ path: path.join(screenshotsDir, 'ERROR.png'), fullPage: true });
  } finally {
    await browser.close();
    console.log('\n🏁 Analysis complete\n');
  }
})();
