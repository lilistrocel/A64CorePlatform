"""
Growing Room Model

Represents a climate-controlled growing room within a facility.
Has a 12-state lifecycle with cyclic flush loops.
Equivalent of Block in the vegetable module.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import uuid4
from enum import Enum
from pydantic import BaseModel, Field


class RoomPhase(str, Enum):
    """Growing room lifecycle phases (12 states)"""
    EMPTY = "empty"
    PREPARING = "preparing"
    INOCULATED = "inoculated"
    COLONIZING = "colonizing"
    FRUITING_INITIATION = "fruiting_initiation"
    FRUITING = "fruiting"
    HARVESTING = "harvesting"
    RESTING = "resting"
    CLEANING = "cleaning"
    QUARANTINED = "quarantined"
    DECOMMISSIONED = "decommissioned"
    MAINTENANCE = "maintenance"


# Valid phase transitions
VALID_TRANSITIONS: Dict[RoomPhase, List[RoomPhase]] = {
    RoomPhase.EMPTY: [RoomPhase.PREPARING, RoomPhase.MAINTENANCE, RoomPhase.DECOMMISSIONED],
    RoomPhase.PREPARING: [RoomPhase.INOCULATED, RoomPhase.QUARANTINED, RoomPhase.EMPTY],
    RoomPhase.INOCULATED: [RoomPhase.COLONIZING, RoomPhase.QUARANTINED],
    RoomPhase.COLONIZING: [RoomPhase.FRUITING_INITIATION, RoomPhase.QUARANTINED],
    RoomPhase.FRUITING_INITIATION: [RoomPhase.FRUITING, RoomPhase.QUARANTINED],
    RoomPhase.FRUITING: [RoomPhase.HARVESTING, RoomPhase.QUARANTINED],
    RoomPhase.HARVESTING: [RoomPhase.RESTING, RoomPhase.QUARANTINED],
    RoomPhase.RESTING: [RoomPhase.FRUITING_INITIATION, RoomPhase.CLEANING, RoomPhase.QUARANTINED],
    RoomPhase.CLEANING: [RoomPhase.EMPTY, RoomPhase.QUARANTINED],
    RoomPhase.QUARANTINED: [RoomPhase.CLEANING, RoomPhase.DECOMMISSIONED],
    RoomPhase.MAINTENANCE: [RoomPhase.EMPTY, RoomPhase.DECOMMISSIONED],
    RoomPhase.DECOMMISSIONED: [],
}


class ClimateSettings(BaseModel):
    """Climate control settings for a specific phase"""
    tempMin: Optional[float] = Field(None, description="Min temperature (Celsius)")
    tempMax: Optional[float] = Field(None, description="Max temperature (Celsius)")
    humidityMin: Optional[float] = Field(None, ge=0, le=100, description="Min humidity %")
    humidityMax: Optional[float] = Field(None, ge=0, le=100, description="Max humidity %")
    co2Max: Optional[int] = Field(None, description="Max CO2 level (ppm)")
    lightLevel: Optional[str] = Field(None, description="Light level: none, low, medium, high")
    freshAirExchanges: Optional[int] = Field(None, description="Fresh air exchanges per hour")


class PhaseHistoryEntry(BaseModel):
    """Record of a phase transition"""
    fromPhase: RoomPhase
    toPhase: RoomPhase
    changedAt: datetime = Field(default_factory=datetime.utcnow)
    changedBy: Optional[str] = None
    notes: Optional[str] = None


class FlushInfo(BaseModel):
    """Track flush cycle information"""
    currentFlush: int = Field(1, ge=1, description="Current flush number")
    totalFlushes: int = Field(0, ge=0, description="Total completed flushes")
    maxFlushes: int = Field(4, ge=1, description="Max flushes before substrate is spent")


class GrowingRoomBase(BaseModel):
    """Base growing room fields — mirrors CreateRoomPayload from the frontend"""
    roomCode: str = Field(..., min_length=1, max_length=20, description="Room identifier code")
    name: Optional[str] = Field(None, max_length=200, description="Room display name")
    area: Optional[float] = Field(None, gt=0, description="Room area in sq meters")
    capacity: Optional[int] = Field(None, gt=0, description="Capacity in substrate bags/blocks")
    notes: Optional[str] = Field(None, max_length=500, description="Free-text notes")


class GrowingRoomCreate(GrowingRoomBase):
    """
    Schema for creating a new growing room.

    ``notes`` is inherited from GrowingRoomBase.
    ``climateSettings`` is intentionally omitted — the frontend does not send
    it during creation.  It can be set later via the update endpoint.
    """
    strainId: Optional[str] = Field(None, description="Mushroom strain ID")
    substrateBatchId: Optional[str] = Field(None, description="Substrate batch ID")


class GrowingRoomUpdate(BaseModel):
    """Schema for updating a growing room"""
    roomCode: Optional[str] = Field(None, min_length=1, max_length=20)
    name: Optional[str] = Field(None, max_length=200)
    area: Optional[float] = Field(None, gt=0)
    capacity: Optional[int] = Field(None, gt=0)
    strainId: Optional[str] = None
    substrateBatchId: Optional[str] = None
    climateSettings: Optional[Dict[str, ClimateSettings]] = None
    substrateWeight: Optional[float] = Field(None, gt=0)


class PhaseTransitionRequest(BaseModel):
    """Request to advance the room lifecycle phase"""
    targetPhase: RoomPhase = Field(..., description="Phase to transition to")
    notes: Optional[str] = Field(None, max_length=500, description="Transition notes")


class GrowingRoom(GrowingRoomBase):
    """
    Complete growing room document model — mirrors the GrowingRoom interface on the frontend.

    The field is named ``id`` to match the frontend. The service layer renames
    id <-> roomId when reading/writing MongoDB.
    """

    id: str = Field(default_factory=lambda: str(uuid4()), description="Unique room ID")
    facilityId: str = Field(..., description="Parent facility ID")

    # Strain and substrate
    strainId: Optional[str] = Field(None, description="Current mushroom strain ID")
    substrateBatchId: Optional[str] = Field(None, description="Current substrate batch ID")
    substrateWeight: Optional[float] = Field(None, gt=0, description="Substrate weight in kg")

    # Lifecycle
    currentPhase: RoomPhase = Field(RoomPhase.EMPTY, description="Current lifecycle phase")
    flushInfo: FlushInfo = Field(default_factory=FlushInfo)
    phaseHistory: List[PhaseHistoryEntry] = Field(default_factory=list)

    # Climate
    climateSettings: Dict[str, ClimateSettings] = Field(
        default_factory=dict, description="Phase-specific climate settings"
    )

    # Performance
    biologicalEfficiency: Optional[float] = Field(
        None, ge=0, description="Biological efficiency % (harvest weight / substrate weight * 100)"
    )
    totalYieldKg: float = Field(0, ge=0, description="Total yield in kg across all flushes")

    # Multi-industry scoping
    divisionId: Optional[str] = Field(None, description="Division scope")
    organizationId: Optional[str] = Field(None, description="Organization scope")

    # Timestamps
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)
