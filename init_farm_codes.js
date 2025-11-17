// Initialize farm codes for existing farms
let nextCode = 1;
db = db.getSiblingDB('a64core_db');

db.farms.find({farmCode: {$exists: false}}).forEach(farm => {
    const code = 'F' + nextCode.toString().padStart(3, '0');
    db.farms.updateOne(
        {farmId: farm.farmId},
        {$set: {farmCode: code, nextBlockSequence: 1}}
    );
    print('Assigned ' + code + ' to ' + farm.name);
    nextCode++;
});

print('\nDone! Initialized ' + (nextCode - 1) + ' farms');
