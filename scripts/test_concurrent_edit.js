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
      path: url.pathname,
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
  console.log('=== Feature #125: Concurrent Edit Test ===\n');

  // Step 1: Create a test farm
  console.log('Step 1: Creating test farm...');
  const createRes = await makeRequest('POST', '/api/v1/farm/farms', {
    name: 'CONCURRENT_TEST_FARM_ORIGINAL',
    description: 'Test farm for concurrent edit verification',
    location: { city: 'Abu Dhabi', state: 'Abu Dhabi', country: 'UAE' },
    totalArea: 100
  });

  if (createRes.status !== 201) {
    console.log('FAIL: Could not create test farm. Status:', createRes.status);
    console.log('Response:', JSON.stringify(createRes.body).substring(0, 300));
    return;
  }

  const farmId = createRes.body.data ? createRes.body.data.farmId : createRes.body.farmId;
  console.log('Created farm:', farmId);
  console.log('Original name: CONCURRENT_TEST_FARM_ORIGINAL\n');

  // Step 2: "Tab 1" reads the farm (simulating opening in first tab)
  console.log('Step 2: Tab 1 reads the farm...');
  const read1 = await makeRequest('GET', '/api/v1/farm/farms/' + farmId);
  const originalUpdatedAt1 = read1.body.data ? read1.body.data.updatedAt : read1.body.updatedAt;
  console.log('Tab 1 sees name:', (read1.body.data || read1.body).name);
  console.log('Tab 1 sees updatedAt:', originalUpdatedAt1, '\n');

  // Step 3: "Tab 2" reads the farm (simulating opening in second tab)
  console.log('Step 3: Tab 2 reads the farm...');
  const read2 = await makeRequest('GET', '/api/v1/farm/farms/' + farmId);
  const originalUpdatedAt2 = read2.body.data ? read2.body.data.updatedAt : read2.body.updatedAt;
  console.log('Tab 2 sees name:', (read2.body.data || read2.body).name);
  console.log('Tab 2 sees updatedAt:', originalUpdatedAt2, '\n');

  // Step 4: Tab 1 edits farm name to 'NameA'
  console.log('Step 4: Tab 1 saves name as "CONCURRENT_TEST_NameA"...');
  const edit1 = await makeRequest('PATCH', '/api/v1/farm/farms/' + farmId, {
    name: 'CONCURRENT_TEST_NameA'
  });
  console.log('Tab 1 save status:', edit1.status);
  const nameAfterEdit1 = edit1.body.data ? edit1.body.data.name : (edit1.body.name || 'unknown');
  const updatedAtAfterEdit1 = edit1.body.data ? edit1.body.data.updatedAt : edit1.body.updatedAt;
  console.log('Tab 1 result name:', nameAfterEdit1);
  console.log('Tab 1 result updatedAt:', updatedAtAfterEdit1, '\n');

  // Small delay to ensure different timestamps
  await new Promise(r => setTimeout(r, 100));

  // Step 5: Tab 2 edits farm name to 'NameB' (last write wins)
  console.log('Step 5: Tab 2 saves name as "CONCURRENT_TEST_NameB"...');
  const edit2 = await makeRequest('PATCH', '/api/v1/farm/farms/' + farmId, {
    name: 'CONCURRENT_TEST_NameB'
  });
  console.log('Tab 2 save status:', edit2.status);
  const nameAfterEdit2 = edit2.body.data ? edit2.body.data.name : (edit2.body.name || 'unknown');
  const updatedAtAfterEdit2 = edit2.body.data ? edit2.body.data.updatedAt : edit2.body.updatedAt;
  console.log('Tab 2 result name:', nameAfterEdit2);
  console.log('Tab 2 result updatedAt:', updatedAtAfterEdit2, '\n');

  // Step 6: Verify final state - latest save should win
  console.log('Step 6: Verifying final state (fresh GET)...');
  const finalRead = await makeRequest('GET', '/api/v1/farm/farms/' + farmId);
  const finalName = finalRead.body.data ? finalRead.body.data.name : finalRead.body.name;
  const finalUpdatedAt = finalRead.body.data ? finalRead.body.data.updatedAt : finalRead.body.updatedAt;
  const finalDescription = finalRead.body.data ? finalRead.body.data.description : finalRead.body.description;
  const finalTotalArea = finalRead.body.data ? finalRead.body.data.totalArea : finalRead.body.totalArea;

  console.log('Final farm name:', finalName);
  console.log('Final updatedAt:', finalUpdatedAt);
  console.log('Final description:', finalDescription);
  console.log('Final totalArea:', finalTotalArea, '\n');

  // Step 7: Verify results
  console.log('=== VERIFICATION ===');
  const lastWriteWins = finalName === 'CONCURRENT_TEST_NameB';
  console.log('Last write wins (NameB persisted):', lastWriteWins ? 'PASS' : 'FAIL');

  const noDataCorruption = finalDescription === 'Test farm for concurrent edit verification' && finalTotalArea === 100;
  console.log('No data corruption (other fields intact):', noDataCorruption ? 'PASS' : 'FAIL');

  const timestampUpdated = finalUpdatedAt !== originalUpdatedAt1;
  console.log('Timestamp updated:', timestampUpdated ? 'PASS' : 'FAIL');

  console.log('\nOverall:', (lastWriteWins && noDataCorruption && timestampUpdated) ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');

  // Step 8: Cleanup - delete the test farm
  console.log('\nStep 8: Cleaning up test farm...');
  const delRes = await makeRequest('DELETE', '/api/v1/farm/farms/' + farmId);
  console.log('Delete status:', delRes.status);

  // Save farmId for UI verification
  fs.writeFileSync('/tmp/concurrent_test_farmid.txt', farmId);
}

main().catch(e => console.log('ERROR:', e.message));
