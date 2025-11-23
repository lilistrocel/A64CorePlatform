/**
 * Database Migration: Fix farmTypeCompatibility enum value
 *
 * This migration fixes the inconsistency in farmTypeCompatibility values
 * where some plant data has "aquaponics" (plural) but the Pydantic enum
 * expects "aquaponic" (singular).
 *
 * Error causing the issue:
 * ValidationError: Input should be 'open_field', 'hydroponic', 'greenhouse',
 * 'vertical_farm' or 'aquaponic' [type=enum, input_value='aquaponics']
 *
 * Date: 2025-11-23
 * Related Error: plant-data-enhanced endpoint returning 500
 */

// Connect to database
db = db.getSiblingDB('a64core_db');

print("==========================================");
print("Migration: Fix 'aquaponics' → 'aquaponic'");
print("==========================================\n");

// Find all plant_data_enhanced documents with "aquaponics" in farmTypeCompatibility
const plantsToFix = db.plant_data_enhanced.find({
  "farmTypeCompatibility": "aquaponics"
}).toArray();

print(`Found ${plantsToFix.length} plant(s) with "aquaponics" value\n`);

if (plantsToFix.length === 0) {
  print("✅ No plants need migration. All farmTypeCompatibility values are correct.");
  print("==========================================\n");
  quit();
}

// Process each plant
let successCount = 0;
let errorCount = 0;

plantsToFix.forEach((plant, index) => {
  try {
    const plantName = plant.commonName || plant.scientificName || plant._id;
    print(`[${index + 1}/${plantsToFix.length}] Processing plant: ${plantName}`);

    // Get the current farmTypeCompatibility array
    const currentCompatibility = plant.farmTypeCompatibility || [];

    // Replace "aquaponics" with "aquaponic"
    const updatedCompatibility = currentCompatibility.map(type =>
      type === "aquaponics" ? "aquaponic" : type
    );

    print(`  → Updating: ${JSON.stringify(currentCompatibility)}`);
    print(`  → To:       ${JSON.stringify(updatedCompatibility)}`);

    // Update the document
    const result = db.plant_data_enhanced.updateOne(
      { _id: plant._id },
      { $set: { farmTypeCompatibility: updatedCompatibility } }
    );

    if (result.modifiedCount === 1) {
      print(`  ✅ Success: Updated farmTypeCompatibility\n`);
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
print("==========================================");
print("Migration Summary:");
print(`  Total plants processed: ${plantsToFix.length}`);
print(`  Successfully updated: ${successCount}`);
print(`  Errors: ${errorCount}`);
print("==========================================\n");

if (errorCount > 0) {
  print("⚠️  Some plants failed to update. Check the errors above.");
  quit(1);
} else {
  print("✅ Migration completed successfully!");
  quit(0);
}
