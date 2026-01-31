"""
Migration Script: Link Harvests to Virtual Blocks and Calculate KPIs

This script:
1. Links 4,431 harvests to virtual blocks by matching physicalBlockId + cropName
2. Calculates and updates virtual block KPIs from linked harvests
3. Calculates historicalKpi for physical blocks from unmatched harvests (completed cycles)

Author: Migration Script
Date: 2026-01-27
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from typing import Dict, List, Optional
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Database connection
MONGODB_URI = "mongodb://localhost:27017"
DATABASE_NAME = "a64core_db"


async def link_harvests_to_virtual_blocks(db) -> Dict:
    """
    Link harvests to virtual blocks by matching:
    harvest.physicalBlockId + harvest.cropName → block.parentBlockId + block.targetCropName

    Updates harvest.blockId to point to the matching virtual block.
    """
    logger.info("Starting: Link harvests to virtual blocks...")

    # Get all virtual blocks with their parent and crop info
    virtual_blocks = await db.blocks.find({
        "blockCategory": "virtual",
        "isActive": True
    }).to_list(length=None)

    # Create lookup map: (parentBlockId, targetCropName) -> blockId
    block_lookup = {}
    for block in virtual_blocks:
        key = (str(block.get("parentBlockId")), block.get("targetCropName"))
        if key not in block_lookup:
            block_lookup[key] = str(block.get("blockId"))

    logger.info(f"Created lookup with {len(block_lookup)} unique (parent, crop) combinations")

    # Find and update harvests
    linked_count = 0
    unlinked_count = 0

    # Process in batches
    cursor = db.block_harvests.find({"blockId": None})
    batch_size = 500
    updates = []

    async for harvest in cursor:
        phys_block_id = harvest.get("physicalBlockId")
        crop_name = harvest.get("cropName")

        key = (phys_block_id, crop_name)
        virtual_block_id = block_lookup.get(key)

        if virtual_block_id:
            updates.append({
                "filter": {"_id": harvest["_id"]},
                "update": {"$set": {
                    "blockId": virtual_block_id,
                    "updatedAt": datetime.utcnow()
                }}
            })
            linked_count += 1
        else:
            unlinked_count += 1

        # Batch update
        if len(updates) >= batch_size:
            await execute_batch_update(db, updates)
            updates = []

    # Final batch
    if updates:
        await execute_batch_update(db, updates)

    logger.info(f"Linked {linked_count} harvests to virtual blocks")
    logger.info(f"Unlinked {unlinked_count} harvests (historical/no matching block)")

    return {"linked": linked_count, "unlinked": unlinked_count}


async def execute_batch_update(db, updates: List[Dict]):
    """Execute batch updates for harvests"""
    if not updates:
        return

    bulk_ops = [
        {"updateOne": {"filter": u["filter"], "update": u["update"]}}
        for u in updates
    ]

    result = await db.command({
        "update": "block_harvests",
        "updates": [
            {"q": u["filter"], "u": u["update"]}
            for u in updates
        ]
    })
    logger.debug(f"Batch updated {len(updates)} harvests")


async def calculate_virtual_block_kpis(db) -> Dict:
    """
    Calculate and update KPIs for virtual blocks from their linked harvests.

    Updates:
    - kpi.actualYieldKg: sum of harvest quantities
    - kpi.totalHarvests: count of harvests
    - kpi.yieldEfficiencyPercent: (actual/predicted) * 100
    """
    logger.info("Starting: Calculate virtual block KPIs...")

    # Aggregate harvests by blockId
    pipeline = [
        {"$match": {"blockId": {"$ne": None}}},
        {"$group": {
            "_id": "$blockId",
            "totalYield": {"$sum": "$quantity"},
            "harvestCount": {"$sum": 1}
        }}
    ]

    harvest_stats = await db.block_harvests.aggregate(pipeline).to_list(length=None)
    logger.info(f"Found harvest stats for {len(harvest_stats)} virtual blocks")

    updated_count = 0

    for stat in harvest_stats:
        block_id = stat["_id"]
        total_yield = stat["totalYield"] or 0
        harvest_count = stat["harvestCount"] or 0

        # Get block to check predicted yield
        block = await db.blocks.find_one({"blockId": block_id})
        if not block:
            continue

        predicted = block.get("kpi", {}).get("predictedYieldKg", 0) or 0
        efficiency = (total_yield / predicted * 100) if predicted > 0 else 0

        # Update block KPIs
        result = await db.blocks.update_one(
            {"blockId": block_id},
            {"$set": {
                "kpi.actualYieldKg": round(total_yield, 2),
                "kpi.totalHarvests": harvest_count,
                "kpi.yieldEfficiencyPercent": round(efficiency, 1),
                "updatedAt": datetime.utcnow()
            }}
        )

        if result.modified_count > 0:
            updated_count += 1

    logger.info(f"Updated KPIs for {updated_count} virtual blocks")
    return {"updated": updated_count}


async def calculate_physical_block_historical_kpis(db) -> Dict:
    """
    Calculate historicalKpi for physical blocks from unmatched harvests.

    Unmatched harvests = harvests where blockId is still null (completed cycles
    that don't have active virtual blocks).

    Updates physical block's historicalKpi:
    - totalYieldKg: sum of all unmatched harvests for this physical block
    - totalHarvests: count of unmatched harvests
    - completedCycles: estimated from unique crop names
    - avgYieldPerCycle: totalYield / completedCycles
    """
    logger.info("Starting: Calculate physical block historical KPIs...")

    # Aggregate unmatched harvests by physicalBlockId
    pipeline = [
        {"$match": {"blockId": None}},  # Only unmatched (historical) harvests
        {"$group": {
            "_id": "$physicalBlockId",
            "totalYield": {"$sum": "$quantity"},
            "harvestCount": {"$sum": 1},
            "uniqueCrops": {"$addToSet": "$cropName"}  # Count unique crop cycles
        }}
    ]

    historical_stats = await db.block_harvests.aggregate(pipeline).to_list(length=None)
    logger.info(f"Found historical stats for {len(historical_stats)} physical blocks")

    updated_count = 0

    for stat in historical_stats:
        phys_block_id = stat["_id"]
        total_yield = stat["totalYield"] or 0
        harvest_count = stat["harvestCount"] or 0
        completed_cycles = len(stat.get("uniqueCrops", []))
        avg_yield = total_yield / completed_cycles if completed_cycles > 0 else 0

        # Update physical block's historicalKpi
        result = await db.blocks.update_one(
            {"blockId": phys_block_id, "blockCategory": "physical"},
            {"$set": {
                "historicalKpi": {
                    "totalYieldKg": round(total_yield, 2),
                    "totalHarvests": harvest_count,
                    "completedCycles": completed_cycles,
                    "avgYieldPerCycle": round(avg_yield, 2)
                },
                "updatedAt": datetime.utcnow()
            }}
        )

        if result.modified_count > 0:
            updated_count += 1

    logger.info(f"Updated historicalKpi for {updated_count} physical blocks")
    return {"updated": updated_count}


async def verify_migration(db) -> Dict:
    """Verify the migration results"""
    logger.info("Verifying migration results...")

    # Count linked harvests
    linked = await db.block_harvests.count_documents({"blockId": {"$ne": None}})
    unlinked = await db.block_harvests.count_documents({"blockId": None})

    # Count blocks with updated KPIs
    virtual_with_kpi = await db.blocks.count_documents({
        "blockCategory": "virtual",
        "kpi.totalHarvests": {"$gt": 0}
    })

    physical_with_historical = await db.blocks.count_documents({
        "blockCategory": "physical",
        "historicalKpi": {"$ne": None}
    })

    # Sample data
    sample_virtual = await db.blocks.find_one({
        "blockCategory": "virtual",
        "kpi.totalHarvests": {"$gt": 0}
    })

    sample_physical = await db.blocks.find_one({
        "blockCategory": "physical",
        "historicalKpi": {"$ne": None}
    })

    results = {
        "harvests_linked": linked,
        "harvests_unlinked": unlinked,
        "virtual_blocks_with_kpi": virtual_with_kpi,
        "physical_blocks_with_historical_kpi": physical_with_historical
    }

    logger.info("=" * 60)
    logger.info("MIGRATION VERIFICATION RESULTS")
    logger.info("=" * 60)
    logger.info(f"Harvests linked to virtual blocks: {linked}")
    logger.info(f"Harvests unlinked (historical): {unlinked}")
    logger.info(f"Virtual blocks with updated KPIs: {virtual_with_kpi}")
    logger.info(f"Physical blocks with historical KPIs: {physical_with_historical}")

    if sample_virtual:
        logger.info(f"\nSample Virtual Block KPI:")
        logger.info(f"  Block: {sample_virtual.get('blockCode')}")
        logger.info(f"  KPI: {sample_virtual.get('kpi')}")

    if sample_physical:
        logger.info(f"\nSample Physical Block Historical KPI:")
        logger.info(f"  Block: {sample_physical.get('blockCode')}")
        logger.info(f"  Historical KPI: {sample_physical.get('historicalKpi')}")

    logger.info("=" * 60)

    return results


async def run_migration():
    """Run the complete migration"""
    logger.info("=" * 60)
    logger.info("HARVEST TO BLOCK LINKAGE MIGRATION")
    logger.info("=" * 60)

    # Connect to database
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[DATABASE_NAME]

    try:
        # Step 1: Link harvests to virtual blocks
        link_result = await link_harvests_to_virtual_blocks(db)

        # Step 2: Calculate virtual block KPIs
        virtual_kpi_result = await calculate_virtual_block_kpis(db)

        # Step 3: Calculate physical block historical KPIs
        historical_kpi_result = await calculate_physical_block_historical_kpis(db)

        # Step 4: Verify results
        verification = await verify_migration(db)

        logger.info("\n" + "=" * 60)
        logger.info("MIGRATION COMPLETED SUCCESSFULLY")
        logger.info("=" * 60)

        return {
            "success": True,
            "link_result": link_result,
            "virtual_kpi_result": virtual_kpi_result,
            "historical_kpi_result": historical_kpi_result,
            "verification": verification
        }

    except Exception as e:
        logger.error(f"Migration failed: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}

    finally:
        client.close()


if __name__ == "__main__":
    result = asyncio.run(run_migration())
    print("\nFinal Result:", result)
