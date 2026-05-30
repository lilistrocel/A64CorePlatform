"""
Sales Module — AR Invoice Pydantic Schemas (T-100.9a)

Covers the lifecycle of an Accounts Receivable Invoice in the quote-to-cash chain:

    DRAFT → OPEN (→ PARTLY_PAID → CLOSED) | CANCELLED
         → PENDING_APPROVAL (optional approval gate; present in LEGAL_TRANSITIONS)

The AR Invoice is the revenue-recognition document. On DRAFT → OPEN the
`sales_invoice_posted` event is emitted to the outbox; the finance microservice
(T-100.9b) then posts:

    DR Accounts Receivable (AR control account)
    CR Revenue (per line, from revenue_account_id)
    CR Output VAT (per line, from tax_code)

Two creation flows are supported:
    1. Direct invoice — caller provides all header + line data; no upstream Delivery.
    2. From-Delivery  — caller references a Posted (OPEN) Delivery; header defaults
       are inherited and Delivery line `invoiced_qty` counters are incremented.

UAE VAT tax-point rule
----------------------
tax_date = min(date_of_supply, invoice_date)

This is computed server-side at create time; the client must NOT supply tax_date.
`date_of_supply` must be supplied by the caller (for direct invoices) or is
inherited from the Delivery's `actual_delivery_date` (for from-Delivery creates).

Collection name: ar_invoices_v2
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from src.core.documents.document_links import DocumentLinkRef, DocumentLineLinkMixin
from src.core.documents.document_status import DocumentStatus


# ---------------------------------------------------------------------------
# Line schemas
# ---------------------------------------------------------------------------


class ARInvoiceLineCreate(BaseModel):
    """
    Input payload for a single AR Invoice line (direct-invoice flow).

    The service fills: line_id, line_number, tax_percent (from tax code),
    line_net, line_tax, line_gross, revenue_account_id (from sale_item_finance_ext),
    invoiced_qty, credited_qty, cancelled_qty.

    Accepts both snake_case and camelCase field names for API consistency
    with the rest of the sales module.  populate_by_name=True means both
    ``item_id`` and ``itemId`` are accepted by the parser.

    Attributes:
        item_id:           FK to items collection.
        item_code:         Denormalised item code (snapshot).
        item_name:         Denormalised item name (snapshot).
        description:       Printable line description; defaults to item_name.
        quantity:          Invoiced quantity (must be > 0).
        uom:               Unit of measure.
        unit_price:        Selling price per unit (must be >= 0).
        discount_percent:  Line discount (0–100).
        tax_code_id:       Optional FK to tax_codes; if null, line is tax-exempt.
        warehouse_id:      Optional warehouse reference (for traceability).
        cost_center_id:    Optional cost-centre for revenue allocation.
        base_doc_ref:      Upstream Delivery line ref (null for direct invoice lines).
    """

    model_config = ConfigDict(populate_by_name=True)

    item_id: str = Field(..., alias="itemId", description="FK to items collection")
    item_code: str = Field(..., alias="itemCode", max_length=50, description="Denormalised item code")
    item_name: str = Field(..., alias="itemName", max_length=200, description="Denormalised item name")
    description: Optional[str] = Field(None, max_length=500)
    quantity: Decimal = Field(..., gt=Decimal("0"), description="Invoiced quantity; must be > 0")
    uom: str = Field(..., max_length=20, description="Unit of measure")
    unit_price: Decimal = Field(..., alias="unitPrice", ge=Decimal("0"), description="Unit selling price; must be >= 0")
    discount_percent: Decimal = Field(
        Decimal("0"),
        alias="discountPercent",
        ge=Decimal("0"),
        le=Decimal("100"),
        description="Line discount 0–100",
    )
    tax_code_id: Optional[str] = Field(None, alias="taxCodeId", description="FK to tax_codes; null = tax-exempt")
    warehouse_id: Optional[str] = Field(None, alias="warehouseId", description="Warehouse for traceability")
    cost_center_id: Optional[str] = Field(None, alias="costCenterId", description="Cost-centre for revenue allocation")
    base_doc_ref: Optional[DocumentLinkRef] = Field(
        None, alias="baseDocRef", description="Upstream Delivery line ref (null for direct invoice lines)"
    )


class ARInvoiceLineResponse(DocumentLineLinkMixin):
    """
    Full representation of an AR Invoice line as returned by the API.

    revenue_account_id is snapshotted at create time from sale_item_finance_ext
    so changes to the ext table do not retroactively affect posted invoices.

    Attributes:
        line_id:             UUID for this AR Invoice line.
        line_number:         1-indexed position within this invoice.
        item_id:             FK to items.
        item_code:           Denormalised.
        item_name:           Denormalised.
        description:         Printable description.
        quantity:            Invoiced quantity.
        uom:                 Unit of measure.
        unit_price:          Selling price per unit.
        discount_percent:    Line discount.
        line_net:            quantity * unit_price * (1 - discount_percent/100).
        tax_code_id:         FK to tax_codes or null.
        tax_percent:         Snapshotted from tax code at create time.
        line_tax:            line_net * tax_percent / 100.
        line_gross:          line_net + line_tax.
        revenue_account_id:  GL account for revenue CR (snapshotted at create).
        warehouse_id:        Optional warehouse reference.
        cost_center_id:      Optional cost-centre.
        invoiced_qty:        = quantity at create (immutable).
        credited_qty:        Filled by Credit Note (T-100.11); starts at 0.
        cancelled_qty:       0 normally; set if line is cancelled.
    """

    line_id: str = Field(..., description="UUID for this AR Invoice line")
    line_number: int = Field(..., description="1-indexed position")
    item_id: str
    item_code: str
    item_name: str
    description: str
    quantity: Decimal
    uom: str
    unit_price: Decimal
    discount_percent: Decimal
    line_net: Decimal = Field(..., description="quantity * unit_price * (1 - discount/100)")
    tax_code_id: Optional[str]
    tax_percent: Decimal = Field(..., description="Snapshotted from tax code at create time")
    line_tax: Decimal = Field(..., description="line_net * tax_percent / 100")
    line_gross: Decimal = Field(..., description="line_net + line_tax")
    revenue_account_id: str = Field(
        ..., description="GL account for revenue CR — snapshotted at create"
    )
    warehouse_id: Optional[str]
    cost_center_id: Optional[str]
    # Quantity tracking
    invoiced_qty: Decimal = Field(..., description="= quantity at create, immutable")
    credited_qty: Decimal = Field(Decimal("0"), description="Filled by Credit Note")
    cancelled_qty: Decimal = Field(Decimal("0"), description="Set on line-level cancellation")


# ---------------------------------------------------------------------------
# Header schemas
# ---------------------------------------------------------------------------


class ARInvoiceCreate(BaseModel):
    """
    Input payload for creating an AR Invoice without a Delivery base (direct invoice).

    The caller supplies all header + line fields.  Each line must reference a
    valid item with a configured `sale_item_finance_ext.revenueAccountId` — the
    service will fail-fast if this is missing.

    The service computes:
        tax_date = min(date_of_supply, invoice_date)
        due_date = doc_date + payment_terms_days (fallback 30)
        per-line: line_net, tax_percent, line_tax, line_gross, revenue_account_id
        totals: net, tax, gross

    Accepts both snake_case and camelCase field names for API consistency
    with the rest of the sales module.  populate_by_name=True means both
    ``organization_id`` and ``organizationId`` are accepted by the parser.

    organization_id is OPTIONAL here — the canonical value always comes from
    the query string (resolved by the route handler via _resolve_org_id).
    If provided in the body it is accepted but ignored in favour of the query-
    string value.  This eliminates the Bug #3 requirement to send org_id twice.

    Attributes:
        organization_id:   Owning organisation UUID (optional; derived from query param).
        company_code:      Finance company code for doc_number scoping.
        customer_id:       FK to customers collection.
        customer_name:     Denormalised customer name (snapshot).
        bp_ref_no:         Customer's own PO / reference number (B2B matching).
        doc_date:          Accounting posting date.
        date_of_supply:    When goods/services were supplied (UAE VAT Art. 25).
        invoice_date:      Date printed on the invoice (usually = doc_date).
        payment_terms_id:  Optional FK to payment_terms (for due_date calculation).
        currency:          Default AED.
        exchange_rate:     Default 1.0.
        journal_memo:      Optional memo printed on the GL journal entry.
        notes:             Free-text header notes.
        lines:             Invoice lines (at least one required).
    """

    model_config = ConfigDict(populate_by_name=True)

    # Reason: organization_id is optional in the body — the authoritative value
    # comes from the query string.  Both snake_case and camelCase are accepted.
    organization_id: Optional[str] = Field(
        None, alias="organizationId", description="Owning organisation UUID (also accepted from query param)"
    )
    company_code: str = Field(..., alias="companyCode", max_length=20, description="Finance company code")
    customer_id: str = Field(..., alias="customerId", description="FK to customers collection")
    customer_name: str = Field(..., alias="customerName", max_length=200, description="Denormalised customer name")
    bp_ref_no: Optional[str] = Field(
        None, alias="bpRefNo", max_length=100, description="Customer's own reference / PO number"
    )
    doc_date: date = Field(..., alias="docDate", description="Accounting posting date")
    date_of_supply: date = Field(
        ..., alias="dateOfSupply", description="When goods/services were supplied (UAE VAT Art. 25)"
    )
    invoice_date: date = Field(
        ..., alias="invoiceDate", description="Date printed on the invoice (usually = doc_date)"
    )
    payment_terms_id: Optional[str] = Field(None, alias="paymentTermsId", description="FK to payment_terms")
    currency: str = Field("AED", max_length=3, description="ISO 4217 currency code")
    exchange_rate: Decimal = Field(Decimal("1.0"), alias="exchangeRate", gt=Decimal("0"), description="FX rate to base")
    journal_memo: Optional[str] = Field(None, alias="journalMemo", max_length=500, description="GL journal memo")
    notes: Optional[str] = Field(None, max_length=2000, description="Free-text notes")
    lines: List[ARInvoiceLineCreate] = Field(
        ..., min_length=1, description="Invoice lines (at least one required)"
    )

    @field_validator("date_of_supply")
    @classmethod
    def validate_date_of_supply(cls, v: date, info: Any) -> date:
        """
        Sanity-check: date_of_supply must not be more than 30 days after doc_date.

        UAE VAT allows back-dating of supply dates (e.g. partial deliveries billed
        later) but a future supply date more than 30 days ahead of the accounting
        date likely indicates a data-entry error.  This is a soft guard — adjust
        if the business requires a wider window.

        Args:
            v:    date_of_supply value.
            info: Pydantic validation context (contains doc_date).

        Returns:
            Validated date.

        Raises:
            ValueError: If date_of_supply > doc_date + 30 days.
        """
        from datetime import timedelta

        doc_date = (info.data or {}).get("doc_date")
        if doc_date is not None and v > doc_date + timedelta(days=30):
            raise ValueError(
                f"date_of_supply ({v}) is more than 30 days after doc_date ({doc_date}). "
                "This may indicate a data-entry error. "
                "Contact support if a wider window is required."
            )
        return v


# Resolve the forward reference for ARInvoiceCreate validator
from typing import Any  # noqa: E402 — placed after the class to avoid circular import noise


class ARInvoiceFromDeliveryRequest(BaseModel):
    """
    DTO for creating an AR Invoice from a Posted Delivery Note.

    The service inherits customer, warehouse, and date defaults from the Delivery.
    The caller supplies the lines to invoice (referencing Delivery line IDs and
    quantities) plus any header overrides (bp_ref_no, payment_terms, etc.).

    Each line in `lines` must reference a valid Delivery line and the requested
    quantity must not exceed (ordered_qty - invoiced_qty - credited_qty).

    Accepts both snake_case and camelCase field names for API consistency.

    Attributes:
        company_code:      Finance company code.
        bp_ref_no:         Customer's PO number (if different from Delivery).
        doc_date:          Accounting date (defaults to today if not supplied).
        invoice_date:      Date printed on invoice (defaults to doc_date).
        date_of_supply:    UAE VAT supply date (defaults to Delivery.actual_delivery_date).
        payment_terms_id:  Optional FK to payment_terms.
        currency:          Override currency (inherits from Delivery if omitted).
        exchange_rate:     Override FX rate.
        journal_memo:      Optional GL memo.
        notes:             Free-text notes.
        lines:             Lines specifying which Delivery lines to invoice and at what price.
    """

    model_config = ConfigDict(populate_by_name=True)

    company_code: str = Field(..., alias="companyCode", max_length=20, description="Finance company code")
    bp_ref_no: Optional[str] = Field(None, alias="bpRefNo", max_length=100)
    doc_date: date = Field(..., alias="docDate", description="Accounting date")
    invoice_date: date = Field(..., alias="invoiceDate", description="Date printed on the invoice")
    date_of_supply: Optional[date] = Field(
        None,
        alias="dateOfSupply",
        description="Override supply date; defaults to Delivery actual_delivery_date",
    )
    payment_terms_id: Optional[str] = Field(None, alias="paymentTermsId")
    currency: str = Field("AED", max_length=3)
    exchange_rate: Decimal = Field(Decimal("1.0"), alias="exchangeRate", gt=Decimal("0"))
    journal_memo: Optional[str] = Field(None, alias="journalMemo", max_length=500)
    notes: Optional[str] = Field(None, max_length=2000)
    lines: List[ARInvoiceFromDeliveryLineRequest] = Field(
        ..., min_length=1, description="Lines referencing Delivery lines (at least one required)"
    )


class ARInvoiceFromDeliveryLineRequest(BaseModel):
    """
    One line in an ARInvoiceFromDeliveryRequest.

    Accepts both snake_case and camelCase field names for API consistency.

    Attributes:
        delivery_line_id:  lineId UUID of the source Delivery line.
        quantity:          Qty to invoice from this Delivery line (must be > 0 and
                           <= open invoice qty on the Delivery line).
        unit_price:        Selling price (may differ from COGS — this is revenue).
        discount_percent:  Line discount 0–100.
        tax_code_id:       Override tax code (inherits from item ext if omitted).
        cost_center_id:    Override cost-centre.
    """

    model_config = ConfigDict(populate_by_name=True)

    delivery_line_id: str = Field(..., alias="deliveryLineId", description="lineId UUID of the source Delivery line")
    quantity: Decimal = Field(..., gt=Decimal("0"), description="Qty to invoice; must be > 0")
    unit_price: Decimal = Field(..., alias="unitPrice", ge=Decimal("0"), description="Selling price per unit")
    discount_percent: Decimal = Field(
        Decimal("0"), alias="discountPercent", ge=Decimal("0"), le=Decimal("100")
    )
    tax_code_id: Optional[str] = Field(None, alias="taxCodeId")
    cost_center_id: Optional[str] = Field(None, alias="costCenterId")


# Rebuild ARInvoiceFromDeliveryRequest after the line model is defined.
ARInvoiceFromDeliveryRequest.model_rebuild()


class ARInvoiceTotals(BaseModel):
    """
    Header-level totals for an AR Invoice.

    Attributes:
        net:                     Sum of line_net across all lines.
        tax:                     Sum of line_tax across all lines.
        gross:                   net + tax.
        down_payment_applied:    Amount of down-payment applied (future DP flow; default 0).
        paid_amount:             Set by Customer Receipt allocations (T-100.10); default 0.
        credited_amount:         Set by AR Credit Note allocations (T-100.11); default 0.
        open_amount:             gross - down_payment_applied - paid_amount - credited_amount.
    """

    net: Decimal
    tax: Decimal
    gross: Decimal
    down_payment_applied: Decimal = Decimal("0")
    paid_amount: Decimal = Decimal("0")
    credited_amount: Decimal = Decimal("0")
    open_amount: Decimal = Decimal("0")


class ARInvoiceUpdate(BaseModel):
    """
    Partial update payload for a DRAFT AR Invoice.

    Only allowed when the invoice is in DRAFT status.
    If `lines` is provided, the existing line set is replaced wholesale and all
    amounts are recomputed (including revenue_account_id re-lookup).

    Accepts both snake_case and camelCase field names for API consistency.

    Attributes:
        bp_ref_no:         Override customer reference.
        doc_date:          Override accounting date.
        date_of_supply:    Override supply date (tax_date recomputed).
        invoice_date:      Override invoice date (tax_date recomputed).
        payment_terms_id:  Override payment terms.
        currency:          Override currency.
        exchange_rate:     Override FX rate.
        journal_memo:      Override GL memo.
        notes:             Override notes.
        lines:             If provided, replaces the line set wholesale.
    """

    model_config = ConfigDict(populate_by_name=True)

    bp_ref_no: Optional[str] = Field(None, alias="bpRefNo", max_length=100)
    doc_date: Optional[date] = Field(None, alias="docDate")
    date_of_supply: Optional[date] = Field(None, alias="dateOfSupply")
    invoice_date: Optional[date] = Field(None, alias="invoiceDate")
    payment_terms_id: Optional[str] = Field(None, alias="paymentTermsId")
    currency: Optional[str] = Field(None, max_length=3)
    exchange_rate: Optional[Decimal] = Field(None, alias="exchangeRate", gt=Decimal("0"))
    journal_memo: Optional[str] = Field(None, alias="journalMemo", max_length=500)
    notes: Optional[str] = Field(None, max_length=2000)
    lines: Optional[List[ARInvoiceLineCreate]] = Field(
        None, description="If provided, replaces the existing line set wholesale"
    )


class ARInvoiceResponse(BaseModel):
    """
    Full representation of an AR Invoice header returned by the API.

    `lines` is always included for single-document GET endpoints.
    For list endpoints the service returns ARInvoiceListItem (slimmer).
    """

    doc_entry: str = Field(..., description="UUID — stable cross-service reference")
    doc_number: str = Field(..., description="Human-readable e.g. 'ARI-2026-0001'")
    doc_type: str = Field("AR_INVOICE", description="Constant — always 'AR_INVOICE'")
    organization_id: str
    company_code: str
    # Customer + parties
    customer_id: str
    customer_name: str
    bp_ref_no: Optional[str]
    # Dates
    doc_date: date
    date_of_supply: date
    invoice_date: date
    tax_date: date = Field(..., description="min(date_of_supply, invoice_date) — UAE tax point")
    due_date: date
    # Money
    currency: str
    exchange_rate: Decimal
    payment_terms_id: Optional[str]
    # Status + amounts
    status: DocumentStatus
    totals: ARInvoiceTotals
    # Special flags
    is_reserve_invoice: bool = Field(
        False, description="Bill-before-delivery flow; default False"
    )
    is_cash_sale: bool = Field(
        False, description="AR Invoice + Payment combined (T-100.11+); default False"
    )
    # Linking
    base_doc_ref: Optional[DocumentLinkRef] = Field(
        None, description="Header-level reference to source Delivery (null for direct invoice)"
    )
    target_doc_refs: List[DocumentLinkRef] = Field(
        default_factory=list,
        description="Customer Receipts and Credit Notes allocated against this invoice",
    )
    # Outbox event tracking (ops-side visibility)
    outbox_event_id: Optional[str] = Field(
        None,
        description="event_id of the sales_invoice_posted outbox event (set at OPEN-transition)",
    )
    outbox_event_emitted_at: Optional[datetime] = Field(
        None, description="UTC timestamp when the outbox event was emitted"
    )
    journal_memo: Optional[str]
    notes: Optional[str]
    lines: List[ARInvoiceLineResponse] = Field(default_factory=list)
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str

    class Config:
        from_attributes = True


class ARInvoiceListItem(BaseModel):
    """
    Slim view of an AR Invoice for paginated list responses.

    Excludes the full lines array to keep list payloads lean.
    """

    doc_entry: str
    doc_number: str
    organization_id: str
    customer_id: str
    customer_name: str
    doc_date: date
    due_date: date
    tax_date: date
    status: DocumentStatus
    totals: ARInvoiceTotals
    base_doc_ref: Optional[DocumentLinkRef]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Status transition request
# ---------------------------------------------------------------------------


class ARInvoiceStatusTransitionRequest(BaseModel):
    """
    Request body for the AR Invoice status-transition endpoint.

    Legal transitions for AR_INVOICE (from LEGAL_TRANSITIONS["AR_INVOICE"]):
        DRAFT           → PENDING_APPROVAL, OPEN
        PENDING_APPROVAL → OPEN, DRAFT
        OPEN            → PARTLY_CLOSED, CLOSED
        PARTLY_CLOSED   → CLOSED
        CLOSED          → (terminal)
        CANCELLED       → (terminal)

    Note: OPEN → CANCELLED is NOT in LEGAL_TRANSITIONS for AR_INVOICE.
    Once posted, an AR Invoice can only be corrected via Credit Note (T-100.11).
    The status path OPEN → PARTLY_PAID → CLOSED is managed by Customer Receipt
    (T-100.10) allocations. A super_admin may directly force PARTLY_PAID or CLOSED
    but the normal path is via Receipt.

    On DRAFT → OPEN (primary accounting event):
      - Revenue account re-validated per line.
      - customer_finance_ext validated (for arControlAccountId resolution in T-100.9b).
      - sales_invoice_posted outbox event emitted.

    On OPEN → CANCELLED (not in LEGAL_TRANSITIONS, documented for clarity):
      - Emitted sales_invoice_cancelled event with original_event_id.
      - Source Delivery line invoiced_qty decremented back.
      - Not directly callable via transition endpoint — use super_admin override.

    Accepts both snake_case and camelCase field names for API consistency.

    Attributes:
        new_status: Target status to transition to.
        reason:     Optional free-text reason stored in the audit log.
    """

    model_config = ConfigDict(populate_by_name=True)

    new_status: DocumentStatus = Field(..., alias="newStatus", description="Target status for the transition")
    reason: Optional[str] = Field(
        None,
        max_length=500,
        description="Optional reason for the transition (stored in audit log)",
    )
