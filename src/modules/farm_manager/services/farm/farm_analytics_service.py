"""
Farm Analytics Service

Aggregates and calculates comprehensive analytics across all blocks in a farm.
Provides farm-level insights including yield totals, state distribution, block comparisons, and trends.
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any, Tuple, Optional
from uuid import UUID
import logging
from collections import defaultdict

from ...models.farm_analytics import (
    FarmAnalyticsResponse,
    AggregatedMetrics,
    StateBreakdown,
    StateBreakdownItem,
    BlockComparisonItem,
    HistoricalTrends,
    YieldTimelinePoint,
    StateTransitionEvent
)
from ...models.block import Block, BlockStatus
from ...models.block_analytics import TimePeriod
from ..block.block_repository_new import BlockRepository
from ..block.harvest_repository import HarvestRepository
from ..block.alert_repository import AlertRepository
from ..database import farm_db

logger = logging.getLogger(__name__)


class FarmAnalyticsService:
    """Service for generating farm-level analytics"""

    @staticmethod
    async def get_farm_analytics(
        farm_id: UUID,
        period: str = "30d",
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> FarmAnalyticsResponse:
        """
        Get comprehensive analytics for a farm aggregated from all blocks

        Args:
            farm_id: Farm UUID
            period: Time period ('30d', '90d', '6m', '1y', 'all')
            start_date: Optional custom start date
            end_date: Optional custom end date

        Returns:
            Complete farm analytics response

        Raises:
            ValueError: If farm not found
        """
        logger.info(f"[Farm Analytics] Generating analytics for farm {farm_id}, period: {period}")

        # Get farm details
        from .farm_repository import FarmRepository
        farm_repo = FarmRepository()
        farm = await farm_repo.get_by_id(farm_id)
        if not farm:
            raise ValueError(f"Farm not found: {farm_id}")

        # Calculate date range
        actual_start_date, actual_end_date = FarmAnalyticsService._calculate_date_range(
            period, start_date, end_date
        )

        # Get all blocks for this farm
        blocks, total_blocks = await BlockRepository.get_by_farm(
            farm_id,
            skip=0,
            limit=1000  # Get all blocks
        )

        logger.info(f"[Farm Analytics] Found {total_blocks} blocks")

        # Calculate all analytics sections
        aggregated_metrics = await FarmAnalyticsService._calculate_aggregated_metrics(
            blocks, actual_start_date, actual_end_date
        )

        state_breakdown = await FarmAnalyticsService._calculate_state_breakdown(blocks)

        block_comparison = await FarmAnalyticsService._calculate_block_comparison(
            blocks, actual_start_date, actual_end_date
        )

        historical_trends = await FarmAnalyticsService._calculate_historical_trends(
            farm_id, blocks, actual_start_date, actual_end_date
        )

        return FarmAnalyticsResponse(
            farmId=farm_id,
            farmName=farm.name,
            period=period,
            startDate=actual_start_date,
            endDate=actual_end_date,
            aggregatedMetrics=aggregated_metrics,
            stateBreakdown=state_breakdown,
            blockComparison=block_comparison,
            historicalTrends=historical_trends
        )

    @staticmethod
    def _calculate_date_range(
        period: str,
        start_date: Optional[datetime],
        end_date: Optional[datetime]
    ) -> Tuple[datetime, datetime]:
        """Calculate actual start and end dates based on period"""
        now = datetime.utcnow()

        # If custom dates provided, use them
        if start_date and end_date:
            return start_date, end_date

        # Calculate based on period
        if period == "all":
            # From beginning of time
            return datetime(2020, 1, 1), now
        elif period == "30d":
            return now - timedelta(days=30), now
        elif period == "90d":
            return now - timedelta(days=90), now
        elif period == "6m":
            return now - timedelta(days=180), now
        elif period == "1y":
            return now - timedelta(days=365), now
        else:
            # Default to 30 days
            return now - timedelta(days=30), now

    @staticmethod
    async def _calculate_aggregated_metrics(
        blocks: List[Block],
        start_date: datetime,
        end_date: datetime
    ) -> AggregatedMetrics:
        """Calculate aggregated metrics from all blocks"""
        logger.info(f"[Farm Analytics] Calculating aggregated metrics for {len(blocks)} blocks")

        total_blocks = len(blocks)
        total_yield_kg = 0.0
        total_predicted_yield = 0.0
        total_weighted_efficiency = 0.0
        total_performance_score = 0.0
        total_capacity = 0
        current_plant_count = 0
        active_plantings = 0

        # Count blocks in active planting states
        active_states = {BlockStatus.GROWING, BlockStatus.FRUITING, BlockStatus.HARVESTING}

        for block in blocks:
            # Count active plantings
            if block.state in active_states:
                active_plantings += 1

            # Sum capacity
            total_capacity += block.maxPlants

            # Sum current plant count
            if block.actualPlantCount:
                current_plant_count += block.actualPlantCount

            # Sum KPI metrics from current cycle
            if block.kpi:
                # Note: actualYieldKg from KPI represents current cycle only
                # Historical yields will be added separately below
                total_yield_kg += block.kpi.actualYieldKg
                total_predicted_yield += block.kpi.predictedYieldKg

                # Weighted average efficiency (weight by predicted yield)
                if block.kpi.predictedYieldKg > 0:
                    total_weighted_efficiency += block.kpi.yieldEfficiencyPercent * block.kpi.predictedYieldKg

                # Calculate simple performance score (0-100)
                # Based on yield efficiency capped at 100%
                performance = min(100, block.kpi.yieldEfficiencyPercent)
                total_performance_score += performance

        # Add historical harvest yields within the date range
        logger.info(f"[Farm Analytics] Fetching historical harvests within date range")
        for block in blocks:
            harvests, _ = await HarvestRepository.get_by_block(
                block.blockId,
                skip=0,
                limit=1000,
                start_date=start_date,
                end_date=end_date
            )
            # Sum all harvest quantities
            for harvest in harvests:
                total_yield_kg += harvest.quantityKg

        logger.info(f"[Farm Analytics] Total yield including historical harvests: {total_yield_kg} kg")

        # Calculate averages
        avg_yield_efficiency = 0.0
        if total_predicted_yield > 0:
            avg_yield_efficiency = total_weighted_efficiency / total_predicted_yield

        overall_performance_score = total_performance_score / total_blocks if total_blocks > 0 else 0.0

        # Calculate utilization
        current_utilization = (current_plant_count / total_capacity * 100) if total_capacity > 0 else 0.0

        return AggregatedMetrics(
            totalBlocks=total_blocks,
            activePlantings=active_plantings,
            totalYieldKg=round(total_yield_kg, 2),
            avgYieldEfficiency=round(avg_yield_efficiency, 2),
            overallPerformanceScore=round(overall_performance_score, 2),
            totalCapacity=total_capacity,
            currentUtilization=round(current_utilization, 2),
            predictedYieldKg=round(total_predicted_yield, 2)
        )

    @staticmethod
    async def _calculate_state_breakdown(blocks: List[Block]) -> StateBreakdown:
        """Calculate breakdown of blocks by current state"""
        logger.info(f"[Farm Analytics] Calculating state breakdown")

        # Initialize state tracking
        state_data: Dict[str, Dict[str, Any]] = {
            "empty": {"block_ids": [], "days": []},
            "planned": {"block_ids": [], "days": []},
            "growing": {"block_ids": [], "days": []},
            "fruiting": {"block_ids": [], "days": []},
            "harvesting": {"block_ids": [], "days": []},
            "cleaning": {"block_ids": [], "days": []},
            "alert": {"block_ids": [], "days": []}
        }

        # Group blocks by state
        for block in blocks:
            state_key = block.state.value

            if state_key in state_data:
                state_data[state_key]["block_ids"].append(block.blockId)

                # Calculate days in current state
                if block.statusChanges:
                    last_change = block.statusChanges[-1]
                    days_in_state = (datetime.utcnow() - last_change.changedAt).days
                    state_data[state_key]["days"].append(days_in_state)

        # Build breakdown with calculated averages
        breakdown = StateBreakdown()

        for state_name, data in state_data.items():
            avg_days = sum(data["days"]) / len(data["days"]) if data["days"] else None

            item = StateBreakdownItem(
                count=len(data["block_ids"]),
                blockIds=data["block_ids"],
                avgDaysInState=round(avg_days, 1) if avg_days is not None else None
            )

            setattr(breakdown, state_name, item)

        return breakdown

    @staticmethod
    async def _calculate_block_comparison(
        blocks: List[Block],
        start_date: datetime,
        end_date: datetime
    ) -> List[BlockComparisonItem]:
        """Calculate comparison data for each block"""
        logger.info(f"[Farm Analytics] Calculating block comparison data")

        db = farm_db.get_database()
        comparison_items: List[BlockComparisonItem] = []

        for block in blocks:
            # Calculate days in cycle
            days_in_cycle = None
            if block.plantedDate:
                days_in_cycle = (datetime.utcnow() - block.plantedDate).days

            # Get task completion rate
            tasks = await db.farm_tasks.find({
                "blockId": str(block.blockId)
            }).to_list(length=1000)

            total_tasks = len(tasks)
            completed_tasks = sum(1 for t in tasks if t.get("status") == "completed")
            task_completion_rate = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0.0

            # Get active alerts count
            alerts, _ = await AlertRepository.get_by_block(
                block.blockId,
                skip=0,
                limit=1000
            )
            active_alerts = sum(1 for a in alerts if a.status == "active")

            # Calculate performance score (simple average of yield efficiency and task completion)
            yield_score = min(100, block.kpi.yieldEfficiencyPercent) if block.kpi else 0.0
            performance_score = (yield_score + task_completion_rate) / 2

            comparison_items.append(
                BlockComparisonItem(
                    blockId=block.blockId,
                    blockCode=block.blockCode or f"B{str(block.blockId)[:6]}",
                    name=block.name,
                    state=block.state.value,
                    currentCrop=block.targetCropName,
                    yieldKg=round(block.kpi.actualYieldKg, 2) if block.kpi else 0.0,
                    yieldEfficiency=round(block.kpi.yieldEfficiencyPercent, 2) if block.kpi else 0.0,
                    performanceScore=round(performance_score, 2),
                    daysInCycle=days_in_cycle,
                    taskCompletionRate=round(task_completion_rate, 2),
                    activeAlerts=active_alerts
                )
            )

        # Sort by performance score (descending)
        comparison_items.sort(key=lambda x: x.performanceScore, reverse=True)

        return comparison_items

    @staticmethod
    async def _calculate_historical_trends(
        farm_id: UUID,
        blocks: List[Block],
        start_date: datetime,
        end_date: datetime
    ) -> HistoricalTrends:
        """Calculate historical trends and patterns"""
        logger.info(f"[Farm Analytics] Calculating historical trends")

        # Collect all harvests across all blocks within date range
        all_harvests = []
        for block in blocks:
            harvests, _ = await HarvestRepository.get_by_block(
                block.blockId,
                skip=0,
                limit=1000,
                start_date=start_date,
                end_date=end_date
            )
            all_harvests.extend([(h, block.blockId, block.blockCode) for h in harvests])

        # Group harvests by date (daily aggregation)
        yield_by_date: Dict[str, Dict[str, Any]] = defaultdict(
            lambda: {"total_kg": 0.0, "count": 0, "block_ids": set()}
        )

        for harvest, block_id, block_code in all_harvests:
            date_key = harvest.harvestDate.date().isoformat()
            yield_by_date[date_key]["total_kg"] += harvest.quantityKg
            yield_by_date[date_key]["count"] += 1
            yield_by_date[date_key]["block_ids"].add(block_id)

        # Build yield timeline
        yield_timeline: List[YieldTimelinePoint] = []
        for date_str, data in sorted(yield_by_date.items()):
            yield_timeline.append(
                YieldTimelinePoint(
                    date=datetime.fromisoformat(date_str),
                    totalYieldKg=round(data["total_kg"], 2),
                    harvestCount=data["count"],
                    blockIds=list(data["block_ids"])
                )
            )

        # Collect state transitions within date range
        state_transitions: List[StateTransitionEvent] = []
        for block in blocks:
            for i, change in enumerate(block.statusChanges):
                # Filter by date range
                if change.changedAt < start_date or change.changedAt > end_date:
                    continue

                from_state = block.statusChanges[i - 1].status.value if i > 0 else "empty"

                state_transitions.append(
                    StateTransitionEvent(
                        date=change.changedAt,
                        blockId=block.blockId,
                        blockCode=block.blockCode or f"B{str(block.blockId)[:6]}",
                        fromState=from_state,
                        toState=change.status.value
                    )
                )

        # Sort transitions by date (most recent first)
        state_transitions.sort(key=lambda x: x.date, reverse=True)
        # Limit to 50 most recent transitions
        state_transitions = state_transitions[:50]

        # Calculate average harvests per week
        total_weeks = max(1, (end_date - start_date).days / 7)
        total_harvest_events = sum(data["count"] for data in yield_by_date.values())
        avg_harvests_per_week = total_harvest_events / total_weeks

        # Determine performance trend (simplified)
        performance_trend = "insufficient_data"
        if len(blocks) >= 3:
            # Calculate average performance of blocks
            performances = [
                min(100, b.kpi.yieldEfficiencyPercent) if b.kpi else 0.0
                for b in blocks
                if b.state in {BlockStatus.GROWING, BlockStatus.FRUITING, BlockStatus.HARVESTING}
            ]

            if performances:
                avg_performance = sum(performances) / len(performances)
                if avg_performance >= 85:
                    performance_trend = "improving"
                elif avg_performance >= 70:
                    performance_trend = "stable"
                else:
                    performance_trend = "declining"

        return HistoricalTrends(
            yieldTimeline=yield_timeline,
            stateTransitions=state_transitions,
            performanceTrend=performance_trend,
            avgHarvestsPerWeek=round(avg_harvests_per_week, 2)
        )
