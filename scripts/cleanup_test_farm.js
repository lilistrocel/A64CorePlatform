const fs = require('fs');
const http = require('http');

const TOKEN = fs.readFileSync('/tmp/admin_token.txt', 'utf8').trim();
const farmId = fs.readFileSync('/tmp/concurrent_farmid.txt', 'utf8').trim();
const BASE = 'http://127.0.0.1:8000';

function makeRequest(method, path) {
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
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('Cleaning up test farm: ' + farmId);
  const res = await makeRequest('DELETE', '/api/v1/farm/farms/' + farmId);
  console.log('Delete status: ' + res.status);
}

main().catch(e => console.log('ERROR: ' + e.message));
