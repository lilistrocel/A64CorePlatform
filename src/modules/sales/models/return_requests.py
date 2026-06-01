"""
Sales Module — Return Request (RR) Pydantic Schemas (T-100.11)

Covers the lifecycle of a Return Request (RMA authorisation):

    DRAFT → OPEN → CLOSED  (fully consumed by Returns)
                 → CANCELLED

A Return Request is a commitment document (no GL impact). It records the
customer's intention to return goods and authorises a Return to be created.

Collection name: return_requests_v2

Hardened for T-200.6: response models use _RESPONSE_CONFIG (to_camel alias +
populate_by_name=True + from_attributes=True); routes use response_model_by_alias=True.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator
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
# Return reason types
# ---------------------------------------------------------------------------

ReturnReason = Literal[
    "damaged",
    "wrong_item",
    "overshipped",
    "customer_change",
    "quality",
    "other",
]


# ---------------------------------------------------------------------------
# Line schemas
# ---------------------------------------------------------------------------


class ReturnRequestLineCreate(BaseModel):
    """
    Input payload for a single Return Request line.

    Attributes:
        item_id:          FK to items collection.
        item_code:        Denormalised item code.
        item_name:        Denormalised item name.
        description:      Printable description; defaults to item_name.
        requested_qty:    Quantity being requested for return. Must be > 0.
        uom:              Unit of measure.
        unit_price:       Snapshotted from source Delivery/Invoice line.
        discount_percent: Line discount 0–100.
        tax_code_id:      FK to tax codes (optional).
        tax_percent:      Snapshotted tax rate.
        warehouse_id:     Expected return warehouse.
        cost_center_id:   Optional cost centre.
        base_doc_ref:     REQUIRED — link to source Delivery line (or AR Invoice line).
    """

    item_id: str = Field(..., description="FK to items collection")
    item_code: str = Field(..., max_length=50)
    item_name: str = Field(..., max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    requested_qty: Decimal = Field(..., gt=Decimal("0"))
    uom: str = Field(..., max_length=20)
    unit_price: Decimal = Field(..., ge=Decimal("0"))
    discount_percent: Decimal = Field(Decimal("0"), ge=Decimal("0"), le=Decimal("100"))
    tax_code_id: Optional[str] = None
    tax_percent: Decimal = Field(Decimal("0"), ge=Decimal("0"), le=Decimal("100"))
    warehouse_id: Optional[str] = None
    cost_center_id: Optional[str] = None
    base_doc_ref: DocumentLinkRef = Field(
        ..., description="Link to source Delivery line or AR Invoice line"
    )


class ReturnRequestLineResponse(BaseModel):
    """
    Full Return Request line as returned by the API.

    Attributes:
        line_id:         UUID of this line.
        line_number:     1-indexed position.
        item_id:         FK to items.
        item_code:       Denormalised item code.
        item_name:       Denormalised item name.
        description:     Printable description.
        requested_qty:   Qty requested for return.
        uom:             Unit of measure.
        unit_price:      Snapshotted price.
        discount_percent: Discount %.
        line_net:        Computed net amount.
        tax_code_id:     FK to tax codes.
        tax_percent:     Snapshotted tax rate.
        line_tax:        Computed tax amount.
        line_gross:      line_net + line_tax.
        warehouse_id:    Expected return warehouse.
        cost_center_id:  Cost centre.
        base_doc_ref:    Source Delivery/Invoice line ref.
        target_doc_refs: Filled when Return lines are created from this RR line.
        ordered_qty:     Same as requested_qty (for consistency).
        consumed_qty:    How much of requested_qty has been consumed by Returns.
    """

    model_config = _RESPONSE_CONFIG

    line_id: str
    line_number: int
    item_id: str
    item_code: str
    item_name: str
    description: str
    requested_qty: Decimal
    uom: str
    unit_price: Decimal
    discount_percent: Decimal
    line_net: Decimal
    tax_code_id: Optional[str]
    tax_percent: Decimal
    line_tax: Decimal
    line_gross: Decimal
    warehouse_id: Optional[str]
    cost_center_id: Optional[str]
    base_doc_ref: Optional[DocumentLinkRef]
    target_doc_refs: List[DocumentLinkRef]
    ordered_qty: Decimal
    consumed_qty: Decimal


# ---------------------------------------------------------------------------
# Header schemas
# ---------------------------------------------------------------------------


class ReturnRequestTotals(BaseModel):
    """Totals sub-document for a Return Request."""

    model_config = _RESPONSE_CONFIG

    net: Decimal
    tax: Decimal
    gross: Decimal


class ReturnRequestCreate(BaseModel):
    """
    Input payload for creating a Return Request.

    At least one line is required. base_doc_ref at the header level MUST
    point to the source Delivery (or AR Invoice for direct-invoice flows).

    Attributes:
        company_code:      Finance company code (e.g. "1000").
        customer_id:       FK to customer.
        customer_name:     Denormalised customer name.
        doc_date:          Document date.
        valid_until_date:  RMA validity date (>= doc_date).
        reason:            Return reason code.
        reason_text:       Free-text expansion of reason.
        base_doc_ref:      REQUIRED — source Delivery (or AR Invoice) header ref.
        lines:             At least one line required.
        notes:             Free-text notes.
    """

    company_code: Optional[str] = Field(None, max_length=20, description="Finance company code — auto-resolved by API layer if omitted")
    customer_id: str = Field(..., description="FK to customer")
    customer_name: str = Field(..., max_length=200)
    doc_date: date
    valid_until_date: date
    reason: ReturnReason
    reason_text: Optional[str] = Field(None, max_length=500)
    base_doc_ref: DocumentLinkRef = Field(
        ..., description="Source Delivery header ref (or AR Invoice for direct flows)"
    )
    lines: List[ReturnRequestLineCreate] = Field(..., min_length=1)
    notes: Optional[str] = Field(None, max_length=1000)

    @model_validator(mode="after")
    def _valid_until_not_before_doc_date(self) -> "ReturnRequestCreate":
        """
        Ensure valid_until_date >= doc_date.

        Raises:
            ValueError: If valid_until_date is before doc_date.
        """
        if self.valid_until_date < self.doc_date:
            raise ValueError(
                "valid_until_date must be >= doc_date"
            )
        return self


class ReturnRequestUpdate(BaseModel):
    """
    Partial update for a DRAFT Return Request.

    All fields are optional. If lines are provided, the entire line set
    is replaced wholesale. Only allowed in DRAFT status.
    """

    doc_date: Optional[date] = None
    valid_until_date: Optional[date] = None
    reason: Optional[ReturnReason] = None
    reason_text: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=1000)
    lines: Optional[List[ReturnRequestLineCreate]] = None


class ReturnRequestStatusTransitionRequest(BaseModel):
    """
    Transition request for Return Request status changes.

    Attributes:
        new_status: Target status.
        reason:     Optional cancellation or close reason.
    """

    new_status: DocumentStatus
    reason: Optional[str] = Field(None, max_length=500)


class ReturnRequestResponse(BaseModel):
    """
    Full Return Request as returned by the API.
    """

    model_config = _RESPONSE_CONFIG

    doc_entry: str
    doc_number: str
    doc_type: str
    organization_id: str
    company_code: str
    customer_id: str
    customer_name: str
    doc_date: date
    valid_until_date: date
    reason: str
    reason_text: Optional[str]
    status: DocumentStatus
    totals: ReturnRequestTotals
    base_doc_ref: Optional[DocumentLinkRef]
    target_doc_refs: List[DocumentLinkRef]
    notes: Optional[str]
    lines: List[ReturnRequestLineResponse]
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str


class ReturnRequestListItem(BaseModel):
    """
    Slim Return Request row for paginated list views.
    """

    model_config = _RESPONSE_CONFIG

    doc_entry: str
    doc_number: str
    organization_id: str
    customer_id: str
    customer_name: str
    doc_date: date
    valid_until_date: date
    reason: str
    status: DocumentStatus
    totals: ReturnRequestTotals
    base_doc_ref: Optional[DocumentLinkRef]
    created_at: datetime
    updated_at: datetime
