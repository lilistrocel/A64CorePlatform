const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Enable console logging
  page.on('console', msg => {
    console.log(`[BROWSER ${msg.type()}]:`, msg.text());
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
    console.log('\n=== Navigate to https://a64core.com ===');
    await page.goto('https://a64core.com', { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\01-landing.png', fullPage: true });

    console.log('\n=== Login ===');
    await page.fill('input[type="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"]', 'SuperAdmin123!');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\02-after-login.png', fullPage: true });

    console.log('\n=== DEBUG: What is on the page after login? ===');
    const bodyText = await page.textContent('body');
    console.log('First 1000 characters of page:', bodyText.substring(0, 1000));

    // Check for common dashboard elements
    const hasModules = await page.$('text=Modules');
    const hasFarm = await page.$('text=Farm');
    const hasDashboard = await page.$('text=Dashboard');

    console.log('\nDashboard elements found:');
    console.log('  Modules link:', hasModules ? 'YES' : 'NO');
    console.log('  Farm link:', hasFarm ? 'YES' : 'NO');
    console.log('  Dashboard link:', hasDashboard ? 'YES' : 'NO');

    // Try to find navigation to farm module
    console.log('\n=== Looking for Farm Management module ===');

    // Check if we need to navigate to modules first
    const modulesLink = await page.$('text=Modules');
    if (modulesLink) {
      console.log('Found Modules navigation, clicking...');
      await modulesLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\03-modules-page.png', fullPage: true });
    }

    // Look for Farm Management module
    const farmModuleSelectors = [
      'text=Farm Management',
      'a:has-text("Farm Management")',
      'button:has-text("Farm Management")',
      '[href*="farm"]',
      'text=Farm'
    ];

    let farmModuleFound = false;
    for (const selector of farmModuleSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          console.log(`✓ Found Farm module using: ${selector}`);
          const elementText = await element.textContent();
          console.log(`  Element text: "${elementText}"`);
          await element.click();
          farmModuleFound = true;
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(3000);
          break;
        }
      } catch (e) {
        // Continue
      }
    }

    if (farmModuleFound) {
      await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\04-farm-module.png', fullPage: true });
      console.log('✓ Farm module loaded');

      // Now look for Al Ain Farm
      console.log('\n=== Looking for Al Ain Farm ===');
      const farmText = await page.textContent('body');
      console.log('Page content sample:', farmText.substring(0, 1000));

      const farmSelectors = [
        'text=Al Ain Farm',
        'text=Al Ain',
        '[data-testid*="farm"]',
        'div:has-text("Al Ain")',
        'button:has-text("Al Ain")',
        'a:has-text("Al Ain")'
      ];

      let farmFound = false;
      for (const selector of farmSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            console.log(`✓ Found farm using: ${selector}`);
            await element.click();
            farmFound = true;
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(3000);
            break;
          }
        } catch (e) {
          // Continue
        }
      }

      if (farmFound) {
        await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\05-farm-detail.png', fullPage: true });
        console.log('✓ Farm detail page loaded');

        // Look for blocks
        console.log('\n=== Looking for blocks ===');
        const blocksText = await page.textContent('body');

        const hasAG11 = blocksText.includes('AG11');
        const hasF001079 = blocksText.includes('F001-079');

        console.log('Block search:');
        console.log('  AG11 in page:', hasAG11 ? 'YES' : 'NO');
        console.log('  F001-079 in page:', hasF001079 ? 'YES' : 'NO');

        if (hasAG11 || hasF001079) {
          // Try to click on the block
          const blockSelectors = [
            'text=AG11',
            'text=F001-079',
            'div:has-text("AG11")',
            '[data-testid*="AG11"]'
          ];

          let blockClicked = false;
          for (const selector of blockSelectors) {
            try {
              const element = await page.$(selector);
              if (element) {
                console.log(`✓ Clicking block using: ${selector}`);
                await element.click();
                blockClicked = true;
                await page.waitForTimeout(3000);
                break;
              }
            } catch (e) {
              // Continue
            }
          }

          if (blockClicked) {
            await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\06-block-modal.png', fullPage: true });
            console.log('✓ Block modal opened');

            // Look for Automation tab
            console.log('\n=== Looking for Automation tab ===');
            const modalContent = await page.textContent('body');
            console.log('Modal content sample:', modalContent.substring(0, 500));

            const tabSelectors = [
              'text=Automation',
              '[role="tab"]:has-text("Automation")',
              'button:has-text("Automation")'
            ];

            let automationTabClicked = false;
            for (const selector of tabSelectors) {
              try {
                const element = await page.$(selector);
                if (element) {
                  console.log(`✓ Clicking Automation tab using: ${selector}`);
                  await element.click();
                  automationTabClicked = true;
                  await page.waitForTimeout(3000);
                  break;
                }
              } catch (e) {
                // Continue
              }
            }

            if (automationTabClicked) {
              await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\07-automation-tab.png', fullPage: true });
              console.log('✓ Automation tab opened');

              // NOW THE MAIN INVESTIGATION
              console.log('\n=== INVESTIGATING CONTROLLERS & RELAYS SECTION ===');

              // Get full automation tab content
              const automationContent = await page.evaluate(() => {
                const tabPanel = document.querySelector('[role="tabpanel"]') || document.body;
                return tabPanel.innerText;
              });

              console.log('\n--- Full Automation Tab Content ---');
              console.log(automationContent);
              console.log('--- End Content ---\n');

              // Check for specific sections
              const hasSensors = automationContent.includes('Sensors') || automationContent.includes('Environmental');
              const hasControllers = automationContent.includes('Controllers') || automationContent.includes('Relays');
              const hasPump = automationContent.toLowerCase().includes('pump');
              const hasFan = automationContent.toLowerCase().includes('fan');

              console.log('\nSection Analysis:');
              console.log('  ✓ Sensors section:', hasSensors ? 'FOUND' : 'NOT FOUND');
              console.log('  ✓ Controllers & Relays section:', hasControllers ? 'FOUND' : 'NOT FOUND');
              console.log('  ✓ Pump mentioned:', hasPump ? 'YES' : 'NO');
              console.log('  ✓ Fan mentioned:', hasFan ? 'YES' : 'NO');

              // Check if modal is scrollable
              const scrollInfo = await page.evaluate(() => {
                const modal = document.querySelector('[role="dialog"]') ||
                             document.querySelector('.modal') ||
                             document.querySelector('[class*="Modal"]');

                if (modal) {
                  return {
                    scrollHeight: modal.scrollHeight,
                    clientHeight: modal.clientHeight,
                    scrollTop: modal.scrollTop,
                    isScrollable: modal.scrollHeight > modal.clientHeight,
                    modalFound: true
                  };
                }
                return { modalFound: false };
              });

              console.log('\nModal Scroll Analysis:', scrollInfo);

              if (scrollInfo.modalFound && scrollInfo.isScrollable) {
                console.log('\n=== Modal is scrollable, scrolling down ===');

                await page.evaluate(() => {
                  const modal = document.querySelector('[role="dialog"]') ||
                               document.querySelector('.modal') ||
                               document.querySelector('[class*="Modal"]');
                  if (modal) {
                    modal.scrollTop = modal.scrollHeight;
                  }
                });

                await page.waitForTimeout(2000);
                await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\08-automation-scrolled.png', fullPage: true });

                // Check content again after scrolling
                const contentAfterScroll = await page.evaluate(() => {
                  const tabPanel = document.querySelector('[role="tabpanel"]') || document.body;
                  return tabPanel.innerText;
                });

                console.log('\n--- Content After Scroll ---');
                console.log(contentAfterScroll);
                console.log('--- End Content ---\n');

                const hasControllersAfterScroll = contentAfterScroll.includes('Controllers') ||
                                                  contentAfterScroll.includes('Relays');
                console.log('Controllers & Relays after scroll:', hasControllersAfterScroll ? 'FOUND' : 'STILL NOT FOUND');
              }

              // Check browser console for errors
              console.log('\n=== Browser Console Errors ===');
              console.log('(See console output above)');

              // Final full page screenshot
              await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\09-final-state.png', fullPage: true });
            }
          }
        }
      }
    }

    console.log('\n=== Keeping browser open for 10 seconds for manual inspection ===');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    await page.screenshot({ path: 'C:\\Users\\NoobCity\\Documents\\Code\\A64CorePlatform\\screenshots\\error.png', fullPage: true });
  } finally {
    await browser.close();
    console.log('\n=== Test Complete ===');
  }
})();
