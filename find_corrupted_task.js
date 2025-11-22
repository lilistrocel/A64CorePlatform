// Find and delete corrupted task with binary UUID
const { MongoClient } = require('mongodb');

async function findCorruptedTask() {
    const client = new MongoClient('mongodb://localhost:27017');

    try {
        await client.connect();
        const db = client.db('a64core_db');
        const collection = db.collection('farm_tasks');

        // Find all tasks
        const tasks = await collection.find({}).toArray();

        console.log(`Total tasks found: ${tasks.length}`);

        for (const task of tasks) {
            const taskId = task.taskId;
            const taskIdType = typeof taskId;
            const isBinary = taskId instanceof Buffer || (taskId && taskId._bsontype === 'Binary');

            if (taskIdType !== 'string' || isBinary) {
                console.log('CORRUPTED TASK FOUND:');
                console.log('_id:', task._id);
                console.log('taskId type:', taskIdType);
                console.log('taskId value:', taskId);
                console.log('isBinary:', isBinary);
                console.log('Full task:', JSON.stringify(task, null, 2));

                // Delete the corrupted task
                const result = await collection.deleteOne({ _id: task._id });
                console.log(`Deleted ${result.deletedCount} corrupted task(s)`);
            } else if (taskId.length !== 36) {
                console.log('INVALID UUID LENGTH:');
                console.log('_id:', task._id);
                console.log('taskId:', taskId);
                console.log('length:', taskId.length);
            }
        }

        console.log('Scan complete');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.close();
    }
}

findCorruptedTask();
