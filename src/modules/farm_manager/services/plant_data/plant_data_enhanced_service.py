"""
PlantDataEnhanced Service - Business Logic Layer

Handles business logic, validation, and CSV import for enhanced plant data.
"""

from typing import List, Optional, Tuple
from uuid import UUID
from fastapi import HTTPException, status, UploadFile
import csv
import io
import logging

from ...models.plant_data_enhanced import (
    PlantDataEnhanced,
    PlantDataEnhancedCreate,
    PlantDataEnhancedUpdate,
    FarmTypeEnum,
)
from .plant_data_enhanced_repository import PlantDataEnhancedRepository

logger = logging.getLogger(__name__)


class PlantDataEnhancedService:
    """Service for enhanced PlantData business logic"""

    @staticmethod
    async def create_plant_data(
        plant_data: PlantDataEnhancedCreate,
        user_id: UUID,
        user_email: str
    ) -> PlantDataEnhanced:
        """
        Create new enhanced plant data with validation.

        Args:
            plant_data: Plant data creation data
            user_id: User creating the plant data
            user_email: Email of user creating the plant data

        Returns:
            Created PlantDataEnhanced object

        Raises:
            HTTPException: If validation fails
        """
        # Validate plant name uniqueness
        existing = await PlantDataEnhancedRepository.get_by_name(plant_data.plantName)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Plant data for '{plant_data.plantName}' already exists"
            )

        # Validate growth cycle totals match
        calculated_total = (
            plant_data.growthCycle.germinationDays +
            plant_data.growthCycle.vegetativeDays +
            plant_data.growthCycle.floweringDays +
            plant_data.growthCycle.fruitingDays +
            plant_data.growthCycle.harvestDurationDays
        )

        if calculated_total != plant_data.growthCycle.totalCycleDays:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Growth cycle mismatch: sum of stages ({calculated_total}) "
                       f"does not match totalCycleDays ({plant_data.growthCycle.totalCycleDays})"
            )

        # Validate temperature range
        temp = plant_data.environmentalRequirements.temperature
        if temp.minCelsius > temp.maxCelsius:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Temperature range invalid: minCelsius must be <= maxCelsius"
            )

        if not (temp.minCelsius <= temp.optimalCelsius <= temp.maxCelsius):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Optimal temperature must be within min-max range"
            )

        # Validate pH range
        ph = plant_data.soilRequirements.phRequirements
        if ph.minPH > ph.maxPH:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="pH range invalid: minPH must be <= maxPH"
            )

        if not (ph.minPH <= ph.optimalPH <= ph.maxPH):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Optimal pH must be within min-max range"
            )

        # Validate humidity if provided
        if plant_data.environmentalRequirements.humidity:
            hum = plant_data.environmentalRequirements.humidity
            if hum.minPercentage > hum.maxPercentage:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Humidity range invalid: minPercentage must be <= maxPercentage"
                )

            if not (hum.minPercentage <= hum.optimalPercentage <= hum.maxPercentage):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Optimal humidity must be within min-max range"
                )

        # Create plant data
        plant = await PlantDataEnhancedRepository.create(
            plant_data,
            user_id,
            user_email
        )

        logger.info(
            f"[PlantData Enhanced Service] User {user_id} created plant data: "
            f"{plant.plantDataId} - {plant.plantName}"
        )
        return plant

    @staticmethod
    async def get_plant_data(plant_data_id: UUID) -> PlantDataEnhanced:
        """
        Get plant data by ID.

        Args:
            plant_data_id: PlantData ID

        Returns:
            PlantDataEnhanced object

        Raises:
            HTTPException: If plant data not found
        """
        plant = await PlantDataEnhancedRepository.get_by_id(plant_data_id)

        if not plant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Plant data not found"
            )

        return plant

    @staticmethod
    async def search_plant_data(
        page: int = 1,
        per_page: int = 20,
        search: Optional[str] = None,
        farm_type: Optional[str] = None,
        min_growth_cycle: Optional[int] = None,
        max_growth_cycle: Optional[int] = None,
        tags: Optional[List[str]] = None,
        contributor: Optional[str] = None,
        target_region: Optional[str] = None
    ) -> Tuple[List[PlantDataEnhanced], int, int]:
        """
        Search plant data with comprehensive filters and pagination.

        Args:
            page: Page number (1-indexed)
            per_page: Items per page (max 100)
            search: Text search on plantName, scientificName, tags
            farm_type: Filter by farm type compatibility
            min_growth_cycle: Minimum growth cycle days
            max_growth_cycle: Maximum growth cycle days
            tags: Filter by tags (any match)
            contributor: Filter by data contributor name
            target_region: Filter by target region

        Returns:
            Tuple of (list of plant data, total count, total pages)
        """
        # Validate pagination
        if per_page > 100:
            per_page = 100

        # Calculate skip
        skip = (page - 1) * per_page

        # Search
        plants, total = await PlantDataEnhancedRepository.search(
            skip=skip,
            limit=per_page,
            search=search,
            farm_type=farm_type,
            min_growth_cycle=min_growth_cycle,
            max_growth_cycle=max_growth_cycle,
            tags=tags,
            include_deleted=False,
            contributor=contributor,
            target_region=target_region
        )

        # Calculate total pages
        total_pages = (total + per_page - 1) // per_page

        return plants, total, total_pages

    @staticmethod
    async def get_filter_options() -> dict:
        """
        Get distinct values for filter dropdowns.

        Returns:
            Dictionary with contributors, targetRegions, and tags
        """
        return await PlantDataEnhancedRepository.get_filter_options()

    @staticmethod
    async def update_plant_data(
        plant_data_id: UUID,
        update_data: PlantDataEnhancedUpdate,
        user_id: UUID
    ) -> PlantDataEnhanced:
        """
        Update plant data (increments version).

        Args:
            plant_data_id: PlantData ID
            update_data: Update data
            user_id: User updating the plant data

        Returns:
            Updated PlantDataEnhanced object

        Raises:
            HTTPException: If plant data not found or validation fails
        """
        # Get existing plant data
        plant = await PlantDataEnhancedRepository.get_by_id(plant_data_id)
        if not plant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Plant data not found"
            )

        # Validate temperature range if updating
        if update_data.environmentalRequirements:
            temp = update_data.environmentalRequirements.temperature
            if temp.minCelsius > temp.maxCelsius:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Temperature range invalid: minCelsius must be <= maxCelsius"
                )

            if not (temp.minCelsius <= temp.optimalCelsius <= temp.maxCelsius):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Optimal temperature must be within min-max range"
                )

        # Validate pH range if updating
        if update_data.soilRequirements:
            ph = update_data.soilRequirements.phRequirements
            if ph.minPH > ph.maxPH:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="pH range invalid: minPH must be <= maxPH"
                )

            if not (ph.minPH <= ph.optimalPH <= ph.maxPH):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Optimal pH must be within min-max range"
                )

        # Validate growth cycle if updating
        if update_data.growthCycle:
            calculated_total = (
                update_data.growthCycle.germinationDays +
                update_data.growthCycle.vegetativeDays +
                update_data.growthCycle.floweringDays +
                update_data.growthCycle.fruitingDays +
                update_data.growthCycle.harvestDurationDays
            )

            if calculated_total != update_data.growthCycle.totalCycleDays:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Growth cycle mismatch: sum of stages ({calculated_total}) "
                           f"does not match totalCycleDays ({update_data.growthCycle.totalCycleDays})"
                )

        # Update plant data (increments version)
        updated_plant = await PlantDataEnhancedRepository.update(
            plant_data_id,
            update_data,
            increment_version=True
        )

        if not updated_plant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Plant data not found or already deleted"
            )

        logger.info(
            f"[PlantData Enhanced Service] User {user_id} updated plant data: "
            f"{plant_data_id} (v{updated_plant.dataVersion})"
        )
        return updated_plant

    @staticmethod
    async def delete_plant_data(
        plant_data_id: UUID,
        user_id: UUID
    ) -> bool:
        """
        Delete plant data (soft delete).

        Args:
            plant_data_id: PlantData ID
            user_id: User deleting the plant data

        Returns:
            True if deleted

        Raises:
            HTTPException: If plant data not found
        """
        # Get plant data to verify it exists
        plant = await PlantDataEnhancedRepository.get_by_id(plant_data_id)
        if not plant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Plant data not found"
            )

        # Soft delete
        deleted = await PlantDataEnhancedRepository.soft_delete(plant_data_id)

        if deleted:
            logger.info(
                f"[PlantData Enhanced Service] User {user_id} deleted plant data: {plant_data_id}"
            )

        return deleted

    @staticmethod
    async def clone_plant_data(
        plant_data_id: UUID,
        new_name: str,
        user_id: UUID,
        user_email: str
    ) -> PlantDataEnhanced:
        """
        Clone existing plant data with a new name.

        Args:
            plant_data_id: Source PlantData ID to clone
            new_name: New plant name for the clone
            user_id: User ID creating the clone
            user_email: Email of user creating the clone

        Returns:
            Cloned PlantDataEnhanced object

        Raises:
            HTTPException: If source not found or new name already exists
        """
        # Check if new name already exists
        existing = await PlantDataEnhancedRepository.get_by_name(new_name)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Plant data for '{new_name}' already exists"
            )

        # Clone
        cloned = await PlantDataEnhancedRepository.clone(
            plant_data_id,
            new_name,
            user_id,
            user_email
        )

        if not cloned:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Source plant data not found"
            )

        logger.info(
            f"[PlantData Enhanced Service] User {user_id} cloned plant data: "
            f"{plant_data_id} -> {cloned.plantDataId} ({new_name})"
        )
        return cloned

    @staticmethod
    def generate_csv_template() -> str:
        """
        Generate CSV template with headers for enhanced schema.

        Returns:
            CSV template as string

        Notes:
            - This is a simplified template for basic fields only
            - Complex nested structures (fertilizer schedules, pest management, etc.)
              require JSON format or manual entry via API
        """
        output = io.StringIO()
        writer = csv.writer(output)

        # Write headers
        headers = [
            "plantName",
            "scientificName",
            "farmTypeCompatibility",
            "growthCycleDays",
            "minTemperatureCelsius",
            "maxTemperatureCelsius",
            "optimalTemperatureCelsius",
            "minPH",
            "maxPH",
            "optimalPH",
            "wateringFrequencyDays",
            "yieldPerPlant",
            "yieldUnit",
            "tags",
            "notes"
        ]
        writer.writerow(headers)

        # Write example row
        example = [
            "Tomato",
            "Solanum lycopersicum",
            "open_field,greenhouse,hydroponic",
            "100",
            "15.0",
            "30.0",
            "24.0",
            "6.0",
            "6.8",
            "6.5",
            "2",
            "5.0",
            "kg",
            "vegetable,fruit,summer",
            "Requires staking for support. Prune suckers for better yield."
        ]
        writer.writerow(example)

        return output.getvalue()

    @staticmethod
    async def get_by_farm_type(
        farm_type: FarmTypeEnum,
        page: int = 1,
        per_page: int = 20
    ) -> Tuple[List[PlantDataEnhanced], int, int]:
        """
        Get plant data compatible with specific farm type.

        Args:
            farm_type: Farm type to filter by
            page: Page number (1-indexed)
            per_page: Items per page

        Returns:
            Tuple of (list of plant data, total count, total pages)
        """
        skip = (page - 1) * per_page

        plants, total = await PlantDataEnhancedRepository.get_by_farm_type(
            farm_type,
            skip=skip,
            limit=per_page
        )

        total_pages = (total + per_page - 1) // per_page

        return plants, total, total_pages

    @staticmethod
    async def get_by_tags(
        tags: List[str],
        page: int = 1,
        per_page: int = 20
    ) -> Tuple[List[PlantDataEnhanced], int, int]:
        """
        Get plant data by tags (any match).

        Args:
            tags: List of tags to search
            page: Page number (1-indexed)
            per_page: Items per page

        Returns:
            Tuple of (list of plant data, total count, total pages)
        """
        skip = (page - 1) * per_page

        plants, total = await PlantDataEnhancedRepository.get_by_tags(
            tags,
            skip=skip,
            limit=per_page
        )

        total_pages = (total + per_page - 1) // per_page

        return plants, total, total_pages
