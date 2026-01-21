"""
Sales Order Repository

Data access layer for Sales Order operations.
Handles all database interactions for sales orders.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
import logging

from ...models.sales_order import SalesOrder, SalesOrderCreate, SalesOrderUpdate, SalesOrderStatus
from ..database import sales_db

logger = logging.getLogger(__name__)


class OrderRepository:
    """Repository for Sales Order data access"""

    def __init__(self):
        self.collection_name = "sales_orders"

    def _get_collection(self):
        """Get sales orders collection"""
        return sales_db.get_collection(self.collection_name)

    async def _get_next_order_sequence(self) -> int:
        """
        Get next order sequence number using atomic increment.

        Uses a counters collection to maintain an atomic counter for order codes.

        Returns:
            Next sequence number for order code
        """
        db = sales_db.get_database()

        # Use findOneAndUpdate with upsert to atomically get and increment
        result = await db.counters.find_one_and_update(
            {"_id": "sales_order_sequence"},
            {"$inc": {"value": 1}},
            upsert=True,
            return_document=True
        )

        return result["value"]

    async def create(self, order_data: SalesOrderCreate, created_by: UUID) -> SalesOrder:
        """
        Create a new sales order with auto-generated orderCode

        Args:
            order_data: Sales order creation data
            created_by: ID of the user creating the order

        Returns:
            Created sales order
        """
        collection = self._get_collection()

        # Generate order code (e.g., "SO001", "SO002")
        sequence = await self._get_next_order_sequence()
        order_code = f"SO{sequence:03d}"

        order_dict = order_data.model_dump()
        order = SalesOrder(
            **order_dict,
            orderCode=order_code,
            createdBy=created_by,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow()
        )

        order_doc = order.model_dump(by_alias=True)
        order_doc["orderId"] = str(order_doc["orderId"])  # Convert UUID to string for MongoDB
        order_doc["customerId"] = str(order_doc["customerId"])
        order_doc["createdBy"] = str(order_doc["createdBy"])

        # Convert item productIds to strings
        for item in order_doc["items"]:
            item["productId"] = str(item["productId"])

        await collection.insert_one(order_doc)

        logger.info(f"Created sales order: {order.orderId} with code {order_code}")
        return order

    async def get_by_id(self, order_id: UUID) -> Optional[SalesOrder]:
        """
        Get sales order by ID

        Args:
            order_id: Sales order ID

        Returns:
            Sales order if found, None otherwise
        """
        collection = self._get_collection()
        order_doc = await collection.find_one({"orderId": str(order_id)})

        if order_doc:
            order_doc.pop("_id", None)  # Remove MongoDB _id
            return SalesOrder(**order_doc)
        return None

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 20,
        status: Optional[SalesOrderStatus] = None,
        customer_id: Optional[UUID] = None
    ) -> tuple[List[SalesOrder], int]:
        """
        Get all sales orders with pagination and filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            status: Filter by order status (optional)
            customer_id: Filter by customer ID (optional)

        Returns:
            Tuple of (list of orders, total count)
        """
        collection = self._get_collection()
        query = {}

        if status:
            query["status"] = status.value
        if customer_id:
            query["customerId"] = str(customer_id)

        # Get total count
        total = await collection.count_documents(query)

        # Get orders
        cursor = collection.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        orders = []

        async for order_doc in cursor:
            order_doc.pop("_id", None)
            orders.append(SalesOrder(**order_doc))

        return orders, total

    async def update(self, order_id: UUID, update_data: SalesOrderUpdate) -> Optional[SalesOrder]:
        """
        Update a sales order

        Args:
            order_id: Sales order ID
            update_data: Fields to update

        Returns:
            Updated sales order if found, None otherwise
        """
        collection = self._get_collection()

        update_dict = update_data.model_dump(exclude_unset=True)
        if not update_dict:
            return await self.get_by_id(order_id)

        # Convert UUIDs to strings for MongoDB
        if "customerId" in update_dict:
            update_dict["customerId"] = str(update_dict["customerId"])

        if "items" in update_dict:
            for item in update_dict["items"]:
                item["productId"] = str(item["productId"])

        update_dict["updatedAt"] = datetime.utcnow()

        result = await collection.update_one(
            {"orderId": str(order_id)},
            {"$set": update_dict}
        )

        if result.modified_count > 0:
            logger.info(f"Updated sales order: {order_id}")
            return await self.get_by_id(order_id)

        return None

    async def update_status(self, order_id: UUID, new_status: SalesOrderStatus) -> Optional[SalesOrder]:
        """
        Update order status

        Args:
            order_id: Sales order ID
            new_status: New status value

        Returns:
            Updated sales order if found, None otherwise
        """
        collection = self._get_collection()

        result = await collection.update_one(
            {"orderId": str(order_id)},
            {
                "$set": {
                    "status": new_status.value,
                    "updatedAt": datetime.utcnow()
                }
            }
        )

        if result.modified_count > 0:
            logger.info(f"Updated sales order status: {order_id} -> {new_status.value}")
            return await self.get_by_id(order_id)

        return None

    async def delete(self, order_id: UUID) -> bool:
        """
        Delete a sales order (hard delete)

        Args:
            order_id: Sales order ID

        Returns:
            True if deleted, False otherwise
        """
        collection = self._get_collection()

        result = await collection.delete_one({"orderId": str(order_id)})

        if result.deleted_count > 0:
            logger.info(f"Deleted sales order: {order_id}")
            return True

        return False

    async def exists(self, order_id: UUID) -> bool:
        """
        Check if sales order exists

        Args:
            order_id: Sales order ID

        Returns:
            True if exists, False otherwise
        """
        collection = self._get_collection()
        count = await collection.count_documents({"orderId": str(order_id)})
        return count > 0
