#!/bin/bash
# Test Feature #130: Customer deletion affects sales orders

API="http://localhost:8000"

# Step 1: Login as admin
echo "=== Step 1: Login as admin ==="
LOGIN_RESP=$(curl -s -X POST "$API/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"farmtest_admin@a64core.com","password":"TestAdmin123@"}')
TOKEN=$(echo "$LOGIN_RESP" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
echo "Token length: ${#TOKEN}"

if [ -z "$TOKEN" ]; then
  echo "FAILED: Could not get auth token"
  exit 1
fi

AUTH="Authorization: Bearer $TOKEN"

# Step 2: Create test customer
echo ""
echo "=== Step 2: Create test customer ==="
CUST_RESP=$(curl -s -X POST "$API/api/v1/crm/customers" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"name":"CASCADE_TEST_CUSTOMER_130","email":"cascade130@test.com","type":"business","status":"active"}')
echo "Create customer response: $CUST_RESP"
CUST_ID=$(echo "$CUST_RESP" | grep -o '"customerId":"[^"]*"' | cut -d'"' -f4)
echo "Customer ID: $CUST_ID"

if [ -z "$CUST_ID" ]; then
  echo "FAILED: Could not create customer"
  exit 1
fi

# Step 3: Create a sales order linked to this customer (active - draft status)
echo ""
echo "=== Step 3: Create sales order (draft - active) ==="
FAKE_PRODUCT_ID="00000000-0000-4000-a000-000000000001"
ORDER_RESP=$(curl -s -X POST "$API/api/v1/sales/orders" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d "{\"customerId\":\"$CUST_ID\",\"customerName\":\"CASCADE_TEST_CUSTOMER_130\",\"items\":[{\"productId\":\"$FAKE_PRODUCT_ID\",\"productName\":\"Test Product F130\",\"quantity\":1,\"unitPrice\":100,\"totalPrice\":100}],\"subtotal\":100,\"tax\":0,\"discount\":0,\"total\":100}")
echo "Create order response: $ORDER_RESP"
ORDER_ID=$(echo "$ORDER_RESP" | grep -o '"orderId":"[^"]*"' | cut -d'"' -f4)
echo "Order ID: $ORDER_ID"

if [ -z "$ORDER_ID" ]; then
  echo "FAILED: Could not create sales order"
  exit 1
fi

# Step 4: Try to delete customer with active order - should be BLOCKED
echo ""
echo "=== Step 4: Attempt delete customer with active order (should fail with 409) ==="
DEL_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X DELETE "$API/api/v1/crm/customers/$CUST_ID" \
  -H "$AUTH")
echo "Delete response: $DEL_RESP"

HTTP_STATUS=$(echo "$DEL_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
echo "HTTP Status: $HTTP_STATUS"

if [ "$HTTP_STATUS" = "409" ]; then
  echo "PASS: Delete correctly blocked with 409 Conflict"
else
  echo "FAIL: Expected 409, got $HTTP_STATUS"
fi

# Step 5: Cancel the order so customer can be deleted
echo ""
echo "=== Step 5: Cancel the order ==="
CANCEL_RESP=$(curl -s -X PATCH "$API/api/v1/sales/orders/$ORDER_ID/status?new_status=cancelled" \
  -H "$AUTH")
echo "Cancel response status: $(echo "$CANCEL_RESP" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)"

# Step 6: Now delete should succeed (all orders cancelled)
echo ""
echo "=== Step 6: Delete customer after cancelling order (should succeed) ==="
DEL_RESP2=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X DELETE "$API/api/v1/crm/customers/$CUST_ID" \
  -H "$AUTH")
echo "Delete response: $DEL_RESP2"

HTTP_STATUS2=$(echo "$DEL_RESP2" | grep "HTTP_STATUS:" | cut -d: -f2)
echo "HTTP Status: $HTTP_STATUS2"

if [ "$HTTP_STATUS2" = "200" ]; then
  echo "PASS: Customer deleted successfully after cancelling orders"
else
  echo "FAIL: Expected 200, got $HTTP_STATUS2"
fi

# Check cascade info
echo "Cascade details: $(echo "$DEL_RESP2" | grep -o '"relatedRecordsDeleted":{[^}]*}')"

# Step 7: Verify customer is gone
echo ""
echo "=== Step 7: Verify customer no longer exists ==="
GET_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$API/api/v1/crm/customers/$CUST_ID" \
  -H "$AUTH")
HTTP_STATUS3=$(echo "$GET_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
if [ "$HTTP_STATUS3" = "404" ]; then
  echo "PASS: Customer confirmed deleted (404)"
else
  echo "FAIL: Expected 404, got $HTTP_STATUS3"
fi

# Step 8: Verify sales order was cascade deleted
echo ""
echo "=== Step 8: Verify sales order was cascade deleted ==="
ORDER_GET=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$API/api/v1/sales/orders/$ORDER_ID" \
  -H "$AUTH")
HTTP_STATUS4=$(echo "$ORDER_GET" | grep "HTTP_STATUS:" | cut -d: -f2)
if [ "$HTTP_STATUS4" = "404" ]; then
  echo "PASS: Sales order cascade deleted (404)"
else
  echo "FAIL: Expected 404, got $HTTP_STATUS4"
  echo "Response: $ORDER_GET"
fi

echo ""
echo "=== ALL TESTS COMPLETE ==="
