#!/bin/bash
# Feature #208: Verify CRUD operations reflect real MongoDB changes

TIMESTAMP=$(date +%s)
FARM_NAME="REALDB_TEST_${TIMESTAMP}"

# Login as admin
RESP=$(curl -s http://localhost:8000/api/v1/auth/login -X POST -H "Content-Type: application/json" -d '{"email":"farmtest_admin@a64core.com","password":"TestAdmin123@"}')
TOKEN=$(echo "$RESP" | grep -o '"access_token":"[^"]*"' | grep -o 'eyJ[^"]*')

if [ -z "$TOKEN" ]; then
  echo "FAIL: Login failed"
  exit 1
fi
echo "=== Login OK ==="

# STEP 1: Create unique farm via API
echo ""
echo "=== STEP 1: Create farm '$FARM_NAME' ==="
CREATE_RESP=$(curl -s http://localhost:8000/api/v1/farm/farms -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"name\": \"$FARM_NAME\",
    \"description\": \"Feature 208 real DB verification\",
    \"location\": {\"address\": \"Test Location\", \"city\": \"Abu Dhabi\", \"country\": \"UAE\"},
    \"totalArea\": 500
  }")
echo "Status: $(echo "$CREATE_RESP" | grep -o '"message":"[^"]*"')"
FARM_ID=$(echo "$CREATE_RESP" | grep -o '"farmId":"[^"]*"' | head -1 | sed 's/"farmId":"//;s/"//')
echo "Farm ID: $FARM_ID"

if [ -z "$FARM_ID" ]; then
  echo "FAIL: No farmId returned"
  echo "$CREATE_RESP" | head -c 500
  exit 1
fi

# STEP 2: Verify directly in MongoDB
echo ""
echo "=== STEP 2: Verify in MongoDB ==="
docker exec a64core-mongodb-dev mongosh --quiet a64core_db --eval "
var farm = db.farms.findOne({farmId: '$FARM_ID'});
if (farm) {
  JSON.stringify({exists: true, name: farm.name, description: farm.description, totalArea: farm.totalArea, city: farm.location ? farm.location.city : 'none'});
} else {
  JSON.stringify({exists: false});
}
"

# STEP 3: Update farm via API
echo ""
UPDATED_NAME="${FARM_NAME}_UPDATED"
echo "=== STEP 3: Update farm to '$UPDATED_NAME' ==="
UPDATE_RESP=$(curl -s "http://localhost:8000/api/v1/farm/farms/$FARM_ID" -X PATCH \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"name\": \"$UPDATED_NAME\", \"description\": \"Updated for verification\", \"totalArea\": 750}")
echo "Status: $(echo "$UPDATE_RESP" | grep -o '"message":"[^"]*"')"

# STEP 4: Verify update in MongoDB
echo ""
echo "=== STEP 4: Verify update in MongoDB ==="
docker exec a64core-mongodb-dev mongosh --quiet a64core_db --eval "
var farm = db.farms.findOne({farmId: '$FARM_ID'});
JSON.stringify({name: farm.name, description: farm.description, totalArea: farm.totalArea});
"

# STEP 5: Delete farm via API
echo ""
echo "=== STEP 5: Delete farm ==="
DELETE_RESP=$(curl -s "http://localhost:8000/api/v1/farm/farms/$FARM_ID" -X DELETE \
  -H "Authorization: Bearer $TOKEN")
echo "Status: $(echo "$DELETE_RESP" | grep -o '"message":"[^"]*"')"

# STEP 6: Verify removed from MongoDB
echo ""
echo "=== STEP 6: Verify deletion in MongoDB ==="
docker exec a64core-mongodb-dev mongosh --quiet a64core_db --eval "
var farm = db.farms.findOne({farmId: '$FARM_ID'});
if (farm) {
  JSON.stringify({still_in_farms: true});
} else {
  JSON.stringify({removed_from_farms: true});
}
"

echo ""
echo "=== Check archived copy ==="
docker exec a64core-mongodb-dev mongosh --quiet a64core_db --eval "
var archived = db.deleted_farms.findOne({farmId: '$FARM_ID'});
if (archived) {
  JSON.stringify({archived: true, name: archived.name});
} else {
  JSON.stringify({archived: false});
}
"

echo ""
echo "=== ALL STEPS COMPLETE ==="
