#!/bin/bash
# Check plant data in MongoDB
PLANT_ID="$1"
docker exec a64core-mongodb-dev mongosh --quiet a64core_db --eval "
var r = db.plant_data.findOne({plantDataId: '$PLANT_ID'}, {plantName:1, isActive:1, deletedAt:1, _id:0});
JSON.stringify(r);
"
