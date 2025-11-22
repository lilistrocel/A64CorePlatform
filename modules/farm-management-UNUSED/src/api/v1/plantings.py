"""
Planting API Routes

Endpoints for managing plantings (planting plans and execution).
"""

from fastapi import APIRouter, Depends, Query, status
from typing import Optional
from uuid import UUID

from ...models.planting import Planting, PlantingCreate
from ...services.planting import PlantingService
from ...middleware.auth import get_current_active_user, CurrentUser, require_permission
from ...utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

router = APIRouter(prefix="/plantings", tags=["plantings"])


@router.post(
    "",
    response_model=SuccessResponse[dict],
    status_code=status.HTTP_201_CREATED,
    summary="Create planting plan",
    description="Create a planting plan for a block. Validates capacity, calculates yield prediction, and transitions block to PLANNED state."
)
async def create_planting_plan(
    planting_data: PlantingCreate,
    current_user: CurrentUser = Depends(require_permission("farm.manage"))
):
    """
    Create a planting plan for a block.

    **Requirements:**
    - Requires **farm.manage** permission
    - Block must be in EMPTY state
    - Total plants cannot exceed block maxPlants
    - All plant data IDs must exist
    - All plants must have the same yield unit

    **What happens:**
    1. Validates block capacity and state
    2. Fetches plant data and creates snapshots
    3. Calculates predicted yield
    4. Creates planting record
    5. Transitions block to PLANNED state

    **Response:**
    - Created planting with yield prediction
    - Updated block information
    """
    planting, block = await PlantingService.create_planting_plan(
        planting_data,
        UUID(current_user.userId),
        current_user.email
    )

    return SuccessResponse(
        data={
            "planting": planting.model_dump(mode="json"),
            "block": block
        },
        message=f"Planting plan created successfully. Predicted yield: {planting.predictedYield} {planting.yieldUnit}"
    )


@router.post(
    "/{planting_id}/mark-planted",
    response_model=SuccessResponse[dict],
    summary="Mark planting as planted",
    description="Mark a planned planting as planted (farmer executes the plan). Transitions block to PLANTED state."
)
async def mark_as_planted(
    planting_id: UUID,
    current_user: CurrentUser = Depends(require_permission("farm.operate"))
):
    """
    Mark a planned planting as planted (farmer executes the plan).

    **Requirements:**
    - Requires **farm.operate** permission
    - Planting must be in PLANNED status
    - Block must be in PLANNED state

    **What happens:**
    1. Validates planting and block states
    2. Records planting timestamp and farmer
    3. Calculates estimated harvest dates
    4. Updates planting status to PLANTED
    5. Transitions block to PLANTED state

    **Response:**
    - Updated planting with harvest estimation
    - Updated block information
    """
    planting, block = await PlantingService.mark_as_planted(
        planting_id,
        UUID(current_user.userId),
        current_user.email
    )

    return SuccessResponse(
        data={
            "planting": planting.model_dump(mode="json"),
            "block": block
        },
        message=f"Planting marked as planted. Estimated harvest: {planting.estimatedHarvestStartDate.strftime('%Y-%m-%d') if planting.estimatedHarvestStartDate else 'N/A'}"
    )


@router.get(
    "/{planting_id}",
    response_model=SuccessResponse[Planting],
    summary="Get planting by ID",
    description="Get detailed information about a specific planting."
)
async def get_planting(
    planting_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get detailed information about a specific planting.

    **Requirements:**
    - Requires authentication

    **Response:**
    - Complete planting information including:
      - Plant details with snapshots
      - Predicted and actual yields
      - Planting and harvest dates
      - Status and timeline
    """
    planting = await PlantingService.get_planting_by_id(planting_id)

    return SuccessResponse(
        data=planting,
        message="Planting retrieved successfully"
    )


@router.get(
    "",
    response_model=PaginatedResponse[Planting],
    summary="List plantings for a farm",
    description="Get list of plantings for a farm with pagination and filtering."
)
async def list_plantings(
    farmId: UUID = Query(..., description="Farm ID to filter plantings"),
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[str] = Query(None, description="Filter by status (planned, planted, harvesting, completed)"),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get list of plantings for a farm with pagination.

    **Query Parameters:**
    - `farmId`: Farm ID (required)
    - `page`: Page number (default: 1)
    - `perPage`: Items per page (default: 20, max: 100)
    - `status`: Filter by status (optional)

    **Statuses:**
    - `planned`: Planting plan created, not yet planted
    - `planted`: Planted, waiting for harvest window
    - `harvesting`: Currently harvesting
    - `completed`: Harvest completed

    **Response:**
    - Paginated list of plantings
    - Total count and pagination metadata
    """
    plantings, total = await PlantingService.get_farm_plantings(
        farmId,
        page=page,
        per_page=perPage,
        status=status
    )

    return PaginatedResponse(
        data=plantings,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=(total + perPage - 1) // perPage
        )
    )
