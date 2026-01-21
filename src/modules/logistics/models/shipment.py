"""
Shipment Model

Represents a shipment in the Logistics system.
"""

from datetime import datetime
from typing import Optional, List
from uuid import UUID, uuid4
from pydantic import BaseModel, Field
from enum import Enum


class ShipmentStatus(str, Enum):
    """Shipment status enumeration"""
    SCHEDULED = "scheduled"
    IN_TRANSIT = "in_transit"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class CargoItem(BaseModel):
    """Cargo item information"""
    description: str = Field(..., min_length=1, max_length=500, description="Cargo description")
    quantity: int = Field(..., gt=0, description="Quantity")
    weight: float = Field(..., gt=0, description="Weight per item in kg")


class ShipmentBase(BaseModel):
    """Base shipment fields"""
    routeId: UUID = Field(..., description="Route ID")
    vehicleId: UUID = Field(..., description="Vehicle ID")
    driverId: UUID = Field(..., description="Driver ID (employee ID from HR)")
    status: ShipmentStatus = Field(ShipmentStatus.SCHEDULED, description="Shipment status")
    scheduledDate: datetime = Field(..., description="Scheduled departure date")
    actualDepartureDate: Optional[datetime] = Field(None, description="Actual departure date")
    actualArrivalDate: Optional[datetime] = Field(None, description="Actual arrival date")
    cargo: List[CargoItem] = Field(..., min_length=1, description="List of cargo items")
    totalCost: Optional[float] = Field(None, ge=0, description="Total shipment cost")
    notes: Optional[str] = Field(None, max_length=1000, description="Additional notes")


class ShipmentCreate(ShipmentBase):
    """Schema for creating a new shipment"""
    pass


class ShipmentUpdate(BaseModel):
    """Schema for updating a shipment"""
    routeId: Optional[UUID] = None
    vehicleId: Optional[UUID] = None
    driverId: Optional[UUID] = None
    status: Optional[ShipmentStatus] = None
    scheduledDate: Optional[datetime] = None
    actualDepartureDate: Optional[datetime] = None
    actualArrivalDate: Optional[datetime] = None
    cargo: Optional[List[CargoItem]] = Field(None, min_length=1)
    totalCost: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = Field(None, max_length=1000)


class Shipment(ShipmentBase):
    """Complete shipment model with all fields"""
    shipmentId: UUID = Field(default_factory=uuid4, description="Unique shipment identifier")
    shipmentCode: Optional[str] = Field(None, description="Human-readable shipment code (e.g., SH001)")

    # Tracking information
    createdBy: UUID = Field(..., description="User ID who created this shipment")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "shipmentId": "e47ac10b-58cc-4372-a567-0e02b2c3d479",
                "shipmentCode": "SH001",
                "routeId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "vehicleId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
                "driverId": "c3d4e5f6-a7b8-9012-cdef-123456789012",
                "status": "scheduled",
                "scheduledDate": "2025-01-20T08:00:00Z",
                "actualDepartureDate": None,
                "actualArrivalDate": None,
                "cargo": [
                    {
                        "description": "Fresh produce",
                        "quantity": 100,
                        "weight": 25.5
                    }
                ],
                "totalCost": 150.00,
                "notes": "Handle with care - perishable goods",
                "createdBy": "d4e5f6a7-b8c9-0123-def1-234567890123",
                "createdAt": "2025-01-15T10:00:00Z",
                "updatedAt": "2025-01-15T10:00:00Z"
            }
        }
