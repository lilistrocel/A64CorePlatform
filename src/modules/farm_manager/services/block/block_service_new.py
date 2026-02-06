"""
Block Service - Business Logic Layer

Handles all business logic for blocks including status transitions,
expected dates calculation, and automatic archival.
"""

from typing import List, Optional, Dict, Tuple
from uuid import UUID
from datetime import datetime, timedelta
from fastapi import HTTPException
import logging

from ...models.block import (
    Block, BlockCreate, BlockUpdate, BlockStatus,
    BlockStatusUpdate
)
from .block_repository_new import BlockRepository
from .harvest_repository import HarvestRepository
from .alert_repository import AlertRepository
from .archive_repository import ArchiveRepository
from ...models.block_archive import BlockArchive, QualityBreakdown, AlertsSummary
from ..plant_data.plant_data_enhanced_repository import PlantDataEnhancedRepository
from ..task.task_generator import TaskGeneratorService
from src.core.cache import get_redis_cache

logger = logging.getLogger(__name__)


class BlockService:
    """Service for Block business logic"""

    # Valid status transitions
    VALID_TRANSITIONS = {
        BlockStatus.EMPTY: [BlockStatus.PLANNED, BlockStatus.ALERT],  # Must plan before planting
        BlockStatus.PLANNED: [BlockStatus.GROWING, BlockStatus.EMPTY, BlockStatus.ALERT],  # Plant → Growing
        BlockStatus.GROWING: [BlockStatus.FRUITING, BlockStatus.HARVESTING, BlockStatus.ALERT],  # Can skip to harvesting if no fruiting
        BlockStatus.FRUITING: [BlockStatus.HARVESTING, BlockStatus.ALERT],
        BlockStatus.HARVESTING: [BlockStatus.CLEANING, BlockStatus.ALERT],
        BlockStatus.CLEANING: [BlockStatus.EMPTY, BlockStatus.ALERT],
        BlockStatus.ALERT: [
            BlockStatus.EMPTY, BlockStatus.PLANNED, BlockStatus.GROWING,
            BlockStatus.FRUITING, BlockStatus.HARVESTING, BlockStatus.CLEANING
        ]
    }

    @staticmethod
    async def get_valid_transitions(block: Block) -> list[BlockStatus]:
        """
        Get valid transitions for a block based on its plant's growth cycle

        Dynamically determines valid next states based on:
        - Block's current state
        - Plant's growth cycle (e.g., skip fruiting if fruitingDays = 0)

        Returns:
            List of valid BlockStatus values for next transition
        """
        from ...services.plant_data.plant_data_enhanced_repository import PlantDataEnhancedRepository

        # Get base valid transitions
        valid_next = list(BlockService.VALID_TRANSITIONS.get(block.state, []))

        # If block has a plant assigned and is in GROWING state, check if we should skip fruiting
        if block.targetCrop and block.state == BlockStatus.GROWING:
            try:
                plant_data = await PlantDataEnhancedRepository.get_by_id(block.targetCrop)

                if plant_data and plant_data.growthCycle:
                    # If fruitingDays is 0, remove FRUITING from valid transitions
                    # This allows GROWING → HARVESTING directly (skipping fruiting)
                    if plant_data.growthCycle.fruitingDays == 0:
                        if BlockStatus.FRUITING in valid_next:
                            valid_next.remove(BlockStatus.FRUITING)
            except Exception:
                # If we can't get plant data, use base transitions
                pass

        return valid_next

    @staticmethod
    def validate_status_transition(current_status: BlockStatus, new_status: BlockStatus) -> bool:
        """
        Validate if status transition is allowed (base validation)

        Note: This is basic validation. For plant-specific transition logic,
        the API endpoint should use get_valid_transitions() instead.
        """
        if new_status == current_status:
            return False  # No self-transition

        valid_next = BlockService.VALID_TRANSITIONS.get(current_status, [])
        return new_status in valid_next

    @staticmethod
    async def calculate_expected_dates(
        plant_data_id: UUID,
        planting_date: datetime
    ) -> Tuple[datetime, Dict[str, datetime]]:
        """
        Calculate expected harvest date and status change dates based on plant growth cycle

        Returns:
            Tuple of (expected_harvest_date, expected_status_changes dict)
        """
        # Get plant data
        plant_data = await PlantDataEnhancedRepository.get_by_id(plant_data_id)

        if not plant_data or not plant_data.growthCycle:
            raise HTTPException(400, "Plant data not found or has no growth cycle information")

        cycle = plant_data.growthCycle

        # Calculate expected dates for each status
        expected_dates = {}

        # Planted status - actual planting day (task should be done ON this day)
        expected_dates["planted"] = planting_date

        # Growing phase starts at planting (germination included in growing phase)
        expected_dates["growing"] = planting_date

        # Fruiting phase starts after vegetative growth (only if plant has fruiting phase)
        # Only add fruiting date if fruitingDays is not None and greater than 0
        if cycle.germinationDays is not None and cycle.vegetativeDays is not None:
            print(f"[DEBUG] Checking fruiting: fruitingDays={cycle.fruitingDays}", flush=True)
            if cycle.fruitingDays is not None and cycle.fruitingDays > 0:
                expected_dates["fruiting"] = planting_date + timedelta(
                    days=cycle.germinationDays + cycle.vegetativeDays
                )
                print(f"[DEBUG] Added fruiting phase", flush=True)
            else:
                print(f"[DEBUG] Skipped fruiting phase (fruitingDays={cycle.fruitingDays})", flush=True)

        # Harvesting phase starts after flowering (or directly after fruiting for leafy greens)
        # Handle crops with or without flowering phase (floweringDays can be 0 for leafy greens)
        if cycle.germinationDays is not None and cycle.vegetativeDays is not None:
            days_until_harvest = cycle.germinationDays + cycle.vegetativeDays

            # Add flowering days if present (can be 0 for leafy greens like lettuce)
            if cycle.floweringDays is not None:
                days_until_harvest += cycle.floweringDays

            expected_dates["harvesting"] = planting_date + timedelta(days=days_until_harvest)

        # Cleaning phase starts after harvest period
        if cycle.totalCycleDays is not None:
            expected_dates["cleaning"] = planting_date + timedelta(days=cycle.totalCycleDays)

        # Expected harvest date (when harvesting should start)
        expected_harvest_date = expected_dates.get("harvesting")
        if not expected_harvest_date:
            # Fallback to total cycle if specific phases not available
            expected_harvest_date = planting_date + timedelta(days=cycle.totalCycleDays or 90)

        return expected_harvest_date, expected_dates

    @staticmethod
    async def recalculate_future_dates(
        current_state: BlockStatus,
        expected_status_changes: Dict[str, datetime],
        actual_transition_date: datetime,
        plant_data_id: Optional[UUID] = None
    ) -> Dict[str, datetime]:
        """
        Recalculate future predicted dates based on actual transition timing

        When a user manually transitions to a new state, we adjust all future
        predicted dates by the same offset (early/late).

        Also removes fruiting phase if the plant doesn't have fruiting days.

        Args:
            current_state: The state being transitioned TO
            expected_status_changes: Original predicted dates
            actual_transition_date: When the transition actually happened
            plant_data_id: Optional plant data ID to check for fruiting phase

        Returns:
            Updated expected_status_changes with adjusted future dates
        """
        print(f"[DEBUG] recalculate_future_dates called for state={current_state.value}, plant_id={plant_data_id}", flush=True)
        from ...services.plant_data.plant_data_enhanced_repository import PlantDataEnhancedRepository

        # State progression order
        state_order = ["planned", "growing", "fruiting", "harvesting", "cleaning"]

        # Get expected date for current state
        expected_date = expected_status_changes.get(current_state.value)
        if not expected_date:
            # No expected date for this state, can't calculate offset
            return expected_status_changes

        # Calculate offset (negative = early, positive = late)
        if isinstance(expected_date, str):
            expected_date = datetime.fromisoformat(expected_date)

        offset_days = (actual_transition_date - expected_date).days

        # Find current state index
        try:
            current_idx = state_order.index(current_state.value)
        except ValueError:
            return expected_status_changes

        # Start with a copy of the expected dates
        updated_dates = expected_status_changes.copy()

        # Check if we should remove fruiting phase (for plants without fruiting days)
        # Do this BEFORE offset adjustment so it works even when offset is 0
        if plant_data_id:
            plant_data = await PlantDataEnhancedRepository.get_by_id(plant_data_id)
            if plant_data and plant_data.growthCycle:
                print(f"[DEBUG] Plant has fruitingDays={plant_data.growthCycle.fruitingDays}", flush=True)
                if plant_data.growthCycle.fruitingDays == 0:
                    # Remove fruiting from timeline
                    if "fruiting" in updated_dates:
                        del updated_dates["fruiting"]
                        print(f"[DEBUG] Removed fruiting phase from recalculated dates (fruitingDays=0)", flush=True)

        # If offset is 0, no date adjustment needed (but we may have removed fruiting above)
        if offset_days == 0:
            print(f"[DEBUG] No offset adjustment needed (offset=0), returning updated_dates", flush=True)
            return updated_dates

        # Adjust all future dates by the offset
        for i in range(current_idx, len(state_order)):
            state = state_order[i]
            if state in updated_dates:
                original_date = updated_dates[state]
                if isinstance(original_date, str):
                    original_date = datetime.fromisoformat(original_date)

                # Shift by offset
                adjusted_date = original_date + timedelta(days=offset_days)
                updated_dates[state] = adjusted_date

        return updated_dates

    @staticmethod
    async def calculate_predicted_yield(plant_data_id: UUID, plant_count: int) -> float:
        """Calculate predicted yield based on plant data"""
        plant_data = await PlantDataEnhancedRepository.get_by_id(plant_data_id)

        if not plant_data or not plant_data.yieldInfo:
            raise HTTPException(400, "Plant data not found or has no yield information")

        # Calculate predicted yield
        yield_per_plant = plant_data.yieldInfo.yieldPerPlant or 0.0
        predicted_yield_kg = yield_per_plant * plant_count

        return predicted_yield_kg

    @staticmethod
    async def create_block(
        farm_id: UUID,
        block_data: BlockCreate,
        user_id: UUID,
        user_email: str
    ) -> Block:
        """Create a new block with auto-generated block code"""
        # Get farm code
        try:
            farm_code = await BlockRepository.get_farm_code(farm_id)
        except Exception as e:
            raise HTTPException(
                400,
                f"Cannot create block: {str(e)}. Please initialize farm code first."
            )

        # Create block
        block = await BlockRepository.create(block_data, farm_id, farm_code, user_id, user_email)

        logger.info(f"[Block Service] Created block {block.blockCode} in farm {farm_id}")
        return block

    @staticmethod
    async def get_block(block_id: UUID) -> Block:
        """Get block by ID"""
        block = await BlockRepository.get_by_id(block_id)

        if not block:
            raise HTTPException(404, f"Block not found: {block_id}")

        return block

    @staticmethod
    async def list_blocks(
        farm_id: Optional[UUID] = None,
        page: int = 1,
        per_page: int = 20,
        status: Optional[BlockStatus] = None,
        block_type: Optional[str] = None,
        target_crop: Optional[UUID] = None,
        block_category: Optional[str] = 'all'
    ) -> Tuple[List[Block], int, int]:
        """List blocks with pagination and filters"""
        skip = (page - 1) * per_page

        if farm_id:
            blocks, total = await BlockRepository.get_by_farm(
                farm_id, skip, per_page, status, block_type, target_crop, block_category
            )
        else:
            blocks, total = await BlockRepository.get_all(skip, per_page, status, block_category)

        total_pages = (total + per_page - 1) // per_page

        return blocks, total, total_pages

    @staticmethod
    async def update_block(
        block_id: UUID,
        update_data: BlockUpdate
    ) -> Block:
        """Update block basic information"""
        block = await BlockRepository.update(block_id, update_data)

        if not block:
            raise HTTPException(404, f"Block not found: {block_id}")

        logger.info(f"[Block Service] Updated block {block_id}")
        return block

    @staticmethod
    async def change_status(
        block_id: UUID,
        status_update: BlockStatusUpdate,
        user_id: UUID,
        user_email: str
    ) -> Block:
        """
        Change block status with validation and automatic archival

        This is the core method that handles:
        - Status transition validation
        - Planting (calculate expected dates, predicted yield)
        - Alert handling (save/resume previousStatus)
        - Automatic archival (when cleaning → empty)
        """
        # Get current block
        current_block = await BlockRepository.get_by_id(block_id)
        if not current_block:
            raise HTTPException(404, f"Block not found: {block_id}")

        new_status = status_update.newStatus

        # Idempotent check: if already in the requested state, return success without changes
        if current_block.state == new_status:
            logger.info(f"[Block Service] Block {block_id} already in state {new_status.value}, no-op (idempotent)")
            return current_block

        # Validate status transition
        if not BlockService.validate_status_transition(current_block.state, new_status):
            raise HTTPException(
                400,
                f"Invalid status transition: {current_block.state.value} → {new_status.value}"
            )

        # PHASE 3: Check for pending tasks that should trigger this state change
        # Warn user if they're manually changing status when tasks exist that would do it automatically
        if not status_update.force:
            from ..database import farm_db
            db = farm_db.get_database()

            # Query for pending tasks that would trigger this state transition
            pending_tasks = await db.farm_tasks.find({
                "blockId": str(block_id),
                "status": "pending",
                "triggerStateChange": new_status.value
            }).to_list(length=100)

            if pending_tasks:
                # Format task list for error message
                task_list = []
                for task in pending_tasks:
                    task_title = task.get("title", task.get("taskType", "Unknown task"))
                    task_type = task.get("taskType", "unknown")
                    scheduled = task.get("scheduledDate", "Not scheduled")
                    task_list.append({
                        "taskId": task["taskId"],
                        "title": task_title,
                        "taskType": task_type,
                        "scheduledDate": scheduled.isoformat() if isinstance(scheduled, datetime) else str(scheduled)
                    })

                raise HTTPException(
                    409,  # Conflict
                    detail={
                        "error": "pending_tasks_exist",
                        "message": f"There are {len(pending_tasks)} pending task(s) that will automatically transition this block to '{new_status.value}' when completed. Complete these tasks first or use force=true to bypass this warning.",
                        "pendingTasks": task_list,
                        "targetStatus": new_status.value
                    }
                )
        else:
            # PHASE 3: When force=true, auto-complete all pending tasks for this block
            # since we're manually overriding the workflow
            from ..database import farm_db
            from ...models.farm_task import TaskStatus, TaskData
            db = farm_db.get_database()

            # Find ALL pending tasks for this block (not just ones that trigger new state)
            all_pending_tasks = await db.farm_tasks.find({
                "blockId": str(block_id),
                "status": "pending"
            }).to_list(length=100)

            if all_pending_tasks:
                logger.info(
                    f"[Block Service] Auto-completing {len(all_pending_tasks)} pending task(s) "
                    f"for block {block_id} due to forced state transition to {new_status.value}"
                )

                # Auto-complete each task
                for task in all_pending_tasks:
                    task_id = task["taskId"]
                    task_title = task.get("title", "Unknown task")

                    # Update task to completed status
                    await db.farm_tasks.update_one(
                        {"taskId": task_id},
                        {
                            "$set": {
                                "status": TaskStatus.COMPLETED.value,
                                "completedBy": str(user_id),
                                "completedByEmail": user_email,
                                "completedAt": datetime.utcnow(),
                                "taskData": {
                                    "notes": f"Auto-completed due to manual state transition from {current_block.state.value} to {new_status.value}",
                                    "photoUrls": [],
                                    "triggerTransition": False
                                },
                                "updatedAt": datetime.utcnow()
                            }
                        }
                    )

                    logger.info(
                        f"[Block Service] Auto-completed task {task_id} ({task_title}) "
                        f"for forced transition"
                    )

        # PRE-CALCULATION: For new planning/growing, calculate expected dates FIRST
        # This ensures task generation has access to expected dates
        calculated_expected_dates = None
        if new_status in [BlockStatus.PLANNED, BlockStatus.GROWING]:
            if status_update.targetCrop and current_block.state == BlockStatus.EMPTY:
                # New plan: calculate expected dates
                planting_date = status_update.plannedPlantingDate if status_update.plannedPlantingDate else datetime.utcnow()
                _, calculated_expected_dates = await BlockService.calculate_expected_dates(
                    status_update.targetCrop,
                    planting_date
                )
                logger.info(f"[Block Service] Pre-calculated expected dates for task generation")

        # PHASE 1: Generate tasks BEFORE state change (atomicity)
        # Skip task generation for ALERT transitions (alert system handles its own flow)
        if new_status != BlockStatus.ALERT and current_block.state != BlockStatus.ALERT:
            try:
                # Prepare task generation parameters
                task_crop_name = None
                task_plant_count = None

                # For new planning/growing, get crop name and count from status update
                if new_status in [BlockStatus.PLANNED, BlockStatus.GROWING]:
                    if status_update.targetCrop:
                        # This is a new plan, get crop data
                        plant_data = await PlantDataEnhancedRepository.get_by_id(status_update.targetCrop)
                        if plant_data:
                            task_crop_name = plant_data.plantName
                            task_plant_count = status_update.actualPlantCount
                    elif current_block.targetCropName:
                        # Reusing existing plan
                        task_crop_name = current_block.targetCropName
                        task_plant_count = current_block.actualPlantCount

                # Use calculated expected dates if available, otherwise use existing block dates
                expected_dates_for_tasks = calculated_expected_dates or current_block.expectedStatusChanges

                # Generate tasks for this transition
                await TaskGeneratorService.generate_tasks_for_transition(
                    block_id=block_id,
                    from_state=current_block.state,
                    to_state=new_status,
                    block_name=current_block.name or current_block.blockCode,
                    expected_status_changes=expected_dates_for_tasks,
                    user_id=user_id,
                    user_email=user_email,
                    target_crop_name=task_crop_name,
                    plant_count=task_plant_count
                )
                logger.info(f"[Block Service] Generated tasks for {current_block.state.value} → {new_status.value} transition")
            except Exception as e:
                logger.error(f"[Block Service] Task generation failed for block {block_id}: {str(e)}")
                # Continue with state change even if task generation fails (Phase 1: tasks are advisory)
                # In future phases, this could prevent state change

        # Handle planned or growing transitions
        logger.info(f"[Block Service] Transition: {current_block.state.value} → {new_status.value}")
        logger.info(f"[Block Service] Status update data: targetCrop={status_update.targetCrop}, actualPlantCount={status_update.actualPlantCount}, plannedPlantingDate={status_update.plannedPlantingDate}")

        if new_status in [BlockStatus.PLANNED, BlockStatus.GROWING]:
            logger.info(f"[Block Service] Handling PLANNED/GROWING transition")

            # Check if we're transitioning from planned to growing (reuse existing data)
            if (current_block.state == BlockStatus.PLANNED and new_status == BlockStatus.GROWING):
                logger.info(f"[Block Service] PLANNED → GROWING transition (reusing existing data)")

                # Reuse existing block data for this transition
                if not current_block.targetCrop:
                    error_msg = f"Cannot transition from {current_block.state.value} to {new_status.value}: missing crop data"
                    logger.error(f"[Block Service] {error_msg}")
                    raise HTTPException(400, error_msg)

                # Calculate offset (early/late planting)
                planting_offset_days = None
                if current_block.expectedHarvestDate:
                    # Calculate difference between expected growing start and actual growing start
                    # (negative = early, positive = late)
                    expected_growing = current_block.expectedStatusChanges.get("growing") if current_block.expectedStatusChanges else None
                    if expected_growing:
                        expected_dt = datetime.fromisoformat(expected_growing) if isinstance(expected_growing, str) else expected_growing
                        actual_dt = datetime.utcnow()
                        planting_offset_days = (actual_dt - expected_dt).days

                # Add offset info to notes
                offset_note = ""
                if planting_offset_days is not None:
                    if planting_offset_days < 0:
                        offset_note = f" (Planted {abs(planting_offset_days)} days early)"
                    elif planting_offset_days > 0:
                        offset_note = f" (Planted {planting_offset_days} days late)"
                    else:
                        offset_note = " (Planted on schedule)"

                notes_with_offset = (status_update.notes or f"Transitioned to {new_status.value}") + offset_note

                # Recalculate future dates based on actual planting time
                updated_expected_dates = None
                if current_block.expectedStatusChanges:
                    actual_transition_date = datetime.utcnow()
                    updated_expected_dates = await BlockService.recalculate_future_dates(
                        new_status,
                        current_block.expectedStatusChanges,
                        actual_transition_date,
                        current_block.targetCrop  # Pass plant ID to check fruiting days
                    )
                    logger.info(
                        f"[Block Service] Recalculated future dates for planned → {new_status.value} transition"
                    )

                # Update status using existing data
                block = await BlockRepository.update_status(
                    block_id,
                    new_status,
                    user_id,
                    user_email,
                    notes=notes_with_offset,
                    expected_status_changes=updated_expected_dates
                )

            else:
                # New planning/planting requires crop data
                logger.info(f"[Block Service] New PLANNED/GROWING transition from {current_block.state.value}")
                logger.info(f"[Block Service] Validating required fields: targetCrop={status_update.targetCrop}, actualPlantCount={status_update.actualPlantCount}")

                if not status_update.targetCrop:
                    error_msg = "targetCrop is required when planning/planting"
                    logger.error(f"[Block Service] Validation failed: {error_msg}")
                    logger.error(f"[Block Service] Full status_update object: {status_update.model_dump()}")
                    raise HTTPException(400, error_msg)

                if not status_update.actualPlantCount:
                    error_msg = "actualPlantCount is required when planning/planting"
                    logger.error(f"[Block Service] Validation failed: {error_msg}")
                    logger.error(f"[Block Service] Full status_update object: {status_update.model_dump()}")
                    raise HTTPException(400, error_msg)

                # Get plant data for name
                plant_data = await PlantDataEnhancedRepository.get_by_id(status_update.targetCrop)
                if not plant_data:
                    raise HTTPException(404, f"Plant data not found: {status_update.targetCrop}")

                # Use pre-calculated expected dates if available, otherwise calculate now
                if calculated_expected_dates:
                    expected_status_changes = calculated_expected_dates
                    # Extract harvest date from expected_status_changes
                    expected_harvest_date = expected_status_changes.get("harvesting") if expected_status_changes else None
                    logger.info(f"[Block Service] Using pre-calculated expected dates for block update")
                else:
                    # Calculate expected dates
                    # Use plannedPlantingDate if provided (for PLANNED state), otherwise use current time (for direct GROWING)
                    planting_date = status_update.plannedPlantingDate if status_update.plannedPlantingDate else datetime.utcnow()
                    expected_harvest_date, expected_status_changes = await BlockService.calculate_expected_dates(
                        status_update.targetCrop,
                        planting_date
                    )

                # Calculate predicted yield
                predicted_yield = await BlockService.calculate_predicted_yield(
                    status_update.targetCrop,
                    status_update.actualPlantCount
                )

                # Update KPI with predicted yield
                await BlockRepository.update_kpi(
                    block_id,
                    predicted_yield_kg=predicted_yield
                )

                # Update status with planning/planting details
                block = await BlockRepository.update_status(
                    block_id,
                    new_status,
                    user_id,
                    user_email,
                    notes=status_update.notes,
                    target_crop=status_update.targetCrop,
                    target_crop_name=plant_data.plantName,
                    actual_plant_count=status_update.actualPlantCount,
                    expected_harvest_date=expected_harvest_date,
                    expected_status_changes=expected_status_changes
                )

        # Handle harvesting → cleaning transition (AUTO-COMPLETE HARVEST TASKS)
        elif current_block.state == BlockStatus.HARVESTING and new_status == BlockStatus.CLEANING:
            logger.info(f"[Block Service] Auto-completing pending daily harvest tasks for block {block_id}")

            # Auto-complete all pending daily harvest tasks for this block
            await BlockService.auto_complete_harvest_tasks(block_id, user_id, user_email)

            # Now update status to cleaning
            block = await BlockRepository.update_status(
                block_id,
                new_status,
                user_id,
                user_email,
                notes=status_update.notes or "Harvesting completed, block ready for cleaning"
            )

        # Handle cleaning → empty transition (TRIGGER ARCHIVAL)
        elif current_block.state == BlockStatus.CLEANING and new_status == BlockStatus.EMPTY:
            logger.info(f"[Block Service] Triggering archival for block {block_id}")

            # Create archive before clearing data
            await BlockService.archive_block_cycle(block_id, user_id, user_email)

            # Now update status to empty (this clears data in repository)
            block = await BlockRepository.update_status(
                block_id,
                new_status,
                user_id,
                user_email,
                notes=status_update.notes or "Cycle completed and archived"
            )

            # NEW: Handle virtual block emptying
            # If this is a virtual block transitioning to EMPTY, trigger cleanup
            if current_block.blockCategory == 'virtual':
                logger.info(f"[Block Service] Virtual block {current_block.blockCode} is empty, triggering cleanup")

                # Import here to avoid circular dependency
                from .virtual_block_service import VirtualBlockService

                try:
                    cleanup_result = await VirtualBlockService.empty_virtual_block(
                        block_id,
                        user_id,
                        user_email
                    )

                    logger.info(
                        f"[Block Service] Virtual block {current_block.blockCode} emptied and deleted. "
                        f"Transferred {cleanup_result['tasksTransferred']} tasks, "
                        f"{cleanup_result['harvestsTransferred']} harvests. "
                        f"Deleted {cleanup_result['tasksDeleted']} pending tasks."
                    )

                    # Return the parent block since virtual block is deleted
                    parent_block = await BlockRepository.get_by_id(UUID(cleanup_result['parentBlockId']))
                    if not parent_block:
                        raise HTTPException(500, f"Parent block not found: {cleanup_result['parentBlockId']}")

                    return parent_block

                except Exception as e:
                    logger.error(f"[Block Service] Failed to empty virtual block {block_id}: {e}")
                    # Re-raise to prevent data inconsistency
                    raise HTTPException(
                        500,
                        f"Failed to complete virtual block cleanup: {str(e)}"
                    )

        # Handle normal status transition
        else:
            # Recalculate future dates if block has expectedStatusChanges
            updated_expected_dates = None
            if current_block.expectedStatusChanges:
                actual_transition_date = datetime.utcnow()
                updated_expected_dates = BlockService.recalculate_future_dates(
                    new_status,
                    current_block.expectedStatusChanges,
                    actual_transition_date
                )
                logger.info(
                    f"[Block Service] Recalculated future dates for block {block_id} "
                    f"transitioning to {new_status.value}"
                )

            block = await BlockRepository.update_status(
                block_id,
                new_status,
                user_id,
                user_email,
                notes=status_update.notes,
                expected_status_changes=updated_expected_dates
            )

        if not block:
            raise HTTPException(500, "Failed to update block status")

        logger.info(f"[Block Service] Changed status for block {block_id}: {current_block.state.value} → {new_status.value}")

        # Invalidate dashboard caches after block status change
        await BlockService._invalidate_dashboard_caches()

        return block

    @staticmethod
    async def archive_block_cycle(
        block_id: UUID,
        user_id: UUID,
        user_email: str
    ) -> BlockArchive:
        """
        Archive a completed block cycle

        Collects all data from the cycle:
        - Block details
        - Harvest summary
        - Alert summary
        - Status history
        """
        # Get block
        block = await BlockRepository.get_by_id(block_id)
        if not block:
            raise HTTPException(404, f"Block not found: {block_id}")

        # Get farm details
        from ..farm.farm_repository import FarmRepository
        farm_repo = FarmRepository()
        farm = await farm_repo.get_by_id(block.farmId)
        farm_name = farm.name if farm else "Unknown Farm"

        # Get harvest summary
        harvest_summary = await HarvestRepository.get_block_summary(block_id)

        # Get alert summary
        alert_stats = await AlertRepository.get_alert_summary_for_block(block_id)
        avg_resolution_time = await AlertRepository.calculate_average_resolution_time(block_id)

        alerts_summary = AlertsSummary(
            totalAlerts=alert_stats.get("totalAlerts", 0),
            resolvedAlerts=alert_stats.get("resolvedAlerts", 0),
            averageResolutionTimeHours=avg_resolution_time
        )

        # Calculate cycle duration (minimum 1 day even if same-day completion)
        if block.plantedDate:
            cycle_duration_days = max(1, (datetime.utcnow() - block.plantedDate).days)
        else:
            cycle_duration_days = 1

        # Create quality breakdown
        quality_breakdown = QualityBreakdown(
            qualityAKg=harvest_summary.qualityAKg,
            qualityBKg=harvest_summary.qualityBKg,
            qualityCKg=harvest_summary.qualityCKg
        )

        # Create archive
        archive = BlockArchive(
            blockId=block.blockId,
            blockCode=block.blockCode,
            farmId=block.farmId,
            farmName=farm_name,
            blockType=block.blockType,
            maxPlants=block.maxPlants,
            actualPlantCount=block.actualPlantCount or 0,
            location=block.location,
            area=block.area,
            areaUnit=block.areaUnit,
            targetCrop=block.targetCrop or UUID('00000000-0000-0000-0000-000000000000'),
            targetCropName=block.targetCropName or "Unknown",
            plantedDate=block.plantedDate or datetime.utcnow(),
            harvestCompletedDate=datetime.utcnow(),
            cycleDurationDays=cycle_duration_days,
            predictedYieldKg=block.kpi.predictedYieldKg,
            actualYieldKg=block.kpi.actualYieldKg,
            yieldEfficiencyPercent=block.kpi.yieldEfficiencyPercent,
            totalHarvests=block.kpi.totalHarvests,
            qualityBreakdown=quality_breakdown,
            statusChanges=block.statusChanges,
            alertsSummary=alerts_summary,
            archivedBy=user_id,
            archivedByEmail=user_email
        )

        # Save archive
        saved_archive = await ArchiveRepository.create(archive)

        logger.info(f"[Block Service] Archived cycle for block {block_id} (archive ID: {saved_archive.archiveId})")
        return saved_archive

    @staticmethod
    async def auto_complete_harvest_tasks(
        block_id: UUID,
        user_id: UUID,
        user_email: str
    ) -> int:
        """
        Auto-complete all pending daily harvest tasks for a block when transitioning to CLEANING

        This ensures orphaned harvest tasks don't remain when harvesting is complete.
        Adds a note explaining the task was auto-completed due to state transition.

        Args:
            block_id: Block UUID
            user_id: User performing the transition
            user_email: Email of user

        Returns:
            Number of tasks auto-completed
        """
        from ..database import farm_db
        from ...models.farm_task import TaskType, TaskStatus

        db = farm_db.get_database()

        # Find all pending daily harvest tasks for this block
        pending_tasks = await db.farm_tasks.find({
            "blockId": str(block_id),
            "taskType": TaskType.DAILY_HARVEST.value,
            "status": TaskStatus.PENDING.value
        }).to_list(length=1000)

        auto_completed_count = 0

        for task in pending_tasks:
            task_id = task["taskId"]

            # Auto-complete the task with a note explaining why
            update_data = {
                "status": TaskStatus.COMPLETED.value,
                "completedAt": datetime.utcnow(),
                "completedBy": str(user_id),
                "updatedAt": datetime.utcnow()
            }

            # Add completion note explaining auto-completion
            auto_complete_note = (
                f"Auto-completed by system when block transitioned to CLEANING state. "
                f"Harvesting period ended. Completed by {user_email}."
            )

            # Preserve existing notes and add auto-completion note
            if "taskData" not in task or task["taskData"] is None:
                task["taskData"] = {}

            existing_notes = task["taskData"].get("notes", "")
            if existing_notes:
                update_data["taskData.notes"] = f"{existing_notes}\n\n{auto_complete_note}"
            else:
                update_data["taskData.notes"] = auto_complete_note

            # Update the task
            result = await db.farm_tasks.update_one(
                {"taskId": task_id},
                {"$set": update_data}
            )

            if result.modified_count > 0:
                auto_completed_count += 1
                logger.info(f"[Block Service] Auto-completed task {task_id} for block {block_id}")

        if auto_completed_count > 0:
            logger.info(f"[Block Service] Auto-completed {auto_completed_count} harvest tasks for block {block_id}")
        else:
            logger.info(f"[Block Service] No pending harvest tasks to auto-complete for block {block_id}")

        return auto_completed_count

    @staticmethod
    async def delete_block(block_id: UUID) -> bool:
        """Soft delete a block"""
        success = await BlockRepository.soft_delete(block_id)

        if not success:
            raise HTTPException(404, f"Block not found: {block_id}")

        logger.info(f"[Block Service] Deleted block {block_id}")
        return success

    @staticmethod
    async def get_block_kpi(block_id: UUID) -> Dict:
        """Get block KPI dashboard data"""
        block = await BlockService.get_block(block_id)

        # Get harvest summary
        harvest_summary = await HarvestRepository.get_block_summary(block_id)

        # Get alert summary
        alert_stats = await AlertRepository.get_alert_summary_for_block(block_id)

        # Calculate days since planting
        days_since_planting = None
        days_until_harvest = None
        if block.plantedDate:
            days_since_planting = (datetime.utcnow() - block.plantedDate).days

            if block.expectedHarvestDate:
                days_until_harvest = (block.expectedHarvestDate - datetime.utcnow()).days

        # Calculate expected vs actual status
        status_on_track = True
        days_behind = 0
        if block.expectedStatusChanges and block.state != BlockStatus.ALERT:
            expected_date = block.expectedStatusChanges.get(block.state.value)
            if expected_date:
                expected_dt = datetime.fromisoformat(expected_date) if isinstance(expected_date, str) else expected_date
                days_behind = (datetime.utcnow() - expected_dt).days
                status_on_track = days_behind <= 3  # Allow 3 days tolerance

        return {
            "blockId": str(block.blockId),
            "blockCode": block.blockCode,
            "status": block.state.value,
            "statusOnTrack": status_on_track,
            "daysBehindSchedule": max(0, days_behind) if days_behind > 0 else 0,
            "targetCrop": block.targetCropName,
            "actualPlantCount": block.actualPlantCount,
            "daysSincePlanting": days_since_planting,
            "daysUntilHarvest": days_until_harvest,
            "kpi": {
                "predictedYieldKg": block.kpi.predictedYieldKg,
                "actualYieldKg": block.kpi.actualYieldKg,
                "yieldEfficiencyPercent": block.kpi.yieldEfficiencyPercent,
                "totalHarvests": block.kpi.totalHarvests
            },
            "harvestSummary": {
                "totalQuantityKg": harvest_summary.totalQuantityKg,
                "qualityAKg": harvest_summary.qualityAKg,
                "qualityBKg": harvest_summary.qualityBKg,
                "qualityCKg": harvest_summary.qualityCKg,
                "averageQualityGrade": harvest_summary.averageQualityGrade
            },
            "alertSummary": {
                "activeAlerts": alert_stats.get("activeAlerts", 0),
                "totalAlerts": alert_stats.get("totalAlerts", 0),
                "criticalAlerts": alert_stats.get("criticalAlerts", 0)
            }
        }

    @staticmethod
    async def transition_state_with_offset(
        block_id: UUID,
        new_state: BlockStatus,
        user_id: UUID,
        user_email: str,
        notes: Optional[str] = None
    ) -> Block:
        """
        Transition block state with automatic offset tracking for dashboard

        This method wraps the standard transition_block_state but automatically
        calculates and records offset information in the StatusChange.

        Args:
            block_id: Block ID
            new_state: New state to transition to
            user_id: User performing transition
            user_email: User email
            notes: Optional notes

        Returns:
            Updated block

        Raises:
            HTTPException: If transition invalid or block not found
        """
        from ...models.block import BlockStatusUpdate, StatusChange

        # Get current block
        block = await BlockRepository.get_by_id(block_id)
        if not block:
            raise HTTPException(404, f"Block not found: {block_id}")

        # Calculate offset if expected dates are available
        now = datetime.utcnow()
        expected_date = None
        offset_days = None
        offset_type = None
        auto_notes = []

        if block.expectedStatusChanges:
            expected_date_value = block.expectedStatusChanges.get(new_state.value)

            if expected_date_value:
                # Handle both datetime objects and string dates
                if isinstance(expected_date_value, str):
                    expected_date = datetime.fromisoformat(expected_date_value)
                else:
                    expected_date = expected_date_value

                # Calculate offset in days
                offset_days = (now.date() - expected_date.date()).days

                if offset_days < 0:
                    offset_type = "early"
                    auto_notes.append(f"Transitioned {abs(offset_days)} days early")
                elif offset_days == 0:
                    offset_type = "on_time"
                    auto_notes.append("Transitioned on schedule")
                else:
                    offset_type = "late"
                    auto_notes.append(f"Transitioned {offset_days} days late")

        # Combine user notes with auto-generated notes
        final_notes = " | ".join(filter(None, [*auto_notes, notes]))

        # Create status update request
        status_update = BlockStatusUpdate(
            newStatus=new_state,
            notes=final_notes
        )

        # Use existing transition method
        updated_block = await BlockService.transition_block_state(
            block_id=block_id,
            status_update=status_update,
            user_id=user_id,
            user_email=user_email
        )

        # Update the last status change with offset information
        if updated_block.statusChanges:
            last_change = updated_block.statusChanges[-1]
            last_change.expectedDate = expected_date
            last_change.offsetDays = offset_days
            last_change.offsetType = offset_type

            # Save updated block with offset info
            await BlockRepository.update(updated_block)

        logger.info(
            f"[Block Service] Dashboard transition: Block {block.blockCode} → {new_state.value} "
            f"(offset: {offset_days} days {offset_type if offset_type else 'unknown'})"
        )

        return updated_block

    @staticmethod
    async def _invalidate_dashboard_caches() -> None:
        """
        Invalidate dashboard caches after block mutations.

        Invalidates:
        - Dashboard summary caches (get_dashboard_summary)
        - Farm-specific dashboard caches
        """
        try:
            cache = await get_redis_cache()

            if cache.is_available:
                # Invalidate dashboard summary caches
                await cache.delete_pattern("get_dashboard_summary:*", prefix="farm")

                logger.info("[Cache] Invalidated dashboard caches after block mutation")

        except Exception as e:
            # CRITICAL: Never break the application due to cache errors
            logger.warning(f"[Cache] Error invalidating dashboard caches: {str(e)}")
