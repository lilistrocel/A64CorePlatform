"""
Purchase Order Repository

Data access layer for Purchase Order operations.
Handles all database interactions for purchase orders.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
import logging

from ...models.purchase_order import PurchaseOrder, PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrderStatus
from ..database import sales_db

logger = logging.getLogger(__name__)


class PurchaseOrderRepository:
    """Repository for Purchase Order data access"""

    def __init__(self):
        self.collection_name = "purchase_orders"

    def _get_collection(self):
        """Get purchase orders collection"""
        return sales_db.get_collection(self.collection_name)

    async def _get_next_po_sequence(self) -> int:
        """
        Get next purchase order sequence number using atomic increment.

        Uses a counters collection to maintain an atomic counter for PO codes.

        Returns:
            Next sequence number for PO code
        """
        db = sales_db.get_database()

        # Use findOneAndUpdate with upsert to atomically get and increment
        result = await db.counters.find_one_and_update(
            {"_id": "purchase_order_sequence"},
            {"$inc": {"value": 1}},
            upsert=True,
            return_document=True
        )

        return result["value"]

    async def create(self, po_data: PurchaseOrderCreate, created_by: UUID) -> PurchaseOrder:
        """
        Create a new purchase order with auto-generated poCode

        Args:
            po_data: Purchase order creation data
            created_by: ID of the user creating the purchase order

        Returns:
            Created purchase order
        """
        collection = self._get_collection()

        # Generate PO code (e.g., "PO001", "PO002")
        sequence = await self._get_next_po_sequence()
        po_code = f"PO{sequence:03d}"

        po_dict = po_data.model_dump()
        purchase_order = PurchaseOrder(
            **po_dict,
            poCode=po_code,
            createdBy=created_by,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow()
        )

        po_doc = purchase_order.model_dump(by_alias=True)
        po_doc["purchaseOrderId"] = str(po_doc["purchaseOrderId"])  # Convert UUID to string for MongoDB
        po_doc["supplierId"] = str(po_doc["supplierId"])
        po_doc["createdBy"] = str(po_doc["createdBy"])

        await collection.insert_one(po_doc)

        logger.info(f"Created purchase order: {purchase_order.purchaseOrderId} with code {po_code}")
        return purchase_order

    async def get_by_id(self, po_id: UUID) -> Optional[PurchaseOrder]:
        """
        Get purchase order by ID

        Args:
            po_id: Purchase order ID

        Returns:
            Purchase order if found, None otherwise
        """
        collection = self._get_collection()
        po_doc = await collection.find_one({"purchaseOrderId": str(po_id)})

        if po_doc:
            po_doc.pop("_id", None)  # Remove MongoDB _id
            return PurchaseOrder(**po_doc)
        return None

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 20,
        status: Optional[PurchaseOrderStatus] = None,
        supplier_id: Optional[UUID] = None
    ) -> tuple[List[PurchaseOrder], int]:
        """
        Get all purchase orders with pagination and filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            status: Filter by PO status (optional)
            supplier_id: Filter by supplier ID (optional)

        Returns:
            Tuple of (list of purchase orders, total count)
        """
        collection = self._get_collection()
        query = {}

        if status:
            query["status"] = status.value
        if supplier_id:
            query["supplierId"] = str(supplier_id)

        # Get total count
        total = await collection.count_documents(query)

        # Get purchase orders
        cursor = collection.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        purchase_orders = []

        async for po_doc in cursor:
            po_doc.pop("_id", None)
            purchase_orders.append(PurchaseOrder(**po_doc))

        return purchase_orders, total

    async def update(self, po_id: UUID, update_data: PurchaseOrderUpdate) -> Optional[PurchaseOrder]:
        """
        Update a purchase order

        Args:
            po_id: Purchase order ID
            update_data: Fields to update

        Returns:
            Updated purchase order if found, None otherwise
        """
        collection = self._get_collection()

        update_dict = update_data.model_dump(exclude_unset=True)
        if not update_dict:
            return await self.get_by_id(po_id)

        # Convert UUIDs to strings for MongoDB
        if "supplierId" in update_dict:
            update_dict["supplierId"] = str(update_dict["supplierId"])

        update_dict["updatedAt"] = datetime.utcnow()

        result = await collection.update_one(
            {"purchaseOrderId": str(po_id)},
            {"$set": update_dict}
        )

        if result.modified_count > 0:
            logger.info(f"Updated purchase order: {po_id}")
            return await self.get_by_id(po_id)

        return None

    async def update_status(self, po_id: UUID, new_status: PurchaseOrderStatus) -> Optional[PurchaseOrder]:
        """
        Update purchase order status

        Args:
            po_id: Purchase order ID
            new_status: New status value

        Returns:
            Updated purchase order if found, None otherwise
        """
        collection = self._get_collection()

        result = await collection.update_one(
            {"purchaseOrderId": str(po_id)},
            {
                "$set": {
                    "status": new_status.value,
                    "updatedAt": datetime.utcnow()
                }
            }
        )

        if result.modified_count > 0:
            logger.info(f"Updated purchase order status: {po_id} -> {new_status.value}")
            return await self.get_by_id(po_id)

        return None

    async def delete(self, po_id: UUID) -> bool:
        """
        Delete a purchase order (hard delete)

        Args:
            po_id: Purchase order ID

        Returns:
            True if deleted, False otherwise
        """
        collection = self._get_collection()

        result = await collection.delete_one({"purchaseOrderId": str(po_id)})

        if result.deleted_count > 0:
            logger.info(f"Deleted purchase order: {po_id}")
            return True

        return False

    async def exists(self, po_id: UUID) -> bool:
        """
        Check if purchase order exists

        Args:
            po_id: Purchase order ID

        Returns:
            True if exists, False otherwise
        """
        collection = self._get_collection()
        count = await collection.count_documents({"purchaseOrderId": str(po_id)})
        return count > 0
