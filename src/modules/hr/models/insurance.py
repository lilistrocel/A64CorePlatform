"""
Insurance Model

Represents an employee insurance policy in the HR system.
"""

from datetime import datetime, date
from typing import Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field
from enum import Enum


class InsuranceType(str, Enum):
    """Insurance type enumeration"""
    HEALTH = "health"
    LIFE = "life"
    DENTAL = "dental"
    VISION = "vision"


class InsuranceBase(BaseModel):
    """Base insurance fields"""
    employeeId: UUID = Field(..., description="Employee ID this insurance belongs to")
    provider: str = Field(..., min_length=1, max_length=200, description="Insurance provider name")
    policyNumber: str = Field(..., min_length=1, max_length=100, description="Policy number")
    type: InsuranceType = Field(..., description="Type of insurance")
    coverage: float = Field(..., gt=0, description="Coverage amount")
    startDate: date = Field(..., description="Policy start date")
    endDate: date = Field(..., description="Policy end date")
    monthlyCost: float = Field(..., ge=0, description="Monthly premium cost")


class InsuranceCreate(InsuranceBase):
    """Schema for creating a new insurance policy"""
    pass


class InsuranceUpdate(BaseModel):
    """Schema for updating an insurance policy"""
    provider: Optional[str] = Field(None, min_length=1, max_length=200)
    policyNumber: Optional[str] = Field(None, min_length=1, max_length=100)
    type: Optional[InsuranceType] = None
    coverage: Optional[float] = Field(None, gt=0)
    startDate: Optional[date] = None
    endDate: Optional[date] = None
    monthlyCost: Optional[float] = Field(None, ge=0)


class Insurance(InsuranceBase):
    """Complete insurance model with all fields"""
    insuranceId: UUID = Field(default_factory=uuid4, description="Unique insurance identifier")

    # Tracking information
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "insuranceId": "i47ac10b-58cc-4372-a567-0e02b2c3d479",
                "employeeId": "e47ac10b-58cc-4372-a567-0e02b2c3d479",
                "provider": "Blue Cross Blue Shield",
                "policyNumber": "BCBS-12345678",
                "type": "health",
                "coverage": 500000.00,
                "startDate": "2024-01-01",
                "endDate": "2024-12-31",
                "monthlyCost": 350.00,
                "createdAt": "2025-01-15T10:00:00Z",
                "updatedAt": "2025-01-15T10:00:00Z"
            }
        }
