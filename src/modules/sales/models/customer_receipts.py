"""
Sales Module — Customer Receipt Pydantic Schemas (T-100.10)

Covers the lifecycle of a Customer Receipt (IPAY) in the quote-to-cash chain.
A Customer Receipt records when a customer pays one or more AR Invoices.

Status lifecycle:
    DRAFT → OPEN (the payment event — atomically updates AR Invoice paid_amounts)
    OPEN  → CANCELLED (reversal — atomically restores AR Invoice paid_amounts)
    DRAFT → CANCELLED (abandon before posting)

On DRAFT → OPEN the service:
    1. Re-validates each allocation target AR Invoice.
    2. Atomically increments AR Invoice paid_amount for each allocation.
    3. Transitions each AR Invoice to PARTLY_CLOSED or CLOSED as appropriate.
    4. Emits ``customer_payment_received`` outbox event (finance posts
       DR Bank / CR AR JE in T-100.10.1).

Collection name: customer_receipts_v2
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from src.core.documents.document_links import DocumentLinkRef
from src.core.documents.document_status import DocumentStatus


# ---------------------------------------------------------------------------
# Allocation schemas
# ---------------------------------------------------------------------------


class ReceiptAllocationCreate(BaseModel):
    """
    One allocation on a Customer Receipt — maps to a specific AR Invoice.

    Attributes:
        ar_invoice_doc_entry:  UUID of the target AR Invoice.
        ar_invoice_doc_number: Denormalised doc number (display only; validated
                               server-side against the actual document).
        amount_applied:        Amount being paid toward this AR Invoice.
        currency_applied:      Currency of the applied amount (must match receipt
                               header currency; validated at service layer).
        notes:                 Optional per-allocation notes.
    """

    ar_invoice_doc_entry: str = Field(..., description="UUID of the target AR Invoice")
    ar_invoice_doc_number: str = Field(
        ..., max_length=50, description="Denormalised AR Invoice doc number"
    )
    amount_applied: Decimal = Field(
        ..., gt=Decimal("0"), description="Amount applied to this AR Invoice; must be > 0"
    )
    currency_applied: str = Field(
        "AED", max_length=3, description="Currency of the applied amount"
    )
    notes: Optional[str] = Field(None, max_length=500, description="Per-allocation notes")


class ReceiptAllocationResponse(BaseModel):
    """
    Full allocation detail as returned by the API.

    Attributes:
        allocation_line_number: 1-indexed position.
        ar_invoice_doc_entry:   UUID of the target AR Invoice.
        ar_invoice_doc_number:  Denormalised doc number.
        amount_applied:         Amount applied to this invoice.
        currency_applied:       Currency.
        notes:                  Optional per-allocation notes.
    """

    allocation_line_number: int = Field(..., description="1-indexed position")
    ar_invoice_doc_entry: str
    ar_invoice_doc_number: str
    amount_applied: Decimal
    currency_applied: str
    notes: Optional[str]


# ---------------------------------------------------------------------------
# Header schemas
# ---------------------------------------------------------------------------


class CustomerReceiptCreate(BaseModel):
    """
    Input payload for creating a Customer Receipt.

    The caller supplies the header and all allocations.  The service validates
    that:
    - Each AR Invoice exists, is OPEN or PARTLY_CLOSED, and belongs to the
      same customer.
    - Each allocation's amount_applied does not exceed the AR Invoice's
      open_amount.
    - sum(allocations.amount_applied) == amount_received.
    - No duplicate ar_invoice_doc_entry values in allocations.

    Attributes:
        organization_id:   Owning organisation UUID.
        company_code:      Finance company code for doc_number scoping.
        customer_id:       FK to customers collection.
        customer_name:     Denormalised customer name (snapshot).
        bp_ref_no:         Customer's transfer reference / cheque number.
        doc_date:          Payment receipt date (drives JE posting period).
        payment_method:    How the payment was received.
        payment_ref:       Bank transfer reference / cheque number.
        bank_account_id:   FK to gl_accounts — the Cr cash/bank side of the JE.
                           Finance handler validates account type (ASSETS/asset).
        currency:          ISO 4217 currency code.
        exchange_rate:     FX rate to base currency (default 1.0).
        amount_received:   Gross amount received from customer.
        allocations:       List of AR Invoice allocations (at least one required).
        journal_memo:      Optional GL journal memo.
        notes:             Free-text header notes.
    """

    organization_id: str = Field(..., description="Owning organisation UUID")
    company_code: str = Field(..., max_length=20, description="Finance company code")
    customer_id: str = Field(..., description="FK to customers collection")
    customer_name: str = Field(..., max_length=200, description="Denormalised customer name")
    bp_ref_no: Optional[str] = Field(
        None, max_length=100, description="Customer's transfer reference / cheque number"
    )
    doc_date: date = Field(..., description="Payment receipt date")
    payment_method: Literal["bank_transfer", "cheque", "cash", "card"] = Field(
        ..., description="How the payment was received"
    )
    payment_ref: Optional[str] = Field(
        None,
        max_length=100,
        description="Bank transfer reference / cheque number",
    )
    bank_account_id: str = Field(
        ...,
        min_length=1,
        description="FK to gl_accounts — the Dr Bank side of the JE (validated by T-100.10.1)",
    )
    currency: str = Field("AED", max_length=3, description="ISO 4217 currency code")
    exchange_rate: Decimal = Field(
        Decimal("1.0"), gt=Decimal("0"), description="FX rate to base currency"
    )
    amount_received: Decimal = Field(
        ..., gt=Decimal("0"), description="Gross amount received from customer"
    )
    allocations: List[ReceiptAllocationCreate] = Field(
        ..., min_length=1, description="AR Invoice allocations (at least one required)"
    )
    journal_memo: Optional[str] = Field(None, max_length=500, description="GL journal memo")
    notes: Optional[str] = Field(None, max_length=2000, description="Free-text notes")

    @field_validator("bank_account_id")
    @classmethod
    def validate_bank_account_id(cls, v: str) -> str:
        """
        Validate bank_account_id is non-empty after stripping whitespace.

        Actual account-type validation (must be ASSETS/asset) happens in the
        finance handler (T-100.10.1).

        Args:
            v: Raw bank_account_id string.

        Returns:
            Stripped bank_account_id.

        Raises:
            ValueError: If the value is blank after stripping.
        """
        stripped = v.strip()
        if not stripped:
            raise ValueError("bank_account_id must not be blank")
        return stripped

    @model_validator(mode="after")
    def validate_allocations_sum(self) -> "CustomerReceiptCreate":
        """
        Validate that allocations sum equals amount_received (v1 invariant: no unallocated balance).

        Also checks for duplicate ar_invoice_doc_entry values within the allocations.

        Returns:
            Validated CustomerReceiptCreate.

        Raises:
            ValueError: If sum of allocation amounts != amount_received.
            ValueError: If duplicate ar_invoice_doc_entry found in allocations.
        """
        _TOLERANCE = Decimal("0.005")

        # Check for duplicates.
        seen_entries = set()
        for alloc in self.allocations:
            if alloc.ar_invoice_doc_entry in seen_entries:
                raise ValueError(
                    f"Duplicate allocation for AR Invoice "
                    f"'{alloc.ar_invoice_doc_entry}' — each invoice may only appear once."
                )
            seen_entries.add(alloc.ar_invoice_doc_entry)

        # Validate sum.
        total_applied = sum(alloc.amount_applied for alloc in self.allocations)
        if abs(total_applied - self.amount_received) > _TOLERANCE:
            raise ValueError(
                f"Sum of allocation amounts ({total_applied}) does not equal "
                f"amount_received ({self.amount_received}). "
                "In v1 every dirham received must be allocated to an AR Invoice."
            )
        return self


class CustomerReceiptUpdate(BaseModel):
    """
    Partial update payload for a DRAFT Customer Receipt.

    Only allowed when the receipt is in DRAFT status.
    If ``allocations`` is supplied, the existing allocation set is replaced wholesale
    and the sum-equals-amount validation is re-run.

    Attributes:
        bp_ref_no:        Override customer reference.
        doc_date:         Override payment date.
        payment_method:   Override payment method.
        payment_ref:      Override payment reference.
        bank_account_id:  Override bank account FK.
        currency:         Override currency.
        exchange_rate:    Override FX rate.
        amount_received:  Override gross amount (must still balance allocations).
        allocations:      If provided, replaces the allocation set wholesale.
        journal_memo:     Override GL memo.
        notes:            Override notes.
    """

    bp_ref_no: Optional[str] = Field(None, max_length=100)
    doc_date: Optional[date] = None
    payment_method: Optional[Literal["bank_transfer", "cheque", "cash", "card"]] = None
    payment_ref: Optional[str] = Field(None, max_length=100)
    bank_account_id: Optional[str] = Field(None, min_length=1)
    currency: Optional[str] = Field(None, max_length=3)
    exchange_rate: Optional[Decimal] = Field(None, gt=Decimal("0"))
    amount_received: Optional[Decimal] = Field(None, gt=Decimal("0"))
    allocations: Optional[List[ReceiptAllocationCreate]] = Field(
        None, description="If provided, replaces the allocation set wholesale"
    )
    journal_memo: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=2000)


class CustomerReceiptResponse(BaseModel):
    """
    Full representation of a Customer Receipt header returned by the API.
    """

    doc_entry: str = Field(..., description="UUID — stable cross-service reference")
    doc_number: str = Field(..., description="Human-readable e.g. 'IPAY-2026-0001'")
    doc_type: str = Field("IPAY", description="Constant — always 'IPAY'")
    organization_id: str
    company_code: str
    # Customer + payment details
    customer_id: str
    customer_name: str
    bp_ref_no: Optional[str]
    doc_date: date
    payment_method: str
    payment_ref: Optional[str]
    bank_account_id: str
    # Money
    currency: str
    exchange_rate: Decimal
    amount_received: Decimal
    # Allocations
    allocations: List[ReceiptAllocationResponse] = Field(default_factory=list)
    # Status + derived amounts
    status: DocumentStatus
    unallocated_amount: Decimal = Field(
        ..., description="amount_received - sum(allocations.amount_applied); 0 in v1"
    )
    # Linking
    base_doc_refs: List[DocumentLinkRef] = Field(
        default_factory=list,
        description="One per allocated AR Invoice (base documents for this Receipt)",
    )
    target_doc_refs: List[DocumentLinkRef] = Field(
        default_factory=list,
        description="Credit Note refunds if any",
    )
    # Outbox event tracking
    outbox_event_id: Optional[str] = Field(None, description="event_id from outbox (set at OPEN)")
    outbox_event_emitted_at: Optional[datetime] = Field(None, description="UTC timestamp")
    # Audit
    journal_memo: Optional[str]
    notes: Optional[str]
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str

    class Config:
        from_attributes = True


class CustomerReceiptListItem(BaseModel):
    """
    Slim view of a Customer Receipt for paginated list responses.

    Excludes allocations array to keep list payloads lean.
    """

    doc_entry: str
    doc_number: str
    organization_id: str
    customer_id: str
    customer_name: str
    doc_date: date
    payment_method: str
    status: DocumentStatus
    amount_received: Decimal
    unallocated_amount: Decimal
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Status transition request
# ---------------------------------------------------------------------------


class CustomerReceiptStatusTransitionRequest(BaseModel):
    """
    Request body for the Customer Receipt status-transition endpoint.

    Legal transitions for IPAY (from LEGAL_TRANSITIONS["IPAY"]):
        DRAFT  → OPEN, CANCELLED
        OPEN   → CLOSED
        CLOSED → (terminal)
        CANCELLED → (terminal)

    Note: OPEN → CANCELLED is implemented as a special case in the service layer
    (not in LEGAL_TRANSITIONS) to allow cancellation of a posted receipt with full
    AR Invoice reversal.  This is analogous to how AR_INVOICE handles OPEN → CANCELLED.

    On DRAFT → OPEN (primary accounting event):
      - Re-validates each AR Invoice (status, open_amount, customer match).
      - Atomically increments AR Invoice paid_amount for each allocation.
      - Transitions AR Invoices to PARTLY_CLOSED or CLOSED as appropriate.
      - Emits ``customer_payment_received`` outbox event.

    On OPEN → CANCELLED:
      - Reverses all AR Invoice paid_amount increments.
      - Restores prior AR Invoice status (OPEN if no other receipts remain;
        PARTLY_CLOSED if other receipts are still present).
      - Emits ``customer_payment_cancelled`` event.

    Attributes:
        new_status: Target status to transition to.
        reason:     Optional free-text reason stored in the audit log.
    """

    new_status: DocumentStatus = Field(..., description="Target status for the transition")
    reason: Optional[str] = Field(
        None, max_length=500, description="Optional reason (stored in audit log)"
    )


# ---------------------------------------------------------------------------
# Convenience shortcut request
# ---------------------------------------------------------------------------


class CustomerReceiptFromInvoiceRequest(BaseModel):
    """
    Shortcut: pay a single AR Invoice with one call.

    The service constructs a single-allocation Receipt covering the specified
    amount (defaults to the invoice's full open_amount).

    Attributes:
        company_code:      Finance company code.
        doc_date:          Payment receipt date.
        payment_method:    How the payment was received.
        payment_ref:       Bank transfer reference.
        bank_account_id:   FK to gl_accounts (Dr Bank side).
        currency:          ISO 4217 currency.
        exchange_rate:     FX rate to base.
        amount:            Amount to apply (defaults to invoice open_amount if None).
        bp_ref_no:         Customer's own reference.
        journal_memo:      Optional GL memo.
        notes:             Free-text notes.
    """

    company_code: str = Field(..., max_length=20, description="Finance company code")
    doc_date: date = Field(..., description="Payment receipt date")
    payment_method: Literal["bank_transfer", "cheque", "cash", "card"] = Field(...)
    payment_ref: Optional[str] = Field(None, max_length=100)
    bank_account_id: str = Field(..., min_length=1, description="FK to gl_accounts")
    currency: str = Field("AED", max_length=3)
    exchange_rate: Decimal = Field(Decimal("1.0"), gt=Decimal("0"))
    amount: Optional[Decimal] = Field(
        None,
        gt=Decimal("0"),
        description="Amount to apply; defaults to the invoice's full open_amount if None",
    )
    bp_ref_no: Optional[str] = Field(None, max_length=100)
    journal_memo: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=2000)
