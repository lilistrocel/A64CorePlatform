// Update admin password in MongoDB to SuperAdmin123!
db = db.getSiblingDB('a64core_db');

const result = db.users.updateOne(
  { email: 'admin@a64platform.com' },
  { $set: { passwordHash: '$2b$12$j4AZiWEcgDDcR6vJhpthGO96xummcyoITRYdHhUtY5jMCbFIC2P6y' } }
);

print('Update result:', JSON.stringify(result));

const user = db.users.findOne(
  { email: 'admin@a64platform.com' },
  { email: 1, passwordHash: 1, role: 1 }
);

print('Updated user:', JSON.stringify(user, null, 2));
