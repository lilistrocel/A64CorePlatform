"""
Harvest Service - Business Logic Layer

Handles business logic for harvest recording and management.
"""

from typing import List, Optional, Tuple
from uuid import UUID
from datetime import datetime
from fastapi import HTTPException
import logging

from ...models.block_harvest import (
    BlockHarvest, BlockHarvestCreate, BlockHarvestUpdate,
    BlockHarvestSummary
)
from .harvest_repository import HarvestRepository
from .block_repository_new import BlockRepository

logger = logging.getLogger(__name__)


class HarvestService:
    """Service for Harvest business logic"""

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

        logger.info(
            f"[Harvest Service] Recorded harvest {harvest.harvestId} "
            f"for block {harvest_data.blockId} ({harvest_data.quantityKg}kg)"
        )

        return harvest

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
        """List harvests for a block with pagination and date filters"""
        skip = (page - 1) * per_page

        harvests, total = await HarvestRepository.get_by_block(
            block_id, skip, per_page, start_date, end_date
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
        """Get comprehensive harvest summary for a block"""
        return await HarvestRepository.get_block_summary(block_id)
