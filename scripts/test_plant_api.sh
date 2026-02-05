#!/bin/bash
# Test plant data API endpoints for Feature #49

# Login as admin
RESP=$(curl -s http://localhost:8000/api/v1/auth/login -X POST -H "Content-Type: application/json" -d '{"email":"farmtest_admin@a64core.com","password":"TestAdmin123@"}')
TOKEN=$(echo "$RESP" | grep -o '"access_token":"[^"]*"' | grep -o 'eyJ[^"]*')
echo "TOKEN_LENGTH=${#TOKEN}"

if [ -z "$TOKEN" ]; then
  echo "LOGIN_FAILED"
  echo "$RESP"
  exit 1
fi

echo "LOGIN_OK"

# Create plant data with correct schema fields
echo "=== CREATE PLANT ==="
CREATE_RESP=$(curl -s http://localhost:8000/api/v1/farm/plant-data -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "plantName": "TEST_PLANT_49_CRUD",
    "scientificName": "Testus plantus49",
    "plantType": "Crop",
    "growthCycleDays": 90,
    "minTemperatureCelsius": 18.0,
    "maxTemperatureCelsius": 30.0,
    "optimalPHMin": 6.0,
    "optimalPHMax": 7.5,
    "wateringFrequencyDays": 3,
    "sunlightHoursDaily": "6-8",
    "expectedYieldPerPlant": 2.5,
    "yieldUnit": "kg",
    "spacingCategory": "m",
    "notes": "Test plant for feature 49 CRUD verification",
    "tags": ["test", "feature49"]
  }')
echo "$CREATE_RESP" | head -c 800
echo ""

# Extract plant ID - try plantDataId format
PLANT_ID=$(echo "$CREATE_RESP" | grep -o '"plantDataId":"[^"]*"' | head -1 | sed 's/"plantDataId":"//;s/"//')
if [ -z "$PLANT_ID" ]; then
  # Try 'id' format
  PLANT_ID=$(echo "$CREATE_RESP" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"//')
fi
echo "PLANT_ID=$PLANT_ID"

# List plants
echo "=== LIST PLANTS ==="
curl -s "http://localhost:8000/api/v1/farm/plant-data?search=TEST_PLANT_49" \
  -H "Authorization: Bearer $TOKEN" | head -c 500
echo ""

# Get plant by ID
if [ -n "$PLANT_ID" ]; then
  echo "=== GET PLANT BY ID ==="
  curl -s "http://localhost:8000/api/v1/farm/plant-data/$PLANT_ID" \
    -H "Authorization: Bearer $TOKEN" | head -c 800
  echo ""

  # Update plant
  echo "=== UPDATE PLANT ==="
  UPDATE_RESP=$(curl -s "http://localhost:8000/api/v1/farm/plant-data/$PLANT_ID" -X PATCH \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"plantName": "TEST_PLANT_49_UPDATED", "growthCycleDays": 120}')
  echo "$UPDATE_RESP" | head -c 800
  echo ""

  # Verify update
  echo "=== VERIFY UPDATE ==="
  VERIFY_RESP=$(curl -s "http://localhost:8000/api/v1/farm/plant-data/$PLANT_ID" \
    -H "Authorization: Bearer $TOKEN")
  echo "$VERIFY_RESP" | head -c 800
  echo ""

  # Delete plant
  echo "=== DELETE PLANT ==="
  DELETE_RESP=$(curl -s "http://localhost:8000/api/v1/farm/plant-data/$PLANT_ID" -X DELETE \
    -H "Authorization: Bearer $TOKEN")
  echo "$DELETE_RESP"

  # Verify deletion - should still return (soft delete) or 404
  echo "=== VERIFY DELETION ==="
  curl -s "http://localhost:8000/api/v1/farm/plant-data/$PLANT_ID" \
    -H "Authorization: Bearer $TOKEN" | head -c 300
  echo ""
else
  echo "NO PLANT_ID - CREATE FAILED"
fi

echo "=== DONE ==="
