#!/bin/bash
# Test Feature #132: Deleted items removed from search results

API="http://localhost:8000"

# Login as admin
echo "=== Step 1: Login as admin ==="
LOGIN_RESP=$(curl -s -X POST "$API/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"farmtest_admin@a64core.com","password":"TestAdmin123@"}')
TOKEN=$(echo "$LOGIN_RESP" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
AUTH="Authorization: Bearer $TOKEN"
echo "Token length: ${#TOKEN}"

# Step 2: Create customer named SEARCHTEST
echo ""
echo "=== Step 2: Create customer named SEARCHTEST_132 ==="
CUST_RESP=$(curl -s -X POST "$API/api/v1/crm/customers" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"name":"SEARCHTEST_132","email":"searchtest132@example.com","type":"business","status":"active"}')
echo "Create response: $CUST_RESP"
CUST_ID=$(echo "$CUST_RESP" | grep -o '"customerId":"[^"]*"' | cut -d'"' -f4)
echo "Customer ID: $CUST_ID"

if [ -z "$CUST_ID" ]; then
  echo "FAILED: Could not create customer"
  exit 1
fi

# Step 3: Search for SEARCHTEST_132 - should be found
echo ""
echo "=== Step 3: Search for SEARCHTEST_132 (should find it) ==="
SEARCH_RESP=$(curl -s "$API/api/v1/crm/customers?search=SEARCHTEST_132" \
  -H "$AUTH")
echo "Search response: $SEARCH_RESP"
FOUND_COUNT=$(echo "$SEARCH_RESP" | grep -o '"total":[0-9]*' | cut -d: -f2)
echo "Found count: $FOUND_COUNT"

if [ "$FOUND_COUNT" -gt 0 ] 2>/dev/null; then
  echo "PASS: SEARCHTEST_132 found in search results"
else
  echo "FAIL: SEARCHTEST_132 not found in search (expected to find it)"
fi

# Also test the dedicated search endpoint
echo ""
echo "=== Step 3b: Search via /search endpoint ==="
SEARCH_RESP2=$(curl -s "$API/api/v1/crm/customers/search?q=SEARCHTEST_132" \
  -H "$AUTH")
FOUND_COUNT2=$(echo "$SEARCH_RESP2" | grep -o '"total":[0-9]*' | cut -d: -f2)
echo "Search endpoint found: $FOUND_COUNT2"

# Step 4: Delete the customer
echo ""
echo "=== Step 4: Delete the customer ==="
DEL_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X DELETE "$API/api/v1/crm/customers/$CUST_ID" \
  -H "$AUTH")
HTTP_STATUS=$(echo "$DEL_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
echo "Delete HTTP Status: $HTTP_STATUS"

if [ "$HTTP_STATUS" = "200" ]; then
  echo "PASS: Customer deleted"
else
  echo "FAIL: Expected 200, got $HTTP_STATUS"
  echo "Response: $DEL_RESP"
fi

# Step 5: Search for SEARCHTEST_132 again - should NOT be found
echo ""
echo "=== Step 5: Search for SEARCHTEST_132 again (should NOT find it) ==="
SEARCH_RESP3=$(curl -s "$API/api/v1/crm/customers?search=SEARCHTEST_132" \
  -H "$AUTH")
echo "Search response: $SEARCH_RESP3"
FOUND_COUNT3=$(echo "$SEARCH_RESP3" | grep -o '"total":[0-9]*' | cut -d: -f2)
echo "Found count: $FOUND_COUNT3"

if [ "$FOUND_COUNT3" = "0" ]; then
  echo "PASS: SEARCHTEST_132 NOT found in search results after deletion"
else
  echo "FAIL: SEARCHTEST_132 still found in search (expected 0, got $FOUND_COUNT3)"
fi

# Also test dedicated search endpoint
echo ""
echo "=== Step 5b: Search via /search endpoint after delete ==="
SEARCH_RESP4=$(curl -s "$API/api/v1/crm/customers/search?q=SEARCHTEST_132" \
  -H "$AUTH")
FOUND_COUNT4=$(echo "$SEARCH_RESP4" | grep -o '"total":[0-9]*' | cut -d: -f2)
echo "Search endpoint found: $FOUND_COUNT4"

if [ "$FOUND_COUNT4" = "0" ]; then
  echo "PASS: SEARCHTEST_132 NOT found via /search endpoint after deletion"
else
  echo "FAIL: still found via /search endpoint ($FOUND_COUNT4)"
fi

# Step 6: Verify customer is gone from general listing
echo ""
echo "=== Step 6: Verify customer not in general listing ==="
LIST_RESP=$(curl -s "$API/api/v1/crm/customers?perPage=100" \
  -H "$AUTH")
if echo "$LIST_RESP" | grep -q "SEARCHTEST_132"; then
  echo "FAIL: SEARCHTEST_132 still in general customer listing"
else
  echo "PASS: SEARCHTEST_132 not in general customer listing"
fi

echo ""
echo "=== ALL TESTS COMPLETE ==="
