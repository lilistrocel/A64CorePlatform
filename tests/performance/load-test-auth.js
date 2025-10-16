// load-test-auth.js
// Performance/Load Test for A64 Core Platform Authentication System
//
// Usage: k6 run load-test-auth.js
//
// Requirements:
// - Install k6: https://k6.io/docs/getting-started/installation/
// - API must be running: docker-compose up -d
// - Test user must exist or auto-register

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
let loginErrorRate = new Rate('login_errors');
let loginDuration = new Trend('login_duration');
let tokenValidationDuration = new Trend('token_validation_duration');
let registrationDuration = new Trend('registration_duration');

// Test configuration
export let options = {
  // Load test stages
  stages: [
    { duration: '30s', target: 10 },   // Warm up: 10 users
    { duration: '1m', target: 50 },    // Ramp up to 50 users
    { duration: '3m', target: 100 },   // Peak load: 100 users
    { duration: '2m', target: 100 },   // Sustain peak
    { duration: '30s', target: 0 },    // Ramp down
  ],

  // Performance thresholds (fail test if not met)
  thresholds: {
    // HTTP request duration (95th percentile should be below 500ms)
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],

    // HTTP request failure rate should be below 1%
    'http_req_failed': ['rate<0.01'],

    // Custom metrics
    'login_errors': ['rate<0.01'],
    'login_duration': ['p(95)<400'],
    'token_validation_duration': ['p(95)<100'],
    'registration_duration': ['p(95)<600'],

    // Throughput: at least 50 requests per second
    'http_reqs': ['rate>50'],
  },

  // Cloud execution (optional, for k6 cloud)
  // ext: {
  //   loadimpact: {
  //     projectID: 123456,
  //     name: 'A64 Core Platform - Auth Load Test'
  //   }
  // }
};

// Test configuration
const BASE_URL = __ENV.API_URL || 'http://localhost:8000';
const API_VERSION = '/api/v1';

// Test data
let testUserId = Math.floor(Math.random() * 1000000);
let testEmail = `loadtest${testUserId}@example.com`;
let testPassword = 'LoadTest123!';
let accessToken = '';
let refreshToken = '';

export function setup() {
  console.log('=================================');
  console.log('A64 Core Platform - Load Test');
  console.log('=================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test User: ${testEmail}`);
  console.log('');

  // Health check before starting
  let healthRes = http.get(`${BASE_URL}/api/health`);
  if (healthRes.status !== 200) {
    console.error('API health check failed!');
    console.error(`Status: ${healthRes.status}`);
    console.error(`Body: ${healthRes.body}`);
    return;
  }

  console.log('✅ API health check passed');
  console.log('');

  return { testEmail, testPassword };
}

export default function(data) {
  // Use setup data or generate new
  let email = data ? data.testEmail : testEmail;
  let password = data ? data.testPassword : testPassword;

  // Randomly choose which flow to test (simulate real user behavior)
  let scenario = Math.random();

  if (scenario < 0.1) {
    // 10% of users: Registration flow
    testRegistration();
  } else if (scenario < 0.8) {
    // 70% of users: Login + Get profile flow
    testLoginFlow(email, password);
  } else {
    // 20% of users: Token refresh flow
    testTokenRefresh(email, password);
  }

  // Think time: simulate user reading/processing
  sleep(Math.random() * 2 + 1); // 1-3 seconds
}

function testRegistration() {
  group('User Registration', function() {
    let uniqueEmail = `loadtest${Date.now()}${Math.random()}@example.com`;

    let payload = JSON.stringify({
      email: uniqueEmail,
      password: 'LoadTest123!',
      firstName: 'Load',
      lastName: 'Test'
    });

    let params = {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'Registration' }
    };

    let startTime = Date.now();
    let res = http.post(
      `${BASE_URL}${API_VERSION}/auth/register`,
      payload,
      params
    );
    let duration = Date.now() - startTime;

    registrationDuration.add(duration);

    let success = check(res, {
      'registration status is 201': (r) => r.status === 201,
      'registration has userId': (r) => JSON.parse(r.body).userId !== undefined,
      'registration response time < 1s': (r) => duration < 1000,
    });

    if (!success) {
      console.error(`Registration failed: ${res.status} - ${res.body}`);
    }
  });
}

function testLoginFlow(email, password) {
  group('Login Flow', function() {
    // Step 1: Login
    let loginPayload = JSON.stringify({
      email: email,
      password: password
    });

    let params = {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'Login' }
    };

    let startTime = Date.now();
    let loginRes = http.post(
      `${BASE_URL}${API_VERSION}/auth/login`,
      loginPayload,
      params
    );
    let duration = Date.now() - startTime;

    loginDuration.add(duration);

    let loginSuccess = check(loginRes, {
      'login status is 200 or 401': (r) => r.status === 200 || r.status === 401,
      'login response time < 500ms': (r) => duration < 500,
    });

    if (loginRes.status === 200) {
      let loginBody = JSON.parse(loginRes.body);
      let token = loginBody.accessToken;

      loginErrorRate.add(0);

      // Step 2: Get current user profile (token validation)
      sleep(0.5); // Think time

      let meParams = {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        tags: { name: 'GetProfile' }
      };

      let meStartTime = Date.now();
      let meRes = http.get(
        `${BASE_URL}${API_VERSION}/auth/me`,
        meParams
      );
      let meDuration = Date.now() - meStartTime;

      tokenValidationDuration.add(meDuration);

      check(meRes, {
        'get profile status is 200': (r) => r.status === 200,
        'get profile has email': (r) => JSON.parse(r.body).email !== undefined,
        'token validation time < 200ms': (r) => meDuration < 200,
      });

    } else if (loginRes.status === 401) {
      // Expected for test users that don't exist
      loginErrorRate.add(0);
    } else {
      // Unexpected error
      loginErrorRate.add(1);
      console.error(`Login unexpected error: ${loginRes.status} - ${loginRes.body}`);
    }
  });
}

function testTokenRefresh(email, password) {
  group('Token Refresh Flow', function() {
    // First login to get tokens
    let loginPayload = JSON.stringify({
      email: email,
      password: password
    });

    let params = {
      headers: { 'Content-Type': 'application/json' }
    };

    let loginRes = http.post(
      `${BASE_URL}${API_VERSION}/auth/login`,
      loginPayload,
      params
    );

    if (loginRes.status === 200) {
      let loginBody = JSON.parse(loginRes.body);
      let refreshToken = loginBody.refreshToken;

      sleep(0.3); // Think time

      // Test refresh token
      let refreshPayload = JSON.stringify({
        refreshToken: refreshToken
      });

      let refreshRes = http.post(
        `${BASE_URL}${API_VERSION}/auth/refresh`,
        refreshPayload,
        params
      );

      check(refreshRes, {
        'refresh status is 200': (r) => r.status === 200,
        'refresh returns new tokens': (r) => {
          if (r.status === 200) {
            let body = JSON.parse(r.body);
            return body.accessToken !== undefined && body.refreshToken !== undefined;
          }
          return false;
        },
        'refresh response time < 300ms': (r) => r.timings.duration < 300,
      });
    }
  });
}

export function teardown(data) {
  console.log('');
  console.log('=================================');
  console.log('Load Test Complete');
  console.log('=================================');
  console.log('Check k6 output above for detailed metrics');
  console.log('');
}

// Handle summary for better reporting
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data),
  };
}

function textSummary(data, options) {
  // This is a simplified summary function
  // k6 has built-in textSummary, but this shows custom metrics

  let output = '\n';
  output += '='.repeat(50) + '\n';
  output += '  A64 Core Platform - Load Test Summary\n';
  output += '='.repeat(50) + '\n\n';

  // Add metrics
  if (data.metrics) {
    output += 'Key Metrics:\n';
    output += '-'.repeat(50) + '\n';

    let metrics = data.metrics;

    if (metrics.http_req_duration) {
      output += `Response Time (p95): ${metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
      output += `Response Time (p99): ${metrics.http_req_duration.values['p(99)'].toFixed(2)}ms\n`;
    }

    if (metrics.http_reqs) {
      output += `Total Requests: ${metrics.http_reqs.values.count}\n`;
      output += `Request Rate: ${metrics.http_reqs.values.rate.toFixed(2)} req/s\n`;
    }

    if (metrics.http_req_failed) {
      output += `Error Rate: ${(metrics.http_req_failed.values.rate * 100).toFixed(2)}%\n`;
    }

    output += '\n';
  }

  return output;
}
