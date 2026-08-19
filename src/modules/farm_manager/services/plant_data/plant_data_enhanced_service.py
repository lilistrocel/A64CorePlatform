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

    # CSV header -> canonical field name, keyed by the header's normalized
    # form (trailing "*" required-marker and surrounding whitespace
    # stripped, lowercased). Lets import_from_csv accept BOTH the marked
    # template generate_csv_template() emits ("plantName*") AND a plain
    # unmarked CSV ("plantName") — the "*" is a display-only convention,
    # never enforced by exact string match. See _normalize_csv_header.
    _CSV_HEADER_CANONICAL_MAP = {
        "plantname": "plantName",
        "scientificname": "scientificName",
        "varietyname": "varietyName",
        "yieldperplant": "yieldPerPlant",
        "germinationdays": "germinationDays",
        "vegetativedays": "vegetativeDays",
        "floweringdays": "floweringDays",
        "fruitingdays": "fruitingDays",
        "harvestdurationdays": "harvestDurationDays",
        "planttype": "plantType",
        "farmtypecompatibility": "farmTypeCompatibility",
        "yieldunit": "yieldUnit",
        "expectedwastepercentage": "expectedWastePercentage",
        "seedsperplantingpoint": "seedsPerPlantingPoint",
        "spacingcategory": "spacingCategory",
        "mintemperaturecelsius": "minTemperatureCelsius",
        "maxtemperaturecelsius": "maxTemperatureCelsius",
        "optimaltemperaturecelsius": "optimalTemperatureCelsius",
        "humiditymin": "humidityMin",
        "humiditymax": "humidityMax",
        "humidityoptimal": "humidityOptimal",
        "minph": "minPH",
        "maxph": "maxPH",
        "optimalph": "optimalPH",
        "wateringfrequencydays": "wateringFrequencyDays",
        # Tolerate both the current header ("waterAmountPerPlantLiters")
        # and the pre-cleanup one ("waterAmountPerPlant") — the unit is
        # now explicit in the header name itself (always liters; there is
        # no separate unit field on WateringRequirements), but an older
        # CSV using the old header must still import.
        "wateramountperplantliters": "waterAmountPerPlantLiters",
        "wateramountperplant": "waterAmountPerPlantLiters",
        "dailylighthoursmin": "dailyLightHoursMin",
        "dailylighthoursmax": "dailyLightHoursMax",
        "dailylighthoursoptimal": "dailyLightHoursOptimal",
        "averagemarketvalueperkg": "averageMarketValuePerKg",
        "currency": "currency",
        "tags": "tags",
        "notes": "notes",
    }

    @staticmethod
    def _normalize_csv_header(header: str) -> str:
        """
        Normalize a raw CSV header cell to its canonical field name.

        Strips surrounding whitespace and a trailing "*" (the
        display-only "required" marker generate_csv_template() puts on
        plantName/scientificName/varietyName/yieldPerPlant), then matches
        case-insensitively against _CSV_HEADER_CANONICAL_MAP. An unknown
        header passes through unchanged (minus marker/whitespace) rather
        than being dropped, so extra/future columns are never silently
        lost — this makes import strictly MORE tolerant, never less.

        Args:
            header: Raw header cell as parsed by csv.DictReader.

        Returns:
            Canonical field name (e.g. "plantName") matching what the
            rest of import_from_csv looks up via row.get(...).
        """
        cleaned = header.strip().rstrip("*").strip()
        return PlantDataEnhancedService._CSV_HEADER_CANONICAL_MAP.get(
            cleaned.lower(), cleaned
        )

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

        Column order: 9 hard-required columns come FIRST — plantName,
        scientificName, varietyName, yieldPerPlant, and the 5 growth-cycle
        phase columns (germinationDays, vegetativeDays, floweringDays,
        fruitingDays, harvestDurationDays) — each header suffixed with "*"
        as a display-only "required" marker; import_from_csv strips it, so
        it is never matched literally. totalCycleDays is NOT a column — it
        is computed as the sum of the 5 phase columns on import (mirrors
        the variety modal, where the total is read-only/derived). Every
        column after that is optional. A CSV containing ONLY the 9
        required columns still imports — see import_from_csv's per-field
        defaults.

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

        # Write headers — 9 required (marked "*") first, then optional.
        headers = [
            "plantName*",
            "scientificName*",
            "varietyName*",
            "yieldPerPlant*",
            "germinationDays*",
            "vegetativeDays*",
            "floweringDays*",
            "fruitingDays*",
            "harvestDurationDays*",
            "plantType",
            "farmTypeCompatibility",
            "yieldUnit",
            "expectedWastePercentage",
            "seedsPerPlantingPoint",
            "spacingCategory",
            "minTemperatureCelsius",
            "maxTemperatureCelsius",
            "optimalTemperatureCelsius",
            "humidityMin",
            "humidityMax",
            "humidityOptimal",
            "minPH",
            "maxPH",
            "optimalPH",
            "wateringFrequencyDays",
            "waterAmountPerPlantLiters",
            "dailyLightHoursMin",
            "dailyLightHoursMax",
            "dailyLightHoursOptimal",
            "averageMarketValuePerKg",
            "currency",
            "tags",
            "notes",
        ]
        writer.writerow(headers)

        # Write example rows — same plantName ("Tomato"), different
        # varietyName, to demonstrate multi-row-collapses-to-one-mother.
        # Fully filled out (even the optional columns) so the example also
        # documents the format, per column order above.
        example_roma = [
            "Tomato",
            "Solanum lycopersicum",
            "Roma",
            "5.0",
            "10",  # germinationDays
            "50",  # vegetativeDays
            "20",  # floweringDays
            "15",  # fruitingDays
            "5",  # harvestDurationDays -> totalCycleDays = 100
            "vegetable",
            "open_field,greenhouse,hydroponic",
            "kg",
            "10",
            "1",
            "l",
            "15.0",
            "30.0",
            "24.0",
            "50",
            "80",
            "65",
            "6.0",
            "6.8",
            "6.5",
            "2",
            "0.5",
            "6",
            "12",
            "8",
            "3.5",
            "USD",
            "vegetable,fruit,summer",
            "Roma tomatoes — great for sauces and paste. Requires staking.",
        ]
        writer.writerow(example_roma)

        example_cherry = [
            "Tomato",
            "Solanum lycopersicum",
            "Cherry",
            "2.0",
            "8",  # germinationDays
            "45",  # vegetativeDays
            "18",  # floweringDays
            "10",  # fruitingDays
            "4",  # harvestDurationDays -> totalCycleDays = 85
            "vegetable",
            "open_field,greenhouse,hydroponic",
            "kg",
            "8",
            "1",
            "s",
            "16.0",
            "29.0",
            "23.0",
            "55",
            "85",
            "70",
            "6.0",
            "6.8",
            "6.5",
            "2",
            "0.3",
            "6",
            "12",
            "8",
            "4.0",
            "USD",
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

        9 columns are hard-required per row: plantName, scientificName,
        varietyName, yieldPerPlant (> 0), and the 5 growth-cycle phase
        columns (germinationDays, vegetativeDays, floweringDays,
        fruitingDays, harvestDurationDays — each cell must be present, 0 is
        a legal value for any individual phase, but the 5 must sum to > 0).
        totalCycleDays is never read from a column — it is always computed
        as the sum of the 5 phases, mirroring the variety modal (where the
        total is read-only/derived). A blank/invalid required value, an
        invalid (non-blank) plantType, a duplicate varietyName under its
        mother, or any other per-row error is recorded and the loop
        continues — one bad row never aborts the batch. Every other column
        is optional and gets a safe default when blank (plantType ->
        'crop', farmTypeCompatibility -> ['open_field'], yieldUnit -> 'kg',
        expectedWastePercentage -> 0, seedsPerPlantingPoint -> 1); the
        nested Optional groups (environmentalRequirements/humidity within
        it/soilRequirements/wateringRequirements/lightRequirements/
        economicsAndLabor) are left unset entirely unless at least one of
        their own cells is provided, in which case any of that group's own
        required sub-fields without a column get a sensible default. A CSV
        with only the 9 required columns still imports successfully as a
        skeleton the user completes later via the UI. CSV headers are
        matched case-insensitively with a trailing "*" stripped (see
        _normalize_csv_header), so both the marked template ("plantName*")
        and a plain CSV ("plantName") import identically.

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
            HumidityRange,
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

        # Normalize headers so a marked template ("plantName*") and a
        # plain unmarked CSV ("plantName") both import identically — see
        # _normalize_csv_header. Built once from the header row; applied
        # to every row dict below.
        header_map = {
            raw: PlantDataEnhancedService._normalize_csv_header(raw)
            for raw in (reader.fieldnames or [])
        }

        total_rows = 0
        mothers_created = 0
        mothers_reused = 0
        varieties_created = 0
        rows_skipped: List[dict] = []
        rows_failed: List[dict] = []

        # PlantMother, keyed by plantName — avoids a repository round-trip
        # for every row when multiple rows share the same plantName.
        mother_cache: dict = {}

        for row_num, raw_row in enumerate(reader, start=2):  # header is row 1
            total_rows += 1
            # Remap this row's keys through the header normalizer so the
            # rest of this method's row.get("plantName") etc. calls work
            # unchanged regardless of whether the CSV used the marked
            # template headers or plain ones.
            row = {header_map.get(k, k): v for k, v in raw_row.items()}
            try:
                # ---- 9 hard-required fields (blank -> row fails, batch continues) ----
                plant_name = (row.get("plantName") or "").strip()
                scientific_name = (row.get("scientificName") or "").strip()
                variety_name = (row.get("varietyName") or "").strip()
                yield_per_plant_raw = (row.get("yieldPerPlant") or "").strip()

                if not plant_name:
                    rows_failed.append(
                        {"row": row_num, "error": "plantName is required"}
                    )
                    continue
                if not scientific_name:
                    rows_failed.append(
                        {"row": row_num, "error": "scientificName is required"}
                    )
                    continue
                if not variety_name:
                    rows_failed.append(
                        {"row": row_num, "error": "varietyName is required"}
                    )
                    continue
                if not yield_per_plant_raw:
                    rows_failed.append(
                        {"row": row_num, "error": "yieldPerPlant is required"}
                    )
                    continue
                try:
                    yield_per_plant = float(yield_per_plant_raw)
                except ValueError:
                    rows_failed.append(
                        {
                            "row": row_num,
                            "error": f"yieldPerPlant must be a number, got '{yield_per_plant_raw}'",
                        }
                    )
                    continue
                if yield_per_plant <= 0:
                    rows_failed.append(
                        {"row": row_num, "error": "yieldPerPlant must be greater than 0"}
                    )
                    continue

                # ---- Growth cycle: 5 phase columns, ALL required ----
                # (germinationDays, vegetativeDays, floweringDays,
                # fruitingDays, harvestDurationDays). Each cell must be
                # PRESENT (blank -> row fails) but 0 is a legal value for
                # any individual phase (e.g. leafy greens: flowering=0,
                # fruiting=0). totalCycleDays is never a column — it is
                # always the computed sum of these 5, mirroring the
                # variety modal where the total is read-only/derived.
                phase_columns = (
                    "germinationDays",
                    "vegetativeDays",
                    "floweringDays",
                    "fruitingDays",
                    "harvestDurationDays",
                )
                phase_values: dict = {}
                phase_error: Optional[str] = None
                for phase_col in phase_columns:
                    phase_raw = (row.get(phase_col) or "").strip()
                    if phase_raw == "":
                        phase_error = f"{phase_col} is required"
                        break
                    try:
                        phase_values[phase_col] = int(phase_raw)
                    except ValueError:
                        phase_error = (
                            f"{phase_col} must be a whole number, got '{phase_raw}'"
                        )
                        break
                if phase_error:
                    rows_failed.append({"row": row_num, "error": phase_error})
                    continue

                germination_days = phase_values["germinationDays"]
                vegetative_days = phase_values["vegetativeDays"]
                flowering_days = phase_values["floweringDays"]
                fruiting_days = phase_values["fruitingDays"]
                harvest_duration_days = phase_values["harvestDurationDays"]
                total_cycle_days = (
                    germination_days
                    + vegetative_days
                    + flowering_days
                    + fruiting_days
                    + harvest_duration_days
                )
                if total_cycle_days <= 0:
                    rows_failed.append(
                        {
                            "row": row_num,
                            "error": "growth cycle total must be greater than 0",
                        }
                    )
                    continue

                # ---- plantType: optional, blank -> defaults to 'crop' ----
                # (only used when CREATING a new mother; ignored when the
                # mother already exists). A non-blank value is still
                # validated against the mother's allowed vocabulary by
                # attempting the real model — single source of truth for
                # the allow-list, no separate list to keep in sync.
                plant_type = (row.get("plantType") or "").strip()
                if not plant_type:
                    plant_type = "crop"
                else:
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
                        # Reason: go through the service (not the bare
                        # repository) so CSV-created mothers get the same
                        # "at least one active sellable product" invariant
                        # every other creation path gets —
                        # PlantMotherService.create_mother auto-seeds a
                        # default sellable product named after plantName
                        # when none is supplied. create_mother re-checks
                        # get_by_name itself and raises 409 on a name
                        # collision; the get_by_name check just above makes
                        # that only reachable via a same-name-inserted-
                        # mid-loop race, but it's still handled safely —
                        # the enclosing `except _HTTPException` below
                        # catches it and records this row as failed without
                        # aborting the rest of the import.
                        mother = await PlantMotherService.create_mother(
                            PlantMotherCreate(
                                plantName=plant_name,
                                scientificName=scientific_name,
                                plantType=plant_type,
                            ),
                            user_id=user_id,
                            user_email=user_email,
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

                # ---- Parse optional numeric fields ----
                # environmentalRequirements/soilRequirements/
                # wateringRequirements/lightRequirements/economicsAndLabor
                # are all Optional on the model — only build each one when
                # at least one of its underlying cell(s) is actually
                # provided, so a minimal CSV (just the 9 required columns)
                # leaves them unset rather than silently writing made-up
                # numbers. When a group IS built, any of its own required
                # sub-fields that weren't given a column get a sensible
                # default so the model's own constraints are satisfied.
                min_temp_raw = (row.get("minTemperatureCelsius") or "").strip()
                max_temp_raw = (row.get("maxTemperatureCelsius") or "").strip()
                optimal_temp_raw = (row.get("optimalTemperatureCelsius") or "").strip()
                min_temp = float(min_temp_raw) if min_temp_raw else None
                max_temp = float(max_temp_raw) if max_temp_raw else None
                optimal_temp = float(optimal_temp_raw) if optimal_temp_raw else None

                humidity_min_raw = (row.get("humidityMin") or "").strip()
                humidity_max_raw = (row.get("humidityMax") or "").strip()
                humidity_optimal_raw = (row.get("humidityOptimal") or "").strip()
                humidity_min = float(humidity_min_raw) if humidity_min_raw else None
                humidity_max = float(humidity_max_raw) if humidity_max_raw else None
                humidity_optimal = (
                    float(humidity_optimal_raw) if humidity_optimal_raw else None
                )

                min_ph_raw = (row.get("minPH") or "").strip()
                max_ph_raw = (row.get("maxPH") or "").strip()
                optimal_ph_raw = (row.get("optimalPH") or "").strip()
                min_ph = float(min_ph_raw) if min_ph_raw else None
                max_ph = float(max_ph_raw) if max_ph_raw else None
                optimal_ph = float(optimal_ph_raw) if optimal_ph_raw else None

                watering_freq_raw = (row.get("wateringFrequencyDays") or "").strip()
                water_amount_raw = (row.get("waterAmountPerPlantLiters") or "").strip()
                watering_freq = int(watering_freq_raw) if watering_freq_raw else None
                water_amount = float(water_amount_raw) if water_amount_raw else None

                light_min_raw = (row.get("dailyLightHoursMin") or "").strip()
                light_max_raw = (row.get("dailyLightHoursMax") or "").strip()
                light_optimal_raw = (row.get("dailyLightHoursOptimal") or "").strip()
                light_min = float(light_min_raw) if light_min_raw else None
                light_max = float(light_max_raw) if light_max_raw else None
                light_optimal = float(light_optimal_raw) if light_optimal_raw else None

                market_value_raw = (row.get("averageMarketValuePerKg") or "").strip()
                currency_raw = (row.get("currency") or "").strip()
                market_value = float(market_value_raw) if market_value_raw else None

                seeds_raw = (row.get("seedsPerPlantingPoint") or "").strip()
                seeds_per_planting_point = int(seeds_raw) if seeds_raw else 1

                yield_unit = row.get("yieldUnit", "kg") or "kg"
                expected_waste = float(
                    row.get("expectedWastePercentage", 0) or 0
                )

                # ---- Build nested structures from CSV flat fields ----
                growth_cycle = GrowthCycleDuration(
                    germinationDays=germination_days,
                    vegetativeDays=vegetative_days,
                    floweringDays=flowering_days,
                    fruitingDays=fruiting_days,
                    harvestDurationDays=harvest_duration_days,
                    totalCycleDays=total_cycle_days,
                )

                # environmentalRequirements: TemperatureRange is a REQUIRED
                # sub-field, so this group is only built when at least one
                # temperature cell is provided — humidity alone (with no
                # temperature) is not enough to build it, per design.
                environmental_reqs = None
                if min_temp is not None or max_temp is not None or optimal_temp is not None:
                    humidity_range = None
                    if (
                        humidity_min is not None
                        or humidity_max is not None
                        or humidity_optimal is not None
                    ):
                        humidity_range = HumidityRange(
                            minPercentage=(
                                humidity_min if humidity_min is not None else 40.0
                            ),
                            maxPercentage=(
                                humidity_max if humidity_max is not None else 80.0
                            ),
                            optimalPercentage=(
                                humidity_optimal
                                if humidity_optimal is not None
                                else 60.0
                            ),
                        )
                    environmental_reqs = EnvironmentalRequirements(
                        temperature=TemperatureRange(
                            minCelsius=min_temp if min_temp is not None else 15.0,
                            maxCelsius=max_temp if max_temp is not None else 30.0,
                            optimalCelsius=(
                                optimal_temp if optimal_temp is not None else 24.0
                            ),
                        ),
                        humidity=humidity_range,
                        co2RequirementPpm=None,
                        airCirculation=None,
                    )

                soil_reqs = None
                if min_ph is not None or max_ph is not None or optimal_ph is not None:
                    soil_reqs = SoilRequirements(
                        phRequirements=PHRequirements(
                            minPH=min_ph if min_ph is not None else 6.0,
                            maxPH=max_ph if max_ph is not None else 7.0,
                            optimalPH=optimal_ph if optimal_ph is not None else 6.5,
                        ),
                        soilTypes=[SoilTypeEnum.LOAMY],
                    )

                watering_reqs = None
                if watering_freq is not None or water_amount is not None:
                    watering_reqs = WateringRequirements(
                        frequencyDays=watering_freq if watering_freq is not None else 2,
                        waterType=WaterTypeEnum.TAP,
                        amountPerPlantLiters=water_amount,
                        droughtTolerance=ToleranceLevelEnum.MEDIUM,
                    )

                # lightRequirements: lightType is REQUIRED but there's no
                # lightType column on this CSV — default to FULL_SUN (a
                # natural, sensible baseline) whenever the daily-light-hours
                # cells are provided. Otherwise this stays None.
                light_reqs = None
                if light_min is not None or light_max is not None or light_optimal is not None:
                    light_reqs = LightRequirements(
                        lightType=LightTypeEnum.FULL_SUN,
                        minHoursDaily=light_min if light_min is not None else 6.0,
                        maxHoursDaily=light_max if light_max is not None else 12.0,
                        optimalHoursDaily=(
                            light_optimal if light_optimal is not None else 8.0
                        ),
                    )

                economics_and_labor = None
                if market_value is not None or currency_raw:
                    economics_and_labor = EconomicsAndLabor(
                        averageMarketValuePerKg=market_value,
                        currency=currency_raw or "USD",
                        totalManHoursPerPlant=1.0,
                    )

                yield_info = YieldInfo(
                    yieldPerPlant=yield_per_plant,
                    yieldUnit=yield_unit,
                    seedsPerPlantingPoint=seeds_per_planting_point,
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
                    lightRequirements=light_reqs,
                    gradingStandards=[],
                    economicsAndLabor=economics_and_labor,
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
