"""
Dashboard Models

Data models for farm dashboard API responses.
"""

from datetime import datetime
from typing import List, Optional, Dict, Literal
from uuid import UUID
from pydantic import BaseModel, Field

from .block import Block, BlockStatus, PerformanceCategory, StatusChange


# ============================================================================
# CALCULATED METRICS
# ============================================================================

class BlockCalculated(BaseModel):
    """Calculated fields for dashboard display"""

    # Timeliness tracking
    daysInCurrentState: int = Field(..., description="Days spent in current state")
    expectedStateChangeDate: Optional[datetime] = Field(None, description="Expected date for next transition")
    daysUntilNextTransition: Optional[int] = Field(None, description="Days until expected next state change")
    isDelayed: bool = Field(False, description="Whether block is behind schedule")
    delayDays: int = Field(0, description="Offset from schedule (negative = early, positive = late)")

    # Capacity
    capacityPercent: float = Field(0.0, description="Plant capacity utilization percentage")

    # Yield performance (for harvesting state)
    yieldProgress: float = Field(0.0, description="Actual/predicted yield percentage")
    yieldStatus: Literal["on_track", "ahead", "behind"] = Field("on_track", description="Yield status")
    estimatedFinalYield: float = Field(0.0, description="Estimated final yield based on current rate")
    performanceCategory: PerformanceCategory = Field(PerformanceCategory.GOOD, description="Performance categorization")

    # Next action
    nextAction: str = Field("view_details", description="Recommended next action")
    nextActionDate: Optional[datetime] = Field(None, description="Date for next action")


# ============================================================================
# ALERT
# ============================================================================

class DashboardAlert(BaseModel):
    """Simplified alert for dashboard"""
    alertId: UUID
    severity: Literal["critical", "high", "medium", "low"]
    title: str
    createdAt: datetime


# ============================================================================
# DASHBOARD BLOCK
# ============================================================================

class DashboardBlock(BaseModel):
    """Enhanced block with calculated metrics for dashboard"""

    # Core block data (from Block model)
    blockId: UUID
    blockCode: str
    name: Optional[str]
    state: BlockStatus
    blockType: Optional[str]

    # Planting info
    targetCrop: Optional[UUID]
    targetCropName: Optional[str]
    actualPlantCount: Optional[int]
    maxPlants: int

    # Dates
    plantedDate: Optional[datetime]
    expectedHarvestDate: Optional[datetime]
    expectedStatusChanges: Optional[Dict[str, datetime]]

    # Status History (actual state change dates)
    statusChanges: List[StatusChange] = Field(default_factory=list, description="Status change history with actual dates")

    # KPI
    kpi: Dict[str, float | int]  # predictedYieldKg, actualYieldKg, yieldEfficiencyPercent, totalHarvests

    # Calculated metrics
    calculated: BlockCalculated

    # Active alerts
    activeAlerts: List[DashboardAlert] = Field(default_factory=list)


# ============================================================================
# FARM SUMMARY
# ============================================================================

class FarmInfo(BaseModel):
    """Farm metadata"""
    farmId: UUID
    name: str
    code: str
    totalArea: Optional[float]
    areaUnit: str = "hectares"
    managerName: Optional[str]
    managerEmail: Optional[str]


class DashboardSummary(BaseModel):
    """Aggregated farm statistics"""
    totalBlocks: int = 0
    blocksByState: Dict[str, int] = Field(default_factory=dict)  # {empty: 4, planned: 2, ...}
    totalActivePlantings: int = 0
    totalPredictedYieldKg: float = 0.0
    totalActualYieldKg: float = 0.0
    avgYieldEfficiency: float = 0.0
    activeAlerts: Dict[str, int] = Field(default_factory=dict)  # {critical: 1, high: 2, ...}


# ============================================================================
# ACTIVITY & EVENTS
# ============================================================================

class DashboardActivity(BaseModel):
    """Recent activity item"""
    blockId: UUID
    blockCode: str
    action: Literal["state_change", "harvest_recorded", "alert_created", "alert_resolved"]
    details: str
    timestamp: datetime


class UpcomingEvent(BaseModel):
    """Upcoming event"""
    blockId: UUID
    blockCode: str
    eventType: Literal["expected_harvest", "expected_planting", "expected_transition", "overdue_transition"]
    eventDate: datetime
    daysUntil: int


# ============================================================================
# DASHBOARD RESPONSE
# ============================================================================

class DashboardResponse(BaseModel):
    """Complete dashboard data response"""
    farmInfo: FarmInfo
    summary: DashboardSummary
    blocks: List[DashboardBlock]
    recentActivity: List[DashboardActivity] = Field(default_factory=list)
    upcomingEvents: List[UpcomingEvent] = Field(default_factory=list)


# ============================================================================
# QUICK ACTION REQUESTS
# ============================================================================

class QuickTransitionRequest(BaseModel):
    """Quick state transition request"""
    newState: BlockStatus = Field(..., description="New state to transition to")
    notes: Optional[str] = Field(None, description="Optional notes about transition")
    targetCrop: Optional[UUID] = Field(None, description="Plant data ID (required for planned/growing)")
    actualPlantCount: Optional[int] = Field(None, ge=0, description="Number of plants (required for planned/growing)")
    force: Optional[bool] = Field(False, description="Force transition bypassing pending task warnings")


class QuickHarvestRequest(BaseModel):
    """Quick harvest recording request"""
    quantityKg: float = Field(..., gt=0, description="Harvested amount in kg")
    qualityGrade: Literal["A", "B", "C"] = Field("A", description="Quality grade")
    notes: Optional[str] = Field(None, description="Optional harvest notes")
