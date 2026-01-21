"""
Sales Order Model

Represents a sales order in the Sales system.
"""

from datetime import datetime
from typing import Optional, List
from uuid import UUID, uuid4
from pydantic import BaseModel, Field
from enum import Enum


class SalesOrderStatus(str, Enum):
    """Sales order status enumeration"""
    DRAFT = "draft"
    CONFIRMED = "confirmed"
    PROCESSING = "processing"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class PaymentStatus(str, Enum):
    """Payment status enumeration"""
    PENDING = "pending"
    PARTIAL = "partial"
    PAID = "paid"


class OrderItem(BaseModel):
    """Order item information"""
    productId: UUID = Field(..., description="Product ID from inventory")
    productName: str = Field(..., min_length=1, max_length=200, description="Product name")
    quantity: float = Field(..., gt=0, description="Quantity ordered")
    unitPrice: float = Field(..., ge=0, description="Unit price")
    totalPrice: float = Field(..., ge=0, description="Total price for this item")


class ShippingAddress(BaseModel):
    """Shipping address information"""
    street: Optional[str] = Field(None, max_length=200, description="Street address")
    city: Optional[str] = Field(None, max_length=100, description="City")
    state: Optional[str] = Field(None, max_length=100, description="State/Province")
    country: Optional[str] = Field(None, max_length=100, description="Country")
    postalCode: Optional[str] = Field(None, max_length=20, description="Postal/ZIP code")


class SalesOrderBase(BaseModel):
    """Base sales order fields"""
    customerId: UUID = Field(..., description="Customer ID (from CRM)")
    customerName: str = Field(..., min_length=1, max_length=200, description="Customer name (denormalized)")
    status: SalesOrderStatus = Field(SalesOrderStatus.DRAFT, description="Order status")
    orderDate: datetime = Field(default_factory=datetime.utcnow, description="Order date")
    items: List[OrderItem] = Field(..., min_length=1, description="Order items")
    subtotal: float = Field(..., ge=0, description="Subtotal amount")
    tax: float = Field(0, ge=0, description="Tax amount")
    discount: float = Field(0, ge=0, description="Discount amount")
    total: float = Field(..., ge=0, description="Total amount")
    paymentStatus: PaymentStatus = Field(PaymentStatus.PENDING, description="Payment status")
    shippingAddress: Optional[ShippingAddress] = Field(None, description="Shipping address")
    notes: Optional[str] = Field(None, max_length=1000, description="Additional notes")


class SalesOrderCreate(SalesOrderBase):
    """Schema for creating a new sales order"""
    pass


class SalesOrderUpdate(BaseModel):
    """Schema for updating a sales order"""
    customerId: Optional[UUID] = None
    customerName: Optional[str] = Field(None, min_length=1, max_length=200)
    status: Optional[SalesOrderStatus] = None
    orderDate: Optional[datetime] = None
    items: Optional[List[OrderItem]] = Field(None, min_length=1)
    subtotal: Optional[float] = Field(None, ge=0)
    tax: Optional[float] = Field(None, ge=0)
    discount: Optional[float] = Field(None, ge=0)
    total: Optional[float] = Field(None, ge=0)
    paymentStatus: Optional[PaymentStatus] = None
    shippingAddress: Optional[ShippingAddress] = None
    notes: Optional[str] = Field(None, max_length=1000)


class SalesOrder(SalesOrderBase):
    """Complete sales order model with all fields"""
    orderId: UUID = Field(default_factory=uuid4, description="Unique order identifier")
    orderCode: Optional[str] = Field(None, description="Human-readable order code (e.g., SO001)")

    # Tracking information
    createdBy: UUID = Field(..., description="User ID who created this order")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "orderId": "e47ac10b-58cc-4372-a567-0e02b2c3d479",
                "orderCode": "SO001",
                "customerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "customerName": "Acme Corporation",
                "status": "confirmed",
                "orderDate": "2025-01-20T10:00:00Z",
                "items": [
                    {
                        "productId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
                        "productName": "Fresh Lettuce",
                        "quantity": 50,
                        "unitPrice": 2.50,
                        "totalPrice": 125.00
                    }
                ],
                "subtotal": 125.00,
                "tax": 12.50,
                "discount": 5.00,
                "total": 132.50,
                "paymentStatus": "pending",
                "shippingAddress": {
                    "street": "123 Main Street",
                    "city": "New York",
                    "state": "NY",
                    "country": "United States",
                    "postalCode": "10001"
                },
                "notes": "Rush order - deliver by Friday",
                "createdBy": "d4e5f6a7-b8c9-0123-def1-234567890123",
                "createdAt": "2025-01-20T10:00:00Z",
                "updatedAt": "2025-01-20T10:00:00Z"
            }
        }
