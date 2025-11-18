#!/bin/bash
# Import plant data to MongoDB running in Docker container

echo "==========================================="
echo "Importing Plant Data to MongoDB"
echo "==========================================="

# Check if JSON file exists
if [ ! -f "plants-from-old-db-enhanced.json" ]; then
    echo "❌ Error: plants-from-old-db-enhanced.json not found"
    exit 1
fi

# Count plants in JSON
PLANT_COUNT=$(cat plants-from-old-db-enhanced.json | grep -o '"plantName"' | wc -l)
echo "📊 Found $PLANT_COUNT plants in JSON file"

# Check MongoDB container
echo "🔍 Checking MongoDB container..."
docker ps | grep mongodb

# Import using mongoimport
echo "🚀 Starting import..."
docker cp plants-from-old-db-enhanced.json a64core-mongodb-dev:/tmp/

# Extract plants array and import
docker exec a64core-mongodb-dev bash -c "mongosh a64core_db --quiet --eval \"
var data = JSON.parse(cat('/tmp/plants-from-old-db-enhanced.json'));
var plants = data.plants;
var result = db.plants.insertMany(plants);
print('✅ Imported ' + result.insertedIds.length + ' plants');
print('📊 Total plants in database: ' + db.plants.countDocuments());
\""

echo "==========================================="
echo "Import Complete!"
echo "==========================================="
