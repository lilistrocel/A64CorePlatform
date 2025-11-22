"""
Block Service - Business Logic Layer

Handles business logic, validation, and state transitions for blocks.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException, status
import logging

from ...models.block import Block, BlockCreate, BlockUpdate, BlockState
from .block_repository import BlockRepository
from ..farm.farm_repository import FarmRepository

logger = logging.getLogger(__name__)


class BlockService:
    """Service for Block business logic"""

    # Valid state transitions
    STATE_TRANSITIONS = {
        BlockState.EMPTY: [BlockState.PLANNED],
        BlockState.PLANNED: [BlockState.PLANTED, BlockState.EMPTY],
        BlockState.PLANTED: [BlockState.HARVESTING, BlockState.ALERT, BlockState.EMPTY],
        BlockState.HARVESTING: [BlockState.EMPTY, BlockState.ALERT],
        BlockState.ALERT: [BlockState.EMPTY, BlockState.HARVESTING, BlockState.PLANTED]
    }

    @staticmethod
    async def create_block(
        block_data: BlockCreate,
        farm_id: UUID,
        user_id: str
    ) -> Block:
        """
        Create a new block with validation

        Args:
            block_data: Block creation data
            farm_id: Farm ID
            user_id: User creating the block

        Returns:
            Created Block object

        Raises:
            HTTPException: If validation fails or farm not found
        """
        # Verify farm exists and user has access
        farm_repo = FarmRepository()
        farm = await farm_repo.get_by_id(farm_id)
        if not farm:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Farm not found"
            )

        # Verify farm is active
        if not farm.isActive:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot add blocks to inactive farm"
            )

        # Check if block name is unique within farm
        existing_blocks, _ = await BlockRepository.get_by_farm(farm_id)
        if any(b.name == block_data.name for b in existing_blocks):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Block with name '{block_data.name}' already exists in this farm"
            )

        # Validate maxPlants
        if block_data.maxPlants <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="maxPlants must be greater than 0"
            )

        # Create block
        block = await BlockRepository.create(block_data, farm_id)

        logger.info(f"[Block Service] User {user_id} created block {block.blockId} in farm {farm_id}")
        return block

    @staticmethod
    async def get_block(block_id: UUID) -> Block:
        """
        Get block by ID

        Args:
            block_id: Block ID

        Returns:
            Block object

        Raises:
            HTTPException: If block not found
        """
        block = await BlockRepository.get_by_id(block_id)

        if not block:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Block not found"
            )

        return block

    @staticmethod
    async def get_farm_blocks(
        farm_id: UUID,
        page: int = 1,
        per_page: int = 20,
        state: Optional[BlockState] = None
    ) -> tuple[List[Block], int]:
        """
        Get blocks for a farm with pagination

        Args:
            farm_id: Farm ID
            page: Page number (1-indexed)
            per_page: Items per page
            state: Optional state filter

        Returns:
            Tuple of (list of blocks, total count)

        Raises:
            HTTPException: If farm not found
        """
        # Verify farm exists
        farm_repo = FarmRepository()
        farm = await farm_repo.get_by_id(farm_id)
        if not farm:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Farm not found"
            )

        # Calculate skip
        skip = (page - 1) * per_page

        # Get blocks
        blocks, total = await BlockRepository.get_by_farm(
            farm_id,
            skip=skip,
            limit=per_page,
            state=state
        )

        return blocks, total

    @staticmethod
    async def update_block(
        block_id: UUID,
        update_data: BlockUpdate,
        user_id: str
    ) -> Block:
        """
        Update a block

        Args:
            block_id: Block ID
            update_data: Update data
            user_id: User updating the block

        Returns:
            Updated Block object

        Raises:
            HTTPException: If block not found or validation fails
        """
        # Get existing block
        block = await BlockRepository.get_by_id(block_id)
        if not block:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Block not found"
            )

        # Validate name uniqueness if changing name
        if update_data.name and update_data.name != block.name:
            existing_blocks, _ = await BlockRepository.get_by_farm(block.farmId)
            if any(b.name == update_data.name and b.blockId != block_id for b in existing_blocks):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Block with name '{update_data.name}' already exists in this farm"
                )

        # Validate maxPlants
        if update_data.maxPlants is not None and update_data.maxPlants <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="maxPlants must be greater than 0"
            )

        # Update block
        updated_block = await BlockRepository.update(block_id, update_data)

        logger.info(f"[Block Service] User {user_id} updated block {block_id}")
        return updated_block

    @staticmethod
    async def delete_block(block_id: UUID, user_id: str) -> bool:
        """
        Delete a block

        Args:
            block_id: Block ID
            user_id: User deleting the block

        Returns:
            True if deleted

        Raises:
            HTTPException: If block not found or cannot be deleted
        """
        # Get block
        block = await BlockRepository.get_by_id(block_id)
        if not block:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Block not found"
            )

        # Cannot delete block if it's not empty
        if block.state != BlockState.EMPTY:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete block in '{block.state.value}' state. Block must be empty."
            )

        # Delete block
        deleted = await BlockRepository.delete(block_id)

        if deleted:
            logger.info(f"[Block Service] User {user_id} deleted block {block_id}")

        return deleted

    @staticmethod
    async def transition_state(
        block_id: UUID,
        new_state: BlockState,
        user_id: str,
        planting_id: Optional[UUID] = None,
        cycle_id: Optional[UUID] = None
    ) -> Block:
        """
        Transition block to a new state with validation

        Args:
            block_id: Block ID
            new_state: Target state
            user_id: User performing transition
            planting_id: Optional planting ID (for planted state)
            cycle_id: Optional cycle ID (for tracking)

        Returns:
            Updated Block object

        Raises:
            HTTPException: If transition is invalid
        """
        # Get block
        block = await BlockRepository.get_by_id(block_id)
        if not block:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Block not found"
            )

        # Check if transition is valid
        current_state = block.state
        valid_transitions = BlockService.STATE_TRANSITIONS.get(current_state, [])

        if new_state not in valid_transitions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid state transition from '{current_state.value}' to '{new_state.value}'. "
                       f"Valid transitions: {[s.value for s in valid_transitions]}"
            )

        # Additional validation for specific transitions
        if new_state == BlockState.PLANTED and not planting_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="planting_id is required when transitioning to 'planted' state"
            )

        # Update state
        updated_block = await BlockRepository.update_state(
            block_id,
            new_state,
            planting_id=planting_id,
            cycle_id=cycle_id
        )

        logger.info(
            f"[Block Service] User {user_id} transitioned block {block_id} "
            f"from '{current_state.value}' to '{new_state.value}'"
        )

        return updated_block

    @staticmethod
    async def get_block_summary(block_id: UUID) -> dict:
        """
        Get detailed summary of a block

        Args:
            block_id: Block ID

        Returns:
            Dictionary with block details and statistics

        Raises:
            HTTPException: If block not found
        """
        block = await BlockRepository.get_by_id(block_id)
        if not block:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Block not found"
            )

        # Get farm details
        farm_repo = FarmRepository()
        farm = await farm_repo.get_by_id(block.farmId)

        summary = {
            "block": block,
            "farm": {
                "farmId": farm.farmId if farm else None,
                "name": farm.name if farm else "Unknown",
            },
            "statistics": {
                "currentPlants": 0,  # TODO: Get from planting
                "maxPlants": block.maxPlants,
                "utilizationPercent": 0.0,  # TODO: Calculate
                "daysPlanted": None,  # TODO: Calculate from plantedDate
                "estimatedHarvestDate": block.estimatedHarvestDate,
            },
            "currentPlanting": None,  # TODO: Get planting details
            "history": {
                "totalCycles": 0,  # TODO: Get from block_cycles
                "totalHarvests": 0,  # TODO: Get from harvests
                "averageYield": 0.0,  # TODO: Calculate
            }
        }

        return summary

    @staticmethod
    def get_valid_transitions(current_state: BlockState) -> List[BlockState]:
        """
        Get valid state transitions for a given state

        Args:
            current_state: Current block state

        Returns:
            List of valid target states
        """
        return BlockService.STATE_TRANSITIONS.get(current_state, [])

    @staticmethod
    async def get_block_by_id(block_id: UUID) -> Optional[Block]:
        """
        Alias for get_block - Get block by ID

        Args:
            block_id: Block ID

        Returns:
            Block if found, None otherwise
        """
        return await BlockRepository.get_by_id(block_id)

    @staticmethod
    async def update_block_state(
        block_id: UUID,
        new_state: BlockState,
        additional_data: Optional[dict] = None
    ) -> Block:
        """
        Update block state with additional data (simplified version for internal use)

        This method doesn't validate state transitions - use transition_state for that.
        Used by planting/harvest services that have already validated the transition.

        Args:
            block_id: Block ID
            new_state: New state
            additional_data: Additional fields to update (e.g., currentPlantingId)

        Returns:
            Updated Block

        Raises:
            HTTPException: If block not found
        """
        block = await BlockRepository.get_by_id(block_id)
        if not block:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Block not found"
            )

        # Prepare update data
        update_dict = {"state": new_state.value}

        if additional_data:
            update_dict.update(additional_data)

        # Update block
        updated_block = await BlockRepository.update_state(
            block_id,
            new_state,
            additional_data=additional_data
        )

        logger.info(
            f"[Block Service] Updated block {block_id} state to '{new_state.value}'"
        )

        return updated_block
