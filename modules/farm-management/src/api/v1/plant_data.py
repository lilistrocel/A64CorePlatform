"""
PlantData API Routes

Endpoints for managing plant cultivation data.
"""

from fastapi import APIRouter, Depends, Query, UploadFile, File, status
from fastapi.responses import Response
from typing import Optional
from uuid import UUID

from ...models.plant_data import PlantData, PlantDataCreate, PlantDataUpdate
from ...services.plant_data import PlantDataService
from ...middleware.auth import get_current_active_user, CurrentUser, require_permission
from ...utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

router = APIRouter(prefix="/plant-data", tags=["plant-data"])


@router.post(
    "",
    response_model=SuccessResponse[PlantData],
    status_code=status.HTTP_201_CREATED,
    summary="Create plant data"
)
async def create_plant_data(
    plant_data: PlantDataCreate,
    current_user: CurrentUser = Depends(require_permission("agronomist"))
):
    """
    Create new plant cultivation data.

    Requires **agronomist** permission.

    **Validations**:
    - Plant name must be unique
    - growthDurationDays must be greater than 0
    - Temperature range must be valid (min <= max)
    - pH range must be valid (min <= max)
    """
    plant = await PlantDataService.create_plant_data(
        plant_data,
        current_user.userId
    )

    return SuccessResponse(
        data=plant,
        message="Plant data created successfully"
    )


@router.get(
    "",
    response_model=PaginatedResponse[PlantData],
    summary="List plant data"
)
async def list_plant_data(
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Search by plant name or scientific name"),
    isActive: Optional[bool] = Query(None, description="Filter by active status"),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get list of plant data with pagination and filters.

    **Query Parameters**:
    - `page`: Page number (default: 1)
    - `perPage`: Items per page (default: 20, max: 100)
    - `search`: Search term for plant name or scientific name
    - `isActive`: Filter by active status
    """
    plants, total = await PlantDataService.get_all_plant_data(
        page=page,
        per_page=perPage,
        search=search,
        is_active=isActive
    )

    return PaginatedResponse(
        data=plants,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=(total + perPage - 1) // perPage
        )
    )


@router.get(
    "/{plant_data_id}",
    response_model=SuccessResponse[PlantData],
    summary="Get plant data by ID"
)
async def get_plant_data(
    plant_data_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get specific plant data by ID.

    Returns complete plant cultivation information including:
    - Growth requirements
    - Environmental needs
    - Watering and fertilizer schedules
    - Expected yield
    """
    plant = await PlantDataService.get_plant_data(plant_data_id)

    return SuccessResponse(data=plant)


@router.patch(
    "/{plant_data_id}",
    response_model=SuccessResponse[PlantData],
    summary="Update plant data"
)
async def update_plant_data(
    plant_data_id: UUID,
    update_data: PlantDataUpdate,
    current_user: CurrentUser = Depends(require_permission("agronomist"))
):
    """
    Update plant cultivation data.

    Requires **agronomist** permission.

    **Note**: Updates increment the version number for tracking changes.

    **Validations**:
    - Temperature range must remain valid
    - pH range must remain valid
    """
    updated_plant = await PlantDataService.update_plant_data(
        plant_data_id,
        update_data,
        current_user.userId
    )

    return SuccessResponse(
        data=updated_plant,
        message="Plant data updated successfully"
    )


@router.delete(
    "/{plant_data_id}",
    response_model=SuccessResponse[dict],
    summary="Delete plant data"
)
async def delete_plant_data(
    plant_data_id: UUID,
    current_user: CurrentUser = Depends(require_permission("agronomist"))
):
    """
    Delete plant data (soft delete).

    Requires **agronomist** permission.

    **Note**: This is a soft delete. The data is marked as inactive but not removed from the database.
    """
    await PlantDataService.delete_plant_data(plant_data_id, current_user.userId)

    return SuccessResponse(
        data={"plantDataId": str(plant_data_id)},
        message="Plant data deleted successfully"
    )


@router.post(
    "/import/csv",
    response_model=SuccessResponse[dict],
    summary="Import plant data from CSV"
)
async def import_plant_data_csv(
    file: UploadFile = File(..., description="CSV file with plant data"),
    updateExisting: bool = Query(False, description="Update existing plants or skip duplicates"),
    current_user: CurrentUser = Depends(require_permission("agronomist"))
):
    """
    Import plant data from CSV file.

    Requires **agronomist** permission.

    **CSV Format**:
    - Required columns: `plantName`, `growthDurationDays`
    - See template for all available columns

    **Parameters**:
    - `updateExisting`: If true, update existing plants; if false, skip duplicates

    **Returns**:
    - Statistics: created, updated, skipped, errors count
    - Error details (up to 10 errors)

    **Example CSV**:
    ```csv
    plantName,scientificName,plantType,growthDurationDays,optimalTempMin,optimalTempMax,...
    Tomato,Solanum lycopersicum,Vegetable,90,18,27,...
    Lettuce,Lactuca sativa,Vegetable,45,15,20,...
    ```
    """
    result = await PlantDataService.import_from_csv(
        file,
        current_user.userId,
        update_existing=updateExisting
    )

    return SuccessResponse(
        data=result,
        message=f"CSV import completed: {result['created']} created, "
                f"{result['updated']} updated, {result['skipped']} skipped, "
                f"{result['errors']} errors"
    )


@router.get(
    "/template/csv",
    summary="Download CSV template",
    responses={
        200: {
            "content": {"text/csv": {}},
            "description": "CSV template file"
        }
    }
)
async def download_csv_template(
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Download CSV template for plant data import.

    Returns a CSV file with:
    - All column headers
    - One example row with sample data
    - Comments explaining each field

    Use this template to import plant data via the `/import/csv` endpoint.
    """
    template = PlantDataService.generate_csv_template()

    return Response(
        content=template,
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=plant_data_template.csv"
        }
    )
