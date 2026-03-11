"""
Mushroom Management Module - Database Service

Manages MongoDB collections for the mushroom management module.
Uses shared MongoDB connection from core services.
"""

import logging
from typing import Optional

from src.services.database import mongodb

logger = logging.getLogger(__name__)


class MushroomDatabaseManager:
    """
    Mushroom module database manager.

    Manages MongoDB collections for mushroom management:
    - mushroom_facilities
    - growing_rooms
    - mushroom_strains
    - substrate_batches
    - mushroom_harvests
    - room_environment_logs
    - contamination_reports

    Note: Delegates to the core MongoDB manager for actual connection management.
    The core manager handles connection pooling, health checks, and shutdown.
    """

    @classmethod
    async def connect(cls) -> None:
        """
        Initialize mushroom module indexes.

        The actual MongoDB connection is managed by core services.
        This method creates module-specific indexes only.
        """
        try:
            logger.info("[Mushroom Module] Initializing mushroom management indexes...")
            await cls._create_indexes()
            logger.info("[Mushroom Module] Mushroom management indexes initialized")
        except Exception as e:
            logger.error(f"[Mushroom Module] Error initializing mushroom indexes: {e}")
            raise

    @classmethod
    async def _create_indexes(cls) -> None:
        """
        Create database indexes for mushroom management collections.

        Raises:
            Exception: Logged but not re-raised; indexes are not critical for startup.
        """
        try:
            db = mongodb.get_database()

            # mushroom_facilities collection
            await db.mushroom_facilities.create_index("facilityId", unique=True)
            await db.mushroom_facilities.create_index("managerId")
            await db.mushroom_facilities.create_index("status")
            await db.mushroom_facilities.create_index("facilityType")
            await db.mushroom_facilities.create_index([("createdAt", -1)])

            # growing_rooms collection
            await db.growing_rooms.create_index("roomId", unique=True)
            await db.growing_rooms.create_index("facilityId")
            await db.growing_rooms.create_index("currentPhase")
            await db.growing_rooms.create_index("strainId")
            await db.growing_rooms.create_index("substrateBatchId")
            await db.growing_rooms.create_index([("createdAt", -1)])
            # Compound index for facility-room lookups
            await db.growing_rooms.create_index(
                [("facilityId", 1), ("roomCode", 1)],
                unique=True
            )

            # mushroom_strains collection
            await db.mushroom_strains.create_index("strainId", unique=True)
            await db.mushroom_strains.create_index("commonName")
            await db.mushroom_strains.create_index("difficultyLevel")
            await db.mushroom_strains.create_index("isActive")
            await db.mushroom_strains.create_index([("createdAt", -1)])

            # substrate_batches collection
            await db.substrate_batches.create_index("batchId", unique=True)
            await db.substrate_batches.create_index("facilityId")
            await db.substrate_batches.create_index("status")
            await db.substrate_batches.create_index("batchCode")
            await db.substrate_batches.create_index([("createdAt", -1)])

            # mushroom_harvests collection
            await db.mushroom_harvests.create_index("harvestId", unique=True)
            await db.mushroom_harvests.create_index("roomId")
            await db.mushroom_harvests.create_index("facilityId")
            await db.mushroom_harvests.create_index("flushNumber")
            await db.mushroom_harvests.create_index("qualityGrade")
            await db.mushroom_harvests.create_index([("harvestedAt", -1)])
            await db.mushroom_harvests.create_index([("createdAt", -1)])
            # Compound index for room harvest queries
            await db.mushroom_harvests.create_index([("roomId", 1), ("flushNumber", 1)])
            await db.mushroom_harvests.create_index([("facilityId", 1), ("harvestedAt", -1)])

            # room_environment_logs collection
            await db.room_environment_logs.create_index("logId", unique=True)
            await db.room_environment_logs.create_index("roomId")
            await db.room_environment_logs.create_index("facilityId")
            await db.room_environment_logs.create_index("isOutOfRange")
            await db.room_environment_logs.create_index([("recordedAt", -1)])
            # Compound index for latest reading queries
            await db.room_environment_logs.create_index(
                [("roomId", 1), ("recordedAt", -1)]
            )

            # contamination_reports collection
            await db.contamination_reports.create_index("reportId", unique=True)
            await db.contamination_reports.create_index("roomId")
            await db.contamination_reports.create_index("facilityId")
            await db.contamination_reports.create_index("contaminationType")
            await db.contamination_reports.create_index("severity")
            await db.contamination_reports.create_index("isResolved")
            await db.contamination_reports.create_index([("reportedAt", -1)])
            await db.contamination_reports.create_index([("createdAt", -1)])

            logger.info("[Mushroom Module] MongoDB indexes created successfully")
        except Exception as e:
            logger.error(f"[Mushroom Module] Error creating MongoDB indexes: {e}")
            # Reason: Indexes are not critical for startup; log and continue

    @classmethod
    async def disconnect(cls) -> None:
        """
        Disconnect from MongoDB (delegated to core manager).

        Kept for backward compatibility with the module lifecycle pattern.
        Actual disconnection is handled by core services during shutdown.
        """
        logger.info("[Mushroom Module] Mushroom module shutdown (database managed by core)")

    @classmethod
    async def health_check(cls) -> bool:
        """
        Check MongoDB connection health (delegated to core manager).

        Returns:
            bool: True if connection is healthy, False otherwise.
        """
        return await mongodb.health_check()

    @classmethod
    def get_database(cls):
        """
        Get database instance (delegated to core manager).

        Returns:
            MongoDB database instance.
        """
        return mongodb.get_database()

    @classmethod
    def get_collection(cls, collection_name: str):
        """
        Get a specific collection (delegated to core manager).

        Args:
            collection_name: Name of the MongoDB collection.

        Returns:
            MongoDB collection instance.
        """
        db = mongodb.get_database()
        return db[collection_name]


# Database manager singleton instance
mushroom_db = MushroomDatabaseManager()
