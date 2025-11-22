#!/bin/bash
# Test creating a custom task

echo "========================================="
echo "Testing POST /api/v1/farm/tasks"
echo "========================================="
echo ""

# Login
echo "[1/2] Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@a64platform.com","password":"SuperAdmin123!"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "ERROR: Failed to get token"
    exit 1
fi

echo "SUCCESS: Token obtained"
echo ""

# Create task
echo "[2/2] Creating custom task..."
FARM_ID="0bef9a0e-172c-4b5d-96a0-5fd98c268967"
BLOCK_ID="218afb99-b01d-4951-8c99-b7e51c15c24c"

curl -s -X POST http://localhost/api/v1/farm/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"farmId\": \"$FARM_ID\",
    \"blockId\": \"$BLOCK_ID\",
    \"taskType\": \"custom\",
    \"scheduledDate\": \"2025-11-20T10:00:00Z\",
    \"dueDate\": \"2025-11-20T18:00:00Z\",
    \"description\": \"Test custom task from API testing\"
  }"

echo ""
echo ""
echo "========================================="
echo "Test Complete!"
echo "========================================="
