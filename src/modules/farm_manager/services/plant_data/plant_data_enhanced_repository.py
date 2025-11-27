"""
PlantDataEnhanced Repository - Data Access Layer

Handles all database operations for enhanced plant data schema.
"""

from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime
import logging

from ...models.plant_data_enhanced import (
    PlantDataEnhanced,
    PlantDataEnhancedCreate,
    PlantDataEnhancedUpdate,
    FarmTypeEnum,
)
from ..database import farm_db

logger = logging.getLogger(__name__)


class PlantDataEnhancedRepository:
    """Repository for enhanced PlantData data access with comprehensive filtering"""

    # Collection name
    COLLECTION = "plant_data_enhanced"

    @staticmethod
    async def create(
        plant_data: PlantDataEnhancedCreate,
        created_by: UUID,
        created_by_email: str
    ) -> PlantDataEnhanced:
        """
        Create new enhanced plant data.

        Args:
            plant_data: Plant data creation data
            created_by: User ID creating the plant data
            created_by_email: Email of user creating the plant data

        Returns:
            Created PlantDataEnhanced object

        Raises:
            Exception: If database operation fails
        """
        db = farm_db.get_database()

        # Create plant data document
        plant = PlantDataEnhanced(
            **plant_data.model_dump(),
            createdBy=created_by,
            createdByEmail=created_by_email,
            dataVersion=1,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow(),
            deletedAt=None
        )

        # Convert to dict and convert UUID fields to strings for MongoDB
        plant_dict = plant.model_dump()
        plant_dict["plantDataId"] = str(plant_dict["plantDataId"])
        plant_dict["createdBy"] = str(plant_dict["createdBy"])

        # Reason: Parameterized insert prevents injection
        result = await db[PlantDataEnhancedRepository.COLLECTION].insert_one(plant_dict)

        if not result.inserted_id:
            raise Exception("Failed to create enhanced plant data")

        logger.info(
            f"[PlantData Enhanced Repository] Created plant data: "
            f"{plant.plantDataId} - {plant.plantName}"
        )
        return plant

    @staticmethod
    async def get_by_id(
        plant_data_id: UUID,
        include_deleted: bool = False
    ) -> Optional[PlantDataEnhanced]:
        """
        Get plant data by ID.

        Args:
            plant_data_id: PlantData ID
            include_deleted: Include soft-deleted records

        Returns:
            PlantDataEnhanced object if found, None otherwise
        """
        db = farm_db.get_database()

        # Build query
        query = {"plantDataId": str(plant_data_id)}

        if not include_deleted:
            query["deletedAt"] = None

        # Reason: Parameterized query prevents injection
        plant_doc = await db[PlantDataEnhancedRepository.COLLECTION].find_one(query)

        if not plant_doc:
            return None

        return PlantDataEnhanced(**plant_doc)

    @staticmethod
    async def get_by_name(
        plant_name: str,
        include_deleted: bool = False
    ) -> Optional[PlantDataEnhanced]:
        """
        Get plant data by plant name.

        Args:
            plant_name: Plant name
            include_deleted: Include soft-deleted records

        Returns:
            PlantDataEnhanced object if found, None otherwise
        """
        db = farm_db.get_database()

        # Build query
        query = {"plantName": plant_name}

        if not include_deleted:
            query["deletedAt"] = None

        # Reason: Parameterized query prevents injection
        plant_doc = await db[PlantDataEnhancedRepository.COLLECTION].find_one(query)

        if not plant_doc:
            return None

        return PlantDataEnhanced(**plant_doc)

    @staticmethod
    async def search(
        skip: int = 0,
        limit: int = 100,
        search: Optional[str] = None,
        plant_type: Optional[str] = None,
        farm_type: Optional[str] = None,
        min_growth_cycle: Optional[int] = None,
        max_growth_cycle: Optional[int] = None,
        tags: Optional[List[str]] = None,
        include_deleted: bool = False,
        created_by: Optional[UUID] = None,
        contributor: Optional[str] = None,
        target_region: Optional[str] = None
    ) -> tuple[List[PlantDataEnhanced], int]:
        """
        Search plant data with comprehensive filters and pagination.

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            search: Text search on plantName, scientificName, tags
            plant_type: Filter by specific plant type
            farm_type: Filter by farm type compatibility
            min_growth_cycle: Minimum growth cycle days
            max_growth_cycle: Maximum growth cycle days
            tags: Filter by tags (any match)
            include_deleted: Include soft-deleted records
            created_by: Filter by creator user ID
            contributor: Filter by data contributor name
            target_region: Filter by target region

        Returns:
            Tuple of (list of plant data, total count)
        """
        db = farm_db.get_database()
        import re

        # Build query
        query: Dict[str, Any] = {}

        # Soft delete filter
        if not include_deleted:
            query["deletedAt"] = None

        # Text search - use regex fallback if text index not available
        if search:
            # Use case-insensitive regex search on multiple fields
            # This works without requiring a text index
            search_pattern = re.escape(search)
            query["$or"] = [
                {"plantName": {"$regex": search_pattern, "$options": "i"}},
                {"scientificName": {"$regex": search_pattern, "$options": "i"}},
                {"tags": {"$regex": search_pattern, "$options": "i"}}
            ]

        # Farm type compatibility filter
        if farm_type:
            # Reason: Parameterized array query prevents injection
            query["farmTypeCompatibility"] = farm_type

        # Growth cycle range filter
        if min_growth_cycle is not None or max_growth_cycle is not None:
            growth_query: Dict[str, int] = {}
            if min_growth_cycle is not None:
                growth_query["$gte"] = min_growth_cycle
            if max_growth_cycle is not None:
                growth_query["$lte"] = max_growth_cycle
            if growth_query:
                query["growthCycle.totalCycleDays"] = growth_query

        # Tags filter (any match)
        if tags and len(tags) > 0:
            # Reason: $in operator with parameterized list is safe
            query["tags"] = {"$in": tags}

        # Created by filter
        if created_by:
            query["createdBy"] = str(created_by)

        # Contributor filter (case-insensitive)
        if contributor:
            query["contributor"] = {"$regex": f"^{re.escape(contributor)}$", "$options": "i"}

        # Target region filter (case-insensitive)
        if target_region:
            query["targetRegion"] = {"$regex": f"^{re.escape(target_region)}$", "$options": "i"}

        # Get total count
        total = await db[PlantDataEnhancedRepository.COLLECTION].count_documents(query)

        # Get paginated results
        # Reason: sort, skip, limit are parameterized - safe operations
        cursor = (
            db[PlantDataEnhancedRepository.COLLECTION]
            .find(query)
            .sort("plantName", 1)
            .skip(skip)
            .limit(limit)
        )

        plant_docs = await cursor.to_list(length=limit)
        plants = [PlantDataEnhanced(**doc) for doc in plant_docs]

        return plants, total

    @staticmethod
    async def update(
        plant_data_id: UUID,
        update_data: PlantDataEnhancedUpdate,
        increment_version: bool = True
    ) -> Optional[PlantDataEnhanced]:
        """
        Update plant data (increments version).

        Args:
            plant_data_id: PlantData ID
            update_data: Update data
            increment_version: Whether to increment dataVersion

        Returns:
            Updated PlantDataEnhanced object if found, None otherwise
        """
        db = farm_db.get_database()

        # Get current version
        current = await PlantDataEnhancedRepository.get_by_id(plant_data_id)
        if not current:
            return None

        # Check if deleted
        if current.deletedAt is not None:
            logger.warning(
                f"[PlantData Enhanced Repository] Attempted to update deleted plant data: {plant_data_id}"
            )
            return None

        # Only update fields that are provided
        update_dict = {
            k: v for k, v in update_data.model_dump(exclude_unset=True).items()
            if v is not None
        }

        if not update_dict:
            # No updates provided
            return current

        # Increment version if requested
        if increment_version:
            update_dict["dataVersion"] = current.dataVersion + 1

        # Update timestamp
        update_dict["updatedAt"] = datetime.utcnow()

        # Reason: Parameterized update prevents injection
        result = await db[PlantDataEnhancedRepository.COLLECTION].update_one(
            {"plantDataId": str(plant_data_id), "deletedAt": None},
            {"$set": update_dict}
        )

        if result.matched_count == 0:
            return None

        logger.info(
            f"[PlantData Enhanced Repository] Updated plant data: "
            f"{plant_data_id} (v{update_dict.get('dataVersion', current.dataVersion)})"
        )
        return await PlantDataEnhancedRepository.get_by_id(plant_data_id)

    @staticmethod
    async def soft_delete(plant_data_id: UUID) -> bool:
        """
        Soft delete plant data (sets deletedAt timestamp).

        Args:
            plant_data_id: PlantData ID

        Returns:
            True if deleted, False if not found
        """
        db = farm_db.get_database()

        # Reason: Parameterized update with timestamp prevents injection
        result = await db[PlantDataEnhancedRepository.COLLECTION].update_one(
            {"plantDataId": str(plant_data_id), "deletedAt": None},
            {"$set": {
                "deletedAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }}
        )

        if result.matched_count == 0:
            return False

        logger.info(f"[PlantData Enhanced Repository] Soft deleted plant data: {plant_data_id}")
        return True

    @staticmethod
    async def hard_delete(plant_data_id: UUID) -> bool:
        """
        Hard delete plant data (permanent removal).

        CAUTION: This permanently removes data. Use soft_delete instead.

        Args:
            plant_data_id: PlantData ID

        Returns:
            True if deleted, False if not found
        """
        db = farm_db.get_database()

        # Reason: Parameterized delete prevents injection
        result = await db[PlantDataEnhancedRepository.COLLECTION].delete_one(
            {"plantDataId": str(plant_data_id)}
        )

        if result.deleted_count == 0:
            return False

        logger.warning(
            f"[PlantData Enhanced Repository] HARD DELETED plant data: {plant_data_id}"
        )
        return True

    @staticmethod
    async def clone(
        plant_data_id: UUID,
        new_name: str,
        created_by: UUID,
        created_by_email: str
    ) -> Optional[PlantDataEnhanced]:
        """
        Clone existing plant data with a new name.

        Args:
            plant_data_id: Source PlantData ID to clone
            new_name: New plant name for the clone
            created_by: User ID creating the clone
            created_by_email: Email of user creating the clone

        Returns:
            Cloned PlantDataEnhanced object if source found, None otherwise
        """
        # Get source plant data
        source = await PlantDataEnhancedRepository.get_by_id(plant_data_id)
        if not source:
            return None

        # Create new plant data from source
        cloned_data = PlantDataEnhancedCreate(
            plantName=new_name,
            scientificName=source.scientificName,
            farmTypeCompatibility=source.farmTypeCompatibility,
            growthCycle=source.growthCycle,
            yieldInfo=source.yieldInfo,
            fertilizerSchedule=source.fertilizerSchedule,
            pesticideSchedule=source.pesticideSchedule,
            environmentalRequirements=source.environmentalRequirements,
            wateringRequirements=source.wateringRequirements,
            soilRequirements=source.soilRequirements,
            diseasesAndPests=source.diseasesAndPests,
            lightRequirements=source.lightRequirements,
            gradingStandards=source.gradingStandards,
            economicsAndLabor=source.economicsAndLabor,
            additionalInfo=source.additionalInfo,
            tags=source.tags
        )

        # Create the clone
        return await PlantDataEnhancedRepository.create(
            cloned_data,
            created_by,
            created_by_email
        )

    @staticmethod
    async def bulk_create(
        plants: List[PlantDataEnhancedCreate],
        created_by: UUID,
        created_by_email: str
    ) -> List[PlantDataEnhanced]:
        """
        Bulk create plant data (for CSV import).

        Args:
            plants: List of plant data to create
            created_by: User ID creating the plant data
            created_by_email: Email of user creating the plant data

        Returns:
            List of created PlantDataEnhanced objects

        Raises:
            Exception: If bulk insert fails
        """
        db = farm_db.get_database()

        if not plants:
            return []

        # Create plant data documents
        plant_objects = []
        plant_dicts = []

        for plant_data in plants:
            plant = PlantDataEnhanced(
                **plant_data.model_dump(),
                createdBy=created_by,
                createdByEmail=created_by_email,
                dataVersion=1,
                createdAt=datetime.utcnow(),
                updatedAt=datetime.utcnow(),
                deletedAt=None
            )
            plant_objects.append(plant)

            plant_dict = plant.model_dump()
            plant_dict["plantDataId"] = str(plant_dict["plantDataId"])
            plant_dict["createdBy"] = str(plant_dict["createdBy"])
            plant_dicts.append(plant_dict)

        # Reason: Bulk insert with parameterized documents prevents injection
        result = await db[PlantDataEnhancedRepository.COLLECTION].insert_many(plant_dicts)

        if not result.inserted_ids:
            raise Exception("Bulk insert failed")

        logger.info(
            f"[PlantData Enhanced Repository] Bulk created {len(plant_objects)} plant data records"
        )
        return plant_objects

    @staticmethod
    async def get_total_count(include_deleted: bool = False) -> int:
        """
        Get total count of plant data records.

        Args:
            include_deleted: Include soft-deleted records

        Returns:
            Total count
        """
        db = farm_db.get_database()

        query = {}
        if not include_deleted:
            query["deletedAt"] = None

        return await db[PlantDataEnhancedRepository.COLLECTION].count_documents(query)

    @staticmethod
    async def get_by_farm_type(
        farm_type: FarmTypeEnum,
        skip: int = 0,
        limit: int = 100
    ) -> tuple[List[PlantDataEnhanced], int]:
        """
        Get plant data compatible with specific farm type.

        Args:
            farm_type: Farm type to filter by
            skip: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            Tuple of (list of plant data, total count)
        """
        return await PlantDataEnhancedRepository.search(
            skip=skip,
            limit=limit,
            farm_type=farm_type.value,
            include_deleted=False
        )

    @staticmethod
    async def get_by_tags(
        tags: List[str],
        skip: int = 0,
        limit: int = 100
    ) -> tuple[List[PlantDataEnhanced], int]:
        """
        Get plant data by tags (any match).

        Args:
            tags: List of tags to search
            skip: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            Tuple of (list of plant data, total count)
        """
        return await PlantDataEnhancedRepository.search(
            skip=skip,
            limit=limit,
            tags=tags,
            include_deleted=False
        )

    @staticmethod
    async def get_by_growth_cycle_range(
        min_days: int,
        max_days: int,
        skip: int = 0,
        limit: int = 100
    ) -> tuple[List[PlantDataEnhanced], int]:
        """
        Get plant data by growth cycle duration range.

        Args:
            min_days: Minimum growth cycle days
            max_days: Maximum growth cycle days
            skip: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            Tuple of (list of plant data, total count)
        """
        return await PlantDataEnhancedRepository.search(
            skip=skip,
            limit=limit,
            min_growth_cycle=min_days,
            max_growth_cycle=max_days,
            include_deleted=False
        )

    @staticmethod
    async def get_filter_options() -> Dict[str, List[str]]:
        """
        Get distinct values for filter dropdowns.

        Returns:
            Dictionary with distinct contributors, targetRegions, and tags
        """
        db = farm_db.get_database()

        # Get distinct contributors (non-null, non-deleted)
        contributors = await db[PlantDataEnhancedRepository.COLLECTION].distinct(
            "contributor",
            {"deletedAt": None, "contributor": {"$ne": None}}
        )

        # Get distinct target regions (non-null, non-deleted)
        target_regions = await db[PlantDataEnhancedRepository.COLLECTION].distinct(
            "targetRegion",
            {"deletedAt": None, "targetRegion": {"$ne": None}}
        )

        # Get distinct tags (flatten arrays, non-deleted)
        tags_pipeline = [
            {"$match": {"deletedAt": None}},
            {"$unwind": "$tags"},
            {"$group": {"_id": "$tags"}},
            {"$sort": {"_id": 1}}
        ]
        tags_cursor = db[PlantDataEnhancedRepository.COLLECTION].aggregate(tags_pipeline)
        tags_docs = await tags_cursor.to_list(length=100)
        tags = [doc["_id"] for doc in tags_docs if doc["_id"]]

        return {
            "contributors": sorted([c for c in contributors if c]),
            "targetRegions": sorted([r for r in target_regions if r]),
            "tags": tags
        }
