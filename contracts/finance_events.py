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


class PurchaseLine(BaseModel):
    """One line on a purchase goods receipt."""

    itemType: Literal["raw_material", "consumable", "fixed_asset", "expense"]
    itemName: str
    quantity: Decimal
    unit: str
    unitCost: Decimal
    lineTotal: Decimal
    taxCode: str
    taxAmount: Decimal
    glAccountHint: Optional[str] = None
    """Optional account suggestion; finance service resolves to actual account."""


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
    Raised when a purchase order goods receipt is confirmed.

    Finance action (Week 4): DR appropriate asset/expense account, DR VAT Input, CR AP.
    """

    purchaseOrderId: UUID
    vendorId: UUID
    farmCode: Optional[str] = None
    lines: List[PurchaseLine]
    totalNetAmount: Decimal
    totalTaxAmount: Decimal
    totalGrossAmount: Decimal


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
]

EVENT_TYPE_REGISTRY: Dict[str, Type[BaseModel]] = {
    "sales_order_shipped": SalesOrderShippedPayload,
    "purchase_received": PurchaseReceivedPayload,
    "harvest_recorded": HarvestRecordedPayload,
    "inventory_waste": InventoryWastePayload,
    "customer_payment": CustomerPaymentPayload,
    "vendor_payment": VendorPaymentPayload,
    "customer_return": CustomerReturnPayload,
    "fertigation_consumed": FertigationConsumedPayload,
    "opening_balance": OpeningBalancePayload,
    "manual_journal": ManualJournalPayload,
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
