import { test, expect } from '@playwright/test';

/**
 * Backend API Endpoint Test
 * Verify that business module backend endpoints exist and respond
 */

const BASE_URL = 'https://a64core.com';
const LOGIN_CREDENTIALS = {
  email: 'admin@a64platform.com',
  password: 'SuperAdmin123!'
};

test.describe('Production Backend API Tests', () => {
  let authToken: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();

    // Login to get auth token
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', LOGIN_CREDENTIALS.email);
    await page.fill('input[type="password"]', LOGIN_CREDENTIALS.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|admin)/, { timeout: 15000 });

    // Get token from localStorage
    const token = await page.evaluate(() => localStorage.getItem('accessToken'));
    if (token) {
      authToken = token;
      console.log('✓ Auth token obtained');
    } else {
      throw new Error('Failed to get auth token');
    }

    await page.close();
  });

  test('Test HR dashboard API endpoint', async ({ request }) => {
    console.log('\n--- Testing HR Dashboard API ---');

    const response = await request.get(`${BASE_URL}/api/v1/hr/performance/dashboard`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    console.log('Status:', response.status());
    console.log('Status Text:', response.statusText());

    const body = await response.text();
    console.log('Response body:', body.substring(0, 500));

    if (!response.ok()) {
      console.error('❌ HR Dashboard API failed');
      console.error('Full response:', body);
    } else {
      console.log('✓ HR Dashboard API works');
      const json = JSON.parse(body);
      console.log('Response data:', JSON.stringify(json, null, 2));
    }
  });

  test('Test CRM customers API endpoint', async ({ request }) => {
    console.log('\n--- Testing CRM Customers API ---');

    const response = await request.get(`${BASE_URL}/api/v1/crm/customers`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    console.log('Status:', response.status());

    const body = await response.text();
    console.log('Response body:', body.substring(0, 500));

    if (!response.ok()) {
      console.error('❌ CRM Customers API failed');
      console.error('Full response:', body);
    } else {
      console.log('✓ CRM Customers API works');
    }
  });

  test('Test Logistics dashboard API endpoint', async ({ request }) => {
    console.log('\n--- Testing Logistics Dashboard API ---');

    const response = await request.get(`${BASE_URL}/api/v1/logistics/dashboard`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    console.log('Status:', response.status());

    const body = await response.text();
    console.log('Response body:', body.substring(0, 500));

    if (!response.ok()) {
      console.error('❌ Logistics Dashboard API failed');
      console.error('Full response:', body);
    } else {
      console.log('✓ Logistics Dashboard API works');
    }
  });

  test('Test Sales dashboard API endpoint', async ({ request }) => {
    console.log('\n--- Testing Sales Dashboard API ---');

    const response = await request.get(`${BASE_URL}/api/v1/sales/dashboard`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    console.log('Status:', response.status());

    const body = await response.text();
    console.log('Response body:', body.substring(0, 500));

    if (!response.ok()) {
      console.error('❌ Sales Dashboard API failed');
      console.error('Full response:', body);
    } else {
      console.log('✓ Sales Dashboard API works');
    }
  });

  test('Test Marketing dashboard API endpoint', async ({ request }) => {
    console.log('\n--- Testing Marketing Dashboard API ---');

    const response = await request.get(`${BASE_URL}/api/v1/marketing/dashboard`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    console.log('Status:', response.status());

    const body = await response.text();
    console.log('Response body:', body.substring(0, 500));

    if (!response.ok()) {
      console.error('❌ Marketing Dashboard API failed');
      console.error('Full response:', body);
    } else {
      console.log('✓ Marketing Dashboard API works');
    }
  });

  test('Check which modules are actually installed', async ({ request }) => {
    console.log('\n--- Checking Installed Modules ---');

    const response = await request.get(`${BASE_URL}/api/v1/modules/installed`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    console.log('Status:', response.status());

    if (response.ok()) {
      const json = await response.json();
      console.log('Installed modules:', JSON.stringify(json, null, 2));
    } else {
      const body = await response.text();
      console.error('Failed to get installed modules:', body);
    }
  });
});
