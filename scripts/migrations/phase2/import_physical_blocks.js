// Import physical blocks into MongoDB
// Run with: mongosh mongodb://localhost:27017/a64core_db /path/to/this/file.js

const fs = require('fs');

// Load physical blocks from JSON
const jsonPath = '/tmp/physical_blocks.json';
const physicalBlocks = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

print(`Loaded ${physicalBlocks.length} physical blocks from JSON`);

const blocksCollection = db.blocks;
let imported = 0;

physicalBlocks.forEach((pb) => {
    const block = {
        blockId: UUID(pb.blockId),
        blockCode: pb.blockCode,
        legacyBlockCode: pb.legacyBlockCode,
        blockCategory: "physical",
        farmId: UUID(pb.farmId),
        parentBlockId: null,
        plantId: null,
        cropName: null,
        blockType: pb.blockType,
        totalArea: pb.area || 0,
        allocatedArea: 0,
        availableArea: pb.area || 0,
        drips: pb.maxPlants,
        state: "empty",
        season: null,
        timeStart: null,
        timeFinish: null,
        childBlockIds: [],
        virtualBlockCounter: 0,
        createdAt: new Date(),
        updatedAt: new Date()
    };

    blocksCollection.insertOne(block);
    imported++;
});

print(`Imported ${imported} physical blocks`);
print(`Total blocks: ${blocksCollection.countDocuments()}`);
