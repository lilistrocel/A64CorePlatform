"""
Sales Module — Delivery Note (DN) Pydantic Schemas

Covers the lifecycle of a physical shipment from warehouse to customer:

    DRAFT → OPEN → CLOSED
         → CANCELLED  (from DRAFT or OPEN)

This module owns the serialisation contract between the Delivery API layer
and the Delivery service layer.

Design choices
--------------
- Delivery MUST reference a source Sales Order (no from-scratch creation).
- Moving-average unit cost is snapshotted TWICE:
    1. At DRAFT creation (tentative, for display/preview).
    2. Again at DRAFT→OPEN transition (final, used in the COGS outbox event).
  This matches SAP B1 behaviour.
- line_cogs = quantity × unit_cost (computed at OPEN-transition time).
- The header carries outbox_event_id / outbox_event_emitted_at to allow
  ops-side reconciliation against the finance event stream.
- Collection name: deliveries_v2 (avoids any collision with legacy collections).
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from src.core.documents.document_links import DocumentLinkRef, DocumentLineLinkMixin
from src.core.documents.document_status import DocumentStatus

# Response models emit camelCase fields via the to_camel alias generator;
# routes pair this with response_model_by_alias=True. populate_by_name=True
# means consumers may still post snake_case input bodies.
_RESPONSE_CONFIG = ConfigDict(
    populate_by_name=True,
    alias_generator=to_camel,
    from_attributes=True,
)


# ---------------------------------------------------------------------------
# Line schemas
# ---------------------------------------------------------------------------


class DeliveryLineCreate(BaseModel):
    """
    Input payload for a single Delivery line when creating a Delivery from an SO.

    The service fills: line_id, line_number, unit_cost (from moving-avg),
    line_cogs, ordered_qty, invoiced_qty, credited_qty, cancelled_qty.

    Attributes:
        so_line_id:      lineId UUID of the source SO line (REQUIRED for linking).
        so_line_number:  Line number on the source SO (for payload serialisation).
        item_id:         FK to items collection.
        item_code:       Denormalised item code (snapshot).
        item_name:       Denormalised item name (snapshot).
        description:     Printable description; defaults to item_name.
        quantity:        Qty being delivered in this document (must be > 0 and ≤ SO line open_qty).
        uom:             Unit of measure.
        warehouse_id:    REQUIRED — the warehouse goods are dispatched from.
        cost_center_id:  Optional cost-centre for COGS allocation.
    """

    so_line_id: str = Field(..., description="lineId UUID of the source SO line")
    so_line_number: int = Field(..., description="Line number on the source SO")
    item_id: str = Field(..., description="FK to items collection")
    item_code: str = Field(..., max_length=50, description="Denormalised item code")
    item_name: str = Field(..., max_length=200, description="Denormalised item name")
    description: Optional[str] = Field(None, max_length=500)
    quantity: Decimal = Field(
        ..., gt=Decimal("0"), description="Qty to deliver; must be > 0"
    )
    uom: str = Field(..., max_length=20, description="Unit of measure")
    warehouse_id: str = Field(..., description="REQUIRED — warehouse goods leave from")
    cost_center_id: Optional[str] = Field(
        None, description="Cost-centre for COGS allocation"
    )


class DeliveryLineResponse(DocumentLineLinkMixin):
    """
    Full representation of a Delivery line as returned by the API.

    unit_cost and line_cogs are the values snapshotted at OPEN-transition time.
    At DRAFT status they hold the tentative values captured at creation time.

    Attributes:
        line_id:          UUID for this Delivery line (stable cross-service ref).
        line_number:      1-indexed position within this Delivery document.
        item_id:          FK to items.
        item_code:        Denormalised.
        item_name:        Denormalised.
        description:      Printable description.
        quantity:         Qty delivered in this document.
        uom:              Unit of measure.
        warehouse_id:     Warehouse goods dispatched from.
        unit_cost:        Moving-avg cost per unit at OPEN-transition (tentative at DRAFT).
        line_cogs:        quantity × unit_cost.
        cost_center_id:   Optional cost-centre.
        ordered_qty:      = quantity (immutable after creation).
        invoiced_qty:     Filled by AR Invoice (T-100.9); starts at 0.
        credited_qty:     Filled by Credit Note; starts at 0.
        cancelled_qty:    0 normally; set if the line is cancelled.
    """

    line_id: str = Field(..., description="UUID for this Delivery line")
    line_number: int = Field(..., description="1-indexed position")
    item_id: str
    item_code: str
    item_name: str
    description: str
    quantity: Decimal
    uom: str
    warehouse_id: str
    unit_cost: Decimal = Field(
        ...,
        description="Moving-avg cost snapshotted at OPEN-transition (tentative at DRAFT)",
    )
    line_cogs: Decimal = Field(..., description="quantity × unit_cost")
    cost_center_id: Optional[str]
    # Quantity tracking
    ordered_qty: Decimal = Field(..., description="= quantity at creation, immutable")
    invoiced_qty: Decimal = Field(Decimal("0"), description="Filled by AR Invoice")
    credited_qty: Decimal = Field(Decimal("0"), description="Filled by Credit Note")
    cancelled_qty: Decimal = Field(
        Decimal("0"), description="Set on line-level cancellation"
    )


# ---------------------------------------------------------------------------
# Header schemas
# ---------------------------------------------------------------------------


class DeliveryCreate(BaseModel):
    """
    Input payload for creating a Delivery from an existing Sales Order.

    The caller supplies the header fields and the list of lines.  Each line
    must reference a valid SO line via so_line_id.  The service validates that:
    - the SO is in OPEN or PARTLY_CLOSED status.
    - each referenced so_line_id exists on the SO.
    - each requested quantity ≤ that SO line's open_qty.

    The service fills: doc_entry, doc_number, status, unit_cost per line,
    line_cogs per line, total_cogs, created_at, updated_at.

    Attributes:
        organization_id:       Owning organisation UUID.
        company_code:          Finance company code for doc_number scoping.
        doc_date:              Accounting posting date.
        actual_delivery_date:  When goods physically left the warehouse.
        delivered_by_user_id:  Optional FK to the warehouse worker / driver.
        notes:                 Free-text header notes.
        lines:                 Delivery lines (at least one required).
    """

    organization_id: str = Field(..., description="Owning organisation UUID")
    company_code: Optional[str] = Field(
        None,
        max_length=20,
        description="Finance company code — auto-resolved by API layer if omitted",
    )
    doc_date: date = Field(..., description="Accounting date for this document")
    actual_delivery_date: date = Field(
        ..., description="Physical shipment date (may differ from doc_date)"
    )
    delivered_by_user_id: Optional[str] = Field(
        None, description="FK to warehouse worker / driver user"
    )
    notes: Optional[str] = Field(None, max_length=2000)
    lines: List[DeliveryLineCreate] = Field(
        ..., min_length=1, description="Delivery lines (at least one required)"
    )


class DeliveryUpdate(BaseModel):
    """
    Partial update payload for a DRAFT Delivery.

    Only allowed when the Delivery header is in DRAFT status.
    Lines, if provided, REPLACE the existing line set wholesale.
    The service revalidates open_qty constraints when lines are replaced.

    Attributes:
        doc_date:              Override accounting date.
        actual_delivery_date:  Override physical shipment date.
        delivered_by_user_id:  Override warehouse worker.
        notes:                 Override notes.
        lines:                 If provided, replaces all lines wholesale.
    """

    doc_date: Optional[date] = None
    actual_delivery_date: Optional[date] = None
    delivered_by_user_id: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=2000)
    lines: Optional[List[DeliveryLineCreate]] = Field(
        None, description="If provided, replaces the existing line set wholesale"
    )


class DeliveryResponse(BaseModel):
    """
    Full representation of a Delivery header returned by the API.

    lines is always included for single-document GET endpoints.
    For list endpoints the service returns DeliveryListItem (slimmer).
    """

    doc_entry: str = Field(..., description="UUID — stable cross-service reference")
    doc_number: str = Field(..., description="Human-readable e.g. 'DN-2026-0001'")
    doc_type: str = Field("DELIVERY", description="Constant — always 'DELIVERY'")
    organization_id: str
    company_code: str
    customer_id: str
    customer_name: str
    doc_date: date
    actual_delivery_date: date
    status: DocumentStatus
    delivered_by_user_id: Optional[str]
    notes: Optional[str]
    total_cogs: Decimal = Field(..., description="Sum of line_cogs across all lines")
    # Source SO link (REQUIRED — all Deliveries come from an SO)
    base_doc_ref: Optional[DocumentLinkRef] = Field(
        None, description="Header-level reference to the source SO"
    )
    target_doc_refs: List[DocumentLinkRef] = Field(
        default_factory=list,
        description="Populated when AR Invoice or Credit Note is created from this Delivery",
    )
    # Outbox event tracking (ops-side visibility)
    outbox_event_id: Optional[str] = Field(
        None,
        description="event_id of the delivery_posted outbox event (set at OPEN-transition)",
    )
    outbox_event_emitted_at: Optional[datetime] = Field(
        None, description="UTC timestamp when the outbox event was emitted"
    )
    lines: List[DeliveryLineResponse] = Field(default_factory=list)
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str

    model_config = _RESPONSE_CONFIG


class DeliveryListItem(BaseModel):
    """
    Slim view of a Delivery for paginated list responses.

    Excludes the full lines array to keep list payloads lean.

    open_invoice_qty is the aggregate remaining-to-invoice quantity across
    all lines:
        sum(line.quantity - line.invoicedQty - line.creditedQty - line.cancelledQty)
    A value of 0 (within tolerance) means the Delivery is fully invoiced.
    """

    doc_entry: str
    doc_number: str
    organization_id: str
    customer_id: str
    customer_name: str
    doc_date: date
    actual_delivery_date: date
    status: DocumentStatus
    total_cogs: Decimal
    base_doc_ref: Optional[DocumentLinkRef]
    open_invoice_qty: Decimal = Field(
        Decimal("0"),
        description=(
            "Sum of (quantity - invoicedQty - creditedQty - cancelledQty) across all "
            "Delivery lines.  Zero means fully invoiced."
        ),
    )
    created_at: datetime
    updated_at: datetime

    model_config = _RESPONSE_CONFIG


# ---------------------------------------------------------------------------
# Status transition request
# ---------------------------------------------------------------------------


class DeliveryStatusTransitionRequest(BaseModel):
    """
    Request body for the Delivery status-transition endpoint.

    Legal transitions (from LEGAL_TRANSITIONS["DELIVERY"]):
        DRAFT        → OPEN, CANCELLED
        OPEN         → PARTLY_CLOSED, CLOSED
        PARTLY_CLOSED → CLOSED
        CLOSED        → (terminal)

    On DRAFT → OPEN (primary accounting event):
      - unit_cost is re-snapshotted from inventory_balances (moving-avg).
      - Inventory decremented (inventory_movements rows inserted).
      - Source SO line delivered_qty incremented.
      - Source SO auto-transitioned to PARTLY_CLOSED or CLOSED if applicable.
      - delivery_posted outbox event emitted (finance posts COGS JE in T-100.8.1).

    On OPEN → CANCELLED:
      - Inventory restored (reversing inventory_movements rows).
      - Source SO line delivered_qty decremented.
      - Source SO status potentially restored.
      - delivery_cancelled outbox event emitted.

    Attributes:
        new_status: Target status to transition to.
        reason:     Optional free-text reason stored in the audit log.
    """

    new_status: DocumentStatus = Field(
        ..., description="Target status for the transition"
    )
    reason: Optional[str] = Field(
        None,
        max_length=500,
        description="Optional reason for the transition (stored in audit log)",
    )


# ---------------------------------------------------------------------------
# Create-from-SO request
# ---------------------------------------------------------------------------


class DeliveryFromSORequest(BaseModel):
    """
    DTO for creating a Delivery from an existing Sales Order.

    The caller supplies the header fields and the lines to deliver.  Lines
    must reference SO line IDs; quantities must not exceed SO line open_qty.

    This is the ONLY way to create a Delivery in v1 — from-scratch creation
    without an upstream SO is not supported.

    Attributes:
        company_code:          Finance company code (for doc_number scoping).
        doc_date:              Accounting date.
        actual_delivery_date:  Physical shipment date.
        delivered_by_user_id:  Optional FK to warehouse worker / driver.
        notes:                 Free-text notes.
        lines:                 Lines specifying which SO lines to deliver and qty.
    """

    company_code: Optional[str] = Field(
        None,
        max_length=20,
        description="Finance company code — auto-resolved by API layer if omitted",
    )
    doc_date: date = Field(..., description="Accounting date")
    actual_delivery_date: date = Field(..., description="Physical shipment date")
    delivered_by_user_id: Optional[str] = Field(None)
    notes: Optional[str] = Field(None, max_length=2000)
    lines: List[DeliveryLineCreate] = Field(
        ..., min_length=1, description="Lines to deliver (at least one required)"
    )
