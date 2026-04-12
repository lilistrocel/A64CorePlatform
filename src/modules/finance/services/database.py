"""
Finance Module - Database Service

Delegates to the shared core MongoDB connection.
"""

import logging

from src.services.database import mongodb

logger = logging.getLogger(__name__)


class FinanceDatabaseManager:
    """
    Finance module database manager.

    Delegates all connection management to the core MongoDB manager.
    Responsible only for creating module-specific indexes on startup.
    """

    @classmethod
    async def connect(cls) -> None:
        """Initialize Finance module indexes."""
        try:
            logger.info("[Finance Module] Initializing Finance indexes...")
            await cls._create_indexes()
            logger.info("[Finance Module] Finance indexes initialized")
        except Exception as e:
            logger.error(f"[Finance Module] Error initializing Finance indexes: {e}")
            raise

    @classmethod
    async def _create_indexes(cls) -> None:
        """
        Create indexes needed for P&L aggregation queries.

        All indexes are created idempotently (existing indexes are not recreated).
        """
        try:
            db = mongodb.get_database()

            # --- sales_order_lines ---
            # Composite index for per-farm/year revenue aggregation
            await db.sales_order_lines.create_index(
                [("farmId", 1), ("farmingYear", 1)],
                name="sol_farmId_farmingYear",
                background=True
            )
            # Index for priceSource filtering
            await db.sales_order_lines.create_index(
                [("metadata.priceSource", 1)],
                name="sol_priceSource",
                background=True
            )
            # Index for orderRef lookups (joining to sales_orders)
            await db.sales_order_lines.create_index(
                [("orderRef", 1)],
                name="sol_orderRef",
                background=True
            )
            # Composite for by-month queries
            await db.sales_order_lines.create_index(
                [("createdAt", 1), ("farmId", 1)],
                name="sol_createdAt_farmId",
                background=True
            )

            # --- purchase_register ---
            await db.purchase_register.create_index(
                [("buyerEntity", 1), ("date", 1)],
                name="pr_buyerEntity_date",
                background=True
            )
            await db.purchase_register.create_index(
                [("items.mappedCropName", 1)],
                name="pr_items_mappedCropName",
                background=True
            )

            # --- inventory_movements ---
            await db.inventory_movements.create_index(
                [("type", 1), ("movementDate", 1)],
                name="im_type_movementDate",
                background=True
            )

            logger.info("[Finance Module] MongoDB indexes created successfully")
        except Exception as e:
            logger.error(f"[Finance Module] Error creating MongoDB indexes: {e}")
            # Do not raise — indexes are not critical for startup

    @classmethod
    async def disconnect(cls) -> None:
        """Disconnect delegated to core manager."""
        logger.info("[Finance Module] Finance module shutdown (database managed by core)")

    @classmethod
    async def health_check(cls) -> bool:
        """Delegate health check to core manager."""
        return await mongodb.health_check()

    @classmethod
    def get_database(cls):
        """Get the shared database instance."""
        return mongodb.get_database()

    @classmethod
    def get_collection(cls, collection_name: str):
        """Get a specific collection."""
        db = mongodb.get_database()
        return db[collection_name]


# Module-level singleton
finance_db = FinanceDatabaseManager()
