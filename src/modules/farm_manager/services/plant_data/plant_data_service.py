"""
PlantData Service - Business Logic Layer

Handles business logic, validation, and CSV import for plant data.
"""

from typing import List, Optional, BinaryIO
from uuid import UUID
from fastapi import HTTPException, status, UploadFile
import csv
import io
import logging

from ...models.plant_data import PlantData, PlantDataCreate, PlantDataUpdate
from .plant_data_repository import PlantDataRepository

logger = logging.getLogger(__name__)


class PlantDataService:
    """Service for PlantData business logic"""

    # CSV column mapping
    CSV_COLUMNS = [
        "plantName",
        "scientificName",
        "plantType",
        "growthCycleDays",
        "minTemperatureCelsius",
        "maxTemperatureCelsius",
        "optimalPHMin",
        "optimalPHMax",
        "wateringFrequencyDays",
        "sunlightHoursDaily",
        "expectedYieldPerPlant",
        "yieldUnit",
        "notes",
        "tags"
    ]

    @staticmethod
    async def create_plant_data(
        plant_data: PlantDataCreate,
        user_id: str,
        user_email: str = "unknown@a64core.com"
    ) -> PlantData:
        """
        Create new plant data with validation

        Args:
            plant_data: Plant data creation data
            user_id: User creating the plant data

        Returns:
            Created PlantData object

        Raises:
            HTTPException: If validation fails
        """
        # Check if plant name already exists
        existing = await PlantDataRepository.get_by_name(plant_data.plantName)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Plant data for '{plant_data.plantName}' already exists"
            )

        # Validate growth cycle
        if plant_data.growthCycleDays <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="growthCycleDays must be greater than 0"
            )

        # Validate temperature range
        if plant_data.minTemperatureCelsius and plant_data.maxTemperatureCelsius:
            if plant_data.minTemperatureCelsius > plant_data.maxTemperatureCelsius:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="minTemperatureCelsius must be less than or equal to maxTemperatureCelsius"
                )

        # Validate pH range
        if plant_data.optimalPHMin and plant_data.optimalPHMax:
            if plant_data.optimalPHMin > plant_data.optimalPHMax:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="optimalPHMin must be less than or equal to optimalPHMax"
                )

        # Create plant data
        plant = await PlantDataRepository.create(plant_data, user_id, user_email)

        logger.info(f"[PlantData Service] User {user_id} created plant data: {plant.plantDataId}")
        return plant

    @staticmethod
    async def get_plant_data(plant_data_id: UUID) -> PlantData:
        """
        Get plant data by ID

        Args:
            plant_data_id: PlantData ID

        Returns:
            PlantData object

        Raises:
            HTTPException: If plant data not found
        """
        plant = await PlantDataRepository.get_by_id(plant_data_id)

        if not plant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Plant data not found"
            )

        return plant

    @staticmethod
    async def get_all_plant_data(
        page: int = 1,
        per_page: int = 20,
        search: Optional[str] = None,
        is_active: Optional[bool] = None
    ) -> tuple[List[PlantData], int]:
        """
        Get all plant data with pagination and filters

        Args:
            page: Page number (1-indexed)
            per_page: Items per page
            search: Optional search term
            is_active: Optional filter by active status

        Returns:
            Tuple of (list of plant data, total count)
        """
        # Calculate skip
        skip = (page - 1) * per_page

        # Get plant data
        plants, total = await PlantDataRepository.get_all(
            skip=skip,
            limit=per_page,
            search=search,
            is_active=is_active
        )

        return plants, total

    @staticmethod
    async def update_plant_data(
        plant_data_id: UUID,
        update_data: PlantDataUpdate,
        user_id: str
    ) -> PlantData:
        """
        Update plant data

        Args:
            plant_data_id: PlantData ID
            update_data: Update data
            user_id: User updating the plant data

        Returns:
            Updated PlantData object

        Raises:
            HTTPException: If plant data not found or validation fails
        """
        # Get existing plant data
        plant = await PlantDataRepository.get_by_id(plant_data_id)
        if not plant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Plant data not found"
            )

        # Validate temperature range if updating
        if update_data.minTemperatureCelsius is not None or update_data.maxTemperatureCelsius is not None:
            temp_min = update_data.minTemperatureCelsius if update_data.minTemperatureCelsius is not None else plant.minTemperatureCelsius
            temp_max = update_data.maxTemperatureCelsius if update_data.maxTemperatureCelsius is not None else plant.maxTemperatureCelsius

            if temp_min and temp_max and temp_min > temp_max:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="minTemperatureCelsius must be less than or equal to maxTemperatureCelsius"
                )

        # Validate pH range if updating
        if update_data.optimalPHMin is not None or update_data.optimalPHMax is not None:
            ph_min = update_data.optimalPHMin if update_data.optimalPHMin is not None else plant.optimalPHMin
            ph_max = update_data.optimalPHMax if update_data.optimalPHMax is not None else plant.optimalPHMax

            if ph_min and ph_max and ph_min > ph_max:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="optimalPHMin must be less than or equal to optimalPHMax"
                )

        # Update plant data
        updated_plant = await PlantDataRepository.update(plant_data_id, update_data)

        logger.info(f"[PlantData Service] User {user_id} updated plant data: {plant_data_id}")
        return updated_plant

    @staticmethod
    async def delete_plant_data(plant_data_id: UUID, user_id: str) -> bool:
        """
        Delete plant data (soft delete)

        Args:
            plant_data_id: PlantData ID
            user_id: User deleting the plant data

        Returns:
            True if deleted

        Raises:
            HTTPException: If plant data not found
        """
        # Get plant data
        plant = await PlantDataRepository.get_by_id(plant_data_id)
        if not plant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Plant data not found"
            )

        # Soft delete
        deleted = await PlantDataRepository.delete(plant_data_id)

        if deleted:
            logger.info(f"[PlantData Service] User {user_id} deleted plant data: {plant_data_id}")

        return deleted

    @staticmethod
    async def import_from_csv(
        file: UploadFile,
        user_id: str,
        user_email: str = "unknown@a64core.com",
        update_existing: bool = False
    ) -> dict:
        """
        Import plant data from CSV file

        Args:
            file: Uploaded CSV file
            user_id: User importing the data
            update_existing: If True, update existing plants; if False, skip duplicates

        Returns:
            Dictionary with import statistics

        Raises:
            HTTPException: If CSV format is invalid
        """
        # Validate file type
        if not file.filename.endswith('.csv'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be a CSV file"
            )

        try:
            # Read file contents
            contents = await file.read()
            csv_text = contents.decode('utf-8')
            csv_file = io.StringIO(csv_text)

            # Parse CSV
            reader = csv.DictReader(csv_file)

            # Validate columns
            if not reader.fieldnames:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="CSV file is empty or has no headers"
                )

            # Check for required columns
            required_columns = ["plantName", "growthCycleDays", "plantType", "expectedYieldPerPlant", "yieldUnit"]
            missing_columns = [col for col in required_columns if col not in reader.fieldnames]
            if missing_columns:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Missing required columns: {', '.join(missing_columns)}"
                )

            # Parse rows
            new_plants = []
            updates = []
            skipped = []
            errors = []

            for row_num, row in enumerate(reader, start=2):  # Start at 2 (header is row 1)
                try:
                    # Check if plant exists
                    existing = await PlantDataRepository.get_by_name(row["plantName"])

                    if existing:
                        if update_existing:
                            # Prepare update
                            update_data = PlantDataService._parse_csv_row_to_update(row)
                            updates.append((row["plantName"], update_data))
                        else:
                            skipped.append(row["plantName"])
                    else:
                        # Prepare new plant
                        plant_data = PlantDataService._parse_csv_row_to_create(row)
                        new_plants.append(plant_data)

                except Exception as e:
                    errors.append(f"Row {row_num}: {str(e)}")

            # Execute bulk operations
            created_count = 0
            updated_count = 0

            if new_plants:
                try:
                    created_plants = await PlantDataRepository.bulk_create(new_plants, user_id, user_email)
                    created_count = len(created_plants)
                except Exception as e:
                    errors.append(f"Bulk create failed: {str(e)}")

            if updates:
                try:
                    updated_count = await PlantDataRepository.bulk_update(updates)
                except Exception as e:
                    errors.append(f"Bulk update failed: {str(e)}")

            result = {
                "created": created_count,
                "updated": updated_count,
                "skipped": len(skipped),
                "errors": len(errors),
                "errorDetails": errors[:10] if errors else []  # Limit error details
            }

            logger.info(
                f"[PlantData Service] User {user_id} imported CSV: "
                f"{created_count} created, {updated_count} updated, "
                f"{len(skipped)} skipped, {len(errors)} errors"
            )

            return result

        except UnicodeDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file encoding. Please use UTF-8 encoded CSV file"
            )
        except Exception as e:
            logger.error(f"[PlantData Service] CSV import error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to import CSV: {str(e)}"
            )

    @staticmethod
    def _parse_csv_row_to_create(row: dict) -> PlantDataCreate:
        """Parse CSV row to PlantDataCreate object"""
        # Parse tags if provided (comma-separated string to list)
        tags = None
        if row.get("tags"):
            tags = [tag.strip() for tag in row["tags"].split(",")]

        return PlantDataCreate(
            plantName=row["plantName"],
            scientificName=row.get("scientificName") or None,
            plantType=row["plantType"],
            growthCycleDays=int(row["growthCycleDays"]),
            minTemperatureCelsius=float(row["minTemperatureCelsius"]) if row.get("minTemperatureCelsius") else None,
            maxTemperatureCelsius=float(row["maxTemperatureCelsius"]) if row.get("maxTemperatureCelsius") else None,
            optimalPHMin=float(row["optimalPHMin"]) if row.get("optimalPHMin") else None,
            optimalPHMax=float(row["optimalPHMax"]) if row.get("optimalPHMax") else None,
            wateringFrequencyDays=int(row["wateringFrequencyDays"]) if row.get("wateringFrequencyDays") else None,
            sunlightHoursDaily=row.get("sunlightHoursDaily") or None,
            expectedYieldPerPlant=float(row["expectedYieldPerPlant"]),
            yieldUnit=row["yieldUnit"],
            notes=row.get("notes") or None,
            tags=tags
        )

    @staticmethod
    def _parse_csv_row_to_update(row: dict) -> PlantDataUpdate:
        """Parse CSV row to PlantDataUpdate object"""
        # Parse tags if provided (comma-separated string to list)
        tags = None
        if row.get("tags"):
            tags = [tag.strip() for tag in row["tags"].split(",")]

        return PlantDataUpdate(
            scientificName=row.get("scientificName") or None,
            plantType=row.get("plantType") or None,
            growthCycleDays=int(row["growthCycleDays"]) if row.get("growthCycleDays") else None,
            minTemperatureCelsius=float(row["minTemperatureCelsius"]) if row.get("minTemperatureCelsius") else None,
            maxTemperatureCelsius=float(row["maxTemperatureCelsius"]) if row.get("maxTemperatureCelsius") else None,
            optimalPHMin=float(row["optimalPHMin"]) if row.get("optimalPHMin") else None,
            optimalPHMax=float(row["optimalPHMax"]) if row.get("optimalPHMax") else None,
            wateringFrequencyDays=int(row["wateringFrequencyDays"]) if row.get("wateringFrequencyDays") else None,
            sunlightHoursDaily=row.get("sunlightHoursDaily") or None,
            expectedYieldPerPlant=float(row["expectedYieldPerPlant"]) if row.get("expectedYieldPerPlant") else None,
            yieldUnit=row.get("yieldUnit") or None,
            notes=row.get("notes") or None,
            tags=tags
        )

    @staticmethod
    def generate_csv_template() -> str:
        """
        Generate CSV template with headers and example data

        Returns:
            CSV template as string
        """
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=PlantDataService.CSV_COLUMNS)

        # Write header
        writer.writeheader()

        # Write example row
        example = {
            "plantName": "Tomato",
            "scientificName": "Solanum lycopersicum",
            "plantType": "Crop",
            "growthCycleDays": "90",
            "minTemperatureCelsius": "18",
            "maxTemperatureCelsius": "27",
            "optimalPHMin": "6.0",
            "optimalPHMax": "6.8",
            "wateringFrequencyDays": "2",
            "sunlightHoursDaily": "6-8",
            "expectedYieldPerPlant": "5.0",
            "yieldUnit": "kg",
            "notes": "Popular salad and cooking vegetable. Requires staking for support.",
            "tags": "vegetable,salad,summer"
        }
        writer.writerow(example)

        return output.getvalue()
