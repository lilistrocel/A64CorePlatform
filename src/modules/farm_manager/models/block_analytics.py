"""
Block Analytics Models

Comprehensive analytics and statistics for farm blocks.
Provides insights into yield performance, timeline tracking, task completion, and overall efficiency.
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from uuid import UUID
from pydantic import BaseModel, Field
from enum import Enum


class TimePeriod(str, Enum):
    """Time period filter options"""

    DAYS_30 = "30d"
    DAYS_90 = "90d"
    MONTHS_6 = "6m"
    YEAR_1 = "1y"
    ALL = "all"


class TrendDirection(str, Enum):
    """Trend direction"""

    IMPROVING = "improving"
    STABLE = "stable"
    DECLINING = "declining"
    INSUFFICIENT_DATA = "insufficient_data"


class StateProgressStep(BaseModel):
    """One step in the block's lifecycle progress bar"""

    state: str = Field(
        ...,
        description="Canonical state name (planned|growing|fruiting|harvesting|cleaning)",
    )
    transitionDate: Optional[datetime] = Field(
        None,
        description="Actual date the block first entered this state (from statusChanges); null if not recorded",
    )
    reached: bool = Field(
        False, description="True if the block has reached or passed this state"
    )
    isCurrent: bool = Field(
        False, description="True if this is the block's current state"
    )


class BlockInfoAnalytics(BaseModel):
    """Basic block information for analytics"""

    blockId: UUID
    blockCode: str
    name: Optional[str]
    farmId: UUID
    currentState: str
    currentCrop: Optional[str] = Field(None, description="Current crop name")
    currentCropId: Optional[UUID] = Field(None, description="Current plant data ID")
    plantedDate: Optional[datetime]
    expectedHarvestDate: Optional[datetime]
    daysInCurrentCycle: Optional[int] = Field(None, description="Days since planting")
    actualPlantCount: Optional[int] = Field(
        None, description="Current number of plants in the block"
    )

    # Plant-data version staleness fields
    plantDataVersion: Optional[int] = Field(
        None,
        description="dataVersion of the plant library record captured at planting time",
    )
    latestPlantDataVersion: Optional[int] = Field(
        None,
        description="Current dataVersion of the underlying plant_data_enhanced record",
    )
    plantDataIsStale: bool = Field(
        False,
        description=(
            "True when the plant library has been edited since this block was planted "
            "(latestPlantDataVersion > plantDataVersion)"
        ),
    )


class YieldTrendPoint(BaseModel):
    """Single point in yield trend"""

    date: datetime
    quantityKg: float
    cumulativeKg: float
    qualityGrade: str


class HarvestRecord(BaseModel):
    """One harvest entry for the Yield Records list"""

    harvestId: UUID
    harvestDate: datetime = Field(..., description="When the harvest occurred")
    quantityKg: float
    qualityGrade: str = Field(..., description="A | B | C")
    recordedByEmail: str = Field(
        ..., description="Email of the user who recorded the entry"
    )
    recordedAt: datetime = Field(
        ..., description="When the record was created (date of recording)"
    )
    notes: Optional[str] = None


class YieldAnalytics(BaseModel):
    """Yield performance analytics"""

    totalYieldKg: float = Field(0.0, description="Total harvested in current cycle")
    predictedYieldKg: float = Field(0.0, description="Expected yield from plant data")
    yieldEfficiencyPercent: float = Field(0.0, description="(actual/predicted) * 100")

    # Quality breakdown
    yieldByQuality: Dict[str, float] = Field(
        default_factory=lambda: {"A": 0.0, "B": 0.0, "C": 0.0},
        description="Yield by quality grade (kg)",
    )
    qualityDistribution: Dict[str, float] = Field(
        default_factory=lambda: {"A": 0.0, "B": 0.0, "C": 0.0},
        description="Quality distribution (percentage)",
    )

    # Harvest statistics
    totalHarvests: int = Field(0, description="Number of harvest events")
    avgYieldPerHarvest: float = Field(0.0, description="Average kg per harvest")
    firstHarvestDate: Optional[datetime] = None
    lastHarvestDate: Optional[datetime] = None
    harvestingDuration: Optional[int] = Field(
        None, description="Days between first and last harvest"
    )

    # Trend
    yieldTrend: List[YieldTrendPoint] = Field(
        default_factory=list, description="Yield trend over time"
    )
    performanceCategory: str = Field(
        "N/A", description="Performance category (excellent, good, etc.)"
    )

    # Individual harvest entries
    harvestRecords: List[HarvestRecord] = Field(
        default_factory=list,
        description="Individual harvest entries (most recent harvestDate first)",
    )


class StateTransition(BaseModel):
    """State transition record with timing"""

    fromState: str
    toState: str
    transitionDate: datetime
    daysInPreviousState: Optional[int]
    expectedDate: Optional[datetime] = Field(
        None, description="Expected date for this transition"
    )
    offsetDays: Optional[int] = Field(None, description="Actual - Expected in days")
    onTime: Optional[bool] = Field(None, description="Whether transition was on time")


class TimelineAnalytics(BaseModel):
    """Timeline and state transition analytics"""

    # Time in each state (for current cycle)
    daysInEachState: Dict[str, int] = Field(
        default_factory=dict, description="Days spent in each state"
    )

    # State transitions
    stateTransitions: List[StateTransition] = Field(
        default_factory=list, description="History of state changes"
    )

    # Current state tracking
    currentState: str
    currentStateDuration: int = Field(0, description="Days in current state")
    currentStateStartDate: Optional[datetime]

    # Cycle duration
    cycleDuration: Optional[int] = Field(
        None, description="Total days from planting to now"
    )
    expectedCycleDuration: Optional[int] = Field(
        None, description="Expected total cycle duration"
    )

    # Timeline adherence
    onTimeTransitions: int = Field(0, description="Number of on-time transitions")
    earlyTransitions: int = Field(0, description="Number of early transitions")
    lateTransitions: int = Field(0, description="Number of late transitions")
    avgOffsetDays: Optional[float] = Field(
        None, description="Average offset from expected (positive = late)"
    )


class TaskTypeStats(BaseModel):
    """Statistics for a task type"""

    total: int
    completed: int
    pending: int
    overdue: int
    completionRate: float = Field(0.0, description="Percentage completed")
    avgCompletionDelay: Optional[float] = Field(
        None, description="Average days delay (positive = late)"
    )


class TaskAnalytics(BaseModel):
    """Task completion analytics"""

    # Overall stats
    totalTasks: int = 0
    completedTasks: int = 0
    pendingTasks: int = 0
    overdueTasks: int = 0
    completionRate: float = Field(0.0, description="Percentage completed")

    # Timing
    avgCompletionDelay: Optional[float] = Field(
        None, description="Average days delay for completed tasks (positive = late)"
    )

    # By task type
    tasksByType: Dict[str, TaskTypeStats] = Field(
        default_factory=dict, description="Task statistics by type"
    )

    # Recent tasks
    recentCompletedTasks: int = Field(0, description="Tasks completed in last 7 days")
    upcomingTasks: int = Field(0, description="Tasks due in next 7 days")


class PerformanceMetrics(BaseModel):
    """Overall performance metrics"""

    # Yield performance
    yieldEfficiencyPercent: float = Field(0.0, description="Current yield efficiency")
    performanceCategory: str = Field("N/A", description="Performance category")
    performanceIcon: str = Field("", description="Icon for performance")

    # Timeline performance
    avgDelayDays: Optional[float] = Field(
        None, description="Average delay in state transitions"
    )
    onTimeRate: float = Field(0.0, description="Percentage of transitions on time")

    # Task performance
    taskCompletionRate: float = Field(0.0, description="Percentage of tasks completed")
    taskOnTimeRate: float = Field(
        0.0, description="Percentage of tasks completed on time"
    )

    # Overall assessment
    overallScore: Optional[float] = Field(
        None, ge=0, le=100, description="Overall performance score (0-100)"
    )
    trend: TrendDirection = Field(
        TrendDirection.INSUFFICIENT_DATA, description="Performance trend"
    )
    strengths: List[str] = Field(
        default_factory=list, description="Performance strengths"
    )
    improvements: List[str] = Field(
        default_factory=list, description="Areas for improvement"
    )


class AlertAnalytics(BaseModel):
    """Alert history analytics"""

    totalAlerts: int = 0
    activeAlerts: int = 0
    resolvedAlerts: int = 0
    dismissedAlerts: int = 0

    # By severity
    criticalCount: int = 0
    highCount: int = 0
    mediumCount: int = 0
    lowCount: int = 0

    # Timing
    avgResolutionTimeHours: Optional[float] = Field(
        None, description="Average hours to resolve"
    )
    fastestResolutionHours: Optional[float] = None
    slowestResolutionHours: Optional[float] = None


class BlockAnalyticsResponse(BaseModel):
    """Complete block analytics response"""

    blockInfo: BlockInfoAnalytics
    yieldAnalytics: YieldAnalytics
    timelineAnalytics: TimelineAnalytics
    taskAnalytics: TaskAnalytics
    performanceMetrics: PerformanceMetrics
    alertAnalytics: AlertAnalytics
    stateProgress: List[StateProgressStep] = Field(
        default_factory=list,
        description="Lifecycle progress steps (period-independent)",
    )

    # Metadata
    generatedAt: datetime = Field(default_factory=datetime.utcnow)
    period: TimePeriod = Field(TimePeriod.ALL, description="Time period analyzed")
    startDate: Optional[datetime] = Field(None, description="Analysis start date")
    endDate: Optional[datetime] = Field(None, description="Analysis end date")

    class Config:
        json_schema_extra = {
            "example": {
                "blockInfo": {
                    "blockId": "b1a2c3d4-e5f6-7890-abcd-ef1234567890",
                    "blockCode": "F001-003",
                    "name": "Greenhouse A3",
                    "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                    "currentState": "harvesting",
                    "currentCrop": "Tomato - Roma",
                    "currentCropId": "plant-uuid",
                    "plantedDate": "2025-09-01T00:00:00Z",
                    "expectedHarvestDate": "2025-12-01T00:00:00Z",
                    "daysInCurrentCycle": 83,
                },
                "yieldAnalytics": {
                    "totalYieldKg": 425.5,
                    "predictedYieldKg": 500.0,
                    "yieldEfficiencyPercent": 85.1,
                    "yieldByQuality": {"A": 298.0, "B": 102.5, "C": 25.0},
                    "qualityDistribution": {"A": 70.0, "B": 24.1, "C": 5.9},
                    "totalHarvests": 12,
                    "avgYieldPerHarvest": 35.46,
                    "performanceCategory": "good",
                },
                "timelineAnalytics": {
                    "currentState": "harvesting",
                    "currentStateDuration": 10,
                    "cycleDuration": 83,
                    "expectedCycleDuration": 90,
                    "onTimeTransitions": 3,
                    "lateTransitions": 1,
                    "avgOffsetDays": 2.5,
                },
                "taskAnalytics": {
                    "totalTasks": 25,
                    "completedTasks": 22,
                    "pendingTasks": 3,
                    "completionRate": 88.0,
                    "avgCompletionDelay": 1.2,
                },
                "performanceMetrics": {
                    "yieldEfficiencyPercent": 85.1,
                    "performanceCategory": "good",
                    "performanceIcon": "✅",
                    "avgDelayDays": 2.5,
                    "onTimeRate": 75.0,
                    "taskCompletionRate": 88.0,
                    "overallScore": 82.0,
                    "trend": "stable",
                    "strengths": [
                        "Good task completion rate",
                        "Quality distribution excellent",
                    ],
                    "improvements": [
                        "Monitor timeline adherence",
                        "Improve on-time transitions",
                    ],
                },
            }
        }
