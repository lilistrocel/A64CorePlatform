"""
Harvest Migration Script

Migrates 11,745 harvest records from OldData/220126/harvest_reports_rows.sql
into the block_harvests MongoDB collection.

Logic:
- Virtual blocks (currently active): Get harvests where block_id matches their legacyBlockCode
- Physical blocks: Get ALL remaining harvests via main_block match
  (historical harvests from past cycles go to the parent physical block)

After inserting harvests, updates block KPI (actualYieldKg, totalHarvests, yieldEfficiencyPercent).
"""

import re
import json
import uuid
from datetime import datetime
from collections import defaultdict

# MongoDB connection via mongosh - we'll generate JS commands
SQL_FILE = "OldData/220126/harvest_reports_rows.sql"

def parse_harvests(sql_file: str) -> list[dict]:
    """Parse harvest_reports SQL into list of dicts."""
    with open(sql_file, "r") as f:
        content = f.read()

    pattern = r"\('([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*([^)]*)\)"
    matches = re.findall(pattern, content)

    harvests = []
    for m in matches:
        grade_raw = m[13].strip().strip("'")
        if grade_raw == "null" or grade_raw == "":
            grade = None
        else:
            grade = grade_raw

        quantity_str = m[1].strip()
        try:
            quantity = float(quantity_str)
        except ValueError:
            continue  # Skip invalid quantities

        if quantity <= 0:
            continue  # Skip zero/negative quantities

        harvests.append({
            "legacyId": m[0].strip() or None,
            "quantity": quantity,
            "harvestSeason": m[2].strip(),
            "time": m[3].strip(),
            "ref": m[4].strip(),
            "farmBlockRef": m[5].strip(),
            "blockId": m[6].strip(),
            "crop": m[7].strip(),
            "farm": m[8].strip(),
            "reporterUser": m[9].strip(),
            "mainBlock": m[10].strip(),
            "mainBlockRef": m[11].strip(),
            "viewingYear": m[12].strip(),
            "grade": grade,
        })

    return harvests


def calculate_farming_year(date_str: str, start_month: int = 8) -> int:
    """Calculate farming year from date string. Month >= start_month → year, else year-1."""
    try:
        # Parse various date formats
        dt = datetime.fromisoformat(date_str.replace("+00", "+00:00").replace(" ", "T"))
        if dt.month >= start_month:
            return dt.year
        else:
            return dt.year - 1
    except Exception:
        return 2024  # Fallback


def map_quality_grade(grade: str | None) -> str:
    """Map old grade to new QualityGrade enum. Null defaults to B."""
    if grade == "A":
        return "A"
    elif grade == "B":
        return "B"
    else:
        return "B"  # Default null/unknown to B


def main():
    print("=== Harvest Migration Script ===\n")

    # 1. Parse SQL
    print("1. Parsing harvest_reports SQL...")
    harvests = parse_harvests(SQL_FILE)
    print(f"   Parsed {len(harvests)} harvest records\n")

    # 2. Generate mongosh script to get block mappings
    print("2. Generating migration JS for mongosh...")

    # Build the migration data as JSON for mongosh to process
    migration_data = []
    for h in harvests:
        migration_data.append({
            "ref": h["ref"],
            "blockCode": h["blockId"],
            "mainBlock": h["mainBlock"],
            "quantity": h["quantity"],
            "grade": map_quality_grade(h["grade"]),
            "gradeOriginal": h["grade"],
            "time": h["time"],
            "farmingYear": calculate_farming_year(h["time"]),
            "crop": h["crop"],
            "farm": h["farm"],
            "reporter": h["reporterUser"],
            "season": h["harvestSeason"],
            "viewingYear": h["viewingYear"],
            "farmBlockRef": h["farmBlockRef"],
            "mainBlockRef": h["mainBlockRef"],
        })

    # Write migration data as JSON
    with open("/tmp/harvest_migration_data.json", "w") as f:
        json.dump(migration_data, f)

    print(f"   Wrote {len(migration_data)} records to /tmp/harvest_migration_data.json")

    # Generate the mongosh script
    mongosh_script = """
// Harvest Migration Script - Run via mongosh
// Reads /tmp/harvest_migration_data.json and inserts into block_harvests

const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/tmp/harvest_migration_data.json', 'utf8'));
print('Loaded ' + data.length + ' harvest records');

// Build block mapping: legacyBlockCode (trimmed) -> { blockId, farmId, blockCategory }
const blockMap = {};
db.blocks.find(
  { legacyBlockCode: { $ne: null } },
  { blockId: 1, farmId: 1, legacyBlockCode: 1, blockCategory: 1, _id: 0 }
).forEach(b => {
  blockMap[b.legacyBlockCode.trim()] = {
    blockId: b.blockId,
    farmId: b.farmId,
    blockCategory: b.blockCategory
  };
});
print('Loaded ' + Object.keys(blockMap).length + ' block mappings');

// Get active virtual block codes (set)
const activeVirtualCodes = new Set();
db.blocks.find(
  { blockCategory: 'virtual', legacyBlockCode: { $ne: null } },
  { legacyBlockCode: 1, _id: 0 }
).forEach(b => {
  activeVirtualCodes.add(b.legacyBlockCode.trim());
});
print('Active virtual blocks: ' + activeVirtualCodes.size);

const ADMIN_USER_ID = 'bff26b8f-5ce9-49b2-9126-86174eaea823';
const ADMIN_EMAIL = 'admin@a64platform.com';
const MIGRATION_TIME = new Date().toISOString();

let virtualCount = 0;
let physicalCount = 0;
let skippedCount = 0;
const bulkOps = [];
const blockKpiUpdates = {}; // blockId -> { actualYieldKg, totalHarvests }

for (const h of data) {
  let targetBlockId = null;
  let targetFarmId = null;

  // Step 1: Check if blockCode matches an active virtual block
  if (activeVirtualCodes.has(h.blockCode) && blockMap[h.blockCode]) {
    targetBlockId = blockMap[h.blockCode].blockId;
    targetFarmId = blockMap[h.blockCode].farmId;
    virtualCount++;
  }
  // Step 2: Otherwise, assign to physical block via mainBlock
  else if (blockMap[h.mainBlock]) {
    targetBlockId = blockMap[h.mainBlock].blockId;
    targetFarmId = blockMap[h.mainBlock].farmId;
    physicalCount++;
  }
  // Step 3: Skip if no match
  else {
    skippedCount++;
    continue;
  }

  // Build harvest document
  const harvestId = UUID().toString().replace(/^UUID\\("(.*)"\\)$/, '$1');
  const doc = {
    harvestId: harvestId,
    blockId: targetBlockId,
    farmId: targetFarmId,
    harvestDate: new Date(h.time),
    quantityKg: h.quantity,
    qualityGrade: h.grade,
    farmingYear: h.farmingYear,
    recordedBy: ADMIN_USER_ID,
    recordedByEmail: h.reporter || ADMIN_EMAIL,
    notes: null,
    createdAt: new Date(),
    metadata: {
      migratedFrom: 'harvest_reports_sql',
      migratedAt: MIGRATION_TIME,
      oldRef: h.ref,
      oldFarmBlockRef: h.farmBlockRef,
      harvestSeason: parseInt(h.season) || null,
      viewingYear: parseInt(h.viewingYear) || null,
      crop: h.crop,
      mainBlock: h.mainBlock,
      legacyBlockCode: h.blockCode,
      originalGrade: h.gradeOriginal
    }
  };

  bulkOps.push({ insertOne: { document: doc } });

  // Track KPI updates per block
  if (!blockKpiUpdates[targetBlockId]) {
    blockKpiUpdates[targetBlockId] = { actualYieldKg: 0, totalHarvests: 0 };
  }
  blockKpiUpdates[targetBlockId].actualYieldKg += h.quantity;
  blockKpiUpdates[targetBlockId].totalHarvests += 1;
}

print('\\n=== Assignment Summary ===');
print('Virtual block harvests: ' + virtualCount);
print('Physical block harvests: ' + physicalCount);
print('Skipped (no match): ' + skippedCount);
print('Total to insert: ' + bulkOps.length);

// Insert harvests in batches of 1000
print('\\nInserting harvests...');
const BATCH_SIZE = 1000;
let inserted = 0;
for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
  const batch = bulkOps.slice(i, i + BATCH_SIZE);
  const result = db.block_harvests.bulkWrite(batch, { ordered: false });
  inserted += result.insertedCount;
  print('  Batch ' + Math.floor(i/BATCH_SIZE + 1) + ': inserted ' + result.insertedCount);
}
print('Total inserted: ' + inserted);

// Update block KPIs
print('\\nUpdating block KPIs...');
let kpiUpdated = 0;
for (const [blockId, kpi] of Object.entries(blockKpiUpdates)) {
  // Get current block to check predictedYieldKg
  const block = db.blocks.findOne({ blockId: blockId }, { 'kpi.predictedYieldKg': 1, _id: 0 });
  const predictedYield = block?.kpi?.predictedYieldKg || 0;
  const efficiency = predictedYield > 0 ? (kpi.actualYieldKg / predictedYield) * 100 : 0;

  db.blocks.updateOne(
    { blockId: blockId },
    {
      $set: {
        'kpi.actualYieldKg': Math.round(kpi.actualYieldKg * 100) / 100,
        'kpi.totalHarvests': kpi.totalHarvests,
        'kpi.yieldEfficiencyPercent': Math.round(efficiency * 100) / 100
      }
    }
  );
  kpiUpdated++;
}
print('Updated KPIs for ' + kpiUpdated + ' blocks');

// Verify
print('\\n=== Verification ===');
print('Total harvest records in collection: ' + db.block_harvests.countDocuments());
print('Harvests for virtual blocks: ' + db.block_harvests.countDocuments({
  blockId: { $in: Array.from(activeVirtualCodes).filter(c => blockMap[c]).map(c => blockMap[c].blockId) }
}));

// Sample
print('\\nSample harvest record:');
printjson(db.block_harvests.findOne({}, { _id: 0 }));
"""

    with open("/tmp/harvest_migration.js", "w") as f:
        f.write(mongosh_script)

    print("   Wrote mongosh script to /tmp/harvest_migration.js")
    print("\n3. Run with:")
    print("   docker exec a64core-mongodb-dev mongosh mongodb://localhost:27017/a64core_db /tmp/harvest_migration.js")


if __name__ == "__main__":
    main()
