db = db.getSiblingDB('a64core_db');
db.blocks.updateOne(
  {blockId: 'f00ece69-5eaf-4bcd-a006-17a48b72416f'},
  {$set: {
    state: 'planned'
  }}
);
