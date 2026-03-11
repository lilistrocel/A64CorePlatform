"""
Division Model

Represents a business division within an organization, scoped to a specific
industry type. All operational data is scoped to a division.
"""

from datetime import datetime
from typing import Optional, Dict, Any
from uuid import uuid4
from enum import Enum
from pydantic import BaseModel, Field


class IndustryType(str, Enum):
    """Supported industry types (extensible)"""
    VEGETABLE_FRUITS = "vegetable_fruits"
    MUSHROOM = "mushroom"


class DivisionBase(BaseModel):
    """Base division fields"""
    name: str = Field(..., min_length=1, max_length=200, description="Division name")
    divisionCode: str = Field(..., min_length=1, max_length=20, description="Short code (e.g., VEG-01)")
    industryType: IndustryType = Field(..., description="Industry type for this division")
    description: Optional[str] = Field(None, max_length=500, description="Division description")
    settings: Dict[str, Any] = Field(default_factory=dict, description="Division-specific settings")


class DivisionCreate(DivisionBase):
    """Schema for creating a new division"""
    organizationId: str = Field(..., description="Parent organization ID")


class DivisionUpdate(BaseModel):
    """Schema for updating a division"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    divisionCode: Optional[str] = Field(None, min_length=1, max_length=20)
    description: Optional[str] = Field(None, max_length=500)
    settings: Optional[Dict[str, Any]] = None
    isActive: Optional[bool] = None


class Division(DivisionBase):
    """Complete division model with all fields"""
    divisionId: str = Field(default_factory=lambda: str(uuid4()), description="Unique division identifier")
    organizationId: str = Field(..., description="Parent organization ID")
    isActive: bool = Field(True, description="Is division active")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "divisionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "organizationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "name": "Vegetable & Fruits Division",
                "divisionCode": "VEG-01",
                "industryType": "vegetable_fruits",
                "description": "Main vegetable and fruit farming operations",
                "settings": {},
                "isActive": True,
                "createdAt": "2026-01-01T00:00:00Z",
                "updatedAt": "2026-01-01T00:00:00Z"
            }
        }


class DivisionResponse(DivisionBase):
    """Division response model (public-facing)"""
    divisionId: str
    organizationId: str
    isActive: bool
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True


class DivisionSelectRequest(BaseModel):
    """Request to select/switch active division"""
    divisionId: str = Field(..., description="Division ID to select")


class DivisionSelectResponse(BaseModel):
    """Response after selecting a division"""
    divisionId: str
    divisionName: str
    industryType: IndustryType
    message: str = "Division selected successfully"
