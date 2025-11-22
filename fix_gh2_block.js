// Fix GH2 block (F001-022) - add planted date and generate planting task
db = db.getSiblingDB('a64core_db');

const blockCode = 'F001-022';
const block = db.blocks.findOne({blockCode: blockCode});

if (!block) {
  print(`Block ${blockCode} not found`);
  quit(1);
}

print('Current block status:', block.state);
print('Current expectedStatusChanges:', JSON.stringify(block.expectedStatusChanges, null, 2));

// Add "planted" to expectedStatusChanges (same as "growing" date)
const plantedDate = block.expectedStatusChanges.growing;

const updateResult = db.blocks.updateOne(
  {blockCode: blockCode},
  {
    $set: {
      'expectedStatusChanges.planted': plantedDate
    }
  }
);

print('Updated expectedStatusChanges:', updateResult.modifiedCount, 'documents');

// Verify update
const updatedBlock = db.blocks.findOne({blockCode: blockCode}, {expectedStatusChanges: 1});
print('New expectedStatusChanges:', JSON.stringify(updatedBlock.expectedStatusChanges, null, 2));

print('\nNow you need to call the API to regenerate tasks for this block.');
print('The block has currentCycleId:', block.currentCycleId || 'NONE');
