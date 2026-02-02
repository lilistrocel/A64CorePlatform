"""
Return Order Model

Represents a return order for handling product returns from sales orders.
"""

from datetime import datetime
from typing import Optional, List
from uuid import UUID, uuid4
from pydantic import BaseModel, Field
from enum import Enum


class ReturnReason(str, Enum):
    """Reason for return"""
    CUSTOMER_REJECTED = "customer_rejected"
    QUALITY_ISSUE = "quality_issue"
    WRONG_ITEM = "wrong_item"
    DAMAGED_IN_TRANSIT = "damaged_in_transit"
    EXPIRED = "expired"
    OVERSUPPLY = "oversupply"
    OTHER = "other"


class ReturnCondition(str, Enum):
    """Condition of returned item"""
    RESELLABLE = "resellable"       # Can be sold again (possibly at lower grade)
    DAMAGED = "damaged"             # Physically damaged
    SPOILED = "spoiled"             # Perishable gone bad
    CONTAMINATED = "contaminated"   # Safety concern


class ReturnStatus(str, Enum):
    """Return order status"""
    PENDING = "pending"             # Return created, awaiting processing
    PROCESSING = "processing"       # Being processed
    COMPLETED = "completed"         # Processed and inventory updated
    REJECTED = "rejected"           # Return request rejected


class ReturnItem(BaseModel):
    """Individual item in a return"""
    orderItemId: UUID = Field(default_factory=uuid4, description="Unique ID for this return item")
    originalOrderItemProductId: UUID = Field(..., description="Product ID from original order item")
    productName: str = Field(..., min_length=1, max_length=200, description="Product name")

    # Quantities
    orderedQuantity: float = Field(..., gt=0, description="Original quantity ordered")
    returnedQuantity: float = Field(..., gt=0, description="Quantity being returned")

    # Quality tracking
    originalGrade: str = Field(..., description="Original quality grade when sold")
    newGrade: Optional[str] = Field(None, description="New quality grade after return (may be downgraded)")

    # Return details
    reason: ReturnReason = Field(..., description="Reason for return")
    condition: ReturnCondition = Field(..., description="Condition of returned item")

    # Inventory destination
    inventoryId: Optional[UUID] = Field(None, description="Original inventory ID (if linked)")
    returnToInventory: bool = Field(True, description="Whether to return to inventory (False = waste)")

    # Notes
    notes: Optional[str] = Field(None, max_length=500, description="Additional notes about this item")


class ReturnItemCreate(BaseModel):
    """Schema for creating a return item"""
    originalOrderItemProductId: UUID = Field(..., description="Product ID from original order")
    productName: str = Field(..., min_length=1, max_length=200)
    orderedQuantity: float = Field(..., gt=0)
    returnedQuantity: float = Field(..., gt=0)
    originalGrade: str
    newGrade: Optional[str] = None
    reason: ReturnReason
    condition: ReturnCondition
    inventoryId: Optional[UUID] = None
    returnToInventory: bool = True
    notes: Optional[str] = Field(None, max_length=500)


class ReturnOrderBase(BaseModel):
    """Base return order fields"""
    orderId: UUID = Field(..., description="Original sales order ID")
    shipmentId: Optional[UUID] = Field(None, description="Shipment ID (if return from delivery)")

    # Items
    items: List[ReturnItem] = Field(..., min_length=1, description="Items being returned")

    # Status
    status: ReturnStatus = Field(ReturnStatus.PENDING, description="Return status")

    # Dates
    returnDate: datetime = Field(default_factory=datetime.utcnow, description="Date return was initiated")
    processedDate: Optional[datetime] = Field(None, description="Date return was processed")

    # Totals
    totalReturnedQuantity: float = Field(0, ge=0, description="Total quantity returned")
    totalRefundAmount: Optional[float] = Field(None, ge=0, description="Total refund amount if applicable")

    # Notes
    notes: Optional[str] = Field(None, max_length=1000, description="Return notes")


class ReturnOrderCreate(BaseModel):
    """Schema for creating a return order"""
    orderId: UUID = Field(..., description="Original sales order ID")
    shipmentId: Optional[UUID] = None
    items: List[ReturnItemCreate] = Field(..., min_length=1)
    notes: Optional[str] = Field(None, max_length=1000)


class ReturnOrderUpdate(BaseModel):
    """Schema for updating a return order"""
    status: Optional[ReturnStatus] = None
    items: Optional[List[ReturnItemCreate]] = None
    notes: Optional[str] = Field(None, max_length=1000)
    processedDate: Optional[datetime] = None
    totalRefundAmount: Optional[float] = Field(None, ge=0)


class ReturnOrder(ReturnOrderBase):
    """Complete return order model with all fields"""
    returnId: UUID = Field(default_factory=uuid4, description="Unique return order identifier")
    returnCode: Optional[str] = Field(None, description="Human-readable return code (e.g., RET001)")

    # Reference to original order details (denormalized for convenience)
    customerName: Optional[str] = Field(None, description="Customer name from original order")
    orderCode: Optional[str] = Field(None, description="Original order code")

    # Processing
    processedBy: Optional[UUID] = Field(None, description="User ID who processed this return")

    # Tracking
    createdBy: UUID = Field(..., description="User ID who created this return")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "returnId": "e47ac10b-58cc-4372-a567-0e02b2c3d479",
                "returnCode": "RET001",
                "orderId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "shipmentId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
                "orderCode": "SO001",
                "customerName": "Acme Corporation",
                "status": "pending",
                "returnDate": "2025-01-20T14:00:00Z",
                "items": [
                    {
                        "orderItemId": "c3d4e5f6-a7b8-9012-cdef-123456789012",
                        "originalOrderItemProductId": "d4e5f6a7-b8c9-0123-def1-234567890123",
                        "productName": "Fresh Lettuce",
                        "orderedQuantity": 50,
                        "returnedQuantity": 10,
                        "originalGrade": "grade_a",
                        "newGrade": "grade_b",
                        "reason": "customer_rejected",
                        "condition": "resellable",
                        "returnToInventory": True,
                        "notes": "Customer changed order quantity"
                    }
                ],
                "totalReturnedQuantity": 10,
                "totalRefundAmount": 25.00,
                "notes": "Partial return - customer requested reduced quantity",
                "createdBy": "e5f6a7b8-c9d0-1234-ef01-234567890123",
                "createdAt": "2025-01-20T14:00:00Z",
                "updatedAt": "2025-01-20T14:00:00Z"
            }
        }


class ProcessReturnRequest(BaseModel):
    """Request to process a return order"""
    returnId: UUID = Field(..., description="Return order ID to process")
    # Override individual item destinations if needed
    itemOverrides: Optional[List[dict]] = Field(
        None,
        description="Override return destinations for specific items: [{orderItemId, returnToInventory, newGrade}]"
    )
    notes: Optional[str] = Field(None, max_length=500, description="Processing notes")


class ProcessReturnResponse(BaseModel):
    """Response after processing a return"""
    returnOrder: dict = Field(..., description="Updated return order")
    inventoryUpdates: List[dict] = Field(default_factory=list, description="Inventory items updated")
    wasteCreated: List[dict] = Field(default_factory=list, description="Waste records created")
    message: str = Field(..., description="Processing result message")
