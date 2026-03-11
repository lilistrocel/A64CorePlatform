"""
Mushroom Facility Model

Represents a physical facility (indoor, greenhouse, cave, etc.) for mushroom cultivation.
Equivalent of Farm in the vegetable module.
"""

from datetime import datetime
from typing import Optional
from uuid import uuid4
from enum import Enum
from pydantic import BaseModel, Field


class FacilityType(str, Enum):
    """Type of mushroom growing facility — matches frontend FacilityType union"""
    INDOOR = "indoor"
    GREENHOUSE = "greenhouse"
    OUTDOOR = "outdoor"
    HYBRID = "hybrid"
    CONTAINER = "container"
    CAVE = "cave"


class FacilityStatus(str, Enum):
    """Facility operational status — matches frontend FacilityStatus union"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    MAINTENANCE = "maintenance"
    CONSTRUCTION = "construction"


class FacilityLocation(BaseModel):
    """
    Geographic location of a facility (reserved for future use).

    Not used in the current API surface — location is stored as a plain string
    in FacilityBase.  Kept here so existing data that contains structured
    location objects can still be decoded without crashing.
    """
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None


class FacilityBase(BaseModel):
    """Base facility fields — mirrors CreateFacilityPayload from the frontend"""
    name: str = Field(..., min_length=1, max_length=200, description="Facility name")
    location: Optional[str] = Field(None, max_length=500, description="Location text (e.g. 'Building B, Zone 3')")
    facilityType: FacilityType = Field(FacilityType.INDOOR, description="Type of facility")
    status: Optional[FacilityStatus] = Field(None, description="Operational status")
    description: Optional[str] = Field(None, max_length=500)


class FacilityCreate(FacilityBase):
    """Schema for creating a new facility"""
    pass


class FacilityUpdate(BaseModel):
    """Schema for partially updating a facility"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    facilityType: Optional[FacilityType] = None
    location: Optional[str] = Field(None, max_length=500)
    status: Optional[FacilityStatus] = None
    managerId: Optional[str] = None


class Facility(FacilityBase):
    """
    Complete facility document model — mirrors the Facility interface on the frontend.

    The field is named ``id`` to match the frontend. The service layer renames
    id <-> facilityId when reading/writing MongoDB.
    """

    id: str = Field(default_factory=lambda: str(uuid4()), description="Unique facility ID")
    # Override: status is required on the document (defaults to ACTIVE)
    status: FacilityStatus = Field(FacilityStatus.ACTIVE)

    totalRooms: int = Field(0, ge=0, description="Total number of growing rooms")
    activeRooms: int = Field(0, ge=0, description="Number of currently active rooms")

    # Manager fields are populated from the authenticated user but are not
    # required in the payload — the service sets them from current_user.
    managerId: Optional[str] = Field(None, description="User ID of facility manager")
    managerEmail: Optional[str] = Field(None, description="Email of facility manager")

    # Multi-industry scoping
    divisionId: Optional[str] = Field(None, description="Division scope")
    organizationId: Optional[str] = Field(None, description="Organization scope")

    # Timestamps
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)
