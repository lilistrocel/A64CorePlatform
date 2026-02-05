#!/bin/bash
API="http://localhost:8000"

# Login as admin
LOGIN_RESP=$(curl -s -X POST "$API/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"farmtest_admin@a64core.com","password":"TestAdmin123@"}')
TOKEN=$(echo "$LOGIN_RESP" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

# First try listing existing customers (GET should work)
echo "=== List existing customers ==="
curl -s "$API/api/v1/crm/customers?perPage=3" \
  -H "Authorization: Bearer $TOKEN"

echo ""
echo ""
echo "=== Try GET single known customer ==="
curl -s "$API/api/v1/crm/customers?search=Test" \
  -H "Authorization: Bearer $TOKEN"
