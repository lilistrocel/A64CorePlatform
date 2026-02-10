"""
Logistics Module - Database Service

Manages MongoDB collections for the Logistics module.
Uses shared MongoDB connection from core services.
"""

import logging

# Import shared database manager from core
from src.services.database import mongodb

logger = logging.getLogger(__name__)


class LogisticsDatabaseManager:
    """
    Logistics module database manager

    Manages MongoDB collections for logistics management:
    - vehicles
    - routes
    - shipments

    Note: This delegates to the core MongoDB manager for actual connection management.
    The core manager handles connection pooling, health checks, and shutdown.
    """

    @classmethod
    async def connect(cls) -> None:
        """
        Initialize Logistics module indexes.
        The actual MongoDB connection is managed by core services.

        Note: This method is kept for backward compatibility but delegates
        to the shared MongoDB connection from src.services.database.
        """
        try:
            logger.info("[Logistics Module] Initializing Logistics indexes...")

            # The core MongoDB manager already connected in main.py startup
            # We just need to create our module-specific indexes
            await cls._create_indexes()

            logger.info("[Logistics Module] Logistics indexes initialized")

        except Exception as e:
            logger.error(f"[Logistics Module] Error initializing Logistics indexes: {e}")
            raise

    @classmethod
    async def _create_indexes(cls) -> None:
        """Create database indexes for Logistics collections"""
        try:
            # Get shared database instance from core
            db = mongodb.get_database()

            # Vehicles collection
            await db.vehicles.create_index("vehicleId", unique=True)
            await db.vehicles.create_index("vehicleCode", unique=True)
            await db.vehicles.create_index("licensePlate", unique=True, sparse=True)
            await db.vehicles.create_index("type")
            await db.vehicles.create_index("status")
            await db.vehicles.create_index("ownership")
            await db.vehicles.create_index("createdBy")
            await db.vehicles.create_index([("createdAt", -1)])
            # Text search index for name, licensePlate
            await db.vehicles.create_index(
                [("name", "text"), ("licensePlate", "text")],
                name="vehicle_search_text"
            )

            # Routes collection
            await db.routes.create_index("routeId", unique=True)
            await db.routes.create_index("routeCode", unique=True)
            await db.routes.create_index("isActive")
            await db.routes.create_index("createdBy")
            await db.routes.create_index([("createdAt", -1)])
            # Text search index for name, origin, destination
            await db.routes.create_index(
                [("name", "text"), ("origin.name", "text"), ("destination.name", "text")],
                name="route_search_text"
            )

            # Shipments collection
            await db.shipments.create_index("shipmentId", unique=True)
            await db.shipments.create_index("shipmentCode", unique=True)
            await db.shipments.create_index("routeId")
            await db.shipments.create_index("vehicleId")
            await db.shipments.create_index("driverId")
            await db.shipments.create_index("status")
            await db.shipments.create_index([("scheduledDate", -1)])
            await db.shipments.create_index([("createdAt", -1)])
            # Farming year indexes for filtering by year
            await db.shipments.create_index("farmingYear")
            await db.shipments.create_index([("status", 1), ("farmingYear", 1)])

            logger.info("[Logistics Module] MongoDB indexes created successfully")
        except Exception as e:
            logger.error(f"[Logistics Module] Error creating MongoDB indexes: {e}")
            # Don't raise - indexes are not critical for startup

    @classmethod
    async def disconnect(cls) -> None:
        """
        Disconnect from MongoDB (delegated to core manager)

        Note: This method is kept for backward compatibility but delegates
        to the shared MongoDB connection from src.services.database.
        The actual disconnection is handled by core services during shutdown.
        """
        logger.info("[Logistics Module] Logistics module shutdown (database managed by core)")
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
logistics_db = LogisticsDatabaseManager()
