#!/bin/bash
# Clean CRUD test for Feature #49 - unique plant name

# Login as admin
RESP=$(curl -s http://localhost:8000/api/v1/auth/login -X POST -H "Content-Type: application/json" -d '{"email":"farmtest_admin@a64core.com","password":"TestAdmin123@"}')
TOKEN=$(echo "$RESP" | grep -o '"access_token":"[^"]*"' | grep -o 'eyJ[^"]*')

if [ -z "$TOKEN" ]; then
  echo "FAIL: Login failed"
  exit 1
fi
echo "STEP 1: Login OK"

# Use unique plant name with timestamp
TIMESTAMP=$(date +%s)
PLANT_NAME="CRUD_TEST_${TIMESTAMP}"

# Step 2: Create plant
echo ""
echo "STEP 2: Create plant '$PLANT_NAME'"
CREATE_RESP=$(curl -s http://localhost:8000/api/v1/farm/plant-data -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"plantName\": \"$PLANT_NAME\",
    \"scientificName\": \"Testus crud ${TIMESTAMP}\",
    \"plantType\": \"Crop\",
    \"growthCycleDays\": 60,
    \"expectedYieldPerPlant\": 3.0,
    \"yieldUnit\": \"kg\"
  }")

echo "$CREATE_RESP" | grep -o '"message":"[^"]*"'
PLANT_ID=$(echo "$CREATE_RESP" | grep -o '"plantDataId":"[^"]*"' | head -1 | sed 's/"plantDataId":"//;s/"//')
echo "Created plant ID: $PLANT_ID"

# Step 3: List and verify plant appears
echo ""
echo "STEP 3: List - search for '$PLANT_NAME'"
LIST_RESP=$(curl -s "http://localhost:8000/api/v1/farm/plant-data?search=$PLANT_NAME" \
  -H "Authorization: Bearer $TOKEN")
echo "Total found: $(echo "$LIST_RESP" | grep -o '"total":[0-9]*')"
echo "Plant name match: $(echo "$LIST_RESP" | grep -o "\"plantName\":\"$PLANT_NAME\"")"

# Step 4: Get by ID
echo ""
echo "STEP 4: Get by ID"
GET_RESP=$(curl -s "http://localhost:8000/api/v1/farm/plant-data/$PLANT_ID" \
  -H "Authorization: Bearer $TOKEN")
echo "Got: $(echo "$GET_RESP" | grep -o "\"plantName\":\"$PLANT_NAME\"")"
echo "Version: $(echo "$GET_RESP" | grep -o '"dataVersion":1')"

# Step 5: Update plant
echo ""
UPDATED_NAME="${PLANT_NAME}_UPDATED"
echo "STEP 5: Update plant to '$UPDATED_NAME'"
UPDATE_RESP=$(curl -s "http://localhost:8000/api/v1/farm/plant-data/$PLANT_ID" -X PATCH \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"plantName\": \"$UPDATED_NAME\", \"growthCycleDays\": 75}")
echo "Updated name: $(echo "$UPDATE_RESP" | grep -o "\"plantName\":\"$UPDATED_NAME\"")"
echo "Updated version: $(echo "$UPDATE_RESP" | grep -o '"dataVersion":2')"

# Step 6: Verify update persisted
echo ""
echo "STEP 6: Verify update persisted"
VERIFY_RESP=$(curl -s "http://localhost:8000/api/v1/farm/plant-data/$PLANT_ID" \
  -H "Authorization: Bearer $TOKEN")
echo "Persisted name: $(echo "$VERIFY_RESP" | grep -o "\"plantName\":\"$UPDATED_NAME\"")"
echo "Persisted days: $(echo "$VERIFY_RESP" | grep -o '"growthCycleDays":75')"

# Step 7: Delete plant
echo ""
echo "STEP 7: Delete plant"
DELETE_RESP=$(curl -s "http://localhost:8000/api/v1/farm/plant-data/$PLANT_ID" -X DELETE \
  -H "Authorization: Bearer $TOKEN")
echo "Delete: $(echo "$DELETE_RESP" | grep -o '"message":"[^"]*"')"

# Step 8: Verify plant removed from list
echo ""
echo "STEP 8: Verify removed from list (search for updated name)"
LIST2_RESP=$(curl -s "http://localhost:8000/api/v1/farm/plant-data?search=$UPDATED_NAME" \
  -H "Authorization: Bearer $TOKEN")
TOTAL=$(echo "$LIST2_RESP" | grep -o '"total":[0-9]*')
echo "After delete: $TOTAL (should be total:0)"

echo ""
echo "=== ALL STEPS COMPLETE ==="
