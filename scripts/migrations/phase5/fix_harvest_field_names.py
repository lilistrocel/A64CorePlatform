"""
Migration Script: Fix Harvest Field Names

Problem: block_harvests collection has legacy field names that don't match
the expected BlockHarvest model schema.

Legacy fields -> Expected fields:
- quantity -> quantityKg
- grade -> qualityGrade
- harvestTime -> harvestDate
- reporterEmail -> recordedByEmail

Also:
- Set default qualityGrade to "B" for null grades
- Link remaining harvests with null blockId to virtual blocks

Author: Migration Script
Date: 2026-01-27
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Database connection
MONGODB_URI = "mongodb://localhost:27017"
DATABASE_NAME = "a64core_db"


async def rename_harvest_fields(db) -> dict:
    """
    Rename legacy field names to match expected schema.
    """
    logger.info("Renaming harvest fields...")

    # Rename fields using aggregation pipeline update
    result = await db.block_harvests.update_many(
        {"quantity": {"$exists": True}},  # Only records with old field names
        [
            {
                "$set": {
                    "quantityKg": "$quantity",
                    "qualityGrade": {"$ifNull": ["$grade", "B"]},  # Default to B if null
                    "harvestDate": "$harvestTime",
                    "recordedByEmail": "$reporterEmail",
                    "farmId": {"$ifNull": ["$farmId", None]},  # Will be set later
                    "recordedBy": None,  # Will be set if needed
                    "notes": None,
                    "metadata": {
                        "crop": "$cropName",
                        "legacyBlockCode": "$legacyBlockCode",
                        "season": "$season",
                        "viewingYear": "$viewingYear",
                        "migratedAt": datetime.now(timezone.utc)
                    }
                }
            }
        ]
    )

    logger.info(f"Renamed fields in {result.modified_count} harvest records")
    return {"fields_renamed": result.modified_count}


async def link_remaining_harvests_to_blocks(db) -> dict:
    """
    Link harvests with null blockId to virtual blocks via physicalBlockId.
    """
    logger.info("Linking harvests with null blockId to virtual blocks...")

    # Get harvests with null blockId but have physicalBlockId
    harvests_to_link = await db.block_harvests.find(
        {
            "blockId": None,
            "physicalBlockId": {"$ne": None}
        },
        {"harvestId": 1, "physicalBlockId": 1, "cropName": 1}
    ).to_list(length=None)

    logger.info(f"Found {len(harvests_to_link)} harvests to link")

    linked_count = 0
    for harvest in harvests_to_link:
        physical_block_id = harvest["physicalBlockId"]
        crop_name = harvest.get("cropName", "")

        # Find virtual blocks under this physical block
        virtual_blocks = await db.blocks.find(
            {
                "parentBlockId": physical_block_id,
                "blockCategory": "virtual"
            },
            {"blockId": 1, "targetCropName": 1}
        ).to_list(length=None)

        if not virtual_blocks:
            continue

        # Match by crop name if possible, otherwise use first virtual block
        matched_block = None
        for vblock in virtual_blocks:
            if vblock.get("targetCropName") == crop_name:
                matched_block = vblock
                break

        if not matched_block:
            matched_block = virtual_blocks[0]

        # Update the harvest with the virtual block ID
        await db.block_harvests.update_one(
            {"harvestId": harvest["harvestId"]},
            {"$set": {"blockId": matched_block["blockId"]}}
        )
        linked_count += 1

    logger.info(f"Linked {linked_count} harvests to virtual blocks")
    return {"harvests_linked": linked_count}


async def set_farm_ids(db) -> dict:
    """
    Set farmId on harvests that are missing it.
    """
    logger.info("Setting farmId on harvests...")

    # Get harvests missing farmId
    harvests_missing_farm = await db.block_harvests.find(
        {
            "farmId": None,
            "blockId": {"$ne": None}
        },
        {"harvestId": 1, "blockId": 1}
    ).to_list(length=None)

    logger.info(f"Found {len(harvests_missing_farm)} harvests missing farmId")

    updated_count = 0
    for harvest in harvests_missing_farm:
        block_id = harvest["blockId"]

        # Get farmId from the block
        block = await db.blocks.find_one(
            {"blockId": block_id},
            {"farmId": 1}
        )

        if block and block.get("farmId"):
            await db.block_harvests.update_one(
                {"harvestId": harvest["harvestId"]},
                {"$set": {"farmId": block["farmId"]}}
            )
            updated_count += 1

    logger.info(f"Updated farmId on {updated_count} harvests")
    return {"farm_ids_set": updated_count}


async def verify_results(db) -> dict:
    """Verify the migration results."""
    logger.info("Verifying results...")

    # Count records with new field names
    with_new_fields = await db.block_harvests.count_documents({"quantityKg": {"$exists": True}})
    with_old_fields = await db.block_harvests.count_documents({
        "quantity": {"$exists": True},
        "quantityKg": {"$exists": False}
    })

    # Count records with blockId
    with_block_id = await db.block_harvests.count_documents({"blockId": {"$ne": None}})
    without_block_id = await db.block_harvests.count_documents({"blockId": None})

    # Count records with farmId
    with_farm_id = await db.block_harvests.count_documents({"farmId": {"$ne": None}})

    # Sample record
    sample = await db.block_harvests.find_one(
        {"quantityKg": {"$exists": True}},
        {"harvestId": 1, "blockId": 1, "quantityKg": 1, "qualityGrade": 1, "harvestDate": 1, "farmId": 1}
    )

    logger.info("=" * 60)
    logger.info("HARVEST FIELD MIGRATION RESULTS")
    logger.info("=" * 60)
    logger.info(f"Records with new field names: {with_new_fields}")
    logger.info(f"Records with old field names only: {with_old_fields}")
    logger.info(f"Records with blockId: {with_block_id}")
    logger.info(f"Records without blockId: {without_block_id}")
    logger.info(f"Records with farmId: {with_farm_id}")

    if sample:
        logger.info(f"\nSample Record:")
        logger.info(f"  harvestId: {sample.get('harvestId')}")
        logger.info(f"  blockId: {sample.get('blockId')}")
        logger.info(f"  quantityKg: {sample.get('quantityKg')}")
        logger.info(f"  qualityGrade: {sample.get('qualityGrade')}")
        logger.info(f"  harvestDate: {sample.get('harvestDate')}")
        logger.info(f"  farmId: {sample.get('farmId')}")

    logger.info("=" * 60)

    return {
        "with_new_fields": with_new_fields,
        "with_old_fields": with_old_fields,
        "with_block_id": with_block_id,
        "without_block_id": without_block_id,
        "with_farm_id": with_farm_id
    }


async def run_migration():
    """Run the complete migration."""
    logger.info("=" * 60)
    logger.info("HARVEST FIELD NAMES MIGRATION")
    logger.info("=" * 60)

    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[DATABASE_NAME]

    try:
        # Step 1: Rename fields
        rename_result = await rename_harvest_fields(db)

        # Step 2: Link harvests to virtual blocks
        link_result = await link_remaining_harvests_to_blocks(db)

        # Step 3: Set farm IDs
        farm_result = await set_farm_ids(db)

        # Verify results
        verification = await verify_results(db)

        logger.info("\n" + "=" * 60)
        logger.info("MIGRATION COMPLETED")
        logger.info("=" * 60)

        return {
            "success": True,
            "rename_result": rename_result,
            "link_result": link_result,
            "farm_result": farm_result,
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
