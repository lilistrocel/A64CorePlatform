const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Capture console
  const consoleMessages = [];
  page.on('console', msg => {
    const message = `[${msg.type()}] ${msg.text()}`;
    consoleMessages.push(message);
    console.log(`[CONSOLE]:`, message);
  });

  const networkErrors = [];
  page.on('requestfailed', request => {
    const error = `${request.url()} - ${request.failure().errorText}`;
    networkErrors.push(error);
    console.log(`[NETWORK]:`, error);
  });

  const httpErrors = [];
  page.on('response', response => {
    if (!response.ok()) {
      const error = `${response.url()} - ${response.status()}`;
      httpErrors.push(error);
      console.log(`[HTTP]:`, error);
    }
  });

  try {
    console.log('\n=== 1. Navigate & Login ===');
    await page.goto('https://a64core.com', { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"]', 'SuperAdmin123!');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    console.log('✓ Logged in');

    console.log('\n=== 2. Navigate to Block Monitor (direct blocks view) ===');
    // Try Block Monitor instead of Farm Manager
    await page.click('text=Block Monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\01-block-monitor.png', fullPage: true });
    console.log('✓ Block Monitor loaded');

    const pageContent = await page.textContent('body');
    console.log('\nPage content sample:', pageContent.substring(0, 800));

    console.log('\n=== 3. Looking for AG11 or F001-079 ===');

    // Search for the block more intelligently
    const blockFound = await page.evaluate(() => {
      const body = document.body.innerText;
      return {
        hasAG11: body.includes('AG11'),
        hasF001079: body.includes('F001-079'),
        fullText: body.substring(0, 1500)
      };
    });

    console.log('Block search results:', blockFound);

    if (blockFound.hasAG11 || blockFound.hasF001079) {
      console.log('✓ Block found in page');

      // Try different click strategies
      let clicked = false;

      // Strategy 1: Click directly on text
      try {
        await page.click('text=AG11', { timeout: 5000 });
        clicked = true;
        console.log('✓ Clicked AG11 directly');
      } catch (e) {
        console.log('Could not click AG11 directly, trying alternative...');
      }

      // Strategy 2: Click on parent element containing AG11
      if (!clicked) {
        try {
          const blockElement = await page.$('div:has-text("AG11")');
          if (blockElement) {
            await blockElement.click();
            clicked = true;
            console.log('✓ Clicked parent div containing AG11');
          }
        } catch (e) {
          console.log('Could not click parent div');
        }
      }

      // Strategy 3: Find by F001-079
      if (!clicked) {
        try {
          await page.click('text=F001-079', { timeout: 5000 });
          clicked = true;
          console.log('✓ Clicked F001-079 directly');
        } catch (e) {
          console.log('Could not click F001-079');
        }
      }

      // Strategy 4: Search all table rows or cards
      if (!clicked) {
        const elements = await page.$$('tr, [class*="card"], [class*="Card"], [class*="block"], [class*="Block"]');
        console.log(`Searching ${elements.length} elements for AG11...`);

        for (const elem of elements) {
          const text = await elem.textContent();
          if (text.includes('AG11') || text.includes('F001-079')) {
            console.log('Found in element:', text.substring(0, 100));
            await elem.click();
            clicked = true;
            break;
          }
        }
      }

      if (clicked) {
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\02-block-modal.png', fullPage: true });
        console.log('✓ Block modal should be open');

        // Check if modal opened
        const modalOpen = await page.evaluate(() => {
          const modal = document.querySelector('[role="dialog"]') ||
                       document.querySelector('.modal') ||
                       document.querySelector('[class*="Modal"]');
          return modal !== null;
        });

        console.log('Modal open:', modalOpen ? '✅ YES' : '❌ NO');

        if (modalOpen) {
          console.log('\n=== 4. Looking for Automation tab ===');

          // Get all tabs
          const tabs = await page.$$('[role="tab"], button:has-text("Automation")');
          console.log(`Found ${tabs.length} tabs`);

          let automationTabFound = false;
          for (const tab of tabs) {
            const text = await tab.textContent();
            console.log(`  Tab: "${text}"`);
            if (text.toLowerCase().includes('automation')) {
              console.log('  ✓ This is Automation tab - clicking...');
              await tab.click();
              automationTabFound = true;
              break;
            }
          }

          if (automationTabFound) {
            await page.waitForTimeout(3000);
            await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\03-automation-tab.png', fullPage: true });
            console.log('✓ Automation tab clicked');

            console.log('\n=== 5. MAIN INVESTIGATION: Controllers & Relays Section ===\n');

            // Get all content from automation tab
            const automationData = await page.evaluate(() => {
              const tabPanel = document.querySelector('[role="tabpanel"]') || document.body;
              const modal = document.querySelector('[role="dialog"]') ||
                           document.querySelector('.modal') ||
                           document.querySelector('[class*="Modal"]');

              return {
                fullText: tabPanel.innerText,
                modalScrollable: modal ? {
                  scrollHeight: modal.scrollHeight,
                  clientHeight: modal.clientHeight,
                  scrollTop: modal.scrollTop,
                  isScrollable: modal.scrollHeight > modal.clientHeight
                } : null
              };
            });

            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('AUTOMATION TAB CONTENT (FULL)');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(automationData.fullText);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

            // Detailed analysis
            const content = automationData.fullText.toLowerCase();

            console.log('📊 SECTION PRESENCE ANALYSIS:');
            console.log('─────────────────────────────────────────────────');

            const sections = {
              'IoT Controller Configuration': content.includes('iot') && content.includes('controller'),
              'Sensors & Environmental Monitoring': content.includes('sensor') || content.includes('environmental'),
              'Controllers & Relays': (content.includes('controllers') && content.includes('relays')) || content.includes('controllers & relays'),
              'Pump control': content.includes('pump'),
              'Fan control': content.includes('fan'),
              'Relay mentioned': content.includes('relay'),
              'Temperature sensor': content.includes('temperature'),
              'Humidity sensor': content.includes('humidity')
            };

            for (const [section, found] of Object.entries(sections)) {
              const status = found ? '✅ FOUND' : '❌ NOT FOUND';
              console.log(`  ${section.padEnd(40)} ${status}`);
            }

            console.log('\n🔍 MODAL SCROLL STATE:');
            console.log('─────────────────────────────────────────────────');
            if (automationData.modalScrollable) {
              console.log(`  Scroll Height:  ${automationData.modalScrollable.scrollHeight}px`);
              console.log(`  Client Height:  ${automationData.modalScrollable.clientHeight}px`);
              console.log(`  Current Scroll: ${automationData.modalScrollable.scrollTop}px`);
              console.log(`  Is Scrollable:  ${automationData.modalScrollable.isScrollable ? '✅ YES' : '❌ NO'}`);

              if (automationData.modalScrollable.isScrollable) {
                const hiddenContent = automationData.modalScrollable.scrollHeight - automationData.modalScrollable.clientHeight;
                console.log(`  Hidden Content: ${hiddenContent}px below current view`);

                console.log('\n⚠️  SCROLLING TO BOTTOM TO REVEAL HIDDEN CONTENT...\n');

                await page.evaluate(() => {
                  const modal = document.querySelector('[role="dialog"]') ||
                               document.querySelector('.modal') ||
                               document.querySelector('[class*="Modal"]');
                  if (modal) {
                    modal.scrollTop = modal.scrollHeight;
                  }
                });

                await page.waitForTimeout(2000);
                await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\04-automation-scrolled.png', fullPage: true });

                // Check content after scroll
                const afterScroll = await page.evaluate(() => {
                  const tabPanel = document.querySelector('[role="tabpanel"]') || document.body;
                  return tabPanel.innerText;
                });

                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('CONTENT AFTER SCROLLING');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log(afterScroll);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

                const afterScrollContent = afterScroll.toLowerCase();
                const afterScrollSections = {
                  'Controllers & Relays': (afterScrollContent.includes('controllers') && afterScrollContent.includes('relays')) || afterScrollContent.includes('controllers & relays'),
                  'Pump control': afterScrollContent.includes('pump'),
                  'Fan control': afterScrollContent.includes('fan')
                };

                console.log('📊 SECTION PRESENCE AFTER SCROLL:');
                console.log('─────────────────────────────────────────────────');
                for (const [section, found] of Object.entries(afterScrollSections)) {
                  const status = found ? '✅ NOW VISIBLE' : '❌ STILL MISSING';
                  console.log(`  ${section.padEnd(40)} ${status}`);
                }
              }
            } else {
              console.log('  ❌ Could not detect modal scroll properties');
            }

            console.log('\n🐛 ERROR SUMMARY:');
            console.log('─────────────────────────────────────────────────');
            console.log(`  Console Errors: ${consoleMessages.filter(m => m.includes('[error]')).length}`);
            console.log(`  Network Errors: ${networkErrors.length}`);
            console.log(`  HTTP Errors:    ${httpErrors.length}`);

            if (consoleMessages.filter(m => m.includes('[error]')).length > 0) {
              console.log('\n  Console Error Details:');
              consoleMessages.filter(m => m.includes('[error]')).forEach(err => {
                console.log(`    ❌ ${err}`);
              });
            }

            if (httpErrors.length > 0) {
              console.log('\n  HTTP Error Details:');
              httpErrors.forEach(err => {
                console.log(`    ❌ ${err}`);
              });
            }

            await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\05-final.png', fullPage: true });

            console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('✅ INVESTIGATION COMPLETE');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('\nScreenshots saved to screenshots/ directory');
            console.log('Keeping browser open for 15 seconds...\n');

            await page.waitForTimeout(15000);
          } else {
            console.log('❌ Automation tab not found');
          }
        } else {
          console.log('❌ Modal did not open');
        }
      } else {
        console.log('❌ Could not click on block');
      }
    } else {
      console.log('❌ Block AG11/F001-079 not found in page');
      console.log('\nAvailable content:', blockFound.fullText);
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\error.png', fullPage: true });
  } finally {
    await browser.close();
    console.log('\n=== Test Complete ===');
  }
})();
