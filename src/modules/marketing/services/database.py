"""
Marketing Module - Database Service

Manages MongoDB collections for the Marketing module.
Uses shared MongoDB connection from core services.
"""

import logging

# Import shared database manager from core
from src.services.database import mongodb

logger = logging.getLogger(__name__)


class MarketingDatabaseManager:
    """
    Marketing module database manager

    Manages MongoDB collections for marketing management:
    - marketing_budgets
    - marketing_campaigns
    - marketing_channels
    - marketing_events

    Note: This delegates to the core MongoDB manager for actual connection management.
    The core manager handles connection pooling, health checks, and shutdown.
    """

    @classmethod
    async def connect(cls) -> None:
        """
        Initialize Marketing module indexes.
        The actual MongoDB connection is managed by core services.

        Note: This method is kept for backward compatibility but delegates
        to the shared MongoDB connection from src.services.database.
        """
        try:
            logger.info("[Marketing Module] Initializing Marketing indexes...")

            # The core MongoDB manager already connected in main.py startup
            # We just need to create our module-specific indexes
            await cls._create_indexes()

            logger.info("[Marketing Module] Marketing indexes initialized")

        except Exception as e:
            logger.error(f"[Marketing Module] Error initializing Marketing indexes: {e}")
            raise

    @classmethod
    async def _create_indexes(cls) -> None:
        """Create database indexes for Marketing collections"""
        try:
            # Get shared database instance from core
            db = mongodb.get_database()

            # Marketing Budgets collection
            await db.marketing_budgets.create_index("budgetId", unique=True)
            await db.marketing_budgets.create_index("name")
            await db.marketing_budgets.create_index("year")
            await db.marketing_budgets.create_index("quarter")
            await db.marketing_budgets.create_index("status")
            await db.marketing_budgets.create_index("createdBy")
            await db.marketing_budgets.create_index([("createdAt", -1)])
            # Text search index for budget name
            await db.marketing_budgets.create_index(
                [("name", "text")],
                name="budget_search_text"
            )

            # Marketing Campaigns collection
            await db.marketing_campaigns.create_index("campaignId", unique=True)
            await db.marketing_campaigns.create_index("campaignCode", unique=True)
            await db.marketing_campaigns.create_index("name")
            await db.marketing_campaigns.create_index("budgetId")
            await db.marketing_campaigns.create_index("status")
            await db.marketing_campaigns.create_index("startDate")
            await db.marketing_campaigns.create_index("endDate")
            await db.marketing_campaigns.create_index("createdBy")
            await db.marketing_campaigns.create_index([("createdAt", -1)])
            # Text search index for campaign name and description
            await db.marketing_campaigns.create_index(
                [("name", "text"), ("description", "text"), ("campaignCode", "text")],
                name="campaign_search_text"
            )

            # Marketing Channels collection
            await db.marketing_channels.create_index("channelId", unique=True)
            await db.marketing_channels.create_index("name")
            await db.marketing_channels.create_index("type")
            await db.marketing_channels.create_index("platform")
            await db.marketing_channels.create_index("isActive")
            await db.marketing_channels.create_index("createdBy")
            await db.marketing_channels.create_index([("createdAt", -1)])
            # Text search index for channel name and platform
            await db.marketing_channels.create_index(
                [("name", "text"), ("platform", "text")],
                name="channel_search_text"
            )

            # Marketing Events collection
            await db.marketing_events.create_index("eventId", unique=True)
            await db.marketing_events.create_index("eventCode", unique=True)
            await db.marketing_events.create_index("name")
            await db.marketing_events.create_index("type")
            await db.marketing_events.create_index("campaignId")
            await db.marketing_events.create_index("status")
            await db.marketing_events.create_index("date")
            await db.marketing_events.create_index("createdBy")
            await db.marketing_events.create_index([("date", -1)])
            # Text search index for event name and location
            await db.marketing_events.create_index(
                [("name", "text"), ("location", "text"), ("eventCode", "text")],
                name="event_search_text"
            )

            logger.info("[Marketing Module] MongoDB indexes created successfully")
        except Exception as e:
            logger.error(f"[Marketing Module] Error creating MongoDB indexes: {e}")
            # Don't raise - indexes are not critical for startup

    @classmethod
    async def disconnect(cls) -> None:
        """
        Disconnect from MongoDB (delegated to core manager)

        Note: This method is kept for backward compatibility but delegates
        to the shared MongoDB connection from src.services.database.
        The actual disconnection is handled by core services during shutdown.
        """
        logger.info("[Marketing Module] Marketing module shutdown (database managed by core)")
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
marketing_db = MarketingDatabaseManager()
