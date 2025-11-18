"""
Planting Repository

Data access layer for planting operations.
"""

from typing import List, Optional, Tuple
from uuid import UUID
from datetime import datetime
import logging

from ...services.database import farm_db
from ...models.planting import Planting

logger = logging.getLogger(__name__)


class PlantingRepository:
    """Repository for planting data access"""

    @staticmethod
    async def create(planting: Planting) -> Planting:
        """
        Create a new planting record.

        Args:
            planting: Planting object to create

        Returns:
            Created planting
        """
        planting_dict = planting.model_dump(mode="json")

        # Convert UUID fields to strings for MongoDB
        planting_dict["plantingId"] = str(planting.plantingId)
        planting_dict["blockId"] = str(planting.blockId)
        planting_dict["farmId"] = str(planting.farmId)
        planting_dict["plannedBy"] = str(planting.plannedBy)

        if planting.plantedBy:
            planting_dict["plantedBy"] = str(planting.plantedBy)

        # Convert nested plant data IDs
        for plant in planting_dict["plants"]:
            plant["plantDataId"] = str(plant["plantDataId"])

        await farm_db.db.plantings.insert_one(planting_dict)

        logger.info(f"[Planting Repository] Created planting {planting.plantingId} for block {planting.blockId}")
        return planting

    @staticmethod
    async def get_by_id(planting_id: UUID) -> Optional[Planting]:
        """
        Get planting by ID.

        Args:
            planting_id: Planting ID

        Returns:
            Planting if found, None otherwise
        """
        result = await farm_db.db.plantings.find_one({"plantingId": str(planting_id)})
        if not result:
            return None

        # Convert string IDs back to UUIDs
        result["plantingId"] = UUID(result["plantingId"])
        result["blockId"] = UUID(result["blockId"])
        result["farmId"] = UUID(result["farmId"])
        result["plannedBy"] = UUID(result["plannedBy"])

        if result.get("plantedBy"):
            result["plantedBy"] = UUID(result["plantedBy"])

        # Convert nested plant data IDs
        for plant in result["plants"]:
            plant["plantDataId"] = UUID(plant["plantDataId"])

        # Remove MongoDB _id
        result.pop("_id", None)

        return Planting(**result)

    @staticmethod
    async def get_by_block_id(block_id: UUID) -> Optional[Planting]:
        """
        Get active planting for a block.

        Args:
            block_id: Block ID

        Returns:
            Active planting if found, None otherwise
        """
        result = await farm_db.db.plantings.find_one({
            "blockId": str(block_id),
            "status": {"$in": ["planned", "planted", "harvesting"]}
        })

        if not result:
            return None

        # Convert string IDs back to UUIDs
        result["plantingId"] = UUID(result["plantingId"])
        result["blockId"] = UUID(result["blockId"])
        result["farmId"] = UUID(result["farmId"])
        result["plannedBy"] = UUID(result["plannedBy"])

        if result.get("plantedBy"):
            result["plantedBy"] = UUID(result["plantedBy"])

        # Convert nested plant data IDs
        for plant in result["plants"]:
            plant["plantDataId"] = UUID(plant["plantDataId"])

        # Remove MongoDB _id
        result.pop("_id", None)

        return Planting(**result)

    @staticmethod
    async def update(planting_id: UUID, update_data: dict) -> Optional[Planting]:
        """
        Update a planting.

        Args:
            planting_id: Planting ID
            update_data: Fields to update

        Returns:
            Updated planting if found, None otherwise
        """
        update_data["updatedAt"] = datetime.utcnow()

        result = await farm_db.db.plantings.find_one_and_update(
            {"plantingId": str(planting_id)},
            {"$set": update_data},
            return_document=True
        )

        if not result:
            return None

        # Convert string IDs back to UUIDs
        result["plantingId"] = UUID(result["plantingId"])
        result["blockId"] = UUID(result["blockId"])
        result["farmId"] = UUID(result["farmId"])
        result["plannedBy"] = UUID(result["plannedBy"])

        if result.get("plantedBy"):
            result["plantedBy"] = UUID(result["plantedBy"])

        # Convert nested plant data IDs
        for plant in result["plants"]:
            plant["plantDataId"] = UUID(plant["plantDataId"])

        # Remove MongoDB _id
        result.pop("_id", None)

        logger.info(f"[Planting Repository] Updated planting {planting_id}")
        return Planting(**result)

    @staticmethod
    async def get_farm_plantings(
        farm_id: UUID,
        page: int = 1,
        per_page: int = 20,
        status: Optional[str] = None
    ) -> Tuple[List[Planting], int]:
        """
        Get plantings for a farm with pagination.

        Args:
            farm_id: Farm ID
            page: Page number
            per_page: Items per page
            status: Filter by status

        Returns:
            Tuple of (plantings list, total count)
        """
        query = {"farmId": str(farm_id)}

        if status:
            query["status"] = status

        # Get total count
        total = await farm_db.db.plantings.count_documents(query)

        # Get paginated results
        cursor = farm_db.db.plantings.find(query).sort("createdAt", -1).skip((page - 1) * per_page).limit(per_page)

        plantings = []
        async for result in cursor:
            # Convert string IDs back to UUIDs
            result["plantingId"] = UUID(result["plantingId"])
            result["blockId"] = UUID(result["blockId"])
            result["farmId"] = UUID(result["farmId"])
            result["plannedBy"] = UUID(result["plannedBy"])

            if result.get("plantedBy"):
                result["plantedBy"] = UUID(result["plantedBy"])

            # Convert nested plant data IDs
            for plant in result["plants"]:
                plant["plantDataId"] = UUID(plant["plantDataId"])

            # Remove MongoDB _id
            result.pop("_id", None)

            plantings.append(Planting(**result))

        return plantings, total
