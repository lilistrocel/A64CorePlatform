"""
Block API Routes

Endpoints for managing farm blocks.
"""

from fastapi import APIRouter, Depends, Query, status
from typing import Optional
from uuid import UUID

from ...models.block import Block, BlockCreate, BlockUpdate, BlockState
from ...services.block import BlockService
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
        block_data,
        farm_id,
        current_user.userId
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
    state: Optional[BlockState] = Query(None, description="Filter by state"),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get list of blocks in a farm with pagination.

    **Query Parameters**:
    - `page`: Page number (default: 1)
    - `perPage`: Items per page (default: 20, max: 100)
    - `state`: Filter by block state (optional)
    """
    blocks, total = await BlockService.get_farm_blocks(
        farm_id,
        page=page,
        per_page=perPage,
        state=state
    )

    return PaginatedResponse(
        data=blocks,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=(total + perPage - 1) // perPage
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
        update_data,
        current_user.userId
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

    await BlockService.delete_block(block_id, current_user.userId)

    return SuccessResponse(
        data={"blockId": str(block_id)},
        message="Block deleted successfully"
    )


@router.get(
    "/{block_id}/summary",
    response_model=SuccessResponse[dict],
    summary="Get block summary"
)
async def get_block_summary(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get detailed summary of a block.

    Returns:
    - Block details
    - Farm information
    - Current utilization statistics
    - Planting information (if planted)
    - Historical data (cycles, harvests, yield)
    """
    block = await BlockService.get_block(block_id)

    # Verify block belongs to the specified farm
    if str(block.farmId) != str(farm_id):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    summary = await BlockService.get_block_summary(block_id)

    return SuccessResponse(data=summary)


# State transition endpoint
@router.post(
    "/{block_id}/state",
    response_model=SuccessResponse[Block],
    summary="Transition block state"
)
async def transition_block_state(
    farm_id: UUID,
    block_id: UUID,
    new_state: BlockState = Query(..., description="Target state"),
    planting_id: Optional[UUID] = Query(None, description="Planting ID (required for 'planted' state)"),
    current_user: CurrentUser = Depends(require_permission("farm.operate"))
):
    """
    Transition a block to a new state.

    Requires **farm.operate** permission.

    **Valid State Transitions**:
    - `empty` → `planned`
    - `planned` → `planted`, `empty`
    - `planted` → `harvesting`, `alert`, `empty`
    - `harvesting` → `empty`, `alert`
    - `alert` → `empty`, `harvesting`, `planted`

    **Notes**:
    - Transitioning to 'planted' requires a `planting_id`
    - Invalid transitions will be rejected with an error message
    """
    block = await BlockService.get_block(block_id)

    # Verify block belongs to the specified farm
    if str(block.farmId) != str(farm_id):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    updated_block = await BlockService.transition_state(
        block_id,
        new_state,
        current_user.userId,
        planting_id=planting_id
    )

    return SuccessResponse(
        data=updated_block,
        message=f"Block transitioned to '{new_state.value}' state"
    )


# Get valid transitions for a block
@router.get(
    "/{block_id}/transitions",
    response_model=SuccessResponse[dict],
    summary="Get valid state transitions"
)
async def get_valid_transitions(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get list of valid state transitions for a block's current state.

    Useful for UI to show available actions.
    """
    block = await BlockService.get_block(block_id)

    # Verify block belongs to the specified farm
    if str(block.farmId) != str(farm_id):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    valid_transitions = BlockService.get_valid_transitions(block.state)

    return SuccessResponse(
        data={
            "currentState": block.state.value,
            "validTransitions": [state.value for state in valid_transitions]
        }
    )
