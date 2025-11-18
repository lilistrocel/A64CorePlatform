"""
Dashboard Calculator Utilities

Functions to calculate dashboard metrics and enrich block data.
"""

from datetime import datetime, timedelta
from typing import Optional, Dict
from uuid import UUID

from ..models.block import Block, BlockStatus, PerformanceCategory
from ..models.dashboard import BlockCalculated


async def calculate_block_metrics(
    block: Block,
    plant_data: Optional[Dict] = None
) -> BlockCalculated:
    """
    Calculate all dashboard metrics for a block

    Args:
        block: Block instance
        plant_data: Optional plant data for growth cycle info

    Returns:
        BlockCalculated with all metrics
    """
    import logging
    logger = logging.getLogger(__name__)

    now = datetime.utcnow()

    # ==================================================
    # TIMELINESS TRACKING
    # ==================================================

    # Days in current state
    last_change = block.statusChanges[-1] if block.statusChanges else None
    days_in_state = (
        (now - last_change.changedAt).days
        if last_change
        else 0
    )

    # Next transition
    expected_next_date = None
    days_until_next = None

    if block.expectedStatusChanges:
        # State order for progression
        state_order = ["planned", "planted", "growing", "fruiting", "harvesting", "cleaning"]

        # Find current state index
        try:
            current_idx = state_order.index(block.state.value)
        except ValueError:
            current_idx = -1

        # Get next expected state
        if 0 <= current_idx < len(state_order) - 1:
            next_state = state_order[current_idx + 1]
            expected_next_date = block.expectedStatusChanges.get(next_state)

            if expected_next_date:
                days_until_next = (expected_next_date.date() - now.date()).days

    # Delay calculation
    is_delayed = False
    delay_days = 0

    if expected_next_date and days_until_next is not None:
        if days_until_next < 0:
            # Past expected date = delayed
            is_delayed = True
            delay_days = abs(days_until_next)
        else:
            # Future date = on track (negative delay = days ahead)
            delay_days = -days_until_next

    # ==================================================
    # CAPACITY
    # ==================================================

    capacity_percent = (
        (block.actualPlantCount / block.maxPlants * 100)
        if block.maxPlants > 0 and block.actualPlantCount
        else 0.0
    )

    # ==================================================
    # YIELD PERFORMANCE
    # ==================================================

    yield_progress = 0.0
    yield_status = "on_track"
    estimated_final_yield = block.kpi.predictedYieldKg
    performance_category = block.kpi.performance_category

    if block.state == BlockStatus.HARVESTING and block.kpi.predictedYieldKg > 0:
        # Calculate current yield progress
        yield_progress = (
            block.kpi.actualYieldKg / block.kpi.predictedYieldKg * 100
        )

        # Determine yield status
        if yield_progress >= 100:
            yield_status = "ahead"
        elif yield_progress < 70:
            yield_status = "behind"
        else:
            yield_status = "on_track"

        # Estimate final yield based on current rate
        if block.kpi.totalHarvests > 0 and block.plantedDate:
            days_harvesting = (now - block.plantedDate).days

            if days_harvesting > 0:
                avg_yield_per_day = block.kpi.actualYieldKg / days_harvesting

                # Get expected harvest duration from plant data
                if plant_data and "growthCycle" in plant_data:
                    total_harvest_days = plant_data["growthCycle"].get("harvestDurationDays", 30)
                    estimated_final_yield = avg_yield_per_day * total_harvest_days
                else:
                    # Default estimate: 30 days harvest period
                    estimated_final_yield = avg_yield_per_day * 30

    # ==================================================
    # NEXT ACTION
    # ==================================================

    next_action = determine_next_action(block)

    # ==================================================
    # BUILD CALCULATED OBJECT
    # ==================================================

    return BlockCalculated(
        daysInCurrentState=days_in_state,
        expectedStateChangeDate=expected_next_date,
        daysUntilNextTransition=days_until_next,
        isDelayed=is_delayed,
        delayDays=delay_days,
        capacityPercent=round(capacity_percent, 1),
        yieldProgress=round(yield_progress, 1),
        yieldStatus=yield_status,
        estimatedFinalYield=round(estimated_final_yield, 1),
        performanceCategory=performance_category,
        nextAction=next_action,
        nextActionDate=expected_next_date
    )


def determine_next_action(block: Block) -> str:
    """
    Determine recommended next action for block

    Args:
        block: Block instance

    Returns:
        Action identifier string
    """
    if block.state == BlockStatus.EMPTY:
        return "plant_crop"
    elif block.state == BlockStatus.PLANNED:
        return "start_planting"
    elif block.state == BlockStatus.PLANTED:
        return "transition_to_growing"
    elif block.state == BlockStatus.GROWING:
        return "transition_to_fruiting"
    elif block.state == BlockStatus.FRUITING:
        return "transition_to_harvesting"
    elif block.state == BlockStatus.HARVESTING:
        return "record_harvest"
    elif block.state == BlockStatus.CLEANING:
        return "mark_empty"
    elif block.state == BlockStatus.ALERT:
        return "resolve_alert"
    else:
        return "view_details"


def calculate_farm_summary(blocks: list[Block]) -> Dict:
    """
    Calculate aggregated farm statistics

    Args:
        blocks: List of all blocks in farm

    Returns:
        Dictionary with summary statistics
    """
    summary = {
        "totalBlocks": len(blocks),
        "blocksByState": {},
        "totalActivePlantings": 0,
        "totalPredictedYieldKg": 0.0,
        "totalActualYieldKg": 0.0,
        "avgYieldEfficiency": 0.0,
        "activeAlerts": {
            "critical": 0,
            "high": 0,
            "medium": 0,
            "low": 0
        }
    }

    # Initialize state counts
    for state in BlockStatus:
        summary["blocksByState"][state.value] = 0

    # Count blocks and aggregate metrics
    total_efficiency = 0.0
    blocks_with_kpi = 0

    for block in blocks:
        # Count by state
        summary["blocksByState"][block.state.value] += 1

        # Count active plantings
        if block.state in [
            BlockStatus.PLANTED,
            BlockStatus.GROWING,
            BlockStatus.FRUITING,
            BlockStatus.HARVESTING
        ]:
            summary["totalActivePlantings"] += 1

        # Aggregate yield
        if block.kpi.predictedYieldKg > 0:
            summary["totalPredictedYieldKg"] += block.kpi.predictedYieldKg
            summary["totalActualYieldKg"] += block.kpi.actualYieldKg
            total_efficiency += block.kpi.yieldEfficiencyPercent
            blocks_with_kpi += 1

    # Calculate average efficiency
    if blocks_with_kpi > 0:
        summary["avgYieldEfficiency"] = round(total_efficiency / blocks_with_kpi, 1)

    return summary
