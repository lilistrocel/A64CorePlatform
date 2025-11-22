#!/bin/bash
# Test additional task endpoints

echo "========================================="
echo "Testing Task Retrieval & Management"
echo "========================================="
echo ""

# Login
LOGIN_RESPONSE=$(curl -s -X POST http://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@a64platform.com","password":"SuperAdmin123!"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

TASK_ID="c466086e-9fa0-4478-bd02-4638a42fd110"
FARM_ID="0bef9a0e-172c-4b5d-96a0-5fd98c268967"
BLOCK_ID="218afb99-b01d-4951-8c99-b7e51c15c24c"

# Test 1: Get specific task
echo "[1/6] Testing GET /api/v1/farm/tasks/$TASK_ID..."
curl -s -X GET "http://localhost/api/v1/farm/tasks/$TASK_ID" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
echo ""

# Test 2: Get my tasks (should now show our created task)
echo "[2/6] Testing GET /api/v1/farm/tasks/my-tasks..."
curl -s -X GET "http://localhost/api/v1/farm/tasks/my-tasks" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool | head -20
echo ""

# Test 3: Get pending count (should be 1 now)
echo "[3/6] Testing GET /api/v1/farm/tasks/pending-count..."
curl -s -X GET "http://localhost/api/v1/farm/tasks/pending-count" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
echo ""

# Test 4: Get farm tasks
echo "[4/6] Testing GET /api/v1/farm/tasks/farms/$FARM_ID..."
curl -s -X GET "http://localhost/api/v1/farm/tasks/farms/$FARM_ID?page=1&perPage=10" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool | head -25
echo ""

# Test 5: Get block tasks
echo "[5/6] Testing GET /api/v1/farm/tasks/blocks/$BLOCK_ID..."
curl -s -X GET "http://localhost/api/v1/farm/tasks/blocks/$BLOCK_ID?page=1&perPage=10" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool | head -25
echo ""

# Test 6: Update task
echo "[6/6] Testing PUT /api/v1/farm/tasks/$TASK_ID (update task)..."
curl -s -X PUT "http://localhost/api/v1/farm/tasks/$TASK_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"description\": \"Updated: Test custom task from API testing\"
  }" | python -m json.tool
echo ""

echo "========================================="
echo "All Tests Complete!"
echo "========================================="
