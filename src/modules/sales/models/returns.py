"""
Sales Module — Return (RTN) Pydantic Schemas (T-100.11)

Covers the lifecycle of a Return Note — physical goods coming back:

    DRAFT → OPEN (inventory restored, return_posted event emitted)
          → CANCELLED (draft abandoned)
    OPEN  → CLOSED (fully credited by Credit Note)
          → CANCELLED (inventory reversal, return_cancelled event emitted)

Collection name: returns_v2

Hardening (T-200.7):
    Response models use _RESPONSE_CONFIG (to_camel alias + populate_by_name)
    so routes can set response_model_by_alias=True and emit camelCase JSON.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from src.core.documents.document_links import DocumentLinkRef
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


class ReturnLineCreate(BaseModel):
    """
    Input payload for a single Return line.

    Attributes:
        item_id:           FK to items collection.
        item_code:         Denormalised item code.
        item_name:         Denormalised item name.
        description:       Printable description.
        returned_qty:      Quantity physically returned. Must be > 0.
        uom:               Unit of measure.
        warehouse_id:      REQUIRED — where goods come back into stock.
        unit_price:        Snapshotted from source Delivery (for Credit Note creation).
        tax_code_id:       FK to tax codes (optional).
        tax_percent:       Snapshotted tax rate.
        cost_center_id:    Optional cost centre.
        base_doc_ref:      REQUIRED — link to RR line or Delivery line.
    """

    item_id: str = Field(..., description="FK to items collection")
    item_code: str = Field(..., max_length=50)
    item_name: str = Field(..., max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    returned_qty: Decimal = Field(..., gt=Decimal("0"))
    uom: str = Field(..., max_length=20)
    warehouse_id: str = Field(..., description="Destination warehouse for returned goods")
    unit_price: Decimal = Field(..., ge=Decimal("0"))
    discount_percent: Decimal = Field(Decimal("0"), ge=Decimal("0"), le=Decimal("100"))
    tax_code_id: Optional[str] = None
    tax_percent: Decimal = Field(Decimal("0"), ge=Decimal("0"), le=Decimal("100"))
    cost_center_id: Optional[str] = None
    base_doc_ref: DocumentLinkRef = Field(
        ..., description="Link to source RR line or Delivery line"
    )


class ReturnLineResponse(BaseModel):
    """
    Full Return line as returned by the API.

    model_config = _RESPONSE_CONFIG ensures camelCase output when
    response_model_by_alias=True is set on the route.

    Attributes:
        line_id:         UUID of this line.
        line_number:     1-indexed position.
        item_id:         FK to items.
        item_code:       Denormalised item code.
        item_name:       Denormalised item name.
        description:     Printable description.
        returned_qty:    Qty physically returned.
        uom:             Unit of measure.
        warehouse_id:    Return destination warehouse.
        unit_cost:       Moving-avg cost at OPEN-transition time (for COGS reversal).
        line_cogs:       returned_qty * unit_cost (amount reversed from COGS).
        unit_price:      Snapshotted price (for Credit Note creation).
        discount_percent: Discount %.
        line_net:        Computed net amount (for Credit Note).
        tax_code_id:     FK to tax codes.
        tax_percent:     Snapshotted tax rate.
        line_tax:        Computed tax amount.
        line_gross:      line_net + line_tax.
        cost_center_id:  Cost centre.
        base_doc_ref:    Source RR/Delivery line ref.
        target_doc_refs: Filled when Credit Note lines consume this Return line.
        ordered_qty:     Same as returned_qty.
        consumed_qty:    How much has been consumed by Credit Notes.
    """

    model_config = _RESPONSE_CONFIG

    line_id: str
    line_number: int
    item_id: str
    item_code: str
    item_name: str
    description: str
    returned_qty: Decimal
    uom: str
    warehouse_id: str
    unit_cost: Decimal
    line_cogs: Decimal
    unit_price: Decimal
    discount_percent: Decimal
    line_net: Decimal
    tax_code_id: Optional[str]
    tax_percent: Decimal
    line_tax: Decimal
    line_gross: Decimal
    cost_center_id: Optional[str]
    base_doc_ref: Optional[DocumentLinkRef]
    target_doc_refs: List[DocumentLinkRef]
    ordered_qty: Decimal
    consumed_qty: Decimal


# ---------------------------------------------------------------------------
# Header schemas
# ---------------------------------------------------------------------------


class ReturnTotals(BaseModel):
    """Totals sub-document for a Return Note."""

    model_config = _RESPONSE_CONFIG

    net: Decimal
    tax: Decimal
    gross: Decimal
    total_cogs: Decimal


class ReturnFromRequestRequest(BaseModel):
    """
    Create a Return from a Return Request (RR).

    Args:
        company_code:       Finance company code.
        doc_date:           Document date.
        actual_return_date: When goods physically arrived back.
        received_by_user_id: User who received the goods (optional).
        lines:              Lines being returned (subset of RR lines).
        notes:              Free-text notes.
    """

    company_code: Optional[str] = Field(None, max_length=20, description="Finance company code — auto-resolved by API layer if omitted")
    doc_date: date
    actual_return_date: date
    received_by_user_id: Optional[str] = None
    lines: List[ReturnLineCreate] = Field(..., min_length=1)
    notes: Optional[str] = Field(None, max_length=1000)


class ReturnCreate(BaseModel):
    """
    Input payload for creating a Return directly (without a Return Request).

    base_doc_ref points directly to the source Delivery.

    Attributes:
        company_code:       Finance company code.
        customer_id:        FK to customer.
        customer_name:      Denormalised customer name.
        doc_date:           Document date.
        actual_return_date: When goods physically arrived back.
        received_by_user_id: User who received the goods.
        base_doc_ref:       REQUIRED — source Delivery header ref.
        lines:              At least one line required.
        notes:              Free-text notes.
    """

    company_code: Optional[str] = Field(None, max_length=20, description="Finance company code — auto-resolved by API layer if omitted")
    customer_id: str = Field(..., description="FK to customer")
    customer_name: str = Field(..., max_length=200)
    doc_date: date
    actual_return_date: date
    received_by_user_id: Optional[str] = None
    base_doc_ref: DocumentLinkRef = Field(
        ..., description="Source Delivery header ref"
    )
    lines: List[ReturnLineCreate] = Field(..., min_length=1)
    notes: Optional[str] = Field(None, max_length=1000)


class ReturnUpdate(BaseModel):
    """
    Partial update for a DRAFT Return.

    Only allowed in DRAFT status.
    """

    doc_date: Optional[date] = None
    actual_return_date: Optional[date] = None
    received_by_user_id: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=1000)
    lines: Optional[List[ReturnLineCreate]] = None


class ReturnStatusTransitionRequest(BaseModel):
    """Transition request for Return status changes."""

    new_status: DocumentStatus
    reason: Optional[str] = Field(None, max_length=500)


class ReturnResponse(BaseModel):
    """Full Return as returned by the API."""

    model_config = _RESPONSE_CONFIG

    doc_entry: str
    doc_number: str
    doc_type: str
    organization_id: str
    company_code: str
    customer_id: str
    customer_name: str
    doc_date: date
    actual_return_date: date
    status: DocumentStatus
    received_by_user_id: Optional[str]
    base_doc_ref: Optional[DocumentLinkRef]
    target_doc_refs: List[DocumentLinkRef]
    outbox_event_id: Optional[str]
    outbox_event_emitted_at: Optional[datetime]
    totals: ReturnTotals
    notes: Optional[str]
    lines: List[ReturnLineResponse]
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str


class ReturnListItem(BaseModel):
    """Slim Return row for paginated list views."""

    model_config = _RESPONSE_CONFIG

    doc_entry: str
    doc_number: str
    organization_id: str
    customer_id: str
    customer_name: str
    doc_date: date
    actual_return_date: date
    status: DocumentStatus
    totals: ReturnTotals
    base_doc_ref: Optional[DocumentLinkRef]
    created_at: datetime
    updated_at: datetime
