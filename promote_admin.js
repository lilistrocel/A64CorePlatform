// Promote admin to super_admin and assign to farm
db = db.getSiblingDB('a64core_db');

// 1. Promote to super_admin
const updateResult = db.users.updateOne(
  { email: 'admin@a64platform.com' },
  { $set: { role: 'super_admin' } }
);
print('Update role result:', JSON.stringify(updateResult));

// 2. Get user and farm IDs
const user = db.users.findOne({ email: 'admin@a64platform.com' }, { userId: 1 });
const farm = db.farms.findOne({}, { farmId: 1, name: 1 });

print('User:', JSON.stringify(user));
print('Farm:', JSON.stringify(farm));

// 3. Create farm assignment if farm exists
if (user && farm) {
  const assignmentResult = db.farm_assignments.insertOne({
    userId: user.userId,
    farmId: farm.farmId,
    role: 'owner',
    assignedAt: new Date(),
    assignedBy: user.userId
  });
  print('Assignment result:', JSON.stringify(assignmentResult));
}

// 4. Verify
const updatedUser = db.users.findOne(
  { email: 'admin@a64platform.com' },
  { email: 1, role: 1, userId: 1 }
);
print('Updated user:', JSON.stringify(updatedUser, null, 2));

const assignment = db.farm_assignments.findOne({ userId: user.userId });
print('Farm assignment:', JSON.stringify(assignment, null, 2));
