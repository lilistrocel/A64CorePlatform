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
  console.log('=== Feature #258: Contract Date Validation ===\n');

  // Step 1: Get an employee to create contracts for
  console.log('Step 1: Getting employees list...');
  const empRes = await makeRequest('GET', '/api/v1/hr/employees?page=1&perPage=5');
  console.log('Employees status: ' + empRes.status);

  let employeeId;
  if (empRes.status === 200 && empRes.body.data) {
    const employees = Array.isArray(empRes.body.data) ? empRes.body.data : (empRes.body.data.items || []);
    if (employees.length > 0) {
      employeeId = employees[0].employeeId;
      console.log('Using existing employee: ' + employeeId);
      console.log('Employee name: ' + (employees[0].firstName || '') + ' ' + (employees[0].lastName || ''));
    }
  }

  if (!employeeId) {
    // Create a test employee
    console.log('No employees found, creating test employee...');
    const createEmpRes = await makeRequest('POST', '/api/v1/hr/employees', {
      firstName: 'ContractTest',
      lastName: 'Employee',
      email: 'contracttest@a64core.com',
      phone: '+971501234567',
      department: 'IT',
      position: 'Developer',
      hireDate: '2024-01-15',
      employmentType: 'full_time',
      status: 'active'
    });
    console.log('Create employee status: ' + createEmpRes.status);
    if (createEmpRes.status === 201) {
      employeeId = createEmpRes.body.data ? createEmpRes.body.data.employeeId : createEmpRes.body.employeeId;
      console.log('Created employee: ' + employeeId);
    } else {
      console.log('Response: ' + JSON.stringify(createEmpRes.body).substring(0, 300));
      return;
    }
  }
  console.log('');

  // Step 2: Try to create contract with endDate BEFORE startDate (should fail)
  console.log('Step 2: Creating contract with endDate BEFORE startDate...');
  console.log('  startDate: 2026-06-01, endDate: 2025-01-01 (INVALID)');
  const invalidRes = await makeRequest('POST', '/api/v1/hr/contracts/employee/' + employeeId + '/contracts', {
    employeeId: employeeId,
    type: 'full_time',
    startDate: '2026-06-01',
    endDate: '2025-01-01',
    salary: 5000,
    currency: 'AED',
    benefits: ['health_insurance'],
    status: 'active'
  });
  console.log('  Status: ' + invalidRes.status + ' (expected 400)');
  const invalidDetail = invalidRes.body.detail || JSON.stringify(invalidRes.body).substring(0, 200);
  console.log('  Detail: ' + invalidDetail);
  const invalidRejected = invalidRes.status === 400;
  console.log('  Validation rejected: ' + (invalidRejected ? 'PASS' : 'FAIL'));
  console.log('');

  // Step 3: Create contract with valid dates (endDate AFTER startDate)
  console.log('Step 3: Creating contract with valid dates...');
  console.log('  startDate: 2026-01-01, endDate: 2026-12-31 (VALID)');
  const validRes = await makeRequest('POST', '/api/v1/hr/contracts/employee/' + employeeId + '/contracts', {
    employeeId: employeeId,
    type: 'full_time',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    salary: 8000,
    currency: 'AED',
    benefits: ['health_insurance', 'annual_leave'],
    status: 'active'
  });
  console.log('  Status: ' + validRes.status + ' (expected 201)');
  const validSuccess = validRes.status === 201;
  let contractId = null;
  if (validSuccess) {
    contractId = validRes.body.data ? validRes.body.data.contractId : validRes.body.contractId;
    console.log('  Contract ID: ' + contractId);
    const startDate = validRes.body.data ? validRes.body.data.startDate : validRes.body.startDate;
    const endDate = validRes.body.data ? validRes.body.data.endDate : validRes.body.endDate;
    console.log('  startDate: ' + startDate);
    console.log('  endDate: ' + endDate);
  } else {
    console.log('  Response: ' + JSON.stringify(validRes.body).substring(0, 300));
  }
  console.log('  Created successfully: ' + (validSuccess ? 'PASS' : 'FAIL'));
  console.log('');

  // Step 4: Also test with endDate = startDate (same day - should this be valid?)
  console.log('Step 4: Creating contract with endDate = startDate (same day)...');
  const sameRes = await makeRequest('POST', '/api/v1/hr/contracts/employee/' + employeeId + '/contracts', {
    employeeId: employeeId,
    type: 'contractor',
    startDate: '2026-03-15',
    endDate: '2026-03-15',
    salary: 1000,
    currency: 'AED',
    benefits: [],
    status: 'active'
  });
  console.log('  Status: ' + sameRes.status);
  // Same day should be allowed (not "before")
  console.log('  Same day accepted: ' + (sameRes.status === 201 ? 'YES' : 'NO'));
  let sameDayContractId = null;
  if (sameRes.status === 201) {
    sameDayContractId = sameRes.body.data ? sameRes.body.data.contractId : sameRes.body.contractId;
  }
  console.log('');

  // Step 5: Test creating contract without endDate (open-ended)
  console.log('Step 5: Creating contract without endDate (indefinite)...');
  const noEndRes = await makeRequest('POST', '/api/v1/hr/contracts/employee/' + employeeId + '/contracts', {
    employeeId: employeeId,
    type: 'full_time',
    startDate: '2026-02-01',
    salary: 10000,
    currency: 'AED',
    benefits: ['health_insurance'],
    status: 'active'
  });
  console.log('  Status: ' + noEndRes.status + ' (expected 201)');
  const noEndSuccess = noEndRes.status === 201;
  let noEndContractId = null;
  if (noEndSuccess) {
    noEndContractId = noEndRes.body.data ? noEndRes.body.data.contractId : noEndRes.body.contractId;
    console.log('  Contract without endDate created: PASS');
  } else {
    console.log('  Response: ' + JSON.stringify(noEndRes.body).substring(0, 200));
  }
  console.log('');

  // Summary
  console.log('=== VERIFICATION ===');
  console.log('Invalid dates rejected (400): ' + (invalidRejected ? 'PASS' : 'FAIL'));
  console.log('Valid dates accepted (201): ' + (validSuccess ? 'PASS' : 'FAIL'));
  console.log('Overall: ' + ((invalidRejected && validSuccess) ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'));
  console.log('');

  // Cleanup: delete test contracts
  console.log('Cleanup: Deleting test contracts...');
  if (contractId) {
    const del1 = await makeRequest('DELETE', '/api/v1/hr/contracts/' + contractId);
    console.log('  Valid contract deleted: ' + del1.status);
  }
  if (sameDayContractId) {
    const del2 = await makeRequest('DELETE', '/api/v1/hr/contracts/' + sameDayContractId);
    console.log('  Same-day contract deleted: ' + del2.status);
  }
  if (noEndContractId) {
    const del3 = await makeRequest('DELETE', '/api/v1/hr/contracts/' + noEndContractId);
    console.log('  No-end contract deleted: ' + del3.status);
  }
}

main().catch(e => console.log('ERROR: ' + e.message));
