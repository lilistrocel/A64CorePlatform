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
  // Create test farm for UI verification
  console.log('Creating test farm for UI concurrent edit test...');
  const createRes = await makeRequest('POST', '/api/v1/farm/farms', {
    name: 'CONCURRENT_UI_TEST',
    description: 'Created for concurrent edit UI test',
    location: { city: 'Dubai', state: 'Dubai', country: 'UAE' },
    totalArea: 50
  });

  if (createRes.status !== 201) {
    console.log('FAIL: Status ' + createRes.status);
    console.log(JSON.stringify(createRes.body).substring(0, 300));
    return;
  }

  const farmId = createRes.body.data ? createRes.body.data.farmId : createRes.body.farmId;
  console.log('Farm ID: ' + farmId);

  // Simulate Tab 1 edit
  console.log('Tab 1: Editing to ConcurrentNameA...');
  const edit1 = await makeRequest('PATCH', '/api/v1/farm/farms/' + farmId, {
    name: 'ConcurrentNameA'
  });
  console.log('Tab 1 status: ' + edit1.status);

  // Small delay
  await new Promise(r => setTimeout(r, 200));

  // Simulate Tab 2 edit (last write wins)
  console.log('Tab 2: Editing to ConcurrentNameB...');
  const edit2 = await makeRequest('PATCH', '/api/v1/farm/farms/' + farmId, {
    name: 'ConcurrentNameB'
  });
  console.log('Tab 2 status: ' + edit2.status);

  // Verify
  const verify = await makeRequest('GET', '/api/v1/farm/farms/' + farmId);
  const finalName = verify.body.data ? verify.body.data.name : verify.body.name;
  console.log('Final name: ' + finalName);
  console.log('Last write wins: ' + (finalName === 'ConcurrentNameB' ? 'PASS' : 'FAIL'));

  // Write farm ID for browser verification
  fs.writeFileSync('/tmp/concurrent_farmid.txt', farmId);
  console.log('Farm ID saved for browser verification');
}

main().catch(e => console.log('ERROR: ' + e.message));
