"""
AI Dashboard Models

Pydantic models for the automated farm inspection system.
These models represent the data structures used throughout the AI Dashboard
service: raw collected data, AI-generated summaries, and stored reports.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
import uuid


# ---------------------------------------------------------------------------
# Raw Data Collection Models
# ---------------------------------------------------------------------------


class FarmCensusResult(BaseModel):
    """
    Result of the farm census task.

    Summarises how many farms and blocks exist and their utilisation.
    """

    totalFarms: int
    totalBlocks: int
    blocksByState: Dict[str, int]
    utilization: float  # Ratio of active blocks to total blocks (0.0-1.0)


class YieldFarmEntry(BaseModel):
    """
    Yield data for a single farm in the yield assessment.
    """

    farmId: str
    farmName: str
    predictedYieldKg: float
    actualYieldKg: float
    efficiency: float  # Percentage (0-100+)


class YieldAssessmentResult(BaseModel):
    """
    Result of the yield assessment task across all farms.
    """

    farms: List[YieldFarmEntry]
    globalPredicted: float
    globalActual: float
    globalEfficiency: float  # Percentage (0-100+)


class GrowthTimelineResult(BaseModel):
    """
    Result of the growth timeline analysis task.

    Classifies blocks in active growing states as ahead, behind, or on-time.
    """

    blocksAhead: int
    blocksBehind: int
    blocksOnTime: int
    details: List[Dict[str, Any]]


class SenseHubAlertEntry(BaseModel):
    """
    Alert data for a single block from SenseHub.
    """

    blockId: str
    blockName: str
    farmName: str
    alerts: List[Dict[str, Any]]


class SenseHubAlertResult(BaseModel):
    """
    Result of the SenseHub alert scan across all IoT-connected blocks.
    """

    blocksScanned: int
    blocksWithAlerts: int
    totalAlerts: int
    criticalCount: int
    entries: List[SenseHubAlertEntry]


class EquipmentBlockEntry(BaseModel):
    """
    Equipment health data for a single block.
    """

    blockId: str
    blockName: str
    farmName: str
    onlineCount: int
    offlineCount: int
    equipment: List[Dict[str, Any]]


class EquipmentHealthResult(BaseModel):
    """
    Result of the equipment health check across all IoT-connected blocks.
    """

    blocksScanned: int
    totalOnline: int
    totalOffline: int
    entries: List[EquipmentBlockEntry]


class AutomationBlockEntry(BaseModel):
    """
    Automation audit data for a single block.
    """

    blockId: str
    blockName: str
    farmName: str
    enabledCount: int
    disabledCount: int
    automations: List[Dict[str, Any]]


class AutomationAuditResult(BaseModel):
    """
    Result of the automation audit across all IoT-connected blocks.
    """

    blocksScanned: int
    totalEnabled: int
    totalDisabled: int
    entries: List[AutomationBlockEntry]


class HarvestProgressResult(BaseModel):
    """
    Result of the harvest progress task (last 7 days).
    """

    totalHarvests7Days: int
    totalKg7Days: float
    gradeDistribution: Dict[str, int]  # e.g. {"A": 5, "B": 3, "C": 1}
    recentHarvests: List[Dict[str, Any]]


class PlatformAlertResult(BaseModel):
    """
    Result of the platform-level alert aggregation task.
    """

    activeCount: int
    bySeverity: Dict[str, int]  # e.g. {"critical": 2, "high": 5}
    topAlerts: List[Dict[str, Any]]


class InspectionRawData(BaseModel):
    """
    Container for all raw inspection task results.

    Each field is Optional because individual tasks may fail without
    preventing the overall inspection from completing.
    """

    farmCensus: Optional[FarmCensusResult] = None
    yieldAssessment: Optional[YieldAssessmentResult] = None
    growthTimeline: Optional[GrowthTimelineResult] = None
    senseHubAlerts: Optional[SenseHubAlertResult] = None
    equipmentHealth: Optional[EquipmentHealthResult] = None
    automationAudit: Optional[AutomationAuditResult] = None
    harvestProgress: Optional[HarvestProgressResult] = None
    platformAlerts: Optional[PlatformAlertResult] = None


# ---------------------------------------------------------------------------
# AI-Generated Summary Models
# ---------------------------------------------------------------------------


class FarmStatusCard(BaseModel):
    """
    High-level health card for a single farm, produced by AI analysis.
    """

    farmName: str
    farmId: str
    health: str  # e.g. "excellent", "good", "fair", "poor", "critical"
    yieldEfficiency: float
    topIssues: List[str]


class InspectionVerdict(BaseModel):
    """
    AI verdict for a single inspection task category.
    """

    taskName: str
    verdict: str  # "pass", "warning", or "fail"
    summary: str


class Recommendation(BaseModel):
    """
    A single actionable recommendation produced by AI analysis.
    """

    priority: str  # "high", "medium", or "low"
    category: str
    message: str
    affectedFarms: List[str]


class AISummary(BaseModel):
    """
    Complete AI-generated analysis and recommendations for an inspection run.
    """

    executiveSummary: str
    overallHealthRating: str  # "excellent", "good", "fair", "poor", "critical"
    farmStatusCards: List[FarmStatusCard]
    inspectionResults: List[InspectionVerdict]
    recommendations: List[Recommendation]


# ---------------------------------------------------------------------------
# Top-Level Report Model
# ---------------------------------------------------------------------------


class DashboardReport(BaseModel):
    """
    A complete AI Dashboard inspection report stored in MongoDB.

    Tracks the full lifecycle from collection through AI generation.
    """

    reportId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: str  # "collecting", "generating", "completed", "generation_failed", "failed"
    triggeredBy: str  # "scheduler", "scheduler_startup", or "manual"
    startedAt: datetime = Field(default_factory=datetime.utcnow)
    completedAt: Optional[datetime] = None
    durationSeconds: Optional[float] = None
    rawData: Optional[InspectionRawData] = None
    aiSummary: Optional[AISummary] = None
    error: Optional[str] = None
