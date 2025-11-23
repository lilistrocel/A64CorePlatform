/**
 * Database Migration: Add "planted" date to expectedStatusChanges
 *
 * This migration adds the missing "planted" date to all blocks in PLANNED state
 * that have expectedStatusChanges but are missing the "planted" key.
 *
 * Context: The calculate_expected_dates() function was missing this field,
 * causing planting tasks not to be generated. This migration fixes existing
 * blocks created before the fix.
 *
 * Date: 2025-11-21
 * Related Fix: src/modules/farm_manager/services/block/block_service_new.py:118
 * Related Commit: f5b6d34ddcc94396e7e56923db6ccbf173c687c6
 */

// Connect to database
db = db.getSiblingDB('a64core_db');

print("===========================================");
print("Migration: Add 'planted' date to blocks");
print("===========================================\n");

// Find all blocks in PLANNED state that need the "planted" key
const blocksToFix = db.blocks.find({
  state: "planned",
  $or: [
    { "expectedStatusChanges.planted": { $exists: false } },
    { expectedStatusChanges: null }
  ]
}).toArray();

print(`Found ${blocksToFix.length} blocks to migrate\n`);

if (blocksToFix.length === 0) {
  print("✅ No blocks need migration. All blocks already have 'planted' date.");
  print("===========================================\n");
  quit();
}

// Process each block
let successCount = 0;
let errorCount = 0;

blocksToFix.forEach((block, index) => {
  try {
    const blockCode = block.blockCode || block.name || block._id;
    print(`[${index + 1}/${blocksToFix.length}] Processing block: ${blockCode}`);

    // The "planted" date should be the same as the planting date
    // If the block has a planting date in expectedStatusChanges.growing, use that
    // Otherwise use the current date as fallback
    let plantedDate = null;

    if (block.expectedStatusChanges && block.expectedStatusChanges.growing) {
      plantedDate = block.expectedStatusChanges.growing;
      print(`  → Using growing date as planted date: ${plantedDate}`);
    } else if (block.plantingDate) {
      plantedDate = block.plantingDate;
      print(`  → Using plantingDate field: ${plantedDate}`);
    } else {
      // Fallback: use current date
      plantedDate = new Date().toISOString();
      print(`  → No planting date found, using current date: ${plantedDate}`);
    }

    // Update the block - handle case where expectedStatusChanges is null
    let updateOperation = {};
    if (block.expectedStatusChanges === null) {
      // If expectedStatusChanges is null, initialize it as an object with planted
      updateOperation = {
        $set: {
          "expectedStatusChanges": {
            "planted": plantedDate
          }
        }
      };
    } else {
      // If it exists, just add the planted field
      updateOperation = {
        $set: {
          "expectedStatusChanges.planted": plantedDate
        }
      };
    }

    const result = db.blocks.updateOne(
      { _id: block._id },
      updateOperation
    );

    if (result.modifiedCount === 1) {
      print(`  ✅ Success: Added planted date\n`);
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
print("===========================================");
print("Migration Summary:");
print(`  Total blocks processed: ${blocksToFix.length}`);
print(`  Successfully updated: ${successCount}`);
print(`  Errors: ${errorCount}`);
print("===========================================\n");

if (errorCount > 0) {
  print("⚠️  Some blocks failed to update. Check the errors above.");
  quit(1);
} else {
  print("✅ Migration completed successfully!");
  quit(0);
}
