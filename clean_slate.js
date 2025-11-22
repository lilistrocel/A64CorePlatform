db = db.getSiblingDB('a64core_db');

// Delete all tasks
const tasksDeleted = db.farm_tasks.deleteMany({});
print(`Deleted ${tasksDeleted.deletedCount} tasks`);

// Delete all blocks
const blocksDeleted = db.blocks.deleteMany({});
print(`Deleted ${blocksDeleted.deletedCount} blocks`);

print('Database cleaned! Ready for fresh test.');
