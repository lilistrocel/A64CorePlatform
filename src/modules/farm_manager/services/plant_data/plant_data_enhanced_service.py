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
        target_region: Optional[str] = None,
        is_active: Optional[bool] = None
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
            is_active: Filter by active status (True/False/None for all)

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
            target_region=target_region,
            is_active=is_active
        )

        # Calculate total pages
        total_pages = (total + per_page - 1) // per_page

        return plants, total, total_pages

    @staticmethod
    async def get_active_plants() -> List[PlantDataEnhanced]:
        """
        Get all active plant data for dropdown use.

        Returns:
            List of active PlantDataEnhanced objects
        """
        return await PlantDataEnhancedRepository.get_active_plants()

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

    @staticmethod
    async def export_to_csv() -> str:
        """
        Export all active plant data to CSV format.

        Returns:
            CSV content as string with all active plants

        Raises:
            HTTPException: If export fails
        """
        # Get all active plants
        plants = await PlantDataEnhancedRepository.get_active_plants()

        # Create CSV in memory
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

        # Write data rows
        for plant in plants:
            # Flatten nested structures for CSV
            farm_types = ",".join([ft.value for ft in plant.farmTypeCompatibility])
            tags_str = ",".join(plant.tags) if plant.tags else ""

            # Extract temperature data
            temp = plant.environmentalRequirements.temperature
            min_temp = temp.minCelsius
            max_temp = temp.maxCelsius
            optimal_temp = temp.optimalCelsius

            # Extract pH data
            ph = plant.soilRequirements.phRequirements
            min_ph = ph.minPH
            max_ph = ph.maxPH
            optimal_ph = ph.optimalPH

            # Extract watering frequency (simplified)
            watering_freq = plant.wateringRequirements.frequencyDays if plant.wateringRequirements else 0

            # Extract yield data
            yield_per_plant = plant.yieldEstimate.yieldPerPlant
            yield_unit = plant.yieldEstimate.yieldUnit

            row = [
                plant.plantName,
                plant.scientificName or "",
                farm_types,
                plant.growthCycle.totalCycleDays,
                min_temp,
                max_temp,
                optimal_temp,
                min_ph,
                max_ph,
                optimal_ph,
                watering_freq,
                yield_per_plant,
                yield_unit,
                tags_str,
                plant.notes or ""
            ]
            writer.writerow(row)

        logger.info(f"[PlantData Enhanced Service] Exported {len(plants)} plants to CSV")
        return output.getvalue()

    @staticmethod
    async def import_from_csv(
        csv_content: str,
        user_id: UUID,
        user_email: str
    ) -> dict:
        """
        Import plant data from CSV content.

        Args:
            csv_content: CSV file content as string
            user_id: User ID performing the import
            user_email: Email of user performing the import

        Returns:
            Dictionary with created and updated counts

        Raises:
            HTTPException: If CSV parsing or validation fails
        """
        # Parse CSV
        csv_file = io.StringIO(csv_content)
        reader = csv.DictReader(csv_file)

        created_count = 0
        updated_count = 0
        errors = []

        for row_num, row in enumerate(reader, start=2):  # Start at 2 (header is row 1)
            try:
                # Validate required fields
                if not row.get("plantName"):
                    errors.append(f"Row {row_num}: plantName is required")
                    continue

                # Parse farm types
                farm_types_str = row.get("farmTypeCompatibility", "")
                farm_types = []
                if farm_types_str:
                    for ft in farm_types_str.split(","):
                        ft_clean = ft.strip()
                        try:
                            farm_types.append(FarmTypeEnum(ft_clean))
                        except ValueError:
                            errors.append(f"Row {row_num}: Invalid farm type '{ft_clean}'")

                # Parse tags
                tags_str = row.get("tags", "")
                tags = [tag.strip() for tag in tags_str.split(",") if tag.strip()]

                # Parse numeric fields with defaults
                growth_cycle_days = int(row.get("growthCycleDays", 0))
                min_temp = float(row.get("minTemperatureCelsius", 15.0))
                max_temp = float(row.get("maxTemperatureCelsius", 30.0))
                optimal_temp = float(row.get("optimalTemperatureCelsius", 24.0))
                min_ph = float(row.get("minPH", 6.0))
                max_ph = float(row.get("maxPH", 7.0))
                optimal_ph = float(row.get("optimalPH", 6.5))
                watering_freq = int(row.get("wateringFrequencyDays", 2))
                yield_per_plant = float(row.get("yieldPerPlant", 1.0))
                yield_unit = row.get("yieldUnit", "kg")

                # Build PlantDataEnhancedCreate object with minimal required fields
                # Note: CSV import only supports basic fields, not comprehensive data
                from ...models.plant_data_enhanced import (
                    PlantDataEnhancedCreate,
                    GrowthCycleDuration,
                    TemperatureRange,
                    HumidityRange,
                    EnvironmentalRequirements,
                    PHRequirements,
                    SoilRequirements,
                    WateringRequirements,
                    YieldInfo
                )

                # Create minimal growth cycle (simplified for CSV import)
                growth_cycle = GrowthCycleDuration(
                    germinationDays=int(growth_cycle_days * 0.1),  # 10% of total
                    vegetativeDays=int(growth_cycle_days * 0.5),   # 50% of total
                    floweringDays=int(growth_cycle_days * 0.2),    # 20% of total
                    fruitingDays=int(growth_cycle_days * 0.15),    # 15% of total
                    harvestDurationDays=int(growth_cycle_days * 0.05),  # 5% of total
                    totalCycleDays=growth_cycle_days
                )

                # Create environmental requirements
                environmental_reqs = EnvironmentalRequirements(
                    temperature=TemperatureRange(
                        minCelsius=min_temp,
                        maxCelsius=max_temp,
                        optimalCelsius=optimal_temp
                    ),
                    humidity=None,
                    co2Requirements=None,
                    airCirculation=None
                )

                # Create soil requirements
                soil_reqs = SoilRequirements(
                    phRequirements=PHRequirements(
                        minPH=min_ph,
                        maxPH=max_ph,
                        optimalPH=optimal_ph
                    ),
                    soilTypes=None,
                    ecTdsRange=None
                )

                # Create watering requirements
                watering_reqs = WateringRequirements(
                    frequencyDays=watering_freq,
                    waterType=None,
                    volumePerPlantLiters=None,
                    droughtTolerance=None
                )

                # Create yield estimate
                yield_estimate = YieldInfo(
                    yieldPerPlant=yield_per_plant,
                    yieldUnit=yield_unit,
                    expectedWastePercentage=0.0
                )

                plant_data = PlantDataEnhancedCreate(
                    plantName=row["plantName"],
                    scientificName=row.get("scientificName") or None,
                    farmTypeCompatibility=farm_types if farm_types else [FarmTypeEnum.OPEN_FIELD],
                    growthCycle=growth_cycle,
                    environmentalRequirements=environmental_reqs,
                    soilRequirements=soil_reqs,
                    wateringRequirements=watering_reqs,
                    yieldEstimate=yield_estimate,
                    tags=tags,
                    notes=row.get("notes") or None
                )

                # Check if plant already exists
                existing = await PlantDataEnhancedRepository.get_by_name(row["plantName"])

                if existing:
                    # Update existing plant
                    from ...models.plant_data_enhanced import PlantDataEnhancedUpdate

                    update_data = PlantDataEnhancedUpdate(
                        scientificName=plant_data.scientificName,
                        farmTypeCompatibility=plant_data.farmTypeCompatibility,
                        growthCycle=plant_data.growthCycle,
                        environmentalRequirements=plant_data.environmentalRequirements,
                        soilRequirements=plant_data.soilRequirements,
                        wateringRequirements=plant_data.wateringRequirements,
                        yieldEstimate=plant_data.yieldEstimate,
                        tags=plant_data.tags,
                        notes=plant_data.notes
                    )

                    await PlantDataEnhancedRepository.update(
                        existing.plantDataId,
                        update_data,
                        increment_version=True
                    )
                    updated_count += 1
                else:
                    # Create new plant
                    await PlantDataEnhancedRepository.create(
                        plant_data,
                        user_id,
                        user_email
                    )
                    created_count += 1

            except ValueError as e:
                errors.append(f"Row {row_num}: Invalid numeric value - {str(e)}")
            except Exception as e:
                errors.append(f"Row {row_num}: {str(e)}")

        # If all rows failed, raise error
        if created_count == 0 and updated_count == 0 and errors:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "message": "CSV import failed",
                    "errors": errors[:10]  # Limit to first 10 errors
                }
            )

        logger.info(
            f"[PlantData Enhanced Service] CSV import completed: "
            f"{created_count} created, {updated_count} updated"
        )

        return {
            "created": created_count,
            "updated": updated_count,
            "errors": errors if errors else None
        }
