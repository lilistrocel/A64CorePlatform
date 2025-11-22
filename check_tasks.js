db = db.getSiblingDB('a64core_db');

print('=== TASKS ===');
db.farm_tasks.find({}, {
  taskId: 1,
  taskType: 1,
  title: 1,
  status: 1,
  scheduledDate: 1,
  triggerStateChange: 1,
  blockId: 1
}).forEach(task => {
  print(JSON.stringify({
    taskType: task.taskType,
    title: task.title,
    status: task.status,
    scheduledDate: task.scheduledDate,
    triggerStateChange: task.triggerStateChange
  }));
});

print('\n=== BLOCK ===');
const block = db.blocks.findOne({}, {name: 1, state: 1, plantedDate: 1, targetCropName: 1});
print(JSON.stringify(block));
