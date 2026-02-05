"""
Route Model

Represents a route in the Logistics system.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field


class Coordinates(BaseModel):
    """GPS coordinates"""
    lat: float = Field(..., ge=-90, le=90, description="Latitude")
    lng: float = Field(..., ge=-180, le=180, description="Longitude")


class LocationInfo(BaseModel):
    """Location information"""
    name: str = Field(..., min_length=1, max_length=200, description="Location name")
    address: str = Field(..., min_length=1, max_length=500, description="Location address")
    coordinates: Optional[Coordinates] = Field(None, description="GPS coordinates")


class RouteBase(BaseModel):
    """Base route fields"""
    name: str = Field(..., min_length=1, max_length=200, description="Route name")
    origin: LocationInfo = Field(..., description="Origin location")
    destination: LocationInfo = Field(..., description="Destination location")
    distance: float = Field(..., gt=0, description="Distance in kilometers")
    estimatedDuration: float = Field(..., gt=0, description="Estimated duration in minutes")
    estimatedCost: Optional[float] = Field(None, ge=0, description="Estimated cost")
    isActive: bool = Field(True, description="Is route active")


class RouteCreate(RouteBase):
    """Schema for creating a new route"""
    pass


class RouteUpdate(BaseModel):
    """Schema for updating a route"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    origin: Optional[LocationInfo] = None
    destination: Optional[LocationInfo] = None
    distance: Optional[float] = Field(None, gt=0)
    estimatedDuration: Optional[int] = Field(None, gt=0)
    estimatedCost: Optional[float] = Field(None, ge=0)
    isActive: Optional[bool] = None


class Route(RouteBase):
    """Complete route model with all fields"""
    routeId: UUID = Field(default_factory=uuid4, description="Unique route identifier")
    routeCode: Optional[str] = Field(None, description="Human-readable route code (e.g., R001)")

    # Tracking information
    createdBy: UUID = Field(..., description="User ID who created this route")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "routeId": "e47ac10b-58cc-4372-a567-0e02b2c3d479",
                "routeCode": "R001",
                "name": "City Center to Warehouse",
                "origin": {
                    "name": "City Center",
                    "address": "123 Main St, City",
                    "coordinates": {"lat": 40.7128, "lng": -74.0060}
                },
                "destination": {
                    "name": "Main Warehouse",
                    "address": "456 Industrial Ave, City",
                    "coordinates": {"lat": 40.7580, "lng": -73.9855}
                },
                "distance": 15.5,
                "estimatedDuration": 30,
                "estimatedCost": 25.50,
                "isActive": True,
                "createdBy": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "createdAt": "2025-01-15T10:00:00Z",
                "updatedAt": "2025-01-15T10:00:00Z"
            }
        }
