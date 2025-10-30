"""
Farm Management Module - Database Service

Manages MongoDB collections for the farm management module.
Uses A64Core's MongoDB connection.
"""

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ConnectionFailure
from typing import Optional
import logging

from ..config.settings import settings

logger = logging.getLogger(__name__)


class FarmDatabaseManager:
    """
    Farm module database manager

    Manages MongoDB collections for farm management:
    - farms
    - blocks
    - plant_data
    - plantings
    - daily_harvests
    - harvests
    - alerts
    - block_cycles
    - stock_inventory
    - farm_assignments
    """

    client: Optional[AsyncIOMotorClient] = None
    db = None

    @classmethod
    async def connect(cls) -> None:
        """
        Establish connection to MongoDB (A64Core database)

        Raises:
            ConnectionFailure: If unable to connect to MongoDB
        """
        try:
            logger.info(f"[Farm Module] Connecting to MongoDB at {settings.MONGODB_URL}")
            cls.client = AsyncIOMotorClient(
                settings.MONGODB_URL,
                maxPoolSize=50,
                minPoolSize=10,
                serverSelectionTimeoutMS=5000
            )

            # Verify connection
            await cls.client.admin.command('ping')

            cls.db = cls.client[settings.MONGODB_DB_NAME]
            logger.info(f"[Farm Module] Connected to MongoDB database: {settings.MONGODB_DB_NAME}")

            # Create indexes
            await cls._create_indexes()

        except ConnectionFailure as e:
            logger.error(f"[Farm Module] Failed to connect to MongoDB: {e}")
            raise
        except Exception as e:
            logger.error(f"[Farm Module] Unexpected error connecting to MongoDB: {e}")
            raise

    @classmethod
    async def _create_indexes(cls) -> None:
        """Create database indexes for farm management collections"""
        try:
            # Farms collection
            await cls.db.farms.create_index("farmId", unique=True)
            await cls.db.farms.create_index("managerId")
            await cls.db.farms.create_index("isActive")
            await cls.db.farms.create_index([("createdAt", -1)])

            # Blocks collection
            await cls.db.blocks.create_index("blockId", unique=True)
            await cls.db.blocks.create_index("farmId")
            await cls.db.blocks.create_index("state")
            await cls.db.blocks.create_index("currentPlanting")
            await cls.db.blocks.create_index("currentCycleId")
            await cls.db.blocks.create_index("estimatedHarvestDate")
            await cls.db.blocks.create_index([("createdAt", -1)])

            # Plant data collection
            await cls.db.plant_data.create_index("plantDataId", unique=True)
            await cls.db.plant_data.create_index("plantName")
            await cls.db.plant_data.create_index("plantType")
            await cls.db.plant_data.create_index("tags")
            await cls.db.plant_data.create_index([("createdAt", -1)])

            # Plantings collection
            await cls.db.plantings.create_index("plantingId", unique=True)
            await cls.db.plantings.create_index("blockId")
            await cls.db.plantings.create_index("farmId")
            await cls.db.plantings.create_index("status")
            await cls.db.plantings.create_index("estimatedHarvestStartDate")
            await cls.db.plantings.create_index([("createdAt", -1)])

            # Daily harvests collection
            await cls.db.daily_harvests.create_index("dailyHarvestId", unique=True)
            await cls.db.daily_harvests.create_index("cycleId")
            await cls.db.daily_harvests.create_index("plantingId")
            await cls.db.daily_harvests.create_index("blockId")
            await cls.db.daily_harvests.create_index("farmId")
            await cls.db.daily_harvests.create_index("harvestDate")
            await cls.db.daily_harvests.create_index([("createdAt", -1)])

            # Harvests collection (aggregated summaries)
            await cls.db.harvests.create_index("harvestId", unique=True)
            await cls.db.harvests.create_index("plantingId")
            await cls.db.harvests.create_index("blockId")
            await cls.db.harvests.create_index("farmId")
            await cls.db.harvests.create_index("cycleId")
            await cls.db.harvests.create_index([("harvestEndDate", -1)])
            await cls.db.harvests.create_index([("createdAt", -1)])

            # Alerts collection
            await cls.db.alerts.create_index("alertId", unique=True)
            await cls.db.alerts.create_index("cycleId")
            await cls.db.alerts.create_index("blockId")
            await cls.db.alerts.create_index("farmId")
            await cls.db.alerts.create_index("severity")
            await cls.db.alerts.create_index("status")
            await cls.db.alerts.create_index("triggeredBy")
            await cls.db.alerts.create_index([("triggeredAt", -1)])
            await cls.db.alerts.create_index("escalated")

            # Block cycles collection (CRITICAL for historical data)
            await cls.db.block_cycles.create_index("cycleId", unique=True)
            await cls.db.block_cycles.create_index("blockId")
            await cls.db.block_cycles.create_index("farmId")
            await cls.db.block_cycles.create_index("cycleNumber")
            await cls.db.block_cycles.create_index("plantingId")
            await cls.db.block_cycles.create_index("status")
            await cls.db.block_cycles.create_index([("createdAt", -1)])
            await cls.db.block_cycles.create_index([("completedAt", -1)])
            # Compound index for block history queries
            await cls.db.block_cycles.create_index([("blockId", 1), ("cycleNumber", -1)])

            # Stock inventory collection
            await cls.db.stock_inventory.create_index("inventoryId", unique=True)
            await cls.db.stock_inventory.create_index("farmId")
            await cls.db.stock_inventory.create_index("plantDataId")
            await cls.db.stock_inventory.create_index("blockId")
            await cls.db.stock_inventory.create_index("cycleId")
            await cls.db.stock_inventory.create_index("dailyHarvestId")
            await cls.db.stock_inventory.create_index("qualityGrade")
            await cls.db.stock_inventory.create_index("harvestDate")
            await cls.db.stock_inventory.create_index([("createdAt", -1)])
            # Compound index for FIFO queries
            await cls.db.stock_inventory.create_index([("farmId", 1), ("plantDataId", 1), ("harvestDate", 1)])

            # Farm assignments collection
            await cls.db.farm_assignments.create_index("assignmentId", unique=True)
            await cls.db.farm_assignments.create_index("userId")
            await cls.db.farm_assignments.create_index("farmId")
            await cls.db.farm_assignments.create_index("isActive")
            # Compound unique index to prevent duplicate assignments
            await cls.db.farm_assignments.create_index(
                [("userId", 1), ("farmId", 1)],
                unique=True
            )

            logger.info("[Farm Module] MongoDB indexes created successfully")
        except Exception as e:
            logger.error(f"[Farm Module] Error creating MongoDB indexes: {e}")
            # Don't raise - indexes are not critical for startup

    @classmethod
    async def disconnect(cls) -> None:
        """Close MongoDB connection"""
        if cls.client:
            cls.client.close()
            logger.info("[Farm Module] Disconnected from MongoDB")

    @classmethod
    async def health_check(cls) -> bool:
        """
        Check MongoDB connection health

        Returns:
            bool: True if connection is healthy, False otherwise
        """
        try:
            if cls.client:
                await cls.client.admin.command('ping')
                return True
            return False
        except Exception as e:
            logger.error(f"[Farm Module] MongoDB health check failed: {e}")
            return False

    @classmethod
    def get_database(cls):
        """Get database instance"""
        if cls.db is None:
            raise ConnectionError("[Farm Module] MongoDB not connected. Call connect() first.")
        return cls.db

    @classmethod
    def get_collection(cls, collection_name: str):
        """
        Get a specific collection

        Args:
            collection_name: Name of the collection

        Returns:
            MongoDB collection
        """
        db = cls.get_database()
        return db[collection_name]


# Database manager instance
farm_db = FarmDatabaseManager()
