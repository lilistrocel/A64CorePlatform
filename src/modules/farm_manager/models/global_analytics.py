"""
Global Analytics Models

Analytics aggregated across ALL farms in the system.
Provides system-wide insights into production performance, yield totals, and farm comparisons.
"""

from datetime import datetime
from typing import List, Dict
from uuid import UUID
from pydantic import BaseModel, Field


class FarmSummaryItem(BaseModel):
    """Summary of a single farm for global analytics view"""
    farmId: UUID = Field(..., description="Farm UUID")
    farmName: str = Field(..., description="Farm name")
    totalBlocks: int = Field(0, description="Total number of blocks in farm")
    activePlantings: int = Field(0, description="Number of active plantings")
    totalYieldKg: float = Field(0.0, description="Total actual yield (kg)")
    avgYieldEfficiency: float = Field(0.0, description="Average yield efficiency (%)")
    overallPerformanceScore: float = Field(0.0, ge=0, le=100, description="Overall performance score")
    currentUtilization: float = Field(0.0, ge=0, le=100, description="Current utilization (%)")


class GlobalAggregatedMetrics(BaseModel):
    """Global metrics aggregated across all farms"""
    totalFarms: int = Field(0, description="Total number of farms in system")
    totalBlocks: int = Field(0, description="Total blocks across all farms")
    totalActivePlantings: int = Field(0, description="Total active plantings across all farms")
    totalYieldKg: float = Field(0.0, description="Total actual yield across all farms (kg)")
    avgYieldEfficiencyAcrossFarms: float = Field(0.0, description="Weighted average yield efficiency (%)")
    avgPerformanceScore: float = Field(0.0, ge=0, le=100, description="Average performance score across all farms")
    totalCapacity: int = Field(0, description="Total capacity (maxPlants) across all farms")
    avgUtilization: float = Field(0.0, ge=0, le=100, description="Average utilization across all farms (%)")
    totalPredictedYieldKg: float = Field(0.0, description="Total predicted yield across all farms (kg)")


class GlobalStateBreakdown(BaseModel):
    """Block state distribution across all farms"""
    empty: int = Field(0, description="Total blocks in empty state")
    planned: int = Field(0, description="Total blocks in planned state")
    growing: int = Field(0, description="Total blocks in growing state")
    fruiting: int = Field(0, description="Total blocks in fruiting state")
    harvesting: int = Field(0, description="Total blocks in harvesting state")
    cleaning: int = Field(0, description="Total blocks in cleaning state")
    alert: int = Field(0, description="Total blocks in alert state")
    totalBlocks: int = Field(0, description="Total blocks across all farms")


class GlobalYieldTimeline(BaseModel):
    """Global yield timeline aggregation point"""
    date: datetime = Field(..., description="Date of aggregation")
    totalYieldKg: float = Field(0.0, description="Total yield harvested across all farms (kg)")
    harvestCount: int = Field(0, description="Total number of harvest events")
    farmCount: int = Field(0, description="Number of farms that had harvests on this date")


class GlobalPerformanceInsights(BaseModel):
    """Global performance insights and farm comparisons"""
    topPerformingFarms: List[FarmSummaryItem] = Field(
        default_factory=list,
        description="Top 5 performing farms by performance score"
    )
    underPerformingFarms: List[FarmSummaryItem] = Field(
        default_factory=list,
        description="Bottom 5 performing farms by performance score"
    )
    farmsNeedingAttention: List[FarmSummaryItem] = Field(
        default_factory=list,
        description="Farms with low utilization or low performance"
    )
    overallTrend: str = Field(
        "insufficient_data",
        description="Overall system trend: improving, stable, declining, insufficient_data"
    )


class GlobalAnalyticsResponse(BaseModel):
    """Complete global analytics response aggregated across all farms"""
    period: str = Field(..., description="Time period: 30d, 90d, 6m, 1y, all")
    startDate: datetime = Field(..., description="Start date of analytics period")
    endDate: datetime = Field(..., description="End date of analytics period")
    generatedAt: datetime = Field(default_factory=datetime.utcnow, description="Timestamp of report generation")

    aggregatedMetrics: GlobalAggregatedMetrics
    stateBreakdown: GlobalStateBreakdown
    farmSummaries: List[FarmSummaryItem] = Field(
        default_factory=list,
        description="Summary statistics for each farm"
    )
    yieldTimeline: List[GlobalYieldTimeline] = Field(
        default_factory=list,
        description="Daily/weekly yield aggregation across all farms"
    )
    performanceInsights: GlobalPerformanceInsights

    class Config:
        json_schema_extra = {
            "example": {
                "period": "30d",
                "startDate": "2025-10-25T00:00:00Z",
                "endDate": "2025-11-24T00:00:00Z",
                "generatedAt": "2025-11-24T10:00:00Z",
                "aggregatedMetrics": {
                    "totalFarms": 2,
                    "totalBlocks": 8,
                    "totalActivePlantings": 1,
                    "totalYieldKg": 150.5,
                    "avgYieldEfficiencyAcrossFarms": 42.6,
                    "avgPerformanceScore": 28.9,
                    "totalCapacity": 20700,
                    "avgUtilization": 48.4,
                    "totalPredictedYieldKg": 3003.3
                },
                "stateBreakdown": {
                    "empty": 7,
                    "planned": 0,
                    "growing": 0,
                    "fruiting": 0,
                    "harvesting": 1,
                    "cleaning": 0,
                    "alert": 0,
                    "totalBlocks": 8
                },
                "farmSummaries": [
                    {
                        "farmId": "0bef9a0e-172c-4b5d-96a0-5fd98c268967",
                        "farmName": "GreenLeaf Greenhouse Farm",
                        "totalBlocks": 8,
                        "activePlantings": 1,
                        "totalYieldKg": 150.5,
                        "avgYieldEfficiency": 85.2,
                        "overallPerformanceScore": 45.8,
                        "currentUtilization": 12.5
                    }
                ],
                "yieldTimeline": [
                    {
                        "date": "2025-11-01T00:00:00Z",
                        "totalYieldKg": 50.5,
                        "harvestCount": 5,
                        "farmCount": 2
                    }
                ],
                "performanceInsights": {
                    "topPerformingFarms": [],
                    "underPerformingFarms": [],
                    "farmsNeedingAttention": [],
                    "overallTrend": "declining"
                }
            }
        }
