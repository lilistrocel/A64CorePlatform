const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Enable console logging
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE ${msg.type()}]:`, msg.text());
  });

  // Track network errors
  page.on('requestfailed', request => {
    console.log(`[NETWORK ERROR]: ${request.url()} - ${request.failure().errorText}`);
  });

  // Track failed responses
  page.on('response', response => {
    if (!response.ok()) {
      console.log(`[HTTP ERROR]: ${response.url()} - Status: ${response.status()}`);
    }
  });

  try {
    console.log('\n=== STEP 1: Navigate to https://a64core.com ===');
    await page.goto('https://a64core.com', { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\01-landing-page.png', fullPage: true });
    console.log('✓ Page loaded');

    console.log('\n=== STEP 2: Login ===');
    await page.fill('input[type="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"]', 'SuperAdmin123!');
    await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\02-login-filled.png' });

    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\03-after-login.png', fullPage: true });
    console.log('✓ Login successful');

    console.log('\n=== STEP 3: Navigate to Al Ain Farm ===');
    // Wait for dashboard to load
    await page.waitForSelector('text=Al Ain Farm', { timeout: 10000 });
    await page.click('text=Al Ain Farm');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\04-al-ain-farm.png', fullPage: true });
    console.log('✓ Al Ain Farm page loaded');

    console.log('\n=== STEP 4: Click on block AG11 (F001-079) ===');
    // Try multiple selectors to find the block
    const blockSelectors = [
      'text=AG11',
      'text=F001-079',
      '[data-testid*="AG11"]',
      '[data-testid*="F001-079"]',
      'div:has-text("AG11")',
      'div:has-text("F001-079")'
    ];

    let blockFound = false;
    for (const selector of blockSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          console.log(`✓ Found block using selector: ${selector}`);
          await element.click();
          blockFound = true;
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    if (!blockFound) {
      console.log('❌ Block AG11 not found, attempting to find any block...');
      await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\05-blocks-not-found.png', fullPage: true });

      // Get all text content to debug
      const bodyText = await page.textContent('body');
      console.log('\n=== Page Content Sample ===');
      console.log(bodyText.substring(0, 500));
    } else {
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\05-block-modal-opened.png', fullPage: true });
      console.log('✓ Block modal opened');

      console.log('\n=== STEP 5: Click on Automation tab ===');
      const automationTabSelectors = [
        'text=Automation',
        '[role="tab"]:has-text("Automation")',
        'button:has-text("Automation")',
        'div[role="tab"]:has-text("Automation")'
      ];

      let tabFound = false;
      for (const selector of automationTabSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            console.log(`✓ Found Automation tab using selector: ${selector}`);
            await element.click();
            tabFound = true;
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      if (!tabFound) {
        console.log('❌ Automation tab not found');
        await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\06-automation-tab-not-found.png', fullPage: true });
      } else {
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\06-automation-tab-clicked.png', fullPage: true });
        console.log('✓ Automation tab clicked');

        console.log('\n=== STEP 6: Take full modal screenshot ===');
        await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\07-automation-full-modal.png', fullPage: true });

        console.log('\n=== STEP 7: Check for Controllers & Relays section ===');
        const controllersText = await page.textContent('body');
        const hasControllersSection = controllersText.includes('Controllers & Relays') ||
                                       controllersText.includes('Controllers and Relays') ||
                                       controllersText.includes('Relay');

        console.log(`Controllers & Relays section visible in DOM: ${hasControllersSection}`);

        // Check if modal has scrollable content
        const modalSelector = '[role="dialog"], .modal, [class*="Modal"]';
        const modal = await page.$(modalSelector);

        if (modal) {
          const modalBox = await modal.boundingBox();
          console.log(`\nModal dimensions: ${JSON.stringify(modalBox)}`);

          // Check scroll height vs client height
          const scrollInfo = await modal.evaluate(el => ({
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            scrollTop: el.scrollTop,
            isScrollable: el.scrollHeight > el.clientHeight
          }));

          console.log(`\nModal scroll info:`, scrollInfo);

          if (scrollInfo.isScrollable) {
            console.log('\n=== STEP 8: Scrolling inside modal ===');
            // Scroll down inside modal
            await modal.evaluate(el => {
              el.scrollTop = el.scrollHeight;
            });
            await page.waitForTimeout(1000);
            await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\08-modal-scrolled-down.png', fullPage: true });
            console.log('✓ Scrolled to bottom of modal');

            // Check again for Controllers & Relays
            const controllersTextAfterScroll = await page.textContent('body');
            const hasControllersAfterScroll = controllersTextAfterScroll.includes('Controllers & Relays') ||
                                               controllersTextAfterScroll.includes('Controllers and Relays') ||
                                               controllersTextAfterScroll.includes('pump') ||
                                               controllersTextAfterScroll.includes('fan');
            console.log(`Controllers & Relays section visible after scroll: ${hasControllersAfterScroll}`);
          }
        }

        console.log('\n=== STEP 9: Check for specific relay/controller elements ===');
        const elements = {
          pump: await page.$('text=pump'),
          fan: await page.$('text=fan'),
          relay: await page.$('text=relay'),
          controller: await page.$('text=controller')
        };

        console.log('\nElement search results:');
        for (const [key, value] of Object.entries(elements)) {
          console.log(`  ${key}: ${value ? 'FOUND' : 'NOT FOUND'}`);
        }

        console.log('\n=== STEP 10: Capture browser console errors ===');
        const consoleLogs = await page.evaluate(() => {
          return window.console.history || [];
        });
        console.log('Console logs captured during test (see above)');

        console.log('\n=== STEP 11: Check network requests ===');
        // Network tracking was done via page.on('response') listener above
        console.log('Network errors captured during test (see above)');

        // Get all visible text in automation tab
        console.log('\n=== Visible content in Automation tab ===');
        const visibleText = await page.evaluate(() => {
          const automationContent = document.querySelector('[role="tabpanel"]');
          return automationContent ? automationContent.innerText : 'Automation tab content not found';
        });
        console.log(visibleText);
      }
    }

  } catch (error) {
    console.error('\n❌ ERROR during test:', error.message);
    await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\error-state.png', fullPage: true });
  } finally {
    console.log('\n=== Test Complete ===');
    await page.waitForTimeout(3000); // Keep browser open for 3 seconds
    await browser.close();
  }
})();
