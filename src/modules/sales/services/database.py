"""
Sales Module - Database Service

Manages MongoDB collections for the Sales module.
Uses shared MongoDB connection from core services.
"""

import logging

# Import shared database manager from core
from src.services.database import mongodb

logger = logging.getLogger(__name__)


class SalesDatabaseManager:
    """
    Sales module database manager

    Manages MongoDB collections for sales and inventory management:
    - sales_orders
    - harvest_inventory
    - purchase_orders

    Note: This delegates to the core MongoDB manager for actual connection management.
    The core manager handles connection pooling, health checks, and shutdown.
    """

    @classmethod
    async def connect(cls) -> None:
        """
        Initialize Sales module indexes.
        The actual MongoDB connection is managed by core services.

        Note: This method is kept for backward compatibility but delegates
        to the shared MongoDB connection from src.services.database.
        """
        try:
            logger.info("[Sales Module] Initializing Sales indexes...")

            # The core MongoDB manager already connected in main.py startup
            # We just need to create our module-specific indexes
            await cls._create_indexes()

            logger.info("[Sales Module] Sales indexes initialized")

        except Exception as e:
            logger.error(f"[Sales Module] Error initializing Sales indexes: {e}")
            raise

    @classmethod
    async def _create_indexes(cls) -> None:
        """Create database indexes for Sales collections"""
        try:
            # Get shared database instance from core
            db = mongodb.get_database()

            # Sales Orders collection
            await db.sales_orders.create_index("orderId", unique=True)
            await db.sales_orders.create_index("orderCode", unique=True)
            await db.sales_orders.create_index("customerId")
            await db.sales_orders.create_index("customerName")
            await db.sales_orders.create_index("status")
            await db.sales_orders.create_index("paymentStatus")
            await db.sales_orders.create_index("orderDate")
            await db.sales_orders.create_index("createdBy")
            await db.sales_orders.create_index([("createdAt", -1)])
            # Text search index for customer name and order code
            await db.sales_orders.create_index(
                [("customerName", "text"), ("orderCode", "text")],
                name="sales_order_search_text"
            )

            # Harvest Inventory collection
            await db.harvest_inventory.create_index("inventoryId", unique=True)
            await db.harvest_inventory.create_index("productName")
            await db.harvest_inventory.create_index("category")
            await db.harvest_inventory.create_index("farmId")
            await db.harvest_inventory.create_index("blockId")
            await db.harvest_inventory.create_index("status")
            await db.harvest_inventory.create_index("quality")
            await db.harvest_inventory.create_index("harvestDate")
            await db.harvest_inventory.create_index("expiryDate")
            await db.harvest_inventory.create_index("createdBy")
            await db.harvest_inventory.create_index([("createdAt", -1)])
            # Text search index for product name and category
            await db.harvest_inventory.create_index(
                [("productName", "text"), ("category", "text")],
                name="inventory_search_text"
            )

            # Purchase Orders collection
            await db.purchase_orders.create_index("purchaseOrderId", unique=True)
            await db.purchase_orders.create_index("poCode", unique=True)
            await db.purchase_orders.create_index("supplierId")
            await db.purchase_orders.create_index("supplierName")
            await db.purchase_orders.create_index("status")
            await db.purchase_orders.create_index("orderDate")
            await db.purchase_orders.create_index("expectedDeliveryDate")
            await db.purchase_orders.create_index("createdBy")
            await db.purchase_orders.create_index([("createdAt", -1)])
            # Text search index for supplier name and PO code
            await db.purchase_orders.create_index(
                [("supplierName", "text"), ("poCode", "text")],
                name="purchase_order_search_text"
            )

            logger.info("[Sales Module] MongoDB indexes created successfully")
        except Exception as e:
            logger.error(f"[Sales Module] Error creating MongoDB indexes: {e}")
            # Don't raise - indexes are not critical for startup

    @classmethod
    async def disconnect(cls) -> None:
        """
        Disconnect from MongoDB (delegated to core manager)

        Note: This method is kept for backward compatibility but delegates
        to the shared MongoDB connection from src.services.database.
        The actual disconnection is handled by core services during shutdown.
        """
        logger.info("[Sales Module] Sales module shutdown (database managed by core)")
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
sales_db = SalesDatabaseManager()
