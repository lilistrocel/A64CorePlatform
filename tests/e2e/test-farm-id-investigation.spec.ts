/**
 * Test: Farm ID Generation Investigation
 *
 * This test verifies that:
 * 1. Farms are created with proper farmId (UUID)
 * 2. Blocks are linked to farms via farmId (not MongoDB _id)
 * 3. API responses include the correct farmId
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'https://a64core.com';
const API_BASE = `${BASE_URL}/api/v1`;

// Test credentials
const ADMIN_EMAIL = 'admin@a64platform.com';
const ADMIN_PASSWORD = 'SuperAdmin123!';

test.describe.serial('Farm ID Generation Investigation', () => {
  let authToken: string;
  let createdFarmId: string;
  let createdBlockId: string;

  test.beforeAll(async ({ request }) => {
    // Login to get auth token
    console.log('Logging in as admin...');
    const loginResponse = await request.post(`${API_BASE}/auth/login`, {
      data: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD
      }
    });

    const loginData = await loginResponse.json();
    console.log('Login response status:', loginResponse.status());
    console.log('Login response:', JSON.stringify(loginData, null, 2));

    if (!loginResponse.ok()) {
      throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
    }

    authToken = loginData.data?.access_token || loginData.access_token;
    console.log('Login successful, got auth token');
  });

  test('1. Create a farm and verify farmId is generated', async ({ request }) => {
    console.log('\n=== Creating a new farm ===');

    const farmData = {
      name: `Test Farm ${Date.now()}`,
      owner: 'Test Owner',
      location: {
        city: 'Test City',
        state: 'Test State',
        country: 'Test Country'
      },
      totalArea: 10.5,
      numberOfStaff: 5
    };

    const createResponse = await request.post(`${API_BASE}/farm/farms`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      data: farmData
    });

    console.log('Create farm response status:', createResponse.status());
    const responseBody = await createResponse.json();
    console.log('Create farm response:', JSON.stringify(responseBody, null, 2));

    expect(createResponse.ok()).toBeTruthy();

    // Check if farmId exists and is a valid UUID
    const farm = responseBody.data;
    console.log('\n=== Farm Data Analysis ===');
    console.log('farmId:', farm.farmId);
    console.log('farmCode:', farm.farmCode);
    console.log('farmId type:', typeof farm.farmId);
    console.log('Has _id field:', '_id' in farm);
    console.log('Has farmCode field:', 'farmCode' in farm);

    // Verify farmId is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(farm.farmId).toBeDefined();
    expect(farm.farmId).toMatch(uuidRegex);

    // Verify farmCode is generated (e.g., "F001", "F002")
    expect(farm.farmCode).toBeDefined();
    expect(farm.farmCode).toMatch(/^F\d{3}$/);
    console.log('Created farm with farmId:', farm.farmId, 'and farmCode:', farm.farmCode);

    createdFarmId = farm.farmId;

    // Check all fields returned
    console.log('\nAll farm fields returned:');
    Object.keys(farm).forEach(key => {
      console.log(`  ${key}: ${JSON.stringify(farm[key])}`);
    });
  });

  test('2. Fetch farms list and verify farmId structure', async ({ request }) => {
    console.log('\n=== Fetching farms list ===');

    const listResponse = await request.get(`${API_BASE}/farm/farms`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    expect(listResponse.ok()).toBeTruthy();
    const responseBody = await listResponse.json();

    console.log('Total farms:', responseBody.meta?.total);

    if (responseBody.data && responseBody.data.length > 0) {
      console.log('\n=== First Farm Structure ===');
      const firstFarm = responseBody.data[0];
      console.log('farmId:', firstFarm.farmId);
      console.log('Has _id:', '_id' in firstFarm);
      console.log('name:', firstFarm.name);
      console.log('managerId:', firstFarm.managerId);

      // Verify all farms have farmId
      responseBody.data.forEach((farm: any, index: number) => {
        console.log(`Farm ${index + 1}: farmId=${farm.farmId}, name=${farm.name}`);
        expect(farm.farmId).toBeDefined();
        expect(farm.farmId).not.toBeNull();
      });
    }
  });

  test('3. Create a block and verify it links to farmId', async ({ request }) => {
    console.log('\n=== Creating a block in the farm ===');
    console.log('Using farmId:', createdFarmId);

    const blockData = {
      name: `Test Block ${Date.now()}`,
      blockType: 'greenhouse',
      maxPlants: 100,
      area: 50,
      areaUnit: 'sqm'
    };

    const createBlockResponse = await request.post(
      `${API_BASE}/farm/farms/${createdFarmId}/blocks`,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        data: blockData
      }
    );

    console.log('Create block response status:', createBlockResponse.status());
    const blockResponseBody = await createBlockResponse.json();
    console.log('Create block response:', JSON.stringify(blockResponseBody, null, 2));

    expect(createBlockResponse.ok()).toBeTruthy();

    const block = blockResponseBody.data;
    console.log('\n=== Block Data Analysis ===');
    console.log('blockId:', block.blockId);
    console.log('farmId in block:', block.farmId);
    console.log('Has _id field:', '_id' in block);

    // Verify the block's farmId matches the farm we created
    expect(block.farmId).toBe(createdFarmId);
    console.log('\nBlock farmId matches created farm farmId:', block.farmId === createdFarmId);

    createdBlockId = block.blockId;

    // Check all block fields
    console.log('\nAll block fields returned:');
    Object.keys(block).forEach(key => {
      const value = block[key];
      if (typeof value === 'object' && value !== null) {
        console.log(`  ${key}: [object]`);
      } else {
        console.log(`  ${key}: ${JSON.stringify(value)}`);
      }
    });
  });

  test('4. Fetch blocks and verify farmId linkage', async ({ request }) => {
    console.log('\n=== Fetching blocks for farm ===');
    console.log('Farm ID:', createdFarmId);

    const blocksResponse = await request.get(
      `${API_BASE}/farm/farms/${createdFarmId}/blocks`,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }
    );

    expect(blocksResponse.ok()).toBeTruthy();
    const blocksBody = await blocksResponse.json();

    console.log('Total blocks in farm:', blocksBody.data?.length);

    if (blocksBody.data && blocksBody.data.length > 0) {
      blocksBody.data.forEach((block: any, index: number) => {
        console.log(`\nBlock ${index + 1}:`);
        console.log('  blockId:', block.blockId);
        console.log('  blockCode:', block.blockCode);
        console.log('  farmId:', block.farmId);
        console.log('  farmId matches:', block.farmId === createdFarmId);

        // All blocks should have farmId matching the parent farm
        expect(block.farmId).toBe(createdFarmId);
      });
    }
  });

  test('5. Check raw database via API - verify no _id exposure', async ({ request }) => {
    console.log('\n=== Checking if _id is exposed in API responses ===');

    // Get single farm
    const farmResponse = await request.get(
      `${API_BASE}/farm/farms/${createdFarmId}`,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }
    );

    const farmData = await farmResponse.json();
    const farm = farmData.data;

    console.log('Single farm response keys:', Object.keys(farm));
    console.log('Has _id:', '_id' in farm);
    console.log('Has farmId:', 'farmId' in farm);

    // _id should NOT be in the response
    expect('_id' in farm).toBeFalsy();
    expect('farmId' in farm).toBeTruthy();

    // Get single block
    if (createdBlockId) {
      const blockResponse = await request.get(
        `${API_BASE}/farm/farms/${createdFarmId}/blocks/${createdBlockId}`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        }
      );

      const blockData = await blockResponse.json();
      const block = blockData.data;

      console.log('\nSingle block response keys:', Object.keys(block));
      console.log('Has _id:', '_id' in block);
      console.log('Has blockId:', 'blockId' in block);
      console.log('Has farmId:', 'farmId' in block);

      // _id should NOT be in the response
      expect('_id' in block).toBeFalsy();
      expect('blockId' in block).toBeTruthy();
      expect('farmId' in block).toBeTruthy();
    }
  });

  test.afterAll(async ({ request }) => {
    // Cleanup: Delete the test farm
    if (createdFarmId) {
      console.log('\n=== Cleaning up test data ===');
      const deleteResponse = await request.delete(
        `${API_BASE}/farm/farms/${createdFarmId}`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        }
      );
      console.log('Delete farm response:', deleteResponse.status());
    }
  });
});
