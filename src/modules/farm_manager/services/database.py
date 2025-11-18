"""
Farm Management Module - Database Service

Manages MongoDB collections for the farm management module.
Uses shared MongoDB connection from core services.
"""

from typing import Optional
import logging

# Import shared database manager from core
from src.services.database import mongodb

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

    Note: This now delegates to the core MongoDB manager for actual connection management.
    The core manager handles connection pooling, health checks, and shutdown.
    """

    @classmethod
    async def connect(cls) -> None:
        """
        Initialize farm module indexes.
        The actual MongoDB connection is managed by core services.

        Note: This method is kept for backward compatibility but delegates
        to the shared MongoDB connection from src.services.database.
        """
        try:
            logger.info("[Farm Module] Initializing farm management indexes...")

            # The core MongoDB manager already connected in main.py startup
            # We just need to create our module-specific indexes
            await cls._create_indexes()

            logger.info("[Farm Module] Farm management indexes initialized")

        except Exception as e:
            logger.error(f"[Farm Module] Error initializing farm indexes: {e}")
            raise

    @classmethod
    async def _create_indexes(cls) -> None:
        """Create database indexes for farm management collections"""
        try:
            # Get shared database instance from core
            db = mongodb.get_database()

            # Farms collection
            await db.farms.create_index("farmId", unique=True)
            await db.farms.create_index("managerId")
            await db.farms.create_index("isActive")
            await db.farms.create_index([("createdAt", -1)])

            # Blocks collection
            await db.blocks.create_index("blockId", unique=True)
            await db.blocks.create_index("farmId")
            await db.blocks.create_index("state")
            await db.blocks.create_index("currentPlanting")
            await db.blocks.create_index("currentCycleId")
            await db.blocks.create_index("estimatedHarvestDate")
            await db.blocks.create_index([("createdAt", -1)])

            # Plant data collection
            await db.plant_data.create_index("plantDataId", unique=True)
            await db.plant_data.create_index("plantName")
            await db.plant_data.create_index("plantType")
            await db.plant_data.create_index("tags")
            await db.plant_data.create_index([("createdAt", -1)])

            # Plantings collection
            await db.plantings.create_index("plantingId", unique=True)
            await db.plantings.create_index("blockId")
            await db.plantings.create_index("farmId")
            await db.plantings.create_index("status")
            await db.plantings.create_index("estimatedHarvestStartDate")
            await db.plantings.create_index([("createdAt", -1)])

            # Daily harvests collection
            await db.daily_harvests.create_index("dailyHarvestId", unique=True)
            await db.daily_harvests.create_index("cycleId")
            await db.daily_harvests.create_index("plantingId")
            await db.daily_harvests.create_index("blockId")
            await db.daily_harvests.create_index("farmId")
            await db.daily_harvests.create_index("harvestDate")
            await db.daily_harvests.create_index([("createdAt", -1)])

            # Harvests collection (aggregated summaries)
            await db.harvests.create_index("harvestId", unique=True)
            await db.harvests.create_index("plantingId")
            await db.harvests.create_index("blockId")
            await db.harvests.create_index("farmId")
            await db.harvests.create_index("cycleId")
            await db.harvests.create_index([("harvestEndDate", -1)])
            await db.harvests.create_index([("createdAt", -1)])

            # Alerts collection
            await db.alerts.create_index("alertId", unique=True)
            await db.alerts.create_index("cycleId")
            await db.alerts.create_index("blockId")
            await db.alerts.create_index("farmId")
            await db.alerts.create_index("severity")
            await db.alerts.create_index("status")
            await db.alerts.create_index("triggeredBy")
            await db.alerts.create_index([("triggeredAt", -1)])
            await db.alerts.create_index("escalated")

            # Block cycles collection (CRITICAL for historical data)
            await db.block_cycles.create_index("cycleId", unique=True)
            await db.block_cycles.create_index("blockId")
            await db.block_cycles.create_index("farmId")
            await db.block_cycles.create_index("cycleNumber")
            await db.block_cycles.create_index("plantingId")
            await db.block_cycles.create_index("status")
            await db.block_cycles.create_index([("createdAt", -1)])
            await db.block_cycles.create_index([("completedAt", -1)])
            # Compound index for block history queries
            await db.block_cycles.create_index([("blockId", 1), ("cycleNumber", -1)])

            # Stock inventory collection
            await db.stock_inventory.create_index("inventoryId", unique=True)
            await db.stock_inventory.create_index("farmId")
            await db.stock_inventory.create_index("plantDataId")
            await db.stock_inventory.create_index("blockId")
            await db.stock_inventory.create_index("cycleId")
            await db.stock_inventory.create_index("dailyHarvestId")
            await db.stock_inventory.create_index("qualityGrade")
            await db.stock_inventory.create_index("harvestDate")
            await db.stock_inventory.create_index([("createdAt", -1)])
            # Compound index for FIFO queries
            await db.stock_inventory.create_index([("farmId", 1), ("plantDataId", 1), ("harvestDate", 1)])

            # Farm assignments collection
            await db.farm_assignments.create_index("assignmentId", unique=True)
            await db.farm_assignments.create_index("userId")
            await db.farm_assignments.create_index("farmId")
            await db.farm_assignments.create_index("isActive")
            # Compound unique index to prevent duplicate assignments
            await db.farm_assignments.create_index(
                [("userId", 1), ("farmId", 1)],
                unique=True
            )

            logger.info("[Farm Module] MongoDB indexes created successfully")
        except Exception as e:
            logger.error(f"[Farm Module] Error creating MongoDB indexes: {e}")
            # Don't raise - indexes are not critical for startup

    @classmethod
    async def disconnect(cls) -> None:
        """
        Disconnect from MongoDB (delegated to core manager)

        Note: This method is kept for backward compatibility but delegates
        to the shared MongoDB connection from src.services.database.
        The actual disconnection is handled by core services during shutdown.
        """
        logger.info("[Farm Module] Farm module shutdown (database managed by core)")
        # No action needed - core services handle disconnection

    @classmethod
    async def health_check(cls) -> bool:
        """
        Check MongoDB connection health (delegated to core manager)

        Returns:
            bool: True if connection is healthy, False otherwise
        """
        return await mongodb.health_check()

    @classmethod
    def get_database(cls):
        """
        Get database instance (delegated to core manager)

        Returns:
            MongoDB database instance
        """
        return mongodb.get_database()

    @classmethod
    def get_collection(cls, collection_name: str):
        """
        Get a specific collection (delegated to core manager)

        Args:
            collection_name: Name of the collection

        Returns:
            MongoDB collection
        """
        db = mongodb.get_database()
        return db[collection_name]


# Database manager instance
farm_db = FarmDatabaseManager()
