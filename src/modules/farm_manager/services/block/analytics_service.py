"""
Block Analytics Service

Aggregates and calculates comprehensive analytics for farm blocks.
Reads from: blocks, block_harvests, farm_tasks, alerts collections.
"""

from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple
from uuid import UUID
import logging

from ...models.block import Block, BlockStatus, PerformanceCategory
from ...models.block_analytics import (
    BlockAnalyticsResponse,
    BlockInfoAnalytics,
    YieldAnalytics,
    YieldTrendPoint,
    TimelineAnalytics,
    StateTransition,
    TaskAnalytics,
    TaskTypeStats,
    PerformanceMetrics,
    AlertAnalytics,
    TimePeriod,
    TrendDirection
)
from .block_repository_new import BlockRepository
from .harvest_repository import HarvestRepository
from .alert_repository import AlertRepository
from ..database import farm_db

logger = logging.getLogger(__name__)


class BlockAnalyticsService:
    """Service for generating block analytics"""

    @staticmethod
    async def get_block_analytics(
        block_id: UUID,
        period: TimePeriod = TimePeriod.ALL,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> BlockAnalyticsResponse:
        """
        Get comprehensive analytics for a block

        Args:
            block_id: Block UUID
            period: Time period to analyze (30d, 90d, 6m, 1y, all)
            start_date: Optional custom start date
            end_date: Optional custom end date

        Returns:
            Complete analytics response
        """
        logger.info(f"[Analytics] Generating analytics for block {block_id}, period: {period}")

        # Get block
        block = await BlockRepository.get_by_id(block_id)
        if not block:
            raise ValueError(f"Block not found: {block_id}")

        # Calculate date range
        actual_start_date, actual_end_date = BlockAnalyticsService._calculate_date_range(
            period, start_date, end_date, block.plantedDate
        )

        # Generate all analytics sections
        block_info = await BlockAnalyticsService._get_block_info(block)
        yield_analytics = await BlockAnalyticsService._get_yield_analytics(
            block, actual_start_date, actual_end_date
        )
        timeline_analytics = await BlockAnalyticsService._get_timeline_analytics(
            block, actual_start_date, actual_end_date
        )
        task_analytics = await BlockAnalyticsService._get_task_analytics(
            block, actual_start_date, actual_end_date
        )
        alert_analytics = await BlockAnalyticsService._get_alert_analytics(
            block, actual_start_date, actual_end_date
        )

        # Calculate performance metrics
        performance_metrics = BlockAnalyticsService._calculate_performance_metrics(
            block, yield_analytics, timeline_analytics, task_analytics
        )

        return BlockAnalyticsResponse(
            blockInfo=block_info,
            yieldAnalytics=yield_analytics,
            timelineAnalytics=timeline_analytics,
            taskAnalytics=task_analytics,
            performanceMetrics=performance_metrics,
            alertAnalytics=alert_analytics,
            period=period,
            startDate=actual_start_date,
            endDate=actual_end_date
        )

    @staticmethod
    def _calculate_date_range(
        period: TimePeriod,
        start_date: Optional[datetime],
        end_date: Optional[datetime],
        planted_date: Optional[datetime]
    ) -> Tuple[Optional[datetime], Optional[datetime]]:
        """Calculate actual start and end dates based on period"""
        now = datetime.utcnow()

        # If custom dates provided, use them
        if start_date and end_date:
            return start_date, end_date

        # Calculate based on period
        if period == TimePeriod.ALL:
            # From planting date or beginning of time
            return planted_date, now
        elif period == TimePeriod.DAYS_30:
            return now - timedelta(days=30), now
        elif period == TimePeriod.DAYS_90:
            return now - timedelta(days=90), now
        elif period == TimePeriod.MONTHS_6:
            return now - timedelta(days=180), now
        elif period == TimePeriod.YEAR_1:
            return now - timedelta(days=365), now
        else:
            return None, now

    @staticmethod
    async def _get_block_info(block: Block) -> BlockInfoAnalytics:
        """Get basic block information"""
        days_in_cycle = None
        if block.plantedDate:
            days_in_cycle = (datetime.utcnow() - block.plantedDate).days

        return BlockInfoAnalytics(
            blockId=block.blockId,
            blockCode=block.blockCode or f"B{str(block.blockId)[:6].upper()}",
            name=block.name,
            farmId=block.farmId,
            currentState=block.state.value,
            currentCrop=block.targetCropName,
            currentCropId=block.targetCrop,
            plantedDate=block.plantedDate,
            expectedHarvestDate=block.expectedHarvestDate,
            daysInCurrentCycle=days_in_cycle
        )

    @staticmethod
    async def _get_yield_analytics(
        block: Block,
        start_date: Optional[datetime],
        end_date: Optional[datetime]
    ) -> YieldAnalytics:
        """Calculate yield analytics from harvest records"""
        logger.info(f"[Analytics] Calculating yield analytics for block {block.blockId}")

        # Get harvest records
        harvests, total_harvests = await HarvestRepository.get_by_block(
            block.blockId,
            skip=0,
            limit=1000,  # Get all harvests for analytics
            start_date=start_date,
            end_date=end_date
        )

        logger.info(f"[Analytics] Found {total_harvests} harvests")

        # Calculate totals and quality breakdown
        total_yield = 0.0
        quality_breakdown = {"A": 0.0, "B": 0.0, "C": 0.0}
        yield_trend: List[YieldTrendPoint] = []
        cumulative = 0.0

        first_harvest_date = None
        last_harvest_date = None

        for harvest in sorted(harvests, key=lambda h: h.harvestDate):
            total_yield += harvest.quantityKg
            cumulative += harvest.quantityKg
            quality_breakdown[harvest.qualityGrade.value] += harvest.quantityKg

            # Track dates
            if first_harvest_date is None:
                first_harvest_date = harvest.harvestDate
            last_harvest_date = harvest.harvestDate

            # Build trend
            yield_trend.append(
                YieldTrendPoint(
                    date=harvest.harvestDate,
                    quantityKg=harvest.quantityKg,
                    cumulativeKg=cumulative,
                    qualityGrade=harvest.qualityGrade.value
                )
            )

        # Calculate quality distribution percentages
        quality_distribution = {
            "A": 0.0, "B": 0.0, "C": 0.0
        }
        if total_yield > 0:
            quality_distribution = {
                grade: (qty / total_yield) * 100
                for grade, qty in quality_breakdown.items()
            }

        # Calculate averages
        avg_yield_per_harvest = total_yield / total_harvests if total_harvests > 0 else 0.0

        # Harvesting duration
        harvesting_duration = None
        if first_harvest_date and last_harvest_date:
            harvesting_duration = (last_harvest_date - first_harvest_date).days

        # Performance category from block KPI
        performance_category = block.kpi.performance_category.value if block.kpi else "N/A"

        return YieldAnalytics(
            totalYieldKg=total_yield,
            predictedYieldKg=block.kpi.predictedYieldKg if block.kpi else 0.0,
            yieldEfficiencyPercent=block.kpi.yieldEfficiencyPercent if block.kpi else 0.0,
            yieldByQuality=quality_breakdown,
            qualityDistribution=quality_distribution,
            totalHarvests=total_harvests,
            avgYieldPerHarvest=avg_yield_per_harvest,
            firstHarvestDate=first_harvest_date,
            lastHarvestDate=last_harvest_date,
            harvestingDuration=harvesting_duration,
            yieldTrend=yield_trend,
            performanceCategory=performance_category
        )

    @staticmethod
    async def _get_timeline_analytics(
        block: Block,
        start_date: Optional[datetime],
        end_date: Optional[datetime]
    ) -> TimelineAnalytics:
        """Calculate timeline and state transition analytics"""
        logger.info(f"[Analytics] Calculating timeline analytics for block {block.blockId}")

        # Calculate days in each state
        days_in_each_state: Dict[str, int] = {}
        state_transitions: List[StateTransition] = []

        on_time_count = 0
        early_count = 0
        late_count = 0
        total_offset = 0.0
        offset_count = 0

        # Process status changes
        for i, change in enumerate(block.statusChanges):
            # Filter by date range if specified
            if start_date and change.changedAt < start_date:
                continue
            if end_date and change.changedAt > end_date:
                continue

            # Calculate days in previous state
            days_in_prev = None
            if i > 0:
                prev_change = block.statusChanges[i - 1]
                days_in_prev = (change.changedAt - prev_change.changedAt).days

            # Build transition record
            from_state = block.statusChanges[i - 1].status.value if i > 0 else "empty"

            transition = StateTransition(
                fromState=from_state,
                toState=change.status.value,
                transitionDate=change.changedAt,
                daysInPreviousState=days_in_prev,
                expectedDate=change.expectedDate,
                offsetDays=change.offsetDays,
                onTime=change.offsetType == "on_time" if change.offsetType else None
            )

            state_transitions.append(transition)

            # Count timing performance
            if change.offsetType == "on_time":
                on_time_count += 1
            elif change.offsetType == "early":
                early_count += 1
            elif change.offsetType == "late":
                late_count += 1

            # Calculate average offset
            if change.offsetDays is not None:
                total_offset += change.offsetDays
                offset_count += 1

        # Current state duration
        current_state_duration = 0
        current_state_start = None
        if block.statusChanges:
            last_change = block.statusChanges[-1]
            current_state_start = last_change.changedAt
            current_state_duration = (datetime.utcnow() - last_change.changedAt).days

        # Cycle duration
        cycle_duration = None
        expected_cycle_duration = None
        if block.plantedDate:
            cycle_duration = (datetime.utcnow() - block.plantedDate).days

        # Get expected cycle from plant data if available
        if block.targetCrop:
            db = farm_db.get_database()
            plant_data = await db.plant_data_enhanced.find_one({"plantDataId": str(block.targetCrop)})
            if plant_data and plant_data.get("growthCycle"):
                expected_cycle_duration = plant_data["growthCycle"].get("totalCycleDays")

        # Average offset
        avg_offset = total_offset / offset_count if offset_count > 0 else None

        return TimelineAnalytics(
            daysInEachState=days_in_each_state,
            stateTransitions=state_transitions,
            currentState=block.state.value,
            currentStateDuration=current_state_duration,
            currentStateStartDate=current_state_start,
            cycleDuration=cycle_duration,
            expectedCycleDuration=expected_cycle_duration,
            onTimeTransitions=on_time_count,
            earlyTransitions=early_count,
            lateTransitions=late_count,
            avgOffsetDays=avg_offset
        )

    @staticmethod
    async def _get_task_analytics(
        block: Block,
        start_date: Optional[datetime],
        end_date: Optional[datetime]
    ) -> TaskAnalytics:
        """Calculate task analytics"""
        logger.info(f"[Analytics] Calculating task analytics for block {block.blockId}")

        db = farm_db.get_database()

        # Build query for tasks related to this block
        query: Dict[str, Any] = {"blockId": str(block.blockId)}

        # Add date filters if specified
        if start_date or end_date:
            query["scheduledDate"] = {}
            if start_date:
                query["scheduledDate"]["$gte"] = start_date
            if end_date:
                query["scheduledDate"]["$lte"] = end_date

        # Get all tasks
        tasks = await db.farm_tasks.find(query).to_list(length=1000)

        logger.info(f"[Analytics] Found {len(tasks)} tasks")

        # Calculate overall stats
        total_tasks = len(tasks)
        completed_tasks = sum(1 for t in tasks if t.get("status") == "completed")
        pending_tasks = sum(1 for t in tasks if t.get("status") == "pending")
        overdue_tasks = sum(
            1 for t in tasks
            if t.get("status") == "pending" and t.get("scheduledDate") and t["scheduledDate"] < datetime.utcnow()
        )

        completion_rate = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0.0

        # Calculate average completion delay
        delays = []
        for task in tasks:
            if task.get("status") == "completed" and task.get("scheduledDate") and task.get("completedAt"):
                delay = (task["completedAt"] - task["scheduledDate"]).days
                delays.append(delay)

        avg_delay = sum(delays) / len(delays) if delays else None

        # Group by task type
        task_types: Dict[str, List[dict]] = {}
        for task in tasks:
            task_type = task.get("taskType", "other")
            if task_type not in task_types:
                task_types[task_type] = []
            task_types[task_type].append(task)

        # Calculate stats per type
        tasks_by_type: Dict[str, TaskTypeStats] = {}
        for task_type, type_tasks in task_types.items():
            total = len(type_tasks)
            completed = sum(1 for t in type_tasks if t.get("status") == "completed")
            pending = sum(1 for t in type_tasks if t.get("status") == "pending")
            overdue = sum(
                1 for t in type_tasks
                if t.get("status") == "pending" and t.get("scheduledDate") and t["scheduledDate"] < datetime.utcnow()
            )

            type_completion_rate = (completed / total * 100) if total > 0 else 0.0

            # Type-specific delay
            type_delays = []
            for task in type_tasks:
                if task.get("status") == "completed" and task.get("scheduledDate") and task.get("completedAt"):
                    delay = (task["completedAt"] - task["scheduledDate"]).days
                    type_delays.append(delay)

            type_avg_delay = sum(type_delays) / len(type_delays) if type_delays else None

            tasks_by_type[task_type] = TaskTypeStats(
                total=total,
                completed=completed,
                pending=pending,
                overdue=overdue,
                completionRate=type_completion_rate,
                avgCompletionDelay=type_avg_delay
            )

        # Recent and upcoming tasks
        now = datetime.utcnow()
        recent_completed = sum(
            1 for t in tasks
            if t.get("status") == "completed" and t.get("completedAt") and (now - t["completedAt"]).days <= 7
        )
        upcoming_tasks = sum(
            1 for t in tasks
            if t.get("status") == "pending" and t.get("scheduledDate") and 0 <= (t["scheduledDate"] - now).days <= 7
        )

        return TaskAnalytics(
            totalTasks=total_tasks,
            completedTasks=completed_tasks,
            pendingTasks=pending_tasks,
            overdueTasks=overdue_tasks,
            completionRate=completion_rate,
            avgCompletionDelay=avg_delay,
            tasksByType=tasks_by_type,
            recentCompletedTasks=recent_completed,
            upcomingTasks=upcoming_tasks
        )

    @staticmethod
    async def _get_alert_analytics(
        block: Block,
        start_date: Optional[datetime],
        end_date: Optional[datetime]
    ) -> AlertAnalytics:
        """Calculate alert analytics"""
        logger.info(f"[Analytics] Calculating alert analytics for block {block.blockId}")

        # Get all alerts for this block
        alerts, total_alerts = await AlertRepository.get_by_block(
            block.blockId,
            skip=0,
            limit=1000
        )

        # Filter by date if specified
        if start_date or end_date:
            alerts = [
                a for a in alerts
                if (not start_date or a.createdAt >= start_date) and
                   (not end_date or a.createdAt <= end_date)
            ]

        # Count by status
        active_count = sum(1 for a in alerts if a.status == "active")
        resolved_count = sum(1 for a in alerts if a.status == "resolved")
        dismissed_count = sum(1 for a in alerts if a.status == "dismissed")

        # Count by severity
        critical_count = sum(1 for a in alerts if a.severity.value == "critical")
        high_count = sum(1 for a in alerts if a.severity.value == "high")
        medium_count = sum(1 for a in alerts if a.severity.value == "medium")
        low_count = sum(1 for a in alerts if a.severity.value == "low")

        # Calculate resolution times (for resolved alerts)
        resolution_times = []
        for alert in alerts:
            if alert.status == "resolved" and alert.resolvedAt:
                resolution_hours = (alert.resolvedAt - alert.createdAt).total_seconds() / 3600
                resolution_times.append(resolution_hours)

        avg_resolution = sum(resolution_times) / len(resolution_times) if resolution_times else None
        fastest_resolution = min(resolution_times) if resolution_times else None
        slowest_resolution = max(resolution_times) if resolution_times else None

        return AlertAnalytics(
            totalAlerts=len(alerts),
            activeAlerts=active_count,
            resolvedAlerts=resolved_count,
            dismissedAlerts=dismissed_count,
            criticalCount=critical_count,
            highCount=high_count,
            mediumCount=medium_count,
            lowCount=low_count,
            avgResolutionTimeHours=avg_resolution,
            fastestResolutionHours=fastest_resolution,
            slowestResolutionHours=slowest_resolution
        )

    @staticmethod
    def _calculate_performance_metrics(
        block: Block,
        yield_analytics: YieldAnalytics,
        timeline_analytics: TimelineAnalytics,
        task_analytics: TaskAnalytics
    ) -> PerformanceMetrics:
        """Calculate overall performance metrics and provide insights"""

        # Yield performance
        yield_efficiency = yield_analytics.yieldEfficiencyPercent
        performance_category = yield_analytics.performanceCategory

        # Get icon from block KPI
        performance_icon = block.kpi.performance_icon if block.kpi else ""

        # Timeline performance
        avg_delay = timeline_analytics.avgOffsetDays
        total_transitions = (
            timeline_analytics.onTimeTransitions +
            timeline_analytics.earlyTransitions +
            timeline_analytics.lateTransitions
        )
        on_time_rate = (
            (timeline_analytics.onTimeTransitions / total_transitions * 100)
            if total_transitions > 0 else 0.0
        )

        # Task performance
        task_completion_rate = task_analytics.completionRate
        task_on_time_rate = 0.0
        if task_analytics.completedTasks > 0 and task_analytics.avgCompletionDelay is not None:
            # Calculate tasks completed on time or early
            task_on_time_rate = max(0.0, 100.0 - abs(task_analytics.avgCompletionDelay * 10))

        # Calculate overall score (weighted average)
        scores = []
        weights = []

        if yield_efficiency > 0:
            scores.append(min(100, yield_efficiency))
            weights.append(0.4)  # 40% weight

        if on_time_rate > 0:
            scores.append(on_time_rate)
            weights.append(0.3)  # 30% weight

        if task_completion_rate > 0:
            scores.append(task_completion_rate)
            weights.append(0.3)  # 30% weight

        overall_score = None
        if scores and weights:
            overall_score = sum(s * w for s, w in zip(scores, weights)) / sum(weights)

        # Determine trend (simplified - would need historical data for real trend)
        trend = TrendDirection.INSUFFICIENT_DATA
        if overall_score:
            if overall_score >= 85:
                trend = TrendDirection.IMPROVING
            elif overall_score >= 70:
                trend = TrendDirection.STABLE
            else:
                trend = TrendDirection.DECLINING

        # Identify strengths and improvements
        strengths = []
        improvements = []

        if yield_efficiency >= 90:
            strengths.append("Excellent yield efficiency")
        elif yield_efficiency < 70:
            improvements.append("Improve yield efficiency - currently below target")

        if task_completion_rate >= 85:
            strengths.append("Strong task completion rate")
        elif task_completion_rate < 70:
            improvements.append("Improve task completion rate")

        if on_time_rate >= 80:
            strengths.append("Good timeline adherence")
        elif on_time_rate < 60:
            improvements.append("Improve timeline adherence - many late transitions")

        # Quality distribution
        if yield_analytics.qualityDistribution.get("A", 0) >= 70:
            strengths.append("High-quality yield (Grade A)")
        elif yield_analytics.qualityDistribution.get("C", 0) >= 20:
            improvements.append("Reduce Grade C yield - quality issues detected")

        if not strengths:
            strengths.append("Continue current practices")
        if not improvements:
            improvements.append("Maintain current performance levels")

        return PerformanceMetrics(
            yieldEfficiencyPercent=yield_efficiency,
            performanceCategory=performance_category,
            performanceIcon=performance_icon,
            avgDelayDays=avg_delay,
            onTimeRate=on_time_rate,
            taskCompletionRate=task_completion_rate,
            taskOnTimeRate=task_on_time_rate,
            overallScore=overall_score,
            trend=trend,
            strengths=strengths,
            improvements=improvements
        )
