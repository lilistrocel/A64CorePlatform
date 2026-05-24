"""
Finance Event Contracts

Pydantic schemas defining the shape of all finance domain events that flow
through the outbox bridge (main app → finance service).

All anticipated event types are defined here even though the actual event
emission (wiring into business handlers) happens in Week 4.  The finance
service and the consumer worker import these schemas to validate events at
both ends of the bridge.

Usage
-----
    from contracts.finance_events import BaseFinanceEvent, EVENT_TYPE_REGISTRY

    # Validate an incoming event dict
    event = BaseFinanceEvent(**raw_dict)
    payload_class = EVENT_TYPE_REGISTRY[event.eventType]
    payload = payload_class(**event.payload)
"""

from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Literal, Optional, Type, Union
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Envelope
# ---------------------------------------------------------------------------


class BaseFinanceEvent(BaseModel):
    """
    Envelope schema wrapping every finance domain event.

    All events share this envelope regardless of type; the type-specific
    data lives inside `payload`.
    """

    eventId: UUID
    """Globally unique idempotency key.  The finance service deduplicates on this."""

    eventType: str
    """Discriminator string matching a key in EVENT_TYPE_REGISTRY."""

    organizationId: UUID
    """Owning organisation — all finance records are scoped to this."""

    companyCode: str
    """Which legal entity this event belongs to (SAP-style company code)."""

    occurredAt: datetime
    """Business timestamp when the domain event happened (not when it was published)."""

    sourceUserId: UUID
    """User who triggered the source action in the main app."""

    sourceDocumentId: Optional[str] = None
    """Optional opaque reference back to the originating MongoDB document id."""

    payload: dict
    """Event-type-specific payload; validated against EVENT_TYPE_REGISTRY[eventType]."""


# ---------------------------------------------------------------------------
# Shared line-item types (reused across payloads)
# ---------------------------------------------------------------------------


class SalesLine(BaseModel):
    """One line on a sales order shipment."""

    productId: UUID
    productName: str
    quantityKg: Decimal
    unitPrice: Decimal
    lineTotal: Decimal
    taxCode: str
    taxAmount: Decimal
    standardCostPerKg: Decimal
    """Used to derive COGS posting in Week 4."""


class GoodsReceivedLine(BaseModel):
    """
    One line on a goods receipt.

    Phase B contract. The finance handler uses itemId to look up the
    per-item inventory account in purchase_item_finance_ext, then debits
    that account for `lineNet` per line.
    """

    lineNumber: int
    itemId: UUID
    itemCode: str
    itemName: str
    itemType: Literal["raw_material", "consumable", "service", "fixed_asset_acquisition"]
    quantity: Decimal
    uom: str
    unitPrice: Decimal
    lineNet: Decimal
    lineTax: Decimal
    lineGross: Decimal
    taxCode: Optional[str] = None
    costCenterId: Optional[str] = None
    """Optional cost-centre tag inherited from the PO line. Forward-compat field
    used by future per-CC GR posting; today's GR handler ignores it."""
    baseLineId: Optional[UUID] = None
    """Link to the source PO line this receipt was created from."""


# Backwards-compat alias retained until any old handlers are removed.
# New code should use GoodsReceivedLine.
PurchaseLine = GoodsReceivedLine


class InvoiceApplication(BaseModel):
    """How much of a payment is applied to a specific invoice."""

    invoiceId: UUID
    amountApplied: Decimal


class ManualJournalLine(BaseModel):
    """One debit or credit line in a manual journal entry."""

    accountNumber: str
    costCenterId: Optional[str] = None
    debit: Optional[Decimal] = None
    credit: Optional[Decimal] = None
    description: Optional[str] = None


class OpeningBalanceEntry(BaseModel):
    """One account's opening balance at cutover date."""

    accountNumber: str
    debit: Optional[Decimal] = None
    credit: Optional[Decimal] = None
    subLedgerKey: Optional[str] = None
    """UUID of customer/vendor for AR/AP sub-ledger entries."""
    description: str


# ---------------------------------------------------------------------------
# Specific event payloads
# ---------------------------------------------------------------------------


class SalesOrderShippedPayload(BaseModel):
    """
    Raised when a sales order is shipped / fulfilled.

    Finance action (Week 4): DR AR, CR Revenue + VAT Payable; DR COGS, CR FG Inventory.
    """

    salesOrderId: UUID
    customerId: UUID
    farmCode: str
    """Maps to a cost centre in the finance service."""
    lines: List[SalesLine]
    totalNetAmount: Decimal
    totalTaxAmount: Decimal
    totalGrossAmount: Decimal


class PurchaseReceivedPayload(BaseModel):
    """
    Raised when a goods receipt is posted (Draft → Posted) on the operation side.

    Finance action: DR per-line inventory account (looked up via
    purchase_item_finance_ext.inventoryAccountId for each lineN.itemId) /
    CR GR/IR Clearing account (from company_posting_setup.grIrClearingAccountId).
    VAT is NOT recognised at GR — VAT lives on the AP Invoice (Phase C).
    """

    # GR document identity
    grDocId: UUID
    grDocNumber: str
    grDate: str
    """ISO date (YYYY-MM-DD). The accounting date for the JE."""

    # Source PO link
    poDocId: UUID
    poDocNumber: str

    # Counterparty + finance company
    vendorId: UUID
    vendorCode: Optional[str] = None
    companyCode: str

    # Lines and totals
    lines: List[GoodsReceivedLine]
    currencyCode: str = "AED"
    totalNetAmount: Decimal
    totalTaxAmount: Decimal
    totalGrossAmount: Decimal

    # Optional context
    warehouseId: Optional[str] = None
    notes: Optional[str] = None
    farmCode: Optional[str] = None
    """Legacy field retained for non-purchasing handlers; unused by GR posting."""


class ApInvoiceLine(BaseModel):
    """
    One line on an AP (vendor) invoice.

    Phase C contract. Each line traces back to the originating GR line via
    `grLineId`, which in turn carries `baseLineId` pointing to the PO line.
    Finance uses this chain for the three-way match audit.

    Variance accounting:
      - `poUnitPrice` and `invoiceUnitPrice` may differ. The system records
        `priceVarianceAmount = (invoiceUnitPrice - poUnitPrice) * quantity`
        per line and aggregates them at the header.
      - `quantity` always equals the GR receipt quantity in v1 — partial
        invoicing of one GR is deferred to a later phase.
    """

    lineNumber: int
    itemId: UUID
    itemCode: str
    itemName: str
    itemType: Literal["raw_material", "consumable", "service", "fixed_asset_acquisition"]
    quantity: Decimal
    uom: str
    poUnitPrice: Decimal
    invoiceUnitPrice: Decimal
    priceVarianceAmount: Decimal
    """(invoiceUnitPrice - poUnitPrice) * quantity. Positive = vendor over-billed."""
    lineNet: Decimal
    """quantity * invoiceUnitPrice. The basis for VAT and AP."""
    lineTax: Decimal
    lineGross: Decimal
    taxCode: Optional[str] = None
    costCenterId: Optional[str] = None
    """Optional cost-centre tag inherited from the PO/GR chain. The finance
    handler tags the GR/IR Clearing and Input VAT JE lines with this value
    (splitting one aggregate line per distinct cost centre). The CR AP Control
    line stays unsplit (vendor-level liability)."""
    grLineId: UUID
    """Link to the source GR line being invoiced."""
    baseLineId: Optional[UUID] = None
    """Link to the original PO line (traceability)."""


class ApInvoicePostedPayload(BaseModel):
    """
    Raised when an AP Invoice transitions Draft → Posted (Phase C).

    Finance action:
      DR GR/IR Clearing            (sum of lineNet — clears the GR holding)
      DR Input VAT                 (sum of lineTax — reclaimable from authority)
      DR Purchase Price Variance   (totalPriceVariance, only if non-zero)
      CR AP - Vendor Control       (sum of lineGross — vendor's specific liability)

    The AP Control account comes from company_posting_setup.apControlAccountId.
    The Input VAT account from posting setup. The variance account is
    posting_setup.purchasePriceVarianceAccountId — REQUIRED in production once
    Phase C is live; the handler rejects with 400 if it is null AND there is
    non-zero variance to post.
    """

    # AP Invoice document identity
    apDocId: UUID
    apDocNumber: str
    """Internal doc number, e.g. AP-2026-0001."""
    apDate: str
    """ISO date — accounting date for the JE. Usually the invoice receipt date."""
    invoiceNumber: str
    """The vendor's invoice number, as printed on their document."""
    invoiceDate: str
    """The vendor's invoice date (ISO). Used for audit + due-date calc."""
    dueDate: Optional[str] = None
    """ISO date when payment is due. Driven by paymentTermsCode + invoiceDate."""
    dateOfSupply: str = ""
    """
    ISO date — UAE VAT Article 25 date of supply (= GR docDate for purchases).

    The FTA-defined tax point is min(dateOfSupply, invoiceDate, paymentDate).
    At AP Invoice posting time (no payment yet) it is min(dateOfSupply, invoiceDate).
    The finance handler uses this date in the Input VAT line description so VAT
    return reports can reconstruct the tax point for each transaction.

    Defaults to "" (empty) so existing events that pre-date this field remain
    valid; the handler treats empty/missing as 'use invoiceDate as tax point'.
    """

    # Source GR + PO chain
    grDocId: UUID
    grDocNumber: str
    poDocId: UUID
    poDocNumber: str

    # Counterparty + finance company
    vendorId: UUID
    vendorCode: Optional[str] = None
    companyCode: str
    paymentTermsCode: Optional[str] = None

    # Lines and totals
    lines: List[ApInvoiceLine]
    currencyCode: str = "AED"
    totalNetAmount: Decimal
    """Sum of lineNet. Hits DR GR/IR Clearing."""
    totalTaxAmount: Decimal
    """Sum of lineTax. Hits DR Input VAT."""
    totalGrossAmount: Decimal
    """Sum of lineGross. Hits CR AP Control."""
    totalPriceVariance: Decimal
    """Sum of priceVarianceAmount per line. Hits DR Purchase Price Variance (if non-zero)."""

    # Optional context
    notes: Optional[str] = None


class HarvestRecordedPayload(BaseModel):
    """
    Raised when a harvest is finalised in the farm module.

    Finance action (Week 4): DR Finished-Goods Inventory, CR WIP/Production Cost.
    """

    harvestId: UUID
    plantDataId: UUID
    plantName: str
    blockCode: str
    farmCode: str
    """Maps to a cost centre."""
    quantityKg: Decimal
    cropCategory: Literal["vegetables", "herbs", "fruits", "blend"]
    standardCostPerKg: Decimal


class InventoryWastePayload(BaseModel):
    """
    Raised when inventory is written off as waste.

    Finance action (Week 4): DR Inventory Write-off Expense, CR Inventory.
    """

    sourceInventoryId: UUID
    cropCategory: Literal["vegetables", "herbs", "fruits", "blend"]
    quantityKg: Decimal
    farmCode: str
    standardCostPerKg: Decimal
    reason: Optional[str] = None


class CustomerPaymentPayload(BaseModel):
    """
    Raised when a customer payment is recorded.

    Finance action (Week 4): DR Bank, CR AR.
    """

    paymentId: UUID
    customerId: UUID
    amount: Decimal
    bankAccountCode: str
    """e.g. 'OPERATING_BANK' — maps to a GL account in the finance service."""
    paymentDate: datetime
    appliedInvoices: List[InvoiceApplication]


class VendorPaymentPayload(BaseModel):
    """
    Raised when a vendor payment is made.

    Finance action (Week 4): DR AP, CR Bank.
    """

    paymentId: UUID
    vendorId: UUID
    amount: Decimal
    bankAccountCode: str
    paymentDate: datetime
    appliedInvoices: List[InvoiceApplication]


class CustomerReturnPayload(BaseModel):
    """
    Raised when a customer return / credit note is processed.

    Finance action (Week 4): Reversal of original sales posting; optional
    inventory reinstatement if putBackInInventory=True.
    """

    returnId: UUID
    originalSalesOrderId: UUID
    customerId: UUID
    farmCode: str
    lines: List[SalesLine]
    """Quantities expressed as negatives to represent reversal."""
    totalNetAmount: Decimal
    """Negative value."""
    totalTaxAmount: Decimal
    totalGrossAmount: Decimal
    putBackInInventory: bool
    """If True, post DR FG Inventory, CR COGS reversal."""


class FertigationConsumedPayload(BaseModel):
    """
    Raised when fertilizer/chemicals are consumed during fertigation.

    Finance action (Week 4): DR Farm Expense (cost centre), CR Input Inventory.
    """

    blockCode: str
    farmCode: str
    fertilizerName: str
    quantityKg: Decimal
    unitCost: Decimal
    totalCost: Decimal


class OpeningBalancePayload(BaseModel):
    """
    Special cutover event — sets initial GL balances for a company code.

    Finance action (Week 4): post opening balance journal entries per account.
    """

    cutoverDate: datetime
    entries: List[OpeningBalanceEntry]


class ManualJournalPayload(BaseModel):
    """
    v2 placeholder for accountant-driven manual adjustments.

    Finance action (Week 4 / future): post the journal lines as-is.
    """

    description: str
    lines: List[ManualJournalLine]


# ---------------------------------------------------------------------------
# Purchasing master data change events (Phase 1A)
# ---------------------------------------------------------------------------


class VendorChangedPayload(BaseModel):
    """
    Emitted when a vendor is created, updated, or soft-deleted in the main app.

    Finance action: create/update vendor_finance_ext with default reconciliation
    account; on isDeleted=True mark ext row inactive.
    """

    vendorId: UUID
    vendorCode: str
    name: str
    trn: Optional[str] = None
    isActive: bool
    paymentTermsCode: Optional[str] = None
    currencyCode: str = "AED"
    creditLimit: Optional[Decimal] = None
    bankDetails: Optional[dict] = None
    contactInfo: Optional[dict] = None
    isDeleted: bool = False


class PurchaseItemChangedPayload(BaseModel):
    """
    Emitted when a purchase item is created, updated, or soft-deleted in the main app.

    Finance action: create/update purchase_item_finance_ext with default inventory
    account mapping based on itemType; on isDeleted=True mark ext row inactive.
    """

    itemId: UUID
    itemCode: str
    name: str
    itemType: Literal["raw_material", "consumable", "service", "fixed_asset_acquisition"]
    uom: str
    isActive: bool
    isDeleted: bool = False


class PaymentTermsChangedPayload(BaseModel):
    """
    Emitted when a payment terms record is created, updated, or soft-deleted.

    Finance action: log receipt only — operations holds the master for payment terms.
    """

    termsId: UUID
    termsCode: str
    description: str
    netDays: int
    isActive: bool
    isDeleted: bool = False


# ---------------------------------------------------------------------------
# Phase 1B — Purchase Request and Purchase Order state change events
# ---------------------------------------------------------------------------


class PurchaseRequestStateChangedPayload(BaseModel):
    """
    Emitted on PR state transitions (created, submitted, approved, rejected,
    cancelled, converted to PO).

    Finance action (Phase 3): accrue budget commitment on Approved;
    reverse on Rejected/Cancelled.
    """

    docId: UUID
    docNumber: str
    """PR-2026-0001 style"""
    state: Literal[
        "Draft",
        "Pending Approval",
        "Approved",
        "Rejected",
        "Cancelled",
        "Closed",
    ]
    previousState: Optional[str] = None
    organizationId: UUID
    companyCode: str
    requestedBy: UUID
    requestedDate: datetime
    department: Optional[str] = None
    urgency: Literal["low", "normal", "high"] = "normal"
    totalAmount: Decimal
    currencyCode: str = "AED"
    notes: Optional[str] = None
    approvalRequestedFrom: Optional[str] = None
    """Role or userId of the requested approver."""
    approvalDecidedBy: Optional[UUID] = None
    approvalComment: Optional[str] = None
    approvalHistory: Optional[List[dict]] = None
    """
    Ordered list of approval decisions for this document.  Null when not yet available
    (e.g. events emitted by older code or replayed from outbox without history).
    Today contains at most one entry; Phase F multi-step chains will have more.
    Finance consumers should treat this as an optional audit supplement.
    """


class PurchaseOrderStateChangedPayload(BaseModel):
    """
    Emitted on PO state transitions.

    Finance action (Phase 3): create AP accrual on Open; book receipt on
    Received; generate AP Invoice on Closed.
    """

    docId: UUID
    docNumber: str
    """PO-2026-0001 style"""
    state: Literal[
        "Draft",
        "Pending Approval",
        "Open",
        "Sent",
        "Partially Received",
        "Received",
        "Closed",
        "Cancelled",
    ]
    previousState: Optional[str] = None
    organizationId: UUID
    companyCode: str
    vendorId: Optional[UUID] = None
    vendorCode: Optional[str] = None
    issuedBy: UUID
    issuedDate: datetime
    expectedDeliveryDate: Optional[datetime] = None
    paymentTermsCode: Optional[str] = None
    dueDate: Optional[datetime] = None
    """Computed from issuedDate + payment terms net days."""
    baseDocId: Optional[UUID] = None
    """Set when the PO was created from a PR."""
    totalNet: Decimal
    totalTax: Decimal
    totalGross: Decimal
    currencyCode: str = "AED"
    notes: Optional[str] = None
    approvalHistory: Optional[List[dict]] = None
    """
    Ordered list of approval decisions for this document.  Null when not yet available
    (e.g. events emitted by older code or replayed from outbox without history).
    Today contains at most one entry; Phase F multi-step chains will have more.
    Finance consumers should treat this as an optional audit supplement.
    """


# ---------------------------------------------------------------------------
# Union + registry
# ---------------------------------------------------------------------------

EventPayload = Union[
    SalesOrderShippedPayload,
    PurchaseReceivedPayload,
    HarvestRecordedPayload,
    InventoryWastePayload,
    CustomerPaymentPayload,
    VendorPaymentPayload,
    CustomerReturnPayload,
    FertigationConsumedPayload,
    OpeningBalancePayload,
    ManualJournalPayload,
    VendorChangedPayload,
    PurchaseItemChangedPayload,
    PaymentTermsChangedPayload,
    PurchaseRequestStateChangedPayload,
    PurchaseOrderStateChangedPayload,
]

EVENT_TYPE_REGISTRY: Dict[str, Type[BaseModel]] = {
    "sales_order_shipped": SalesOrderShippedPayload,
    "purchase_received": PurchaseReceivedPayload,
    "ap_invoice_posted": ApInvoicePostedPayload,
    "harvest_recorded": HarvestRecordedPayload,
    "inventory_waste": InventoryWastePayload,
    "customer_payment": CustomerPaymentPayload,
    "vendor_payment": VendorPaymentPayload,
    "customer_return": CustomerReturnPayload,
    "fertigation_consumed": FertigationConsumedPayload,
    "opening_balance": OpeningBalancePayload,
    "manual_journal": ManualJournalPayload,
    # Phase 1A — Purchasing master data change events
    "vendor_changed": VendorChangedPayload,
    "purchase_item_changed": PurchaseItemChangedPayload,
    "payment_terms_changed": PaymentTermsChangedPayload,
    # Phase 1B — Purchase Request and Purchase Order state changes
    "pr_state_changed": PurchaseRequestStateChangedPayload,
    "po_state_changed": PurchaseOrderStateChangedPayload,
}
"""
Maps eventType discriminator strings to their payload Pydantic class.

Used at both ends of the bridge:
- OutboxWriter.publish(): validates payload before writing to MongoDB.
- Finance ingest endpoint: validates payload before recording as processed.

To add a new event type (Week 4+):
    1. Define a new payload class inheriting BaseModel.
    2. Add it to EventPayload union.
    3. Register it here with a snake_case key.
    4. Both services pick it up automatically on next restart.
"""
