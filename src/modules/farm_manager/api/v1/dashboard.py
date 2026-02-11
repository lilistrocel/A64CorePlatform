"""
Dashboard API Endpoints

Provides dashboard data with calculated metrics for farm management.
"""

from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, HTTPException, Depends, Query
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
    QuickHarvestRequest,
    DashboardSummaryResponse,
    DashboardSummaryData,
    DashboardOverview,
    DashboardBlocksByState,
    DashboardHarvestSummary,
    DashboardRecentActivity,
    FarmBlockSummary,
    FarmHarvestSummary,
    FarmingYearContext
)
from ...models.block import Block, BlockStatus
from ...services.farm.farm_repository import FarmRepository
from ...services.block.block_repository_new import BlockRepository
from ...services.block.alert_repository import AlertRepository
from ...utils.dashboard_calculator import calculate_block_metrics, calculate_farm_summary
from ...middleware.auth import get_current_user, CurrentUser
from src.core.cache import cache_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


# ============================================================================
# DASHBOARD SUMMARY AGGREGATION ENDPOINT (Optimized - Single Call)
# ============================================================================

@router.get(
    "/summary",
    response_model=DashboardSummaryResponse,
    summary="Get aggregated dashboard summary",
    description="Get all dashboard data in a single optimized call using MongoDB aggregation pipelines"
)
@cache_response(ttl=30, key_prefix="farm")
async def get_dashboard_summary(
    farmingYear: Optional[int] = Query(
        None,
        description="Filter data by farming year (e.g., 2025). When specified, blocks are filtered by farmingYearPlanted and harvests by farmingYear."
    ),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Get complete dashboard summary across all user's farms.

    Uses MongoDB aggregation pipelines to minimize database calls.
    Replaces 80+ individual API calls with a single optimized query.

    **Farming Year Filter**:
    - When `farmingYear` is specified, blocks are filtered by `farmingYearPlanted`
    - Harvests are filtered by `farmingYear` field
    - Default (no filter): Returns all data regardless of farming year

    Returns:
    - Overview metrics (total farms, blocks, active plantings, upcoming harvests)
    - Block counts by state (across all farms)
    - Block counts grouped by farm
    - Harvest totals by farm
    - Recent activity counts
    - Farming year context (when filter is applied)
    """
    try:
        from ...services.database import farm_db
        from datetime import timedelta

        db = farm_db.get_database()

        # CRITICAL: Use MongoDB aggregation pipelines, NOT loops

        # Step 1: Get all active farms for user
        farms_pipeline = [
            {"$match": {"isActive": True}},
            {"$project": {
                "farmId": 1,
                "name": 1,
                "_id": 0
            }}
        ]
        farms = await db.farms.aggregate(farms_pipeline).to_list(None)
        farm_ids = [farm["farmId"] for farm in farms]

        # Step 2: Aggregate blocks by state (all farms)
        # Build block match criteria
        block_match_criteria = {
            "farmId": {"$in": farm_ids},
            "isActive": True,
            "blockCategory": "virtual"  # Only count virtual blocks (actual plantings)
        }
        # Add farming year filter if specified
        if farmingYear is not None:
            block_match_criteria["farmingYearPlanted"] = farmingYear

        blocks_by_state_pipeline = [
            {"$match": block_match_criteria},
            {"$group": {
                "_id": "$state",
                "count": {"$sum": 1}
            }}
        ]
        blocks_by_state_result = await db.blocks.aggregate(blocks_by_state_pipeline).to_list(None)

        # Convert to dict
        blocks_by_state_dict = {item["_id"]: item["count"] for item in blocks_by_state_result}

        # Step 3: Aggregate blocks grouped by farm (uses same match criteria as step 2)
        blocks_by_farm_pipeline = [
            {"$match": block_match_criteria},
            {"$group": {
                "_id": {
                    "farmId": "$farmId",
                    "state": "$state"
                },
                "count": {"$sum": 1}
            }},
            {"$group": {
                "_id": "$_id.farmId",
                "states": {
                    "$push": {
                        "state": "$_id.state",
                        "count": "$count"
                    }
                },
                "totalBlocks": {"$sum": "$count"}
            }}
        ]
        blocks_by_farm_result = await db.blocks.aggregate(blocks_by_farm_pipeline).to_list(None)

        # Build FarmBlockSummary list
        blocks_by_farm = []
        for farm_data in blocks_by_farm_result:
            farm_id = farm_data["_id"]
            # Find farm name
            farm_name = next((f["name"] for f in farms if f["farmId"] == farm_id), "Unknown Farm")

            # Build state counts
            state_counts = {
                "empty": 0,
                "planned": 0,
                "growing": 0,
                "fruiting": 0,
                "harvesting": 0,
                "cleaning": 0,
                "alert": 0,
                "partial": 0
            }
            for state_item in farm_data["states"]:
                state_counts[state_item["state"]] = state_item["count"]

            blocks_by_farm.append(FarmBlockSummary(
                farmId=farm_id,
                farmName=farm_name,
                totalBlocks=farm_data["totalBlocks"],
                **state_counts
            ))

        # Step 4: Aggregate harvest totals by farm
        # Build harvest match criteria
        harvest_match_criteria = {
            "farmId": {"$in": farm_ids}
        }
        # Add farming year filter if specified
        if farmingYear is not None:
            harvest_match_criteria["farmingYear"] = farmingYear

        harvests_by_farm_pipeline = [
            {"$match": harvest_match_criteria},
            {"$group": {
                "_id": "$farmId",
                "totalKg": {"$sum": "$quantityKg"},
                "harvestCount": {"$sum": 1}
            }}
        ]
        harvests_by_farm_result = await db.block_harvests.aggregate(harvests_by_farm_pipeline).to_list(None)

        harvests_by_farm = []
        total_harvests_kg = 0.0
        for harvest_data in harvests_by_farm_result:
            farm_id = harvest_data["_id"]
            farm_name = next((f["name"] for f in farms if f["farmId"] == farm_id), "Unknown Farm")
            total_kg = harvest_data["totalKg"]

            harvests_by_farm.append(FarmHarvestSummary(
                farmId=farm_id,
                farmName=farm_name,
                totalKg=total_kg,
                harvestCount=harvest_data["harvestCount"]
            ))
            total_harvests_kg += total_kg

        # Step 5: Count active alerts
        active_alerts_count = await db.block_alerts.count_documents({
            "farmId": {"$in": farm_ids},
            "status": {"$in": ["open", "in_progress"]}
        })

        # Step 6: Count recent harvests (last 7 days)
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        recent_harvests_query = {
            "farmId": {"$in": farm_ids},
            "harvestDate": {"$gte": seven_days_ago}
        }
        # Add farming year filter if specified
        if farmingYear is not None:
            recent_harvests_query["farmingYear"] = farmingYear

        recent_harvests_count = await db.block_harvests.count_documents(recent_harvests_query)

        # Step 7: Count pending tasks (if task system exists)
        pending_tasks_count = 0  # Placeholder - implement when task system is ready

        # Calculate overview metrics
        total_blocks = sum(blocks_by_state_dict.values())
        active_plantings = sum([
            blocks_by_state_dict.get("planned", 0),
            blocks_by_state_dict.get("growing", 0),
            blocks_by_state_dict.get("fruiting", 0),
            blocks_by_state_dict.get("harvesting", 0)
        ])
        upcoming_harvests = blocks_by_state_dict.get("harvesting", 0)

        # Build farming year context
        farming_year_context = FarmingYearContext(
            farmingYear=farmingYear,
            isFiltered=farmingYear is not None
        )

        # Build response
        summary_data = DashboardSummaryData(
            overview=DashboardOverview(
                totalFarms=len(farms),
                totalBlocks=total_blocks,
                activePlantings=active_plantings,
                upcomingHarvests=upcoming_harvests
            ),
            blocksByState=DashboardBlocksByState(
                empty=blocks_by_state_dict.get("empty", 0),
                planned=blocks_by_state_dict.get("planned", 0),
                growing=blocks_by_state_dict.get("growing", 0),
                fruiting=blocks_by_state_dict.get("fruiting", 0),
                harvesting=blocks_by_state_dict.get("harvesting", 0),
                cleaning=blocks_by_state_dict.get("cleaning", 0),
                alert=blocks_by_state_dict.get("alert", 0),
                partial=blocks_by_state_dict.get("partial", 0)
            ),
            blocksByFarm=blocks_by_farm,
            harvestSummary=DashboardHarvestSummary(
                totalHarvestsKg=total_harvests_kg,
                harvestsByFarm=harvests_by_farm
            ),
            recentActivity=DashboardRecentActivity(
                recentHarvests=recent_harvests_count,
                pendingTasks=pending_tasks_count,
                activeAlerts=active_alerts_count
            ),
            farmingYearContext=farming_year_context
        )

        farming_year_str = f" (farmingYear={farmingYear})" if farmingYear else ""
        logger.info(
            f"[Dashboard Summary] User {current_user.email}: {len(farms)} farms, "
            f"{total_blocks} blocks, {active_plantings} active plantings{farming_year_str}"
        )

        return DashboardSummaryResponse(
            success=True,
            data=summary_data
        )

    except Exception as e:
        logger.error(f"[Dashboard Summary] Error: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Failed to load dashboard summary: {str(e)}")


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
    farmingYear: Optional[int] = Query(None, description="Filter blocks by farming year planted"),
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

        # Get virtual blocks for farm (filtered by farming year if provided)
        virtual_blocks, virtual_total = await BlockRepository.get_by_farm(
            farmId, skip=0, limit=1000, block_category='virtual', farming_year=farmingYear
        )

        # Also get physical blocks that have active plantings (not empty or cleaning)
        # This handles the case where a planting is made directly on a physical block
        physical_blocks, _ = await BlockRepository.get_by_farm(
            farmId, skip=0, limit=1000, block_category='physical', farming_year=farmingYear
        )

        # Filter physical blocks to only include those with active plantings
        # Exclude: EMPTY (no planting), CLEANING (between cycles), PARTIAL (has virtual children instead)
        active_physical_blocks = [
            pb for pb in physical_blocks
            if pb.state not in [BlockStatus.EMPTY, BlockStatus.CLEANING, BlockStatus.PARTIAL]
        ]

        # Combine virtual blocks with active physical blocks
        blocks = list(virtual_blocks) + active_physical_blocks
        total = len(blocks)

        logger.info(f"[Dashboard] Found {total} blocks for farm {farmId} ({virtual_total} virtual, {len(active_physical_blocks)} active physical, farmingYear={farmingYear})")

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
                    severity=alert.severity.value,  # Convert enum to string value
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
                statusChanges=block.statusChanges or [],
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

        # Transition with crop data if provided
        from ...services.block.block_service_new import BlockService
        from ...models.block import BlockStatusUpdate

        # Create status update with optional crop data
        status_update = BlockStatusUpdate(
            newStatus=request.newState,
            notes=request.notes,
            targetCrop=request.targetCrop,
            actualPlantCount=request.actualPlantCount,
            force=request.force
        )

        updated_block = await BlockService.change_status(
            blockId,
            status_update,
            UUID(current_user.userId),
            current_user.email
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
        # Get virtual blocks for farm (physical blocks are just containers)
        blocks, _ = await BlockRepository.get_by_farm(
            farm_id, skip=0, limit=1000, block_category='virtual'
        )

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
