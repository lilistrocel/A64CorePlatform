/**
 * MongoDB Migration Script: Add blockCode, farmCode, and sequenceNumber to Existing Blocks
 *
 * This script updates existing blocks in the database to include the new
 * code fields that were added to the Block model.
 *
 * Run with: mongosh mongodb://localhost:27017/a64core_db migrate_block_codes.js
 */

print("=" + "=".repeat(69));
print("Block Code Migration Script");
print("=" + "=".repeat(69));
print("");

// Get all farms
const farms = db.farms.find({ isActive: true }).sort({ createdAt: 1 }).toArray();

if (farms.length === 0) {
    print("No farms found in database");
    quit();
}

print(`Found ${farms.length} farms`);
print("");

let farmCounter = 1;
let totalBlocksUpdated = 0;

for (const farm of farms) {
    const farmId = farm.farmId;
    const farmName = farm.name || "Unnamed Farm";
    const farmCode = `F${String(farmCounter).padStart(3, "0")}`;

    print(`Processing Farm ${farmCounter}: ${farmName}`);
    print(`  Farm ID: ${farmId}`);
    print(`  Farm Code: ${farmCode}`);

    // Update farm with farmCode if it doesn't have one
    if (!farm.farmCode) {
        db.farms.updateOne(
            { farmId: farmId },
            {
                $set: {
                    farmCode: farmCode,
                    updatedAt: new Date()
                }
            }
        );
        print(`  ✓ Added farmCode to farm`);
    }

    // Get all blocks for this farm
    const blocks = db.blocks.find({
        farmId: farmId,
        isActive: true
    }).sort({ createdAt: 1 }).toArray();

    if (blocks.length === 0) {
        print(`  No blocks found for this farm`);
        print("");
        farmCounter++;
        continue;
    }

    print(`  Found ${blocks.length} blocks`);

    let blockCounter = 1;
    for (const block of blocks) {
        const blockId = block.blockId;
        const blockName = block.name || `Block ${blockCounter}`;

        // Check if block already has codes
        if (block.blockCode && block.farmCode && block.sequenceNumber) {
            print(`    Block ${blockCounter}: ${blockName} - Already has codes, skipping`);
            blockCounter++;
            continue;
        }

        // Generate codes
        const sequenceNumber = blockCounter;
        const blockCode = `${farmCode}-${String(sequenceNumber).padStart(3, "0")}`;

        // Update block
        db.blocks.updateOne(
            { blockId: blockId },
            {
                $set: {
                    blockCode: blockCode,
                    farmCode: farmCode,
                    sequenceNumber: sequenceNumber,
                    updatedAt: new Date()
                }
            }
        );

        print(`    ✓ Block ${blockCounter}: ${blockName}`);
        print(`      Block Code: ${blockCode}`);
        print(`      Sequence Number: ${sequenceNumber}`);

        totalBlocksUpdated++;
        blockCounter++;
    }

    print("");
    farmCounter++;
}

print(`Migration complete!`);
print(`Total farms processed: ${farms.length}`);
print(`Total blocks updated: ${totalBlocksUpdated}`);
