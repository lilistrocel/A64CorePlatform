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
