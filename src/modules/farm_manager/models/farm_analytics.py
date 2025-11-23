"""
Farm Analytics Models

Comprehensive analytics and statistics aggregated across all blocks in a farm.
Provides farm-level insights into yield performance, state distribution, block comparison, and trends.
"""

from datetime import datetime
from typing import List, Optional, Dict
from uuid import UUID
from pydantic import BaseModel, Field


class AggregatedMetrics(BaseModel):
    """Farm-level aggregated metrics from all blocks"""
    totalBlocks: int = Field(0, description="Total number of blocks in farm")
    activePlantings: int = Field(0, description="Blocks currently in growing/fruiting/harvesting states")
    totalYieldKg: float = Field(0.0, description="Total actual yield across all blocks (kg)")
    avgYieldEfficiency: float = Field(0.0, description="Weighted average yield efficiency (%)")
    overallPerformanceScore: float = Field(0.0, ge=0, le=100, description="Average performance score across blocks")
    totalCapacity: int = Field(0, description="Sum of maxPlants across all blocks")
    currentUtilization: float = Field(0.0, ge=0, le=100, description="Current plants / capacity (%)")
    predictedYieldKg: float = Field(0.0, description="Total predicted yield across all active plantings (kg)")


class StateBreakdownItem(BaseModel):
    """Statistics for blocks in a specific state"""
    count: int = Field(0, description="Number of blocks in this state")
    blockIds: List[UUID] = Field(default_factory=list, description="List of block IDs in this state")
    avgDaysInState: Optional[float] = Field(None, description="Average days blocks have been in this state")


class StateBreakdown(BaseModel):
    """Breakdown of blocks by current state"""
    empty: StateBreakdownItem = Field(default_factory=StateBreakdownItem)
    planned: StateBreakdownItem = Field(default_factory=StateBreakdownItem)
    growing: StateBreakdownItem = Field(default_factory=StateBreakdownItem)
    fruiting: StateBreakdownItem = Field(default_factory=StateBreakdownItem)
    harvesting: StateBreakdownItem = Field(default_factory=StateBreakdownItem)
    cleaning: StateBreakdownItem = Field(default_factory=StateBreakdownItem)
    alert: StateBreakdownItem = Field(default_factory=StateBreakdownItem)


class BlockComparisonItem(BaseModel):
    """Individual block comparison data for farm analytics"""
    blockId: UUID
    blockCode: str
    name: Optional[str]
    state: str = Field(..., description="Current block state")
    currentCrop: Optional[str] = Field(None, description="Current crop name")
    yieldKg: float = Field(0.0, description="Actual yield in current cycle (kg)")
    yieldEfficiency: float = Field(0.0, description="Yield efficiency (%)")
    performanceScore: float = Field(0.0, ge=0, le=100, description="Overall performance score")
    daysInCycle: Optional[int] = Field(None, description="Days since planting")
    taskCompletionRate: float = Field(0.0, ge=0, le=100, description="Task completion rate (%)")
    activeAlerts: int = Field(0, description="Number of active alerts")


class YieldTimelinePoint(BaseModel):
    """Daily/weekly yield aggregation point"""
    date: datetime = Field(..., description="Date of aggregation")
    totalYieldKg: float = Field(0.0, description="Total yield harvested on this date (kg)")
    harvestCount: int = Field(0, description="Number of harvest events")
    blockIds: List[UUID] = Field(default_factory=list, description="Blocks that had harvests")


class StateTransitionEvent(BaseModel):
    """State transition event across farm"""
    date: datetime = Field(..., description="Date of transition")
    blockId: UUID
    blockCode: str
    fromState: str
    toState: str


class HistoricalTrends(BaseModel):
    """Historical trends and patterns"""
    yieldTimeline: List[YieldTimelinePoint] = Field(
        default_factory=list,
        description="Daily/weekly yield totals over period"
    )
    stateTransitions: List[StateTransitionEvent] = Field(
        default_factory=list,
        description="Recent state transitions across farm"
    )
    performanceTrend: str = Field(
        "insufficient_data",
        description="Overall trend: improving, stable, declining, insufficient_data"
    )
    avgHarvestsPerWeek: float = Field(0.0, description="Average harvest events per week")


class FarmAnalyticsResponse(BaseModel):
    """Complete farm-level analytics response"""
    farmId: UUID
    farmName: str
    period: str = Field(..., description="Time period: 30d, 90d, 6m, 1y, all")
    startDate: datetime
    endDate: datetime
    generatedAt: datetime = Field(default_factory=datetime.utcnow)

    aggregatedMetrics: AggregatedMetrics
    stateBreakdown: StateBreakdown
    blockComparison: List[BlockComparisonItem] = Field(
        default_factory=list,
        description="Comparison data for all blocks"
    )
    historicalTrends: HistoricalTrends

    class Config:
        json_schema_extra = {
            "example": {
                "farmId": "0bef9a0e-172c-4b5d-96a0-5fd98c268967",
                "farmName": "GreenLeaf Greenhouse Farm",
                "period": "30d",
                "startDate": "2025-10-24T00:00:00Z",
                "endDate": "2025-11-23T00:00:00Z",
                "generatedAt": "2025-11-23T10:30:00Z",
                "aggregatedMetrics": {
                    "totalBlocks": 8,
                    "activePlantings": 1,
                    "totalYieldKg": 150.5,
                    "avgYieldEfficiency": 85.2,
                    "overallPerformanceScore": 78.0,
                    "totalCapacity": 800,
                    "currentUtilization": 37.5,
                    "predictedYieldKg": 3003.0
                },
                "stateBreakdown": {
                    "empty": {"count": 7, "blockIds": [], "avgDaysInState": 45.0},
                    "harvesting": {"count": 1, "blockIds": [], "avgDaysInState": 12.0}
                },
                "blockComparison": [
                    {
                        "blockId": "block-uuid",
                        "blockCode": "F001-024",
                        "name": "A01",
                        "state": "harvesting",
                        "currentCrop": "Lettuce",
                        "yieldKg": 0.0,
                        "yieldEfficiency": 0.0,
                        "performanceScore": 80.0,
                        "daysInCycle": 30,
                        "taskCompletionRate": 85.0,
                        "activeAlerts": 0
                    }
                ],
                "historicalTrends": {
                    "yieldTimeline": [
                        {"date": "2025-11-01T00:00:00Z", "totalYieldKg": 10.5, "harvestCount": 2, "blockIds": []}
                    ],
                    "stateTransitions": [
                        {
                            "date": "2025-11-15T00:00:00Z",
                            "blockId": "block-uuid",
                            "blockCode": "F001-024",
                            "fromState": "growing",
                            "toState": "harvesting"
                        }
                    ],
                    "performanceTrend": "improving",
                    "avgHarvestsPerWeek": 2.5
                }
            }
        }
