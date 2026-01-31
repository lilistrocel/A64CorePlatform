// Phase 4: Import block_archives, harvests, and crop_prices into MongoDB
// Run with: mongosh mongodb://localhost:27017/a64core_db /path/to/this/file.js

const fs = require('fs');

// ============================================
// Phase 4.1: Block Archives
// ============================================
print("\n=== Phase 4.1: Importing Block Archives ===");

const archivesJson = '/tmp/block_archives.json';
const archives = JSON.parse(fs.readFileSync(archivesJson, 'utf8'));
print(`Loaded ${archives.length} block archives from JSON`);

// Create or get collection
const archivesCollection = db.block_archives;

// Check if already imported
const existingArchives = archivesCollection.countDocuments();
if (existingArchives > 0) {
    print(`  Skipping - ${existingArchives} archives already exist`);
} else {
    let archiveCount = 0;
    archives.forEach((a) => {
        // Look up the virtual block by farmBlockRef (which is the legacy blockId/ref)
        const virtualBlock = db.blocks.findOne({
            blockId: UUID(a.farmBlockRef),
            blockCategory: "virtual"
        });

        // Look up physical block by blockStandardRef
        const physicalBlock = db.blocks.findOne({
            blockId: UUID(a.blockStandardRef),
            blockCategory: "physical"
        });

        const archive = {
            archiveId: UUID(a.archiveId),
            legacyBlockCode: a.legacyBlockCode,
            blockId: virtualBlock ? virtualBlock.blockId : null,
            blockCode: virtualBlock ? virtualBlock.blockCode : null,
            physicalBlockId: physicalBlock ? physicalBlock.blockId : null,
            physicalBlockCode: physicalBlock ? physicalBlock.blockCode : null,
            farmName: a.farmName,
            cropName: a.cropName,
            season: a.season,
            state: a.state,
            farmType: a.farmType,
            area: a.area,
            drips: a.drips,
            timeStart: a.timeStart ? new Date(a.timeStart) : null,
            timeFinish: a.timeFinish ? new Date(a.timeFinish) : null,
            timeCleaned: a.timeCleaned ? new Date(a.timeCleaned) : null,
            harvestDuration: a.harvestDuration,
            predictedYield: a.predictedYield,
            actualYield: a.actualYield,
            kpi: a.kpi,
            netYield: a.netYield,
            yieldPerSeed: a.yieldPerSeed,
            viewingYear: a.viewingYear,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        archivesCollection.insertOne(archive);
        archiveCount++;
    });

    print(`  Imported ${archiveCount} block archives`);
}

// Create indexes
archivesCollection.createIndex({ archiveId: 1 }, { unique: true });
archivesCollection.createIndex({ legacyBlockCode: 1 });
archivesCollection.createIndex({ blockId: 1 });
archivesCollection.createIndex({ cropName: 1 });
print("  Created indexes on block_archives");

// ============================================
// Phase 4.2: Harvests
// ============================================
print("\n=== Phase 4.2: Importing Harvests ===");

const harvestsJson = '/tmp/harvests.json';
const harvests = JSON.parse(fs.readFileSync(harvestsJson, 'utf8'));
print(`Loaded ${harvests.length} harvest records from JSON`);

const harvestsCollection = db.block_harvests;

// Check if already imported
const existingHarvests = harvestsCollection.countDocuments();
if (existingHarvests > 0) {
    print(`  Skipping - ${existingHarvests} harvests already exist`);
} else {
    let harvestCount = 0;
    let progress = 0;

    harvests.forEach((h) => {
        // Look up the virtual block by farmBlockRef
        const virtualBlock = db.blocks.findOne({
            blockId: UUID(h.farmBlockRef),
            blockCategory: "virtual"
        });

        // Look up physical block by mainBlockRef
        let physicalBlock = null;
        if (h.mainBlockRef) {
            physicalBlock = db.blocks.findOne({
                blockId: UUID(h.mainBlockRef),
                blockCategory: "physical"
            });
        }

        const harvest = {
            harvestId: UUID(h.harvestId),
            legacyId: h.legacyId,
            legacyBlockCode: h.legacyBlockCode,
            mainBlockCode: h.mainBlockCode,
            blockId: virtualBlock ? virtualBlock.blockId : null,
            blockCode: virtualBlock ? virtualBlock.blockCode : null,
            physicalBlockId: physicalBlock ? physicalBlock.blockId : null,
            physicalBlockCode: physicalBlock ? physicalBlock.blockCode : null,
            cropName: h.cropName,
            farmName: h.farmName,
            quantity: h.quantity,
            season: h.season,
            harvestTime: h.harvestTime ? new Date(h.harvestTime) : null,
            reporterEmail: h.reporterEmail,
            grade: h.grade,
            viewingYear: h.viewingYear,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        harvestsCollection.insertOne(harvest);
        harvestCount++;
        progress++;

        if (progress % 2000 === 0) {
            print(`  Progress: ${progress} harvests imported...`);
        }
    });

    print(`  Imported ${harvestCount} harvest records`);
}

// Create indexes
harvestsCollection.createIndex({ harvestId: 1 }, { unique: true });
harvestsCollection.createIndex({ legacyBlockCode: 1 });
harvestsCollection.createIndex({ blockId: 1 });
harvestsCollection.createIndex({ cropName: 1 });
harvestsCollection.createIndex({ harvestTime: 1 });
harvestsCollection.createIndex({ farmName: 1 });
print("  Created indexes on block_harvests");

// ============================================
// Phase 4.3: Crop Prices
// ============================================
print("\n=== Phase 4.3: Importing Crop Prices ===");

const pricesJson = '/tmp/crop_prices.json';
const prices = JSON.parse(fs.readFileSync(pricesJson, 'utf8'));
print(`Loaded ${prices.length} crop price records from JSON`);

const pricesCollection = db.crop_prices;

// Check if already imported
const existingPrices = pricesCollection.countDocuments();
if (existingPrices > 0) {
    print(`  Skipping - ${existingPrices} prices already exist`);
} else {
    let priceCount = 0;

    prices.forEach((p) => {
        // Look up customer by name
        const customer = db.customers.findOne({
            $or: [
                { name: p.customerName },
                { name: { $regex: p.customerName ? p.customerName.substring(0, 20) : "NOMATCH", $options: "i" } }
            ]
        });

        const price = {
            priceId: UUID(p.priceId),
            date: p.date ? new Date(p.date) : null,
            customerName: p.customerName,
            customerId: customer ? customer.customerId : null,
            cropName: p.cropName,
            grade: p.grade,
            quantity: p.quantity,
            pricePerUnit: p.pricePerUnit,
            priceTotal: p.priceTotal,
            farmName: p.farmName,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        pricesCollection.insertOne(price);
        priceCount++;
    });

    print(`  Imported ${priceCount} crop price records`);
}

// Create indexes
pricesCollection.createIndex({ priceId: 1 }, { unique: true });
pricesCollection.createIndex({ date: 1 });
pricesCollection.createIndex({ cropName: 1 });
pricesCollection.createIndex({ customerName: 1 });
pricesCollection.createIndex({ customerId: 1 });
print("  Created indexes on crop_prices");

// ============================================
// Summary
// ============================================
print("\n=== Phase 4 Summary ===");
print(`Block Archives: ${archivesCollection.countDocuments()}`);
print(`Block Harvests: ${harvestsCollection.countDocuments()}`);
print(`Crop Prices: ${pricesCollection.countDocuments()}`);
print(`Total Phase 4 records: ${archivesCollection.countDocuments() + harvestsCollection.countDocuments() + pricesCollection.countDocuments()}`);
