"""
Migration Script: Populate actualPlantCount for Virtual Blocks

Problem: actualPlantCount field is missing/null for all virtual blocks
Solution: Set actualPlantCount = maxPlants for all planted/active blocks

For blocks in these states, actualPlantCount should equal maxPlants:
- planted, growing, fruiting, harvesting, cleaning

For empty/planned blocks, actualPlantCount stays at 0.

Author: Migration Script
Date: 2026-01-27
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Database connection
MONGODB_URI = "mongodb://localhost:27017"
DATABASE_NAME = "a64core_db"

# States where plants are actually in the ground
PLANTED_STATES = ['planted', 'growing', 'fruiting', 'harvesting', 'cleaning']


async def populate_actual_plant_count(db) -> dict:
    """
    Populate actualPlantCount for all virtual blocks based on their state.
    """
    logger.info("Starting: Populate actualPlantCount for virtual blocks...")

    # Update all virtual blocks in planted states: set actualPlantCount = maxPlants
    result = await db.blocks.update_many(
        {
            "blockCategory": "virtual",
            "state": {"$in": PLANTED_STATES},
            "maxPlants": {"$gt": 0}
        },
        [
            {
                "$set": {
                    "actualPlantCount": "$maxPlants",
                    "updatedAt": datetime.utcnow()
                }
            }
        ]
    )

    planted_updated = result.modified_count
    logger.info(f"Updated {planted_updated} virtual blocks in planted states")

    # For empty/planned blocks, ensure actualPlantCount is 0
    result_empty = await db.blocks.update_many(
        {
            "blockCategory": "virtual",
            "state": {"$in": ["empty", "planned"]},
        },
        {
            "$set": {
                "actualPlantCount": 0,
                "updatedAt": datetime.utcnow()
            }
        }
    )

    empty_updated = result_empty.modified_count
    logger.info(f"Updated {empty_updated} virtual blocks in empty/planned states")

    return {
        "planted_blocks_updated": planted_updated,
        "empty_blocks_updated": empty_updated,
        "total_updated": planted_updated + empty_updated
    }


async def verify_results(db) -> dict:
    """Verify the migration results."""
    logger.info("Verifying results...")

    # Count blocks with actualPlantCount set
    with_count = await db.blocks.count_documents({
        "blockCategory": "virtual",
        "actualPlantCount": {"$gt": 0}
    })

    without_count = await db.blocks.count_documents({
        "blockCategory": "virtual",
        "$or": [
            {"actualPlantCount": None},
            {"actualPlantCount": {"$exists": False}}
        ]
    })

    # Get sample of updated blocks
    samples = await db.blocks.find(
        {"blockCategory": "virtual", "actualPlantCount": {"$gt": 0}},
        {"blockCode": 1, "state": 1, "actualPlantCount": 1, "maxPlants": 1, "targetCropName": 1}
    ).limit(5).to_list(length=None)

    logger.info("=" * 60)
    logger.info("ACTUAL PLANT COUNT POPULATION RESULTS")
    logger.info("=" * 60)
    logger.info(f"Virtual blocks with actualPlantCount > 0: {with_count}")
    logger.info(f"Virtual blocks without actualPlantCount: {without_count}")

    logger.info("\nSample Updated Blocks:")
    for s in samples:
        logger.info(f"  {s.get('blockCode')}: {s.get('actualPlantCount')}/{s.get('maxPlants')} - {s.get('targetCropName')} ({s.get('state')})")

    logger.info("=" * 60)

    return {
        "blocks_with_count": with_count,
        "blocks_without_count": without_count
    }


async def run_migration():
    """Run the complete migration."""
    logger.info("=" * 60)
    logger.info("POPULATE ACTUAL PLANT COUNT MIGRATION")
    logger.info("=" * 60)

    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[DATABASE_NAME]

    try:
        # Populate actualPlantCount
        update_result = await populate_actual_plant_count(db)

        # Verify results
        verification = await verify_results(db)

        logger.info("\n" + "=" * 60)
        logger.info("MIGRATION COMPLETED")
        logger.info("=" * 60)
        logger.info(f"Total blocks updated: {update_result['total_updated']}")

        return {
            "success": True,
            "update_result": update_result,
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
