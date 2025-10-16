# Performance Testing Suite

Cross-platform performance testing tools for the A64 Core Platform API.

## Overview

This directory contains performance testing tools that work on **both Windows and Linux**:

1. **quick_perf_test.py** - Python-based quick performance testing (Recommended)
2. **quick-perf-test.sh** - Bash script using Apache Bench (Linux/Mac only)
3. **load-test-auth.js** - Comprehensive k6 load testing (Cross-platform)

## Quick Start

### Python-Based Testing (Recommended - Works on All Platforms)

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

# Skip health check
python quick_perf_test.py --skip-health-check
```

**Command Line Options:**
- `--url URL` - API base URL (default: http://localhost:8000)
- `--requests N` - Total requests per test (default: 1000)
- `--concurrency N` - Concurrent requests (default: 10)
- `--skip-health-check` - Skip initial health check

**Features:**
- ✅ Cross-platform (Windows, Linux, macOS)
- ✅ No external tools required (pure Python)
- ✅ Color-coded output
- ✅ Detailed metrics (avg, median, p95, p99)
- ✅ Configurable via command line

---

## Performance Testing Tools

### 1. Quick Performance Test (Python) ⭐ Recommended

**File:** `quick_perf_test.py`

**Platform Support:**
- ✅ Windows 10/11
- ✅ Linux (all distributions)
- ✅ macOS

**Use Case:** Quick smoke testing (2-3 minutes)

**Tests Performed:**
1. Health endpoint (baseline performance)
2. Readiness endpoint (with database check)
3. User registration (write operations)
4. API documentation (static content)

**Output Metrics:**
- Total requests / Successful / Failed
- Error rate (%)
- Requests per second
- Response times: Average, Median, Min, Max, P95, P99

**Example Output:**
```
============================================================
A64 Core Platform - Quick Performance Test
============================================================
Platform: Windows 11
Python: 3.11.0
Time: 2025-10-16 12:30:00
============================================================

Configuration:
  API URL:            http://localhost:8000
  Total Requests:     1000
  Concurrent:         10

✓ API is healthy (HTTP 200)

────────────────────────────────────────────────────────────
Test: Health Endpoint (Baseline)
Endpoint: GET /api/health
────────────────────────────────────────────────────────────

Performance Metrics:
  Total Requests:     1000
  Successful:         1000
  Failed:             0
  Error Rate:         0.00%
  Total Time:         5.23s
  Requests/sec:       191.20

Response Times (ms):
  Average:            52.34ms
  Median:             50.12ms
  Min:                15.23ms
  Max:                234.56ms
  P95:                89.45ms
  P99:                156.78ms
```

---

### 2. Apache Bench Test (Bash) 🐧 Linux/Mac Only

**File:** `quick-perf-test.sh`

**Platform Support:**
- ✅ Linux (all distributions)
- ✅ macOS
- ❌ Windows (use WSL or Python version)

**Installation:**
```bash
# Ubuntu/Debian
sudo apt-get install apache2-utils

# macOS
brew install httpd

# CentOS/RHEL
sudo yum install httpd-tools
```

**Usage:**
```bash
# Make executable (first time only)
chmod +x tests/performance/quick-perf-test.sh

# Run with defaults
./tests/performance/quick-perf-test.sh

# Custom configuration
API_URL=http://localhost:8000 REQUESTS=2000 CONCURRENCY=20 ./tests/performance/quick-perf-test.sh
```

**Environment Variables:**
- `API_URL` - API base URL (default: http://localhost:8000)
- `REQUESTS` - Total requests per test (default: 1000)
- `CONCURRENCY` - Concurrent requests (default: 10)

---

### 3. K6 Load Test (JavaScript) 🚀 Comprehensive Testing

**File:** `load-test-auth.js`

**Platform Support:**
- ✅ Windows 10/11
- ✅ Linux (all distributions)
- ✅ macOS

**Use Case:** Comprehensive load testing with multiple scenarios

**Installation:**

**Windows (Chocolatey):**
```powershell
choco install k6
```

**Windows (Manual):**
Download from: https://dl.k6.io/msi/k6-latest-amd64.msi

**Linux:**
```bash
# Debian/Ubuntu
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Fedora/CentOS
sudo dnf install https://dl.k6.io/rpm/repo.rpm
sudo dnf install k6
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

# With custom API URL
API_URL=http://api.example.com k6 run tests/performance/load-test-auth.js
```

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

**Performance Thresholds:**
- HTTP request duration p95 < 500ms
- HTTP request duration p99 < 1000ms
- HTTP request failure rate < 1%
- Throughput > 50 req/s

---

## Performance Targets

From `CLAUDE.md` performance standards:

| Metric | Target | Critical |
|--------|--------|----------|
| Response Time (p50) | < 100ms | < 200ms |
| Response Time (p95) | < 500ms | < 1000ms |
| Response Time (p99) | < 1000ms | < 2000ms |
| Throughput | > 100 req/sec | > 50 req/sec |
| Error Rate | < 0.1% | < 1% |
| Database Query | < 50ms avg | < 100ms avg |
| Token Validation | < 50ms | < 100ms |

**Regression Policy:**
- 10% degradation: ⚠️ Warning
- 20% degradation: 🚫 Blocker (do not merge)
- 50% degradation: 🔥 Critical (rollback immediately)

---

## When to Run Performance Tests

According to `CLAUDE.md`, performance tests should be run:

✅ **Always:**
- During system testing
- After authentication/security changes
- After database schema changes
- Before production deployment

✅ **Regularly:**
- After major features
- After dependency updates
- Weekly on main branch

✅ **Optional:**
- During development (smoke testing)
- For performance optimization

---

## Test Comparison

| Feature | Python Script | Bash Script | k6 Load Test |
|---------|--------------|-------------|--------------|
| **Cross-Platform** | ✅ Yes | ❌ No (Linux/Mac) | ✅ Yes |
| **Installation** | pip | apt/brew | Download/Install |
| **Execution Time** | 2-3 min | 2-3 min | 6-7 min |
| **Use Case** | Quick testing | Quick testing | Comprehensive |
| **Metrics Detail** | High | Medium | Very High |
| **Scenarios** | 4 tests | 4 tests | 3 scenarios |
| **Recommended For** | Daily testing | Linux users | Pre-deployment |

---

## Cross-Platform Compatibility

### Windows

**Python Script:**
```powershell
# PowerShell
pip install requests colorama
python tests\performance\quick_perf_test.py

# CMD
pip install requests colorama
python tests\performance\quick_perf_test.py
```

**k6:**
```powershell
choco install k6
k6 run tests\performance\load-test-auth.js
```

### Linux

**Python Script:**
```bash
pip3 install requests colorama
python3 tests/performance/quick_perf_test.py
```

**Bash Script:**
```bash
sudo apt-get install apache2-utils
chmod +x tests/performance/quick-perf-test.sh
./tests/performance/quick-perf-test.sh
```

**k6:**
```bash
# See installation instructions above
k6 run tests/performance/load-test-auth.js
```

### macOS

**Python Script:**
```bash
pip3 install requests colorama
python3 tests/performance/quick_perf_test.py
```

**Bash Script:**
```bash
brew install httpd
chmod +x tests/performance/quick-perf-test.sh
./tests/performance/quick-perf-test.sh
```

**k6:**
```bash
brew install k6
k6 run tests/performance/load-test-auth.js
```

---

## Troubleshooting

### Python Script Issues

**Problem:** `ModuleNotFoundError: No module named 'requests'`
```bash
# Solution
pip install requests colorama
# or
pip3 install requests colorama
```

**Problem:** Colors not displaying correctly on Windows
```
# Solution: colorama is already configured to handle Windows
# If issues persist, run in Windows Terminal or PowerShell 7+
```

**Problem:** Connection refused error
```
# Solution: Make sure API is running
docker-compose up -d

# Check API health
curl http://localhost:8000/api/health
```

### Bash Script Issues

**Problem:** `ab: command not found`
```bash
# Ubuntu/Debian
sudo apt-get install apache2-utils

# macOS
brew install httpd
```

**Problem:** Permission denied
```bash
# Solution
chmod +x tests/performance/quick-perf-test.sh
```

### k6 Issues

**Problem:** `k6: command not found`
```
# Solution: Install k6 (see installation instructions above)
```

**Problem:** Script execution policy error (Windows)
```powershell
# Solution: Change PowerShell execution policy
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## Next Steps

1. **Basic Testing:** Start with Python script for quick validation
2. **Comprehensive Testing:** Use k6 for detailed load testing
3. **CI/CD Integration:** Add performance tests to GitHub Actions
4. **Monitoring:** Set up continuous performance monitoring
5. **Optimization:** Use results to identify bottlenecks

---

## Related Documentation

- [System Test Plan](../../Docs/2-Working-Progress/system-test-plan.md)
- [Performance Testing Standards](../../CLAUDE.md) - Section: "Performance Testing Standards"
- [System Architecture](../../Docs/1-Main-Documentation/System-Architecture.md)
- [API Structure](../../Docs/1-Main-Documentation/API-Structure.md)

---

**Created:** 2025-10-16
**Last Updated:** 2025-10-16
**Version:** 1.0.0
