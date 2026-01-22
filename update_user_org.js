// Update test user with organizationId
db = db.getSiblingDB('a64core_db');

const orgId = '550e8400-e29b-41d4-a716-446655440000';

db.users.updateOne(
    {email: 'testuser@test.com'},
    {$set: {organizationId: orgId}}
);

// Verify update
const user = db.users.findOne({email: 'testuser@test.com'}, {email: 1, organizationId: 1, role: 1});
printjson(user);
