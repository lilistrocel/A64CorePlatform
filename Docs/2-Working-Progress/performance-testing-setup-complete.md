# Performance Testing Setup - Complete

## Status: ✅ Complete
**Date:** 2025-10-16
**Version:** v1.1.0

---

## Overview

Successfully added comprehensive performance testing standards and tools to the A64 Core Platform project.

---

## 🎯 What Was Added

### 1. Performance Testing Standards in CLAUDE.md ✅

Added a complete "Performance Testing Standards" section to [CLAUDE.md](../../CLAUDE.md) (lines 577-828) covering:

**When to Perform Performance Tests:**
- During all system testing (before deployment)
- After adding new features/endpoints
- After database schema changes
- After significant refactoring
- When modifying auth/authorization logic
- When changing rate limiting/caching

**Performance Targets:**
- API Response Time p50: < 100ms
- API Response Time p95: < 500ms
- API Response Time p99: < 1000ms
- Database Query Time: < 50ms average
- Authentication Time: < 200ms
- Token Validation: < 50ms
- Rate Limiting Check: < 10ms
- Error Rate: < 0.1%
- Throughput: > 100 req/sec (single instance)

**Load Testing Scenarios:**
1. Normal Load (10-50 concurrent users, 5-10 min)
2. Peak Load (100-500 concurrent users, 5-10 min)
3. Stress Testing (500-1000+ concurrent users, find breaking point)
4. Sustained Load (normal load for 1+ hours, check for leaks)

**Performance Testing Tools:**
- Apache Bench (ab) - Simple HTTP load testing
- wrk - Modern HTTP benchmarking
- Locust - Python-based with UI
- k6 - Modern with JavaScript

**What to Test:**
- Authentication endpoints (register, login, me, refresh)
- Database operations (read/write/complex queries)
- Rate limiting functionality
- Middleware performance overhead
- Database connection pooling

**Performance Monitoring Metrics:**
- Application: request rate, response times, error rate
- System: CPU usage, memory, disk I/O, network
- Database: query time, pool usage, cache hit rate

**Performance Testing Workflow:**
1. Baseline Testing (before changes)
2. Development Testing (during changes)
3. Integration Testing (after changes)
4. Pre-Deployment Testing (complete suite)

**Performance Optimization Guidelines:**
- Profile to identify bottlenecks
- Optimize database queries (indexes, avoid N+1)
- Implement caching strategies
- Use connection pooling
- Implement pagination
- Use async operations
- Minimize middleware overhead

**Performance Regression Policy:**
- 10% regression: Warning - investigate
- 20% regression: Blocker - must fix
- 50% regression: Critical - rollback

**Performance Testing Checklist:**
- [ ] Baseline metrics documented
- [ ] Load tests executed (normal, peak, stress)
- [ ] Response times within targets
- [ ] Error rate acceptable
- [ ] No memory leaks detected
- [ ] Database queries optimized
- [ ] Rate limiting verified
- [ ] Concurrent user load tested
- [ ] Resource usage acceptable
- [ ] Results documented

---

### 2. k6 Load Test Script ✅

Created [tests/performance/load-test-auth.js](../../tests/performance/load-test-auth.js) - comprehensive k6 load test script.

**Features:**
- Multi-stage load testing (warm up, ramp up, peak, sustain, ramp down)
- Custom metrics tracking (login duration, token validation, registration)
- Performance thresholds enforcement (p95 < 500ms, error rate < 1%)
- Multiple test scenarios (registration, login flow, token refresh)
- Realistic user behavior simulation (think time, random scenarios)
- Detailed test summary and JSON output

**Test Stages:**
1. Warm up: 30s → 10 users
2. Ramp up: 1min → 50 users
3. Peak load: 3min → 100 users
4. Sustain: 2min @ 100 users
5. Ramp down: 30s → 0 users

**Total Duration:** ~7 minutes

**Usage:**
```bash
# Install k6
brew install k6  # macOS
# or download from https://k6.io/

# Run load test
k6 run tests/performance/load-test-auth.js

# Run with custom API URL
API_URL=https://staging.example.com k6 run tests/performance/load-test-auth.js

# Run with cloud execution (k6 cloud)
k6 cloud tests/performance/load-test-auth.js
```

**Thresholds:**
- HTTP request duration p95 < 500ms
- HTTP request duration p99 < 1000ms
- HTTP request failure rate < 1%
- Throughput > 50 req/sec

**Test Scenarios:**
- 10% users: Registration flow
- 70% users: Login + get profile flow
- 20% users: Token refresh flow

---

### 3. Quick Performance Test Script ✅

Created [tests/performance/quick-perf-test.sh](../../tests/performance/quick-perf-test.sh) - Apache Bench-based quick test script.

**Features:**
- Quick performance smoke tests
- Uses Apache Bench (widely available)
- Tests multiple endpoints
- Color-coded output
- Automatic health check before testing
- Configurable via environment variables

**Tests:**
1. Health endpoint (baseline)
2. Readiness endpoint (with DB check)
3. User registration (write operation)
4. API documentation (static content)

**Usage:**
```bash
# Make script executable
chmod +x tests/performance/quick-perf-test.sh

# Run with defaults (1000 requests, 10 concurrent)
./tests/performance/quick-perf-test.sh

# Run with custom parameters
REQUESTS=5000 CONCURRENCY=50 ./tests/performance/quick-perf-test.sh

# Run against different API
API_URL=https://staging.example.com ./tests/performance/quick-perf-test.sh
```

**Configuration:**
- `API_URL` - API base URL (default: http://localhost:8000)
- `REQUESTS` - Total requests (default: 1000)
- `CONCURRENCY` - Concurrent requests (default: 10)

---

## 📁 File Structure

```
A64CorePlatform/
├── CLAUDE.md                             ✅ UPDATED (added performance testing section)
├── tests/
│   └── performance/
│       ├── load-test-auth.js             ✅ NEW (k6 load test script)
│       └── quick-perf-test.sh            ✅ NEW (Apache Bench script)
└── Docs/
    └── 2-Working-Progress/
        └── performance-testing-setup-complete.md  ✅ NEW (this file)
```

---

## 🚀 How to Use

### Quick Smoke Test (5 minutes)

```bash
# Start the API
docker-compose up -d

# Wait for services to be ready
sleep 10

# Run quick performance test
./tests/performance/quick-perf-test.sh
```

### Comprehensive Load Test (10 minutes)

```bash
# Install k6 (if not already installed)
brew install k6  # macOS
# or: sudo snap install k6  # Linux

# Run load test
k6 run tests/performance/load-test-auth.js

# Review results
# - Console output shows real-time metrics
# - summary.json contains detailed results
```

### During Development

```bash
# After making changes, run quick test
./tests/performance/quick-perf-test.sh

# Compare results with baseline
# If regression > 20%, investigate immediately
```

### Before Deployment

```bash
# Run full load test suite
k6 run tests/performance/load-test-auth.js

# Verify all thresholds pass
# Document results in test report
# Compare with previous baseline
```

---

## 📊 Performance Testing Tools Comparison

| Tool | Best For | Pros | Cons |
|------|----------|------|------|
| **Apache Bench** | Quick smoke tests | Simple, widely available, fast | Limited features, HTTP only |
| **wrk** | High-throughput testing | Very fast, scriptable (Lua) | Steep learning curve |
| **Locust** | Distributed testing | Python, Web UI, distributed | Resource-intensive |
| **k6** | Modern load testing | JavaScript, great UX, cloud | Relatively new |

**Recommendation:**
- Development: Apache Bench (quick smoke tests)
- CI/CD: k6 (automated thresholds)
- Production monitoring: k6 cloud or Locust (distributed)

---

## 📈 Example Performance Test Output

### Apache Bench (quick-perf-test.sh)
```
Test 1: Health Endpoint (Baseline)
Testing: GET /api/health
Requests per second:    523.45 [#/sec] (mean)
Time per request:       19.103 [ms] (mean)
Transfer rate:          125.32 [Kbytes/sec] received
Failed requests:        0
```

### k6 (load-test-auth.js)
```
     ✓ login status is 200
     ✓ login response time < 500ms
     ✓ get profile status is 200
     ✓ token validation time < 200ms

     checks.........................: 98.50% ✓ 3940  ✗ 60
     http_req_duration..............: avg=125ms  p(95)=385ms  p(99)=678ms
     http_req_failed................: 0.15%  ✓ 12    ✗ 7988
     http_reqs......................: 8000   133.33/s
     login_duration.................: avg=156ms  p(95)=412ms
     token_validation_duration......: avg=68ms   p(95)=142ms
```

---

## ✅ Performance Testing Checklist

Before ANY deployment:
- [x] Performance testing standards documented (CLAUDE.md)
- [x] k6 load test script created
- [x] Quick performance test script created
- [ ] Baseline metrics documented (run tests to establish)
- [ ] Load tests executed (normal, peak, stress)
- [ ] Response times verified within targets
- [ ] Error rate verified acceptable
- [ ] No memory leaks detected
- [ ] Database queries optimized
- [ ] Rate limiting verified functional
- [ ] Concurrent user load tested
- [ ] Resource usage verified acceptable
- [ ] Performance test results documented

---

## 🎯 Next Steps

### Immediate (Before First Deployment)
1. **Establish Baseline:**
   ```bash
   # Run tests on current stable version
   k6 run tests/performance/load-test-auth.js
   # Document results as baseline
   ```

2. **Create Baseline Document:**
   - Create `Docs/2-Working-Progress/performance-baseline-v1.1.0.md`
   - Include all metrics from first test run
   - Use as comparison for future tests

3. **Run Full System Test:**
   - Follow [system-test-plan.md](./system-test-plan.md)
   - Include performance tests as part of Phase 8
   - Document any performance issues found

### Short Term (Next Sprint)
1. **Add More Test Scenarios:**
   - User management endpoints (GET /users, PATCH /users/{id})
   - Email verification flow
   - Password reset flow
   - Rate limiting tests (verify limits trigger)

2. **Add Integration with CI/CD:**
   - Add k6 tests to GitHub Actions / GitLab CI
   - Fail build if performance thresholds not met
   - Generate performance reports automatically

3. **Monitor Production:**
   - Set up APM (Application Performance Monitoring)
   - Configure alerts for performance degradation
   - Regular performance reports (weekly/monthly)

### Long Term (Future Versions)
1. **Advanced Testing:**
   - Distributed load testing (Locust cluster)
   - Chaos engineering (test failure scenarios)
   - Endurance testing (24+ hours)
   - Spike testing (sudden traffic increases)

2. **Performance Optimization:**
   - Implement Redis caching
   - Database query optimization
   - API response compression
   - CDN for static assets
   - Horizontal scaling tests

3. **Continuous Improvement:**
   - Track performance trends over time
   - Set performance budgets
   - Automated performance regression detection
   - Performance as part of Definition of Done

---

## 📚 Resources

### Documentation
- [CLAUDE.md - Performance Testing Standards](../../CLAUDE.md#-performance-testing-standards)
- [System-Architecture.md - Performance Section](../1-Main-Documentation/System-Architecture.md#scalability--performance)
- [System Test Plan](./system-test-plan.md)

### Tools Documentation
- [k6 Documentation](https://k6.io/docs/)
- [Apache Bench Manual](https://httpd.apache.org/docs/2.4/programs/ab.html)
- [wrk Documentation](https://github.com/wg/wrk)
- [Locust Documentation](https://docs.locust.io/)

### Best Practices
- [Google Web Vitals](https://web.dev/vitals/)
- [API Performance Best Practices](https://swagger.io/blog/api-development/performance-testing-best-practices/)
- [Load Testing Best Practices](https://k6.io/blog/load-testing-best-practices/)

---

## 🎉 Conclusion

Performance testing infrastructure is now **complete** and ready for use!

**What's Ready:**
- ✅ Comprehensive performance testing standards in CLAUDE.md
- ✅ k6 load test script with thresholds and custom metrics
- ✅ Quick performance test script with Apache Bench
- ✅ Clear performance targets and regression policies
- ✅ Performance testing workflow and checklist
- ✅ Tool installation and usage instructions

**What's Next:**
- Run baseline tests to establish performance metrics
- Include performance tests in all future testing
- Monitor performance continuously
- Optimize as needed to meet targets

**Remember:** Performance testing is MANDATORY, not optional. It protects against performance regressions and ensures a good user experience!

---

**Created:** 2025-10-16
**Status:** Complete
**Version:** 1.0
