"""
Farm Model

Represents a physical farm location.
"""

from datetime import datetime
from typing import Optional, List, Literal
from uuid import UUID, uuid4
from pydantic import BaseModel, Field


class FarmLocation(BaseModel):
    """Geographic location of a farm"""
    latitude: Optional[float] = Field(None, ge=-90, le=90, description="Latitude")
    longitude: Optional[float] = Field(None, ge=-180, le=180, description="Longitude")
    address: Optional[str] = Field(None, description="Physical address")


class GeoJSONPolygon(BaseModel):
    """GeoJSON Polygon format for geo-fencing boundaries"""
    type: Literal["Polygon"] = Field("Polygon", description="GeoJSON type")
    coordinates: List[List[List[float]]] = Field(
        ...,
        description="Array of linear rings. First ring is exterior, rest are holes. Each ring is array of [lng, lat] positions"
    )


class FarmBoundary(BaseModel):
    """Farm boundary with metadata for geo-fencing"""
    geometry: GeoJSONPolygon = Field(..., description="GeoJSON polygon geometry")
    area: Optional[float] = Field(None, ge=0, description="Calculated area in square meters")
    center: Optional[FarmLocation] = Field(None, description="Centroid of the polygon")


class FarmBase(BaseModel):
    """Base farm fields"""
    name: str = Field(..., min_length=1, max_length=200, description="Farm name")
    description: Optional[str] = Field(None, description="Farm description")
    owner: Optional[str] = Field(None, max_length=200, description="Farm owner name")
    location: Optional[FarmLocation] = Field(None, description="Geographic location")
    totalArea: Optional[float] = Field(None, gt=0, description="Total farm area")
    areaUnit: str = Field("hectares", description="Area unit (hectares, acres)")
    numberOfStaff: Optional[int] = Field(None, ge=0, description="Number of staff members")
    boundary: Optional[FarmBoundary] = Field(None, description="Geo-fence polygon boundary for map visualization")


class FarmCreate(FarmBase):
    """Schema for creating a new farm"""
    pass


class FarmUpdate(BaseModel):
    """Schema for updating a farm"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    owner: Optional[str] = Field(None, max_length=200)
    location: Optional[FarmLocation] = None
    totalArea: Optional[float] = Field(None, gt=0)
    areaUnit: Optional[str] = None
    numberOfStaff: Optional[int] = Field(None, ge=0)
    isActive: Optional[bool] = None
    boundary: Optional[FarmBoundary] = Field(None, description="Geo-fence polygon boundary")


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
                "owner": "John Smith",
                "location": {
                    "latitude": 40.7128,
                    "longitude": -74.0060,
                    "address": "123 Farm Road, Valley City"
                },
                "totalArea": 50.5,
                "areaUnit": "hectares",
                "numberOfStaff": 12,
                "managerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "managerEmail": "manager@example.com",
                "isActive": True,
                "boundary": {
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[
                            [-74.0065, 40.7125],
                            [-74.0055, 40.7125],
                            [-74.0055, 40.7135],
                            [-74.0065, 40.7135],
                            [-74.0065, 40.7125]
                        ]]
                    },
                    "area": 50500,
                    "center": {"latitude": 40.713, "longitude": -74.006}
                },
                "createdAt": "2025-01-15T10:00:00Z",
                "updatedAt": "2025-01-15T10:00:00Z"
            }
        }
