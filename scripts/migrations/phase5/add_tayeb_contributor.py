"""
Migration Script: Add Tayeb Contributor Info to Existing Plant Data

Only updates the existing migrated plant data records with contributor info.
Future plant data entries will have contributor as optional.

Contributor: Tayeb from Agrinova
- Email: tayeb@agrinovame.com
- Website: agrinovame.com
- Contributed: January 2024

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

# Tayeb's contributor information
TAYEB_CONTRIBUTOR = {
    "name": "Tayeb",
    "organization": "Agrinova",
    "email": "tayeb@agrinovame.com",
    "website": "agrinovame.com",
    "contributedAt": "January 2024"
}


async def add_contributor_to_plant_data(db) -> dict:
    """
    Add Tayeb's contributor info to all existing plant_data records.
    """
    logger.info("Adding contributor info to plant_data collection...")

    result = await db.plant_data.update_many(
        {"contributor": {"$exists": False}},  # Only records without contributor
        {
            "$set": {
                "contributor": TAYEB_CONTRIBUTOR,
                "updatedAt": datetime.now(timezone.utc)
            }
        }
    )

    logger.info(f"Updated {result.modified_count} plant_data records")
    return {"plant_data_updated": result.modified_count}


async def add_contributor_to_plant_data_enhanced(db) -> dict:
    """
    Add Tayeb's contributor info to all existing plant_data_enhanced records.
    """
    logger.info("Adding contributor info to plant_data_enhanced collection...")

    # Check if collection exists and has records
    count = await db.plant_data_enhanced.count_documents({})
    if count == 0:
        logger.info("No plant_data_enhanced records found")
        return {"plant_data_enhanced_updated": 0}

    result = await db.plant_data_enhanced.update_many(
        {
            "$or": [
                {"contributor": {"$exists": False}},
                {"contributor": {"$type": "string"}}  # Update string contributors to object
            ]
        },
        {
            "$set": {
                "contributor": TAYEB_CONTRIBUTOR,
                "updatedAt": datetime.now(timezone.utc)
            }
        }
    )

    logger.info(f"Updated {result.modified_count} plant_data_enhanced records")
    return {"plant_data_enhanced_updated": result.modified_count}


async def verify_results(db) -> dict:
    """Verify the migration results."""
    logger.info("Verifying results...")

    # Count plant_data with contributor
    plant_data_with = await db.plant_data.count_documents({
        "contributor": {"$exists": True}
    })
    plant_data_total = await db.plant_data.count_documents({})

    # Sample record
    sample = await db.plant_data.find_one(
        {"contributor": {"$exists": True}},
        {"plantName": 1, "contributor": 1}
    )

    logger.info("=" * 60)
    logger.info("CONTRIBUTOR MIGRATION RESULTS")
    logger.info("=" * 60)
    logger.info(f"plant_data: {plant_data_with}/{plant_data_total} records have contributor")

    if sample:
        logger.info(f"\nSample Record:")
        logger.info(f"  Plant: {sample.get('plantName')}")
        logger.info(f"  Contributor: {sample.get('contributor')}")

    logger.info("=" * 60)

    return {
        "plant_data_with_contributor": plant_data_with,
        "plant_data_total": plant_data_total
    }


async def run_migration():
    """Run the complete migration."""
    logger.info("=" * 60)
    logger.info("ADD TAYEB CONTRIBUTOR MIGRATION")
    logger.info("=" * 60)
    logger.info(f"Contributor: {TAYEB_CONTRIBUTOR}")

    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[DATABASE_NAME]

    try:
        # Update plant_data
        result1 = await add_contributor_to_plant_data(db)

        # Update plant_data_enhanced (if exists)
        result2 = await add_contributor_to_plant_data_enhanced(db)

        # Verify
        verification = await verify_results(db)

        logger.info("\n" + "=" * 60)
        logger.info("MIGRATION COMPLETED")
        logger.info("=" * 60)

        return {
            "success": True,
            "plant_data": result1,
            "plant_data_enhanced": result2,
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
