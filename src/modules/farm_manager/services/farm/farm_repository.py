"""
Farm Repository

Data access layer for Farm operations.
Handles all database interactions for farms.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
import logging

from ...models.farm import Farm, FarmCreate, FarmUpdate
from ..database import farm_db

logger = logging.getLogger(__name__)


class FarmRepository:
    """Repository for Farm data access"""

    def __init__(self):
        self.collection_name = "farms"

    def _get_collection(self):
        """Get farms collection"""
        return farm_db.get_collection(self.collection_name)

    async def _get_next_farm_sequence(self) -> int:
        """
        Get next farm sequence number using atomic increment.

        Uses a counters collection to maintain an atomic counter for farm codes.

        Returns:
            Next sequence number for farm code
        """
        db = farm_db.get_database()

        # Use findOneAndUpdate with upsert to atomically get and increment
        result = await db.counters.find_one_and_update(
            {"_id": "farm_sequence"},
            {"$inc": {"value": 1}},
            upsert=True,
            return_document=True
        )

        return result["value"]

    async def create(self, farm_data: FarmCreate, manager_id: UUID, manager_email: str) -> Farm:
        """
        Create a new farm with auto-generated farmCode

        Args:
            farm_data: Farm creation data
            manager_id: ID of the farm manager
            manager_email: Email of the farm manager

        Returns:
            Created farm
        """
        collection = self._get_collection()

        # Generate farm code (e.g., "F001", "F002")
        sequence = await self._get_next_farm_sequence()
        farm_code = f"F{sequence:03d}"

        farm_dict = farm_data.model_dump()
        farm = Farm(
            **farm_dict,
            farmCode=farm_code,
            managerId=manager_id,
            managerEmail=manager_email,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow()
        )

        farm_doc = farm.model_dump(by_alias=True)
        farm_doc["farmId"] = str(farm_doc["farmId"])  # Convert UUID to string for MongoDB
        farm_doc["managerId"] = str(farm_doc["managerId"])
        # Initialize block sequence counter for this farm
        farm_doc["nextBlockSequence"] = 1

        await collection.insert_one(farm_doc)

        logger.info(f"Created farm: {farm.farmId} with code {farm_code}")
        return farm

    async def get_by_id(self, farm_id: UUID) -> Optional[Farm]:
        """
        Get farm by ID

        Args:
            farm_id: Farm ID

        Returns:
            Farm if found, None otherwise
        """
        collection = self._get_collection()
        farm_doc = await collection.find_one({"farmId": str(farm_id)})

        if farm_doc:
            farm_doc.pop("_id", None)  # Remove MongoDB _id
            return Farm(**farm_doc)
        return None

    async def get_by_manager(self, manager_id: UUID, is_active: Optional[bool] = None) -> List[Farm]:
        """
        Get farms by manager ID

        Args:
            manager_id: Manager user ID
            is_active: Filter by active status (optional)

        Returns:
            List of farms
        """
        collection = self._get_collection()
        query = {"managerId": str(manager_id)}

        if is_active is not None:
            query["isActive"] = is_active

        cursor = collection.find(query).sort("createdAt", -1)
        farms = []

        async for farm_doc in cursor:
            farm_doc.pop("_id", None)
            farms.append(Farm(**farm_doc))

        return farms

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 20,
        is_active: Optional[bool] = None
    ) -> tuple[List[Farm], int]:
        """
        Get all farms with pagination

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            is_active: Filter by active status (optional)

        Returns:
            Tuple of (list of farms, total count)
        """
        collection = self._get_collection()
        query = {}

        if is_active is not None:
            query["isActive"] = is_active

        # Get total count
        total = await collection.count_documents(query)

        # Get farms
        cursor = collection.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        farms = []

        async for farm_doc in cursor:
            farm_doc.pop("_id", None)
            farms.append(Farm(**farm_doc))

        return farms, total

    async def update(self, farm_id: UUID, update_data: FarmUpdate) -> Optional[Farm]:
        """
        Update a farm

        Args:
            farm_id: Farm ID
            update_data: Fields to update

        Returns:
            Updated farm if found, None otherwise
        """
        collection = self._get_collection()

        update_dict = update_data.model_dump(exclude_unset=True)
        if not update_dict:
            return await self.get_by_id(farm_id)

        update_dict["updatedAt"] = datetime.utcnow()

        result = await collection.update_one(
            {"farmId": str(farm_id)},
            {"$set": update_dict}
        )

        if result.modified_count > 0:
            logger.info(f"Updated farm: {farm_id}")
            return await self.get_by_id(farm_id)

        return None

    async def delete(self, farm_id: UUID) -> bool:
        """
        Delete a farm (soft delete)

        Args:
            farm_id: Farm ID

        Returns:
            True if deleted, False otherwise
        """
        collection = self._get_collection()

        result = await collection.update_one(
            {"farmId": str(farm_id)},
            {"$set": {"isActive": False, "updatedAt": datetime.utcnow()}}
        )

        if result.modified_count > 0:
            logger.info(f"Deleted (soft) farm: {farm_id}")
            return True

        return False

    async def exists(self, farm_id: UUID) -> bool:
        """
        Check if farm exists

        Args:
            farm_id: Farm ID

        Returns:
            True if exists, False otherwise
        """
        collection = self._get_collection()
        count = await collection.count_documents({"farmId": str(farm_id)})
        return count > 0
