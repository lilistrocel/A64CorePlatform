"""
Sales Module — AR Credit Note (ARC) Pydantic Schemas (T-100.11)

Covers the lifecycle of an AR Credit Note — financial reversal of AR Invoice:

    DRAFT → OPEN (credit_note_posted event emitted, AR Invoice credited_amount updated)
          → CANCELLED (draft abandoned)
    OPEN  → CLOSED (terminal)
          → CANCELLED (super_admin only — reverses AR Invoice credited_amount)

Collection name: ar_credit_notes_v2

Two creation flows:
  1. Return-driven: Credit Note is created from a posted Return document.
     base_return_doc_ref is set; lines reference Return lines.
  2. Standalone: Credit Note for price adjustment, goodwill, overbilling.
     No Return doc; lines reference AR Invoice lines directly.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

from src.core.documents.document_links import DocumentLinkRef
from src.core.documents.document_status import DocumentStatus


# ---------------------------------------------------------------------------
# Credit reason types
# ---------------------------------------------------------------------------

CreditReason = Literal[
    "return",
    "price_adjustment",
    "discount",
    "goodwill",
    "cancellation",
    "other",
]


# ---------------------------------------------------------------------------
# Allocation schemas
# ---------------------------------------------------------------------------


class CreditNoteAllocationCreate(BaseModel):
    """
    One allocation on an AR Credit Note — maps to a specific AR Invoice.

    The sum of all allocations must equal the credit note's totals.gross.

    Attributes:
        ar_invoice_doc_entry:  UUID of the target AR Invoice.
        ar_invoice_doc_number: Denormalised doc number.
        amount_applied:        Amount being credited to this AR Invoice.
    """

    ar_invoice_doc_entry: str = Field(..., description="UUID of the target AR Invoice")
    ar_invoice_doc_number: str = Field(..., max_length=50)
    amount_applied: Decimal = Field(..., gt=Decimal("0"))


class CreditNoteAllocationResponse(BaseModel):
    """Full allocation as returned by the API."""

    allocation_line_number: int
    ar_invoice_doc_entry: str
    ar_invoice_doc_number: str
    amount_applied: Decimal


# ---------------------------------------------------------------------------
# Line schemas
# ---------------------------------------------------------------------------


class CreditNoteLineCreate(BaseModel):
    """
    Input payload for a single AR Credit Note line.

    Attributes:
        item_id:           FK to items.
        item_code:         Denormalised item code.
        item_name:         Denormalised item name.
        description:       Printable description.
        credited_qty:      Quantity being credited. Must be > 0.
        uom:               Unit of measure.
        unit_price:        Price per unit (snapshotted from source).
        discount_percent:  Line discount 0–100.
        tax_code_id:       FK to tax codes (optional).
        tax_percent:       Snapshotted tax rate.
        revenue_account_id: GL revenue account (snapshotted from sale_item_finance_ext).
        warehouse_id:      Optional warehouse reference.
        cost_center_id:    Optional cost centre.
        base_doc_ref:      REQUIRED — link to source AR Invoice line or Return line.
    """

    item_id: str = Field(..., description="FK to items")
    item_code: str = Field(..., max_length=50)
    item_name: str = Field(..., max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    credited_qty: Decimal = Field(..., gt=Decimal("0"))
    uom: str = Field(..., max_length=20)
    unit_price: Decimal = Field(..., ge=Decimal("0"))
    discount_percent: Decimal = Field(Decimal("0"), ge=Decimal("0"), le=Decimal("100"))
    tax_code_id: Optional[str] = None
    tax_percent: Decimal = Field(Decimal("0"), ge=Decimal("0"), le=Decimal("100"))
    revenue_account_id: str = Field(
        ..., description="GL revenue account (snapshotted from sale_item_finance_ext)"
    )
    warehouse_id: Optional[str] = None
    cost_center_id: Optional[str] = None
    base_doc_ref: DocumentLinkRef = Field(
        ..., description="Source AR Invoice line or Return line ref"
    )


class CreditNoteLineResponse(BaseModel):
    """Full AR Credit Note line as returned by the API."""

    line_id: str
    line_number: int
    item_id: str
    item_code: str
    item_name: str
    description: str
    credited_qty: Decimal
    uom: str
    unit_price: Decimal
    discount_percent: Decimal
    line_net: Decimal
    tax_code_id: Optional[str]
    tax_percent: Decimal
    line_tax: Decimal
    line_gross: Decimal
    revenue_account_id: str
    warehouse_id: Optional[str]
    cost_center_id: Optional[str]
    base_doc_ref: Optional[dict]
    target_doc_refs: List[dict]


# ---------------------------------------------------------------------------
# Totals schema
# ---------------------------------------------------------------------------


class CreditNoteTotals(BaseModel):
    """Totals sub-document for an AR Credit Note."""

    net: Decimal
    tax: Decimal
    gross: Decimal


# ---------------------------------------------------------------------------
# Header schemas
# ---------------------------------------------------------------------------


class ARCreditNoteCreate(BaseModel):
    """
    Input payload for creating an AR Credit Note.

    Can be created standalone (no Return doc) or after a Return.

    Attributes:
        company_code:            Finance company code.
        customer_id:             FK to customer.
        customer_name:           Denormalised customer name.
        bp_ref_no:               Customer's own reference.
        doc_date:                Document date.
        date_of_supply:          UAE VAT date of supply.
        invoice_date:            Invoice date (= doc_date typically).
        currency:                Currency code.
        exchange_rate:           FX rate vs AED.
        payment_terms_id:        FK to payment terms (optional).
        credit_reason:           Credit reason code.
        credit_reason_text:      Free-text expansion of reason.
        base_return_doc_ref:     If return-driven, points to Return document.
        allocations:             Must allocate full gross to AR Invoices.
        lines:                   At least one line required.
        journal_memo:            Optional JE memo.
        notes:                   Free-text notes.
    """

    company_code: str = Field("1000", max_length=20)
    customer_id: str = Field(..., description="FK to customer")
    customer_name: str = Field(..., max_length=200)
    bp_ref_no: Optional[str] = Field(None, max_length=100)
    doc_date: date
    date_of_supply: date
    invoice_date: date
    currency: str = Field("AED", max_length=3)
    exchange_rate: Decimal = Field(Decimal("1.0"), ge=Decimal("0"))
    payment_terms_id: Optional[str] = None
    credit_reason: CreditReason
    credit_reason_text: Optional[str] = Field(None, max_length=500)
    base_return_doc_ref: Optional[DocumentLinkRef] = None
    allocations: List[CreditNoteAllocationCreate] = Field(..., min_length=1)
    lines: List[CreditNoteLineCreate] = Field(..., min_length=1)
    journal_memo: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=1000)


class ARCreditNoteUpdate(BaseModel):
    """
    Partial update for a DRAFT AR Credit Note.

    Only allowed in DRAFT status.
    """

    bp_ref_no: Optional[str] = Field(None, max_length=100)
    doc_date: Optional[date] = None
    date_of_supply: Optional[date] = None
    invoice_date: Optional[date] = None
    currency: Optional[str] = Field(None, max_length=3)
    exchange_rate: Optional[Decimal] = None
    credit_reason: Optional[CreditReason] = None
    credit_reason_text: Optional[str] = Field(None, max_length=500)
    journal_memo: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=1000)
    lines: Optional[List[CreditNoteLineCreate]] = None
    allocations: Optional[List[CreditNoteAllocationCreate]] = None


class ARCreditNoteStatusTransitionRequest(BaseModel):
    """Transition request for AR Credit Note status changes."""

    new_status: DocumentStatus
    reason: Optional[str] = Field(None, max_length=500)


class ARCreditNoteResponse(BaseModel):
    """Full AR Credit Note as returned by the API."""

    doc_entry: str
    doc_number: str
    doc_type: str
    organization_id: str
    company_code: str
    customer_id: str
    customer_name: str
    bp_ref_no: Optional[str]
    doc_date: date
    date_of_supply: date
    invoice_date: date
    tax_date: date
    currency: str
    exchange_rate: Decimal
    payment_terms_id: Optional[str]
    credit_reason: str
    credit_reason_text: Optional[str]
    status: DocumentStatus
    totals: CreditNoteTotals
    base_return_doc_ref: Optional[dict]
    allocations: List[CreditNoteAllocationResponse]
    target_doc_refs: List[dict]
    outbox_event_id: Optional[str]
    outbox_event_emitted_at: Optional[datetime]
    journal_memo: Optional[str]
    notes: Optional[str]
    lines: List[CreditNoteLineResponse]
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str


class ARCreditNoteListItem(BaseModel):
    """Slim AR Credit Note row for paginated list views."""

    doc_entry: str
    doc_number: str
    organization_id: str
    customer_id: str
    customer_name: str
    doc_date: date
    tax_date: date
    status: DocumentStatus
    totals: CreditNoteTotals
    base_return_doc_ref: Optional[dict]
    created_at: datetime
    updated_at: datetime
