"""
Sales Module — Sales Order (SO) Pydantic Schemas

Covers the full lifecycle of a confirmed customer commitment:

    DRAFT → OPEN → PARTLY_CLOSED → CLOSED
                → CANCELLED  (from DRAFT or OPEN or PARTLY_CLOSED)

This module owns the serialisation contract between the API layer and the
service layer.  All monetary values are stored as Decimal in MongoDB and
round-tripped here as strings (to avoid IEEE-754 rounding in JSON transport).

The shape mirrors SAP B1 ORDR (header) + RDR1 (lines), extended with the
quote-to-cash linking infrastructure from T-100.1.

Design choices
--------------
- Line totals are COMPUTED by the service layer, not by the client.
  The client submits quantity, unit_price, and discount_percent; the service
  fills line_net, line_tax, and line_gross.
- Per-line quantity tracking (ordered_qty, delivered_qty, invoiced_qty,
  cancelled_qty, committed_qty) is owned by the service layer.  The client
  cannot set these directly on creation — they are managed by downstream
  documents (Delivery, AR Invoice) and status transitions.
- ``committed_qty`` is a placeholder for ops-side inventory reservation.
  It is set to ordered_qty on DRAFT → OPEN and cleared on CANCELLED.
  Full inventory integration is deferred to a future task.
- ``credit_check`` is captured on DRAFT → OPEN transition and stored
  immutably on the header for audit.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

# Response models emit camelCase fields via the to_camel alias generator;
# routes pair this with response_model_by_alias=True. populate_by_name=True
# means consumers may still post snake_case input bodies.
_RESPONSE_CONFIG = ConfigDict(
    populate_by_name=True,
    alias_generator=to_camel,
    from_attributes=True,
)

from src.core.documents.document_links import DocumentLinkRef, DocumentLineLinkMixin
from src.core.documents.document_status import DocumentStatus
from src.core.documents.bp_ref import BPReferenceMixin
from src.core.documents.journal_memo import JournalMemoMixin

# ---------------------------------------------------------------------------
# Line schemas
# ---------------------------------------------------------------------------


class SalesOrderLineCreate(BaseModel):
    """
    Input payload for a single Sales Order line.

    The service computes line_net, line_tax, and line_gross from these inputs.
    Quantity-tracking fields (delivered_qty, invoiced_qty, etc.) are ignored
    on create — they are managed by the service layer.

    Attributes:
        item_id:          FK to items collection.
        item_code:        Denormalised for display; snapshot taken at create time.
        item_name:        Denormalised for display; snapshot taken at create time.
        description:      Printable description, defaults to item_name.
        quantity:         Must be > 0.  Becomes ordered_qty on the SO line.
        uom:              Unit of measure string (pcs, kg, etc.).
        unit_price:       Must be >= 0.
        discount_percent: 0–100 inclusive.
        tax_code_id:      FK to tax codes collection (optional).
        tax_percent:      Snapshotted from tax code at line-create time.
        warehouse_id:     Used to populate committed_qty target on OPEN transition.
        cost_center_id:   Optional cost centre allocation.
        notes:            Per-line free text.
    """

    model_config = ConfigDict(populate_by_name=True)

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
        description="Warehouse for committed_qty reservation (placeholder for ops integration)",
    )
    cost_center_id: Optional[str] = Field(None, description="Cost centre allocation")
    notes: Optional[str] = Field(None, max_length=500, description="Per-line notes")


class SalesOrderLineUpdate(BaseModel):
    """
    Partial update for a Sales Order line (all fields optional).

    Only allowed when the SO header is in DRAFT status.
    The service recomputes all totals after applying the update.
    """

    model_config = ConfigDict(populate_by_name=True)

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


class SalesOrderLineResponse(DocumentLineLinkMixin):
    model_config = _RESPONSE_CONFIG

    """
    Full representation of a Sales Order line as returned by the API.

    Computed totals (line_net, line_tax, line_gross) are authoritative
    values produced by the service layer.

    Per-line quantity tracking fields are the downstream state:
    - ordered_qty:   Set at creation; immutable after that.
    - consumed_qty:  Quantity this SO line consumed from a source Quote line
                     (upstream direction — not the downstream delivery qty).
    - delivered_qty: Filled by Delivery document (T-100.8).
    - invoiced_qty:  Filled by AR Invoice (T-100.9).
    - cancelled_qty: Set on line-level cancellation.
    - committed_qty: = ordered_qty when SO is OPEN (inventory placeholder).
                     = 0 when DRAFT or CANCELLED.

    open_qty = ordered_qty - delivered_qty - cancelled_qty (computed downstream).
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
    # Quantity tracking
    ordered_qty: Decimal = Field(..., description="= quantity at creation, immutable")
    consumed_qty: Decimal = Field(
        Decimal("0"),
        description="Qty consumed from upstream Quote line (set at SO creation from Quote)",
    )
    delivered_qty: Decimal = Field(
        Decimal("0"),
        description="Cumulative qty shipped on Delivery documents (T-100.8)",
    )
    invoiced_qty: Decimal = Field(
        Decimal("0"),
        description="Cumulative qty invoiced on AR Invoice documents (T-100.9)",
    )
    cancelled_qty: Decimal = Field(
        Decimal("0"),
        description="Qty cancelled on this line",
    )
    committed_qty: Decimal = Field(
        Decimal("0"),
        description="Inventory reservation placeholder (= ordered_qty when OPEN, 0 otherwise)",
    )
    notes: Optional[str]


# ---------------------------------------------------------------------------
# Credit check snapshot (embedded in SO header on OPEN transition)
# ---------------------------------------------------------------------------


class CreditCheckSnapshot(BaseModel):
    """
    Immutable snapshot of the credit-limit check performed at DRAFT → OPEN.

    Stored on the SO header as ``credit_check``.  Never updated after the
    transition; a new SO requires a new check.

    Attributes:
        checked_at:              UTC timestamp when the check ran.
        customer_credit_limit:   creditLimit from customer_finance_ext (finance service).
                                 None if not configured (→ 'approved' unconditionally).
        outstanding_ar:          Placeholder zero; real value from T-100.9 AR ledger.
        this_order_total:        SO header gross total at the moment of check.
        result:                  'approved' | 'blocked' | 'override'.
        override_by_user_id:     Set when a finance_admin / super_admin overrides a block.
        override_reason:         Required string when result == 'override'.
    """

    model_config = _RESPONSE_CONFIG

    checked_at: datetime
    customer_credit_limit: Optional[Decimal] = Field(
        None,
        description="Snapshot of creditLimit from customer_finance_ext (None = unconfigured)",
    )
    outstanding_ar: Decimal = Field(
        Decimal("0"),
        description="Placeholder: zero until T-100.9 AR Invoice handler is built",
    )
    this_order_total: Decimal
    result: str = Field(..., description="'approved' | 'blocked' | 'override'")
    override_by_user_id: Optional[str] = Field(
        None, description="User who authorised the credit override"
    )
    override_reason: Optional[str] = Field(
        None, description="Reason recorded when result == 'override'"
    )


# ---------------------------------------------------------------------------
# Header totals schema (embedded in response)
# ---------------------------------------------------------------------------


class SalesOrderTotals(BaseModel):
    """
    Aggregated document totals computed by the service layer.

    Always derived from the line collection — never edited directly.

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


class SalesOrderCreate(BPReferenceMixin, JournalMemoMixin):
    model_config = ConfigDict(populate_by_name=True)

    """
    Input payload for creating a new Sales Order from scratch.

    The service fills: doc_entry, doc_number, status, totals, committed_qty
    on lines, created_at, updated_at.

    Validation rules (enforced by model_validator):
    - delivery_date >= doc_date (when supplied)
    - lines must contain at least one item

    Inherits BPReferenceMixin: adds optional ``bp_ref_no`` (customer PO no).
    Inherits JournalMemoMixin: adds optional ``journal_memo`` (future JE use).
    """

    organization_id: str = Field(..., description="Owning organisation UUID")
    company_code: str = Field(
        ...,
        max_length=20,
        description="Finance company code for doc_number scoping (e.g. 'A001')",
    )
    customer_id: str = Field(..., description="FK to CRM customers collection")
    customer_name: str = Field(
        ...,
        max_length=200,
        description="Denormalised — snapshot at create time; use customer_id for canonical",
    )
    doc_date: date = Field(..., description="Order date")
    delivery_date: Optional[date] = Field(
        None, description="Requested delivery date (>= doc_date when supplied)"
    )
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
    lines: List[SalesOrderLineCreate] = Field(
        ..., min_length=1, description="Sales Order lines (at least one required)"
    )

    @model_validator(mode="after")
    def validate_dates_and_lines(self) -> "SalesOrderCreate":
        """
        Enforce cross-field constraints.

        Raises:
            ValueError: If delivery_date < doc_date.
            ValueError: If lines list is empty.
        """
        if (
            self.delivery_date is not None
            and self.delivery_date < self.doc_date
        ):
            raise ValueError(
                f"delivery_date ({self.delivery_date}) must be >= "
                f"doc_date ({self.doc_date})"
            )
        if not self.lines:
            raise ValueError("A Sales Order must have at least one line.")
        return self


class SalesOrderUpdate(BaseModel):
    """
    Partial update payload for a DRAFT Sales Order.

    Lines, if provided, REPLACE the existing line set wholesale (SAP B1 pattern).
    The service recomputes all totals after applying the update.

    Only allowed in DRAFT status — the service raises ValueError otherwise.
    """

    model_config = ConfigDict(populate_by_name=True)

    customer_id: Optional[str] = None
    customer_name: Optional[str] = Field(None, max_length=200)
    doc_date: Optional[date] = None
    delivery_date: Optional[date] = None
    currency: Optional[str] = Field(None, max_length=3)
    exchange_rate: Optional[Decimal] = Field(None, ge=Decimal("0"))
    payment_terms_id: Optional[str] = None
    sales_employee_id: Optional[str] = None
    bp_ref_no: Optional[str] = Field(None, max_length=100)
    journal_memo: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=2000)
    lines: Optional[List[SalesOrderLineCreate]] = Field(
        None,
        description="If provided, replaces the existing line set wholesale",
    )

    @model_validator(mode="after")
    def validate_date_order(self) -> "SalesOrderUpdate":
        """
        When both dates are provided together, validate ordering.

        Raises:
            ValueError: If delivery_date < doc_date (when both supplied).
        """
        if (
            self.doc_date is not None
            and self.delivery_date is not None
            and self.delivery_date < self.doc_date
        ):
            raise ValueError(
                "delivery_date must be >= doc_date when both are provided"
            )
        if self.lines is not None and len(self.lines) == 0:
            raise ValueError("Lines list cannot be empty when provided in an update.")
        return self


class SalesOrderResponse(BPReferenceMixin, JournalMemoMixin):
    """
    Full representation of a Sales Order header returned by the API.

    ``lines`` is always included for single-document GET endpoints.
    For list endpoints the service omits ``lines`` and returns a slimmer
    ``SalesOrderListItem`` instead (avoid N+1 and large payloads).
    """

    model_config = _RESPONSE_CONFIG

    doc_entry: str = Field(..., description="UUID — stable cross-service reference")
    doc_number: str = Field(..., description="Human-readable e.g. 'SO-2026-0001'")
    doc_type: str = Field("SO", description="Constant — always 'SO'")
    organization_id: str
    company_code: str
    customer_id: str
    customer_name: str
    doc_date: date
    delivery_date: Optional[date]
    status: DocumentStatus
    currency: str
    exchange_rate: Decimal
    payment_terms_id: Optional[str]
    sales_employee_id: Optional[str]
    owner_user_id: str
    notes: Optional[str]
    totals: SalesOrderTotals
    credit_check: Optional[CreditCheckSnapshot] = Field(
        None,
        description="Populated on DRAFT → OPEN transition with the credit-limit check result",
    )
    base_doc_ref: Optional[DocumentLinkRef] = Field(
        None,
        description="Set when this SO was created from a Quote",
    )
    target_doc_refs: List[DocumentLinkRef] = Field(
        default_factory=list,
        description="Populated when Delivery or AR Invoice is created from this SO",
    )
    lines: List[SalesOrderLineResponse] = Field(
        default_factory=list,
        description="Sales Order lines (always populated for single-doc GET)",
    )
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str


class SalesOrderListItem(BPReferenceMixin):
    """
    Slim view of a Sales Order for use in paginated list responses.

    Excludes the full lines array to keep list payloads lean.
    """

    model_config = _RESPONSE_CONFIG

    doc_entry: str
    doc_number: str
    organization_id: str
    customer_id: str
    customer_name: str
    doc_date: date
    delivery_date: Optional[date]
    status: DocumentStatus
    currency: str
    totals: SalesOrderTotals
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Status transition request
# ---------------------------------------------------------------------------


class SalesOrderStatusTransitionRequest(BaseModel):
    """
    Request body for the dedicated status-transition endpoint.

    On DRAFT → OPEN the service performs a credit-limit check against the
    finance microservice.  If the check fails ('blocked'), the transition is
    rejected with HTTP 409 unless ``override_credit_check`` is True AND the
    caller holds super_admin or finance_admin role AND a non-empty
    ``override_reason`` is supplied.

    Attributes:
        new_status:            The target status to transition to.
        reason:                Optional free-text reason (stored in audit log).
        override_credit_check: When True, attempt to override a 'blocked' result.
        override_reason:       Required when override_credit_check is True.
    """

    model_config = ConfigDict(populate_by_name=True)

    new_status: DocumentStatus = Field(..., description="Target status for the transition")
    reason: Optional[str] = Field(
        None,
        max_length=500,
        description="Optional reason for the transition (recorded in audit log)",
    )
    override_credit_check: bool = Field(
        False,
        description=(
            "When True (with finance_admin/super_admin role + override_reason), "
            "allows override of a blocked credit-limit check on DRAFT → OPEN"
        ),
    )
    override_reason: Optional[str] = Field(
        None,
        max_length=500,
        description="Required non-empty reason when override_credit_check=True",
    )


# ---------------------------------------------------------------------------
# Create-from-Quote request
# ---------------------------------------------------------------------------


class SalesOrderFromQuoteRequest(BaseModel):
    """
    Special DTO for creating a Sales Order from an existing Sales Quote.

    The service copies Quote header fields (customer, terms, currency, etc.)
    and all Quote lines into the new SO.  The caller does not provide line
    data directly — lines are sourced from the Quote.

    Overrides allowed:
    - ``delivery_date``: The SO's delivery date (not present on a Quote).
    - ``notes``:         Override or supplement the Quote's notes.
    - ``override_credit_check`` / ``override_reason``: For immediate OPEN
      transition if requested (not used during create-from-quote; the SO is
      always created in DRAFT — use the /transition endpoint to open it).

    Attributes:
        delivery_date:   Optional requested delivery date for the new SO.
        notes:           Optional notes override (falls back to Quote notes).
    """

    model_config = ConfigDict(populate_by_name=True)

    delivery_date: Optional[date] = Field(
        None, description="Requested delivery date for the new SO"
    )
    notes: Optional[str] = Field(
        None,
        max_length=2000,
        description="Notes for the SO (falls back to Quote notes when None)",
    )
