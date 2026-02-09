"""
Archive Service - Business Logic Layer

Handles business logic for archived block cycles and performance analytics.
"""

from typing import List, Optional, Tuple
from uuid import UUID
from datetime import datetime
from fastapi import HTTPException
import logging

from ...models.block_archive import (
    BlockArchive, BlockArchiveAnalytics,
    CropPerformanceComparison
)
from .archive_repository import ArchiveRepository

logger = logging.getLogger(__name__)


class ArchiveService:
    """Service for Archive business logic"""

    @staticmethod
    async def get_archive(archive_id: UUID) -> BlockArchive:
        """Get archived cycle by ID"""
        archive = await ArchiveRepository.get_by_id(archive_id)

        if not archive:
            raise HTTPException(404, f"Archive not found: {archive_id}")

        return archive

    @staticmethod
    async def list_archives_by_block(
        block_id: UUID,
        page: int = 1,
        per_page: int = 20,
        farming_year: Optional[int] = None,
        farming_year_filter: str = "planted"
    ) -> Tuple[List[BlockArchive], int, int]:
        """
        List all archived cycles for a block

        Args:
            block_id: Block UUID
            page: Page number (1-indexed)
            per_page: Items per page
            farming_year: Optional farming year to filter by
            farming_year_filter: Which field to filter on: 'planted', 'harvested', or 'both'
        """
        skip = (page - 1) * per_page

        archives, total = await ArchiveRepository.get_by_block(
            block_id,
            skip,
            per_page,
            farming_year=farming_year,
            farming_year_filter=farming_year_filter
        )

        total_pages = (total + per_page - 1) // per_page

        return archives, total, total_pages

    @staticmethod
    async def list_archives_by_farm(
        farm_id: UUID,
        page: int = 1,
        per_page: int = 20,
        crop_id: Optional[UUID] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        farming_year: Optional[int] = None,
        farming_year_filter: str = "planted"
    ) -> Tuple[List[BlockArchive], int, int]:
        """
        List all archives for a farm with filters

        Args:
            farm_id: Farm UUID
            page: Page number (1-indexed)
            per_page: Items per page
            crop_id: Optional crop UUID to filter by
            start_date: Optional start date for planting filter
            end_date: Optional end date for planting filter
            farming_year: Optional farming year to filter by
            farming_year_filter: Which field to filter on: 'planted', 'harvested', or 'both'
        """
        skip = (page - 1) * per_page

        archives, total = await ArchiveRepository.get_by_farm(
            farm_id,
            skip,
            per_page,
            crop_id,
            start_date,
            end_date,
            farming_year=farming_year,
            farming_year_filter=farming_year_filter
        )

        total_pages = (total + per_page - 1) // per_page

        return archives, total, total_pages

    @staticmethod
    async def list_archives_by_crop(
        crop_id: UUID,
        page: int = 1,
        per_page: int = 20
    ) -> Tuple[List[BlockArchive], int, int]:
        """List all archives for a specific crop"""
        skip = (page - 1) * per_page

        archives, total = await ArchiveRepository.get_by_crop(crop_id, skip, per_page)

        total_pages = (total + per_page - 1) // per_page

        return archives, total, total_pages

    @staticmethod
    async def get_performance_analytics(
        farm_id: Optional[UUID] = None,
        block_id: Optional[UUID] = None,
        crop_id: Optional[UUID] = None
    ) -> BlockArchiveAnalytics:
        """
        Get performance analytics for archived cycles

        Can filter by:
        - farm_id: Analytics for all cycles in a farm
        - block_id: Analytics for all cycles of a specific block
        - crop_id: Analytics for all cycles of a specific crop
        - No filters: System-wide analytics
        """
        return await ArchiveRepository.get_performance_analytics(farm_id, block_id, crop_id)

    @staticmethod
    async def compare_crop_performance(
        farm_id: Optional[UUID] = None
    ) -> List[CropPerformanceComparison]:
        """
        Compare performance across different crops

        Returns list sorted by average yield efficiency (best performing first)
        """
        return await ArchiveRepository.get_crop_performance_comparison(farm_id)

    @staticmethod
    async def get_top_performing_blocks(
        farm_id: UUID,
        limit: int = 10
    ) -> List[dict]:
        """Get top performing blocks for a farm by average yield efficiency"""
        return await ArchiveRepository.get_top_performing_blocks(farm_id, limit)

    @staticmethod
    async def get_block_cycle_history(
        block_id: UUID
    ) -> dict:
        """Get complete cycle history with statistics for a block"""
        archives, _ = await ArchiveRepository.get_by_block(block_id, 0, 1000)

        if not archives:
            return {
                "blockId": str(block_id),
                "totalCycles": 0,
                "cycles": []
            }

        # Calculate statistics
        total_cycles = len(archives)
        avg_efficiency = sum(a.yieldEfficiencyPercent for a in archives) / total_cycles
        avg_duration = sum(a.cycleDurationDays for a in archives) / total_cycles
        total_yield = sum(a.actualYieldKg for a in archives)

        # Find best and worst cycles
        best_cycle = max(archives, key=lambda a: a.yieldEfficiencyPercent)
        worst_cycle = min(archives, key=lambda a: a.yieldEfficiencyPercent)

        # Group by crop
        crops_grown = {}
        for archive in archives:
            crop_name = archive.targetCropName
            if crop_name not in crops_grown:
                crops_grown[crop_name] = {
                    "count": 0,
                    "totalYield": 0.0,
                    "avgEfficiency": 0.0
                }

            crops_grown[crop_name]["count"] += 1
            crops_grown[crop_name]["totalYield"] += archive.actualYieldKg
            crops_grown[crop_name]["avgEfficiency"] += archive.yieldEfficiencyPercent

        # Calculate averages for crops
        for crop_name in crops_grown:
            count = crops_grown[crop_name]["count"]
            crops_grown[crop_name]["avgEfficiency"] /= count

        return {
            "blockId": str(block_id),
            "totalCycles": total_cycles,
            "statistics": {
                "averageYieldEfficiency": round(avg_efficiency, 2),
                "averageCycleDuration": round(avg_duration, 1),
                "totalYieldKg": round(total_yield, 2),
                "bestCycle": {
                    "archiveId": str(best_cycle.archiveId),
                    "cropName": best_cycle.targetCropName,
                    "yieldEfficiency": best_cycle.yieldEfficiencyPercent,
                    "plantedDate": best_cycle.plantedDate.isoformat()
                },
                "worstCycle": {
                    "archiveId": str(worst_cycle.archiveId),
                    "cropName": worst_cycle.targetCropName,
                    "yieldEfficiency": worst_cycle.yieldEfficiencyPercent,
                    "plantedDate": worst_cycle.plantedDate.isoformat()
                }
            },
            "cropsGrown": crops_grown,
            "recentCycles": [
                {
                    "archiveId": str(a.archiveId),
                    "cropName": a.targetCropName,
                    "plantedDate": a.plantedDate.isoformat(),
                    "cycleDuration": a.cycleDurationDays,
                    "yieldEfficiency": a.yieldEfficiencyPercent,
                    "actualYieldKg": a.actualYieldKg
                }
                for a in archives[:10]  # Most recent 10
            ]
        }

    @staticmethod
    async def delete_archive(archive_id: UUID) -> bool:
        """
        Delete an archive (use with caution - removes historical data)

        Note: This is a hard delete and cannot be undone
        """
        success = await ArchiveRepository.delete(archive_id)

        if not success:
            raise HTTPException(404, f"Archive not found: {archive_id}")

        logger.warning(f"[Archive Service] DELETED archive {archive_id} - historical data removed")
        return success

    @staticmethod
    async def export_farm_performance_report(farm_id: UUID) -> dict:
        """Generate comprehensive performance report for a farm"""
        # Get overall analytics
        analytics = await ArchiveRepository.get_performance_analytics(farm_id=farm_id)

        # Get crop comparison
        crop_comparison = await ArchiveRepository.get_crop_performance_comparison(farm_id)

        # Get top performing blocks
        top_blocks = await ArchiveRepository.get_top_performing_blocks(farm_id, 5)

        # Get all archives for time series analysis
        all_archives, _ = await ArchiveRepository.get_by_farm(farm_id, 0, 1000)

        # Group by month for trends
        monthly_performance = {}
        for archive in all_archives:
            month_key = archive.plantedDate.strftime("%Y-%m")
            if month_key not in monthly_performance:
                monthly_performance[month_key] = {
                    "cycles": 0,
                    "totalYield": 0.0,
                    "avgEfficiency": 0.0
                }

            monthly_performance[month_key]["cycles"] += 1
            monthly_performance[month_key]["totalYield"] += archive.actualYieldKg
            monthly_performance[month_key]["avgEfficiency"] += archive.yieldEfficiencyPercent

        # Calculate monthly averages
        for month in monthly_performance:
            count = monthly_performance[month]["cycles"]
            monthly_performance[month]["avgEfficiency"] /= count

        return {
            "farmId": str(farm_id),
            "reportGeneratedAt": datetime.utcnow().isoformat(),
            "overallAnalytics": {
                "totalCycles": analytics.totalCycles,
                "averageYieldEfficiency": analytics.averageYieldEfficiency,
                "averageCycleDuration": analytics.averageCycleDuration,
                "totalYieldKg": analytics.totalYieldKg
            },
            "cropPerformance": [
                {
                    "cropName": crop.cropName,
                    "totalCycles": crop.totalCycles,
                    "avgYieldEfficiency": crop.averageYieldEfficiency,
                    "avgYieldKg": crop.averageYieldKg,
                    "totalYieldKg": crop.totalYieldKg
                }
                for crop in crop_comparison
            ],
            "topPerformingBlocks": top_blocks,
            "monthlyTrends": monthly_performance
        }
