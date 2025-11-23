/**
 * Database Migration: Fix fertilizerSchedule quantityPerPlant = 0
 *
 * This migration fixes the validation error where some plant data has
 * fertilizerSchedule entries with quantityPerPlant = 0, but Pydantic
 * validation requires it to be > 0.
 *
 * Error causing the issue:
 * ValidationError: Input should be greater than 0 [type=greater_than,
 * input_value=0, input_type=int] for fertilizerSchedule.0.quantityPerPlant
 *
 * Solution: Remove fertilizer schedule entries with quantityPerPlant = 0
 * or set them to null if the entire fertilizerSchedule is invalid.
 *
 * Date: 2025-11-23
 * Related Error: plant-data-enhanced endpoint returning 500
 */

// Connect to database
db = db.getSiblingDB('a64core_db');

print("====================================================");
print("Migration: Fix fertilizerSchedule quantityPerPlant");
print("====================================================\n");

// Find all plant_data_enhanced documents with fertilizerSchedule containing quantityPerPlant = 0
const plantsToFix = db.plant_data_enhanced.find({
  "fertilizerSchedule": {
    $elemMatch: {
      "quantityPerPlant": { $lte: 0 }
    }
  }
}).toArray();

print(`Found ${plantsToFix.length} plant(s) with invalid fertilizer quantities\n`);

if (plantsToFix.length === 0) {
  print("✅ No plants need migration. All fertilizer schedules are valid.");
  print("====================================================\n");
  quit();
}

// Process each plant
let successCount = 0;
let errorCount = 0;

plantsToFix.forEach((plant, index) => {
  try {
    const plantName = plant.commonName || plant.scientificName || plant._id;
    print(`[${index + 1}/${plantsToFix.length}] Processing plant: ${plantName}`);

    // Get the current fertilizerSchedule
    const currentSchedule = plant.fertilizerSchedule || [];

    print(`  → Current schedule has ${currentSchedule.length} entries`);

    // Filter out entries with quantityPerPlant <= 0
    const validEntries = currentSchedule.filter(entry => {
      if (!entry.quantityPerPlant || entry.quantityPerPlant <= 0) {
        print(`  → Removing invalid entry: stage=${entry.stage}, quantity=${entry.quantityPerPlant}`);
        return false;
      }
      return true;
    });

    print(`  → Valid entries remaining: ${validEntries.length}`);

    // Update the document
    // If no valid entries remain, set to empty array (or null if you prefer)
    const result = db.plant_data_enhanced.updateOne(
      { _id: plant._id },
      { $set: { fertilizerSchedule: validEntries.length > 0 ? validEntries : [] } }
    );

    if (result.modifiedCount === 1) {
      print(`  ✅ Success: Updated fertilizerSchedule\n`);
      successCount++;
    } else {
      print(`  ⚠️  Warning: Update matched but didn't modify (already updated?)\n`);
    }

  } catch (error) {
    print(`  ❌ Error: ${error.message}\n`);
    errorCount++;
  }
});

// Summary
print("====================================================");
print("Migration Summary:");
print(`  Total plants processed: ${plantsToFix.length}`);
print(`  Successfully updated: ${successCount}`);
print(`  Errors: ${errorCount}`);
print("====================================================\n");

if (errorCount > 0) {
  print("⚠️  Some plants failed to update. Check the errors above.");
  quit(1);
} else {
  print("✅ Migration completed successfully!");
  quit(0);
}
