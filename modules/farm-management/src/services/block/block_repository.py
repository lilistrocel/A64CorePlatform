"""
Block Repository - Data Access Layer

Handles all database operations for blocks.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
import logging

from ...models.block import Block, BlockCreate, BlockUpdate, BlockState
from ..database import farm_db

logger = logging.getLogger(__name__)


class BlockRepository:
    """Repository for Block data access"""

    @staticmethod
    async def create(block_data: BlockCreate, farm_id: UUID) -> Block:
        """
        Create a new block

        Args:
            block_data: Block creation data
            farm_id: ID of the farm this block belongs to

        Returns:
            Created Block object

        Raises:
            Exception: If database operation fails
        """
        db = farm_db.get_database()

        # Create block document
        block = Block(
            **block_data.model_dump(),
            farmId=farm_id,
            state=BlockState.EMPTY,
            currentPlanting=None,
            currentCycleId=None,
            plantedDate=None,
            expectedHarvestDate=None
        )

        block_dict = block.model_dump()
        block_dict["blockId"] = str(block_dict["blockId"])
        block_dict["farmId"] = str(block_dict["farmId"])

        result = await db.blocks.insert_one(block_dict)

        if not result.inserted_id:
            raise Exception("Failed to create block")

        logger.info(f"[Block Repository] Created block: {block.blockId}")
        return block

    @staticmethod
    async def get_by_id(block_id: UUID) -> Optional[Block]:
        """
        Get block by ID

        Args:
            block_id: Block ID

        Returns:
            Block object if found, None otherwise
        """
        db = farm_db.get_database()

        block_doc = await db.blocks.find_one({"blockId": str(block_id)})

        if not block_doc:
            return None

        return Block(**block_doc)

    @staticmethod
    async def get_by_farm(
        farm_id: UUID,
        skip: int = 0,
        limit: int = 100,
        state: Optional[BlockState] = None
    ) -> tuple[List[Block], int]:
        """
        Get blocks by farm ID with pagination

        Args:
            farm_id: Farm ID
            skip: Number of records to skip
            limit: Maximum number of records to return
            state: Optional state filter

        Returns:
            Tuple of (list of blocks, total count)
        """
        db = farm_db.get_database()

        # Build query
        query = {"farmId": str(farm_id)}
        if state:
            query["state"] = state.value

        # Get total count
        total = await db.blocks.count_documents(query)

        # Get paginated results
        cursor = db.blocks.find(query).skip(skip).limit(limit)
        block_docs = await cursor.to_list(length=limit)

        blocks = [Block(**doc) for doc in block_docs]

        return blocks, total

    @staticmethod
    async def get_all(
        skip: int = 0,
        limit: int = 100,
        state: Optional[BlockState] = None
    ) -> tuple[List[Block], int]:
        """
        Get all blocks with pagination

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            state: Optional state filter

        Returns:
            Tuple of (list of blocks, total count)
        """
        db = farm_db.get_database()

        # Build query
        query = {}
        if state:
            query["state"] = state.value

        # Get total count
        total = await db.blocks.count_documents(query)

        # Get paginated results
        cursor = db.blocks.find(query).skip(skip).limit(limit)
        block_docs = await cursor.to_list(length=limit)

        blocks = [Block(**doc) for doc in block_docs]

        return blocks, total

    @staticmethod
    async def update(block_id: UUID, update_data: BlockUpdate) -> Optional[Block]:
        """
        Update a block

        Args:
            block_id: Block ID
            update_data: Update data

        Returns:
            Updated Block object if found, None otherwise
        """
        db = farm_db.get_database()

        # Only update fields that are provided
        update_dict = {
            k: v for k, v in update_data.model_dump(exclude_unset=True).items()
            if v is not None
        }

        if not update_dict:
            # No updates provided
            return await BlockRepository.get_by_id(block_id)

        # Add updatedAt timestamp
        update_dict["updatedAt"] = datetime.utcnow()

        result = await db.blocks.update_one(
            {"blockId": str(block_id)},
            {"$set": update_dict}
        )

        if result.matched_count == 0:
            return None

        logger.info(f"[Block Repository] Updated block: {block_id}")
        return await BlockRepository.get_by_id(block_id)

    @staticmethod
    async def update_state(
        block_id: UUID,
        new_state: BlockState,
        planting_id: Optional[UUID] = None,
        cycle_id: Optional[UUID] = None,
        additional_data: Optional[dict] = None
    ) -> Optional[Block]:
        """
        Update block state and related fields

        Args:
            block_id: Block ID
            new_state: New state
            planting_id: Optional planting ID (for planted state)
            cycle_id: Optional cycle ID (for tracking)
            additional_data: Additional fields to update

        Returns:
            Updated Block object if found, None otherwise
        """
        db = farm_db.get_database()

        update_dict = {
            "state": new_state.value,
            "updatedAt": datetime.utcnow()
        }

        # Set planting and cycle IDs
        if planting_id:
            update_dict["currentPlanting"] = str(planting_id)
        if cycle_id:
            update_dict["currentCycleId"] = str(cycle_id)

        # Set planted date when transitioning to planted state
        if new_state == BlockState.PLANTED:
            update_dict["plantedDate"] = datetime.utcnow()

        # Clear dates when returning to empty state
        if new_state == BlockState.EMPTY:
            update_dict["currentPlanting"] = None
            update_dict["currentCycleId"] = None
            update_dict["plantedDate"] = None
            update_dict["expectedHarvestDate"] = None

        # Add any additional data
        if additional_data:
            update_dict.update(additional_data)

        result = await db.blocks.update_one(
            {"blockId": str(block_id)},
            {"$set": update_dict}
        )

        if result.matched_count == 0:
            return None

        logger.info(f"[Block Repository] Updated block state: {block_id} -> {new_state.value}")
        return await BlockRepository.get_by_id(block_id)

    @staticmethod
    async def delete(block_id: UUID) -> bool:
        """
        Delete a block (hard delete)

        Args:
            block_id: Block ID

        Returns:
            True if deleted, False if not found
        """
        db = farm_db.get_database()

        result = await db.blocks.delete_one({"blockId": str(block_id)})

        if result.deleted_count == 0:
            return False

        logger.info(f"[Block Repository] Deleted block: {block_id}")
        return True

    @staticmethod
    async def get_farm_block_count(farm_id: UUID) -> int:
        """
        Get total number of blocks in a farm

        Args:
            farm_id: Farm ID

        Returns:
            Count of blocks
        """
        db = farm_db.get_database()
        return await db.blocks.count_documents({"farmId": str(farm_id)})

    @staticmethod
    async def get_farm_blocks_by_state(farm_id: UUID) -> dict:
        """
        Get count of blocks by state for a farm

        Args:
            farm_id: Farm ID

        Returns:
            Dictionary with state counts
        """
        db = farm_db.get_database()

        pipeline = [
            {"$match": {"farmId": str(farm_id)}},
            {"$group": {"_id": "$state", "count": {"$sum": 1}}}
        ]

        result = await db.blocks.aggregate(pipeline).to_list(length=10)

        state_counts = {
            "empty": 0,
            "planned": 0,
            "planted": 0,
            "harvesting": 0,
            "alert": 0
        }

        for item in result:
            state = item["_id"]
            count = item["count"]
            if state in state_counts:
                state_counts[state] = count

        return state_counts
