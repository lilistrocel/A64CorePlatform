#!/bin/bash
# Create a fresh test customer for UI verification of Feature #132

API="http://localhost:8000"

LOGIN_RESP=$(curl -s -X POST "$API/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"farmtest_admin@a64core.com","password":"TestAdmin123@"}')
TOKEN=$(echo "$LOGIN_RESP" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
AUTH="Authorization: Bearer $TOKEN"

# Create test customer
CUST_RESP=$(curl -s -X POST "$API/api/v1/crm/customers" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"name":"UITEST_DELETESEARCH","email":"uitest132@test.com","type":"business","status":"active"}')
echo "$CUST_RESP"
CUST_ID=$(echo "$CUST_RESP" | grep -o '"customerId":"[^"]*"' | cut -d'"' -f4)
echo "Customer ID: $CUST_ID"
