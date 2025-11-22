#!/bin/bash
# Test completing a task

echo "========================================="
echo "Testing Task Completion"
echo "========================================="
echo ""

# Login
LOGIN_RESPONSE=$(curl -s -X POST http://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@a64platform.com","password":"SuperAdmin123!"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

TASK_ID="c466086e-9fa0-4478-bd02-4638a42fd110"

# Complete task
echo "[1/2] Testing POST /api/v1/farm/tasks/$TASK_ID/complete..."
curl -s -X POST "http://localhost/api/v1/farm/tasks/$TASK_ID/complete" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"notes\": \"Task completed successfully during testing\",
    \"photoUrls\": [\"https://example.com/photo1.jpg\", \"https://example.com/photo2.jpg\"]
  }" | python -m json.tool
echo ""

# Verify task is completed
echo "[2/2] Verifying task status..."
curl -s -X GET "http://localhost/api/v1/farm/tasks/$TASK_ID" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool | grep -A 5 "status"
echo ""

echo "========================================="
echo "Completion Test Complete!"
echo "========================================="
