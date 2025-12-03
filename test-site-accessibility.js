const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Enable console logging
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));

  // Enable network monitoring
  page.on('response', response => {
    console.log(`RESPONSE: ${response.status()} ${response.url()}`);
  });

  page.on('requestfailed', request => {
    console.log(`REQUEST FAILED: ${request.url()} - ${request.failure().errorText}`);
  });

  console.log('\n=== TEST 1: Attempting http://a64core.com ===');
  try {
    const response = await page.goto('http://a64core.com', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    console.log(`Final URL: ${page.url()}`);
    console.log(`Response Status: ${response?.status()}`);
    console.log(`Response Headers:`, await response?.allHeaders());

    await page.screenshot({ path: '/home/ubuntu/A64CorePlatform/screenshot-http.png', fullPage: true });
    console.log('Screenshot saved: screenshot-http.png');

    // Check for any error messages on page
    const bodyText = await page.textContent('body').catch(() => 'Could not get body text');
    console.log(`Page Text (first 500 chars): ${bodyText.substring(0, 500)}`);

  } catch (error) {
    console.error(`ERROR accessing http://a64core.com: ${error.message}`);
    await page.screenshot({ path: '/home/ubuntu/A64CorePlatform/screenshot-http-error.png' });
  }

  console.log('\n=== TEST 2: Attempting https://a64core.com ===');
  try {
    const response = await page.goto('https://a64core.com', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    console.log(`Final URL: ${page.url()}`);
    console.log(`Response Status: ${response?.status()}`);
    console.log(`Response Headers:`, await response?.allHeaders());

    await page.screenshot({ path: '/home/ubuntu/A64CorePlatform/screenshot-https.png', fullPage: true });
    console.log('Screenshot saved: screenshot-https.png');

    const bodyText = await page.textContent('body').catch(() => 'Could not get body text');
    console.log(`Page Text (first 500 chars): ${bodyText.substring(0, 500)}`);

  } catch (error) {
    console.error(`ERROR accessing https://a64core.com: ${error.message}`);
    await page.screenshot({ path: '/home/ubuntu/A64CorePlatform/screenshot-https-error.png' });
  }

  console.log('\n=== TEST 3: Attempting http://a64core.com/api/health ===');
  try {
    const response = await page.goto('http://a64core.com/api/health', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    console.log(`Final URL: ${page.url()}`);
    console.log(`Response Status: ${response?.status()}`);
    console.log(`Response Headers:`, await response?.allHeaders());

    await page.screenshot({ path: '/home/ubuntu/A64CorePlatform/screenshot-health.png', fullPage: true });
    console.log('Screenshot saved: screenshot-health.png');

    const bodyText = await page.textContent('body').catch(() => 'Could not get body text');
    console.log(`Health Endpoint Response: ${bodyText}`);

  } catch (error) {
    console.error(`ERROR accessing http://a64core.com/api/health: ${error.message}`);
    await page.screenshot({ path: '/home/ubuntu/A64CorePlatform/screenshot-health-error.png' });
  }

  console.log('\n=== TEST 4: DNS Resolution Check ===');
  // Try to resolve via direct IP
  try {
    const response = await page.goto('http://51.112.224.227', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    console.log(`Final URL: ${page.url()}`);
    console.log(`Response Status: ${response?.status()}`);

    await page.screenshot({ path: '/home/ubuntu/A64CorePlatform/screenshot-ip.png', fullPage: true });
    console.log('Screenshot saved: screenshot-ip.png');

  } catch (error) {
    console.error(`ERROR accessing direct IP: ${error.message}`);
    await page.screenshot({ path: '/home/ubuntu/A64CorePlatform/screenshot-ip-error.png' });
  }

  await browser.close();
  console.log('\n=== All tests completed ===');
})();
