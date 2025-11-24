"""
Global Analytics Service

Aggregates analytics across ALL farms in the system.
Provides system-wide insights, farm comparisons, and performance rankings.
"""

from datetime import datetime
from typing import List, Dict, Any, Optional
from collections import defaultdict
import logging
import asyncio

from ..models.global_analytics import (
    GlobalAnalyticsResponse,
    GlobalAggregatedMetrics,
    GlobalStateBreakdown,
    FarmSummaryItem,
    GlobalYieldTimeline,
    GlobalPerformanceInsights
)
from ..models.farm_analytics import FarmAnalyticsResponse
from .farm.farm_analytics_service import FarmAnalyticsService
from .farm.farm_repository import FarmRepository

logger = logging.getLogger(__name__)


class GlobalAnalyticsService:
    """Service for generating global analytics across all farms"""

    @staticmethod
    async def get_global_analytics(period: str = "30d") -> GlobalAnalyticsResponse:
        """
        Get comprehensive analytics aggregated across ALL farms in the system.

        Args:
            period: Time period ('30d', '90d', '6m', '1y', 'all')

        Returns:
            Complete global analytics response

        Raises:
            ValueError: If period is invalid
        """
        logger.info(f"[Global Analytics] Generating global analytics for period: {period}")

        # Get all farms (fetch with high limit to get all farms)
        farm_repo = FarmRepository()
        all_farms, _ = await farm_repo.get_all(skip=0, limit=10000, is_active=True)

        if not all_farms:
            logger.warning("[Global Analytics] No farms found in system")
            # Return empty analytics
            return GlobalAnalyticsService._create_empty_analytics(period)

        logger.info(f"[Global Analytics] Found {len(all_farms)} farms")

        # Fetch analytics for all farms in parallel
        farm_analytics_list = await GlobalAnalyticsService._fetch_all_farm_analytics(
            all_farms, period
        )

        # Calculate date range from first farm's analytics (they all use same period)
        start_date = farm_analytics_list[0].startDate if farm_analytics_list else datetime.utcnow()
        end_date = farm_analytics_list[0].endDate if farm_analytics_list else datetime.utcnow()

        # Aggregate metrics across all farms
        aggregated_metrics = GlobalAnalyticsService._aggregate_metrics(farm_analytics_list)

        # Aggregate state breakdown
        state_breakdown = GlobalAnalyticsService._aggregate_state_breakdown(farm_analytics_list)

        # Build farm summaries
        farm_summaries = GlobalAnalyticsService._build_farm_summaries(
            all_farms, farm_analytics_list
        )

        # Aggregate yield timeline
        yield_timeline = GlobalAnalyticsService._aggregate_yield_timeline(farm_analytics_list)

        # Calculate performance insights
        performance_insights = GlobalAnalyticsService._calculate_performance_insights(
            farm_summaries
        )

        return GlobalAnalyticsResponse(
            period=period,
            startDate=start_date,
            endDate=end_date,
            aggregatedMetrics=aggregated_metrics,
            stateBreakdown=state_breakdown,
            farmSummaries=farm_summaries,
            yieldTimeline=yield_timeline,
            performanceInsights=performance_insights
        )

    @staticmethod
    async def _fetch_all_farm_analytics(
        farms: List[Any],
        period: str
    ) -> List[FarmAnalyticsResponse]:
        """
        Fetch analytics for all farms in parallel.

        Args:
            farms: List of farm objects
            period: Time period for analytics

        Returns:
            List of farm analytics responses
        """
        logger.info(f"[Global Analytics] Fetching analytics for {len(farms)} farms in parallel")

        # Create tasks for fetching each farm's analytics
        tasks = []
        for farm in farms:
            task = GlobalAnalyticsService._fetch_farm_analytics_safe(farm.farmId, period)
            tasks.append(task)

        # Execute all tasks in parallel
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Filter out failed requests (exceptions)
        farm_analytics_list = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"[Global Analytics] Failed to fetch analytics for farm {farms[i].farmId}: {result}")
            else:
                farm_analytics_list.append(result)

        logger.info(f"[Global Analytics] Successfully fetched analytics for {len(farm_analytics_list)}/{len(farms)} farms")

        return farm_analytics_list

    @staticmethod
    async def _fetch_farm_analytics_safe(farm_id, period: str) -> Optional[FarmAnalyticsResponse]:
        """
        Safely fetch farm analytics (handles errors gracefully).

        Args:
            farm_id: Farm UUID
            period: Time period

        Returns:
            Farm analytics or None if error
        """
        try:
            return await FarmAnalyticsService.get_farm_analytics(farm_id, period)
        except Exception as e:
            logger.error(f"[Global Analytics] Error fetching analytics for farm {farm_id}: {e}")
            raise

    @staticmethod
    def _aggregate_metrics(
        farm_analytics_list: List[FarmAnalyticsResponse]
    ) -> GlobalAggregatedMetrics:
        """
        Aggregate metrics across all farms.

        Args:
            farm_analytics_list: List of farm analytics

        Returns:
            Global aggregated metrics
        """
        logger.info(f"[Global Analytics] Aggregating metrics from {len(farm_analytics_list)} farms")

        total_farms = len(farm_analytics_list)
        total_blocks = 0
        total_active_plantings = 0
        total_yield_kg = 0.0
        total_capacity = 0
        total_predicted_yield = 0.0

        # For weighted averages
        total_weighted_efficiency = 0.0
        total_performance_score = 0.0
        total_utilization = 0.0

        for farm_analytics in farm_analytics_list:
            metrics = farm_analytics.aggregatedMetrics

            total_blocks += metrics.totalBlocks
            total_active_plantings += metrics.activePlantings
            total_yield_kg += metrics.totalYieldKg
            total_capacity += metrics.totalCapacity
            total_predicted_yield += metrics.predictedYieldKg

            # Weighted by predicted yield for efficiency
            if metrics.predictedYieldKg > 0:
                total_weighted_efficiency += metrics.avgYieldEfficiency * metrics.predictedYieldKg

            # Simple average for performance and utilization
            total_performance_score += metrics.overallPerformanceScore
            total_utilization += metrics.currentUtilization

        # Calculate averages
        avg_yield_efficiency = 0.0
        if total_predicted_yield > 0:
            avg_yield_efficiency = total_weighted_efficiency / total_predicted_yield

        avg_performance_score = total_performance_score / total_farms if total_farms > 0 else 0.0
        avg_utilization = total_utilization / total_farms if total_farms > 0 else 0.0

        return GlobalAggregatedMetrics(
            totalFarms=total_farms,
            totalBlocks=total_blocks,
            totalActivePlantings=total_active_plantings,
            totalYieldKg=round(total_yield_kg, 2),
            avgYieldEfficiencyAcrossFarms=round(avg_yield_efficiency, 2),
            avgPerformanceScore=round(avg_performance_score, 2),
            totalCapacity=total_capacity,
            avgUtilization=round(avg_utilization, 2),
            totalPredictedYieldKg=round(total_predicted_yield, 2)
        )

    @staticmethod
    def _aggregate_state_breakdown(
        farm_analytics_list: List[FarmAnalyticsResponse]
    ) -> GlobalStateBreakdown:
        """
        Aggregate state breakdown across all farms.

        Args:
            farm_analytics_list: List of farm analytics

        Returns:
            Global state breakdown
        """
        logger.info("[Global Analytics] Aggregating state breakdown")

        state_counts = {
            "empty": 0,
            "planned": 0,
            "growing": 0,
            "fruiting": 0,
            "harvesting": 0,
            "cleaning": 0,
            "alert": 0
        }

        total_blocks = 0

        for farm_analytics in farm_analytics_list:
            breakdown = farm_analytics.stateBreakdown

            state_counts["empty"] += breakdown.empty.count
            state_counts["planned"] += breakdown.planned.count
            state_counts["growing"] += breakdown.growing.count
            state_counts["fruiting"] += breakdown.fruiting.count
            state_counts["harvesting"] += breakdown.harvesting.count
            state_counts["cleaning"] += breakdown.cleaning.count
            state_counts["alert"] += breakdown.alert.count

            total_blocks += farm_analytics.aggregatedMetrics.totalBlocks

        return GlobalStateBreakdown(
            empty=state_counts["empty"],
            planned=state_counts["planned"],
            growing=state_counts["growing"],
            fruiting=state_counts["fruiting"],
            harvesting=state_counts["harvesting"],
            cleaning=state_counts["cleaning"],
            alert=state_counts["alert"],
            totalBlocks=total_blocks
        )

    @staticmethod
    def _build_farm_summaries(
        farms: List[Any],
        farm_analytics_list: List[FarmAnalyticsResponse]
    ) -> List[FarmSummaryItem]:
        """
        Build summary items for each farm.

        Args:
            farms: List of farm objects
            farm_analytics_list: List of farm analytics

        Returns:
            List of farm summary items
        """
        logger.info("[Global Analytics] Building farm summaries")

        # Create mapping of farm_id to analytics
        analytics_map = {
            str(analytics.farmId): analytics
            for analytics in farm_analytics_list
        }

        summaries = []

        for farm in farms:
            farm_id_str = str(farm.farmId)
            analytics = analytics_map.get(farm_id_str)

            if not analytics:
                logger.warning(f"[Global Analytics] No analytics found for farm {farm_id_str}")
                continue

            metrics = analytics.aggregatedMetrics

            summaries.append(
                FarmSummaryItem(
                    farmId=farm.farmId,
                    farmName=farm.name,
                    totalBlocks=metrics.totalBlocks,
                    activePlantings=metrics.activePlantings,
                    totalYieldKg=round(metrics.totalYieldKg, 2),
                    avgYieldEfficiency=round(metrics.avgYieldEfficiency, 2),
                    overallPerformanceScore=round(metrics.overallPerformanceScore, 2),
                    currentUtilization=round(metrics.currentUtilization, 2)
                )
            )

        # Sort by performance score (descending)
        summaries.sort(key=lambda x: x.overallPerformanceScore, reverse=True)

        return summaries

    @staticmethod
    def _aggregate_yield_timeline(
        farm_analytics_list: List[FarmAnalyticsResponse]
    ) -> List[GlobalYieldTimeline]:
        """
        Aggregate yield timeline across all farms.

        Args:
            farm_analytics_list: List of farm analytics

        Returns:
            Global yield timeline
        """
        logger.info("[Global Analytics] Aggregating yield timeline")

        # Collect all yield timeline points from all farms
        # Group by date
        timeline_by_date: Dict[str, Dict[str, Any]] = defaultdict(
            lambda: {"total_kg": 0.0, "harvest_count": 0, "farms": set()}
        )

        for farm_analytics in farm_analytics_list:
            for point in farm_analytics.historicalTrends.yieldTimeline:
                date_key = point.date.date().isoformat()

                timeline_by_date[date_key]["total_kg"] += point.totalYieldKg
                timeline_by_date[date_key]["harvest_count"] += point.harvestCount
                timeline_by_date[date_key]["farms"].add(str(farm_analytics.farmId))

        # Build global timeline
        global_timeline: List[GlobalYieldTimeline] = []

        for date_str, data in sorted(timeline_by_date.items()):
            global_timeline.append(
                GlobalYieldTimeline(
                    date=datetime.fromisoformat(date_str),
                    totalYieldKg=round(data["total_kg"], 2),
                    harvestCount=data["harvest_count"],
                    farmCount=len(data["farms"])
                )
            )

        return global_timeline

    @staticmethod
    def _calculate_performance_insights(
        farm_summaries: List[FarmSummaryItem]
    ) -> GlobalPerformanceInsights:
        """
        Calculate performance insights and identify top/bottom performers.

        Args:
            farm_summaries: List of farm summaries (already sorted by performance)

        Returns:
            Global performance insights
        """
        logger.info("[Global Analytics] Calculating performance insights")

        if not farm_summaries:
            return GlobalPerformanceInsights(
                topPerformingFarms=[],
                underPerformingFarms=[],
                farmsNeedingAttention=[],
                overallTrend="insufficient_data"
            )

        # Top 5 performers
        top_performing = farm_summaries[:5]

        # Bottom 5 performers (reverse order to show worst first)
        under_performing = farm_summaries[-5:][::-1] if len(farm_summaries) >= 5 else []

        # Farms needing attention (low utilization < 50% OR low performance < 60)
        farms_needing_attention = [
            farm for farm in farm_summaries
            if farm.currentUtilization < 50.0 or farm.overallPerformanceScore < 60.0
        ]

        # Calculate overall trend
        overall_trend = "insufficient_data"
        if len(farm_summaries) >= 3:
            avg_performance = sum(f.overallPerformanceScore for f in farm_summaries) / len(farm_summaries)

            if avg_performance >= 85:
                overall_trend = "improving"
            elif avg_performance >= 70:
                overall_trend = "stable"
            else:
                overall_trend = "declining"

        return GlobalPerformanceInsights(
            topPerformingFarms=top_performing,
            underPerformingFarms=under_performing,
            farmsNeedingAttention=farms_needing_attention,
            overallTrend=overall_trend
        )

    @staticmethod
    def _create_empty_analytics(period: str) -> GlobalAnalyticsResponse:
        """
        Create empty analytics response when no farms exist.

        Args:
            period: Time period

        Returns:
            Empty global analytics response
        """
        now = datetime.utcnow()

        return GlobalAnalyticsResponse(
            period=period,
            startDate=now,
            endDate=now,
            aggregatedMetrics=GlobalAggregatedMetrics(),
            stateBreakdown=GlobalStateBreakdown(),
            farmSummaries=[],
            yieldTimeline=[],
            performanceInsights=GlobalPerformanceInsights()
        )
