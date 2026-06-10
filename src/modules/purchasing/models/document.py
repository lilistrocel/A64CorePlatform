"""
Purchasing Module — Document Models (PR + PO + GR + AP)

Pydantic schemas for the document_headers and document_lines MongoDB collections.

Document types supported:
  - PR (Purchase Request) — Phase 1B
  - PO (Purchase Order)  — Phase 1B
  - GR (Goods Receipt)   — Phase B.1
  - AP (AP Invoice)      — Phase C.1
"""

from datetime import datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Approval history entry (chain-readiness precaution, Phase F prep)
# ---------------------------------------------------------------------------


class ApprovalHistoryEntry(BaseModel):
    """
    One entry in a document's approvalHistory array.

    Today a document will have at most one entry (single-gate approval).
    When multi-step workflow chains land in Phase F, the array grows
    naturally — one entry per step decision — with no data shape changes.

    Attributes:
        stepNumber: Chain step that was decided; always 1 today.
        approverId: UUID of the user who made the decision.
        approverRole: Role held by the approver at decision time.
        decision: "Approved" or "Rejected".
        decidedAt: UTC timestamp of the decision.
        comment: Optional free-text from the approver.
        workflowId: Reserved for Phase F; null today.
    """

    stepNumber: int
    approverId: str
    approverRole: str
    decision: Literal["Approved", "Rejected"]
    decidedAt: datetime
    comment: Optional[str] = None
    workflowId: Optional[str] = None


# ---------------------------------------------------------------------------
# Enumerations (as Literal types to avoid circular imports)
# ---------------------------------------------------------------------------

DocType = Literal["PR", "PO", "GR", "AP"]

ItemType = Literal["raw_material", "consumable", "service", "fixed_asset_acquisition"]

# Reason: T-200.21 Wave 4 status retrofit — these aliases are kept for backward
# compatibility with any external callers but the response models now use `str`
# directly.  The stored vocabulary changed from TitleCase to lowercase_snake
# (see document_service.py docstring).  These Literal sets would need updating
# to include both old and new forms during the migration window; using `str` is
# simpler and is explicitly required by the T-200.21 spec.
PRStatus = str
POStatus = str

ApprovalState = Literal["NotRequired", "Pending", "Approved", "Rejected"]

UrgencyLevel = Literal["low", "normal", "high"]


# ---------------------------------------------------------------------------
# Document Line schemas
# ---------------------------------------------------------------------------


class DocumentLineCreate(BaseModel):
    """
    Input schema for creating a document line.

    Used in both PR and PO creation payloads.
    """

    itemId: str = Field(..., description="FK to purchase_items.itemId")
    description: Optional[str] = Field(None, max_length=500)
    uom: str = Field(..., max_length=50)
    quantity: Decimal = Field(..., gt=0)
    unitPrice: Decimal = Field(default=Decimal("0"), ge=0)
    discountPercent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    taxCode: Optional[str] = Field(None, max_length=20)
    costCenterId: Optional[str] = Field(None, max_length=20)
    warehouseId: Optional[str] = None
    requestedVendorId: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=500)


class DocumentLineResponse(BaseModel):
    """
    Response schema for a document line.

    All computed totals (lineNet, lineTax, lineGross) are included.
    itemType is populated for GR lines (needed for purchase_received event payload).

    AP-specific fields (grLineId, poUnitPrice, priceVarianceAmount) are null for
    PR/PO/GR lines and populated only for AP Invoice lines.
    """

    lineId: str
    docId: str
    organizationId: str
    lineNumber: int
    itemId: str
    itemCode: str
    itemName: str
    itemType: Optional[ItemType] = None
    description: Optional[str] = None
    uom: str
    quantity: Decimal
    openQuantity: Decimal
    closedQuantity: Decimal
    unitPrice: Decimal
    discountPercent: Decimal = Decimal("0")
    lineNet: Decimal
    taxCode: Optional[str] = None
    taxRate: Decimal
    lineTax: Decimal
    lineGross: Decimal
    costCenterId: Optional[str] = None
    warehouseId: Optional[str] = None
    requestedVendorId: Optional[str] = None
    baseLineId: Optional[str] = None
    notes: Optional[str] = None
    # AP Invoice — specific fields (null for PR / PO / GR lines)
    grLineId: Optional[str] = None
    """Link to the GR line being invoiced. Populated only on AP lines."""
    poUnitPrice: Optional[Decimal] = None
    """PO unit price copied from source PO line. Populated only on AP lines."""
    invoiceUnitPrice: Optional[Decimal] = None
    """Vendor's invoiced unit price. Mirrors `unitPrice` for AP lines so the
    frontend can read it under its semantic name. Populated for AP lines."""
    priceVarianceAmount: Optional[Decimal] = None
    """(invoiceUnitPrice - poUnitPrice) * quantity. Populated only on AP lines."""
    # Reason: T-200.23 — tracks how much of this AP Invoice line's quantity has
    # been reversed by AP Credit Notes. Defaults to 0 on existing lines.
    creditedQty: Decimal = Decimal("0")
    """Quantity credited against this AP Invoice line by AP Credit Notes. 0 before T-200.23."""
    createdAt: datetime
    updatedAt: datetime


# ---------------------------------------------------------------------------
# Purchase Request schemas
# ---------------------------------------------------------------------------


class PRCreate(BaseModel):
    """
    Input schema for creating a new Purchase Request.

    organizationId is inferred from the JWT in the API layer.
    """

    department: Optional[str] = Field(None, max_length=100)
    urgency: UrgencyLevel = "normal"
    notes: Optional[str] = Field(None, max_length=2000)
    expectedDeliveryDate: Optional[datetime] = None
    lines: List[DocumentLineCreate] = Field(..., min_length=1)


class PRUpdate(BaseModel):
    """
    Partial update for a Draft PR header.

    Lines are replaced wholesale if supplied; otherwise untouched.
    """

    department: Optional[str] = Field(None, max_length=100)
    urgency: Optional[UrgencyLevel] = None
    notes: Optional[str] = Field(None, max_length=2000)
    expectedDeliveryDate: Optional[datetime] = None
    lines: Optional[List[DocumentLineCreate]] = None


class PRResponse(BaseModel):
    """
    Response schema for a Purchase Request (header only — no lines).

    Used in list endpoints. Detail endpoints use PRDetailResponse.
    """

    docId: str
    organizationId: str
    companyCode: str
    docType: Literal["PR"]
    docNumber: str
    docDate: datetime
    status: PRStatus
    requestedBy: str
    requestedDate: datetime
    department: Optional[str] = None
    urgency: UrgencyLevel
    subtotalNet: Decimal
    totalTax: Decimal
    totalGross: Decimal
    currencyCode: str
    notes: Optional[str] = None
    baseDocId: Optional[str] = None
    approvalState: ApprovalState
    approvalRequestedFrom: Optional[str] = None
    approvalRequestedAt: Optional[datetime] = None
    approvalDecidedBy: Optional[str] = None
    approvalDecidedAt: Optional[datetime] = None
    approvalComment: Optional[str] = None
    approvalHistory: List[ApprovalHistoryEntry] = []
    """Ordered list of approval decisions. One entry per step; empty until a decision is made."""
    createdAt: datetime
    updatedAt: datetime
    deletedAt: Optional[datetime] = None


class PRDetailResponse(PRResponse):
    """PR header plus line items."""

    lines: List[DocumentLineResponse] = []


class ApproveRejectBody(BaseModel):
    """Body for approve/reject actions."""

    comment: Optional[str] = Field(None, max_length=1000)


class RejectBody(BaseModel):
    """Body for reject action — comment is required."""

    comment: str = Field(..., min_length=1, max_length=1000)


# ---------------------------------------------------------------------------
# Purchase Order schemas
# ---------------------------------------------------------------------------


class POCreate(BaseModel):
    """
    Input schema for creating a new Purchase Order (manual).

    vendorId is required for PO. organizationId comes from JWT.
    """

    vendorId: str = Field(..., description="FK to vendors.vendorId")
    paymentTermsCode: Optional[str] = Field(None, max_length=20)
    expectedDeliveryDate: Optional[datetime] = None
    notes: Optional[str] = Field(None, max_length=2000)
    lines: List[DocumentLineCreate] = Field(..., min_length=1)


class POFromPRCreate(BaseModel):
    """
    Input schema for creating a PO from an approved PR.

    The vendorId is required here since the PR may not have one.
    Lines are copied from the PR and their quantities may be split.
    """

    vendorId: str = Field(..., description="Vendor to assign to the PO")
    paymentTermsCode: Optional[str] = Field(None, max_length=20)
    expectedDeliveryDate: Optional[datetime] = None
    notes: Optional[str] = Field(None, max_length=2000)


class POUpdate(BaseModel):
    """Partial update for a Draft PO header."""

    vendorId: Optional[str] = None
    paymentTermsCode: Optional[str] = Field(None, max_length=20)
    expectedDeliveryDate: Optional[datetime] = None
    notes: Optional[str] = Field(None, max_length=2000)
    lines: Optional[List[DocumentLineCreate]] = None


class POResponse(BaseModel):
    """
    Response schema for a Purchase Order (header only).

    Used in list endpoints. Detail endpoints use PODetailResponse.
    """

    docId: str
    organizationId: str
    companyCode: str
    docType: Literal["PO"]
    docNumber: str
    docDate: datetime
    postingDate: Optional[datetime] = None
    dueDate: Optional[datetime] = None
    expectedDeliveryDate: Optional[datetime] = None
    status: POStatus
    vendorId: Optional[str] = None
    vendorCode: Optional[str] = None
    vendorName: Optional[str] = None
    paymentTermsCode: Optional[str] = None
    issuedBy: str
    issuedDate: Optional[datetime] = None
    baseDocId: Optional[str] = None
    subtotalNet: Decimal
    totalTax: Decimal
    totalGross: Decimal
    currencyCode: str
    notes: Optional[str] = None
    approvalState: ApprovalState
    approvalRequestedFrom: Optional[str] = None
    approvalRequestedAt: Optional[datetime] = None
    approvalDecidedBy: Optional[str] = None
    approvalDecidedAt: Optional[datetime] = None
    approvalComment: Optional[str] = None
    approvalHistory: List[ApprovalHistoryEntry] = []
    """Ordered list of approval decisions. One entry per step; empty until a decision is made."""
    createdAt: datetime
    updatedAt: datetime
    deletedAt: Optional[datetime] = None


class PODetailResponse(POResponse):
    """PO header plus line items."""

    lines: List[DocumentLineResponse] = []


# ---------------------------------------------------------------------------
# Approval inbox
# ---------------------------------------------------------------------------


class PendingApprovalItem(BaseModel):
    """
    An item in the approval inbox.

    Combines header fields needed for the inbox view without full detail.
    """

    docId: str
    docType: DocType
    docNumber: str
    requesterName: Optional[str] = None
    """Denormalised from users collection for display."""
    totalGross: Decimal
    currencyCode: str
    approvalRequestedAt: Optional[datetime] = None
    approvalRequestedFrom: Optional[str] = None
    department: Optional[str] = None
    urgency: Optional[UrgencyLevel] = None
    vendorName: Optional[str] = None
    notes: Optional[str] = None


class ApprovalHistoryItem(BaseModel):
    """A completed approval decision for the history tab."""

    docId: str
    docType: DocType
    docNumber: str
    finalState: str
    approvalDecidedBy: Optional[str] = None
    approvalDecidedAt: Optional[datetime] = None
    approvalComment: Optional[str] = None
    totalGross: Decimal
    currencyCode: str


# ---------------------------------------------------------------------------
# Goods Receipt schemas (Phase B.1)
# ---------------------------------------------------------------------------

# Reason: T-200.21 — GR "Posted" now stored as "open" (DocumentStatus.OPEN).
GRStatus = str


class GRLineInput(BaseModel):
    """
    One line in a GR creation/update payload.

    References a PO line via baseLineId and records the received quantity.
    """

    baseLineId: str = Field(..., description="lineId of the source PO line")
    quantity: Decimal = Field(..., gt=0, description="Quantity received (≤ PO line openQuantity)")
    description: Optional[str] = Field(None, max_length=500)


class GRFromPOCreate(BaseModel):
    """
    Input schema for creating a Goods Receipt from an Open/Sent PO via the
    /gr/from-po/{po_doc_id} endpoint.

    organizationId comes from the JWT. Vendor, company, currency are copied from the PO.
    """

    docDate: Optional[datetime] = Field(
        None,
        description="Receipt date; defaults to today when omitted",
    )
    warehouseId: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=2000)
    lines: List[GRLineInput] = Field(
        ...,
        min_length=1,
        description="Lines to receive. Each must reference a PO line lineId.",
    )


class GRCreate(BaseModel):
    """
    Input schema for creating a Goods Receipt with an explicit baseDocId.

    Flexible alternative to GRFromPOCreate when the PO is identified in the
    body rather than the URL path.
    """

    baseDocId: str = Field(..., description="docId of the source PO")
    docDate: Optional[datetime] = Field(None, description="Receipt date; defaults to today")
    warehouseId: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=2000)
    lines: List[GRLineInput] = Field(..., min_length=1)


class GRUpdate(BaseModel):
    """
    Partial update for a Draft GR header.

    Only non-identifying fields may be updated.  baseDocId, vendor, and
    companyCode cannot be changed after creation.
    Lines, when supplied, replace the current set wholesale (same pattern
    as PRUpdate / POUpdate). Quantities must still not exceed PO line
    openQuantity at the time of the update call.
    """

    warehouseId: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=2000)
    lines: Optional[List[GRLineInput]] = None


class GRResponse(BaseModel):
    """
    Response schema for a Goods Receipt (header only — no lines).

    Used in list endpoints. Detail endpoints use GRDetailResponse.
    """

    docId: str
    organizationId: str
    companyCode: str
    docType: Literal["GR"]
    docNumber: str
    docDate: datetime
    status: GRStatus
    baseDocId: str
    baseDocNumber: str
    vendorId: str
    vendorCode: Optional[str] = None
    vendorName: Optional[str] = None
    currencyCode: str
    receivedBy: str
    receivedDate: Optional[datetime] = None
    warehouseId: Optional[str] = None
    notes: Optional[str] = None
    subtotalNet: Decimal
    totalTax: Decimal
    totalGross: Decimal
    postedAt: Optional[datetime] = None
    postedBy: Optional[str] = None
    postedEventId: Optional[str] = None
    approvalHistory: List[ApprovalHistoryEntry] = []
    """Always empty for GR (no approval gate today). Present for shape consistency with PR/PO."""
    createdAt: datetime
    updatedAt: datetime
    deletedAt: Optional[datetime] = None


class GRDetailResponse(GRResponse):
    """GR header plus line items."""

    lines: List[DocumentLineResponse] = []


# ---------------------------------------------------------------------------
# AP Invoice schemas (Phase C.1)
# ---------------------------------------------------------------------------

# Reason: T-200.21 — AP status vocabulary migrated to lowercase_snake.
APStatus = str
"""State machine for AP Invoice: Draft → Pending Approval → Approved | Rejected."""

# Hardcoded tax rates per tax code for v1 (no tax-code lookup service yet).
# SR (reverse charge) is treated as standard 5% here; the finance handler decides
# how to split the VAT into input + output on its side.
AP_TAX_RATES: dict = {
    "S": Decimal("5"),
    "SR": Decimal("5"),
    "Z": Decimal("0"),
    "E": Decimal("0"),
    "N": Decimal("0"),
}
"""
v1 hardcoded tax rate table keyed by taxCode.

S  = Standard (5% UAE VAT)
SR = Reverse charge (5% — finance handler decides input/output split)
Z  = Zero-rated (0%)
E  = Exempt (0%)
N  = Not subject to VAT (0%)
"""


class APLineInput(BaseModel):
    """
    One line in an AP Invoice creation/update payload.

    The user provides the GR line reference and the vendor's actual price.
    Quantity is NOT accepted from the request — it is locked to the GR line
    quantity in v1 (no partial invoicing).
    """

    grLineId: str = Field(..., description="lineId of the source GR line being invoiced")
    invoiceUnitPrice: Decimal = Field(..., ge=0, description="Vendor's actual unit price")
    description: Optional[str] = Field(None, max_length=500)


class APFromGRCreate(BaseModel):
    """
    Input schema for creating an AP Invoice from a Posted GR.

    This is the primary UX path. organizationId comes from JWT.
    Vendor, company, currency, and PO reference are copied from the GR.

    dueDate defaults to invoiceDate + 30 days when omitted.
    """

    docDate: Optional[datetime] = Field(
        None,
        description="Posting/accounting date; defaults to today when omitted",
    )
    invoiceNumber: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Vendor's invoice number as printed on the document",
    )
    invoiceDate: datetime = Field(..., description="Date printed on the vendor's invoice")
    dueDate: Optional[datetime] = Field(
        None,
        description="Payment due date; defaults to invoiceDate + 30 days",
    )
    notes: Optional[str] = Field(None, max_length=2000)
    lines: List[APLineInput] = Field(
        ...,
        min_length=1,
        description="One entry per GR line with the vendor's invoiced price",
    )
    # Reason: T-200.24 — optional DPI allocations for prepayment netting.
    # Defaults to empty list for full backward compatibility with existing callers.
    dpi_allocations: "List[DPIAllocation]" = Field(
        default_factory=list,
        description=(
            "Optional list of AP Down Payment Invoice allocations to net "
            "against this AP Invoice on approval."
        ),
    )


class APCreate(APFromGRCreate):
    """
    Input schema for creating an AP Invoice with explicit baseDocId (the GR docId).

    Flexible alternative to APFromGRCreate when the GR is identified in the body
    rather than the URL path.
    """

    baseDocId: str = Field(..., description="docId of the source Posted GR")


class APUpdate(BaseModel):
    """
    Partial update for a Draft AP Invoice.

    Only header metadata and line invoiceUnitPrice may be changed.
    baseDocId, vendor, companyCode, and line quantities are immutable.
    """

    invoiceNumber: Optional[str] = Field(None, min_length=1, max_length=50)
    invoiceDate: Optional[datetime] = None
    dueDate: Optional[datetime] = None
    notes: Optional[str] = Field(None, max_length=2000)
    lines: Optional[List[APLineInput]] = None
    """When supplied, replaces all line invoiceUnitPrices wholesale."""


class APResponse(BaseModel):
    """
    Response schema for an AP Invoice (header only — no lines).

    Used in list endpoints. Detail endpoints use APDetailResponse.
    """

    docId: str
    organizationId: str
    companyCode: str
    docType: Literal["AP"]
    docNumber: str
    docDate: datetime
    status: APStatus
    baseDocId: str
    """docId of the source GR."""
    baseDocNumber: str
    """Denormalised GR docNumber for display."""
    vendorId: str
    vendorCode: Optional[str] = None
    vendorName: Optional[str] = None
    currencyCode: str
    invoiceNumber: str
    """Vendor's invoice number."""
    invoiceDate: datetime
    dueDate: Optional[datetime] = None
    paymentTermsCode: Optional[str] = None
    subtotalNet: Decimal
    totalTax: Decimal
    totalGross: Decimal
    totalPriceVariance: Decimal
    notes: Optional[str] = None
    approvalState: ApprovalState
    approvalRequestedFrom: Optional[str] = None
    approvalRequestedAt: Optional[datetime] = None
    approvalDecidedBy: Optional[str] = None
    approvalDecidedAt: Optional[datetime] = None
    approvalComment: Optional[str] = None
    approvalHistory: List[ApprovalHistoryEntry] = []
    """Ordered list of approval decisions. One entry per step; empty until a decision is made."""
    postedAt: Optional[datetime] = None
    postedBy: Optional[str] = None
    postedEventId: Optional[str] = None
    # Reason: T-200.23 — tracks how much of the AP Invoice gross has been
    # reversed by AP Credit Notes. Defaults to 0 on existing docs (no migration
    # needed; reconcile_ap_line_credit_counters uses $inc which creates the field
    # if absent, and 0 is the correct default for pre-T-200.23 invoices).
    creditedAmount: Decimal = Decimal("0")
    # Reason: T-200.24 — stores DPI allocations applied at AP Invoice posting time.
    # Each entry records a DPI that was netted against this invoice.
    # Defaults to empty list for backward compatibility with pre-T-200.24 invoices.
    dpiAllocations: "List[AppliedDPIAllocation]" = Field(default_factory=list)
    createdAt: datetime
    updatedAt: datetime
    deletedAt: Optional[datetime] = None


class APDetailResponse(APResponse):
    """AP Invoice header plus line items."""

    lines: List[DocumentLineResponse] = []


# ---------------------------------------------------------------------------
# AP Credit Note schemas (T-200.23 — Wave 4)
# ---------------------------------------------------------------------------


class DocumentLinkRef(BaseModel):
    """
    A cross-document link reference.

    Used on both header-level (baseInvoiceDocRef) and line-level
    (base_doc_ref) fields to record the originating document.

    Attributes:
        doc_type:   Document type code, e.g. "AP_INVOICE".
        doc_id:     UUID of the source document.
        doc_number: Human-readable document number for display.
        line_id:    Optional UUID of the specific source line.
    """

    doc_type: str
    doc_id: str
    doc_number: str
    line_id: Optional[str] = None


class APCreditNoteLineCreate(BaseModel):
    """
    One line in an AP Credit Note creation/update payload.

    Mirrors CreditNoteLineCreate from the sales side but adapted for the
    purchasing schema: no revenue account, uses AP_TAX_RATES dict, carries
    an optional gr_line_id for chain audit purposes.

    Attributes:
        gr_line_id:       Link to the originating GR line (for audit).
                          Populated on from-AP-Invoice path via the AP line's grLineId.
                          None on direct-create path.
        item_id:          UUID of the item being credited.
        item_code:        Item code for display.
        item_name:        Item name for display.
        description:      Optional override description.
        quantity:         Credited quantity (must be > 0).
        uom:              Unit of measure.
        unit_price:       Credit unit price (usually mirrors AP line price).
        discount_percent: Line discount 0–100.
        tax_code:         Tax code key from AP_TAX_RATES.
        cost_center_id:   Optional cost centre reference.
        notes:            Optional per-line notes.
        base_doc_ref:     Line-level link to the source AP Invoice line.
                          Set on from-AP-Invoice path; None on direct-create.
    """

    gr_line_id: Optional[str] = None
    item_id: str
    item_code: str
    item_name: str
    description: Optional[str] = Field(None, max_length=500)
    quantity: Decimal = Field(..., gt=0)
    uom: str = Field(..., max_length=50)
    unit_price: Decimal = Field(..., ge=0)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    tax_code: Optional[str] = Field(None, max_length=20)
    cost_center_id: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = Field(None, max_length=500)
    base_doc_ref: Optional[DocumentLinkRef] = None


class APCreditNoteCreate(BaseModel):
    """
    Input schema for creating a new AP Credit Note.

    Supports two creation paths:
    - Direct-create (base_invoice_doc_ref is None): free-standing credit note
      for vendor billing corrections, price adjustments, etc.
    - From-AP-Invoice (base_invoice_doc_ref is set): chained from an existing
      OPEN or PARTLY_CLOSED AP Invoice.

    organizationId comes from the JWT.

    Attributes:
        vendor_id:              UUID of the vendor.
        vendor_name:            Vendor name (denormalised for display).
        company_code:           Finance company code. Backend resolves if empty.
        doc_date:               Accounting/posting date.
        credit_date:            Date the credit is issued (defaults to doc_date).
        due_date:               Payment/credit due date (optional).
        currency:               ISO 4217 currency code.
        exchange_rate:          FX rate against base currency.
        payment_terms_id:       Optional payment terms reference.
        bp_ref_no:              Vendor's credit memo reference number.
        journal_memo:           Free-text memo for the finance JE.
        notes:                  Internal notes.
        base_invoice_doc_ref:   Set on from-AP-Invoice path; None for direct.
        lines:                  At least one line item.
    """

    vendor_id: str
    vendor_name: str
    vendor_code: Optional[str] = None
    company_code: str = Field(default="")
    doc_date: Optional[datetime] = Field(
        None, description="Accounting date; defaults to today when omitted"
    )
    credit_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    currency: str = Field(default="AED", max_length=10)
    exchange_rate: Decimal = Field(default=Decimal("1"), ge=0)
    payment_terms_id: Optional[str] = None
    bp_ref_no: Optional[str] = Field(None, max_length=100)
    journal_memo: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=2000)
    base_invoice_doc_ref: Optional[DocumentLinkRef] = None
    lines: List[APCreditNoteLineCreate] = Field(..., min_length=1)


class APCreditNoteUpdate(BaseModel):
    """
    Partial update for a Draft AP Credit Note.

    Lines, when supplied, replace the current set wholesale.
    base_invoice_doc_ref, vendor, and companyCode are immutable after creation.

    Only DRAFT credit notes may be updated.
    """

    doc_date: Optional[datetime] = None
    credit_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    currency: Optional[str] = Field(None, max_length=10)
    exchange_rate: Optional[Decimal] = None
    payment_terms_id: Optional[str] = None
    bp_ref_no: Optional[str] = Field(None, max_length=100)
    journal_memo: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=2000)
    lines: Optional[List[APCreditNoteLineCreate]] = None


class APCreditNoteTotals(BaseModel):
    """Aggregated monetary totals for an AP Credit Note."""

    net: Decimal
    tax: Decimal
    gross: Decimal


class APCreditNoteLine(BaseModel):
    """
    Embedded line response shape for an AP Credit Note.

    Mirrors DocumentLineResponse but uses credit semantics (no openQuantity /
    closedQuantity since credit notes don't themselves get partially consumed).
    """

    line_id: str
    line_number: int
    gr_line_id: Optional[str] = None
    item_id: str
    item_code: str
    item_name: str
    description: Optional[str] = None
    quantity: Decimal
    uom: str
    unit_price: Decimal
    discount_percent: Decimal
    line_net: Decimal
    tax_code: Optional[str] = None
    tax_rate: Decimal
    line_tax: Decimal
    line_gross: Decimal
    cost_center_id: Optional[str] = None
    notes: Optional[str] = None
    base_doc_ref: Optional[DocumentLinkRef] = None


class APCreditNoteStatusTransitionRequest(BaseModel):
    """
    Request body for AP Credit Note status transitions.

    Attributes:
        target_status: The desired new status (as the DocumentStatus enum value string).
        notes:         Optional free-text reason / approver comment.
    """

    target_status: str
    notes: Optional[str] = Field(None, max_length=1000)


class APCreditNoteResponse(BaseModel):
    """
    Full response schema for an AP Credit Note (header + embedded lines).

    Used for GET /ap-credit-notes/{doc_id} and as the result of create/update.

    Attributes:
        doc_id:               UUID primary key (stored as ``docId`` in MongoDB).
        doc_number:           Human-readable number, e.g. "APC-2026-0001".
        doc_type:             Always "AP_CREDIT".
        organization_id:      Organisation scope UUID.
        company_code:         Finance company code.
        vendor_id:            UUID of the vendor.
        vendor_code:          Vendor code (denormalised).
        vendor_name:          Vendor name (denormalised).
        bp_ref_no:            Vendor's credit memo reference.
        doc_date:             Accounting date.
        credit_date:          Date credit was issued.
        due_date:             Optional payment/credit due date.
        currency:             ISO 4217 currency code.
        exchange_rate:        FX rate.
        payment_terms_id:     Optional payment terms.
        status:               Current document status.
        totals:               Aggregated net/tax/gross.
        base_invoice_doc_ref: Source AP Invoice reference (or None if direct).
        target_doc_refs:      Downstream document references (future payments).
        journal_memo:         Finance JE memo.
        notes:                Internal notes.
        outbox_event_id:      ID of the ap_credit_note_posted outbox event.
        outbox_event_emitted_at: Timestamp the event was emitted.
        lines:                Embedded line items.
        created_at:           Creation timestamp.
        created_by:           UUID of the creating user.
        updated_at:           Last update timestamp.
        updated_by:           UUID of the last updating user.
    """

    doc_id: str
    doc_number: str
    doc_type: str = "AP_CREDIT"
    organization_id: str
    company_code: str
    vendor_id: str
    vendor_code: Optional[str] = None
    vendor_name: str
    bp_ref_no: Optional[str] = None
    doc_date: datetime
    credit_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    currency: str
    exchange_rate: Decimal
    payment_terms_id: Optional[str] = None
    status: str
    totals: APCreditNoteTotals
    base_invoice_doc_ref: Optional[DocumentLinkRef] = None
    target_doc_refs: List[DocumentLinkRef] = []
    journal_memo: Optional[str] = None
    notes: Optional[str] = None
    outbox_event_id: Optional[str] = None
    outbox_event_emitted_at: Optional[datetime] = None
    lines: List[APCreditNoteLine] = []
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str


class APCreditNoteListItem(BaseModel):
    """
    Slim list-view schema for AP Credit Notes.

    Used in paginated GET /ap-credit-notes to avoid transmitting full line sets.
    """

    doc_id: str
    doc_number: str
    organization_id: str
    vendor_id: str
    vendor_name: str
    doc_date: datetime
    status: str
    totals: APCreditNoteTotals
    base_invoice_doc_ref: Optional[DocumentLinkRef] = None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# AP Down Payment Invoice (AP_DPI) schemas — T-200.24 / Wave 4
# ---------------------------------------------------------------------------


class APDownPaymentLineCreate(BaseModel):
    """
    One line in an AP Down Payment Invoice creation/update payload.

    DPI lines represent the prepayment basis.  Some DPIs are amount-only
    (no items), so item_id and item_code are optional.  At minimum unit_price
    is required; quantity defaults to 1.

    Attributes:
        item_id:      Optional UUID of the item (None for amount-only lines).
        item_code:    Item code for display.
        item_name:    Item name / description.
        description:  Optional override description.
        quantity:     Prepayment quantity basis (defaults to 1.0).
        uom:          Unit of measure.
        unit_price:   Prepayment amount per unit (required; the core amount field).
        discount_percent: Line discount 0–100.
        tax_code:     Tax code key from AP_TAX_RATES.
        cost_center_id: Optional cost centre reference.
        notes:        Optional per-line notes.
    """

    item_id: Optional[str] = None
    item_code: Optional[str] = None
    item_name: Optional[str] = None
    description: Optional[str] = Field(None, max_length=500)
    quantity: Decimal = Field(default=Decimal("1"), gt=0)
    uom: str = Field(default="EA", max_length=50)
    unit_price: Decimal = Field(..., ge=0)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    tax_code: Optional[str] = Field(None, max_length=20)
    cost_center_id: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = Field(None, max_length=500)


class APDownPaymentCreate(BaseModel):
    """
    Input schema for creating a new AP Down Payment Invoice.

    A DPI is a STANDALONE document — it does NOT chain from a PR/PO.
    Created when a vendor demands a deposit before delivering goods/services.

    organizationId comes from the JWT.

    Attributes:
        vendor_id:       UUID of the vendor.
        vendor_name:     Vendor name (denormalised for display).
        vendor_code:     Optional vendor code.
        company_code:    Finance company code. Backend resolves if empty.
        doc_date:        Accounting/posting date.
        due_date:        Optional payment due date.
        currency:        ISO 4217 currency code.
        exchange_rate:   FX rate against base currency.
        payment_terms_id: Optional payment terms reference.
        bp_ref_no:       Vendor's deposit-request reference number.
        journal_memo:    Free-text memo for the finance JE.
        notes:           Internal notes.
        lines:           At least one line item.
    """

    vendor_id: str
    vendor_name: str
    vendor_code: Optional[str] = None
    company_code: str = Field(default="")
    doc_date: Optional[datetime] = Field(
        None, description="Accounting date; defaults to today when omitted"
    )
    due_date: Optional[datetime] = None
    currency: str = Field(default="AED", max_length=10)
    exchange_rate: Decimal = Field(default=Decimal("1"), ge=0)
    payment_terms_id: Optional[str] = None
    bp_ref_no: Optional[str] = Field(None, max_length=100)
    journal_memo: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=2000)
    lines: List[APDownPaymentLineCreate] = Field(..., min_length=1)


class APDownPaymentUpdate(BaseModel):
    """
    Partial update for a Draft AP Down Payment Invoice.

    Lines, when supplied, replace the current set wholesale.
    vendor and companyCode are immutable after creation.

    Only DRAFT DPIs may be updated.
    """

    doc_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    currency: Optional[str] = Field(None, max_length=10)
    exchange_rate: Optional[Decimal] = None
    payment_terms_id: Optional[str] = None
    bp_ref_no: Optional[str] = Field(None, max_length=100)
    journal_memo: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=2000)
    lines: Optional[List[APDownPaymentLineCreate]] = None


class APDownPaymentTotals(BaseModel):
    """
    Aggregated monetary totals for an AP Down Payment Invoice.

    Attributes:
        net:               Total net amount (sum of all lineNet values).
        tax:               Total tax amount (sum of all lineTax values).
        gross:             Total gross = net + tax.
        consumed_amount:   Amount already consumed by AP Invoice allocations.
        outstanding_amount: gross - consumed_amount; available for future allocation.
    """

    net: Decimal
    tax: Decimal
    gross: Decimal
    consumed_amount: Decimal = Decimal("0")
    outstanding_amount: Decimal = Decimal("0")


class APDownPaymentLine(BaseModel):
    """
    Embedded line response shape for an AP Down Payment Invoice.

    Attributes:
        line_id:         UUID of this line.
        line_number:     1-indexed position.
        item_id:         Optional item UUID.
        item_code:       Optional item code.
        item_name:       Optional item name.
        description:     Description shown on the document.
        quantity:        Prepayment quantity basis.
        uom:             Unit of measure.
        unit_price:      Price per unit.
        discount_percent: Discount applied.
        line_net:        Net amount for this line.
        tax_code:        Tax code (optional).
        tax_rate:        Applied tax rate %.
        line_tax:        Tax amount for this line.
        line_gross:      Gross amount for this line.
        cost_center_id:  Optional cost centre.
        notes:           Optional per-line notes.
    """

    line_id: str
    line_number: int
    item_id: Optional[str] = None
    item_code: Optional[str] = None
    item_name: Optional[str] = None
    description: Optional[str] = None
    quantity: Decimal
    uom: str
    unit_price: Decimal
    discount_percent: Decimal
    line_net: Decimal
    tax_code: Optional[str] = None
    tax_rate: Decimal
    line_tax: Decimal
    line_gross: Decimal
    cost_center_id: Optional[str] = None
    notes: Optional[str] = None


class APDownPaymentStatusTransitionRequest(BaseModel):
    """
    Request body for AP Down Payment Invoice status transitions.

    Attributes:
        target_status: The desired new status (as DocumentStatus enum value string).
        notes:         Optional free-text reason / approver comment.
    """

    target_status: str
    notes: Optional[str] = Field(None, max_length=1000)


class APDownPaymentResponse(BaseModel):
    """
    Full response schema for an AP Down Payment Invoice (header + embedded lines).

    Used for GET /ap-down-payments/{doc_id} and as the result of create/update.

    The ``totals`` field includes ``consumed_amount`` and ``outstanding_amount``
    computed at read time from the persisted ``consumedAmount`` field.

    Attributes:
        doc_id:               UUID primary key (stored as ``docId`` in MongoDB).
        doc_number:           Human-readable number, e.g. "DPI-2026-0001".
        doc_type:             Always "AP_DPI".
        organization_id:      Organisation scope UUID.
        company_code:         Finance company code.
        vendor_id:            UUID of the vendor.
        vendor_code:          Vendor code (denormalised).
        vendor_name:          Vendor name (denormalised).
        bp_ref_no:            Vendor's deposit-request reference.
        doc_date:             Accounting date.
        due_date:             Optional payment due date.
        currency:             ISO 4217 currency code.
        exchange_rate:        FX rate.
        payment_terms_id:     Optional payment terms.
        status:               Current document status.
        totals:               Aggregated net/tax/gross + consumed/outstanding.
        target_doc_refs:      AP Invoices that have allocated this DPI.
        journal_memo:         Finance JE memo.
        notes:                Internal notes.
        outbox_event_id:      ID of the ap_down_payment_posted outbox event.
        outbox_event_emitted_at: Timestamp the event was emitted.
        lines:                Embedded line items.
        created_at:           Creation timestamp.
        created_by:           UUID of the creating user.
        updated_at:           Last update timestamp.
        updated_by:           UUID of the last updating user.
    """

    doc_id: str
    doc_number: str
    doc_type: str = "AP_DPI"
    organization_id: str
    company_code: str
    vendor_id: str
    vendor_code: Optional[str] = None
    vendor_name: str
    bp_ref_no: Optional[str] = None
    doc_date: datetime
    due_date: Optional[datetime] = None
    currency: str
    exchange_rate: Decimal
    payment_terms_id: Optional[str] = None
    status: str
    totals: APDownPaymentTotals
    target_doc_refs: List[DocumentLinkRef] = []
    journal_memo: Optional[str] = None
    notes: Optional[str] = None
    outbox_event_id: Optional[str] = None
    outbox_event_emitted_at: Optional[datetime] = None
    lines: List[APDownPaymentLine] = []
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str


class APDownPaymentListItem(BaseModel):
    """
    Slim list-view schema for AP Down Payment Invoices.

    Used in paginated GET /ap-down-payments to avoid transmitting full line sets.
    """

    doc_id: str
    doc_number: str
    organization_id: str
    vendor_id: str
    vendor_name: str
    doc_date: datetime
    status: str
    totals: APDownPaymentTotals
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# DPI Allocation schemas — used in AP Invoice to pre-pay against DPIs
# ---------------------------------------------------------------------------


class DPIAllocation(BaseModel):
    """
    One DPI allocation attached to an AP Invoice.

    When an AP Invoice is created, the accountant may specify one or more DPIs
    whose outstanding prepayment balance will be netted against the invoice amount.

    Validation rules (enforced in ap_down_payment_service or document_service):
    - dpi_doc_id must exist and be in OPEN or PARTLY_CLOSED status.
    - The DPI must belong to the same vendor as the AP Invoice.
    - The DPI must be in the same currency as the AP Invoice.
    - allocated_amount <= DPI outstanding_amount (gross - consumed_amount).
    - Sum of all allocated_amount across all allocations on one AP Invoice
      must not exceed the AP Invoice's totalGross.

    Attributes:
        dpi_doc_id:        UUID of the AP Down Payment Invoice being consumed.
        allocated_amount:  Amount to net against this DPI's outstanding balance.
    """

    dpi_doc_id: str
    allocated_amount: Decimal = Field(..., gt=0)


class AppliedDPIAllocation(BaseModel):
    """
    Applied DPI allocation stored on a posted AP Invoice.

    Records the DPI reference plus the amount that was netted at AP posting time.
    Surfaced in APResponse / APDetailResponse so finance can reconstruct the JE.

    Attributes:
        dpi_doc_id:        UUID of the AP Down Payment Invoice.
        dpi_doc_number:    Human-readable DPI doc number for display.
        allocated_amount:  Amount netted against this DPI.
    """

    dpi_doc_id: str
    dpi_doc_number: str = ""
    allocated_amount: Decimal


# ---------------------------------------------------------------------------
# Resolve forward references for models that reference DPI classes
# ---------------------------------------------------------------------------
# Reason: APFromGRCreate and APResponse use List[DPIAllocation] /
# List[AppliedDPIAllocation] as string annotations because those classes are
# defined later in the file.  Call model_rebuild() after all definitions are
# complete so Pydantic resolves the forward references.
APFromGRCreate.model_rebuild()
APCreate.model_rebuild()
APResponse.model_rebuild()
APDetailResponse.model_rebuild()


# ---------------------------------------------------------------------------
# Blanket Agreement (BLA) schemas — T-200.25 / Wave 4
# ---------------------------------------------------------------------------


class BlanketAgreementLineCreate(BaseModel):
    """
    One line in a Blanket Agreement creation/update payload.

    BLA lines are item-anchored: the whole point of a BLA is to lock
    pricing on a specific item over a validity window.  item_id is
    therefore required.

    NO discount_percent field — the BLA unit_price IS the agreed/discounted
    price.  Applying a further discount would double-count the commercial
    concession.

    Attributes:
        item_id:            UUID of the item. Required (BLAs are item-anchored).
        item_code:          Item code for display.
        item_name:          Item name for display.
        description:        Optional override description.
        committed_quantity: Volume committed on this line (> 0).
        unit_price:         Agreed unit price for this item.
        uom:                Unit of measure.
        tax_code:           Tax code key from AP_TAX_RATES (optional).
        notes:              Optional per-line notes.
    """

    item_id: str = Field(..., description="UUID of the committed item (required)")
    item_code: str = Field(..., max_length=100)
    item_name: str = Field(..., max_length=500)
    description: Optional[str] = Field(None, max_length=500)
    committed_quantity: Decimal = Field(..., gt=0)
    unit_price: Decimal = Field(..., ge=0)
    uom: str = Field(..., max_length=50)
    tax_code: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = Field(None, max_length=500)


class BlanketAgreementCreate(BaseModel):
    """
    Input schema for creating a new Blanket Agreement.

    A BLA is a STANDALONE document — not chained from a PR/PO.
    Created to formalise a long-term volume/price commitment with a vendor.

    The ``agreement_type`` field selects the consumption-tracking mode:
    - ``"line_based"``:   each line has a committed_quantity; PO consumption
      is tracked per-line (qty decrements per BLA line).
    - ``"amount_based"``: header has a committed_total_amount; PO consumption
      is tracked at header level in currency amount.  Lines still exist as
      "expected items" for reporting but individual line quantities are
      informational only.

    agreement_type is immutable after creation.

    organizationId comes from the JWT.

    Attributes:
        vendor_id:               UUID of the vendor.
        vendor_name:             Vendor name (denormalised for display).
        vendor_code:             Optional vendor code.
        company_code:            Finance company code. Backend resolves if empty.
        agreement_date:          Date the agreement was signed/formalised.
        valid_from:              Start date of the agreement's validity window.
        valid_to:                End date of the agreement's validity window (exclusive).
        currency:                ISO 4217 currency code.
        exchange_rate:           FX rate against base currency.
        payment_terms_id:        Optional payment terms reference.
        bp_ref_no:               Vendor's contract reference number.
        journal_memo:            Free-text memo (informational; no JE on BLA).
        notes:                   Internal notes.
        agreement_type:          Consumption tracking mode: "line_based" or "amount_based".
        committed_total_amount:  For amount_based BLAs: total agreed spend.
                                 Ignored for line_based BLAs (totals are computed from lines).
        lines:                   At least one line. Required for both modes.
    """

    vendor_id: str
    vendor_name: str
    vendor_code: Optional[str] = None
    company_code: str = Field(default="")
    agreement_date: Optional[datetime] = Field(
        None, description="Agreement signing date; defaults to today when omitted"
    )
    valid_from: datetime = Field(..., description="Start of validity window (inclusive)")
    valid_to: datetime = Field(..., description="End of validity window (exclusive)")
    currency: str = Field(default="AED", max_length=10)
    exchange_rate: Decimal = Field(default=Decimal("1"), ge=0)
    payment_terms_id: Optional[str] = None
    bp_ref_no: Optional[str] = Field(None, max_length=100)
    journal_memo: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=2000)
    agreement_type: Literal["line_based", "amount_based"] = "line_based"
    committed_total_amount: Optional[Decimal] = Field(
        None,
        ge=0,
        description=(
            "Total committed spend for amount_based BLAs. "
            "Ignored for line_based BLAs."
        ),
    )
    lines: List[BlanketAgreementLineCreate] = Field(..., min_length=1)


class BlanketAgreementUpdate(BaseModel):
    """
    Partial update for a Draft Blanket Agreement.

    Lines, when supplied, replace the current set wholesale.
    vendor, companyCode, and agreement_type are immutable after creation.

    Only DRAFT BLAs may be updated.
    """

    agreement_date: Optional[datetime] = None
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
    currency: Optional[str] = Field(None, max_length=10)
    exchange_rate: Optional[Decimal] = None
    payment_terms_id: Optional[str] = None
    bp_ref_no: Optional[str] = Field(None, max_length=100)
    journal_memo: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=2000)
    committed_total_amount: Optional[Decimal] = Field(None, ge=0)
    lines: Optional[List[BlanketAgreementLineCreate]] = None


class BlanketAgreementTotals(BaseModel):
    """
    Aggregated monetary totals for a Blanket Agreement.

    For line_based BLAs: net/tax/gross are computed from committed lines.
    For amount_based BLAs: gross = committed_total_amount; net/tax may be 0
    until the commitment is broken into taxable components.

    Attributes:
        net:                Net amount (sum of line_net for line_based).
        tax:                Tax amount (sum of line_tax for line_based).
        gross:              Total gross committed amount.
        consumed_amount:    Amount consumed by referencing POs (incremented by T-200.25.1).
        outstanding_amount: gross - consumed_amount.
    """

    net: Decimal
    tax: Decimal
    gross: Decimal
    consumed_amount: Decimal = Decimal("0")
    outstanding_amount: Decimal = Decimal("0")


class BlanketAgreementLine(BaseModel):
    """
    Embedded line response shape for a Blanket Agreement.

    For line_based BLAs, ``consumed_qty`` and ``outstanding_qty`` are tracked
    per-line as POs reference and consume the committed volume.
    For amount_based BLAs, these counters carry ``committed_quantity`` and 0
    respectively (informational only — consumption is at header level).

    Attributes:
        line_id:             UUID of this BLA line.
        line_number:         1-indexed position.
        item_id:             UUID of the committed item.
        item_code:           Item code.
        item_name:           Item name.
        description:         Description.
        committed_quantity:  Volume committed on this line.
        consumed_qty:        Qty consumed by POs referencing this BLA (line_based only).
        outstanding_qty:     committed_quantity - consumed_qty.
        unit_price:          Agreed unit price.
        uom:                 Unit of measure.
        line_net:            committed_quantity * unit_price (net, no tax).
        tax_code:            Tax code (optional).
        tax_rate:            Applied tax rate %.
        line_tax:            Tax on this line.
        line_gross:          line_net + line_tax.
        notes:               Optional per-line notes.
    """

    line_id: str
    line_number: int
    item_id: str
    item_code: str
    item_name: str
    description: Optional[str] = None
    committed_quantity: Decimal
    consumed_qty: Decimal = Decimal("0")
    outstanding_qty: Decimal = Decimal("0")
    unit_price: Decimal
    uom: str
    line_net: Decimal
    tax_code: Optional[str] = None
    tax_rate: Decimal = Decimal("0")
    line_tax: Decimal = Decimal("0")
    line_gross: Decimal
    notes: Optional[str] = None


class BlanketAgreementStatusTransitionRequest(BaseModel):
    """
    Request body for Blanket Agreement status transitions.

    Attributes:
        target_status: The desired new status (as DocumentStatus enum value string).
        notes:         Optional free-text reason / approver comment.
    """

    target_status: str
    notes: Optional[str] = Field(None, max_length=1000)


class BlanketAgreementResponse(BaseModel):
    """
    Full response schema for a Blanket Agreement (header + embedded lines).

    Used for GET /blanket-agreements/{doc_id} and as the result of create/update.

    The ``totals`` field includes ``consumed_amount`` and ``outstanding_amount``
    computed at read time from the persisted ``consumedAmount`` field.

    ``target_doc_refs`` lists POs that have referenced this BLA.  This field
    is populated by T-200.25.1 (PO→BLA integration) and is empty in T-200.25.

    Attributes:
        doc_id:               UUID primary key (stored as ``docId`` in MongoDB).
        doc_number:           Human-readable number, e.g. "BLA-2026-0001".
        doc_type:             Always "BLA".
        organization_id:      Organisation scope UUID.
        company_code:         Finance company code.
        vendor_id:            UUID of the vendor.
        vendor_code:          Vendor code (denormalised).
        vendor_name:          Vendor name (denormalised).
        bp_ref_no:            Vendor's contract reference.
        agreement_date:       Date the agreement was formalised.
        valid_from:           Start of validity window.
        valid_to:             End of validity window.
        currency:             ISO 4217 currency code.
        exchange_rate:        FX rate.
        payment_terms_id:     Optional payment terms.
        status:               Current document status.
        agreement_type:       "line_based" or "amount_based".
        committed_total_amount: For amount_based BLAs; None for line_based.
        totals:               Aggregated net/tax/gross + consumed/outstanding.
        target_doc_refs:      POs referencing this BLA (wired in T-200.25.1).
        journal_memo:         Informational memo.
        notes:                Internal notes.
        lines:                Embedded committed line items.
        created_at:           Creation timestamp.
        created_by:           UUID of the creating user.
        updated_at:           Last update timestamp.
        updated_by:           UUID of the last updating user.
    """

    doc_id: str
    doc_number: str
    doc_type: str = "BLA"
    organization_id: str
    company_code: str
    vendor_id: str
    vendor_code: Optional[str] = None
    vendor_name: str
    bp_ref_no: Optional[str] = None
    agreement_date: datetime
    valid_from: datetime
    valid_to: datetime
    currency: str
    exchange_rate: Decimal
    payment_terms_id: Optional[str] = None
    status: str
    agreement_type: str
    committed_total_amount: Optional[Decimal] = None
    totals: BlanketAgreementTotals
    target_doc_refs: List[DocumentLinkRef] = []
    journal_memo: Optional[str] = None
    notes: Optional[str] = None
    lines: List[BlanketAgreementLine] = []
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str


class BlanketAgreementListItem(BaseModel):
    """
    Slim list-view schema for Blanket Agreements.

    Used in paginated GET /blanket-agreements to avoid transmitting full
    line sets.  Includes enough fields for the list page: vendor, dates,
    agreement_type, status, and high-level totals.
    """

    doc_id: str
    doc_number: str
    organization_id: str
    vendor_id: str
    vendor_name: str
    agreement_date: datetime
    valid_from: datetime
    valid_to: datetime
    status: str
    agreement_type: str
    totals: BlanketAgreementTotals
    created_at: datetime
    updated_at: datetime
