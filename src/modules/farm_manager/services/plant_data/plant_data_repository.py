"""
PlantData Repository - Data Access Layer

Handles all database operations for plant data.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
import logging

from ...models.plant_data import PlantData, PlantDataCreate, PlantDataUpdate
from ..database import farm_db

logger = logging.getLogger(__name__)


class PlantDataRepository:
    """Repository for PlantData data access"""

    @staticmethod
    async def create(plant_data: PlantDataCreate, created_by: str, created_by_email: str) -> PlantData:
        """
        Create new plant data

        Args:
            plant_data: Plant data creation data
            created_by: User ID creating the plant data
            created_by_email: Email of user creating the plant data

        Returns:
            Created PlantData object

        Raises:
            Exception: If database operation fails
        """
        db = farm_db.get_database()

        # Create plant data document
        plant = PlantData(
            **plant_data.model_dump(),
            createdBy=created_by,
            createdByEmail=created_by_email,
            dataVersion=1
        )

        # Convert to dict and convert UUID fields to strings for MongoDB
        plant_dict = plant.model_dump()
        plant_dict["plantDataId"] = str(plant_dict["plantDataId"])
        plant_dict["createdBy"] = str(plant_dict["createdBy"])  # Also convert createdBy UUID

        result = await db.plant_data.insert_one(plant_dict)

        if not result.inserted_id:
            raise Exception("Failed to create plant data")

        logger.info(f"[PlantData Repository] Created plant data: {plant.plantDataId} - {plant.plantName}")
        return plant

    @staticmethod
    async def get_by_id(plant_data_id: UUID) -> Optional[PlantData]:
        """
        Get plant data by ID

        Args:
            plant_data_id: PlantData ID

        Returns:
            PlantData object if found, None otherwise
        """
        db = farm_db.get_database()

        plant_doc = await db.plant_data.find_one({"plantDataId": str(plant_data_id)})

        if not plant_doc:
            return None

        return PlantData(**plant_doc)

    @staticmethod
    async def get_by_name(plant_name: str) -> Optional[PlantData]:
        """
        Get plant data by plant name

        Args:
            plant_name: Plant name

        Returns:
            PlantData object if found, None otherwise
        """
        db = farm_db.get_database()

        plant_doc = await db.plant_data.find_one({"plantName": plant_name})

        if not plant_doc:
            return None

        return PlantData(**plant_doc)

    @staticmethod
    async def get_all(
        skip: int = 0,
        limit: int = 100,
        search: Optional[str] = None,
        is_active: Optional[bool] = None
    ) -> tuple[List[PlantData], int]:
        """
        Get all plant data with pagination and optional filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            search: Optional search term (searches plantName and scientificName)
            is_active: Optional filter by active status

        Returns:
            Tuple of (list of plant data, total count)
        """
        db = farm_db.get_database()

        # Build query - by default exclude soft-deleted records
        query = {}
        if search:
            query["$or"] = [
                {"plantName": {"$regex": search, "$options": "i"}},
                {"scientificName": {"$regex": search, "$options": "i"}}
            ]
        if is_active is not None:
            query["isActive"] = is_active
        else:
            # Default: exclude soft-deleted plants (isActive=False)
            query["isActive"] = {"$ne": False}

        # Get total count
        total = await db.plant_data.count_documents(query)

        # Get paginated results
        cursor = db.plant_data.find(query).skip(skip).limit(limit).sort("plantName", 1)
        plant_docs = await cursor.to_list(length=limit)

        plants = [PlantData(**doc) for doc in plant_docs]

        return plants, total

    @staticmethod
    async def update(plant_data_id: UUID, update_data: PlantDataUpdate) -> Optional[PlantData]:
        """
        Update plant data (creates new version)

        Args:
            plant_data_id: PlantData ID
            update_data: Update data

        Returns:
            Updated PlantData object if found, None otherwise
        """
        db = farm_db.get_database()

        # Get current version
        current = await PlantDataRepository.get_by_id(plant_data_id)
        if not current:
            return None

        # Only update fields that are provided
        update_dict = {
            k: v for k, v in update_data.model_dump(exclude_unset=True).items()
            if v is not None
        }

        if not update_dict:
            # No updates provided
            return current

        # Increment version
        update_dict["dataVersion"] = current.dataVersion + 1
        update_dict["updatedAt"] = datetime.utcnow()

        result = await db.plant_data.update_one(
            {"plantDataId": str(plant_data_id)},
            {"$set": update_dict}
        )

        if result.matched_count == 0:
            return None

        logger.info(f"[PlantData Repository] Updated plant data: {plant_data_id} (v{update_dict['dataVersion']})")
        return await PlantDataRepository.get_by_id(plant_data_id)

    @staticmethod
    async def delete(plant_data_id: UUID) -> bool:
        """
        Soft delete plant data (sets isActive to False)

        Args:
            plant_data_id: PlantData ID

        Returns:
            True if deleted, False if not found
        """
        db = farm_db.get_database()

        result = await db.plant_data.update_one(
            {"plantDataId": str(plant_data_id)},
            {"$set": {"isActive": False, "updatedAt": datetime.utcnow()}}
        )

        if result.matched_count == 0:
            return False

        logger.info(f"[PlantData Repository] Soft deleted plant data: {plant_data_id}")
        return True

    @staticmethod
    async def hard_delete(plant_data_id: UUID) -> bool:
        """
        Hard delete plant data (permanent removal)

        Args:
            plant_data_id: PlantData ID

        Returns:
            True if deleted, False if not found
        """
        db = farm_db.get_database()

        result = await db.plant_data.delete_one({"plantDataId": str(plant_data_id)})

        if result.deleted_count == 0:
            return False

        logger.info(f"[PlantData Repository] Hard deleted plant data: {plant_data_id}")
        return True

    @staticmethod
    async def bulk_create(plants: List[PlantDataCreate], created_by: str, created_by_email: str) -> List[PlantData]:
        """
        Bulk create plant data (for CSV import)

        Args:
            plants: List of plant data to create
            created_by: User ID creating the plant data
            created_by_email: Email of user creating the plant data

        Returns:
            List of created PlantData objects

        Raises:
            Exception: If bulk insert fails
        """
        db = farm_db.get_database()

        # Create plant data documents
        plant_objects = []
        plant_dicts = []

        for plant_data in plants:
            plant = PlantData(
                **plant_data.model_dump(),
                createdBy=created_by,
                createdByEmail=created_by_email,
                dataVersion=1
            )
            plant_objects.append(plant)

            plant_dict = plant.model_dump()
            plant_dict["plantDataId"] = str(plant_dict["plantDataId"])
            plant_dicts.append(plant_dict)

        # Bulk insert
        result = await db.plant_data.insert_many(plant_dicts)

        if not result.inserted_ids:
            raise Exception("Bulk insert failed")

        logger.info(f"[PlantData Repository] Bulk created {len(plant_objects)} plant data records")
        return plant_objects

    @staticmethod
    async def bulk_update(updates: List[tuple[str, PlantDataUpdate]]) -> int:
        """
        Bulk update plant data (for CSV import updates)

        Args:
            updates: List of (plantName, update_data) tuples

        Returns:
            Number of records updated
        """
        db = farm_db.get_database()

        updated_count = 0

        for plant_name, update_data in updates:
            # Get current plant data
            plant = await PlantDataRepository.get_by_name(plant_name)
            if not plant:
                continue

            # Update
            update_dict = {
                k: v for k, v in update_data.model_dump(exclude_unset=True).items()
                if v is not None
            }
            update_dict["dataVersion"] = plant.dataVersion + 1
            update_dict["updatedAt"] = datetime.utcnow()

            result = await db.plant_data.update_one(
                {"plantName": plant_name},
                {"$set": update_dict}
            )

            if result.matched_count > 0:
                updated_count += 1

        logger.info(f"[PlantData Repository] Bulk updated {updated_count} plant data records")
        return updated_count

    @staticmethod
    async def get_total_count() -> int:
        """
        Get total count of plant data records

        Returns:
            Total count
        """
        db = farm_db.get_database()
        return await db.plant_data.count_documents({})

    @staticmethod
    async def get_active_count() -> int:
        """
        Get count of active plant data records

        Returns:
            Active count
        """
        db = farm_db.get_database()
        return await db.plant_data.count_documents({"isActive": True})
