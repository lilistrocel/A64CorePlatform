"""
Room Environment Log Model

Tracks climate readings (temperature, humidity, CO2) for growing rooms.
"""

from datetime import datetime
from typing import Optional
from uuid import uuid4
from pydantic import BaseModel, Field


class EnvironmentReading(BaseModel):
    """A single environment reading"""
    temperature: Optional[float] = Field(None, description="Temperature in Celsius")
    humidity: Optional[float] = Field(None, ge=0, le=100, description="Relative humidity %")
    co2Level: Optional[int] = Field(None, ge=0, description="CO2 level in ppm")
    lightLevel: Optional[float] = Field(None, ge=0, description="Light level in lux")
    freshAirFlow: Optional[float] = Field(None, ge=0, description="Fresh air flow rate")


class EnvironmentLogCreate(EnvironmentReading):
    """Schema for creating an environment log entry"""
    notes: Optional[str] = Field(None, max_length=500)


class EnvironmentLog(EnvironmentReading):
    """Complete environment log model"""
    logId: str = Field(default_factory=lambda: str(uuid4()), description="Unique log ID")
    roomId: str = Field(..., description="Growing room ID")
    facilityId: Optional[str] = Field(None, description="Facility ID (denormalized)")

    # Context
    currentPhase: Optional[str] = Field(None, description="Room phase at time of reading")
    notes: Optional[str] = Field(None, max_length=500)
    recordedBy: Optional[str] = Field(None, description="User ID or sensor ID")

    # Alert flags
    isOutOfRange: bool = Field(False, description="Whether any reading is outside target range")

    # Multi-industry scoping
    divisionId: Optional[str] = Field(None, description="Division scope")
    organizationId: Optional[str] = Field(None, description="Organization scope")

    # Timestamps
    recordedAt: datetime = Field(default_factory=datetime.utcnow)
    createdAt: datetime = Field(default_factory=datetime.utcnow)
