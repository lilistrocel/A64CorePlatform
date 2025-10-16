# System Test Plan - A64 Core Platform

## Test Status: Ready to Execute
**Created:** 2025-10-16
**Version:** v1.1.0

---

## Test Environment

### Prerequisites
- Docker and Docker Compose installed
- Ports available: 8000 (API), 27017 (MongoDB), 3306 (MySQL), 8080 (Adminer)
- Internet connection (for first-time image pull)

### Test Tools
- curl (HTTP requests)
- Browser (API documentation, Adminer)
- Python requests (optional advanced testing)

---

## Test Execution Plan

### Phase 1: Infrastructure Tests ✅

#### Test 1.1: Docker Container Startup
**Command:**
```bash
docker-compose up -d
```

**Expected Result:**
- All containers start successfully
- No error messages
- Services: api, mongodb, mysql, adminer

**Verification:**
```bash
docker ps
```
Should show 4 running containers.

---

#### Test 1.2: Health Check Endpoints
**Test:** API Health Check
```bash
curl http://localhost:8000/api/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-16T...",
  "service": "A64 Core Platform API Hub",
  "version": "1.0.0"
}
```

**Test:** Readiness Check
```bash
curl http://localhost:8000/api/ready
```

**Expected Response:**
```json
{
  "ready": true,
  "timestamp": "2025-10-16T...",
  "checks": {
    "mongodb": "healthy",
    "mysql": "healthy"
  }
}
```

---

#### Test 1.3: API Documentation
**Test:** Swagger UI
- Open: http://localhost:8000/api/docs
- Should load interactive API documentation
- All 13 endpoints should be visible

**Test:** ReDoc
- Open: http://localhost:8000/api/redoc
- Should load alternative documentation view

---

#### Test 1.4: Database Management UI
**Test:** Adminer Access
- Open: http://localhost:8000:8080
- Login to MongoDB or MySQL
- Should successfully connect

---

### Phase 2: Authentication Tests

#### Test 2.1: User Registration
**Request:**
```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "TestPass123!",
    "firstName": "Test",
    "lastName": "User"
  }'
```

**Expected Response:** 201 Created
```json
{
  "userId": "uuid",
  "email": "testuser@example.com",
  "firstName": "Test",
  "lastName": "User",
  "role": "user",
  "isActive": true,
  "isEmailVerified": false,
  ...
}
```

**Verification:**
- Check Docker logs for verification email
- Email should be logged to console (development mode)

---

#### Test 2.2: Duplicate Registration
**Request:**
```bash
# Try to register same email again
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "TestPass123!",
    "firstName": "Test",
    "lastName": "User"
  }'
```

**Expected Response:** 409 Conflict
```json
{
  "detail": "Email already registered"
}
```

---

#### Test 2.3: User Login
**Request:**
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "TestPass123!"
  }'
```

**Expected Response:** 200 OK
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "tokenType": "bearer",
  "expiresIn": 3600,
  "user": {
    "userId": "uuid",
    "email": "testuser@example.com",
    ...
  }
}
```

**Save the accessToken for next tests!**

---

#### Test 2.4: Invalid Login
**Request:**
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "WrongPassword!"
  }'
```

**Expected Response:** 401 Unauthorized
```json
{
  "detail": "Invalid credentials"
}
```

---

#### Test 2.5: Get Current User
**Request:**
```bash
curl -X GET http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected Response:** 200 OK
```json
{
  "userId": "uuid",
  "email": "testuser@example.com",
  "firstName": "Test",
  "lastName": "User",
  "role": "user",
  "isActive": true,
  "isEmailVerified": false
}
```

---

#### Test 2.6: Unauthorized Access
**Request:**
```bash
curl -X GET http://localhost:8000/api/v1/auth/me
```

**Expected Response:** 403 Forbidden
```json
{
  "detail": "Not authenticated"
}
```

---

### Phase 3: Email Verification Tests

#### Test 3.1: Resend Verification Email
**Request:**
```bash
curl -X POST http://localhost:8000/api/v1/auth/send-verification-email \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected Response:** 200 OK
```json
{
  "message": "Verification email sent successfully"
}
```

**Verification:**
- Check Docker logs
- Verification link should be logged
- Copy the token from the link

---

#### Test 3.2: Verify Email
**Request:**
```bash
curl -X POST http://localhost:8000/api/v1/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "token": "TOKEN_FROM_EMAIL"
  }'
```

**Expected Response:** 200 OK
```json
{
  "userId": "uuid",
  "email": "testuser@example.com",
  "isEmailVerified": true,
  ...
}
```

**Verification:**
- Check Docker logs for welcome email
- Welcome email should be logged

---

#### Test 3.3: Verify Email with Already Used Token
**Request:**
```bash
# Try to use the same token again
curl -X POST http://localhost:8000/api/v1/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "token": "SAME_TOKEN_FROM_BEFORE"
  }'
```

**Expected Response:** 400 Bad Request
```json
{
  "detail": "Verification token already used"
}
```

---

### Phase 4: Password Reset Tests

#### Test 4.1: Request Password Reset
**Request:**
```bash
curl -X POST http://localhost:8000/api/v1/auth/request-password-reset \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com"
  }'
```

**Expected Response:** 200 OK (always)
```json
{
  "message": "If your email is registered, you will receive a password reset link"
}
```

**Verification:**
- Check Docker logs
- Password reset link should be logged
- Copy the token from the link

---

#### Test 4.2: Reset Password
**Request:**
```bash
curl -X POST http://localhost:8000/api/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "TOKEN_FROM_EMAIL",
    "newPassword": "NewTestPass123!"
  }'
```

**Expected Response:** 200 OK
```json
{
  "message": "Password reset successfully"
}
```

---

#### Test 4.3: Login with New Password
**Request:**
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "NewTestPass123!"
  }'
```

**Expected Response:** 200 OK with new tokens

---

#### Test 4.4: Old Password Should Not Work
**Request:**
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "TestPass123!"
  }'
```

**Expected Response:** 401 Unauthorized

---

### Phase 5: Rate Limiting Tests

#### Test 5.1: Login Rate Limiting
**Request:**
```bash
# Try 6 failed logins in a row
for i in {1..6}; do
  echo "Attempt $i:"
  curl -X POST http://localhost:8000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "testuser@example.com",
      "password": "WrongPassword!"
    }'
  echo ""
done
```

**Expected Result:**
- First 5 attempts: 401 Unauthorized
- 6th attempt: 429 Too Many Requests
```json
{
  "detail": "Too many failed login attempts. Try again in 15 minutes."
}
```

---

#### Test 5.2: Role-Based Rate Limiting
**Note:** This requires making many requests rapidly. Use a script:

```bash
# Test guest rate limit (10 req/min)
for i in {1..15}; do
  curl -s http://localhost:8000/api/health > /dev/null
done
```

**Expected Result:**
- First 10 requests: 200 OK
- Requests 11-15: 429 Too Many Requests

---

### Phase 6: Token Tests

#### Test 6.1: Refresh Token
**Request:**
```bash
curl -X POST http://localhost:8000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
```

**Expected Response:** 200 OK with new tokens
```json
{
  "accessToken": "new_access_token",
  "refreshToken": "new_refresh_token",
  ...
}
```

**Note:** Old refresh token should now be invalid (rotating tokens).

---

#### Test 6.2: Logout
**Request:**
```bash
curl -X POST http://localhost:8000/api/v1/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
```

**Expected Response:** 200 OK
```json
{
  "message": "Logged out successfully"
}
```

---

#### Test 6.3: Use Revoked Refresh Token
**Request:**
```bash
# Try to use the refresh token after logout
curl -X POST http://localhost:8000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "REVOKED_REFRESH_TOKEN"
  }'
```

**Expected Response:** 401 Unauthorized
```json
{
  "detail": "Refresh token has been revoked"
}
```

---

### Phase 7: User Management Tests (Admin Only)

**Note:** These tests require an admin user. For now, manually create an admin user in the database or skip these tests.

#### Test 7.1: List Users (Without Admin Role)
**Request:**
```bash
curl -X GET http://localhost:8000/api/v1/users \
  -H "Authorization: Bearer USER_ACCESS_TOKEN"
```

**Expected Response:** 403 Forbidden
```json
{
  "detail": "Admin access required"
}
```

---

## Test Results Template

### Test Execution Log

| Test ID | Test Name | Status | Notes |
|---------|-----------|--------|-------|
| 1.1 | Docker Startup | ⏳ Pending | |
| 1.2 | Health Checks | ⏳ Pending | |
| 1.3 | API Documentation | ⏳ Pending | |
| 1.4 | Database UI | ⏳ Pending | |
| 2.1 | User Registration | ⏳ Pending | |
| 2.2 | Duplicate Registration | ⏳ Pending | |
| 2.3 | User Login | ⏳ Pending | |
| 2.4 | Invalid Login | ⏳ Pending | |
| 2.5 | Get Current User | ⏳ Pending | |
| 2.6 | Unauthorized Access | ⏳ Pending | |
| 3.1 | Resend Verification | ⏳ Pending | |
| 3.2 | Verify Email | ⏳ Pending | |
| 3.3 | Reuse Token | ⏳ Pending | |
| 4.1 | Request Reset | ⏳ Pending | |
| 4.2 | Reset Password | ⏳ Pending | |
| 4.3 | Login New Password | ⏳ Pending | |
| 4.4 | Login Old Password | ⏳ Pending | |
| 5.1 | Login Rate Limit | ⏳ Pending | |
| 5.2 | Role Rate Limit | ⏳ Pending | |
| 6.1 | Refresh Token | ⏳ Pending | |
| 6.2 | Logout | ⏳ Pending | |
| 6.3 | Revoked Token | ⏳ Pending | |
| 8.1 | Quick Perf Test | ⏳ Pending | Python (Cross-platform) |
| 8.2 | Apache Bench Test | ⏳ Pending | Linux/Mac only |
| 8.3 | K6 Load Test | ⏳ Pending | Cross-platform |

---

## Automated Test Script

Save this as `test-auth-system.sh`:

```bash
#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

API_URL="http://localhost:8000"

echo "================================"
echo "A64 Core Platform - System Test"
echo "================================"

# Test 1: Health Check
echo -e "\n${YELLOW}Test 1: Health Check${NC}"
HEALTH=$(curl -s $API_URL/api/health)
if echo $HEALTH | grep -q "healthy"; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC}"
fi

# Test 2: User Registration
echo -e "\n${YELLOW}Test 2: User Registration${NC}"
REGISTER=$(curl -s -X POST $API_URL/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "TestPass123!",
    "firstName": "Test",
    "lastName": "User"
  }')
if echo $REGISTER | grep -q "userId"; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC}"
    echo $REGISTER
fi

# Test 3: User Login
echo -e "\n${YELLOW}Test 3: User Login${NC}"
LOGIN=$(curl -s -X POST $API_URL/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "TestPass123!"
  }')
if echo $LOGIN | grep -q "accessToken"; then
    echo -e "${GREEN}✅ PASS${NC}"
    ACCESS_TOKEN=$(echo $LOGIN | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
    echo "Access Token: ${ACCESS_TOKEN:0:50}..."
else
    echo -e "${RED}❌ FAIL${NC}"
    echo $LOGIN
fi

# Test 4: Get Current User
echo -e "\n${YELLOW}Test 4: Get Current User${NC}"
ME=$(curl -s -X GET $API_URL/api/v1/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN")
if echo $ME | grep -q "testuser@example.com"; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC}"
    echo $ME
fi

echo -e "\n================================"
echo "Test Suite Completed"
echo "================================"
```

Run with:
```bash
chmod +x test-auth-system.sh
./test-auth-system.sh
```

---

## Phase 8: Performance Tests ⚠️ Cross-Platform

### Test 8.1: Quick Performance Test (Python - Recommended)

**Platform Support:**
- ✅ Windows 10/11
- ✅ Linux (all distributions)
- ✅ macOS

**Installation:**
```bash
# Windows (PowerShell or CMD)
pip install requests colorama

# Linux/Mac
pip3 install requests colorama
```

**Usage:**
```bash
# Windows
python tests\performance\quick_perf_test.py

# Linux/Mac
python3 tests/performance/quick_perf_test.py

# Custom configuration
python quick_perf_test.py --url http://localhost:8000 --requests 2000 --concurrency 20
```

**Expected Results:**
- Health endpoint: > 100 req/sec, p95 < 500ms
- Readiness endpoint: > 50 req/sec, p95 < 500ms
- Registration endpoint: > 20 req/sec, p95 < 600ms
- Documentation endpoint: > 100 req/sec, p95 < 500ms
- Error rate: < 0.1%

**Tests Performed:**
1. Health endpoint (baseline performance)
2. Readiness endpoint (with database check)
3. User registration (write operations)
4. API documentation (static content)

---

### Test 8.2: Apache Bench Test (Linux/Mac Only)

**Platform Support:**
- ✅ Linux (all distributions)
- ✅ macOS
- ❌ Windows (use Python version or WSL)

**Installation:**
```bash
# Ubuntu/Debian
sudo apt-get install apache2-utils

# macOS
brew install httpd
```

**Usage:**
```bash
# Make executable (first time)
chmod +x tests/performance/quick-perf-test.sh

# Run tests
./tests/performance/quick-perf-test.sh

# Custom configuration
API_URL=http://localhost:8000 REQUESTS=2000 CONCURRENCY=20 ./tests/performance/quick-perf-test.sh
```

---

### Test 8.3: Comprehensive Load Test (k6)

**Platform Support:**
- ✅ Windows 10/11
- ✅ Linux (all distributions)
- ✅ macOS

**Installation:**

**Windows (Chocolatey):**
```powershell
choco install k6
```

**Windows (Manual):**
Download from: https://dl.k6.io/msi/k6-latest-amd64.msi

**Linux (Debian/Ubuntu):**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**macOS:**
```bash
brew install k6
```

**Usage:**
```bash
# Windows
k6 run tests\performance\load-test-auth.js

# Linux/Mac
k6 run tests/performance/load-test-auth.js

# Custom configuration
k6 run --vus 50 --duration 5m tests/performance/load-test-auth.js
```

**Expected Results:**
- HTTP request duration p95 < 500ms
- HTTP request duration p99 < 1000ms
- HTTP request failure rate < 1%
- Throughput > 50 req/s
- Login duration p95 < 400ms
- Token validation duration p95 < 100ms

**Load Test Stages:**
1. Warm up: 10 users for 30s
2. Ramp up: 50 users for 1m
3. Peak load: 100 users for 3m
4. Sustain: 100 users for 2m
5. Ramp down: 0 users for 30s

**Test Scenarios:**
- 10% - User registration flow
- 70% - Login + get profile flow
- 20% - Token refresh flow

---

### Performance Testing Summary

**Recommended Workflow:**

1. **Quick Testing (2-3 minutes):**
   - Use Python script for quick smoke testing
   - Run on both Windows and Linux
   - Perfect for daily development

2. **Comprehensive Testing (6-7 minutes):**
   - Use k6 load test before deployment
   - Simulates real user behavior
   - Detailed metrics and thresholds

3. **Platform-Specific:**
   - Windows: Use Python script or k6
   - Linux: Can use any tool (Python, Bash, k6)
   - macOS: Can use any tool (Python, Bash, k6)

**Performance Targets:**
- Response Time p50: < 100ms
- Response Time p95: < 500ms
- Response Time p99: < 1000ms
- Throughput: > 100 req/sec
- Error Rate: < 0.1%

**See Also:**
- [Performance Testing README](../../tests/performance/README.md)
- [CLAUDE.md - Performance Testing Standards](../../CLAUDE.md)

---

## Known Issues / Limitations

1. **Email Verification in Development:**
   - Emails are logged to console, not actually sent
   - Production requires email service configuration (SendGrid/SES)

2. **Rate Limiting:**
   - Currently uses in-memory storage
   - Does not persist across container restarts
   - Production requires Redis for distributed rate limiting

3. **Database Persistence:**
   - Data is stored in Docker volumes
   - Survives container restarts
   - Destroyed with `docker-compose down -v`

4. **Cross-Platform Compatibility:**
   - Bash scripts only work on Linux/Mac
   - For Windows: use Python scripts or k6
   - All Python scripts work on all platforms

---

## Next Steps After Testing

1. **If all tests pass:**
   - System is production-ready (after email service integration)
   - Document any findings in DevLog
   - Create release notes

2. **If tests fail:**
   - Document failures
   - Debug and fix issues
   - Re-run tests
   - Update relevant documentation

3. **Future enhancements:**
   - Add unit tests (80% coverage target)
   - Add integration tests
   - Add load testing
   - Security audit
   - Performance profiling

---

**Test Plan Created:** 2025-10-16
**Last Updated:** 2025-10-16
**Version:** 1.1.0 - Added cross-platform performance testing (Phase 8)
