"""
Inventory Repository

Data access layer for Harvest Inventory operations.
Handles all database interactions for inventory.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
import logging

from ...models.inventory import HarvestInventory, HarvestInventoryCreate, HarvestInventoryUpdate, InventoryStatus
from ..database import sales_db

logger = logging.getLogger(__name__)


class InventoryRepository:
    """Repository for Harvest Inventory data access"""

    def __init__(self):
        self.collection_name = "harvest_inventory"

    def _get_collection(self):
        """Get harvest inventory collection"""
        return sales_db.get_collection(self.collection_name)

    async def create(self, inventory_data: HarvestInventoryCreate, created_by: UUID) -> HarvestInventory:
        """
        Create a new inventory item

        Args:
            inventory_data: Inventory creation data
            created_by: ID of the user creating the inventory item

        Returns:
            Created inventory item
        """
        collection = self._get_collection()

        inventory_dict = inventory_data.model_dump()
        inventory = HarvestInventory(
            **inventory_dict,
            createdBy=created_by,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow()
        )

        inventory_doc = inventory.model_dump(by_alias=True)
        inventory_doc["inventoryId"] = str(inventory_doc["inventoryId"])  # Convert UUID to string for MongoDB
        inventory_doc["createdBy"] = str(inventory_doc["createdBy"])

        # Convert optional UUIDs to strings
        if inventory_doc.get("farmId"):
            inventory_doc["farmId"] = str(inventory_doc["farmId"])
        if inventory_doc.get("blockId"):
            inventory_doc["blockId"] = str(inventory_doc["blockId"])

        await collection.insert_one(inventory_doc)

        logger.info(f"Created inventory item: {inventory.inventoryId}")
        return inventory

    async def get_by_id(self, inventory_id: UUID) -> Optional[HarvestInventory]:
        """
        Get inventory item by ID

        Args:
            inventory_id: Inventory ID

        Returns:
            Inventory item if found, None otherwise
        """
        collection = self._get_collection()
        inventory_doc = await collection.find_one({"inventoryId": str(inventory_id)})

        if inventory_doc:
            inventory_doc.pop("_id", None)  # Remove MongoDB _id
            return HarvestInventory(**inventory_doc)
        return None

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 20,
        status: Optional[InventoryStatus] = None,
        category: Optional[str] = None,
        farm_id: Optional[UUID] = None
    ) -> tuple[List[HarvestInventory], int]:
        """
        Get all inventory items with pagination and filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            status: Filter by inventory status (optional)
            category: Filter by category (optional)
            farm_id: Filter by farm ID (optional)

        Returns:
            Tuple of (list of inventory items, total count)
        """
        collection = self._get_collection()
        query = {}

        if status:
            query["status"] = status.value
        if category:
            query["category"] = category
        if farm_id:
            query["farmId"] = str(farm_id)

        # Get total count
        total = await collection.count_documents(query)

        # Get inventory items
        cursor = collection.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        inventory_items = []

        async for inventory_doc in cursor:
            inventory_doc.pop("_id", None)
            inventory_items.append(HarvestInventory(**inventory_doc))

        return inventory_items, total

    async def get_available_stock(
        self,
        skip: int = 0,
        limit: int = 20
    ) -> tuple[List[HarvestInventory], int]:
        """
        Get available inventory items (status = available)

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            Tuple of (list of available inventory items, total count)
        """
        return await self.get_all(skip, limit, status=InventoryStatus.AVAILABLE)

    async def update(self, inventory_id: UUID, update_data: HarvestInventoryUpdate) -> Optional[HarvestInventory]:
        """
        Update an inventory item

        Args:
            inventory_id: Inventory ID
            update_data: Fields to update

        Returns:
            Updated inventory item if found, None otherwise
        """
        collection = self._get_collection()

        update_dict = update_data.model_dump(exclude_unset=True)
        if not update_dict:
            return await self.get_by_id(inventory_id)

        # Convert optional UUIDs to strings for MongoDB
        if "farmId" in update_dict and update_dict["farmId"]:
            update_dict["farmId"] = str(update_dict["farmId"])
        if "blockId" in update_dict and update_dict["blockId"]:
            update_dict["blockId"] = str(update_dict["blockId"])

        update_dict["updatedAt"] = datetime.utcnow()

        result = await collection.update_one(
            {"inventoryId": str(inventory_id)},
            {"$set": update_dict}
        )

        if result.modified_count > 0:
            logger.info(f"Updated inventory item: {inventory_id}")
            return await self.get_by_id(inventory_id)

        return None

    async def delete(self, inventory_id: UUID) -> bool:
        """
        Delete an inventory item (hard delete)

        Args:
            inventory_id: Inventory ID

        Returns:
            True if deleted, False otherwise
        """
        collection = self._get_collection()

        result = await collection.delete_one({"inventoryId": str(inventory_id)})

        if result.deleted_count > 0:
            logger.info(f"Deleted inventory item: {inventory_id}")
            return True

        return False

    async def exists(self, inventory_id: UUID) -> bool:
        """
        Check if inventory item exists

        Args:
            inventory_id: Inventory ID

        Returns:
            True if exists, False otherwise
        """
        collection = self._get_collection()
        count = await collection.count_documents({"inventoryId": str(inventory_id)})
        return count > 0

    async def get_inventory_stats(self) -> dict:
        """
        Get aggregated inventory statistics across ALL items.

        Uses MongoDB aggregation pipeline to count items by status.

        Returns:
            Dict with total, available, reserved, sold counts
        """
        collection = self._get_collection()

        pipeline = [
            {
                "$group": {
                    "_id": "$status",
                    "count": {"$sum": 1}
                }
            }
        ]

        results = await collection.aggregate(pipeline).to_list(length=100)

        stats = {
            "total": 0,
            "available": 0,
            "reserved": 0,
            "sold": 0,
            "expired": 0
        }

        for result in results:
            status = result.get("_id", "")
            count = result.get("count", 0)
            stats["total"] += count

            if status == "available":
                stats["available"] = count
            elif status == "reserved":
                stats["reserved"] = count
            elif status == "sold":
                stats["sold"] = count
            elif status == "expired":
                stats["expired"] = count

        return stats
