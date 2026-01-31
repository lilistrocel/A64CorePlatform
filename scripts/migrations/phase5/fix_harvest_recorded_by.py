"""
Migration Script: Fix recordedBy Field for Migrated Harvests

Problem: The recordedBy field is null for migrated harvest records,
but the BlockHarvest model requires it to be a UUID.

Solution: Set recordedBy to admin user for all records with null recordedBy.

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

# Admin user ID for migrated records
ADMIN_USER_ID = "bff26b8f-5ce9-49b2-9126-86174eaea823"
ADMIN_EMAIL = "admin@a64platform.com"


async def fix_recorded_by(db) -> dict:
    """
    Set recordedBy to admin user for all harvests with null recordedBy.
    """
    logger.info("Fixing recordedBy field for migrated harvests...")

    # Count records needing fix
    null_count = await db.block_harvests.count_documents({
        "$or": [
            {"recordedBy": None},
            {"recordedBy": {"$exists": False}}
        ]
    })
    logger.info(f"Found {null_count} harvests with null/missing recordedBy")

    if null_count == 0:
        return {"records_fixed": 0}

    # Update all records with null recordedBy
    result = await db.block_harvests.update_many(
        {
            "$or": [
                {"recordedBy": None},
                {"recordedBy": {"$exists": False}}
            ]
        },
        {
            "$set": {
                "recordedBy": ADMIN_USER_ID,
                "metadata.recordedByMigratedAt": datetime.now(timezone.utc)
            }
        }
    )

    logger.info(f"Updated {result.modified_count} harvest records with admin recordedBy")
    return {"records_fixed": result.modified_count}


async def verify_results(db) -> dict:
    """Verify the migration results."""
    logger.info("Verifying results...")

    # Count records by recordedBy status
    with_recorded_by = await db.block_harvests.count_documents({
        "recordedBy": {"$ne": None}
    })
    without_recorded_by = await db.block_harvests.count_documents({
        "$or": [
            {"recordedBy": None},
            {"recordedBy": {"$exists": False}}
        ]
    })

    # Sample record
    sample = await db.block_harvests.find_one(
        {"recordedBy": ADMIN_USER_ID},
        {"harvestId": 1, "blockId": 1, "recordedBy": 1, "recordedByEmail": 1, "quantityKg": 1}
    )

    logger.info("=" * 60)
    logger.info("RECORDED BY FIX RESULTS")
    logger.info("=" * 60)
    logger.info(f"Records with recordedBy: {with_recorded_by}")
    logger.info(f"Records without recordedBy: {without_recorded_by}")

    if sample:
        logger.info(f"\nSample Record:")
        logger.info(f"  harvestId: {sample.get('harvestId')}")
        logger.info(f"  blockId: {sample.get('blockId')}")
        logger.info(f"  recordedBy: {sample.get('recordedBy')}")
        logger.info(f"  recordedByEmail: {sample.get('recordedByEmail')}")
        logger.info(f"  quantityKg: {sample.get('quantityKg')}")

    logger.info("=" * 60)

    return {
        "with_recorded_by": with_recorded_by,
        "without_recorded_by": without_recorded_by
    }


async def run_migration():
    """Run the complete migration."""
    logger.info("=" * 60)
    logger.info("FIX HARVEST RECORDED BY MIGRATION")
    logger.info("=" * 60)
    logger.info(f"Using admin user: {ADMIN_USER_ID}")

    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[DATABASE_NAME]

    try:
        # Fix recordedBy
        fix_result = await fix_recorded_by(db)

        # Verify results
        verification = await verify_results(db)

        logger.info("\n" + "=" * 60)
        logger.info("MIGRATION COMPLETED")
        logger.info("=" * 60)

        return {
            "success": True,
            "fix_result": fix_result,
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
