"""
Block API Routes

Endpoints for managing farm blocks.
"""

from fastapi import APIRouter, Depends, Query, status
from typing import Optional
from uuid import UUID

from ...models.block import Block, BlockCreate, BlockUpdate, BlockStatus, BlockStatusUpdate
from ...services.block.block_service_new import BlockService
from ...middleware.auth import get_current_active_user, CurrentUser, require_permission
from ...utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

router = APIRouter(prefix="/farms/{farm_id}/blocks", tags=["blocks"])


@router.post(
    "",
    response_model=SuccessResponse[Block],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new block"
)
async def create_block(
    farm_id: UUID,
    block_data: BlockCreate,
    current_user: CurrentUser = Depends(require_permission("farm.manage"))
):
    """
    Create a new block in a farm.

    Requires **farm.manage** permission.

    **Validations**:
    - Farm must exist and be active
    - Block name must be unique within farm
    - maxPlants must be greater than 0
    """
    block = await BlockService.create_block(
        farm_id,
        block_data,
        current_user.userId,
        current_user.email
    )

    return SuccessResponse(
        data=block,
        message="Block created successfully"
    )


@router.get(
    "",
    response_model=PaginatedResponse[Block],
    summary="List blocks in a farm"
)
async def list_blocks(
    farm_id: UUID,
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    status_filter: Optional[BlockStatus] = Query(None, alias="status", description="Filter by status"),
    blockType: Optional[str] = Query(None, description="Filter by block type"),
    targetCrop: Optional[UUID] = Query(None, description="Filter by target crop"),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get list of blocks in a farm with pagination.

    **Query Parameters**:
    - `page`: Page number (default: 1)
    - `perPage`: Items per page (default: 20, max: 100)
    - `status`: Filter by block status (optional)
    - `blockType`: Filter by block type (optional)
    - `targetCrop`: Filter by target crop ID (optional)
    """
    blocks, total, total_pages = await BlockService.list_blocks(
        farm_id=farm_id,
        page=page,
        per_page=perPage,
        status=status_filter,
        block_type=blockType,
        target_crop=targetCrop
    )

    return PaginatedResponse(
        data=blocks,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/{block_id}",
    response_model=SuccessResponse[Block],
    summary="Get block by ID"
)
async def get_block(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get a specific block by ID.

    Returns complete block information including current state,
    planting information, and dates.
    """
    block = await BlockService.get_block(block_id)

    # Verify block belongs to the specified farm
    if str(block.farmId) != str(farm_id):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    return SuccessResponse(data=block)


@router.patch(
    "/{block_id}",
    response_model=SuccessResponse[Block],
    summary="Update a block"
)
async def update_block(
    farm_id: UUID,
    block_id: UUID,
    update_data: BlockUpdate,
    current_user: CurrentUser = Depends(require_permission("farm.manage"))
):
    """
    Update block information.

    Requires **farm.manage** permission.

    **Validations**:
    - Block name must remain unique within farm
    - maxPlants must be greater than 0 if provided
    """
    block = await BlockService.get_block(block_id)

    # Verify block belongs to the specified farm
    if str(block.farmId) != str(farm_id):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    updated_block = await BlockService.update_block(
        block_id,
        update_data
    )

    return SuccessResponse(
        data=updated_block,
        message="Block updated successfully"
    )


@router.delete(
    "/{block_id}",
    response_model=SuccessResponse[dict],
    summary="Delete a block"
)
async def delete_block(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(require_permission("farm.manage"))
):
    """
    Delete a block.

    Requires **farm.manage** permission.

    **Important**: Block must be in 'empty' state to be deleted.
    Cannot delete blocks that are planted or in use.
    """
    block = await BlockService.get_block(block_id)

    # Verify block belongs to the specified farm
    if str(block.farmId) != str(farm_id):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    await BlockService.delete_block(block_id)

    return SuccessResponse(
        data={"blockId": str(block_id)},
        message="Block deleted successfully"
    )


@router.get(
    "/{block_id}/kpi",
    response_model=SuccessResponse[dict],
    summary="Get block KPI dashboard"
)
async def get_block_kpi(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get comprehensive KPI dashboard data for a block.

    Returns:
    - Current status and whether on track with expected timeline
    - Days since planting and days until harvest
    - KPI metrics (predicted vs actual yield, efficiency percentage)
    - Harvest summary (total quantity, quality breakdown)
    - Alert summary (active alerts count)
    """
    block = await BlockService.get_block(block_id)

    # Verify block belongs to the specified farm
    if str(block.farmId) != str(farm_id):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    kpi_data = await BlockService.get_block_kpi(block_id)

    return SuccessResponse(data=kpi_data)


# Status change endpoint
@router.patch(
    "/{block_id}/status",
    response_model=SuccessResponse[Block],
    summary="Change block status"
)
async def change_block_status(
    farm_id: UUID,
    block_id: UUID,
    status_update: BlockStatusUpdate,
    current_user: CurrentUser = Depends(require_permission("farm.operate"))
):
    """
    Change block status with validation and automatic archival.

    Requires **farm.operate** permission.

    **Valid Status Transitions**:
    - `empty` → `planted`, `alert`
    - `planted` → `growing`, `alert`
    - `growing` → `fruiting`, `alert`
    - `fruiting` → `harvesting`, `alert`
    - `harvesting` → `cleaning`, `alert`
    - `cleaning` → `empty`, `alert` (triggers automatic archival)
    - `alert` → any status (restores from previousStatus)

    **Special Requirements**:
    - Transitioning to 'planted' requires `targetCrop` and `actualPlantCount`
    - Cleaning → empty triggers automatic archival of the cycle

    **Automatic Features**:
    - Calculates expected harvest dates based on plant growth cycle
    - Calculates predicted yield based on plant count
    - Archives completed cycles when transitioning from cleaning to empty
    """
    block = await BlockService.get_block(block_id)

    # Verify block belongs to the specified farm
    if str(block.farmId) != str(farm_id):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    updated_block = await BlockService.change_status(
        block_id,
        status_update,
        current_user.userId,
        current_user.email
    )

    return SuccessResponse(
        data=updated_block,
        message=f"Block status changed to '{status_update.newStatus.value}'"
    )


# Get valid transitions for a block
@router.get(
    "/{block_id}/valid-transitions",
    response_model=SuccessResponse[dict],
    summary="Get valid status transitions"
)
async def get_valid_status_transitions(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get list of valid status transitions for a block's current status.

    Useful for UI to show available actions and prevent invalid transitions.
    """
    block = await BlockService.get_block(block_id)

    # Verify block belongs to the specified farm
    if str(block.farmId) != str(farm_id):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    valid_transitions = BlockService.VALID_TRANSITIONS.get(block.state, [])

    return SuccessResponse(
        data={
            "currentStatus": block.state.value,
            "validTransitions": [state.value for state in valid_transitions]
        }
    )
