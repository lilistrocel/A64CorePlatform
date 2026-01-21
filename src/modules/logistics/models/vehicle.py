"""
Vehicle Model

Represents a vehicle in the Logistics system.
"""

from datetime import datetime, date
from typing import Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field
from enum import Enum


class VehicleType(str, Enum):
    """Vehicle type enumeration"""
    TRUCK = "truck"
    VAN = "van"
    PICKUP = "pickup"
    REFRIGERATED = "refrigerated"


class VehicleOwnership(str, Enum):
    """Vehicle ownership enumeration"""
    OWNED = "owned"
    RENTED = "rented"
    LEASED = "leased"


class VehicleStatus(str, Enum):
    """Vehicle status enumeration"""
    AVAILABLE = "available"
    IN_USE = "in_use"
    MAINTENANCE = "maintenance"
    RETIRED = "retired"


class VehicleCapacity(BaseModel):
    """Vehicle capacity information"""
    weight: float = Field(..., gt=0, description="Weight capacity")
    volume: float = Field(..., gt=0, description="Volume capacity")
    unit: str = Field(..., description="Unit (kg/m3)")


class VehicleBase(BaseModel):
    """Base vehicle fields"""
    name: str = Field(..., min_length=1, max_length=200, description="Vehicle name")
    type: VehicleType = Field(..., description="Vehicle type")
    ownership: VehicleOwnership = Field(..., description="Vehicle ownership")
    licensePlate: str = Field(..., min_length=1, max_length=50, description="License plate number")
    capacity: VehicleCapacity = Field(..., description="Vehicle capacity")
    status: VehicleStatus = Field(VehicleStatus.AVAILABLE, description="Vehicle status")
    costPerKm: Optional[float] = Field(None, ge=0, description="Cost per kilometer")
    rentalCostPerDay: Optional[float] = Field(None, ge=0, description="Rental cost per day")
    purchaseDate: Optional[date] = Field(None, description="Purchase date")
    purchaseCost: Optional[float] = Field(None, ge=0, description="Purchase cost")
    maintenanceSchedule: Optional[date] = Field(None, description="Next maintenance date")


class VehicleCreate(VehicleBase):
    """Schema for creating a new vehicle"""
    pass


class VehicleUpdate(BaseModel):
    """Schema for updating a vehicle"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    type: Optional[VehicleType] = None
    ownership: Optional[VehicleOwnership] = None
    licensePlate: Optional[str] = Field(None, min_length=1, max_length=50)
    capacity: Optional[VehicleCapacity] = None
    status: Optional[VehicleStatus] = None
    costPerKm: Optional[float] = Field(None, ge=0)
    rentalCostPerDay: Optional[float] = Field(None, ge=0)
    purchaseDate: Optional[date] = None
    purchaseCost: Optional[float] = Field(None, ge=0)
    maintenanceSchedule: Optional[date] = None


class Vehicle(VehicleBase):
    """Complete vehicle model with all fields"""
    vehicleId: UUID = Field(default_factory=uuid4, description="Unique vehicle identifier")
    vehicleCode: Optional[str] = Field(None, description="Human-readable vehicle code (e.g., V001)")

    # Tracking information
    createdBy: UUID = Field(..., description="User ID who created this vehicle")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "vehicleId": "e47ac10b-58cc-4372-a567-0e02b2c3d479",
                "vehicleCode": "V001",
                "name": "Delivery Truck 1",
                "type": "truck",
                "ownership": "owned",
                "licensePlate": "ABC-1234",
                "capacity": {
                    "weight": 5000,
                    "volume": 30,
                    "unit": "kg/m3"
                },
                "status": "available",
                "costPerKm": 2.5,
                "rentalCostPerDay": 0,
                "purchaseDate": "2024-01-15",
                "purchaseCost": 50000,
                "maintenanceSchedule": "2025-06-15",
                "createdBy": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "createdAt": "2025-01-15T10:00:00Z",
                "updatedAt": "2025-01-15T10:00:00Z"
            }
        }
