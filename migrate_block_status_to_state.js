// Migration script to rename 'status' field to 'state' in blocks collection
// This aligns the database with the API model changes

db = db.getSiblingDB('a64core_db');

print('Starting migration: Renaming blocks.status to blocks.state');

// Rename the field
const result = db.blocks.updateMany(
  {},
  { $rename: { 'status': 'state' } }
);

print(`Migration complete: ${result.modifiedCount} blocks updated`);

// Verify the migration
const blocksWithState = db.blocks.countDocuments({ state: { $exists: true } });
const blocksWithStatus = db.blocks.countDocuments({ status: { $exists: true } });

print(`Blocks with 'state' field: ${blocksWithState}`);
print(`Blocks with 'status' field: ${blocksWithStatus}`);

if (blocksWithStatus > 0) {
  print('WARNING: Some blocks still have the old "status" field!');
} else {
  print('SUCCESS: All blocks now use the "state" field');
}
