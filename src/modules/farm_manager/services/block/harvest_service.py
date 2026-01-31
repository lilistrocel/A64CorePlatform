"""
Harvest Service - Business Logic Layer

Handles business logic for harvest recording and management.
Automatically adds harvests to the inventory system.
"""

from typing import List, Optional, Tuple
from uuid import UUID
from datetime import datetime
from fastapi import HTTPException
import logging

from ...models.block_harvest import (
    BlockHarvest, BlockHarvestCreate, BlockHarvestUpdate,
    BlockHarvestSummary, QualityGrade as HarvestQualityGrade
)
from ...models.inventory import (
    HarvestInventory, InventoryType, QualityGrade, MovementType, InventoryMovement
)
from .harvest_repository import HarvestRepository
from .block_repository_new import BlockRepository
from ..database import farm_db

logger = logging.getLogger(__name__)


class HarvestService:
    """Service for Harvest business logic"""

    @staticmethod
    def _map_quality_grade(harvest_grade: HarvestQualityGrade) -> QualityGrade:
        """Map BlockHarvest quality grade to Inventory quality grade"""
        grade_mapping = {
            HarvestQualityGrade.A: QualityGrade.GRADE_A,
            HarvestQualityGrade.B: QualityGrade.GRADE_B,
            HarvestQualityGrade.C: QualityGrade.GRADE_C,
        }
        return grade_mapping.get(harvest_grade, QualityGrade.GRADE_B)

    @staticmethod
    async def record_harvest(
        harvest_data: BlockHarvestCreate,
        user_id: UUID,
        user_email: str
    ) -> BlockHarvest:
        """
        Record a new harvest and update block KPI

        Automatically updates:
        - Block actualYieldKg (cumulative)
        - Block totalHarvests count
        - Block yieldEfficiencyPercent
        - Harvest Inventory (adds new inventory item)
        """
        # Verify block exists and is in harvesting status
        block = await BlockRepository.get_by_id(harvest_data.blockId)
        if not block:
            raise HTTPException(404, f"Block not found: {harvest_data.blockId}")

        # Create harvest record
        harvest = await HarvestRepository.create(harvest_data, user_id, user_email)

        # Update block KPI
        new_total_yield = block.kpi.actualYieldKg + harvest_data.quantityKg
        new_harvest_count = block.kpi.totalHarvests + 1

        await BlockRepository.update_kpi(
            harvest_data.blockId,
            actual_yield_kg=new_total_yield,
            total_harvests=new_harvest_count
        )

        # Add to Harvest Inventory automatically
        await HarvestService._add_to_inventory(
            harvest=harvest,
            block=block,
            user_id=user_id
        )

        logger.info(
            f"[Harvest Service] Recorded harvest {harvest.harvestId} "
            f"for block {harvest_data.blockId} ({harvest_data.quantityKg}kg) "
            f"and added to inventory"
        )

        return harvest

    @staticmethod
    async def _add_to_inventory(
        harvest: BlockHarvest,
        block,
        user_id: UUID
    ) -> None:
        """
        Add a harvest record to the inventory system.

        Aggregates harvests by farm + plant + quality grade + product type.
        If an existing inventory item matches, updates the quantity.
        Otherwise, creates a new inventory entry.
        """
        db = farm_db.get_database()

        # Map quality grade from BlockHarvest to Inventory
        inventory_grade = HarvestService._map_quality_grade(harvest.qualityGrade)

        # Get plant name from block (targetCropName)
        plant_name = getattr(block, 'targetCropName', None) or "Unknown Crop"
        plant_data_id = getattr(block, 'targetCrop', None)
        product_type = "fresh"  # Default to fresh

        # Check if an existing inventory item matches (same farm + plant + grade + productType)
        existing_item = await db.inventory_harvest.find_one({
            "farmId": str(harvest.farmId),
            "plantDataId": str(plant_data_id) if plant_data_id else str(harvest.blockId),
            "qualityGrade": inventory_grade.value,
            "productType": product_type
        })

        if existing_item:
            # Aggregate: Update existing inventory item
            old_quantity = existing_item.get("quantity", 0)
            old_available = existing_item.get("availableQuantity", 0)
            new_quantity = old_quantity + harvest.quantityKg
            new_available = old_available + harvest.quantityKg

            await db.inventory_harvest.update_one(
                {"inventoryId": existing_item["inventoryId"]},
                {
                    "$set": {
                        "quantity": new_quantity,
                        "availableQuantity": new_available,
                        "updatedAt": datetime.utcnow().isoformat()
                    }
                }
            )

            inventory_id = existing_item["inventoryId"]

            # Record movement for the addition
            movement = InventoryMovement(
                inventoryId=inventory_id,
                inventoryType=InventoryType.HARVEST,
                movementType=MovementType.ADDITION,
                quantityBefore=old_quantity,
                quantityChange=harvest.quantityKg,
                quantityAfter=new_quantity,
                reason=f"Harvest from block {block.blockCode}",
                referenceId=str(harvest.harvestId),
                performedBy=user_id,
                performedAt=datetime.utcnow()
            )
            await db.inventory_movements.insert_one(movement.model_dump(mode="json"))

            logger.info(
                f"[Harvest Service] Aggregated harvest to existing inventory: {inventory_id} "
                f"(+{harvest.quantityKg}kg, total now {new_quantity}kg of {plant_name})"
            )
        else:
            # Create new inventory entry
            inventory_item = HarvestInventory(
                farmId=harvest.farmId,
                blockId=harvest.blockId,
                plantDataId=plant_data_id if plant_data_id else harvest.blockId,  # Use blockId as fallback
                plantName=plant_name,
                productType=product_type,
                quantity=harvest.quantityKg,
                unit="kg",
                reservedQuantity=0,
                availableQuantity=harvest.quantityKg,
                qualityGrade=inventory_grade,
                harvestDate=harvest.harvestDate.isoformat() if isinstance(harvest.harvestDate, datetime) else harvest.harvestDate,
                currency="AED",
                notes=f"Auto-added from block harvest {harvest.harvestId}. {harvest.notes or ''}".strip(),
                createdBy=user_id,
                sourceHarvestId=harvest.harvestId  # Link back to original harvest
            )

            # Insert into inventory
            doc = inventory_item.model_dump(mode="json")
            await db.inventory_harvest.insert_one(doc)

            # Record movement
            movement = InventoryMovement(
                inventoryId=inventory_item.inventoryId,
                inventoryType=InventoryType.HARVEST,
                movementType=MovementType.ADDITION,
                quantityBefore=0,
                quantityChange=harvest.quantityKg,
                quantityAfter=harvest.quantityKg,
                reason=f"Harvest from block {block.blockCode}",
                referenceId=str(harvest.harvestId),
                performedBy=user_id,
                performedAt=datetime.utcnow()
            )
            await db.inventory_movements.insert_one(movement.model_dump(mode="json"))

            logger.info(
                f"[Harvest Service] Created new harvest inventory: {inventory_item.inventoryId} "
                f"({harvest.quantityKg}kg of {plant_name})"
            )

    @staticmethod
    async def get_harvest(harvest_id: UUID) -> BlockHarvest:
        """Get harvest by ID"""
        harvest = await HarvestRepository.get_by_id(harvest_id)

        if not harvest:
            raise HTTPException(404, f"Harvest not found: {harvest_id}")

        return harvest

    @staticmethod
    async def list_harvests_by_block(
        block_id: UUID,
        page: int = 1,
        per_page: int = 20,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Tuple[List[BlockHarvest], int, int]:
        """
        List harvests for a block with pagination and date filters.

        Behavior depends on block category:
        - Physical blocks: Returns ALL harvests from this block + all child virtual blocks (complete history)
        - Virtual blocks: Returns ONLY harvests from this block that occurred since the block's plantedDate (current cycle)
        """
        skip = (page - 1) * per_page

        # Get block to determine category
        block = await BlockRepository.get_by_id(block_id)
        if not block:
            # Block not found, return empty
            return [], 0, 0

        if block.blockCategory == 'physical':
            # Physical block: get all harvests from this block + all child virtual blocks
            block_ids = [str(block_id)]
            if block.childBlockIds:
                block_ids.extend(block.childBlockIds)

            logger.info(f"[Harvest Service] Physical block {block_id}: fetching harvests from {len(block_ids)} blocks (including children)")

            harvests, total = await HarvestRepository.get_harvests_for_multiple_blocks(
                block_ids, skip, per_page, start_date, end_date
            )
        else:
            # Virtual block: get only harvests since plantedDate (current cycle)
            effective_start_date = start_date

            # If block has a plantedDate and no explicit start_date, use plantedDate as start
            if block.plantedDate and not start_date:
                effective_start_date = block.plantedDate
                logger.info(f"[Harvest Service] Virtual block {block_id}: filtering harvests from plantedDate {block.plantedDate}")
            elif block.plantedDate and start_date:
                # Use the later of the two dates
                effective_start_date = max(start_date, block.plantedDate)

            harvests, total = await HarvestRepository.get_by_block(
                block_id, skip, per_page, effective_start_date, end_date
            )

        total_pages = (total + per_page - 1) // per_page

        return harvests, total, total_pages

    @staticmethod
    async def list_harvests_by_farm(
        farm_id: UUID,
        page: int = 1,
        per_page: int = 20,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Tuple[List[BlockHarvest], int, int]:
        """List all harvests for a farm with pagination and date filters"""
        skip = (page - 1) * per_page

        harvests, total = await HarvestRepository.get_by_farm(
            farm_id, skip, per_page, start_date, end_date
        )

        total_pages = (total + per_page - 1) // per_page

        return harvests, total, total_pages

    @staticmethod
    async def update_harvest(
        harvest_id: UUID,
        update_data: BlockHarvestUpdate
    ) -> BlockHarvest:
        """
        Update a harvest record and recalculate block KPI if quantity changed
        """
        # Get current harvest
        current_harvest = await HarvestRepository.get_by_id(harvest_id)
        if not current_harvest:
            raise HTTPException(404, f"Harvest not found: {harvest_id}")

        # Check if quantity is changing
        quantity_changed = (
            update_data.quantityKg is not None and
            update_data.quantityKg != current_harvest.quantityKg
        )

        # Update harvest
        updated_harvest = await HarvestRepository.update(harvest_id, update_data)

        if not updated_harvest:
            raise HTTPException(500, "Failed to update harvest")

        # Recalculate block KPI if quantity changed
        if quantity_changed:
            # Get all harvests for the block to recalculate total
            total_quantity = await HarvestRepository.get_total_quantity_for_block(
                current_harvest.blockId
            )

            await BlockRepository.update_kpi(
                current_harvest.blockId,
                actual_yield_kg=total_quantity
            )

            logger.info(
                f"[Harvest Service] Updated harvest {harvest_id} and recalculated block KPI"
            )

        return updated_harvest

    @staticmethod
    async def delete_harvest(harvest_id: UUID) -> bool:
        """
        Delete a harvest record and update block KPI
        """
        # Get harvest before deleting
        harvest = await HarvestRepository.get_by_id(harvest_id)
        if not harvest:
            raise HTTPException(404, f"Harvest not found: {harvest_id}")

        block_id = harvest.blockId
        quantity_to_subtract = harvest.quantityKg

        # Delete harvest
        success = await HarvestRepository.delete(harvest_id)

        if not success:
            raise HTTPException(500, "Failed to delete harvest")

        # Update block KPI
        block = await BlockRepository.get_by_id(block_id)
        if block:
            new_total_yield = max(0, block.kpi.actualYieldKg - quantity_to_subtract)
            new_harvest_count = max(0, block.kpi.totalHarvests - 1)

            await BlockRepository.update_kpi(
                block_id,
                actual_yield_kg=new_total_yield,
                total_harvests=new_harvest_count
            )

        logger.info(f"[Harvest Service] Deleted harvest {harvest_id} and updated block KPI")
        return success

    @staticmethod
    async def get_harvest_summary(block_id: UUID) -> BlockHarvestSummary:
        """
        Get comprehensive harvest summary for a block.

        Behavior depends on block category:
        - Physical blocks: Returns summary for ALL harvests from this block + all child virtual blocks
        - Virtual blocks: Returns summary ONLY for this block (current cycle harvests)
        """
        # Get block to determine category
        block = await BlockRepository.get_by_id(block_id)
        if not block:
            # Block not found, return empty summary
            return BlockHarvestSummary(
                blockId=block_id,
                totalHarvests=0,
                totalQuantityKg=0.0,
                qualityAKg=0.0,
                qualityBKg=0.0,
                qualityCKg=0.0,
                averageQualityGrade="N/A",
                firstHarvestDate=None,
                lastHarvestDate=None
            )

        if block.blockCategory == 'physical':
            # Physical block: get summary from this block + all child virtual blocks
            block_ids = [str(block_id)]
            if block.childBlockIds:
                block_ids.extend(block.childBlockIds)

            logger.info(f"[Harvest Service] Physical block {block_id}: fetching summary from {len(block_ids)} blocks")

            summary = await HarvestRepository.get_summary_for_multiple_blocks(block_ids)
            # Set the correct blockId in the summary
            summary.blockId = block_id
            return summary
        else:
            # Virtual block: get summary for only this block
            return await HarvestRepository.get_block_summary(block_id)
