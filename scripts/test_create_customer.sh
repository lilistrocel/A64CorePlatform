#!/bin/bash
API="http://localhost:8000"

# Login as admin
LOGIN_RESP=$(curl -s -X POST "$API/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"farmtest_admin@a64core.com","password":"TestAdmin123@"}')
TOKEN=$(echo "$LOGIN_RESP" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
echo "Token: ${TOKEN:0:20}..."

# Try create customer with verbose
echo ""
echo "=== Creating customer ==="
curl -v -X POST "$API/api/v1/crm/customers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"TEST_CUST_130","email":"test130@example.com","type":"business","status":"active"}' 2>&1

echo ""
echo "=== Try with minimal data ==="
curl -v -X POST "$API/api/v1/crm/customers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"TEST_CUST_130_minimal"}' 2>&1
