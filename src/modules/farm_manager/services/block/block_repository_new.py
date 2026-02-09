"""
Block Repository - Data Access Layer (UPDATED)

Handles all database operations for blocks with new status system.
"""

from typing import List, Optional, Dict
from uuid import UUID
from datetime import datetime
import logging

from ...models.block import (
    Block, BlockCreate, BlockUpdate, BlockStatus,
    BlockStatusUpdate, StatusChange, BlockKPI
)
from ..database import farm_db

logger = logging.getLogger(__name__)


class BlockRepository:
    """Repository for Block data access"""

    @staticmethod
    async def get_next_sequence_number(farm_id: UUID) -> int:
        """Get next sequence number for a farm's blocks (atomic operation)"""
        db = farm_db.get_database()

        # Use findOneAndUpdate with atomic increment
        result = await db.farms.find_one_and_update(
            {"farmId": str(farm_id)},
            {"$inc": {"nextBlockSequence": 1}},
            return_document=True
        )

        if not result or "nextBlockSequence" not in result:
            # Initialize if not exists
            await db.farms.update_one(
                {"farmId": str(farm_id)},
                {"$set": {"nextBlockSequence": 2}}
            )
            return 1

        return result["nextBlockSequence"]

    @staticmethod
    async def get_farm_code(farm_id: UUID) -> str:
        """Get farm code for generating block codes"""
        db = farm_db.get_database()

        farm = await db.farms.find_one({"farmId": str(farm_id)})

        if not farm:
            raise Exception(f"Farm not found: {farm_id}")

        if "farmCode" not in farm or not farm["farmCode"]:
            raise Exception(f"Farm {farm_id} has no farm code. Please initialize farm code first.")

        return farm["farmCode"]

    @staticmethod
    async def check_name_unique_in_farm(farm_id: UUID, name: str, exclude_block_id: UUID = None) -> bool:
        """
        Check if a block name is unique within a farm.

        Args:
            farm_id: Farm UUID
            name: Block name to check
            exclude_block_id: Block ID to exclude from check (for updates)

        Returns:
            True if name is unique (or doesn't exist), False if duplicate found
        """
        if not name:
            return True  # Empty/None names don't need uniqueness check

        db = farm_db.get_database()

        query = {
            "farmId": str(farm_id),
            "name": name,
            "isActive": True
        }

        # Exclude current block when checking for updates
        if exclude_block_id:
            query["blockId"] = {"$ne": str(exclude_block_id)}

        existing = await db.blocks.find_one(query)
        return existing is None

    @staticmethod
    async def create(block_data: BlockCreate, farm_id: UUID, farm_code: str, user_id: UUID, user_email: str) -> Block:
        """Create a new block with auto-generated block code"""
        from fastapi import HTTPException

        db = farm_db.get_database()

        # Check if block name is unique within the farm
        if block_data.name:
            is_unique = await BlockRepository.check_name_unique_in_farm(farm_id, block_data.name)
            if not is_unique:
                raise HTTPException(
                    status_code=400,
                    detail=f"Block name '{block_data.name}' already exists in this farm. Block names must be unique within a farm."
                )

        # Get next sequence number
        sequence = await BlockRepository.get_next_sequence_number(farm_id)

        # Generate block code (e.g., "F001-005")
        block_code = f"{farm_code}-{sequence:03d}"

        # Create initial status change
        initial_status_change = StatusChange(
            status=BlockStatus.EMPTY,
            changedBy=user_id,
            changedByEmail=user_email,
            notes="Block created"
        )

        # Create block document
        block = Block(
            **block_data.model_dump(),
            blockCode=block_code,
            farmId=farm_id,
            farmCode=farm_code,
            sequenceNumber=sequence,
            status=BlockStatus.EMPTY,
            kpi=BlockKPI(),
            statusChanges=[initial_status_change]
        )

        block_dict = block.model_dump()
        block_dict["blockId"] = str(block_dict["blockId"])
        block_dict["farmId"] = str(block_dict["farmId"])

        # Initialize availableArea to total area for new physical blocks
        if block_dict.get("area") and block_dict.get("blockCategory") != "virtual":
            block_dict["availableArea"] = block_dict["area"]

        # Convert nested objects for MongoDB
        if block_dict.get("location"):
            block_dict["location"] = dict(block_dict["location"])

        if block_dict.get("targetCrop"):
            block_dict["targetCrop"] = str(block_dict["targetCrop"])

        block_dict["statusChanges"] = [
            {
                "status": change["status"],
                "changedAt": change["changedAt"],
                "changedBy": str(change["changedBy"]),
                "changedByEmail": change["changedByEmail"],
                "notes": change.get("notes")
            } for change in block_dict["statusChanges"]
        ]

        block_dict["kpi"] = dict(block_dict["kpi"])

        result = await db.blocks.insert_one(block_dict)

        if not result.inserted_id:
            raise Exception("Failed to create block")

        logger.info(f"[Block Repository] Created block: {block.blockId} ({block_code})")
        return block

    @staticmethod
    async def get_by_id(block_id: UUID) -> Optional[Block]:
        """Get block by ID"""
        db = farm_db.get_database()

        block_doc = await db.blocks.find_one({"blockId": str(block_id), "isActive": True})

        if not block_doc:
            return None

        return Block(**block_doc)

    @staticmethod
    async def get_by_code(block_code: str) -> Optional[Block]:
        """Get block by block code"""
        db = farm_db.get_database()

        block_doc = await db.blocks.find_one({"blockCode": block_code, "isActive": True})

        if not block_doc:
            return None

        return Block(**block_doc)

    @staticmethod
    async def get_by_farm(
        farm_id: UUID,
        skip: int = 0,
        limit: int = 100,
        status: Optional[BlockStatus] = None,
        block_type: Optional[str] = None,
        target_crop: Optional[UUID] = None,
        block_category: Optional[str] = 'all'
    ) -> tuple[List[Block], int]:
        """Get blocks by farm with filters and pagination"""
        db = farm_db.get_database()

        # Build query
        query = {"farmId": str(farm_id), "isActive": True}

        if status:
            query["state"] = status.value

        if block_type:
            query["blockType"] = block_type

        if target_crop:
            query["targetCrop"] = str(target_crop)

        # Filter by block category
        if block_category and block_category != 'all':
            query["blockCategory"] = block_category

        # Get total count
        total = await db.blocks.count_documents(query)

        # Get paginated results
        cursor = db.blocks.find(query).sort("sequenceNumber", 1).skip(skip).limit(limit)
        block_docs = await cursor.to_list(length=limit)

        blocks = [Block(**doc) for doc in block_docs]

        return blocks, total

    @staticmethod
    async def get_all(
        skip: int = 0,
        limit: int = 100,
        status: Optional[BlockStatus] = None,
        block_category: Optional[str] = 'all'
    ) -> tuple[List[Block], int]:
        """Get all blocks with pagination"""
        db = farm_db.get_database()

        # Build query
        query = {"isActive": True}

        if status:
            query["state"] = status.value

        # Filter by block category
        if block_category and block_category != 'all':
            query["blockCategory"] = block_category

        # Get total count
        total = await db.blocks.count_documents(query)

        # Get paginated results
        cursor = db.blocks.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        block_docs = await cursor.to_list(length=limit)

        blocks = [Block(**doc) for doc in block_docs]

        return blocks, total

    @staticmethod
    async def update(block_id: UUID, update_data: BlockUpdate) -> Optional[Block]:
        """Update block basic information"""
        from fastapi import HTTPException

        db = farm_db.get_database()

        # Only update fields that are provided
        update_dict = {
            k: v for k, v in update_data.model_dump(exclude_unset=True).items()
            if v is not None
        }

        if not update_dict:
            # No updates provided
            return await BlockRepository.get_by_id(block_id)

        # If name is being updated, check for uniqueness within the farm
        if "name" in update_dict:
            # Get the current block to find its farm
            current_block = await BlockRepository.get_by_id(block_id)
            if current_block:
                is_unique = await BlockRepository.check_name_unique_in_farm(
                    current_block.farmId,
                    update_dict["name"],
                    exclude_block_id=block_id
                )
                if not is_unique:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Block name '{update_dict['name']}' already exists in this farm. Block names must be unique within a farm."
                    )

        # Convert location if provided
        if "location" in update_dict and update_dict["location"]:
            update_dict["location"] = dict(update_dict["location"])

        # Add updatedAt timestamp
        update_dict["updatedAt"] = datetime.utcnow()

        result = await db.blocks.update_one(
            {"blockId": str(block_id), "isActive": True},
            {"$set": update_dict}
        )

        if result.matched_count == 0:
            return None

        logger.info(f"[Block Repository] Updated block: {block_id}")
        return await BlockRepository.get_by_id(block_id)

    @staticmethod
    async def update_status(
        block_id: UUID,
        new_status: BlockStatus,
        user_id: UUID,
        user_email: str,
        notes: Optional[str] = None,
        target_crop: Optional[UUID] = None,
        target_crop_name: Optional[str] = None,
        actual_plant_count: Optional[int] = None,
        expected_harvest_date: Optional[datetime] = None,
        expected_status_changes: Optional[dict] = None
    ) -> Optional[Block]:
        """
        Update block status with history tracking

        Handles:
        - Status transition
        - previousStatus for alert handling
        - Status change history
        - Planting details (crop, dates)
        - Clearing data when returning to empty
        """
        db = farm_db.get_database()

        # Get current block
        current_block = await BlockRepository.get_by_id(block_id)
        if not current_block:
            return None

        # Create status change record
        status_change = {
            "status": new_status.value,
            "changedAt": datetime.utcnow(),
            "changedBy": str(user_id),
            "changedByEmail": user_email,
            "notes": notes
        }

        update_dict = {
            "updatedAt": datetime.utcnow()
        }

        # Handle alert status
        if new_status == BlockStatus.ALERT:
            # Save current status to previousState
            update_dict["previousState"] = current_block.state.value
            update_dict["state"] = BlockStatus.ALERT.value
        elif current_block.state == BlockStatus.ALERT and new_status != BlockStatus.ALERT:
            # Resuming from alert - clear previousState
            update_dict["state"] = new_status.value
            update_dict["previousState"] = None
        else:
            # Normal status transition
            update_dict["state"] = new_status.value

        # Handle planning or planting
        if new_status in [BlockStatus.PLANNED, BlockStatus.GROWING]:
            # Save crop information for both planned and growing
            if target_crop:
                update_dict["targetCrop"] = str(target_crop)
            if target_crop_name:
                update_dict["targetCropName"] = target_crop_name
            if actual_plant_count is not None:
                update_dict["actualPlantCount"] = actual_plant_count
            if expected_harvest_date:
                update_dict["expectedHarvestDate"] = expected_harvest_date
            if expected_status_changes:
                update_dict["expectedStatusChanges"] = expected_status_changes

            # Only set plantedDate and farmingYearPlanted when actually planting (not for planned)
            if new_status == BlockStatus.GROWING:
                planted_date = datetime.utcnow()
                update_dict["plantedDate"] = planted_date
                # Calculate farming year for the planted date
                from ..farming_year_service import get_farming_year_service
                farming_year_service = get_farming_year_service()
                config = await farming_year_service.get_farming_year_config()
                update_dict["farmingYearPlanted"] = farming_year_service.get_farming_year_for_date(
                    planted_date,
                    config.farmingYearStartMonth
                )

        # Handle emptying (status = empty)
        if new_status == BlockStatus.EMPTY:
            # Clear all cycle data - archival should happen before this
            update_dict.update({
                "targetCrop": None,
                "targetCropName": None,
                "actualPlantCount": None,
                "plantedDate": None,
                "farmingYearPlanted": None,  # Clear farming year when cycle ends
                "expectedHarvestDate": None,
                "expectedStatusChanges": None,
                "kpi": {
                    "predictedYieldKg": 0.0,
                    "actualYieldKg": 0.0,
                    "yieldEfficiencyPercent": 0.0,
                    "totalHarvests": 0
                },
                "statusChanges": [status_change]  # Start fresh with only the empty status
            })

            # Don't use $push when we're clearing - just $set
            result = await db.blocks.update_one(
                {"blockId": str(block_id), "isActive": True},
                {"$set": update_dict}
            )
        else:
            # Add status change to history (use $push for array)
            result = await db.blocks.update_one(
                {"blockId": str(block_id), "isActive": True},
                {
                    "$set": update_dict,
                    "$push": {"statusChanges": status_change}
                }
            )

        if result.matched_count == 0:
            return None

        logger.info(f"[Block Repository] Updated block status: {block_id} -> {new_status.value}")
        return await BlockRepository.get_by_id(block_id)

    @staticmethod
    async def update_kpi(
        block_id: UUID,
        predicted_yield_kg: Optional[float] = None,
        actual_yield_kg: Optional[float] = None,
        total_harvests: Optional[int] = None
    ) -> Optional[Block]:
        """Update block KPI metrics"""
        db = farm_db.get_database()

        # Build update for KPI fields
        update_dict = {}

        if predicted_yield_kg is not None:
            update_dict["kpi.predictedYieldKg"] = predicted_yield_kg

        if actual_yield_kg is not None:
            update_dict["kpi.actualYieldKg"] = actual_yield_kg

        if total_harvests is not None:
            update_dict["kpi.totalHarvests"] = total_harvests

        # Calculate efficiency if both yields are available
        if predicted_yield_kg is not None or actual_yield_kg is not None:
            # Get current values if not provided
            current_block = await BlockRepository.get_by_id(block_id)
            if current_block:
                pred = predicted_yield_kg if predicted_yield_kg is not None else current_block.kpi.predictedYieldKg
                actual = actual_yield_kg if actual_yield_kg is not None else current_block.kpi.actualYieldKg

                if pred > 0:
                    efficiency = (actual / pred) * 100
                    update_dict["kpi.yieldEfficiencyPercent"] = round(efficiency, 2)

        update_dict["updatedAt"] = datetime.utcnow()

        result = await db.blocks.update_one(
            {"blockId": str(block_id), "isActive": True},
            {"$set": update_dict}
        )

        if result.matched_count == 0:
            return None

        logger.info(f"[Block Repository] Updated block KPI: {block_id}")
        return await BlockRepository.get_by_id(block_id)

    @staticmethod
    async def soft_delete(block_id: UUID) -> bool:
        """Soft delete a block"""
        db = farm_db.get_database()

        result = await db.blocks.update_one(
            {"blockId": str(block_id)},
            {"$set": {"isActive": False, "updatedAt": datetime.utcnow()}}
        )

        if result.matched_count == 0:
            return False

        logger.info(f"[Block Repository] Soft deleted block: {block_id}")
        return True

    @staticmethod
    async def get_farm_block_count(farm_id: UUID) -> int:
        """Get total number of active blocks in a farm"""
        db = farm_db.get_database()
        return await db.blocks.count_documents({"farmId": str(farm_id), "isActive": True})

    @staticmethod
    async def get_farm_blocks_by_status(farm_id: UUID) -> Dict[str, int]:
        """Get count of blocks by status for a farm"""
        db = farm_db.get_database()

        pipeline = [
            {"$match": {"farmId": str(farm_id), "isActive": True}},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]

        result = await db.blocks.aggregate(pipeline).to_list(length=10)

        status_counts = {
            "empty": 0,
            "planted": 0,
            "growing": 0,
            "fruiting": 0,
            "harvesting": 0,
            "cleaning": 0,
            "alert": 0
        }

        for item in result:
            status = item["_id"]
            count = item["count"]
            if status in status_counts:
                status_counts[status] = count

        return status_counts

    # ==================== VIRTUAL BLOCK METHODS ====================

    @staticmethod
    async def create_virtual_block(
        parent: Block,
        block_code: str,
        allocated_area: float,
        plant_count: int,
        user_id: UUID,
        user_email: str
    ) -> Block:
        """
        Create a virtual block in the database.

        Args:
            parent: Parent physical block
            block_code: Generated code for virtual block (e.g., "F001-021/001")
            allocated_area: Area allocated from parent's budget
            plant_count: Number of plants for this virtual block
            user_id: User creating the block
            user_email: Email of user

        Returns:
            Created virtual block (in EMPTY state initially)
        """
        from ...models.block import StatusChange

        db = farm_db.get_database()

        # Create initial status change
        initial_status_change = StatusChange(
            status=BlockStatus.EMPTY,
            changedBy=user_id,
            changedByEmail=user_email,
            notes="Virtual block created"
        )

        # Create virtual block document
        virtual_block = Block(
            blockCode=block_code,
            farmId=parent.farmId,
            farmCode=parent.farmCode,
            sequenceNumber=None,  # Virtual blocks don't have sequence numbers
            blockCategory='virtual',
            parentBlockId=parent.blockId,
            allocatedArea=allocated_area,
            area=allocated_area,  # For display consistency
            areaUnit=parent.areaUnit,
            maxPlants=plant_count,  # Set to plant count for virtual blocks
            blockType=parent.blockType,  # Inherit from parent
            location=parent.location,  # Inherit from parent
            state=BlockStatus.EMPTY,
            statusChanges=[initial_status_change]
        )

        virtual_block_dict = virtual_block.model_dump()
        virtual_block_dict["blockId"] = str(virtual_block_dict["blockId"])
        virtual_block_dict["farmId"] = str(virtual_block_dict["farmId"])
        virtual_block_dict["parentBlockId"] = str(virtual_block_dict["parentBlockId"])

        # Convert nested objects for MongoDB
        if virtual_block_dict.get("location"):
            virtual_block_dict["location"] = dict(virtual_block_dict["location"])

        virtual_block_dict["statusChanges"] = [
            {
                "status": change["status"],
                "changedAt": change["changedAt"],
                "changedBy": str(change["changedBy"]),
                "changedByEmail": change["changedByEmail"],
                "notes": change.get("notes")
            } for change in virtual_block_dict["statusChanges"]
        ]

        virtual_block_dict["kpi"] = dict(virtual_block_dict["kpi"])

        result = await db.blocks.insert_one(virtual_block_dict)

        if not result.inserted_id:
            raise Exception("Failed to create virtual block")

        logger.info(
            f"[Block Repository] Created virtual block: {virtual_block.blockId} ({block_code})"
        )
        return virtual_block

    @staticmethod
    async def update_parent_for_virtual_child(
        parent_id: UUID,
        child_id: str,
        allocated_area: float,
        new_counter: int
    ) -> None:
        """
        Update parent block after creating virtual child.

        Updates:
        - Decrement availableArea by allocated_area
        - Increment virtualBlockCounter to new_counter
        - Add child_id to childBlockIds array
        - Set state to "partial" (indicates physical block has virtual children)

        Args:
            parent_id: Parent block UUID
            child_id: Child block ID (as string)
            allocated_area: Area allocated to child
            new_counter: New virtualBlockCounter value
        """
        db = farm_db.get_database()

        result = await db.blocks.update_one(
            {"blockId": str(parent_id), "isActive": True},
            {
                "$inc": {"availableArea": -allocated_area},
                "$set": {
                    "virtualBlockCounter": new_counter,
                    "state": "partial",  # Physical block now has virtual children
                    "updatedAt": datetime.utcnow()
                },
                "$push": {"childBlockIds": child_id}
            }
        )

        if result.matched_count == 0:
            raise Exception(f"Failed to update parent block: {parent_id}")

        logger.info(
            f"[Block Repository] Updated parent {parent_id}: "
            f"allocated {allocated_area} to child {child_id}, counter={new_counter}"
        )

    @staticmethod
    async def get_children_by_parent(parent_id: UUID) -> List[Block]:
        """
        Get all active virtual children of a physical block.

        Args:
            parent_id: Parent block UUID

        Returns:
            List of active virtual child blocks
        """
        db = farm_db.get_database()

        # Query for virtual blocks with this parent
        cursor = db.blocks.find({
            "parentBlockId": str(parent_id),
            "isActive": True
        }).sort("blockCode", 1)

        block_docs = await cursor.to_list(length=1000)

        blocks = [Block(**doc) for doc in block_docs]

        return blocks

    @staticmethod
    async def initialize_available_area(block_id: UUID, area: float) -> None:
        """
        Set availableArea to the block's total area (one-time initialization).

        This is called when the first virtual child is created for a physical block.

        Args:
            block_id: Physical block UUID
            area: Total area to initialize as budget
        """
        db = farm_db.get_database()

        result = await db.blocks.update_one(
            {"blockId": str(block_id), "isActive": True},
            {
                "$set": {
                    "availableArea": area,
                    "updatedAt": datetime.utcnow()
                }
            }
        )

        if result.matched_count == 0:
            raise Exception(f"Failed to initialize area budget for block: {block_id}")

        logger.info(f"[Block Repository] Initialized availableArea={area} for block {block_id}")

    @staticmethod
    async def return_area_to_parent(
        parent_id: UUID,
        area: float,
        child_id: str
    ) -> None:
        """
        Return area to parent budget and remove child from childBlockIds.

        This is the inverse of update_parent_for_virtual_child.
        Used when a virtual block is deleted/emptied.

        Args:
            parent_id: Parent block UUID
            area: Area to return to parent's budget
            child_id: Child block ID to remove from childBlockIds array

        Raises:
            Exception: If parent block not found
        """
        db = farm_db.get_database()

        result = await db.blocks.update_one(
            {"blockId": str(parent_id), "isActive": True},
            {
                "$inc": {"availableArea": area},
                "$pull": {"childBlockIds": child_id},
                "$set": {"updatedAt": datetime.utcnow()}
            }
        )

        if result.matched_count == 0:
            raise Exception(f"Failed to return area to parent block: {parent_id}")

        logger.info(
            f"[Block Repository] Returned {area} area to parent {parent_id}, "
            f"removed child {child_id} from childBlockIds"
        )

    @staticmethod
    async def hard_delete(block_id: UUID) -> bool:
        """
        Hard delete a block from the database (permanent deletion).

        IMPORTANT: This should ONLY be used for virtual blocks during cleanup.
        For regular blocks, use soft_delete() instead.

        Args:
            block_id: Block UUID to delete

        Returns:
            True if deleted, False if not found
        """
        db = farm_db.get_database()

        result = await db.blocks.delete_one({"blockId": str(block_id)})

        if result.deleted_count > 0:
            logger.info(f"[Block Repository] Hard deleted block: {block_id}")
            return True
        else:
            logger.warning(f"[Block Repository] Block not found for hard deletion: {block_id}")
            return False
