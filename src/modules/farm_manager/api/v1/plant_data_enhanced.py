"""
PlantData Enhanced API Routes

Endpoints for managing comprehensive plant cultivation data with enhanced schema.
"""

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from typing import Optional, List
from uuid import UUID

from ...models.plant_data_enhanced import (
    PlantDataEnhanced,
    PlantDataEnhancedCreate,
    PlantDataEnhancedUpdate,
    FarmTypeEnum,
)
from ...services.plant_data import PlantDataEnhancedService
from ...middleware.auth import get_current_active_user, CurrentUser, require_permission
from ...utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

router = APIRouter(prefix="/plant-data-enhanced", tags=["plant-data-enhanced"])


@router.post(
    "",
    response_model=SuccessResponse[PlantDataEnhanced],
    status_code=status.HTTP_201_CREATED,
    summary="Create enhanced plant data"
)
async def create_plant_data(
    plant_data: PlantDataEnhancedCreate,
    current_user: CurrentUser = Depends(require_permission("agronomist"))
):
    """
    Create new comprehensive plant cultivation data with enhanced schema.

    Requires **agronomist** permission.

    **Comprehensive Fields**:
    - Basic information (name, scientific name, farm type compatibility)
    - Detailed growth cycle breakdown (germination, vegetative, flowering, fruiting, harvest)
    - Environmental requirements (temperature, humidity, CO2, air circulation)
    - Soil and pH requirements with EC/TDS ranges
    - Watering specifications with drought tolerance
    - Light requirements (type, hours, intensity, photoperiod sensitivity)
    - Fertilizer application schedule by growth stage
    - Pesticide application schedule with safety notes
    - Disease and pest management information
    - Quality grading standards
    - Economics and labor requirements
    - Spacing and support requirements
    - Companion and incompatible plants

    **Validations**:
    - Plant name must be unique
    - Growth cycle stages must sum to totalCycleDays
    - Temperature range must be valid (min <= optimal <= max)
    - pH range must be valid (min <= optimal <= max)
    - Humidity range must be valid (if provided)
    """
    plant = await PlantDataEnhancedService.create_plant_data(
        plant_data,
        UUID(current_user.userId),
        current_user.email
    )

    return SuccessResponse(
        data=plant,
        message="Enhanced plant data created successfully"
    )


@router.get(
    "",
    response_model=PaginatedResponse[PlantDataEnhanced],
    summary="Search enhanced plant data"
)
async def search_plant_data(
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Text search on name, scientific name, tags"),
    farmType: Optional[str] = Query(None, description="Filter by farm type compatibility"),
    minGrowthCycle: Optional[int] = Query(None, ge=0, description="Minimum growth cycle days"),
    maxGrowthCycle: Optional[int] = Query(None, ge=0, description="Maximum growth cycle days"),
    tags: Optional[str] = Query(None, description="Comma-separated tags to filter"),
    contributor: Optional[str] = Query(None, description="Filter by data contributor (e.g., 'Tayeb')"),
    targetRegion: Optional[str] = Query(None, description="Filter by target region (e.g., 'UAE')"),
    isActive: Optional[bool] = Query(None, description="Filter by active status (true/false)"),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Search and filter comprehensive plant data with advanced filters.

    **Query Parameters**:
    - `page`: Page number (default: 1)
    - `perPage`: Items per page (default: 20, max: 100)
    - `search`: Text search on plantName, scientificName, tags
    - `farmType`: Filter by farm type compatibility (open_field, greenhouse, hydroponic, vertical_farm, aquaponic)
    - `minGrowthCycle`: Filter plants with growth cycle >= this value
    - `maxGrowthCycle`: Filter plants with growth cycle <= this value
    - `tags`: Comma-separated tags (e.g., "vegetable,summer,high-value")
    - `contributor`: Filter by data contributor (e.g., "Tayeb", "System")
    - `targetRegion`: Filter by target region (e.g., "UAE", "Mediterranean")
    - `isActive`: Filter by active status (true = only active, false = only inactive)

    **Response**:
    - Returns paginated results with comprehensive plant data
    - Includes metadata (total count, current page, total pages)
    """
    # Parse tags from comma-separated string
    tag_list = None
    if tags:
        tag_list = [tag.strip() for tag in tags.split(",") if tag.strip()]

    plants, total, total_pages = await PlantDataEnhancedService.search_plant_data(
        page=page,
        per_page=perPage,
        search=search,
        farm_type=farmType,
        min_growth_cycle=minGrowthCycle,
        max_growth_cycle=maxGrowthCycle,
        tags=tag_list,
        contributor=contributor,
        target_region=targetRegion,
        is_active=isActive
    )

    return PaginatedResponse(
        data=plants,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/filter-options",
    summary="Get filter options for plant data",
    response_model=SuccessResponse[dict]
)
async def get_filter_options(
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get distinct values for filter dropdowns.

    **Response**:
    - `contributors`: List of unique contributor names (e.g., ["Tayeb", "System"])
    - `targetRegions`: List of unique target regions (e.g., ["UAE", "Mediterranean"])
    - `tags`: List of unique tags (e.g., ["vegetable", "fruit", "summer"])

    **Use Case**:
    - Populate filter dropdown options in UI
    - Show only values that exist in the database
    """
    options = await PlantDataEnhancedService.get_filter_options()
    return SuccessResponse(data=options)


@router.get(
    "/active",
    response_model=SuccessResponse[List[PlantDataEnhanced]],
    summary="Get all active plant data for dropdowns"
)
async def get_active_plants(
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get all active plant data for use in dropdowns (e.g., block planting).

    **Use Case**:
    - Populate plant selection dropdowns in block creation/planting
    - Only returns plants marked as active (isActive=true)
    - Returns all matching plants without pagination (for dropdowns)

    **Response**:
    - List of active PlantDataEnhanced objects
    """
    plants = await PlantDataEnhancedService.get_active_plants()
    return SuccessResponse(data=plants)


@router.get(
    "/{plant_data_id}",
    response_model=SuccessResponse[PlantDataEnhanced],
    summary="Get enhanced plant data by ID"
)
async def get_plant_data(
    plant_data_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get specific enhanced plant data by ID.

    Returns complete comprehensive plant cultivation information including:
    - Detailed growth cycle stages
    - Environmental requirements (temperature, humidity, CO2)
    - Soil and pH specifications with EC/TDS ranges
    - Comprehensive watering requirements
    - Light requirements with intensity and photoperiod
    - Fertilizer application schedules by growth stage
    - Pesticide application schedules with safety notes
    - Disease and pest management strategies
    - Quality grading standards
    - Economic and labor information
    - Spacing and support requirements
    - Companion and incompatible plants
    """
    plant = await PlantDataEnhancedService.get_plant_data(plant_data_id)

    return SuccessResponse(data=plant)


@router.patch(
    "/{plant_data_id}",
    response_model=SuccessResponse[PlantDataEnhanced],
    summary="Update enhanced plant data"
)
async def update_plant_data(
    plant_data_id: UUID,
    update_data: PlantDataEnhancedUpdate,
    current_user: CurrentUser = Depends(require_permission("agronomist"))
):
    """
    Update comprehensive plant cultivation data.

    Requires **agronomist** permission.

    **Note**: Updates automatically increment the dataVersion number for tracking changes.
    This enables versioning and freezing of plant data when used in planting plans.

    **Validations**:
    - Temperature range must remain valid
    - pH range must remain valid
    - Growth cycle stages must sum correctly if updated
    - All range validations apply
    """
    updated_plant = await PlantDataEnhancedService.update_plant_data(
        plant_data_id,
        update_data,
        UUID(current_user.userId)
    )

    return SuccessResponse(
        data=updated_plant,
        message=f"Plant data updated successfully (version {updated_plant.dataVersion})"
    )


@router.delete(
    "/{plant_data_id}",
    response_model=SuccessResponse[dict],
    summary="Delete enhanced plant data"
)
async def delete_plant_data(
    plant_data_id: UUID,
    current_user: CurrentUser = Depends(require_permission("agronomist"))
):
    """
    Delete enhanced plant data (soft delete).

    Requires **agronomist** permission.

    **Note**: This is a soft delete. The data is marked with deletedAt timestamp
    but not removed from the database. This preserves historical data and
    allows recovery if needed.
    """
    await PlantDataEnhancedService.delete_plant_data(
        plant_data_id,
        UUID(current_user.userId)
    )

    return SuccessResponse(
        data={"plantDataId": str(plant_data_id)},
        message="Plant data deleted successfully"
    )


@router.post(
    "/{plant_data_id}/clone",
    response_model=SuccessResponse[PlantDataEnhanced],
    status_code=status.HTTP_201_CREATED,
    summary="Clone plant data"
)
async def clone_plant_data(
    plant_data_id: UUID,
    newName: str = Query(..., description="New plant name for the clone"),
    current_user: CurrentUser = Depends(require_permission("agronomist"))
):
    """
    Clone existing plant data with a new name.

    Requires **agronomist** permission.

    **Use Cases**:
    - Create variations of existing plants (e.g., "Tomato - Cherry" from "Tomato")
    - Duplicate template data for similar cultivars
    - Start with proven cultivation data and customize

    **Parameters**:
    - `newName`: New unique name for the cloned plant (required, must be unique)

    **Returns**:
    - New plant data with dataVersion=1 and fresh timestamps
    - All cultivation details copied from source
    """
    cloned = await PlantDataEnhancedService.clone_plant_data(
        plant_data_id,
        newName,
        UUID(current_user.userId),
        current_user.email
    )

    return SuccessResponse(
        data=cloned,
        message=f"Plant data cloned successfully as '{newName}'"
    )


@router.get(
    "/template/csv",
    summary="Download CSV template for basic fields",
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
    Download CSV template for enhanced plant data import (basic fields only).

    Returns a CSV file with:
    - All basic column headers (plantName, scientificName, farmType, etc.)
    - One example row with sample data

    **Note**: The CSV template only supports basic fields. For comprehensive data
    including fertilizer schedules, pest management, and grading standards,
    use the JSON API endpoints directly.

    **Basic Fields in CSV**:
    - plantName, scientificName, farmTypeCompatibility
    - growthCycleDays
    - minTemperatureCelsius, maxTemperatureCelsius, optimalTemperatureCelsius
    - minPH, maxPH, optimalPH
    - wateringFrequencyDays
    - yieldPerPlant, yieldUnit
    - tags, notes
    """
    template = PlantDataEnhancedService.generate_csv_template()

    return Response(
        content=template,
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=plant_data_enhanced_template.csv"
        }
    )


@router.get(
    "/by-farm-type/{farm_type}",
    response_model=PaginatedResponse[PlantDataEnhanced],
    summary="Get plants by farm type compatibility"
)
async def get_by_farm_type(
    farm_type: FarmTypeEnum,
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get plant data compatible with specific farm type.

    **Farm Types**:
    - `open_field`: Traditional outdoor farming
    - `greenhouse`: Controlled environment greenhouse
    - `hydroponic`: Soilless hydroponic systems
    - `vertical_farm`: Vertical indoor farming
    - `aquaponic`: Combined aquaculture and hydroponics

    **Use Case**:
    - Filter plants suitable for your farm infrastructure
    - Plan crop selection based on farm capabilities
    """
    plants, total, total_pages = await PlantDataEnhancedService.get_by_farm_type(
        farm_type,
        page=page,
        per_page=perPage
    )

    return PaginatedResponse(
        data=plants,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/by-tags/{tags}",
    response_model=PaginatedResponse[PlantDataEnhanced],
    summary="Get plants by tags"
)
async def get_by_tags(
    tags: str,
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get plant data by tags (any match).

    **Parameters**:
    - `tags`: Comma-separated list of tags to search

    **Tag Examples**:
    - Season: summer, winter, year-round
    - Category: vegetable, fruit, herb, leafy-green
    - Characteristics: fast-growing, high-value, labor-intensive
    - System: hydroponic-friendly, vertical-farm-suitable
    - Difficulty: beginner-friendly, advanced

    **Returns**:
    - All plants matching ANY of the specified tags
    """
    tag_list = [tag.strip() for tag in tags.split(",") if tag.strip()]

    plants, total, total_pages = await PlantDataEnhancedService.get_by_tags(
        tag_list,
        page=page,
        per_page=perPage
    )

    return PaginatedResponse(
        data=plants,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )
