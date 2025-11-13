"""
Block Archive API Routes

Endpoints for viewing archived block cycles and performance analytics.
"""

from fastapi import APIRouter, Depends, Query, status
from typing import Optional, List
from uuid import UUID
from datetime import datetime

from ...models.block_archive import (
    BlockArchive, BlockArchiveAnalytics,
    CropPerformanceComparison
)
from ...services.block.archive_service import ArchiveService
from ...middleware.auth import get_current_active_user, CurrentUser, require_permission
from ...utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

router = APIRouter(tags=["block-archives"])


# Block-level archive endpoints
@router.get(
    "/farms/{farm_id}/blocks/{block_id}/archives",
    response_model=PaginatedResponse[BlockArchive],
    summary="List archived cycles for a block"
)
async def list_block_archives(
    farm_id: UUID,
    block_id: UUID,
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get list of archived cycles for a specific block.

    Returns historical data for all completed cycles of this block,
    sorted by completion date (most recent first).
    """
    archives, total, total_pages = await ArchiveService.list_archives_by_block(
        block_id,
        page=page,
        per_page=perPage
    )

    return PaginatedResponse(
        data=archives,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/farms/{farm_id}/blocks/{block_id}/archives/history",
    response_model=SuccessResponse[dict],
    summary="Get complete cycle history for a block"
)
async def get_block_cycle_history(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get complete cycle history with statistics for a block.

    Returns:
    - Total cycles count
    - Statistics (average efficiency, average duration, total yield)
    - Best and worst performing cycles
    - Crops grown breakdown
    - Recent cycles (last 10)
    """
    history = await ArchiveService.get_block_cycle_history(block_id)

    return SuccessResponse(data=history)


# Farm-level archive endpoints
@router.get(
    "/farms/{farm_id}/archives",
    response_model=PaginatedResponse[BlockArchive],
    summary="List all archived cycles in a farm"
)
async def list_farm_archives(
    farm_id: UUID,
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    cropId: Optional[UUID] = Query(None, description="Filter by crop ID"),
    startDate: Optional[datetime] = Query(None, description="Filter by planting start date"),
    endDate: Optional[datetime] = Query(None, description="Filter by planting end date"),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get list of all archived cycles across all blocks in a farm.

    **Query Parameters**:
    - `page`: Page number (default: 1)
    - `perPage`: Items per page (default: 20, max: 100)
    - `cropId`: Filter by specific crop (optional)
    - `startDate`: Filter cycles planted from this date (optional)
    - `endDate`: Filter cycles planted until this date (optional)
    """
    archives, total, total_pages = await ArchiveService.list_archives_by_farm(
        farm_id,
        page=page,
        per_page=perPage,
        crop_id=cropId,
        start_date=startDate,
        end_date=endDate
    )

    return PaginatedResponse(
        data=archives,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/farms/{farm_id}/archives/performance",
    response_model=SuccessResponse[BlockArchiveAnalytics],
    summary="Get performance analytics for a farm"
)
async def get_farm_performance_analytics(
    farm_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get comprehensive performance analytics for all archived cycles in a farm.

    Returns:
    - Total cycles completed
    - Average yield efficiency across all cycles
    - Average cycle duration
    - Total yield produced (kg)
    - Best performing cycle
    - Worst performing cycle
    - Performance trends over time
    """
    analytics = await ArchiveService.get_performance_analytics(farm_id=farm_id)

    return SuccessResponse(data=analytics)


@router.get(
    "/farms/{farm_id}/archives/crop-comparison",
    response_model=SuccessResponse[List[CropPerformanceComparison]],
    summary="Compare crop performance across farm"
)
async def compare_crop_performance(
    farm_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Compare performance metrics across different crops grown in the farm.

    Returns list sorted by average yield efficiency (best performing first).

    Useful for:
    - Identifying which crops perform best in your farm
    - Planning future planting decisions
    - Optimizing farm operations
    """
    comparison = await ArchiveService.compare_crop_performance(farm_id)

    return SuccessResponse(data=comparison)


@router.get(
    "/farms/{farm_id}/archives/top-blocks",
    response_model=SuccessResponse[List[dict]],
    summary="Get top performing blocks in farm"
)
async def get_top_performing_blocks(
    farm_id: UUID,
    limit: int = Query(10, ge=1, le=50, description="Number of top blocks to return"),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get top performing blocks in the farm ranked by average yield efficiency.

    **Query Parameters**:
    - `limit`: Number of blocks to return (default: 10, max: 50)

    Returns blocks sorted by performance with statistics for each.
    """
    top_blocks = await ArchiveService.get_top_performing_blocks(farm_id, limit)

    return SuccessResponse(data=top_blocks)


@router.get(
    "/farms/{farm_id}/archives/report",
    response_model=SuccessResponse[dict],
    summary="Generate comprehensive performance report"
)
async def export_farm_performance_report(
    farm_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Generate comprehensive performance report for the farm.

    This is a detailed report combining multiple analytics including:
    - Overall farm analytics (cycles, efficiency, yield)
    - Crop performance comparison
    - Top performing blocks (top 5)
    - Monthly performance trends

    Useful for:
    - Farm management decision making
    - Performance reviews
    - Identifying optimization opportunities
    - Tracking progress over time
    """
    report = await ArchiveService.export_farm_performance_report(farm_id)

    return SuccessResponse(data=report)


# Crop-level archive endpoints
@router.get(
    "/crops/{crop_id}/archives",
    response_model=PaginatedResponse[BlockArchive],
    summary="List all archived cycles for a crop"
)
async def list_crop_archives(
    crop_id: UUID,
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get list of all archived cycles for a specific crop across all farms.

    Useful for analyzing crop-specific performance across different locations and conditions.
    """
    archives, total, total_pages = await ArchiveService.list_archives_by_crop(
        crop_id,
        page=page,
        per_page=perPage
    )

    return PaginatedResponse(
        data=archives,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/crops/{crop_id}/archives/analytics",
    response_model=SuccessResponse[BlockArchiveAnalytics],
    summary="Get performance analytics for a crop"
)
async def get_crop_performance_analytics(
    crop_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get performance analytics for all archived cycles of a specific crop.

    Returns analytics across all farms and blocks where this crop was grown.
    """
    analytics = await ArchiveService.get_performance_analytics(crop_id=crop_id)

    return SuccessResponse(data=analytics)


# Individual archive endpoints
@router.get(
    "/archives/{archive_id}",
    response_model=SuccessResponse[BlockArchive],
    summary="Get archive by ID"
)
async def get_archive(
    archive_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get a specific archived cycle by ID.

    Returns complete historical data for a single completed block cycle.
    """
    archive = await ArchiveService.get_archive(archive_id)

    return SuccessResponse(data=archive)


@router.delete(
    "/archives/{archive_id}",
    response_model=SuccessResponse[dict],
    summary="Delete an archive"
)
async def delete_archive(
    archive_id: UUID,
    current_user: CurrentUser = Depends(require_permission("admin"))
):
    """
    Delete an archived cycle permanently.

    Requires **admin** permission.

    **WARNING**: This removes historical data and cannot be undone.
    Use with extreme caution. Archives should generally be kept for record-keeping.
    """
    await ArchiveService.delete_archive(archive_id)

    return SuccessResponse(
        data={"archiveId": str(archive_id)},
        message="Archive deleted successfully"
    )


# System-wide analytics (for platform administrators)
@router.get(
    "/archives/analytics/system-wide",
    response_model=SuccessResponse[BlockArchiveAnalytics],
    summary="Get system-wide performance analytics"
)
async def get_system_wide_analytics(
    current_user: CurrentUser = Depends(require_permission("admin"))
):
    """
    Get performance analytics across all farms in the system.

    Requires **admin** permission.

    Returns system-wide statistics useful for platform-level insights.
    """
    analytics = await ArchiveService.get_performance_analytics()

    return SuccessResponse(data=analytics)


@router.get(
    "/archives/crop-comparison/system-wide",
    response_model=SuccessResponse[List[CropPerformanceComparison]],
    summary="Compare crop performance system-wide"
)
async def compare_crop_performance_system_wide(
    current_user: CurrentUser = Depends(require_permission("admin"))
):
    """
    Compare crop performance across all farms in the system.

    Requires **admin** permission.

    Returns crops sorted by average yield efficiency across the entire platform.
    """
    comparison = await ArchiveService.compare_crop_performance()

    return SuccessResponse(data=comparison)
