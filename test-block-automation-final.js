const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Capture console messages
  const consoleMessages = [];
  page.on('console', msg => {
    const message = `[${msg.type()}] ${msg.text()}`;
    consoleMessages.push(message);
    console.log(`[CONSOLE]:`, message);
  });

  // Capture network errors
  const networkErrors = [];
  page.on('requestfailed', request => {
    const error = `${request.url()} - ${request.failure().errorText}`;
    networkErrors.push(error);
    console.log(`[NETWORK FAIL]:`, error);
  });

  // Capture HTTP errors
  const httpErrors = [];
  page.on('response', response => {
    if (!response.ok()) {
      const error = `${response.url()} - ${response.status()} ${response.statusText()}`;
      httpErrors.push(error);
      console.log(`[HTTP ERROR]:`, error);
    }
  });

  try {
    console.log('\n=== 1. Navigate to https://a64core.com ===');
    await page.goto('https://a64core.com', { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\01-home.png', fullPage: true });

    console.log('\n=== 2. Login ===');
    await page.fill('input[type="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"]', 'SuperAdmin123!');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\02-dashboard.png', fullPage: true });

    console.log('\n=== 3. Navigate to Farm Manager ===');
    await page.click('text=Farm Manager');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\03-farm-manager.png', fullPage: true });

    console.log('\n=== 4. Click Manage Farms ===');
    await page.click('text=Manage Farms');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\04-manage-farms.png', fullPage: true });

    console.log('\n=== 5. Look for Al Ain Farm ===');
    const pageContent = await page.textContent('body');
    console.log('Searching for Al Ain Farm...');

    // Try multiple approaches to find and click Al Ain Farm
    let farmClicked = false;

    // Approach 1: Direct text match
    try {
      const alAinElement = await page.$('text=Al Ain');
      if (alAinElement) {
        console.log('Found "Al Ain" - clicking...');
        await alAinElement.click();
        farmClicked = true;
      }
    } catch (e) {}

    // Approach 2: Look for farm cards
    if (!farmClicked) {
      try {
        const farmCards = await page.$$('[data-testid*="farm"], .farm-card, [class*="FarmCard"]');
        console.log(`Found ${farmCards.length} farm cards`);

        for (const card of farmCards) {
          const text = await card.textContent();
          if (text.includes('Al Ain')) {
            console.log('Found Al Ain in farm card - clicking...');
            await card.click();
            farmClicked = true;
            break;
          }
        }
      } catch (e) {}
    }

    // Approach 3: Look in table rows
    if (!farmClicked) {
      try {
        const rows = await page.$$('tr');
        console.log(`Found ${rows.length} table rows`);

        for (const row of rows) {
          const text = await row.textContent();
          if (text.includes('Al Ain')) {
            console.log('Found Al Ain in table row - clicking...');
            await row.click();
            farmClicked = true;
            break;
          }
        }
      } catch (e) {}
    }

    if (farmClicked) {
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\05-al-ain-farm.png', fullPage: true });
      console.log('✓ Al Ain Farm opened');

      console.log('\n=== 6. Look for block AG11 (F001-079) ===');

      // Try multiple approaches
      let blockClicked = false;

      // Approach 1: Direct text
      const blockTexts = ['AG11', 'F001-079'];
      for (const text of blockTexts) {
        try {
          const element = await page.$(`text=${text}`);
          if (element) {
            console.log(`Found block using text "${text}" - clicking...`);
            await element.click();
            blockClicked = true;
            break;
          }
        } catch (e) {}
      }

      // Approach 2: Search in all clickable elements
      if (!blockClicked) {
        const clickables = await page.$$('button, a, div[role="button"], [onclick], .clickable, [class*="Block"]');
        console.log(`Searching ${clickables.length} clickable elements...`);

        for (const elem of clickables) {
          const text = await elem.textContent();
          if (text && (text.includes('AG11') || text.includes('F001-079'))) {
            console.log(`Found block in clickable element: "${text.substring(0, 50)}" - clicking...`);
            await elem.click();
            blockClicked = true;
            break;
          }
        }
      }

      if (blockClicked) {
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\06-block-modal-opened.png', fullPage: true });
        console.log('✓ Block modal opened');

        console.log('\n=== 7. Click Automation tab ===');

        let automationClicked = false;
        const tabSelectors = [
          'text=Automation',
          '[role="tab"]:has-text("Automation")',
          'button:has-text("Automation")',
          'div[role="tab"]:has-text("Automation")'
        ];

        for (const selector of tabSelectors) {
          try {
            const tab = await page.$(selector);
            if (tab) {
              console.log(`Found Automation tab using "${selector}" - clicking...`);
              await tab.click();
              automationClicked = true;
              break;
            }
          } catch (e) {}
        }

        if (automationClicked) {
          await page.waitForTimeout(3000);
          await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\07-automation-tab-initial.png', fullPage: true });
          console.log('✓ Automation tab clicked');

          console.log('\n=== 8. INVESTIGATION: Controllers & Relays Section ===\n');

          // Get the full automation tab content
          const automationContent = await page.evaluate(() => {
            const tabPanel = document.querySelector('[role="tabpanel"]');
            if (tabPanel) {
              return {
                fullText: tabPanel.innerText,
                innerHTML: tabPanel.innerHTML.substring(0, 2000)
              };
            }
            return { fullText: 'Tab panel not found', innerHTML: '' };
          });

          console.log('--- AUTOMATION TAB FULL TEXT CONTENT ---');
          console.log(automationContent.fullText);
          console.log('--- END CONTENT ---\n');

          // Analysis
          const content = automationContent.fullText.toLowerCase();
          const findings = {
            hasSensorsSection: content.includes('sensor') || content.includes('environmental'),
            hasControllersSection: content.includes('controllers') && content.includes('relays'),
            hasPump: content.includes('pump'),
            hasFan: content.includes('fan'),
            hasRelay: content.includes('relay'),
            hasIoTController: content.includes('iot') && content.includes('controller')
          };

          console.log('📊 CONTENT ANALYSIS:');
          console.log('  ✓ Sensors section:', findings.hasSensorsSection ? '✅ FOUND' : '❌ NOT FOUND');
          console.log('  ✓ Controllers & Relays section:', findings.hasControllersSection ? '✅ FOUND' : '❌ NOT FOUND');
          console.log('  ✓ Pump mentioned:', findings.hasPump ? '✅ YES' : '❌ NO');
          console.log('  ✓ Fan mentioned:', findings.hasFan ? '✅ YES' : '❌ NO');
          console.log('  ✓ Relay mentioned:', findings.hasRelay ? '✅ YES' : '❌ NO');
          console.log('  ✓ IoT Controller config:', findings.hasIoTController ? '✅ YES' : '❌ NO');

          // Check if modal is scrollable
          const scrollAnalysis = await page.evaluate(() => {
            const modal = document.querySelector('[role="dialog"]') ||
                         document.querySelector('.modal') ||
                         document.querySelector('[class*="Modal"]') ||
                         document.querySelector('[class*="modal"]');

            if (modal) {
              const rect = modal.getBoundingClientRect();
              return {
                found: true,
                scrollHeight: modal.scrollHeight,
                clientHeight: modal.clientHeight,
                scrollTop: modal.scrollTop,
                isScrollable: modal.scrollHeight > modal.clientHeight,
                heightDifference: modal.scrollHeight - modal.clientHeight,
                dimensions: {
                  width: rect.width,
                  height: rect.height
                }
              };
            }

            return { found: false };
          });

          console.log('\n🔍 MODAL SCROLL ANALYSIS:');
          console.log(JSON.stringify(scrollAnalysis, null, 2));

          if (scrollAnalysis.found && scrollAnalysis.isScrollable) {
            console.log(`\n⚠️ Modal IS scrollable! ${scrollAnalysis.heightDifference}px of hidden content.`);
            console.log('Scrolling to bottom...\n');

            // Scroll to bottom
            await page.evaluate(() => {
              const modal = document.querySelector('[role="dialog"]') ||
                           document.querySelector('.modal') ||
                           document.querySelector('[class*="Modal"]') ||
                           document.querySelector('[class*="modal"]');
              if (modal) {
                modal.scrollTop = modal.scrollHeight;
              }
            });

            await page.waitForTimeout(2000);
            await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\08-automation-scrolled-bottom.png', fullPage: true });

            // Check content again
            const contentAfterScroll = await page.evaluate(() => {
              const tabPanel = document.querySelector('[role="tabpanel"]');
              return tabPanel ? tabPanel.innerText : 'Not found';
            });

            console.log('--- CONTENT AFTER SCROLLING ---');
            console.log(contentAfterScroll);
            console.log('--- END ---\n');

            const afterScrollContent = contentAfterScroll.toLowerCase();
            const afterScrollFindings = {
              hasControllersSection: afterScrollContent.includes('controllers') && afterScrollContent.includes('relays'),
              hasPump: afterScrollContent.includes('pump'),
              hasFan: afterScrollContent.includes('fan')
            };

            console.log('📊 AFTER SCROLL ANALYSIS:');
            console.log('  ✓ Controllers & Relays section:', afterScrollFindings.hasControllersSection ? '✅ NOW VISIBLE' : '❌ STILL NOT VISIBLE');
            console.log('  ✓ Pump mentioned:', afterScrollFindings.hasPump ? '✅ YES' : '❌ NO');
            console.log('  ✓ Fan mentioned:', afterScrollFindings.hasFan ? '✅ YES' : '❌ NO');
          } else if (scrollAnalysis.found) {
            console.log('\nℹ️ Modal is NOT scrollable - all content is visible.');
          }

          // Summary of browser errors
          console.log('\n🐛 BROWSER CONSOLE ERRORS:');
          const errors = consoleMessages.filter(msg => msg.includes('[error]'));
          if (errors.length > 0) {
            errors.forEach(err => console.log('  ❌', err));
          } else {
            console.log('  ✅ No console errors detected');
          }

          console.log('\n🌐 NETWORK ERRORS:');
          if (networkErrors.length > 0) {
            networkErrors.forEach(err => console.log('  ❌', err));
          } else {
            console.log('  ✅ No network failures detected');
          }

          console.log('\n📡 HTTP ERRORS:');
          if (httpErrors.length > 0) {
            httpErrors.forEach(err => console.log('  ❌', err));
          } else {
            console.log('  ✅ No HTTP errors detected');
          }

          // Take final screenshot
          await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\09-final-state.png', fullPage: true });

          console.log('\n✅ Investigation complete! Screenshots saved to screenshots/ directory.');
          console.log('Keeping browser open for 15 seconds for manual inspection...');
          await page.waitForTimeout(15000);
        } else {
          console.log('❌ Could not find Automation tab');
        }
      } else {
        console.log('❌ Could not find block AG11');
        console.log('Current page content:', pageContent.substring(0, 500));
      }
    } else {
      console.log('❌ Could not find Al Ain Farm');
      console.log('Current page content:', pageContent.substring(0, 500));
    }

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error.stack);
    await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\error-screenshot.png', fullPage: true });
  } finally {
    await browser.close();
    console.log('\n=== Test Complete ===');
  }
})();
