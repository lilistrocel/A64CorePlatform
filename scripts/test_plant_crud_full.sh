#!/bin/bash
# Full CRUD test for Feature #49 with MongoDB verification

# Login as admin
RESP=$(curl -s http://localhost:8000/api/v1/auth/login -X POST -H "Content-Type: application/json" -d '{"email":"farmtest_admin@a64core.com","password":"TestAdmin123@"}')
TOKEN=$(echo "$RESP" | grep -o '"access_token":"[^"]*"' | grep -o 'eyJ[^"]*')

if [ -z "$TOKEN" ]; then
  echo "FAIL: Login failed"
  exit 1
fi
echo "STEP 1: Login OK"

# Step 2: Create plant
echo ""
echo "STEP 2: Create plant"
CREATE_RESP=$(curl -s http://localhost:8000/api/v1/farm/plant-data -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "plantName": "FEATURE49_VERIFY_PLANT",
    "scientificName": "Verificationus plantus",
    "plantType": "Crop",
    "growthCycleDays": 60,
    "minTemperatureCelsius": 15.0,
    "maxTemperatureCelsius": 35.0,
    "optimalPHMin": 5.5,
    "optimalPHMax": 7.0,
    "wateringFrequencyDays": 2,
    "sunlightHoursDaily": "8-10",
    "expectedYieldPerPlant": 3.0,
    "yieldUnit": "kg",
    "spacingCategory": "l",
    "notes": "Feature 49 verification plant",
    "tags": ["test", "feature49", "verification"]
  }')

PLANT_ID=$(echo "$CREATE_RESP" | grep -o '"plantDataId":"[^"]*"' | head -1 | sed 's/"plantDataId":"//;s/"//')
echo "Created plant ID: $PLANT_ID"

# Check for success message
echo "$CREATE_RESP" | grep -o '"message":"[^"]*"'

# Step 3: List and verify plant appears
echo ""
echo "STEP 3: List plants and search for created plant"
LIST_RESP=$(curl -s "http://localhost:8000/api/v1/farm/plant-data?search=FEATURE49_VERIFY" \
  -H "Authorization: Bearer $TOKEN")
echo "$LIST_RESP" | grep -o '"plantName":"FEATURE49_VERIFY_PLANT"'
echo "$LIST_RESP" | grep -o '"total":[0-9]*'

# Step 4: Get by ID
echo ""
echo "STEP 4: Get plant by ID"
GET_RESP=$(curl -s "http://localhost:8000/api/v1/farm/plant-data/$PLANT_ID" \
  -H "Authorization: Bearer $TOKEN")
echo "$GET_RESP" | grep -o '"plantName":"FEATURE49_VERIFY_PLANT"'
echo "$GET_RESP" | grep -o '"growthCycleDays":60'
echo "$GET_RESP" | grep -o '"dataVersion":1'

# Step 5: Update plant
echo ""
echo "STEP 5: Update plant"
UPDATE_RESP=$(curl -s "http://localhost:8000/api/v1/farm/plant-data/$PLANT_ID" -X PATCH \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"plantName": "FEATURE49_UPDATED_PLANT", "growthCycleDays": 75, "notes": "Updated for verification"}')
echo "$UPDATE_RESP" | grep -o '"plantName":"FEATURE49_UPDATED_PLANT"'
echo "$UPDATE_RESP" | grep -o '"growthCycleDays":75'
echo "$UPDATE_RESP" | grep -o '"dataVersion":2'
echo "$UPDATE_RESP" | grep -o '"message":"[^"]*"'

# Step 6: Verify update persisted
echo ""
echo "STEP 6: Verify update persisted (re-fetch)"
VERIFY_RESP=$(curl -s "http://localhost:8000/api/v1/farm/plant-data/$PLANT_ID" \
  -H "Authorization: Bearer $TOKEN")
echo "$VERIFY_RESP" | grep -o '"plantName":"FEATURE49_UPDATED_PLANT"'
echo "$VERIFY_RESP" | grep -o '"growthCycleDays":75'
echo "$VERIFY_RESP" | grep -o '"notes":"Updated for verification"'

# Step 7: Delete plant
echo ""
echo "STEP 7: Delete plant"
DELETE_RESP=$(curl -s "http://localhost:8000/api/v1/farm/plant-data/$PLANT_ID" -X DELETE \
  -H "Authorization: Bearer $TOKEN")
echo "$DELETE_RESP" | grep -o '"message":"[^"]*"'

# Step 8: Verify plant removed from list
echo ""
echo "STEP 8: Verify plant removed from list"
LIST2_RESP=$(curl -s "http://localhost:8000/api/v1/farm/plant-data?search=FEATURE49" \
  -H "Authorization: Bearer $TOKEN")
TOTAL=$(echo "$LIST2_RESP" | grep -o '"total":[0-9]*')
echo "Search results after delete: $TOTAL"

# Step 9: Verify via MongoDB
echo ""
echo "STEP 9: MongoDB verification"
docker exec a64core-mongodb-dev mongosh --quiet -u admin -p admin123 --authenticationDatabase admin a64core_db --eval "
  var found = db.plant_data.findOne({plantDataId: '$PLANT_ID'});
  if (found) {
    printjson({exists: true, isActive: found.isActive, deletedAt: found.deletedAt || 'none'});
  } else {
    printjson({exists: false});
  }
"

echo ""
echo "=== ALL STEPS COMPLETE ==="
