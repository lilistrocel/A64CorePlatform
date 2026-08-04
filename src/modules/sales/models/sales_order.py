"""
Sales Order Model

Represents a sales order in the Sales system.
"""

from datetime import datetime
from typing import Optional, List, Literal
from uuid import UUID, uuid4
from pydantic import BaseModel, Field
from enum import Enum


class ReturnSummary(BaseModel):
    """
    Thin summary appended to a SalesOrder's returns list when a Report Return
    is processed.  The full record lives in return_orders collection.
    """

    returnId: UUID = Field(
        ..., description="Return order ID in return_orders collection"
    )
    returnDate: datetime = Field(..., description="When the return was processed")
    sellableKg: float = Field(
        0.0, ge=0, description="Quantity returned to inventory_returned (sellable)"
    )
    spoiledKg: float = Field(
        0.0, ge=0, description="Quantity recorded as waste (spoiled)"
    )
    notes: Optional[str] = Field(None, max_length=1000)


class SalesOrderStatus(str, Enum):
    """Sales order status enumeration"""

    DRAFT = "draft"
    CONFIRMED = "confirmed"
    PROCESSING = "processing"
    ASSIGNED = "assigned"  # Assigned to shipment
    IN_TRANSIT = "in_transit"  # Being delivered
    SHIPPED = "shipped"  # Keep for backward compatibility
    DELIVERED = "delivered"
    PARTIALLY_RETURNED = "partially_returned"  # Some items returned
    RETURNED = "returned"  # Fully returned
    CANCELLED = "cancelled"


class PaymentStatus(str, Enum):
    """Payment status enumeration"""

    PENDING = "pending"
    PARTIAL = "partial"
    PAID = "paid"


class OrderItemAllocation(BaseModel):
    """
    Per-batch allocation binding one line item to a specific inventory row.

    Used for FIFO allocation across inventory_harvest and inventory_returned.
    Empty list for orders created before the linked-stock flow was introduced.
    """

    inventorySource: Literal["harvest", "returned"] = Field(
        ..., description="Which collection the allocated row lives in"
    )
    inventoryId: UUID = Field(
        ..., description="Row ID in inventory_harvest or inventory_returned"
    )
    farmId: Optional[UUID] = Field(
        None, description="Farm that owns the batch (null for returned-source rows)"
    )
    farmName: Optional[str] = Field(
        None, description="Denormalised farm name for display"
    )
    quantity: float = Field(..., gt=0, description="Quantity allocated from this batch")


class OrderItem(BaseModel):
    """Order item information"""

    productId: UUID = Field(..., description="Product ID from inventory")
    productName: str = Field(
        ..., min_length=1, max_length=200, description="Product name"
    )
    quantity: float = Field(..., gt=0, description="Quantity ordered")
    unitPrice: float = Field(..., ge=0, description="Unit price")
    totalPrice: float = Field(..., ge=0, description="Total price for this item")

    # Inventory integration fields
    inventoryId: Optional[UUID] = Field(
        None, description="Link to harvest inventory item"
    )
    qualityGrade: Optional[str] = Field(
        None, description="Quality grade being sold (e.g., grade_a, grade_b)"
    )
    sourceType: str = Field("fresh", description="Source type: 'fresh' or 'returned'")

    # Phase 2 linked-stock fields — all optional so legacy orders deserialise cleanly
    allocations: List[OrderItemAllocation] = Field(
        default_factory=list,
        description=(
            "Per-batch FIFO allocation of this line item across "
            "inventory_harvest + inventory_returned rows. "
            "Empty list for orders created before the linked-stock flow."
        ),
    )
    containerCount: Optional[int] = Field(
        None,
        gt=0,
        description="Number of containers ordered (container-mode orders only).",
    )
    containerSize: Optional[float] = Field(
        None,
        gt=0,
        description=(
            "Quantity per container in `unit` (container-mode orders only). "
            "Invariant: containerCount * containerSize == quantity."
        ),
    )


class ShippingAddress(BaseModel):
    """Shipping address information"""

    street: Optional[str] = Field(None, max_length=200, description="Street address")
    city: Optional[str] = Field(None, max_length=100, description="City")
    state: Optional[str] = Field(None, max_length=100, description="State/Province")
    country: Optional[str] = Field(None, max_length=100, description="Country")
    postalCode: Optional[str] = Field(
        None, max_length=20, description="Postal/ZIP code"
    )


class SalesOrderBase(BaseModel):
    """Base sales order fields"""

    customerId: UUID = Field(..., description="Customer ID (from CRM)")
    customerName: str = Field(
        ..., min_length=1, max_length=200, description="Customer name (denormalized)"
    )
    status: SalesOrderStatus = Field(SalesOrderStatus.DRAFT, description="Order status")
    orderDate: datetime = Field(
        default_factory=datetime.utcnow, description="Order date"
    )
    items: List[OrderItem] = Field(..., min_length=1, description="Order items")
    subtotal: float = Field(..., ge=0, description="Subtotal amount")
    tax: float = Field(0, ge=0, description="Tax amount")
    discount: float = Field(0, ge=0, description="Discount amount")
    total: float = Field(..., ge=0, description="Total amount")
    paymentStatus: PaymentStatus = Field(
        PaymentStatus.PENDING, description="Payment status"
    )
    shippingAddress: Optional[ShippingAddress] = Field(
        None, description="Shipping address"
    )
    notes: Optional[str] = Field(None, max_length=1000, description="Additional notes")

    # Shipment integration field
    shipmentId: Optional[UUID] = Field(
        None, description="Linked shipment ID (when assigned)"
    )

    # Farming year tracking - calculated from orderDate
    farmingYear: Optional[int] = Field(
        None, description="Farming year for the order (calculated from orderDate)"
    )


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
    shipmentId: Optional[UUID] = None


class SalesOrder(SalesOrderBase):
    """Complete sales order model with all fields"""

    orderId: UUID = Field(default_factory=uuid4, description="Unique order identifier")
    orderCode: Optional[str] = Field(
        None, description="Human-readable order code (e.g., SO001)"
    )

    # Multi-industry scoping
    divisionId: Optional[str] = Field(None, description="Division scope")
    organizationId: Optional[str] = Field(None, description="Organization scope")

    # Soft-delete support — set on delete-confirm; CANCELLED orders are filtered
    # from the default list view unless ?include_deleted=true is passed.
    deletedAt: Optional[datetime] = Field(
        None,
        description="Timestamp when the order was soft-deleted (status→cancelled via delete flow)",
    )

    # Report Return summaries appended each time a partial/full return is processed.
    # Full detail lives in return_orders collection; this is for order-level display.
    returns: List[ReturnSummary] = Field(
        default_factory=list,
        description="Summary of returns processed against this order",
    )

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
                "status": "assigned",
                "orderDate": "2025-01-20T10:00:00Z",
                "items": [
                    {
                        "productId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
                        "productName": "Fresh Lettuce",
                        "quantity": 50,
                        "unitPrice": 2.50,
                        "totalPrice": 125.00,
                        "inventoryId": "c3d4e5f6-a7b8-9012-cdef-123456789012",
                        "qualityGrade": "grade_a",
                        "sourceType": "fresh",
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
                    "postalCode": "10001",
                },
                "notes": "Rush order - deliver by Friday",
                "shipmentId": "f7a8b9c0-d1e2-3456-f789-abc012345678",
                "createdBy": "d4e5f6a7-b8c9-0123-def1-234567890123",
                "createdAt": "2025-01-20T10:00:00Z",
                "updatedAt": "2025-01-20T10:00:00Z",
            }
        }


# ============================================================================
# DELETE-PREVIEW / DELETE-CONFIRM REQUEST-RESPONSE SCHEMAS
# ============================================================================


class AllocationPreview(BaseModel):
    """
    Per-allocation row returned by GET /orders/{id}/delete-preview.

    state:
      "active"  — source row exists and has quantity (auto-restored on confirm)
      "expired" — source row was already moved to waste by the expiry cron
      "missing" — source row cannot be found at all (data anomaly)
    """

    lineItemIndex: int = Field(
        ..., description="Index of the order item in order.items"
    )
    inventorySource: Literal["harvest", "returned"] = Field(...)
    inventoryId: UUID = Field(...)
    farmName: Optional[str] = Field(None)
    plantName: Optional[str] = Field(None)
    quantity: float = Field(...)
    state: Literal["active", "expired", "missing"] = Field(...)
    # Set when state == "expired"
    expiredWasteId: Optional[str] = Field(None)
    expiredOn: Optional[datetime] = Field(None)


class DeletePreviewResponse(BaseModel):
    """Response from GET /orders/{id}/delete-preview."""

    orderId: UUID
    orderCode: Optional[str] = None
    canDelete: bool
    blockingReason: Optional[str] = Field(
        None, description="Populated when canDelete is False"
    )
    allocations: List[AllocationPreview] = Field(default_factory=list)


class BatchDecision(BaseModel):
    """
    Per-allocation decision supplied to POST /orders/{id}/delete.

    action:
      "restore" — bump quantity back to source row (default for active batches)
      "revive"  — un-expire the matching waste record, restore source row quantity,
                  then set a new expiryDate.  Requires expiryDate > now.
      "waste"   — create a new inventory_waste record with sourceType=order_deletion.
                  Used when the caller accepts the loss.
    """

    lineItemIndex: int
    inventoryId: UUID = Field(
        ..., description="Disambiguates allocation within a line item"
    )
    action: Literal["restore", "revive", "waste"]
    expiryDate: Optional[datetime] = Field(
        None, description="Required when action=='revive'. Must be in the future."
    )


class DeleteOrderRequest(BaseModel):
    """
    Body for POST /orders/{id}/delete.

    Only allocations flagged as 'expired' or 'missing' in the preview require an
    explicit decision.  Active allocations are auto-restored.
    """

    decisions: List[BatchDecision] = Field(
        default_factory=list,
        description="One entry per allocation that requires an explicit decision",
    )


class DeleteOrderResponse(BaseModel):
    """Summary returned after a confirmed order deletion."""

    success: bool = True
    restoredKg: float = 0.0
    revivedBatches: List[str] = Field(
        default_factory=list, description="inventoryIds revived"
    )
    wastedKg: float = 0.0
    orderStatus: str = "cancelled"


# ============================================================================
# REPORT-RETURN REQUEST-RESPONSE SCHEMAS
# ============================================================================


class ReportReturnItem(BaseModel):
    """
    Single line in a Report Return request.

    Quantity is in kg (the canonical unit used throughout the linked-stock flow).
    """

    orderItemIndex: int = Field(
        ..., description="Index of the order item in order.items"
    )
    quantity: float = Field(..., gt=0, description="Quantity being returned (kg)")
    containerCount: Optional[int] = Field(None, gt=0)
    containerSize: Optional[float] = Field(None, gt=0)
    condition: Literal["sellable", "spoiled"] = Field(
        ..., description="'sellable' → inventory_returned; 'spoiled' → inventory_waste"
    )
    reason: Optional[str] = Field(None, max_length=500)
    disposalMethod: Optional[str] = Field(
        None,
        max_length=50,
        description="Required / recommended when condition=='spoiled'",
    )


class ReportReturnRequest(BaseModel):
    """Body for POST /orders/{id}/report-return."""

    items: List[ReportReturnItem] = Field(..., min_length=1)
    notes: Optional[str] = Field(None, max_length=1000)


class ReportReturnStockChanges(BaseModel):
    addedToReturned: float = Field(0.0, description="kg added to inventory_returned")
    addedToWaste: float = Field(0.0, description="kg added to inventory_waste")


class ReportReturnResponse(BaseModel):
    """Summary returned by POST /orders/{id}/report-return."""

    success: bool = True
    returnId: str = Field(..., description="ID of the new return_orders record")
    itemsReturned: List[dict] = Field(default_factory=list)
    stockChanges: ReportReturnStockChanges = Field(
        default_factory=ReportReturnStockChanges
    )
