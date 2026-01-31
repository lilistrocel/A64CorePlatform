// Phase 3: Import Virtual Blocks into MongoDB
// Run with: mongosh mongodb://localhost:27017/a64core_db /path/to/this/file.js

const fs = require('fs');

// Load virtual blocks from JSON
const jsonPath = 'scripts/migrations/phase3/virtual_blocks.json';
const virtualBlocks = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

print(`Loaded ${virtualBlocks.length} virtual blocks from JSON`);

// Get blocks collection
const blocksCollection = db.blocks;

// Track stats
let imported = 0;
let skipped = 0;
let errors = 0;
let parentNotFound = 0;

// Process each virtual block
virtualBlocks.forEach((vb, idx) => {
    try {
        // Find parent physical block by legacyBlockCode
        const parent = blocksCollection.findOne({
            legacyBlockCode: vb.parentLegacyCode,
            blockCategory: "physical"
        });

        // Check if parent exists (avoiding ! character)
        if (parent === null) {
            print(`  WARNING: Parent not found for ${vb.legacyBlockCode} (looking for ${vb.parentLegacyCode})`);
            parentNotFound++;
            skipped++;
            return;
        }

        // Check if virtual block already exists
        const existing = blocksCollection.findOne({
            legacyBlockCode: vb.legacyBlockCode,
            blockCategory: "virtual"
        });

        if (existing !== null) {
            skipped++;
            return;
        }

        // Get parent's virtual block counter
        const counter = parent.virtualBlockCounter || 0;
        const newCounter = counter + 1;

        // Calculate allocated area based on drips ratio
        // Default to 10 drips total if parent has no drip info
        const parentDrips = parent.drips || 10;
        const blockDrips = vb.drips || 1;
        const dripRatio = blockDrips / parentDrips;
        const allocatedArea = Math.round((parent.totalArea || 0) * dripRatio * 100) / 100;

        // Generate new block code: FARMCODE-SEQ-CYCLE
        const parentCodeParts = parent.blockCode.split('-');
        const farmCode = parentCodeParts[0];
        const seq = parentCodeParts[1];
        const cycleNum = String(newCounter).padStart(3, '0');
        const newBlockCode = `${farmCode}-${seq}-${cycleNum}`;

        // Create virtual block document
        const virtualBlock = {
            blockId: UUID(vb.blockId),
            blockCode: newBlockCode,
            legacyBlockCode: vb.legacyBlockCode,
            blockCategory: "virtual",
            farmId: parent.farmId,
            parentBlockId: parent.blockId,
            plantId: vb.plantRef ? UUID(vb.plantRef) : null,
            cropName: vb.cropName,
            blockType: parent.blockType,
            totalArea: allocatedArea,
            allocatedArea: allocatedArea,
            availableArea: 0,
            drips: vb.drips,
            state: vb.state,
            season: vb.season,
            timeStart: vb.timeStart,
            timeFinish: vb.timeFinish,
            childBlockIds: [],
            virtualBlockCounter: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        // Insert virtual block
        blocksCollection.insertOne(virtualBlock);

        // Update parent: add child, increment counter, update available area and state
        const newAvailableArea = Math.max(0, (parent.availableArea || parent.totalArea || 0) - allocatedArea);

        blocksCollection.updateOne(
            { _id: parent._id },
            {
                $push: { childBlockIds: virtualBlock.blockId },
                $set: {
                    virtualBlockCounter: newCounter,
                    availableArea: Math.round(newAvailableArea * 100) / 100,
                    state: "partial",
                    updatedAt: new Date()
                }
            }
        );

        imported++;

        if (imported % 50 === 0) {
            print(`  Progress: ${imported} imported...`);
        }

    } catch (e) {
        print(`  ERROR processing ${vb.legacyBlockCode}: ${e.message}`);
        errors++;
    }
});

print(`\nImport complete:`);
print(`  Imported: ${imported}`);
print(`  Skipped (already exists): ${skipped - parentNotFound}`);
print(`  Parent not found: ${parentNotFound}`);
print(`  Errors: ${errors}`);

// Show final counts
const physicalCount = blocksCollection.countDocuments({ blockCategory: "physical" });
const virtualCount = blocksCollection.countDocuments({ blockCategory: "virtual" });
print(`\nBlock counts:`);
print(`  Physical blocks: ${physicalCount}`);
print(`  Virtual blocks: ${virtualCount}`);
print(`  Total: ${physicalCount + virtualCount}`);
