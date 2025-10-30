"""
Block Cycle Model

Complete cycle history for a block - one planting-to-harvest sequence.
This is the CRITICAL model for historical analytics and AI training.
"""

from datetime import datetime
from typing import List, Optional, Dict
from uuid import UUID, uuid4
from pydantic import BaseModel, Field

from .planting import PlantingItem
from .alert import AlertSeverity


class BlockCycleAlert(BaseModel):
    """Alert summary for cycle history"""
    alertId: UUID
    title: str
    severity: AlertSeverity
    triggeredAt: datetime
    resolvedAt: Optional[datetime]
    resolutionNotes: Optional[str]


class BlockCycleDailyHarvest(BaseModel):
    """Daily harvest summary for cycle history"""
    date: datetime
    totalQuantity: float
    entries: List[Dict]  # Simplified plant-wise breakdown


class BlockCycle(BaseModel):
    """Complete cycle history for a block"""
    cycleId: UUID = Field(default_factory=uuid4, description="Unique cycle identifier")
    blockId: UUID = Field(..., description="Block ID")
    farmId: UUID = Field(..., description="Farm ID")
    cycleNumber: int = Field(..., gt=0, description="Cycle number for this block (1, 2, 3, ...)")

    # Planting information (frozen snapshot)
    plantingId: UUID = Field(..., description="Reference to planting")
    plants: List[PlantingItem] = Field(..., description="What was planted (frozen)")
    totalPlants: int = Field(..., description="Total number of plants")

    # Planning
    plannedBy: UUID
    plannedByEmail: str
    plannedAt: datetime

    # Execution
    plantedBy: UUID
    plantedByEmail: str
    plantedAt: datetime

    # Timeline
    estimatedHarvestStartDate: datetime = Field(..., description="When harvest was expected to start")
    actualHarvestStartDate: Optional[datetime] = Field(None, description="When harvest actually started")
    actualHarvestEndDate: Optional[datetime] = Field(None, description="When harvest ended")
    cycleDurationDays: Optional[int] = Field(None, description="Total days from planting to final harvest")

    # Harvest performance
    predictedYield: float = Field(..., description="Predicted total yield")
    actualYield: float = Field(0.0, description="Actual total yield")
    yieldUnit: str
    yieldEfficiency: float = Field(0.0, description="Actual/Predicted ratio (percentage)")

    dailyHarvests: List[BlockCycleDailyHarvest] = Field(default_factory=list, description="Day-by-day harvest records")
    totalHarvestDays: int = Field(0, description="Number of days harvesting occurred")

    # Alerts during cycle
    alerts: List[BlockCycleAlert] = Field(default_factory=list, description="All alerts during this cycle")
    totalAlerts: int = Field(0, description="Number of alerts")
    criticalAlerts: int = Field(0, description="Number of critical alerts")

    # Performance metrics
    harvestDelayDays: int = Field(0, description="Days delayed past estimated start (0 = on time, negative = early)")
    qualityIssues: int = Field(0, description="Number of quality-related alerts")

    # Environmental data (future)
    avgTemperature: Optional[float] = Field(None, description="Average temperature during cycle")
    totalRainfall: Optional[float] = Field(None, description="Total rainfall during cycle")

    # Cycle status
    status: str = Field("active", description="Status: active, completed")
    completedBy: Optional[UUID] = Field(None, description="Manager who completed cycle")
    completedByEmail: Optional[str] = Field(None, description="Email of completer")

    # Timestamps
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)
    completedAt: Optional[datetime] = Field(None, description="When cycle was completed")

    class Config:
        json_schema_extra = {
            "example": {
                "cycleId": "c1234567-89ab-cdef-0123-456789abcdef",
                "blockId": "b1234567-89ab-cdef-0123-456789abcdef",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "cycleNumber": 3,
                "plantingId": "p1234567-89ab-cdef-0123-456789abcdef",
                "plants": [
                    {
                        "plantDataId": "d123...",
                        "plantName": "Tomato",
                        "quantity": 50,
                        "plantDataSnapshot": {"expectedYieldPerPlant": 5.0}
                    }
                ],
                "totalPlants": 50,
                "plannedBy": "manager-uuid",
                "plannedByEmail": "manager@example.com",
                "plannedAt": "2025-01-10T10:00:00Z",
                "plantedBy": "farmer-uuid",
                "plantedByEmail": "farmer@example.com",
                "plantedAt": "2025-01-15T08:00:00Z",
                "estimatedHarvestStartDate": "2025-04-15T00:00:00Z",
                "actualHarvestStartDate": "2025-04-17T00:00:00Z",
                "actualHarvestEndDate": "2025-04-22T00:00:00Z",
                "cycleDurationDays": 97,
                "predictedYield": 250.0,
                "actualYield": 240.0,
                "yieldUnit": "kg",
                "yieldEfficiency": 96.0,
                "totalHarvestDays": 5,
                "harvestDelayDays": 2,
                "totalAlerts": 1,
                "criticalAlerts": 0,
                "status": "completed",
                "completedAt": "2025-04-22T18:00:00Z"
            }
        }
