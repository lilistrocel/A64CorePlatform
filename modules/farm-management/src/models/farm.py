"""
Farm Model

Represents a physical farm location.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field


class FarmLocation(BaseModel):
    """Geographic location of a farm"""
    latitude: Optional[float] = Field(None, ge=-90, le=90, description="Latitude")
    longitude: Optional[float] = Field(None, ge=-180, le=180, description="Longitude")
    address: Optional[str] = Field(None, description="Physical address")


class FarmBase(BaseModel):
    """Base farm fields"""
    name: str = Field(..., min_length=1, max_length=200, description="Farm name")
    description: Optional[str] = Field(None, description="Farm description")
    location: Optional[FarmLocation] = Field(None, description="Geographic location")
    totalArea: Optional[float] = Field(None, gt=0, description="Total farm area")
    areaUnit: str = Field("hectares", description="Area unit (hectares, acres)")


class FarmCreate(FarmBase):
    """Schema for creating a new farm"""
    pass


class FarmUpdate(BaseModel):
    """Schema for updating a farm"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    location: Optional[FarmLocation] = None
    totalArea: Optional[float] = Field(None, gt=0)
    areaUnit: Optional[str] = None
    isActive: Optional[bool] = None


class Farm(FarmBase):
    """Complete farm model with all fields"""
    farmId: UUID = Field(default_factory=uuid4, description="Unique farm identifier")

    # Manager information
    managerId: UUID = Field(..., description="User ID of farm manager")
    managerEmail: str = Field(..., description="Email of farm manager")

    # Status
    isActive: bool = Field(True, description="Is farm active")

    # Timestamps
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "name": "Green Valley Farm",
                "description": "Organic vegetable farm in central valley",
                "location": {
                    "latitude": 40.7128,
                    "longitude": -74.0060,
                    "address": "123 Farm Road, Valley City"
                },
                "totalArea": 50.5,
                "areaUnit": "hectares",
                "managerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "managerEmail": "manager@example.com",
                "isActive": True,
                "createdAt": "2025-01-15T10:00:00Z",
                "updatedAt": "2025-01-15T10:00:00Z"
            }
        }
