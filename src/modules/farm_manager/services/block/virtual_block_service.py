"""
Virtual Block Service - Multi-Crop Business Logic

Handles virtual block creation, area budget management, and parent-child relationships
for the multi-crop feature.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
from fastapi import HTTPException
import logging

from ...models.block import (
    Block, BlockStatus, AddVirtualCropRequest
)
from .block_repository_new import BlockRepository
from ..plant_data.plant_data_enhanced_repository import PlantDataEnhancedRepository
from .block_service_new import BlockService

logger = logging.getLogger(__name__)


class VirtualBlockService:
    """Service for virtual block operations"""

    @staticmethod
    async def create_virtual_block(
        parent_block_id: UUID,
        crop_id: UUID,
        allocated_area: float,
        plant_count: int,
        planting_date: Optional[datetime],
        user_id: UUID,
        user_email: str
    ) -> Block:
        """
        Create a virtual block as a child of a physical block.

        Steps:
        1. Validate parent is physical and active
        2. Initialize parent's availableArea if first child
        3. Validate allocated_area <= parent.availableArea
        4. Get/increment parent's virtualBlockCounter
        5. Generate blockCode as "{parentCode}/{counter:03d}"
        6. Create virtual block with blockCategory='virtual'
        7. Deduct allocatedArea from parent's availableArea
        8. Add new block ID to parent's childBlockIds
        9. Initiate planting on virtual block (transition to PLANNED or GROWING)

        Args:
            parent_block_id: Parent physical block UUID
            crop_id: Plant data UUID for the crop
            allocated_area: Area to allocate from parent's budget
            plant_count: Number of plants
            planting_date: Planned planting date (None = plant immediately)
            user_id: User creating the virtual block
            user_email: Email of user

        Returns:
            Created virtual block

        Raises:
            HTTPException: If validation fails
        """
        # Get parent block
        parent_block = await BlockRepository.get_by_id(parent_block_id)
        if not parent_block:
            raise HTTPException(404, f"Parent block not found: {parent_block_id}")

        # Validate parent is physical
        if parent_block.blockCategory != 'physical':
            raise HTTPException(
                409,
                "Only physical blocks can have virtual children. Virtual blocks cannot have children."
            )

        # Validate parent is active
        if not parent_block.isActive:
            raise HTTPException(400, "Cannot add children to deleted blocks")

        # Initialize parent's availableArea if first child
        if parent_block.availableArea is None:
            logger.info(
                f"[Virtual Block Service] Initializing area budget for block {parent_block_id} "
                f"(area={parent_block.area})"
            )
            await VirtualBlockService.initialize_area_budget(parent_block_id)
            # Refresh parent block after initialization
            parent_block = await BlockRepository.get_by_id(parent_block_id)

        # Validate area budget
        if allocated_area > parent_block.availableArea:
            raise HTTPException(
                400,
                f"Insufficient area budget. Available: {parent_block.availableArea} {parent_block.areaUnit}, "
                f"Requested: {allocated_area} {parent_block.areaUnit}"
            )

        # Get crop data for validation
        plant_data = await PlantDataEnhancedRepository.get_by_id(crop_id)
        if not plant_data:
            raise HTTPException(404, f"Plant data not found: {crop_id}")

        # Generate virtual block code
        new_counter = parent_block.virtualBlockCounter + 1
        block_code = f"{parent_block.blockCode}/{new_counter:03d}"

        logger.info(
            f"[Virtual Block Service] Creating virtual block {block_code} "
            f"under parent {parent_block.blockCode} (area={allocated_area})"
        )

        # Create virtual block in database
        virtual_block = await BlockRepository.create_virtual_block(
            parent=parent_block,
            block_code=block_code,
            allocated_area=allocated_area,
            plant_count=plant_count,
            user_id=user_id,
            user_email=user_email
        )

        # Update parent (decrement availableArea, increment counter, add child ID)
        await BlockRepository.update_parent_for_virtual_child(
            parent_id=parent_block_id,
            child_id=str(virtual_block.blockId),
            allocated_area=allocated_area,
            new_counter=new_counter
        )

        # Initiate planting on virtual block
        # Decide between PLANNED (future date) or GROWING (immediate planting)
        target_status = BlockStatus.PLANNED if planting_date else BlockStatus.GROWING
        actual_planting_date = planting_date if planting_date else datetime.utcnow()

        # Calculate expected dates
        expected_harvest_date, expected_status_changes = await BlockService.calculate_expected_dates(
            crop_id,
            actual_planting_date
        )

        # Calculate predicted yield
        predicted_yield = await BlockService.calculate_predicted_yield(crop_id, plant_count)

        # Update KPI with predicted yield
        await BlockRepository.update_kpi(
            virtual_block.blockId,
            predicted_yield_kg=predicted_yield
        )

        # Update virtual block status to PLANNED or GROWING
        virtual_block = await BlockRepository.update_status(
            virtual_block.blockId,
            target_status,
            user_id,
            user_email,
            notes=f"Virtual crop planting: {plant_data.plantName}",
            target_crop=crop_id,
            target_crop_name=plant_data.plantName,
            actual_plant_count=plant_count,
            expected_harvest_date=expected_harvest_date,
            expected_status_changes=expected_status_changes
        )

        logger.info(
            f"[Virtual Block Service] Virtual block {block_code} created and planted "
            f"with {plant_data.plantName} (status={target_status.value})"
        )

        return virtual_block

    @staticmethod
    async def add_crop_to_physical_block(
        block_id: UUID,
        request: AddVirtualCropRequest,
        user_id: UUID,
        user_email: str
    ) -> Block:
        """
        Add an additional crop to an existing physical block by creating a virtual child.

        This is used when a physical block already has a crop and user wants to add more.

        Args:
            block_id: Physical block UUID
            request: Virtual crop request data
            user_id: User adding the crop
            user_email: Email of user

        Returns:
            Created virtual block

        Raises:
            HTTPException: If validation fails
        """
        return await VirtualBlockService.create_virtual_block(
            parent_block_id=block_id,
            crop_id=request.cropId,
            allocated_area=request.allocatedArea,
            plant_count=request.plantCount,
            planting_date=request.plantingDate,
            user_id=user_id,
            user_email=user_email
        )

    @staticmethod
    async def get_virtual_children(parent_block_id: UUID) -> List[Block]:
        """
        Get all active virtual blocks for a physical parent.

        Args:
            parent_block_id: Parent block UUID

        Returns:
            List of active virtual child blocks

        Raises:
            HTTPException: If parent not found or not physical
        """
        # Validate parent exists and is physical
        parent_block = await BlockRepository.get_by_id(parent_block_id)
        if not parent_block:
            raise HTTPException(404, f"Parent block not found: {parent_block_id}")

        if parent_block.blockCategory != 'physical':
            # Virtual blocks cannot have children
            return []

        # Get children from repository
        children = await BlockRepository.get_children_by_parent(parent_block_id)

        logger.info(
            f"[Virtual Block Service] Retrieved {len(children)} virtual children "
            f"for block {parent_block.blockCode}"
        )

        return children

    @staticmethod
    async def initialize_area_budget(block_id: UUID) -> Block:
        """
        Initialize availableArea on a physical block (first time multi-crop is used).

        Sets availableArea = area (total block area becomes the budget).

        Args:
            block_id: Physical block UUID

        Returns:
            Updated block

        Raises:
            HTTPException: If block not found or not physical
        """
        # Get block
        block = await BlockRepository.get_by_id(block_id)
        if not block:
            raise HTTPException(404, f"Block not found: {block_id}")

        # Validate block is physical
        if block.blockCategory != 'physical':
            raise HTTPException(
                400,
                "Only physical blocks can have area budgets initialized"
            )

        # Check if already initialized
        if block.availableArea is not None:
            logger.warning(
                f"[Virtual Block Service] Area budget already initialized for block {block_id}"
            )
            return block

        # Validate block has an area
        if not block.area or block.area <= 0:
            raise HTTPException(
                400,
                f"Block must have a valid area before initializing budget (current area: {block.area})"
            )

        # Initialize availableArea to total area
        await BlockRepository.initialize_available_area(block_id, block.area)

        logger.info(
            f"[Virtual Block Service] Initialized area budget for block {block_id} "
            f"(availableArea={block.area})"
        )

        # Return updated block
        return await BlockRepository.get_by_id(block_id)

    @staticmethod
    async def empty_virtual_block(
        virtual_block_id: UUID,
        user_id: UUID,
        user_email: str
    ) -> dict:
        """
        Empty a virtual block, transfer history to parent, and delete it.

        This method orchestrates the complete cleanup process:
        1. Validates virtual block exists and is virtual
        2. Archives the current block cycle
        3. Transfers completed/in-progress tasks to parent
        4. Deletes pending tasks
        5. Transfers harvest records to parent
        6. Returns allocated area to parent's budget
        7. Updates parent status if needed
        8. Hard deletes the virtual block

        Args:
            virtual_block_id: UUID of the virtual block to empty
            user_id: User performing the operation
            user_email: Email of user performing operation

        Returns:
            Dict with transfer statistics:
            {
                "virtualBlockId": str,
                "virtualBlockCode": str,
                "parentBlockId": str,
                "parentBlockCode": str,
                "tasksTransferred": int,
                "tasksDeleted": int,
                "harvestsTransferred": int,
                "areaReturned": float,
                "deleted": True
            }

        Raises:
            HTTPException: If block not found, not virtual, or not active
        """
        # Get virtual block
        virtual_block = await BlockRepository.get_by_id(virtual_block_id)
        if not virtual_block:
            raise HTTPException(404, f"Block not found: {virtual_block_id}")

        # Validate it's a virtual block
        if virtual_block.blockCategory != 'virtual':
            raise HTTPException(
                400,
                f"Block {virtual_block.blockCode} is not a virtual block (category: {virtual_block.blockCategory})"
            )

        # Validate it's active
        if not virtual_block.isActive:
            raise HTTPException(
                400,
                f"Cannot empty deleted block {virtual_block.blockCode}"
            )

        # Get parent block
        if not virtual_block.parentBlockId:
            raise HTTPException(
                500,
                f"Virtual block {virtual_block.blockCode} has no parent block ID"
            )

        parent_block_id = virtual_block.parentBlockId if isinstance(virtual_block.parentBlockId, UUID) else UUID(str(virtual_block.parentBlockId))
        parent_block = await BlockRepository.get_by_id(parent_block_id)
        if not parent_block:
            raise HTTPException(
                404,
                f"Parent block not found: {virtual_block.parentBlockId}"
            )

        logger.info(
            f"[Virtual Block Service] Starting cleanup for virtual block {virtual_block.blockCode} "
            f"(parent: {parent_block.blockCode})"
        )

        # Archive the virtual block's current cycle
        from .archive_repository import ArchiveRepository
        try:
            await ArchiveRepository.archive_block_cycle(
                virtual_block_id,
                user_id,
                user_email,
                archive_reason="Virtual block emptied - history transferred to parent"
            )
            logger.info(f"[Virtual Block Service] Archived cycle for {virtual_block.blockCode}")
        except Exception as e:
            logger.error(f"[Virtual Block Service] Failed to archive cycle: {e}")
            # Continue with cleanup even if archival fails

        # Transfer tasks to parent
        tasks_transferred, tasks_deleted = await VirtualBlockService.transfer_tasks_to_parent(
            virtual_block_id,
            parent_block_id,
            virtual_block.blockCode,
            user_id,
            user_email
        )

        # Transfer harvests to parent
        harvests_transferred = await VirtualBlockService.transfer_harvests_to_parent(
            virtual_block_id,
            parent_block_id,
            virtual_block.blockCode
        )

        # Return area to parent's budget
        await VirtualBlockService.return_area_to_parent(
            parent_block_id,
            virtual_block.area,
            str(virtual_block_id)
        )

        # Update parent status after child removal
        updated_parent = await VirtualBlockService.update_parent_status_after_child_removal(
            parent_block_id,
            user_id,
            user_email
        )

        # Delete the virtual block (hard delete)
        deleted = await VirtualBlockService.delete_virtual_block(virtual_block_id)

        result = {
            "virtualBlockId": str(virtual_block_id),
            "virtualBlockCode": virtual_block.blockCode,
            "parentBlockId": str(parent_block.blockId),
            "parentBlockCode": parent_block.blockCode,
            "tasksTransferred": tasks_transferred,
            "tasksDeleted": tasks_deleted,
            "harvestsTransferred": harvests_transferred,
            "areaReturned": virtual_block.area,
            "deleted": deleted
        }

        logger.info(
            f"[Virtual Block Service] Virtual block {virtual_block.blockCode} cleanup complete. "
            f"Transferred {tasks_transferred} tasks, {harvests_transferred} harvests. "
            f"Deleted {tasks_deleted} pending tasks. Returned {virtual_block.area} area to parent."
        )

        return result

    @staticmethod
    async def transfer_tasks_to_parent(
        virtual_block_id: UUID,
        parent_block_id: UUID,
        virtual_block_code: str,
        user_id: UUID,
        user_email: str
    ) -> tuple[int, int]:
        """
        Transfer tasks from virtual block to parent.

        Task handling rules:
        - Completed tasks: Update blockId, add sourceBlockCode field
        - In-progress tasks: Complete them with auto-complete note, then transfer
        - Pending tasks: Delete them (user confirmed behavior)

        Args:
            virtual_block_id: UUID of virtual block
            parent_block_id: UUID of parent block
            virtual_block_code: Block code for sourceBlockCode field
            user_id: User performing operation
            user_email: Email of user

        Returns:
            Tuple of (tasks_transferred, tasks_deleted)
        """
        from ..database import farm_db

        db = farm_db.get_database()

        # First, auto-complete any in-progress tasks
        in_progress_result = await db.farm_tasks.update_many(
            {
                "blockId": str(virtual_block_id),
                "status": "in_progress"
            },
            {
                "$set": {
                    "status": "completed",
                    "completedAt": datetime.utcnow(),
                    "completedBy": str(user_id),
                    "completedByEmail": user_email,
                    "notes": "Auto-completed during virtual block cleanup",
                    "updatedAt": datetime.utcnow()
                }
            }
        )

        logger.info(
            f"[Virtual Block Service] Auto-completed {in_progress_result.modified_count} "
            f"in-progress tasks for {virtual_block_code}"
        )

        # Transfer completed tasks (including the ones we just completed)
        transfer_result = await db.farm_tasks.update_many(
            {
                "blockId": str(virtual_block_id),
                "status": "completed"
            },
            {
                "$set": {
                    "blockId": str(parent_block_id),
                    "sourceBlockCode": virtual_block_code,
                    "updatedAt": datetime.utcnow()
                }
            }
        )

        tasks_transferred = transfer_result.modified_count

        # Delete pending tasks
        delete_result = await db.farm_tasks.delete_many({
            "blockId": str(virtual_block_id),
            "status": "pending"
        })

        tasks_deleted = delete_result.deleted_count

        logger.info(
            f"[Virtual Block Service] Transferred {tasks_transferred} completed tasks, "
            f"deleted {tasks_deleted} pending tasks from {virtual_block_code}"
        )

        return (tasks_transferred, tasks_deleted)

    @staticmethod
    async def transfer_harvests_to_parent(
        virtual_block_id: UUID,
        parent_block_id: UUID,
        virtual_block_code: str
    ) -> int:
        """
        Transfer all harvest records from virtual block to parent.

        Updates blockId to parent's ID and adds sourceBlockCode field
        for historical tracking.

        Args:
            virtual_block_id: UUID of virtual block
            parent_block_id: UUID of parent block
            virtual_block_code: Block code for sourceBlockCode field

        Returns:
            Number of harvests transferred
        """
        from ..database import farm_db

        db = farm_db.get_database()

        # Transfer all harvest records
        result = await db.block_harvests.update_many(
            {"blockId": str(virtual_block_id)},
            {
                "$set": {
                    "blockId": str(parent_block_id),
                    "sourceBlockCode": virtual_block_code
                }
            }
        )

        harvests_transferred = result.modified_count

        logger.info(
            f"[Virtual Block Service] Transferred {harvests_transferred} harvest records "
            f"from {virtual_block_code} to parent"
        )

        # Update parent block's KPI to include transferred harvests
        if harvests_transferred > 0:
            # Recalculate parent's actual yield from all harvests
            pipeline = [
                {"$match": {"blockId": str(parent_block_id)}},
                {"$group": {
                    "_id": None,
                    "totalYield": {"$sum": "$totalWeightKg"}
                }}
            ]

            result = await db.block_harvests.aggregate(pipeline).to_list(1)

            if result:
                total_yield = result[0]["totalYield"]
                await BlockRepository.update_kpi(
                    parent_block_id,
                    actual_yield_kg=total_yield
                )
                logger.info(
                    f"[Virtual Block Service] Updated parent block KPI: "
                    f"actualYieldKg = {total_yield}"
                )

        return harvests_transferred

    @staticmethod
    async def return_area_to_parent(
        parent_block_id: UUID,
        allocated_area: float,
        child_block_id: str
    ) -> None:
        """
        Return allocated area to parent's budget and remove child from childBlockIds.

        Uses atomic operations to ensure data consistency.

        Args:
            parent_block_id: UUID of parent block
            allocated_area: Area to return to budget
            child_block_id: Child block ID to remove from childBlockIds array

        Raises:
            Exception: If database operation fails
        """
        await BlockRepository.return_area_to_parent(
            parent_block_id,
            allocated_area,
            child_block_id
        )

        logger.info(
            f"[Virtual Block Service] Returned {allocated_area} area to parent {parent_block_id}, "
            f"removed child {child_block_id} from childBlockIds"
        )

    @staticmethod
    async def update_parent_status_after_child_removal(
        parent_block_id: UUID,
        user_id: UUID,
        user_email: str
    ) -> Block:
        """
        Update parent block status after virtual child is removed.

        Status logic:
        - If parent has no more children AND no direct crop → EMPTY
        - If parent has no more children AND has direct crop → keep current status
        - If parent still has children → keep current status (PARTIAL if no direct crop)

        Args:
            parent_block_id: UUID of parent block
            user_id: User performing operation
            user_email: Email of user

        Returns:
            Updated parent block
        """
        # Get updated parent block
        parent = await BlockRepository.get_by_id(parent_block_id)
        if not parent:
            raise Exception(f"Parent block not found: {parent_block_id}")

        # Check if parent has any remaining children
        has_children = parent.childBlockIds and len(parent.childBlockIds) > 0
        has_direct_crop = parent.targetCrop is not None

        # Determine if status update is needed
        should_empty = not has_children and not has_direct_crop

        if should_empty and parent.state != BlockStatus.EMPTY:
            # Transition parent to EMPTY
            logger.info(
                f"[Virtual Block Service] Transitioning parent {parent.blockCode} to EMPTY "
                f"(no children, no direct crop)"
            )

            parent = await BlockRepository.update_status(
                parent_block_id,
                BlockStatus.EMPTY,
                user_id,
                user_email,
                notes="Last virtual child removed, no direct crop"
            )
        else:
            logger.info(
                f"[Virtual Block Service] Parent {parent.blockCode} status unchanged "
                f"(has_children={has_children}, has_direct_crop={has_direct_crop})"
            )

        return parent

    @staticmethod
    async def delete_virtual_block(virtual_block_id: UUID) -> bool:
        """
        Hard delete a virtual block from the database.

        Note: This is a hard delete, not soft delete, because:
        - Virtual blocks are temporary by design
        - All history has been transferred to parent
        - They should not appear in any lists after deletion

        Args:
            virtual_block_id: UUID of virtual block to delete

        Returns:
            True if deleted successfully

        Raises:
            Exception: If deletion fails
        """
        deleted = await BlockRepository.hard_delete(virtual_block_id)

        if deleted:
            logger.info(f"[Virtual Block Service] Hard deleted virtual block {virtual_block_id}")
        else:
            logger.warning(f"[Virtual Block Service] Virtual block {virtual_block_id} not found for deletion")

        return deleted
