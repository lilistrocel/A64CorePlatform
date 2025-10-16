#!/bin/bash

# quick-perf-test.sh
# Quick Performance Test Script for A64 Core Platform
# Uses Apache Bench (ab) for simple HTTP load testing
#
# Usage: ./quick-perf-test.sh
#
# Requirements:
# - Apache Bench installed (usually pre-installed on Linux/Mac)
# - API must be running: docker-compose up -d

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:8000}"
REQUESTS="${REQUESTS:-1000}"
CONCURRENCY="${CONCURRENCY:-10}"

echo ""
echo "========================================"
echo "A64 Core Platform - Quick Performance Test"
echo "========================================"
echo "API URL: $API_URL"
echo "Total Requests: $REQUESTS"
echo "Concurrent Requests: $CONCURRENCY"
echo "========================================"
echo ""

# Check if Apache Bench is installed
if ! command -v ab &> /dev/null; then
    echo -e "${RED}❌ Apache Bench (ab) is not installed${NC}"
    echo ""
    echo "Install with:"
    echo "  Ubuntu/Debian: sudo apt-get install apache2-utils"
    echo "  macOS: brew install httpd"
    echo "  Windows: Use WSL or download from Apache website"
    exit 1
fi

# Check if API is running
echo -e "${BLUE}Checking API health...${NC}"
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" $API_URL/api/health)
if [ "$HEALTH_CHECK" != "200" ]; then
    echo -e "${RED}❌ API health check failed (HTTP $HEALTH_CHECK)${NC}"
    echo "Make sure the API is running: docker-compose up -d"
    exit 1
fi
echo -e "${GREEN}✅ API is healthy${NC}"
echo ""

# Test 1: Health Endpoint (Baseline)
echo -e "${YELLOW}Test 1: Health Endpoint (Baseline)${NC}"
echo "Testing: GET /api/health"
ab -n $REQUESTS -c $CONCURRENCY -q $API_URL/api/health | grep -E "Requests per second|Time per request|Transfer rate|Failed requests"
echo ""

# Test 2: Ready Endpoint (With Database Check)
echo -e "${YELLOW}Test 2: Readiness Endpoint (With Database Check)${NC}"
echo "Testing: GET /api/ready"
ab -n $REQUESTS -c $CONCURRENCY -q $API_URL/api/ready | grep -E "Requests per second|Time per request|Transfer rate|Failed requests"
echo ""

# Test 3: Register Endpoint (Write Operation)
echo -e "${YELLOW}Test 3: User Registration (Write Operation)${NC}"
echo "Testing: POST /api/v1/auth/register"
echo "Note: Most requests will fail with 409 (duplicate email) - this is expected"

# Create a temporary file with JSON data
TIMESTAMP=$(date +%s%N)
cat > /tmp/register_payload.json << EOF
{
  "email": "loadtest${TIMESTAMP}@example.com",
  "password": "TestPass123!",
  "firstName": "Load",
  "lastName": "Test"
}
EOF

# Run POST test with JSON payload
ab -n 100 -c 5 -p /tmp/register_payload.json -T application/json -q $API_URL/api/v1/auth/register 2>&1 | grep -E "Requests per second|Time per request|Failed requests|Non-2xx responses"
rm /tmp/register_payload.json
echo ""

# Test 4: Get API Documentation (Static Content)
echo -e "${YELLOW}Test 4: API Documentation (Static Content)${NC}"
echo "Testing: GET /api/docs"
ab -n $REQUESTS -c $CONCURRENCY -q $API_URL/api/docs | grep -E "Requests per second|Time per request|Transfer rate|Failed requests"
echo ""

# Summary
echo "========================================"
echo -e "${GREEN}Performance Test Complete${NC}"
echo "========================================"
echo ""
echo "Performance Targets (from CLAUDE.md):"
echo "  - Response Time p95: < 500ms"
echo "  - Response Time p99: < 1000ms"
echo "  - Throughput: > 100 req/sec"
echo "  - Error Rate: < 0.1%"
echo ""
echo "For detailed performance testing, use:"
echo "  k6 run tests/performance/load-test-auth.js"
echo ""
echo "For monitoring during tests:"
echo "  docker stats"
echo "  docker-compose logs -f api"
echo ""
