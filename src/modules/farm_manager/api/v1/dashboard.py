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
    FarmingYearContext,
    CropBreakdownItem,
    FarmYieldKpi,
    CropYieldKpi
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
    farmIds: Optional[str] = Query(
        None,
        description="Comma-separated farm IDs to filter by"
    ),
    states: Optional[str] = Query(
        None,
        description="Comma-separated block states to filter by (e.g., 'growing,harvesting')"
    ),
    cropName: Optional[str] = Query(
        None,
        description="Filter by crop name (partial match, case-insensitive)"
    ),
    dateFrom: Optional[str] = Query(
        None,
        description="Filter harvests from this date (ISO format YYYY-MM-DD)"
    ),
    dateTo: Optional[str] = Query(
        None,
        description="Filter harvests up to this date (ISO format YYYY-MM-DD)"
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

    **Additional Filters**:
    - `farmIds`: Restrict results to a specific subset of farms (comma-separated IDs)
    - `states`: Restrict block counts to specific block states (comma-separated)
    - `cropName`: Case-insensitive partial match on `targetCropName`
    - `dateFrom` / `dateTo`: Narrow harvest records to a date range (YYYY-MM-DD)

    Returns:
    - Overview metrics (total farms, blocks, active plantings, upcoming harvests)
    - Block counts by state (across all farms)
    - Block counts grouped by farm
    - Harvest totals by farm
    - Recent activity counts
    - Farming year context (when filter is applied)
    - Crop breakdown (block count per crop, top 20)
    """
    try:
        from ...services.database import farm_db

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
        farm_name_map = {f["farmId"]: f["name"] for f in farms}

        # Apply farmIds filter: restrict to the requested subset
        if farmIds:
            requested_ids = [fid.strip() for fid in farmIds.split(",") if fid.strip()]
            farm_ids = [fid for fid in farm_ids if fid in requested_ids]

        # Validate and parse dateFrom / dateTo once so both harvest queries share the values
        parsed_date_from: Optional[datetime] = None
        parsed_date_to: Optional[datetime] = None
        if dateFrom:
            try:
                parsed_date_from = datetime.fromisoformat(dateFrom)
            except ValueError:
                raise HTTPException(
                    400,
                    f"Invalid dateFrom format '{dateFrom}'. Expected YYYY-MM-DD."
                )
        if dateTo:
            try:
                # Include the full end day by setting time to 23:59:59
                parsed_date_to = datetime.fromisoformat(dateTo + "T23:59:59")
            except ValueError:
                raise HTTPException(
                    400,
                    f"Invalid dateTo format '{dateTo}'. Expected YYYY-MM-DD."
                )

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
        # Add states filter if specified
        if states:
            state_list = [s.strip() for s in states.split(",") if s.strip()]
            block_match_criteria["state"] = {"$in": state_list}
        # Add cropName partial-match filter if specified
        if cropName:
            block_match_criteria["targetCropName"] = {
                "$regex": cropName.strip(),
                "$options": "i"
            }

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
        # Add date range filters if specified
        if parsed_date_from or parsed_date_to:
            harvest_match_criteria["harvestDate"] = {}
            if parsed_date_from:
                harvest_match_criteria["harvestDate"]["$gte"] = parsed_date_from
            if parsed_date_to:
                harvest_match_criteria["harvestDate"]["$lte"] = parsed_date_to

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

        # Step 6: Count recent harvests (last 7 days), respecting date filters
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        recent_harvests_query: dict = {
            "farmId": {"$in": farm_ids}
        }
        # Add farming year filter if specified
        if farmingYear is not None:
            recent_harvests_query["farmingYear"] = farmingYear
        # Merge date range: use the later of seven_days_ago vs parsed_date_from
        effective_from = max(seven_days_ago, parsed_date_from) if parsed_date_from else seven_days_ago
        recent_harvests_query["harvestDate"] = {"$gte": effective_from}
        if parsed_date_to:
            recent_harvests_query["harvestDate"]["$lte"] = parsed_date_to

        recent_harvests_count = await db.block_harvests.count_documents(recent_harvests_query)

        # Step 7: Count pending tasks (if task system exists)
        pending_tasks_count = 0  # Placeholder - implement when task system is ready

        # Step 8: Crop breakdown - per farm, so the frontend can filter by farm
        crops_pipeline = [
            {
                "$match": {
                    **block_match_criteria,
                    "targetCropName": {"$ne": None}
                }
            },
            {"$group": {
                "_id": {"farmId": "$farmId", "cropName": "$targetCropName"},
                "blockCount": {"$sum": 1}
            }},
            {"$sort": {"blockCount": -1}},
        ]
        crops_result = await db.blocks.aggregate(crops_pipeline).to_list(None)
        crop_breakdown = [
            CropBreakdownItem(
                cropName=item["_id"]["cropName"],
                blockCount=item["blockCount"],
                farmId=item["_id"]["farmId"],
                farmName=farm_name_map.get(item["_id"]["farmId"], "Unknown"),
            )
            for item in crops_result
        ]

        # Step 9: Yield KPI per farm
        # Actual yield: from block_harvests (same source as harvestsByFarm)
        # so the numbers match the Harvest by Farm chart and include
        # completed/archived cycles, not just what's currently on the field.
        actual_by_farm: dict[str, float] = {}
        for h in harvests_by_farm:
            actual_by_farm[str(h.farmId)] = h.totalKg

        # Predicted yield: sum from active blocks + archived cycles
        predicted_pipeline = [
            {"$match": block_match_criteria},
            {"$group": {
                "_id": "$farmId",
                "predictedYieldKg": {"$sum": {"$ifNull": ["$kpi.predictedYieldKg", 0]}},
            }},
        ]
        predicted_result = await db.blocks.aggregate(predicted_pipeline).to_list(None)
        predicted_by_farm: dict[str, float] = {
            item["_id"]: item["predictedYieldKg"] for item in predicted_result
        }

        # Also include predicted yield from archived cycles (completed blocks
        # whose predicted yield is no longer on an active block document).
        archive_match: dict = {"farmId": {"$in": farm_ids}}
        if farmingYear is not None:
            archive_match["farmingYearPlanted"] = farmingYear
        archive_predicted_pipeline = [
            {"$match": archive_match},
            {"$group": {
                "_id": "$farmId",
                "predictedYieldKg": {"$sum": {"$ifNull": ["$predictedYieldKg", 0]}},
            }},
        ]
        archive_predicted_result = await db.block_archives.aggregate(archive_predicted_pipeline).to_list(None)
        for item in archive_predicted_result:
            predicted_by_farm[item["_id"]] = predicted_by_farm.get(item["_id"], 0) + item["predictedYieldKg"]

        # Merge into per-farm KPI
        all_farm_ids_for_yield = set(list(actual_by_farm.keys()) + list(predicted_by_farm.keys()))
        yield_by_farm = []
        for fid in all_farm_ids_for_yield:
            actual = actual_by_farm.get(fid, 0)
            predicted = predicted_by_farm.get(fid, 0)
            efficiency = round((actual / predicted * 100) if predicted > 0 else 0, 1)
            yield_by_farm.append(FarmYieldKpi(
                farmId=fid,
                farmName=farm_name_map.get(fid, "Unknown"),
                actualYieldKg=actual,
                predictedYieldKg=predicted,
                efficiencyPercent=efficiency,
            ))
        yield_by_farm.sort(key=lambda x: x.efficiencyPercent, reverse=True)

        # Step 10: Yield KPI per crop (per farm, so frontend can filter)
        # Actual yield: $lookup from block_harvests → blocks to get cropName
        crop_actual_pipeline = [
            {"$match": harvest_match_criteria},
            {"$lookup": {
                "from": "blocks",
                "localField": "blockId",
                "foreignField": "blockId",
                "as": "block",
            }},
            {"$unwind": {"path": "$block", "preserveNullAndEmptyArrays": True}},
            {"$group": {
                "_id": {
                    "farmId": "$farmId",
                    "cropName": {"$ifNull": ["$block.targetCropName", "Unknown"]},
                },
                "actualYieldKg": {"$sum": "$quantityKg"},
            }},
        ]
        crop_actual_result = await db.block_harvests.aggregate(crop_actual_pipeline).to_list(None)
        crop_actual: dict[tuple, float] = {
            (item["_id"]["farmId"], item["_id"]["cropName"]): item["actualYieldKg"]
            for item in crop_actual_result
        }

        # Predicted yield per crop: active blocks + archives
        crop_predicted_pipeline = [
            {"$match": {**block_match_criteria, "targetCropName": {"$ne": None}}},
            {"$group": {
                "_id": {"farmId": "$farmId", "cropName": "$targetCropName"},
                "predictedYieldKg": {"$sum": {"$ifNull": ["$kpi.predictedYieldKg", 0]}},
            }},
        ]
        crop_predicted_result = await db.blocks.aggregate(crop_predicted_pipeline).to_list(None)
        crop_predicted: dict[tuple, float] = {
            (item["_id"]["farmId"], item["_id"]["cropName"]): item["predictedYieldKg"]
            for item in crop_predicted_result
        }

        # Add archived cycles' predicted yield
        archive_crop_pipeline = [
            {"$match": {**archive_match, "targetCropName": {"$ne": None}}},
            {"$group": {
                "_id": {"farmId": "$farmId", "cropName": "$targetCropName"},
                "predictedYieldKg": {"$sum": {"$ifNull": ["$predictedYieldKg", 0]}},
            }},
        ]
        archive_crop_result = await db.block_archives.aggregate(archive_crop_pipeline).to_list(None)
        for item in archive_crop_result:
            key = (item["_id"]["farmId"], item["_id"]["cropName"])
            crop_predicted[key] = crop_predicted.get(key, 0) + item["predictedYieldKg"]

        # Merge into per-crop-per-farm KPI
        all_crop_keys = set(list(crop_actual.keys()) + list(crop_predicted.keys()))
        yield_by_crop = []
        for key in all_crop_keys:
            fid, crop_name = key
            actual = crop_actual.get(key, 0)
            predicted = crop_predicted.get(key, 0)
            efficiency = round((actual / predicted * 100) if predicted > 0 else 0, 1)
            yield_by_crop.append(CropYieldKpi(
                cropName=crop_name,
                actualYieldKg=actual,
                predictedYieldKg=predicted,
                efficiencyPercent=efficiency,
                farmId=fid,
                farmName=farm_name_map.get(fid, "Unknown"),
            ))
        yield_by_crop.sort(key=lambda x: x.efficiencyPercent, reverse=True)

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
            farmingYearContext=farming_year_context,
            cropBreakdown=crop_breakdown,
            yieldByFarm=yield_by_farm,
            yieldByCrop=yield_by_crop
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

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Dashboard Summary] Error: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Failed to load dashboard summary: {str(e)}")


# ============================================================================
# FILTER HELPER ENDPOINTS
# ============================================================================

@router.get(
    "/filters/crops",
    summary="Get available crop names for filtering",
    description="Return distinct crop names across all active virtual blocks for use in filter dropdowns"
)
async def get_filter_crops(
    farmingYear: Optional[int] = Query(
        None,
        description="Restrict crop names to blocks planted in this farming year"
    ),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Get distinct crop names across all blocks for filter dropdown.

    Args:
        farmingYear: Optional farming year to narrow the result set
        current_user: Authenticated user (injected by dependency)

    Returns:
        Sorted list of distinct crop name strings
    """
    from ...services.database import farm_db

    db = farm_db.get_database()

    match_criteria = {
        "isActive": True,
        "blockCategory": "virtual",
        "targetCropName": {"$ne": None}
    }
    if farmingYear is not None:
        match_criteria["farmingYearPlanted"] = farmingYear

    crops = await db.blocks.distinct("targetCropName", match_criteria)
    return {"success": True, "crops": sorted([c for c in crops if c])}


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
                blockCategory=getattr(block, 'blockCategory', None),
                parentBlockId=getattr(block, 'parentBlockId', None),
                calculated=calculated,
                activeAlerts=active_alerts
            )

            dashboard_blocks.append(dashboard_block)

        # Get recent activity (last 7 days)
        recent_activity = await get_recent_activity(farmId, days=7, farming_year=farmingYear)

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
# KPI RECALCULATION
# ============================================================================

@router.post(
    "/recalculate-kpi",
    summary="Recalculate block KPIs from harvest records",
    description="Recomputes actualYieldKg, totalHarvests, and yieldEfficiencyPercent for all blocks (or a specific farm) by summing actual harvest records. Use this to fix KPI drift caused by race conditions during bulk imports."
)
async def recalculate_kpi(
    farmId: Optional[UUID] = Query(None, description="Limit to a specific farm (omit for all farms)"),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Recalculate block KPIs from actual harvest records.

    Fixes data where actualYieldKg / totalHarvests don't match
    the sum of block_harvests records (caused by concurrent write race conditions).
    """
    if current_user.role not in ["super_admin", "admin"]:
        raise HTTPException(403, "Only admins can recalculate KPIs")

    from ...services.block.harvest_repository import HarvestRepository
    from ...services.database import farm_db

    db = farm_db.get_database()

    try:
        # Get blocks to recalculate
        block_filter = {"isActive": True}
        if farmId:
            block_filter["farmId"] = str(farmId)

        blocks = await db.blocks.find(block_filter, {"blockId": 1, "kpi": 1, "blockCode": 1}).to_list(length=5000)

        fixed = 0
        skipped = 0
        errors = []

        for block_doc in blocks:
            block_id = block_doc["blockId"]
            block_code = block_doc.get("blockCode", block_id[:8])

            try:
                # Sum all harvest records for this block
                pipeline = [
                    {"$match": {"blockId": block_id}},
                    {"$group": {
                        "_id": None,
                        "totalYieldKg": {"$sum": "$quantityKg"},
                        "harvestCount": {"$sum": 1}
                    }}
                ]
                agg_result = await db.block_harvests.aggregate(pipeline).to_list(length=1)

                if agg_result:
                    actual_yield = round(agg_result[0]["totalYieldKg"], 2)
                    actual_count = agg_result[0]["harvestCount"]
                else:
                    actual_yield = 0.0
                    actual_count = 0

                current_kpi = block_doc.get("kpi", {})
                current_yield = current_kpi.get("actualYieldKg", 0)
                current_count = current_kpi.get("totalHarvests", 0)
                predicted = current_kpi.get("predictedYieldKg", 0)

                # Check if update needed
                yield_diff = abs(actual_yield - current_yield)
                count_diff = abs(actual_count - current_count)

                if yield_diff < 0.5 and count_diff == 0:
                    skipped += 1
                    continue

                # Calculate new efficiency
                efficiency = round((actual_yield / predicted) * 100, 2) if predicted > 0 else 0.0

                # Update block KPI
                await db.blocks.update_one(
                    {"blockId": block_id},
                    {"$set": {
                        "kpi.actualYieldKg": actual_yield,
                        "kpi.totalHarvests": actual_count,
                        "kpi.yieldEfficiencyPercent": efficiency,
                        "updatedAt": datetime.utcnow()
                    }}
                )

                fixed += 1
                logger.info(
                    f"[KPI Recalc] {block_code}: yield {current_yield:.1f} -> {actual_yield:.1f} kg, "
                    f"harvests {current_count} -> {actual_count}"
                )

            except Exception as e:
                errors.append({"blockCode": block_code, "error": str(e)})
                logger.error(f"[KPI Recalc] Error for {block_code}: {str(e)}")

        result = {
            "success": True,
            "message": f"KPI recalculation complete",
            "totalBlocks": len(blocks),
            "fixed": fixed,
            "skipped": skipped,
            "errors": len(errors)
        }

        if errors:
            result["errorDetails"] = errors[:10]

        logger.info(
            f"[KPI Recalc] Done: {fixed} fixed, {skipped} already correct, "
            f"{len(errors)} errors out of {len(blocks)} blocks"
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[KPI Recalc] Failed: {str(e)}", exc_info=True)
        raise HTTPException(500, f"KPI recalculation failed: {str(e)}")


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

async def get_recent_activity(farm_id: UUID, days: int = 7, farming_year: Optional[int] = None) -> List[DashboardActivity]:
    """
    Get recent activity for the farm (last N days)

    Args:
        farm_id: Farm ID
        days: Number of days to look back
        farming_year: Optional farming year filter

    Returns:
        List of recent activities
    """
    activities: List[DashboardActivity] = []

    try:
        # Get virtual blocks for farm (physical blocks are just containers)
        blocks, _ = await BlockRepository.get_by_farm(
            farm_id, skip=0, limit=1000, block_category='virtual', farming_year=farming_year
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
