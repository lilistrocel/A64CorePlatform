"""
Sales Module — Sales Quote (SQ) Pydantic Schemas

Covers the full lifecycle of a non-posting offer to a customer:

    DRAFT → OPEN → CLOSED  (accepted → converted to SO)
                 → CANCELLED

This module owns the serialisation contract between the API layer and the
service layer.  All monetary values are stored as Decimal in MongoDB and
round-tripped here as strings (to avoid IEEE-754 rounding in JSON transport).

The shape mirrors SAP B1 OQUT (header) + QUT1 (lines) closely enough that
a future SAP import/export adapter would need only field-name mapping.

Design choices
--------------
- Line totals are COMPUTED by the service layer, not by the client.
  The client submits quantity, unit_price, and discount_percent; the service
  fills line_net, line_tax, and line_gross.  The client values in LineCreate
  are the inputs; the values in LineResponse are the authoritative computed
  outputs.
- The tolerance for total-mismatch validation is 0.01 AED (or base currency
  unit).  Values outside tolerance are rejected at creation time.
- valid_until_date must be >= doc_date (validated by model_validator).
- At least one line is required (validated by model_validator).
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

from src.core.documents.document_links import DocumentLinkRef, DocumentLineLinkMixin
from src.core.documents.document_status import DocumentStatus
from src.core.documents.bp_ref import BPReferenceMixin
from src.core.documents.journal_memo import JournalMemoMixin

# ---------------------------------------------------------------------------
# Response model configuration (Rule 2 — camelCase via alias_generator)
# ---------------------------------------------------------------------------
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

_LINE_TOLERANCE = Decimal("0.01")


class QuoteLineCreate(BaseModel):
    """
    Input payload for a single Sales Quote line.

    The service computes line_net, line_tax, and line_gross from these inputs.
    Providing computed values here is ignored — the service owns the numbers.

    Attributes:
        item_id:          FK to items collection (no cross-service integrity check).
        item_code:        Denormalised for display; snapshot taken at create time.
        item_name:        Denormalised for display; snapshot taken at create time.
        description:      Printable description, defaults to item_name.
        quantity:         Must be > 0.
        uom:              Unit of measure string (pcs, kg, etc.).
        unit_price:       Must be >= 0.
        discount_percent: 0–100 inclusive.
        tax_code_id:      FK to tax codes collection (optional).
        tax_percent:      Snapshotted from tax code at line-create time.
        warehouse_id:     Informational on a Quote — no inventory reservation.
        cost_center_id:   Optional cost centre allocation.
        notes:            Per-line free text.
    """

    item_id: str = Field(..., description="FK to items collection")
    item_code: str = Field(..., max_length=50, description="Denormalised item code")
    item_name: str = Field(..., max_length=200, description="Denormalised item name")
    description: Optional[str] = Field(
        None,
        max_length=500,
        description="Printable description; defaults to item_name when None",
    )
    quantity: Decimal = Field(..., gt=Decimal("0"), description="Must be > 0")
    uom: str = Field(..., max_length=20, description="Unit of measure (pcs, kg, etc.)")
    unit_price: Decimal = Field(
        ..., ge=Decimal("0"), description="Unit price; must be >= 0"
    )
    discount_percent: Decimal = Field(
        Decimal("0"),
        ge=Decimal("0"),
        le=Decimal("100"),
        description="Discount percentage 0–100",
    )
    tax_code_id: Optional[str] = Field(None, description="FK to tax codes collection")
    tax_percent: Decimal = Field(
        Decimal("0"),
        ge=Decimal("0"),
        le=Decimal("100"),
        description="Snapshotted tax rate at line-create time",
    )
    warehouse_id: Optional[str] = Field(
        None,
        description="Informational only — no inventory reservation on a Quote",
    )
    cost_center_id: Optional[str] = Field(None, description="Cost centre allocation")
    notes: Optional[str] = Field(None, max_length=500, description="Per-line notes")


class QuoteLineUpdate(BaseModel):
    """
    Partial update for a Quote line (all fields optional).

    Only allowed when the quote header is in DRAFT status.
    The service recomputes all totals after applying the update.
    """

    item_id: Optional[str] = None
    item_code: Optional[str] = Field(None, max_length=50)
    item_name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    quantity: Optional[Decimal] = Field(None, gt=Decimal("0"))
    uom: Optional[str] = Field(None, max_length=20)
    unit_price: Optional[Decimal] = Field(None, ge=Decimal("0"))
    discount_percent: Optional[Decimal] = Field(
        None, ge=Decimal("0"), le=Decimal("100")
    )
    tax_code_id: Optional[str] = None
    tax_percent: Optional[Decimal] = Field(None, ge=Decimal("0"), le=Decimal("100"))
    warehouse_id: Optional[str] = None
    cost_center_id: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=500)


class QuoteLineResponse(DocumentLineLinkMixin):
    model_config = _RESPONSE_CONFIG

    """
    Full representation of a Quote line as returned by the API.

    Computed totals (line_net, line_tax, line_gross) are authoritative
    values produced by the service layer.

    Inherits from DocumentLineLinkMixin, which adds:
        base_doc_ref:    Always None for Quote lines (quotes originate the chain).
        target_doc_refs: Populated when an SO line consumes this quote line.
    """

    line_id: str = Field(..., description="UUID for this line (stable cross-service ref)")
    line_number: int = Field(..., description="1-indexed position")
    item_id: str
    item_code: str
    item_name: str
    description: str
    quantity: Decimal
    uom: str
    unit_price: Decimal
    discount_percent: Decimal
    line_net: Decimal = Field(..., description="quantity × unit_price × (1 − discount/100)")
    tax_code_id: Optional[str]
    tax_percent: Decimal
    line_tax: Decimal = Field(..., description="line_net × tax_percent / 100")
    line_gross: Decimal = Field(..., description="line_net + line_tax")
    warehouse_id: Optional[str]
    cost_center_id: Optional[str]
    ordered_qty: Decimal = Field(..., description="= quantity, for LineQuantityState")
    consumed_qty: Decimal = Field(
        Decimal("0"),
        description="Incremented when an SO line draws from this quote line",
    )
    notes: Optional[str]


# ---------------------------------------------------------------------------
# Header totals schema (embedded in response)
# ---------------------------------------------------------------------------


class QuoteTotals(BaseModel):
    """
    Aggregated document totals computed by the service layer.

    These are always derived from the line collection — never edited directly.

    Attributes:
        net:   Sum of all line_net values.
        tax:   Sum of all line_tax values.
        gross: net + tax.
    """

    model_config = _RESPONSE_CONFIG

    net: Decimal = Field(..., description="Sum of line_net across all lines")
    tax: Decimal = Field(..., description="Sum of line_tax across all lines")
    gross: Decimal = Field(..., description="net + tax")


# ---------------------------------------------------------------------------
# Header schemas
# ---------------------------------------------------------------------------


class QuoteCreate(BPReferenceMixin, JournalMemoMixin):
    """
    Input payload for creating a new Sales Quote.

    The service fills: doc_entry, doc_number, status, totals, created_at,
    updated_at.  All other fields must be supplied by the caller.

    Validation rules (enforced by model_validator):
    - valid_until_date >= doc_date
    - lines must contain at least one item

    Inherits BPReferenceMixin: adds optional ``bp_ref_no`` (customer RFQ no).
    Inherits JournalMemoMixin: adds optional ``journal_memo`` (future JE use).
    """

    organization_id: str = Field(..., description="Owning organisation UUID")
    company_code: Optional[str] = Field(
        None,
        max_length=20,
        description="Finance company code — auto-resolved by API layer if omitted",
    )
    customer_id: str = Field(..., description="FK to CRM customers collection")
    customer_name: str = Field(
        ...,
        max_length=200,
        description="Denormalised — may drift if customer renamed; use customer_id for canonical",
    )
    doc_date: date = Field(..., description="Quote date")
    valid_until_date: date = Field(..., description="Quote expiry date (inclusive)")
    currency: str = Field("AED", max_length=3, description="ISO 4217 currency code")
    exchange_rate: Decimal = Field(
        Decimal("1.0"),
        ge=Decimal("0"),
        description="Exchange rate to base currency (1.0 for AED)",
    )
    payment_terms_id: Optional[str] = Field(
        None, description="FK to payment terms collection"
    )
    sales_employee_id: Optional[str] = Field(
        None, description="FK to ops users; the assigned sales rep"
    )
    notes: Optional[str] = Field(None, max_length=2000, description="Free-text header notes")
    lines: List[QuoteLineCreate] = Field(
        ..., min_length=1, description="Quote lines (at least one required)"
    )

    @model_validator(mode="after")
    def validate_dates_and_lines(self) -> "QuoteCreate":
        """
        Enforce cross-field constraints.

        Raises:
            ValueError: If valid_until_date < doc_date.
            ValueError: If lines list is empty (belt-and-suspenders; Field min_length=1 also guards).
        """
        if self.valid_until_date < self.doc_date:
            raise ValueError(
                f"valid_until_date ({self.valid_until_date}) must be >= "
                f"doc_date ({self.doc_date})"
            )
        if not self.lines:
            raise ValueError("A Sales Quote must have at least one line.")
        return self


class QuoteUpdate(BaseModel):
    """
    Partial update payload for a DRAFT Sales Quote.

    Only header fields that make sense to change after creation are included.
    Lines, if provided, REPLACE the existing line set wholesale (SAP B1 pattern).
    The service recomputes all totals after applying the update.

    Only allowed in DRAFT status — the service raises ValueError otherwise.
    """

    customer_id: Optional[str] = None
    customer_name: Optional[str] = Field(None, max_length=200)
    doc_date: Optional[date] = None
    valid_until_date: Optional[date] = None
    currency: Optional[str] = Field(None, max_length=3)
    exchange_rate: Optional[Decimal] = Field(None, ge=Decimal("0"))
    payment_terms_id: Optional[str] = None
    sales_employee_id: Optional[str] = None
    bp_ref_no: Optional[str] = Field(None, max_length=100)
    journal_memo: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=2000)
    lines: Optional[List[QuoteLineCreate]] = Field(
        None,
        description="If provided, replaces the existing line set wholesale",
    )

    @model_validator(mode="after")
    def validate_date_order(self) -> "QuoteUpdate":
        """
        When both dates are provided together, validate ordering.

        Raises:
            ValueError: If valid_until_date < doc_date (when both supplied).
        """
        if (
            self.doc_date is not None
            and self.valid_until_date is not None
            and self.valid_until_date < self.doc_date
        ):
            raise ValueError(
                "valid_until_date must be >= doc_date when both are provided"
            )
        if self.lines is not None and len(self.lines) == 0:
            raise ValueError("Lines list cannot be empty when provided in an update.")
        return self


class QuoteResponse(BPReferenceMixin, JournalMemoMixin):
    """
    Full representation of a Sales Quote header returned by the API.

    ``lines`` is always included for single-document GET endpoints.
    For list endpoints the service omits ``lines`` and returns a slimmer
    ``QuoteListItem`` instead (avoid N+1 and large payloads).

    Inherits BPReferenceMixin: exposes bp_ref_no.
    Inherits JournalMemoMixin: exposes journal_memo.
    """

    model_config = _RESPONSE_CONFIG

    doc_entry: str = Field(..., description="UUID — stable cross-service reference")
    doc_number: str = Field(..., description="Human-readable e.g. 'SQ-2026-0001'")
    doc_type: str = Field("SQ", description="Constant — always 'SQ'")
    organization_id: str
    company_code: str
    customer_id: str
    customer_name: str
    doc_date: date
    valid_until_date: date
    status: DocumentStatus
    currency: str
    exchange_rate: Decimal
    payment_terms_id: Optional[str]
    sales_employee_id: Optional[str]
    owner_user_id: str
    notes: Optional[str]
    totals: QuoteTotals
    base_doc_ref: Optional[DocumentLinkRef] = Field(
        None,
        description="Set when this Quote was created from a Blanket Agreement (future)",
    )
    target_doc_refs: List[DocumentLinkRef] = Field(
        default_factory=list,
        description="Populated when a Sales Order is created from this Quote",
    )
    lines: List[QuoteLineResponse] = Field(
        default_factory=list,
        description="Quote lines (always populated for single-doc GET)",
    )
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str


class QuoteListItem(BPReferenceMixin):
    """
    Slim view of a Sales Quote for use in paginated list responses.

    Excludes the full lines array to keep list payloads lean.
    """

    model_config = _RESPONSE_CONFIG

    doc_entry: str
    doc_number: str
    organization_id: str
    customer_id: str
    customer_name: str
    doc_date: date
    valid_until_date: date
    status: DocumentStatus
    currency: str
    totals: QuoteTotals
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Status transition request
# ---------------------------------------------------------------------------


class QuoteStatusTransitionRequest(BaseModel):
    """
    Request body for the dedicated status-transition endpoint.

    The transition is validated against LEGAL_TRANSITIONS["QUOTE"] by the
    service layer using ``assert_legal_transition``.

    Attributes:
        new_status: The target status to transition to.
        reason:     Optional free-text reason (stored in audit log).
    """

    new_status: DocumentStatus = Field(..., description="Target status for the transition")
    reason: Optional[str] = Field(
        None,
        max_length=500,
        description="Optional reason for the transition (recorded in audit log)",
    )
