const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Capture errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.log(`[CONSOLE ERROR]:`, msg.text());
    }
  });

  const networkErrors = [];
  page.on('requestfailed', request => {
    networkErrors.push(`${request.url()} - ${request.failure().errorText}`);
  });

  const httpErrors = [];
  page.on('response', response => {
    if (!response.ok() && !response.url().includes('favicon')) {
      httpErrors.push(`${response.url()} - ${response.status()}`);
    }
  });

  try {
    console.log('\n══════════════════════════════════════════════════════');
    console.log('  TESTING: Controllers & Relays Section Visibility');
    console.log('══════════════════════════════════════════════════════\n');

    console.log('Step 1: Login to https://a64core.com');
    await page.goto('https://a64core.com', { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"]', 'SuperAdmin123!');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    console.log('✓ Logged in successfully\n');

    console.log('Step 2: Navigate to Block Monitor');
    await page.click('text=Block Monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\step1-block-monitor.png', fullPage: true });
    console.log('✓ Block Monitor page loaded\n');

    console.log('Step 3: Select Al Ain Farm from dropdown');
    // Click the farm dropdown
    await page.click('text=Silal Domes');
    await page.waitForTimeout(1000);

    // Click Al Ain Farm option
    const alAinOption = await page.$('text=Al Ain Farm');
    if (alAinOption) {
      await alAinOption.click();
      console.log('✓ Clicked Al Ain Farm option');
    } else {
      // Try alternative selectors
      console.log('Trying alternative selectors for Al Ain Farm...');
      await page.click('[role="option"]:has-text("Al Ain")');
    }

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\step2-al-ain-selected.png', fullPage: true });
    console.log('✓ Al Ain Farm selected\n');

    // Verify blocks loaded
    const blockContent = await page.textContent('body');
    const hasBlocks = blockContent.includes('AG11') || blockContent.includes('F001-079');
    console.log(`Block AG11 visible: ${hasBlocks ? 'YES ✓' : 'NO ✗'}\n`);

    if (!hasBlocks) {
      console.log('⚠️  Blocks not showing, checking page content...');
      console.log(blockContent.substring(0, 1000));
      console.log('\nTrying to wait longer for blocks to load...');
      await page.waitForTimeout(5000);
    }

    console.log('Step 4: Click on block AG11 (F001-079)');

    // Try multiple strategies to click the block
    let blockClicked = false;

    // Strategy 1: Direct text click
    try {
      await page.click('text=AG11', { timeout: 5000 });
      blockClicked = true;
      console.log('✓ Clicked using text=AG11');
    } catch (e) {
      console.log('text=AG11 not clickable, trying next strategy...');
    }

    // Strategy 2: Click table row containing AG11
    if (!blockClicked) {
      try {
        const rows = await page.$$('tr');
        for (const row of rows) {
          const text = await row.textContent();
          if (text.includes('AG11') || text.includes('F001-079')) {
            await row.click();
            blockClicked = true;
            console.log('✓ Clicked table row containing AG11');
            break;
          }
        }
      } catch (e) {}
    }

    // Strategy 3: Click any element containing AG11
    if (!blockClicked) {
      try {
        const elements = await page.$$('div, button, a');
        for (const elem of elements.slice(0, 100)) { // Limit search
          const text = await elem.textContent();
          if (text && (text.includes('AG11') || text.includes('F001-079'))) {
            const isClickable = await elem.evaluate(el => {
              const style = window.getComputedStyle(el);
              return style.cursor === 'pointer' || el.onclick !== null;
            });
            if (isClickable) {
              await elem.click();
              blockClicked = true;
              console.log('✓ Clicked clickable element with AG11');
              break;
            }
          }
        }
      } catch (e) {}
    }

    if (!blockClicked) {
      throw new Error('Could not find or click block AG11');
    }

    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\step3-modal-opened.png', fullPage: true });
    console.log('✓ Block modal opened\n');

    console.log('Step 5: Click Automation tab');
    const tabs = await page.$$('[role="tab"]');
    let automationFound = false;

    for (const tab of tabs) {
      const text = await tab.textContent();
      if (text.toLowerCase().includes('automation')) {
        await tab.click();
        automationFound = true;
        console.log('✓ Automation tab clicked');
        break;
      }
    }

    if (!automationFound) {
      // Fallback
      await page.click('text=Automation');
    }

    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\step4-automation-tab.png', fullPage: true });
    console.log('✓ Automation tab loaded\n');

    console.log('══════════════════════════════════════════════════════');
    console.log('  ANALYSIS: Controllers & Relays Section');
    console.log('══════════════════════════════════════════════════════\n');

    // Extract full automation tab content
    const automationAnalysis = await page.evaluate(() => {
      const tabPanel = document.querySelector('[role="tabpanel"]') || document.body;
      const modal = document.querySelector('[role="dialog"]') ||
                   document.querySelector('.modal') ||
                   document.querySelector('[class*="Modal"]');

      const fullText = tabPanel.innerText;

      let scrollData = null;
      if (modal) {
        scrollData = {
          scrollHeight: modal.scrollHeight,
          clientHeight: modal.clientHeight,
          scrollTop: modal.scrollTop,
          isScrollable: modal.scrollHeight > modal.clientHeight,
          hiddenPixels: modal.scrollHeight - modal.clientHeight
        };
      }

      return { fullText, scrollData };
    });

    console.log('┌─ AUTOMATION TAB CONTENT ─────────────────────────┐');
    console.log(automationAnalysis.fullText);
    console.log('└───────────────────────────────────────────────────┘\n');

    // Check for sections
    const text = automationAnalysis.fullText.toLowerCase();
    const findings = {
      iotController: text.includes('iot') && text.includes('controller'),
      sensors: text.includes('sensor') || text.includes('environmental'),
      controllersRelays: (text.includes('controllers') && text.includes('relays')) || text.includes('controllers & relays'),
      pump: text.includes('pump'),
      fan: text.includes('fan'),
      relay: text.includes('relay'),
      temperature: text.includes('temperature'),
      humidity: text.includes('humidity')
    };

    console.log('┌─ SECTION ANALYSIS ───────────────────────────────┐');
    console.log(`│ IoT Controller Configuration:  ${findings.iotController ? '✅ FOUND   ' : '❌ MISSING '} │`);
    console.log(`│ Sensors & Environmental:       ${findings.sensors ? '✅ FOUND   ' : '❌ MISSING '} │`);
    console.log(`│ Controllers & Relays:          ${findings.controllersRelays ? '✅ FOUND   ' : '❌ MISSING '} │`);
    console.log(`│   - Pump control:              ${findings.pump ? '✅ FOUND   ' : '❌ MISSING '} │`);
    console.log(`│   - Fan control:               ${findings.fan ? '✅ FOUND   ' : '❌ MISSING '} │`);
    console.log(`│   - Relay keyword:             ${findings.relay ? '✅ FOUND   ' : '❌ MISSING '} │`);
    console.log('└───────────────────────────────────────────────────┘\n');

    // Check scroll state
    if (automationAnalysis.scrollData) {
      console.log('┌─ MODAL SCROLL ANALYSIS ──────────────────────────┐');
      console.log(`│ Total Height:    ${String(automationAnalysis.scrollData.scrollHeight).padEnd(28)} │`);
      console.log(`│ Visible Height:  ${String(automationAnalysis.scrollData.clientHeight).padEnd(28)} │`);
      console.log(`│ Current Scroll:  ${String(automationAnalysis.scrollData.scrollTop).padEnd(28)} │`);
      console.log(`│ Is Scrollable:   ${automationAnalysis.scrollData.isScrollable ? 'YES ✓'.padEnd(28) : 'NO ✗'.padEnd(28)} │`);

      if (automationAnalysis.scrollData.isScrollable) {
        console.log(`│ Hidden Content:  ${String(automationAnalysis.scrollData.hiddenPixels + 'px below').padEnd(28)} │`);
      }
      console.log('└───────────────────────────────────────────────────┘\n');

      if (automationAnalysis.scrollData.isScrollable) {
        console.log('⚠️  MODAL HAS HIDDEN CONTENT - Scrolling down...\n');

        // Scroll to bottom
        await page.evaluate(() => {
          const modal = document.querySelector('[role="dialog"]') ||
                       document.querySelector('.modal') ||
                       document.querySelector('[class*="Modal"]');
          if (modal) {
            modal.scrollTop = modal.scrollHeight;
          }
        });

        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\step5-scrolled-bottom.png', fullPage: true });

        // Re-check content
        const afterScroll = await page.evaluate(() => {
          const tabPanel = document.querySelector('[role="tabpanel"]') || document.body;
          return tabPanel.innerText;
        });

        console.log('┌─ CONTENT AFTER SCROLLING ────────────────────────┐');
        console.log(afterScroll);
        console.log('└───────────────────────────────────────────────────┘\n');

        const afterText = afterScroll.toLowerCase();
        const afterFindings = {
          controllersRelays: (afterText.includes('controllers') && afterText.includes('relays')) || afterText.includes('controllers & relays'),
          pump: afterText.includes('pump'),
          fan: afterText.includes('fan')
        };

        console.log('┌─ AFTER SCROLL ANALYSIS ──────────────────────────┐');
        console.log(`│ Controllers & Relays:  ${afterFindings.controllersRelays ? '✅ NOW VISIBLE' : '❌ STILL MISSING'} │`);
        console.log(`│ Pump control:          ${afterFindings.pump ? '✅ NOW VISIBLE' : '❌ STILL MISSING'} │`);
        console.log(`│ Fan control:           ${afterFindings.fan ? '✅ NOW VISIBLE' : '❌ STILL MISSING'} │`);
        console.log('└───────────────────────────────────────────────────┘\n');
      }
    }

    // Error summary
    console.log('┌─ ERROR SUMMARY ──────────────────────────────────┐');
    console.log(`│ Console Errors: ${consoleErrors.length.toString().padEnd(31)} │`);
    console.log(`│ Network Errors: ${networkErrors.length.toString().padEnd(31)} │`);
    console.log(`│ HTTP Errors:    ${httpErrors.length.toString().padEnd(31)} │`);
    console.log('└───────────────────────────────────────────────────┘\n');

    if (consoleErrors.length > 0) {
      console.log('Console Errors Detail:');
      consoleErrors.forEach(err => console.log(`  ❌ ${err}`));
      console.log();
    }

    if (httpErrors.length > 0) {
      console.log('HTTP Errors Detail:');
      httpErrors.forEach(err => console.log(`  ❌ ${err}`));
      console.log();
    }

    await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\step6-final.png', fullPage: true });

    console.log('══════════════════════════════════════════════════════');
    console.log('  INVESTIGATION COMPLETE');
    console.log('══════════════════════════════════════════════════════');
    console.log('\n📁 Screenshots saved to: screenshots/\n');
    console.log('Keeping browser open for 15 seconds...\n');

    await page.waitForTimeout(15000);

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\error.png', fullPage: true });
  } finally {
    await browser.close();
    console.log('\n✓ Test complete');
  }
})();
