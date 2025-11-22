db = db.getSiblingDB('a64core_db');
db.farm_tasks.find(
  {
    status: 'pending',
    triggerStateChange: {$exists: true, $ne: null}
  },
  {
    taskId: 1,
    blockId: 1,
    taskType: 1,
    title: 1,
    triggerStateChange: 1,
    status: 1
  }
).limit(10);
