const fs = require('fs');
const http = require('http');

const TOKEN = fs.readFileSync('/tmp/admin_token.txt', 'utf8').trim();
const BASE = 'http://127.0.0.1:8000';

function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + (url.search || ''),
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + TOKEN
      }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch(e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('=== Feature #128: Farm Deletion Cascades to Blocks ===\n');

  // Step 1: Create a test farm
  console.log('Step 1: Creating test farm...');
  const farmRes = await makeRequest('POST', '/api/v1/farm/farms', {
    name: 'CASCADE_DELETE_TEST_FARM',
    description: 'Farm for cascade delete test',
    location: { city: 'Abu Dhabi', state: 'Abu Dhabi', country: 'UAE' },
    totalArea: 200
  });

  if (farmRes.status !== 201) {
    console.log('FAIL: Farm creation failed. Status: ' + farmRes.status);
    console.log(JSON.stringify(farmRes.body).substring(0, 300));
    return;
  }

  const farmId = farmRes.body.data ? farmRes.body.data.farmId : farmRes.body.farmId;
  console.log('Farm created: ' + farmId + '\n');

  // Step 2: Create 3 blocks within this farm
  console.log('Step 2: Creating 3 blocks...');
  const blockIds = [];
  for (let i = 1; i <= 3; i++) {
    const blockRes = await makeRequest('POST', '/api/v1/farm/farms/' + farmId + '/blocks', {
      name: 'CASCADE_BLOCK_' + i,
      blockType: 'openfield',
      maxPlants: 100 * i,
      area: 10 * i,
      areaUnit: 'hectares'
    });
    if (blockRes.status === 201) {
      const blockId = blockRes.body.data ? blockRes.body.data.blockId : blockRes.body.blockId;
      blockIds.push(blockId);
      console.log('  Block ' + i + ' created: ' + blockId);
    } else {
      console.log('  Block ' + i + ' FAILED: ' + blockRes.status);
      console.log('  ' + JSON.stringify(blockRes.body).substring(0, 200));
    }
  }

  if (blockIds.length !== 3) {
    console.log('\nFAIL: Could not create all 3 blocks');
    return;
  }
  console.log('All 3 blocks created\n');

  // Step 3: Verify blocks exist via API
  console.log('Step 3: Verifying blocks exist before deletion...');
  const blocksRes = await makeRequest('GET', '/api/v1/farm/farms/' + farmId + '/blocks');
  const blocksBefore = blocksRes.body.data || blocksRes.body;
  const blockCountBefore = Array.isArray(blocksBefore) ? blocksBefore.length : (blocksBefore.items ? blocksBefore.items.length : 0);
  console.log('Blocks count before deletion: ' + blockCountBefore + '\n');

  // Step 4: Delete the farm
  console.log('Step 4: Deleting farm (should cascade to blocks)...');
  const delRes = await makeRequest('DELETE', '/api/v1/farm/farms/' + farmId + '?reason=cascade_test');
  console.log('Delete status: ' + delRes.status);
  if (delRes.body && delRes.body.data) {
    const stats = delRes.body.data.statistics || delRes.body.data;
    console.log('Delete result: ' + JSON.stringify(stats));
  } else {
    console.log('Delete response: ' + JSON.stringify(delRes.body).substring(0, 300));
  }
  console.log('');

  // Step 5: Verify farm is gone
  console.log('Step 5: Verifying farm is removed...');
  const farmCheck = await makeRequest('GET', '/api/v1/farm/farms/' + farmId);
  console.log('Farm GET status: ' + farmCheck.status + ' (should be 404)');
  const farmGone = farmCheck.status === 404;
  console.log('Farm removed: ' + (farmGone ? 'PASS' : 'FAIL') + '\n');

  // Step 6: Verify blocks are gone
  console.log('Step 6: Verifying all 3 blocks are removed...');
  let blocksGone = true;
  for (let i = 0; i < blockIds.length; i++) {
    // Try to get each block individually
    const blockCheck = await makeRequest('GET', '/api/v1/farm/blocks/' + blockIds[i]);
    const isGone = blockCheck.status === 404;
    console.log('  Block ' + (i+1) + ' (' + blockIds[i].substring(0,8) + '...): ' + (isGone ? 'REMOVED' : 'STILL EXISTS (status ' + blockCheck.status + ')'));
    if (!isGone) blocksGone = false;
  }

  // Also check farm's block list returns error or empty
  const blocksAfter = await makeRequest('GET', '/api/v1/farm/farms/' + farmId + '/blocks');
  console.log('Farm blocks endpoint status: ' + blocksAfter.status + ' (should be 404 since farm gone)');
  console.log('');

  // Step 7: Summary
  console.log('=== VERIFICATION ===');
  console.log('Farm deleted: ' + (farmGone ? 'PASS' : 'FAIL'));
  console.log('All blocks cascaded: ' + (blocksGone ? 'PASS' : 'FAIL'));
  console.log('Overall: ' + ((farmGone && blocksGone) ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'));
}

main().catch(e => console.log('ERROR: ' + e.message));
