#!/bin/bash
# Test Feature #131: User soft delete preserves data but hides from lists

API="http://localhost:8000"

echo "=== Step 1: Register a new test user ==="
REG_RESP=$(curl -s -X POST "$API/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"softdelete131@test.com","password":"SecurePass131!","firstName":"SoftDelete","lastName":"TestUser131"}')
echo "Register response: $REG_RESP"
USER_ID=$(echo "$REG_RESP" | grep -o '"userId":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "User ID: $USER_ID"

if [ -z "$USER_ID" ]; then
  echo "FAILED: Could not register user"
  exit 1
fi

echo ""
echo "=== Step 2: Verify user can login ==="
LOGIN_RESP=$(curl -s -X POST "$API/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"softdelete131@test.com","password":"SecurePass131!"}')
LOGIN_TOKEN=$(echo "$LOGIN_RESP" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
echo "Login token length: ${#LOGIN_TOKEN}"

if [ -z "$LOGIN_TOKEN" ]; then
  echo "FAIL: User cannot login before delete"
else
  echo "PASS: User can login before soft delete"
fi

echo ""
echo "=== Step 3: Login as admin to perform soft delete ==="
ADMIN_RESP=$(curl -s -X POST "$API/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"farmtest_admin@a64core.com","password":"TestAdmin123@"}')
ADMIN_TOKEN=$(echo "$ADMIN_RESP" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
ADMIN_AUTH="Authorization: Bearer $ADMIN_TOKEN"

echo ""
echo "=== Step 4: Verify user appears in user list before delete ==="
LIST_RESP=$(curl -s "$API/api/v1/users?perPage=100" \
  -H "$ADMIN_AUTH")
if echo "$LIST_RESP" | grep -q "softdelete131@test.com"; then
  echo "PASS: User appears in user list before delete"
else
  echo "FAIL: User NOT found in user list before delete"
fi

echo ""
echo "=== Step 5: Soft delete the user ==="
DEL_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X DELETE "$API/api/v1/users/$USER_ID" \
  -H "$ADMIN_AUTH")
HTTP_STATUS=$(echo "$DEL_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
echo "Delete HTTP Status: $HTTP_STATUS"

if [ "$HTTP_STATUS" = "204" ]; then
  echo "PASS: User soft deleted (204 No Content)"
else
  echo "FAIL: Expected 204, got $HTTP_STATUS"
  echo "Response: $DEL_RESP"
fi

echo ""
echo "=== Step 6: Verify user NOT in active user list ==="
LIST_RESP2=$(curl -s "$API/api/v1/users?perPage=100" \
  -H "$ADMIN_AUTH")
if echo "$LIST_RESP2" | grep -q "softdelete131@test.com"; then
  echo "FAIL: User STILL appears in user list after soft delete"
else
  echo "PASS: User NOT in user list after soft delete"
fi

echo ""
echo "=== Step 7: Verify user data still exists in database (via mongosh) ==="
# This will be checked separately

echo ""
echo "=== Step 8: Verify soft-deleted user cannot login ==="
LOGIN2_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$API/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"softdelete131@test.com","password":"SecurePass131!"}')
echo "Login attempt response: $LOGIN2_RESP"
HTTP_STATUS2=$(echo "$LOGIN2_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)

if [ "$HTTP_STATUS2" = "401" ] || [ "$HTTP_STATUS2" = "403" ]; then
  echo "PASS: Soft-deleted user cannot login (got $HTTP_STATUS2)"
else
  echo "FAIL: Expected 401/403, got $HTTP_STATUS2"
fi

echo ""
echo "=== Step 9: Verify GET user by ID returns 404 ==="
GET_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$API/api/v1/users/$USER_ID" \
  -H "$ADMIN_AUTH")
HTTP_STATUS3=$(echo "$GET_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
if [ "$HTTP_STATUS3" = "404" ]; then
  echo "PASS: GET user by ID returns 404 for soft-deleted user"
else
  echo "FAIL: Expected 404, got $HTTP_STATUS3"
fi

echo ""
echo "=== ALL TESTS COMPLETE ==="
echo "User ID for DB verification: $USER_ID"
