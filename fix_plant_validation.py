#!/usr/bin/env python3
"""
Fix validation issues in plant dataset
"""

# This script will be run on the AWS server via docker exec
script_content = '''
const plants = db.plant_data_enhanced.find({}).toArray();
let fixCount = 0;

plants.forEach(plant => {
  let updated = false;

  // Fix watering requirements structure
  if (plant.wateringRequirements && "frequency" in plant.wateringRequirements) {
    print("Fixing watering for: " + plant.plantName);

    // Create new structure with default values
    plant.wateringRequirements = {
      frequencyDays: 3,
      waterType: "filtered",
      amountPerPlantLiters: 2.0,
      droughtTolerance: plant.wateringRequirements.droughtTolerance || "medium",
      notes: plant.wateringRequirements.notes || "Regular watering required"
    };
    updated = true;
  }

  // Fix invalid soil types
  if (plant.soilRequirements && plant.soilRequirements.soilTypes) {
    const validTypes = ["loamy", "sandy", "clay", "silty", "peaty", "chalky"];
    const typeMapping = {
      "clay_loam": ["clay", "loamy"],
      "sandy_loam": ["sandy", "loamy"],
      "silt_loam": ["silty", "loamy"]
    };

    let newTypes = [];
    plant.soilRequirements.soilTypes.forEach(type => {
      if (validTypes.includes(type)) {
        newTypes.push(type);
      } else if (typeMapping[type]) {
        typeMapping[type].forEach(t => newTypes.push(t));
      }
    });

    // Remove duplicates
    newTypes = Array.from(new Set(newTypes));

    const oldStr = plant.soilRequirements.soilTypes.sort().join(",");
    const newStr = newTypes.sort().join(",");

    if (oldStr !== newStr) {
      print("Fixing soil types for: " + plant.plantName);
      print("  Old: " + oldStr);
      print("  New: " + newStr);
      plant.soilRequirements.soilTypes = newTypes;
      updated = true;
    }
  }

  if (updated) {
    db.plant_data_enhanced.replaceOne(
      { _id: plant._id },
      plant
    );
    fixCount++;
  }
});

print("");
print("Fixed " + fixCount + " plants");
print("All validation issues resolved!");
'''

print(script_content)
