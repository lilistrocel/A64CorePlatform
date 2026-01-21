"""
CRM Module - Database Service

Manages MongoDB collections for the CRM module.
Uses shared MongoDB connection from core services.
"""

import logging

# Import shared database manager from core
from src.services.database import mongodb

logger = logging.getLogger(__name__)


class CRMDatabaseManager:
    """
    CRM module database manager

    Manages MongoDB collections for customer relationship management:
    - customers

    Note: This delegates to the core MongoDB manager for actual connection management.
    The core manager handles connection pooling, health checks, and shutdown.
    """

    @classmethod
    async def connect(cls) -> None:
        """
        Initialize CRM module indexes.
        The actual MongoDB connection is managed by core services.

        Note: This method is kept for backward compatibility but delegates
        to the shared MongoDB connection from src.services.database.
        """
        try:
            logger.info("[CRM Module] Initializing CRM indexes...")

            # The core MongoDB manager already connected in main.py startup
            # We just need to create our module-specific indexes
            await cls._create_indexes()

            logger.info("[CRM Module] CRM indexes initialized")

        except Exception as e:
            logger.error(f"[CRM Module] Error initializing CRM indexes: {e}")
            raise

    @classmethod
    async def _create_indexes(cls) -> None:
        """Create database indexes for CRM collections"""
        try:
            # Get shared database instance from core
            db = mongodb.get_database()

            # Customers collection
            await db.customers.create_index("customerId", unique=True)
            await db.customers.create_index("customerCode", unique=True)
            await db.customers.create_index("email")
            await db.customers.create_index("phone")
            await db.customers.create_index("company")
            await db.customers.create_index("type")
            await db.customers.create_index("status")
            await db.customers.create_index("createdBy")
            await db.customers.create_index("tags")
            await db.customers.create_index([("createdAt", -1)])
            # Text search index for name, email, company
            await db.customers.create_index(
                [("name", "text"), ("email", "text"), ("company", "text")],
                name="customer_search_text"
            )

            logger.info("[CRM Module] MongoDB indexes created successfully")
        except Exception as e:
            logger.error(f"[CRM Module] Error creating MongoDB indexes: {e}")
            # Don't raise - indexes are not critical for startup

    @classmethod
    async def disconnect(cls) -> None:
        """
        Disconnect from MongoDB (delegated to core manager)

        Note: This method is kept for backward compatibility but delegates
        to the shared MongoDB connection from src.services.database.
        The actual disconnection is handled by core services during shutdown.
        """
        logger.info("[CRM Module] CRM module shutdown (database managed by core)")
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
crm_db = CRMDatabaseManager()
