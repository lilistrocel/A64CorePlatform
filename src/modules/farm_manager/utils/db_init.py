"""
Database Initialization Utility

Initializes database indexes and collections for the farm management module.
"""

import asyncio
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, TEXT
from pymongo.errors import OperationFailure

logger = logging.getLogger(__name__)


class DatabaseInitializer:
    """Database initialization and index creation"""

    @staticmethod
    async def create_plant_data_enhanced_indexes(db) -> int:
        """
        Create all indexes for plant_data_enhanced collection.

        Args:
            db: MongoDB database instance

        Returns:
            Number of indexes created

        Raises:
            OperationFailure: If index creation fails
        """
        collection = db.plant_data_enhanced
        indexes_created = 0

        logger.info("[DB Init] Creating indexes for plant_data_enhanced collection...")

        # Index definitions with their configurations
        indexes = [
            # 1. Primary Key Index (Unique)
            {
                "keys": [("plantDataId", ASCENDING)],
                "name": "idx_plant_data_plant_data_id",
                "unique": True
            },
            # 2. Plant Name Index
            {
                "keys": [("plantName", ASCENDING)],
                "name": "idx_plant_data_plant_name"
            },
            # 3. Scientific Name Index (Unique, Partial)
            {
                "keys": [("scientificName", ASCENDING)],
                "name": "idx_plant_data_scientific_name",
                "unique": True,
                "partialFilterExpression": {"scientificName": {"$exists": True, "$ne": None}}
            },
            # 4. Farm Type Compatibility Index
            {
                "keys": [("farmTypeCompatibility", ASCENDING)],
                "name": "idx_plant_data_farm_type_compatibility"
            },
            # 5. Tags Index
            {
                "keys": [("tags", ASCENDING)],
                "name": "idx_plant_data_tags"
            },
            # 6. Growth Cycle Duration Index
            {
                "keys": [("growthCycle.totalCycleDays", ASCENDING)],
                "name": "idx_plant_data_growth_cycle_total"
            },
            # 7. Soft Delete Index (Sparse)
            {
                "keys": [("deletedAt", ASCENDING)],
                "name": "idx_plant_data_deleted_at",
                "sparse": True
            },
            # 8. Created By User Index (Compound)
            {
                "keys": [("createdBy", ASCENDING), ("createdAt", DESCENDING)],
                "name": "idx_plant_data_created_by_created_at"
            },
            # 9. Active Records Index (Compound)
            {
                "keys": [("deletedAt", ASCENDING), ("updatedAt", DESCENDING)],
                "name": "idx_plant_data_deleted_at_updated_at"
            },
            # 10. Text Search Index (Weighted)
            {
                "keys": [
                    ("plantName", TEXT),
                    ("scientificName", TEXT),
                    ("tags", TEXT),
                    ("additionalInfo.notes", TEXT)
                ],
                "name": "idx_plant_data_text_search",
                "weights": {
                    "plantName": 10,
                    "scientificName": 8,
                    "tags": 5,
                    "additionalInfo.notes": 1
                }
            }
        ]

        # Create each index
        for idx_config in indexes:
            try:
                # Extract keys and options
                keys = idx_config.pop("keys")
                await collection.create_index(keys, **idx_config)
                logger.info(f"[DB Init] ✅ Created index: {idx_config['name']}")
                indexes_created += 1
            except OperationFailure as e:
                if "already exists" in str(e):
                    logger.info(f"[DB Init] ⏭️  Skipped index (already exists): {idx_config['name']}")
                else:
                    logger.error(f"[DB Init] ❌ Failed to create index {idx_config['name']}: {e}")
                    raise

        logger.info(f"[DB Init] ✅ Created {indexes_created} indexes for plant_data_enhanced")
        return indexes_created

    @staticmethod
    async def create_legacy_plant_data_indexes(db) -> int:
        """
        Create indexes for legacy plant_data collection.

        Args:
            db: MongoDB database instance

        Returns:
            Number of indexes created
        """
        collection = db.plant_data
        indexes_created = 0

        logger.info("[DB Init] Creating indexes for plant_data collection (legacy)...")

        indexes = [
            # 1. Primary Key
            {
                "keys": [("plantDataId", ASCENDING)],
                "name": "idx_plant_data_plant_data_id",
                "unique": True
            },
            # 2. Plant Name
            {
                "keys": [("plantName", ASCENDING)],
                "name": "idx_plant_data_plant_name"
            },
            # 3. Scientific Name
            {
                "keys": [("scientificName", ASCENDING)],
                "name": "idx_plant_data_scientific_name"
            },
            # 4. Tags
            {
                "keys": [("tags", ASCENDING)],
                "name": "idx_plant_data_tags"
            },
            # 5. Created By
            {
                "keys": [("createdBy", ASCENDING), ("createdAt", DESCENDING)],
                "name": "idx_plant_data_created_by_created_at"
            }
        ]

        for idx_config in indexes:
            try:
                keys = idx_config.pop("keys")
                await collection.create_index(keys, **idx_config)
                logger.info(f"[DB Init] ✅ Created index: {idx_config['name']}")
                indexes_created += 1
            except OperationFailure as e:
                if "already exists" in str(e):
                    logger.info(f"[DB Init] ⏭️  Skipped index (already exists): {idx_config['name']}")
                else:
                    logger.error(f"[DB Init] ❌ Failed to create index {idx_config['name']}: {e}")
                    raise

        logger.info(f"[DB Init] ✅ Created {indexes_created} indexes for plant_data")
        return indexes_created

    @staticmethod
    async def initialize_all(db) -> dict:
        """
        Initialize all indexes for the farm management module.

        Args:
            db: MongoDB database instance

        Returns:
            Dictionary with initialization results
        """
        logger.info("[DB Init] Starting database initialization...")

        results = {
            "plant_data_enhanced_indexes": 0,
            "plant_data_legacy_indexes": 0,
            "total_indexes": 0,
            "success": True,
            "errors": []
        }

        try:
            # Create enhanced plant data indexes
            results["plant_data_enhanced_indexes"] = await DatabaseInitializer.create_plant_data_enhanced_indexes(db)

            # Create legacy plant data indexes
            results["plant_data_legacy_indexes"] = await DatabaseInitializer.create_legacy_plant_data_indexes(db)

            # Calculate total
            results["total_indexes"] = (
                results["plant_data_enhanced_indexes"] +
                results["plant_data_legacy_indexes"]
            )

            logger.info(f"[DB Init] ✅ Database initialization complete. Total indexes: {results['total_indexes']}")

        except Exception as e:
            results["success"] = False
            results["errors"].append(str(e))
            logger.error(f"[DB Init] ❌ Database initialization failed: {e}")
            raise

        return results


async def run_initialization(mongo_uri: str = "mongodb://localhost:27017", db_name: str = "farm_management_db"):
    """
    Run database initialization script.

    Args:
        mongo_uri: MongoDB connection URI
        db_name: Database name

    Returns:
        Initialization results
    """
    client = AsyncIOMotorClient(mongo_uri)
    db = client[db_name]

    try:
        results = await DatabaseInitializer.initialize_all(db)
        return results
    finally:
        client.close()


if __name__ == "__main__":
    # Run initialization when executed directly
    import sys
    import os

    # Get MongoDB URI from environment or use default
    mongo_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    db_name = os.getenv("MONGODB_DB_NAME", "farm_management_db")

    print(f"🚀 Starting database initialization...")
    print(f"   MongoDB URI: {mongo_uri}")
    print(f"   Database: {db_name}\n")

    results = asyncio.run(run_initialization(mongo_uri, db_name))

    if results["success"]:
        print(f"\n✅ Initialization successful!")
        print(f"   Enhanced indexes: {results['plant_data_enhanced_indexes']}")
        print(f"   Legacy indexes: {results['plant_data_legacy_indexes']}")
        print(f"   Total indexes: {results['total_indexes']}")
        sys.exit(0)
    else:
        print(f"\n❌ Initialization failed!")
        print(f"   Errors: {results['errors']}")
        sys.exit(1)
