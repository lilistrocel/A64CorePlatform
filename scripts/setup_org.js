const { MongoClient } = require('mongodb');
const { randomUUID } = require('crypto');

async function main() {
  const client = new MongoClient('mongodb://localhost:27017/a64core_db');
  await client.connect();
  const db = client.db('a64core_db');

  let org = await db.collection('organizations').findOne({});
  let orgId;
  if (org) {
    orgId = org.organizationId;
    console.log('Org exists:', orgId);
  } else {
    orgId = randomUUID();
    await db.collection('organizations').insertOne({
      organizationId: orgId,
      name: 'A64 Core Farm Operations',
      description: 'Default organization',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('Created org:', orgId);
  }

  for (const email of ['farmtest_admin@a64core.com', 'testadmin@a64core.com']) {
    const r = await db.collection('users').updateOne(
      { email },
      { $set: { organizationId: orgId } }
    );
    console.log(email + ': matched=' + r.matchedCount + ' modified=' + r.modifiedCount);
  }

  await client.close();
  console.log('Done!');
}
main().catch(console.error);
