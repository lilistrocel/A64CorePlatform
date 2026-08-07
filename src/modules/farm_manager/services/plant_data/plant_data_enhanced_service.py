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
    def _validate_detail_fields(plant_data: PlantDataEnhancedCreate) -> None:
        """
        Shared validation for the "detail" fields of enhanced plant data:
        growth-cycle stage totals, temperature/humidity ranges, pH range.

        Extracted so both the standalone create endpoint (create_plant_data
        below) and the Plant Library Phase 2 mother-scoped variety creation
        path (PlantMotherService.create_variety_for_mother, which builds a
        full PlantDataEnhancedCreate with plantName/scientificName copied
        from the mother) enforce identical rules — "reuse the existing
        plant_data_enhanced create path/validation for the detailed
        fields," per that endpoint's design.

        Raises:
            HTTPException: 422 on any validation failure.
        """
        # Validate growth cycle totals match (skip if individual stages are all 0)
        calculated_total = (
            plant_data.growthCycle.germinationDays
            + plant_data.growthCycle.vegetativeDays
            + plant_data.growthCycle.floweringDays
            + plant_data.growthCycle.fruitingDays
            + plant_data.growthCycle.harvestDurationDays
        )

        if (
            calculated_total > 0
            and calculated_total != plant_data.growthCycle.totalCycleDays
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Growth cycle mismatch: sum of stages ({calculated_total}) "
                f"does not match totalCycleDays ({plant_data.growthCycle.totalCycleDays})",
            )

        # Validate temperature range (only if environmentalRequirements provided)
        if (
            plant_data.environmentalRequirements
            and plant_data.environmentalRequirements.temperature
        ):
            temp = plant_data.environmentalRequirements.temperature
            if temp.minCelsius > temp.maxCelsius:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Temperature range invalid: minCelsius must be <= maxCelsius",
                )

            if not (temp.minCelsius <= temp.optimalCelsius <= temp.maxCelsius):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Optimal temperature must be within min-max range",
                )

            # Validate humidity if provided
            if plant_data.environmentalRequirements.humidity:
                hum = plant_data.environmentalRequirements.humidity
                if hum.minPercentage > hum.maxPercentage:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="Humidity range invalid: minPercentage must be <= maxPercentage",
                    )

                if not (
                    hum.minPercentage <= hum.optimalPercentage <= hum.maxPercentage
                ):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="Optimal humidity must be within min-max range",
                    )

        # Validate pH range (only if soilRequirements provided)
        if plant_data.soilRequirements and plant_data.soilRequirements.phRequirements:
            ph = plant_data.soilRequirements.phRequirements
            if ph.minPH > ph.maxPH:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="pH range invalid: minPH must be <= maxPH",
                )

            if not (ph.minPH <= ph.optimalPH <= ph.maxPH):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Optimal pH must be within min-max range",
                )

    @staticmethod
    async def create_plant_data(
        plant_data: PlantDataEnhancedCreate, user_id: UUID, user_email: str
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
                detail=f"Plant data for '{plant_data.plantName}' already exists",
            )

        PlantDataEnhancedService._validate_detail_fields(plant_data)

        # Create plant data
        plant = await PlantDataEnhancedRepository.create(
            plant_data, user_id, user_email
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
                status_code=status.HTTP_404_NOT_FOUND, detail="Plant data not found"
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
        is_active: Optional[bool] = None,
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
            is_active=is_active,
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
        plant_data_id: UUID, update_data: PlantDataEnhancedUpdate, user_id: UUID
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
                status_code=status.HTTP_404_NOT_FOUND, detail="Plant data not found"
            )

        # Plant Library Phase 2: plantName/scientificName are now inherited
        # from this variety's mother product (plant_mothers) — renaming a
        # product happens at PATCH /plant-mothers/{motherPlantId}, which
        # cascades the new name to every one of its varieties. Letting the
        # client change them independently here would silently desync a
        # variety from its mother's product identity, so they are rejected
        # (fail closed) rather than silently ignored. motherPlantId
        # re-parenting is also rejected — moving a variety to a different
        # mother is not a supported operation in this phase (no cascade
        # side effects are computed for it).
        if update_data.plantName is not None or update_data.scientificName is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="plantName/scientificName are inherited from this variety's "
                "mother product and cannot be changed here. Update the mother "
                "product instead (PATCH /plant-mothers/{motherPlantId}).",
            )
        if update_data.motherPlantId is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="motherPlantId cannot be changed via this endpoint.",
            )

        # Validate temperature range if updating
        if update_data.environmentalRequirements:
            temp = update_data.environmentalRequirements.temperature
            if temp.minCelsius > temp.maxCelsius:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Temperature range invalid: minCelsius must be <= maxCelsius",
                )

            if not (temp.minCelsius <= temp.optimalCelsius <= temp.maxCelsius):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Optimal temperature must be within min-max range",
                )

        # Validate pH range if updating
        if update_data.soilRequirements:
            ph = update_data.soilRequirements.phRequirements
            if ph.minPH > ph.maxPH:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="pH range invalid: minPH must be <= maxPH",
                )

            if not (ph.minPH <= ph.optimalPH <= ph.maxPH):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Optimal pH must be within min-max range",
                )

        # Validate growth cycle if updating (skip if individual stages are all 0)
        if update_data.growthCycle:
            calculated_total = (
                update_data.growthCycle.germinationDays
                + update_data.growthCycle.vegetativeDays
                + update_data.growthCycle.floweringDays
                + update_data.growthCycle.fruitingDays
                + update_data.growthCycle.harvestDurationDays
            )

            if (
                calculated_total > 0
                and calculated_total != update_data.growthCycle.totalCycleDays
            ):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Growth cycle mismatch: sum of stages ({calculated_total}) "
                    f"does not match totalCycleDays ({update_data.growthCycle.totalCycleDays})",
                )

        # Update plant data (increments version)
        updated_plant = await PlantDataEnhancedRepository.update(
            plant_data_id, update_data, increment_version=True
        )

        if not updated_plant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Plant data not found or already deleted",
            )

        logger.info(
            f"[PlantData Enhanced Service] User {user_id} updated plant data: "
            f"{plant_data_id} (v{updated_plant.dataVersion})"
        )
        return updated_plant

    @staticmethod
    async def delete_plant_data(plant_data_id: UUID, user_id: UUID) -> bool:
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
                status_code=status.HTTP_404_NOT_FOUND, detail="Plant data not found"
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
        plant_data_id: UUID, new_name: str, user_id: UUID, user_email: str
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
                detail=f"Plant data for '{new_name}' already exists",
            )

        # Clone
        cloned = await PlantDataEnhancedRepository.clone(
            plant_data_id, new_name, user_id, user_email
        )

        if not cloned:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Source plant data not found",
            )

        logger.info(
            f"[PlantData Enhanced Service] User {user_id} cloned plant data: "
            f"{plant_data_id} -> {cloned.plantDataId} ({new_name})"
        )
        return cloned

    @staticmethod
    def generate_csv_template() -> str:
        """
        Generate CSV template with headers for the Plant Library mother/
        variety import format.

        Each ROW is a VARIETY (a plant_data_enhanced cultivation recipe).
        Rows sharing the same plantName collapse onto one find-or-created
        MOTHER (plant_mothers product) — see import_from_csv for the
        find-or-create semantics. The two example rows below both use
        plantName "Tomato" with different varietyName values ("Roma" /
        "Cherry") to demonstrate this collapsing behavior.

        Returns:
            CSV template as string

        Notes:
            - This is a simplified template for basic + detail fields only
            - Complex nested structures (fertilizer schedules, pest management,
              grading standards, etc.) require JSON format or manual entry via
              the API (POST /plant-mothers/{id}/varieties)
        """
        output = io.StringIO()
        writer = csv.writer(output)

        # Write headers
        headers = [
            "plantName",
            "scientificName",
            "plantType",
            "varietyName",
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
            "expectedWastePercentage",
            "spacingCategory",
            "tags",
            "notes",
        ]
        writer.writerow(headers)

        # Write example rows — same plantName ("Tomato"), different
        # varietyName, to demonstrate multi-row-collapses-to-one-mother.
        example_roma = [
            "Tomato",
            "Solanum lycopersicum",
            "vegetable",
            "Roma",
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
            "10",
            "l",
            "vegetable,fruit,summer",
            "Roma tomatoes — great for sauces and paste. Requires staking.",
        ]
        writer.writerow(example_roma)

        example_cherry = [
            "Tomato",
            "Solanum lycopersicum",
            "vegetable",
            "Cherry",
            "open_field,greenhouse,hydroponic",
            "85",
            "16.0",
            "29.0",
            "23.0",
            "6.0",
            "6.8",
            "6.5",
            "2",
            "2.0",
            "kg",
            "8",
            "s",
            "vegetable,fruit,summer",
            "Cherry tomatoes — sweet, high-yield, great for snacking.",
        ]
        writer.writerow(example_cherry)

        return output.getvalue()

    @staticmethod
    async def get_by_farm_type(
        farm_type: FarmTypeEnum, page: int = 1, per_page: int = 20
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
            farm_type, skip=skip, limit=per_page
        )

        total_pages = (total + per_page - 1) // per_page

        return plants, total, total_pages

    @staticmethod
    async def get_by_tags(
        tags: List[str], page: int = 1, per_page: int = 20
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
            tags, skip=skip, limit=per_page
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
            "notes",
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
            watering_freq = (
                plant.wateringRequirements.frequencyDays
                if plant.wateringRequirements
                else 0
            )

            # Extract yield data
            yield_per_plant = plant.yieldInfo.yieldPerPlant if plant.yieldInfo else 0
            yield_unit = plant.yieldInfo.yieldUnit if plant.yieldInfo else "kg"

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
                (
                    plant.additionalInfo.notes
                    if plant.additionalInfo and plant.additionalInfo.notes
                    else ""
                ),
            ]
            writer.writerow(row)

        logger.info(
            f"[PlantData Enhanced Service] Exported {len(plants)} plants to CSV"
        )
        return output.getvalue()

    @staticmethod
    async def import_from_csv(
        csv_content: str,
        user_id: UUID,
        user_email: str,
        organization_id: Optional[str] = None,
        division_id: Optional[str] = None,
    ) -> dict:
        """
        Import Plant Library data from CSV — mother/variety model.

        Each ROW is a VARIETY (a plant_data_enhanced cultivation recipe).
        Rows sharing the same plantName collapse onto one find-or-created
        MOTHER (plant_mothers product): mothers are looked up by plantName
        and reused when they already exist (locally cached within this
        call so N rows for the same plantName only touch the repository
        once), or created when they don't. Variety creation is delegated
        entirely to PlantMotherService.create_variety_for_mother (Plant
        Library Phase 2) — this method does NOT duplicate its 404/409
        validation, basic-info inheritance, or detail-field validation.

        A bad row (missing plantName/plantType/varietyName, an invalid
        plantType, a duplicate varietyName under its mother, or any other
        per-row error) is recorded and the loop continues — one bad row
        never aborts the batch.

        Args:
            csv_content: CSV file content as string
            user_id: User ID performing the import
            user_email: Email of user performing the import
            organization_id: Org scope stamped onto mothers created by this
                import (mirrors PlantMotherService.create_mother's treatment
                — from the acting user, never client-supplied)
            division_id: Division scope, same treatment as organization_id

        Returns:
            Dictionary: {
                "totalRows": int,
                "mothersCreated": int,
                "mothersReused": int,
                "varietiesCreated": int,
                "rowsSkipped": [{"row": int, "reason": str}, ...],
                "rowsFailed": [{"row": int, "error": str}, ...],
            }

        Raises:
            HTTPException: 422 if every row failed and nothing was created
                or reused (a completely unusable CSV) — never raised for a
                partially-bad CSV where at least one row succeeded.
        """
        from pydantic import ValidationError
        from fastapi import HTTPException as _HTTPException

        from ...models.plant_data_enhanced import (
            GrowthCycleDuration,
            TemperatureRange,
            EnvironmentalRequirements,
            PHRequirements,
            SoilRequirements,
            WateringRequirements,
            YieldInfo,
            LightRequirements,
            EconomicsAndLabor,
            AdditionalInformation,
            LightTypeEnum,
            GrowthHabitEnum,
            SoilTypeEnum,
            WaterTypeEnum,
            ToleranceLevelEnum,
        )
        from ...models.spacing_standards import SpacingCategory
        from ...models.plant_mother import PlantMotherCreate, VarietyCreateForMother
        # Reason: deferred imports to avoid a circular import — this module
        # is imported by plant_mother_service.py at module load time
        # (services/plant_data/__init__.py imports plant_data_enhanced_service
        # before plant_mother_service), so importing them back at this
        # module's top level would create a load-order cycle.
        from .plant_mother_repository import PlantMotherRepository
        from .plant_mother_service import PlantMotherService

        # Parse CSV
        csv_file = io.StringIO(csv_content)
        reader = csv.DictReader(csv_file)

        total_rows = 0
        mothers_created = 0
        mothers_reused = 0
        varieties_created = 0
        rows_skipped: List[dict] = []
        rows_failed: List[dict] = []

        # PlantMother, keyed by plantName — avoids a repository round-trip
        # for every row when multiple rows share the same plantName.
        mother_cache: dict = {}

        for row_num, row in enumerate(reader, start=2):  # header is row 1
            total_rows += 1
            try:
                plant_name = (row.get("plantName") or "").strip()
                plant_type = (row.get("plantType") or "").strip()
                variety_name = (row.get("varietyName") or "").strip()

                if not plant_name:
                    rows_failed.append(
                        {"row": row_num, "error": "plantName is required"}
                    )
                    continue
                if not variety_name:
                    rows_failed.append(
                        {"row": row_num, "error": "varietyName is required"}
                    )
                    continue
                if not plant_type:
                    rows_failed.append(
                        {"row": row_num, "error": "plantType is required"}
                    )
                    continue

                # Validate plantType against the mother's allowed vocabulary
                # by attempting the real model — single source of truth for
                # the allow-list, no separate list to keep in sync.
                try:
                    PlantMotherCreate(plantName=plant_name, plantType=plant_type)
                except ValidationError as exc:
                    rows_failed.append(
                        {
                            "row": row_num,
                            "error": f"Invalid plantType '{plant_type}': {exc.errors()[0].get('msg', str(exc))}",
                        }
                    )
                    continue

                # ---- Mother find-or-create (cached within this run) ----
                if plant_name in mother_cache:
                    mother = mother_cache[plant_name]
                    mothers_reused += 1
                else:
                    mother = await PlantMotherRepository.get_by_name(plant_name)
                    if mother:
                        mothers_reused += 1
                    else:
                        mother = await PlantMotherRepository.create(
                            PlantMotherCreate(
                                plantName=plant_name,
                                scientificName=row.get("scientificName") or None,
                                plantType=plant_type,
                            ),
                            created_by=user_id,
                            created_by_email=user_email,
                            organization_id=organization_id,
                            division_id=division_id,
                        )
                        mothers_created += 1
                    mother_cache[plant_name] = mother

                # ---- Parse farm types ----
                farm_types_str = row.get("farmTypeCompatibility", "")
                farm_types = []
                if farm_types_str:
                    for ft in farm_types_str.split(","):
                        ft_clean = ft.strip()
                        if not ft_clean:
                            continue
                        try:
                            farm_types.append(FarmTypeEnum(ft_clean))
                        except ValueError:
                            logger.warning(
                                f"[PlantData Enhanced Service] CSV import row "
                                f"{row_num}: invalid farm type '{ft_clean}', ignoring"
                            )

                # ---- Parse tags ----
                tags_str = row.get("tags", "")
                tags = [
                    tag.strip() for tag in tags_str.split(",") if tag.strip()
                ] or None

                # ---- Parse spacingCategory (density) ----
                spacing_category_str = (row.get("spacingCategory") or "").strip()
                spacing_category = None
                if spacing_category_str:
                    try:
                        spacing_category = SpacingCategory(spacing_category_str)
                    except ValueError:
                        logger.warning(
                            f"[PlantData Enhanced Service] CSV import row "
                            f"{row_num}: invalid spacingCategory "
                            f"'{spacing_category_str}', ignoring"
                        )

                # ---- Parse numeric fields with defaults ----
                growth_cycle_days = int(row.get("growthCycleDays", 0) or 0)
                min_temp = float(row.get("minTemperatureCelsius", 15.0) or 15.0)
                max_temp = float(row.get("maxTemperatureCelsius", 30.0) or 30.0)
                optimal_temp = float(row.get("optimalTemperatureCelsius", 24.0) or 24.0)
                min_ph = float(row.get("minPH", 6.0) or 6.0)
                max_ph = float(row.get("maxPH", 7.0) or 7.0)
                optimal_ph = float(row.get("optimalPH", 6.5) or 6.5)
                watering_freq = int(row.get("wateringFrequencyDays", 2) or 2)
                yield_per_plant = float(row.get("yieldPerPlant", 1.0) or 1.0)
                yield_unit = row.get("yieldUnit", "kg") or "kg"
                expected_waste = float(
                    row.get("expectedWastePercentage", 0) or 0
                )

                # ---- Build nested structures from CSV flat fields ----
                if growth_cycle_days > 0:
                    germination_days = max(int(growth_cycle_days * 0.1), 1)
                    vegetative_days = max(int(growth_cycle_days * 0.5), 1)
                    flowering_days = int(growth_cycle_days * 0.2)
                    fruiting_days = int(growth_cycle_days * 0.15)
                else:
                    germination_days = 1
                    vegetative_days = 1
                    flowering_days = 0
                    fruiting_days = 0
                # Reason: harvestDurationDays absorbs whatever integer-
                # truncation remainder is left so the five stages always sum
                # to EXACTLY totalCycleDays. Building each stage as an
                # independent percentage (like the pre-mother-model flat CSV
                # import did) rounds short by 1-2 days for most non-round
                # growthCycleDays values (e.g. 85 -> stages summed to 83).
                # That mismatch was invisible before this rewrite because the
                # old import path wrote straight to the repository, bypassing
                # PlantDataEnhancedService._validate_detail_fields entirely —
                # variety creation now goes through
                # PlantMotherService.create_variety_for_mother, which calls
                # that same validation, so an inexact sum would 422 on nearly
                # every real-world CSV row.
                stage_subtotal = (
                    germination_days + vegetative_days + flowering_days + fruiting_days
                )
                harvest_duration_days = max(
                    max(growth_cycle_days, 1) - stage_subtotal, 0
                )
                total_cycle_days = stage_subtotal + harvest_duration_days

                growth_cycle = GrowthCycleDuration(
                    germinationDays=germination_days,
                    vegetativeDays=vegetative_days,
                    floweringDays=flowering_days,
                    fruitingDays=fruiting_days,
                    harvestDurationDays=harvest_duration_days,
                    totalCycleDays=total_cycle_days,
                )

                environmental_reqs = EnvironmentalRequirements(
                    temperature=TemperatureRange(
                        minCelsius=min_temp,
                        maxCelsius=max_temp,
                        optimalCelsius=optimal_temp,
                    ),
                    humidity=None,
                    co2RequirementPpm=None,
                    airCirculation=None,
                )

                soil_reqs = SoilRequirements(
                    phRequirements=PHRequirements(
                        minPH=min_ph, maxPH=max_ph, optimalPH=optimal_ph
                    ),
                    soilTypes=[SoilTypeEnum.LOAMY],
                )

                watering_reqs = WateringRequirements(
                    frequencyDays=watering_freq,
                    waterType=WaterTypeEnum.TAP,
                    amountPerPlantLiters=None,
                    droughtTolerance=ToleranceLevelEnum.MEDIUM,
                )

                yield_info = YieldInfo(
                    yieldPerPlant=yield_per_plant,
                    yieldUnit=yield_unit,
                    expectedWastePercentage=expected_waste,
                )

                variety_create = VarietyCreateForMother(
                    varietyName=variety_name,
                    farmTypeCompatibility=(
                        farm_types if farm_types else [FarmTypeEnum.OPEN_FIELD]
                    ),
                    growthCycle=growth_cycle,
                    yieldInfo=yield_info,
                    environmentalRequirements=environmental_reqs,
                    wateringRequirements=watering_reqs,
                    soilRequirements=soil_reqs,
                    diseasesAndPests=[],
                    lightRequirements=LightRequirements(
                        lightType=LightTypeEnum.FULL_SUN,
                        minHoursDaily=6.0,
                        maxHoursDaily=12.0,
                        optimalHoursDaily=8.0,
                    ),
                    gradingStandards=[],
                    economicsAndLabor=EconomicsAndLabor(
                        totalManHoursPerPlant=1.0,
                    ),
                    additionalInfo=AdditionalInformation(
                        growthHabit=GrowthHabitEnum.BUSH,
                        notes=row.get("notes") or None,
                    ),
                    spacingCategory=spacing_category,
                    tags=tags,
                )

                try:
                    await PlantMotherService.create_variety_for_mother(
                        mother.plantMotherId, variety_create, user_id, user_email
                    )
                    varieties_created += 1
                except _HTTPException as exc:
                    if exc.status_code == status.HTTP_409_CONFLICT:
                        rows_skipped.append(
                            {"row": row_num, "reason": str(exc.detail)}
                        )
                    else:
                        rows_failed.append(
                            {"row": row_num, "error": str(exc.detail)}
                        )

            except ValueError as e:
                rows_failed.append(
                    {"row": row_num, "error": f"Invalid numeric value - {str(e)}"}
                )
            except _HTTPException as e:
                rows_failed.append({"row": row_num, "error": str(e.detail)})
            except Exception as e:
                rows_failed.append({"row": row_num, "error": str(e)})

        # Raise only when the CSV was completely unusable — nothing created,
        # nothing reused-and-skipped, only failures. A partially-bad CSV
        # (at least one variety created) never raises.
        if total_rows > 0 and varieties_created == 0 and not rows_skipped and rows_failed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "message": "CSV import failed — no varieties created",
                    "rowsFailed": rows_failed[:10],  # Limit to first 10 errors
                },
            )

        logger.info(
            f"[PlantData Enhanced Service] CSV import completed: "
            f"{mothers_created} mother(s) created, {mothers_reused} reused, "
            f"{varieties_created} variet{'y' if varieties_created == 1 else 'ies'} "
            f"created, {len(rows_skipped)} skipped, {len(rows_failed)} failed "
            f"(of {total_rows} rows)"
        )

        return {
            "totalRows": total_rows,
            "mothersCreated": mothers_created,
            "mothersReused": mothers_reused,
            "varietiesCreated": varieties_created,
            "rowsSkipped": rows_skipped,
            "rowsFailed": rows_failed,
        }
