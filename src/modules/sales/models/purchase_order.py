"""
Purchase Order Model

Represents a purchase order in the Sales system.
"""

from datetime import datetime, date
from typing import Optional, List
from uuid import UUID, uuid4
from pydantic import BaseModel, Field
from enum import Enum


class PurchaseOrderStatus(str, Enum):
    """Purchase order status enumeration"""
    DRAFT = "draft"
    SENT = "sent"
    CONFIRMED = "confirmed"
    RECEIVED = "received"
    CANCELLED = "cancelled"


class PurchaseOrderItem(BaseModel):
    """Purchase order item information"""
    description: str = Field(..., min_length=1, max_length=500, description="Item description")
    quantity: float = Field(..., gt=0, description="Quantity ordered")
    unitPrice: float = Field(..., ge=0, description="Unit price")
    totalPrice: float = Field(..., ge=0, description="Total price for this item")


class PurchaseOrderBase(BaseModel):
    """Base purchase order fields"""
    supplierId: UUID = Field(..., description="Supplier ID")
    supplierName: str = Field(..., min_length=1, max_length=200, description="Supplier name (denormalized)")
    status: PurchaseOrderStatus = Field(PurchaseOrderStatus.DRAFT, description="Purchase order status")
    orderDate: datetime = Field(default_factory=datetime.utcnow, description="Order date")
    expectedDeliveryDate: Optional[date] = Field(None, description="Expected delivery date")
    items: List[PurchaseOrderItem] = Field(..., min_length=1, description="Purchase order items")
    total: float = Field(..., ge=0, description="Total amount")
    paymentTerms: Optional[str] = Field(None, max_length=500, description="Payment terms")
    notes: Optional[str] = Field(None, max_length=1000, description="Additional notes")


class PurchaseOrderCreate(PurchaseOrderBase):
    """Schema for creating a new purchase order"""
    pass


class PurchaseOrderUpdate(BaseModel):
    """Schema for updating a purchase order"""
    supplierId: Optional[UUID] = None
    supplierName: Optional[str] = Field(None, min_length=1, max_length=200)
    status: Optional[PurchaseOrderStatus] = None
    orderDate: Optional[datetime] = None
    expectedDeliveryDate: Optional[date] = None
    items: Optional[List[PurchaseOrderItem]] = Field(None, min_length=1)
    total: Optional[float] = Field(None, ge=0)
    paymentTerms: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=1000)


class PurchaseOrder(PurchaseOrderBase):
    """Complete purchase order model with all fields"""
    purchaseOrderId: UUID = Field(default_factory=uuid4, description="Unique purchase order identifier")
    poCode: Optional[str] = Field(None, description="Human-readable PO code (e.g., PO001)")

    # Tracking information
    createdBy: UUID = Field(..., description="User ID who created this purchase order")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "purchaseOrderId": "e47ac10b-58cc-4372-a567-0e02b2c3d479",
                "poCode": "PO001",
                "supplierId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "supplierName": "Farming Supplies Inc.",
                "status": "sent",
                "orderDate": "2025-01-20T10:00:00Z",
                "expectedDeliveryDate": "2025-01-27",
                "items": [
                    {
                        "description": "Organic Fertilizer - 50kg bags",
                        "quantity": 20,
                        "unitPrice": 35.00,
                        "totalPrice": 700.00
                    },
                    {
                        "description": "Irrigation Pipes - 100m",
                        "quantity": 5,
                        "unitPrice": 120.00,
                        "totalPrice": 600.00
                    }
                ],
                "total": 1300.00,
                "paymentTerms": "Net 30 days",
                "notes": "Please deliver to main warehouse",
                "createdBy": "d4e5f6a7-b8c9-0123-def1-234567890123",
                "createdAt": "2025-01-20T10:00:00Z",
                "updatedAt": "2025-01-20T10:00:00Z"
            }
        }
