db = db.getSiblingDB('a64core_db');

// Find Fresh Lettuce Test block
const block = db.blocks.findOne({name: 'Fresh Lettuce Test'});
print('Block found:', block.blockId, block.name);

// Reset to PLANNED state with future planting date
const futureDate = new Date();
futureDate.setDate(futureDate.getDate() + 7); // 7 days from now

db.blocks.updateOne(
  {blockId: block.blockId},
  {$set: {
    state: 'planned',
    plantedDate: null
  }}
);

print('Block reset to PLANNED state');
print('Now manually trigger task generation via API...');
