#!/bin/bash
# Test script for Operations Task Manager API

echo "========================================="
echo "Testing Operations Task Manager API"
echo "========================================="

# Login to get token
echo -e "\n[1/5] Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@a64platform.com","password":"SuperAdmin123!"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "ERROR: Failed to get token"
    echo "Response: $LOGIN_RESPONSE"
    exit 1
fi

echo "SUCCESS: Token obtained (${TOKEN:0:50}...)"

# Test 1: GET pending task count
echo -e "\n[2/5] Testing GET /api/v1/farm/tasks/pending-count..."
COUNT_RESPONSE=$(curl -s -X GET http://localhost/api/v1/farm/tasks/pending-count \
  -H "Authorization: Bearer $TOKEN")
echo "Response: $COUNT_RESPONSE"

# Test 2: GET my tasks
echo -e "\n[3/5] Testing GET /api/v1/farm/tasks/my-tasks..."
MY_TASKS_RESPONSE=$(curl -s -X GET "http://localhost/api/v1/farm/tasks/my-tasks" \
  -H "Authorization: Bearer $TOKEN")
echo "Response: $MY_TASKS_RESPONSE"

# Test 3: GET farm tasks (using known farm ID)
FARM_ID="cd22c152-defa-47fa-88af-0b3b422b5700"
echo -e "\n[4/5] Testing GET /api/v1/farm/tasks/farms/$FARM_ID..."
FARM_TASKS_RESPONSE=$(curl -s -X GET "http://localhost/api/v1/farm/tasks/farms/$FARM_ID?page=1&perPage=10" \
  -H "Authorization: Bearer $TOKEN")
echo "Response: $FARM_TASKS_RESPONSE"

# Test 4: Create a custom task
BLOCK_ID="2b27c5cf-c8e8-4b4f-8a1e-6a02c67eeae0"  # F001-002 block
echo -e "\n[5/5] Testing POST /api/v1/farm/tasks (create custom task)..."
CREATE_TASK_RESPONSE=$(curl -s -X POST http://localhost/api/v1/farm/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"farmId\": \"$FARM_ID\",
    \"blockId\": \"$BLOCK_ID\",
    \"taskType\": \"custom\",
    \"scheduledDate\": \"2025-11-20T10:00:00Z\",
    \"dueDate\": \"2025-11-20T18:00:00Z\",
    \"description\": \"Test custom task from API\"
  }")
echo "Response: $CREATE_TASK_RESPONSE"

echo -e "\n========================================="
echo "API Tests Complete!"
echo "========================================="
