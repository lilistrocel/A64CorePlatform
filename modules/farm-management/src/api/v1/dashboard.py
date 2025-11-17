"""
Dashboard API Endpoints

Provides dashboard data with calculated metrics for farm management.
"""

from datetime import datetime, timedelta
from typing import List
from uuid import UUID
from fastapi import APIRouter, HTTPException, Depends
import logging

from ...models.dashboard import (
    DashboardResponse,
    DashboardBlock,
    DashboardAlert,
    FarmInfo,
    DashboardSummary,
    DashboardActivity,
    UpcomingEvent,
    QuickTransitionRequest,
    QuickHarvestRequest
)
from ...models.block import Block, BlockStatus
from ...services.farm.farm_repository import FarmRepository
from ...services.block.block_repository_new import BlockRepository
from ...services.block.alert_repository import AlertRepository
from ...utils.dashboard_calculator import calculate_block_metrics, calculate_farm_summary
from ...middleware.auth import get_current_user, CurrentUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


# ============================================================================
# DASHBOARD ENDPOINT
# ============================================================================

@router.get(
    "/farms/{farmId}",
    response_model=DashboardResponse,
    summary="Get farm dashboard data",
    description="Get comprehensive dashboard data for a specific farm with all blocks and calculated metrics"
)
async def get_farm_dashboard(
    farmId: UUID,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Get complete dashboard data for a farm

    Returns:
    - Farm metadata
    - Summary statistics
    - All blocks with calculated fields
    - Recent activity
    - Upcoming events
    """
    try:
        # Verify farm exists
        farm_repo = FarmRepository()
        farm = await farm_repo.get_by_id(farmId)

        if not farm:
            raise HTTPException(404, f"Farm not found: {farmId}")

        if not farm.isActive:
            raise HTTPException(400, "Farm is not active")

        # Build farm info
        farm_info = FarmInfo(
            farmId=farm.farmId,
            name=farm.name,
            code=farm.farmCode if hasattr(farm, 'farmCode') else f"F{str(farm.farmId)[:3].upper()}",
            totalArea=farm.totalArea,
            areaUnit=farm.areaUnit,
            managerName=farm.managerName if hasattr(farm, 'managerName') else None,
            managerEmail=farm.managerEmail if hasattr(farm, 'managerEmail') else None
        )

        # Get all blocks for farm
        blocks, total = await BlockRepository.get_by_farm(farmId, skip=0, limit=1000)

        logger.info(f"[Dashboard] Found {total} blocks for farm {farmId}")

        # Calculate summary statistics
        summary_dict = calculate_farm_summary(blocks)
        summary = DashboardSummary(**summary_dict)

        # Enhance blocks with calculated fields and alerts
        dashboard_blocks: List[DashboardBlock] = []

        for block in blocks:
            # Calculate metrics
            calculated = await calculate_block_metrics(block)

            # Get active alerts for this block
            alert_repo = AlertRepository()
            alerts_list, _ = await alert_repo.get_by_block(block.blockId, skip=0, limit=10)

            active_alerts = [
                DashboardAlert(
                    alertId=alert.alertId,
                    severity=alert.severity,
                    title=alert.title,
                    createdAt=alert.createdAt
                )
                for alert in alerts_list
                if alert.status == "active"
            ]

            # Build dashboard block
            dashboard_block = DashboardBlock(
                blockId=block.blockId,
                blockCode=block.blockCode or f"B{str(block.blockId)[:6].upper()}",
                name=block.name,
                state=block.state,
                blockType=block.blockType.value if block.blockType else None,
                targetCrop=block.targetCrop,
                targetCropName=block.targetCropName,
                actualPlantCount=block.actualPlantCount,
                maxPlants=block.maxPlants,
                plantedDate=block.plantedDate,
                expectedHarvestDate=block.expectedHarvestDate,
                expectedStatusChanges=block.expectedStatusChanges,
                kpi={
                    "predictedYieldKg": block.kpi.predictedYieldKg,
                    "actualYieldKg": block.kpi.actualYieldKg,
                    "yieldEfficiencyPercent": block.kpi.yieldEfficiencyPercent,
                    "totalHarvests": block.kpi.totalHarvests
                },
                calculated=calculated,
                activeAlerts=active_alerts
            )

            dashboard_blocks.append(dashboard_block)

        # Get recent activity (last 7 days)
        recent_activity = await get_recent_activity(farmId, days=7)

        # Get upcoming events (next 7 days)
        upcoming_events = await get_upcoming_events(blocks, days=7)

        logger.info(
            f"[Dashboard] Farm {farmId}: {summary.totalBlocks} blocks, "
            f"{summary.totalActivePlantings} active, "
            f"{len(recent_activity)} recent activities, "
            f"{len(upcoming_events)} upcoming events"
        )

        return DashboardResponse(
            farmInfo=farm_info,
            summary=summary,
            blocks=dashboard_blocks,
            recentActivity=recent_activity,
            upcomingEvents=upcoming_events
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Dashboard] Error loading dashboard for farm {farmId}: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Failed to load dashboard: {str(e)}")


# ============================================================================
# QUICK ACTION ENDPOINTS
# ============================================================================

@router.patch(
    "/farms/{farmId}/blocks/{blockId}/quick-transition",
    summary="Quick state transition",
    description="Transition block state from dashboard with offset tracking"
)
async def quick_transition(
    farmId: UUID,
    blockId: UUID,
    request: QuickTransitionRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Quick state transition for dashboard

    Automatically calculates and records offset from expected date.
    """
    try:
        # Get block
        block = await BlockRepository.get_by_id(blockId)

        if not block:
            raise HTTPException(404, f"Block not found: {blockId}")

        if block.farmId != farmId:
            raise HTTPException(400, "Block does not belong to this farm")

        # Transition with offset tracking
        from ...services.block.block_service_new import BlockService

        updated_block = await BlockService.transition_state_with_offset(
            block_id=blockId,
            new_state=request.newState,
            user_id=UUID(current_user.userId),
            user_email=current_user.email,
            notes=request.notes
        )

        logger.info(
            f"[Dashboard] Quick transition: Block {block.blockCode} → {request.newState.value} "
            f"by {current_user.email}"
        )

        return {
            "success": True,
            "message": f"Block transitioned to {request.newState.value}",
            "blockId": str(blockId),
            "newState": request.newState.value
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Dashboard] Quick transition error: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Transition failed: {str(e)}")


@router.post(
    "/farms/{farmId}/blocks/{blockId}/quick-harvest",
    summary="Quick harvest recording",
    description="Record harvest from dashboard without full form"
)
async def quick_harvest(
    farmId: UUID,
    blockId: UUID,
    request: QuickHarvestRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Quick harvest recording for dashboard

    Automatically updates block KPI and performance metrics.
    """
    try:
        # Get block
        block = await BlockRepository.get_by_id(blockId)

        if not block:
            raise HTTPException(404, f"Block not found: {blockId}")

        if block.farmId != farmId:
            raise HTTPException(400, "Block does not belong to this farm")

        if block.state != BlockStatus.HARVESTING:
            raise HTTPException(400, f"Block must be in HARVESTING state (current: {block.state.value})")

        # Record harvest
        from ...services.block.harvest_service import HarvestService
        from ...models.block_harvest import BlockHarvestCreate

        harvest_data = BlockHarvestCreate(
            blockId=blockId,
            farmId=farmId,
            plantingId=block.currentPlantingId if hasattr(block, 'currentPlantingId') else None,
            harvestDate=datetime.utcnow(),
            quantityKg=request.quantityKg,
            unit="kg",
            qualityGrade=request.qualityGrade,
            notes=request.notes
        )

        harvest = await HarvestService.record_harvest(
            harvest_data=harvest_data,
            user_id=UUID(current_user.userId),
            user_email=current_user.email
        )

        # Get updated block to return new KPI
        updated_block = await BlockRepository.get_by_id(blockId)

        logger.info(
            f"[Dashboard] Quick harvest: Block {block.blockCode} recorded {request.quantityKg}kg "
            f"(grade {request.qualityGrade}) by {current_user.email}"
        )

        return {
            "success": True,
            "message": "Harvest recorded successfully",
            "harvestId": str(harvest.harvestId),
            "blockId": str(blockId),
            "quantityKg": request.quantityKg,
            "newTotalYieldKg": updated_block.kpi.actualYieldKg,
            "yieldEfficiency": updated_block.kpi.yieldEfficiencyPercent,
            "performanceCategory": updated_block.kpi.performance_category.value
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Dashboard] Quick harvest error: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Harvest recording failed: {str(e)}")


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

async def get_recent_activity(farm_id: UUID, days: int = 7) -> List[DashboardActivity]:
    """
    Get recent activity for the farm (last N days)

    Args:
        farm_id: Farm ID
        days: Number of days to look back

    Returns:
        List of recent activities
    """
    activities: List[DashboardActivity] = []

    try:
        # Get all blocks for farm
        blocks, _ = await BlockRepository.get_by_farm(farm_id, skip=0, limit=1000)

        cutoff_date = datetime.utcnow() - timedelta(days=days)

        # Collect status changes from all blocks
        for block in blocks:
            for change in block.statusChanges:
                if change.changedAt >= cutoff_date:
                    activities.append(
                        DashboardActivity(
                            blockId=block.blockId,
                            blockCode=block.blockCode or f"B{str(block.blockId)[:6].upper()}",
                            action="state_change",
                            details=f"Changed to {change.status.value}",
                            timestamp=change.changedAt
                        )
                    )

        # Sort by timestamp (most recent first)
        activities.sort(key=lambda x: x.timestamp, reverse=True)

        # Limit to 50 most recent
        return activities[:50]

    except Exception as e:
        logger.error(f"[Dashboard] Error getting recent activity: {str(e)}")
        return []


async def get_upcoming_events(blocks: List[Block], days: int = 7) -> List[UpcomingEvent]:
    """
    Get upcoming events (expected transitions, harvests) for next N days

    Args:
        blocks: List of blocks
        days: Number of days to look ahead

    Returns:
        List of upcoming events
    """
    events: List[UpcomingEvent] = []

    try:
        now = datetime.utcnow()
        future_date = now + timedelta(days=days)

        for block in blocks:
            if not block.expectedStatusChanges:
                continue

            # Check each expected status change
            for state_name, expected_date in block.expectedStatusChanges.items():
                if not expected_date:
                    continue

                # Calculate days until event
                days_until = (expected_date.date() - now.date()).days

                # Include if within our window
                if 0 <= days_until <= days:
                    events.append(
                        UpcomingEvent(
                            blockId=block.blockId,
                            blockCode=block.blockCode or f"B{str(block.blockId)[:6].upper()}",
                            eventType="expected_transition",
                            eventDate=expected_date,
                            daysUntil=days_until
                        )
                    )

                # Check for overdue transitions
                elif days_until < 0 and abs(days_until) <= 7:
                    events.append(
                        UpcomingEvent(
                            blockId=block.blockId,
                            blockCode=block.blockCode or f"B{str(block.blockId)[:6].upper()}",
                            eventType="overdue_transition",
                            eventDate=expected_date,
                            daysUntil=days_until  # Will be negative
                        )
                    )

        # Sort by days until (closest first, including negatives)
        events.sort(key=lambda x: abs(x.daysUntil))

        # Limit to 20 events
        return events[:20]

    except Exception as e:
        logger.error(f"[Dashboard] Error getting upcoming events: {str(e)}")
        return []
