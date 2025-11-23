/**
 * Database Migration: Fix ALL plant data validation errors
 *
 * This comprehensive migration fixes multiple validation issues in plant_data_enhanced:
 * 1. farmTypeCompatibility with "aquaponics" instead of "aquaponic"
 * 2. fertilizerSchedule entries with quantityPerPlant <= 0
 * 3. fertilizerSchedule entries with invalid stage values (e.g., 'planting')
 *
 * Errors causing issues:
 * - ValidationError: Input should be 'aquaponic' not 'aquaponics'
 * - ValidationError: quantityPerPlant should be greater than 0
 * - ValidationError: stage should be 'germination', 'vegetative', 'flowering', 'fruiting', or 'harvest'
 *
 * Date: 2025-11-23
 * Related Error: plant-data-enhanced endpoint returning 500
 */

// Connect to database
db = db.getSiblingDB('a64core_db');

print("========================================================");
print("Migration: Fix ALL Plant Data Validation Errors");
print("========================================================\n");

// Valid enum values
const validStages = ['germination', 'vegetative', 'flowering', 'fruiting', 'harvest'];
const validFarmTypes = ['open_field', 'hydroponic', 'greenhouse', 'vertical_farm', 'aquaponic'];

// Get all plants
const allPlants = db.plant_data_enhanced.find({}).toArray();
print(`Total plants in database: ${allPlants.length}\n`);

let fixedCount = 0;
let errorCount = 0;

allPlants.forEach((plant, index) => {
  try {
    const plantName = plant.commonName || plant.scientificName || plant._id;
    let needsUpdate = false;
    let updates = {};

    print(`[${index + 1}/${allPlants.length}] Processing: ${plantName}`);

    // Fix 1: farmTypeCompatibility - replace "aquaponics" with "aquaponic"
    if (plant.farmTypeCompatibility && Array.isArray(plant.farmTypeCompatibility)) {
      const hasAquaponics = plant.farmTypeCompatibility.includes("aquaponics");
      if (hasAquaponics) {
        print(`  → Fix: Replace 'aquaponics' with 'aquaponic'`);
        updates.farmTypeCompatibility = plant.farmTypeCompatibility.map(type =>
          type === "aquaponics" ? "aquaponic" : type
        );
        needsUpdate = true;
      }
    }

    // Fix 2 & 3: fertilizerSchedule validation
    if (plant.fertilizerSchedule && Array.isArray(plant.fertilizerSchedule)) {
      const validEntries = [];
      let removedInvalid = false;

      plant.fertilizerSchedule.forEach(entry => {
        let isValid = true;

        // Check quantityPerPlant
        if (!entry.quantityPerPlant || entry.quantityPerPlant <= 0) {
          print(`  → Remove: Invalid quantity (${entry.quantityPerPlant}) for stage ${entry.stage}`);
          isValid = false;
          removedInvalid = true;
        }

        // Check stage enum
        if (entry.stage && !validStages.includes(entry.stage)) {
          print(`  → Remove: Invalid stage '${entry.stage}' (not in enum)`);
          isValid = false;
          removedInvalid = true;
        }

        if (isValid) {
          validEntries.push(entry);
        }
      });

      if (removedInvalid) {
        print(`  → Fix: Fertilizer schedule ${plant.fertilizerSchedule.length} → ${validEntries.length} entries`);
        updates.fertilizerSchedule = validEntries;
        needsUpdate = true;
      }
    }

    // Apply updates if needed
    if (needsUpdate) {
      const result = db.plant_data_enhanced.updateOne(
        { _id: plant._id },
        { $set: updates }
      );

      if (result.modifiedCount === 1) {
        print(`  ✅ Success: Plant updated\n`);
        fixedCount++;
      } else {
        print(`  ⚠️  Warning: Update matched but didn't modify\n`);
      }
    } else {
      print(`  ✓ OK: No issues found\n`);
    }

  } catch (error) {
    print(`  ❌ Error: ${error.message}\n`);
    errorCount++;
  }
});

// Summary
print("========================================================");
print("Migration Summary:");
print(`  Total plants processed: ${allPlants.length}`);
print(`  Plants fixed: ${fixedCount}`);
print(`  Errors: ${errorCount}`);
print("========================================================\n");

if (errorCount > 0) {
  print("⚠️  Some plants failed to update. Check the errors above.");
  quit(1);
} else {
  print("✅ Migration completed successfully!");
  print(`   ${fixedCount} plants were updated to fix validation errors.`);
  quit(0);
}
