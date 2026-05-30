"""
Tests for the Customer Receipt backend — T-100.10.

Uses the same in-memory fake Motor DB pattern as test_ar_invoices.py.

All tests call service functions directly; route-level auth is tested via
role/permission checks in the API layer.

Run:
    pytest src/modules/sales/tests/test_customer_receipts.py -v

All async tests use pytest-asyncio with asyncio_mode = "auto".
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, patch

import pytest

from src.core.documents.document_status import DocumentStatus
from src.modules.sales.models.customer_receipts import (
    CustomerReceiptCreate,
    CustomerReceiptFromInvoiceRequest,
    CustomerReceiptStatusTransitionRequest,
    CustomerReceiptUpdate,
    ReceiptAllocationCreate,
)
from src.modules.sales.services.customer_receipt_service import (
    create_customer_receipt,
    create_customer_receipt_from_invoice,
    delete_customer_receipt,
    get_customer_receipt,
    list_customer_receipts,
    transition_status,
    update_customer_receipt,
)

# ---------------------------------------------------------------------------
# In-memory fake Motor DB — mirrors the pattern from test_ar_invoices.py
# ---------------------------------------------------------------------------


class _FakeCollection:
    """Minimal fake Motor collection backed by an in-memory list."""

    def __init__(self) -> None:
        self._docs: List[Dict[str, Any]] = []

    async def find_one(self, query: Dict[str, Any], *args: Any, **kwargs: Any) -> Any:
        for doc in self._docs:
            if _matches(doc, query):
                return dict(doc)
        return None

    def find(
        self,
        query: Dict[str, Any] = None,
        projection: Any = None,
        *args: Any,
        **kwargs: Any,
    ) -> "_FakeCursor":
        query = query or {}
        matched = [dict(d) for d in self._docs if _matches(d, query)]
        return _FakeCursor(matched)

    async def find_one_and_update(
        self, query: Dict[str, Any], update: Dict[str, Any], **kwargs: Any
    ) -> Any:
        upsert = kwargs.get("upsert", False)
        for doc in self._docs:
            if _matches(doc, query):
                _apply_update(doc, update)
                return doc
        if upsert:
            new_doc: Dict[str, Any] = {}
            if "_id" in query:
                new_doc["_id"] = query["_id"]
            _apply_update(new_doc, update)
            self._docs.append(new_doc)
            return new_doc
        return None

    async def update_one(
        self, query: Dict[str, Any], update: Dict[str, Any], **kwargs: Any
    ) -> None:
        for doc in self._docs:
            if _matches(doc, query):
                _apply_update_embedded(doc, query, update)
                return

    async def insert_one(self, doc: Dict[str, Any], **kwargs: Any) -> None:
        copy = dict(doc)
        self._docs.append(copy)

    async def delete_one(self, query: Dict[str, Any], **kwargs: Any) -> None:
        for i, doc in enumerate(self._docs):
            if _matches(doc, query):
                del self._docs[i]
                return

    async def count_documents(self, query: Dict[str, Any], **kwargs: Any) -> int:
        return sum(1 for d in self._docs if _matches(d, query))

    def _add(self, doc: Dict[str, Any]) -> None:
        """Test helper: directly insert a document."""
        self._docs.append(doc)


class _FakeCursor:
    def __init__(self, docs: List[Dict[str, Any]]) -> None:
        self._docs = docs

    def sort(self, *args: Any, **kwargs: Any) -> "_FakeCursor":
        return self

    def skip(self, n: int) -> "_FakeCursor":
        return _FakeCursor(self._docs[n:])

    def limit(self, n: int) -> "_FakeCursor":
        return _FakeCursor(self._docs[:n])

    async def to_list(self, length: Any = None) -> List[Dict[str, Any]]:
        if length is not None:
            return self._docs[:length]
        return self._docs


class _FakeDB:
    """Minimal fake Motor database with embedded-document support."""

    def __init__(self) -> None:
        self._collections: Dict[str, _FakeCollection] = {}

    def __getitem__(self, name: str) -> _FakeCollection:
        if name not in self._collections:
            self._collections[name] = _FakeCollection()
        return self._collections[name]


# ---------------------------------------------------------------------------
# Query / update helpers (copied from test_ar_invoices.py pattern)
# ---------------------------------------------------------------------------


def _matches(doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
    """Simple query matcher supporting equality, $gte, $lte, $ne, $in."""
    for key, val in query.items():
        if "." in key:
            parts = key.split(".", 1)
            parent_key = parts[0]
            child_key = parts[1]
            parent_val = doc.get(parent_key)
            if isinstance(parent_val, list):
                found = any(
                    _matches(item, {child_key: val})
                    for item in parent_val
                    if isinstance(item, dict)
                )
                if not found:
                    return False
            elif isinstance(parent_val, dict):
                if not _matches(parent_val, {child_key: val}):
                    return False
            else:
                return False
            continue

        doc_val = doc.get(key)
        if isinstance(val, dict):
            for op, operand in val.items():
                if op == "$gte":
                    if doc_val is None or doc_val < operand:
                        return False
                elif op == "$lte":
                    if doc_val is None or doc_val > operand:
                        return False
                elif op == "$ne":
                    if doc_val == operand:
                        return False
                elif op == "$in":
                    if doc_val not in operand:
                        return False
        else:
            if doc_val != val:
                return False
    return True


def _apply_update(doc: Dict[str, Any], update: Dict[str, Any]) -> None:
    if "$set" in update:
        for key, val in update["$set"].items():
            if ".$." not in key:
                # Handle nested key like "totals.paidAmount"
                if "." in key:
                    parts = key.split(".", 1)
                    if parts[0] not in doc:
                        doc[parts[0]] = {}
                    if isinstance(doc.get(parts[0]), dict):
                        doc[parts[0]][parts[1]] = val
                    else:
                        doc[key] = val
                else:
                    doc[key] = val
    if "$inc" in update:
        for field, delta in update["$inc"].items():
            if ".$." not in field:
                if "." in field:
                    # Handle nested increment like "totals.paidAmount"
                    parts = field.split(".", 1)
                    if parts[0] not in doc:
                        doc[parts[0]] = {}
                    if isinstance(doc.get(parts[0]), dict):
                        current = doc[parts[0]].get(parts[1], 0)
                        doc[parts[0]][parts[1]] = current + delta
                    else:
                        doc[field] = doc.get(field, 0) + delta
                else:
                    doc[field] = doc.get(field, 0) + delta
    if "$push" in update:
        for field, val in update["$push"].items():
            if ".$." not in field:
                if field not in doc:
                    doc[field] = []
                doc[field].append(val)


def _apply_update_embedded(
    doc: Dict[str, Any], query: Dict[str, Any], update: Dict[str, Any]
) -> None:
    """Apply updates including positional operator ($) on embedded arrays."""
    line_id_query: Optional[str] = None
    for k, v in query.items():
        if k == "lines.lineId":
            line_id_query = v

    _apply_update(doc, update)


# ---------------------------------------------------------------------------
# Test fixtures and constants
# ---------------------------------------------------------------------------

ORG_ID = "org-test-cr-001"
OTHER_ORG_ID = "org-test-cr-other"
USER_ID = "user-cr-abc-123"
COMPANY_CODE = "A001"
CUSTOMER_ID = "customer-cr-001"
OTHER_CUSTOMER_ID = "customer-cr-002"
CUSTOMER_NAME = "Test CR Customer"
BANK_ACCOUNT_ID = "gl-bank-001"

ARI_1_DOC_ENTRY = str(uuid.uuid4())
ARI_1_DOC_NUMBER = "ARI-2026-0001"
ARI_2_DOC_ENTRY = str(uuid.uuid4())
ARI_2_DOC_NUMBER = "ARI-2026-0002"
ARI_OTHER_CUST_ENTRY = str(uuid.uuid4())
ARI_OTHER_CUST_NUMBER = "ARI-2026-0099"


def _make_ar_invoice(
    doc_entry: str = ARI_1_DOC_ENTRY,
    doc_number: str = ARI_1_DOC_NUMBER,
    customer_id: str = CUSTOMER_ID,
    status: str = "open",
    gross: float = 500.0,
    paid_amount: float = 0.0,
    down_payment: float = 0.0,
    org_id: str = ORG_ID,
) -> Dict[str, Any]:
    """Build a minimal ar_invoices_v2 document for testing."""
    open_amount = gross - paid_amount - down_payment
    return {
        "docEntry": doc_entry,
        "docNumber": doc_number,
        "docType": "AR_INVOICE",
        "organizationId": org_id,
        "companyCode": COMPANY_CODE,
        "customerId": customer_id,
        "customerName": CUSTOMER_NAME,
        "docDate": date(2026, 1, 15),
        "dateOfSupply": date(2026, 1, 15),
        "invoiceDate": date(2026, 1, 15),
        "taxDate": date(2026, 1, 15),
        "dueDate": date(2026, 2, 15),
        "currency": "AED",
        "exchangeRate": 1.0,
        "status": status,
        "totals": {
            "net": round(gross / 1.05, 2),
            "tax": round(gross - gross / 1.05, 2),
            "gross": gross,
            "downPaymentApplied": down_payment,
            "paidAmount": paid_amount,
            "openAmount": open_amount,
        },
        "targetDocRefs": [],
        "outboxEventId": "original-event-id-001" if status == "open" else None,
        "createdAt": datetime.now(tz=timezone.utc),
        "createdBy": USER_ID,
        "updatedAt": datetime.now(tz=timezone.utc),
        "updatedBy": USER_ID,
    }


def _make_create_payload(
    amount_received: Decimal = Decimal("500.00"),
    allocations: Optional[List[ReceiptAllocationCreate]] = None,
    customer_id: str = CUSTOMER_ID,
) -> CustomerReceiptCreate:
    """Build a minimal CustomerReceiptCreate payload."""
    if allocations is None:
        allocations = [
            ReceiptAllocationCreate(
                ar_invoice_doc_entry=ARI_1_DOC_ENTRY,
                ar_invoice_doc_number=ARI_1_DOC_NUMBER,
                amount_applied=amount_received,
            )
        ]
    return CustomerReceiptCreate(
        organization_id=ORG_ID,
        company_code=COMPANY_CODE,
        customer_id=customer_id,
        customer_name=CUSTOMER_NAME,
        doc_date=date(2026, 2, 1),
        payment_method="bank_transfer",
        payment_ref="REF-001",
        bank_account_id=BANK_ACCOUNT_ID,
        currency="AED",
        exchange_rate=Decimal("1.0"),
        amount_received=amount_received,
        allocations=allocations,
    )


def _open_transition() -> CustomerReceiptStatusTransitionRequest:
    """Build a transition request to OPEN."""
    return CustomerReceiptStatusTransitionRequest(new_status=DocumentStatus.OPEN)


def _cancel_transition() -> CustomerReceiptStatusTransitionRequest:
    """Build a transition request to CANCELLED."""
    return CustomerReceiptStatusTransitionRequest(
        new_status=DocumentStatus.CANCELLED, reason="Test cancellation"
    )


# ---------------------------------------------------------------------------
# Tests: create_customer_receipt — happy paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_single_allocation_happy_path() -> None:
    """
    Create Receipt with a single allocation → DRAFT, doc_number IPAY-YYYY-NNNN.
    """
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ar_invoice())

    payload = _make_create_payload()
    receipt = await create_customer_receipt(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)

    assert receipt.status == DocumentStatus.DRAFT
    assert receipt.doc_number.startswith("IPAY-")
    assert len(receipt.allocations) == 1
    assert receipt.allocations[0].ar_invoice_doc_entry == ARI_1_DOC_ENTRY
    assert receipt.allocations[0].amount_applied == Decimal("500.00")
    assert receipt.amount_received == Decimal("500.00")
    assert receipt.unallocated_amount == Decimal("0.00")
    assert receipt.customer_id == CUSTOMER_ID
    assert receipt.bank_account_id == BANK_ACCOUNT_ID
    assert receipt.outbox_event_id is None  # Not emitted at DRAFT


@pytest.mark.asyncio
async def test_create_multiple_allocations_summing_correctly() -> None:
    """
    Create Receipt with two allocations summing to amount_received → 200.
    """
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ar_invoice(doc_entry=ARI_1_DOC_ENTRY, gross=300.0))
    db["ar_invoices_v2"]._add(
        _make_ar_invoice(doc_entry=ARI_2_DOC_ENTRY, doc_number=ARI_2_DOC_NUMBER, gross=200.0)
    )

    payload = _make_create_payload(
        amount_received=Decimal("500.00"),
        allocations=[
            ReceiptAllocationCreate(
                ar_invoice_doc_entry=ARI_1_DOC_ENTRY,
                ar_invoice_doc_number=ARI_1_DOC_NUMBER,
                amount_applied=Decimal("300.00"),
            ),
            ReceiptAllocationCreate(
                ar_invoice_doc_entry=ARI_2_DOC_ENTRY,
                ar_invoice_doc_number=ARI_2_DOC_NUMBER,
                amount_applied=Decimal("200.00"),
            ),
        ],
    )
    receipt = await create_customer_receipt(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)

    assert receipt.status == DocumentStatus.DRAFT
    assert len(receipt.allocations) == 2
    assert receipt.amount_received == Decimal("500.00")
    assert receipt.unallocated_amount == Decimal("0.00")
    assert len(receipt.base_doc_refs) == 2


# ---------------------------------------------------------------------------
# Tests: create_customer_receipt — validation errors
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_allocations_not_summing_to_amount_received() -> None:
    """
    Create Receipt where allocations sum != amount_received → ValidationError (422).
    """
    with pytest.raises(Exception):
        CustomerReceiptCreate(
            organization_id=ORG_ID,
            company_code=COMPANY_CODE,
            customer_id=CUSTOMER_ID,
            customer_name=CUSTOMER_NAME,
            doc_date=date(2026, 2, 1),
            payment_method="cash",
            bank_account_id=BANK_ACCOUNT_ID,
            amount_received=Decimal("500.00"),
            allocations=[
                ReceiptAllocationCreate(
                    ar_invoice_doc_entry=ARI_1_DOC_ENTRY,
                    ar_invoice_doc_number=ARI_1_DOC_NUMBER,
                    amount_applied=Decimal("300.00"),  # Does not equal 500
                )
            ],
        )


@pytest.mark.asyncio
async def test_create_allocation_against_draft_invoice() -> None:
    """
    Create Receipt against a DRAFT AR Invoice → ValueError (409-class error).
    """
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ar_invoice(status="draft"))

    payload = _make_create_payload()
    with pytest.raises(ValueError, match="in status 'draft'"):
        await create_customer_receipt(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)


@pytest.mark.asyncio
async def test_create_allocation_against_closed_invoice() -> None:
    """
    Create Receipt against a CLOSED AR Invoice → ValueError (409-class error).
    """
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ar_invoice(status="closed"))

    payload = _make_create_payload()
    with pytest.raises(ValueError, match="in status 'closed'"):
        await create_customer_receipt(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)


@pytest.mark.asyncio
async def test_create_allocation_amount_exceeds_invoice_open_amount() -> None:
    """
    Create Receipt with allocation exceeding invoice open_amount → ValueError (422-class).
    """
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ar_invoice(gross=200.0))  # open_amount = 200

    payload = _make_create_payload(
        amount_received=Decimal("250.00"),
        allocations=[
            ReceiptAllocationCreate(
                ar_invoice_doc_entry=ARI_1_DOC_ENTRY,
                ar_invoice_doc_number=ARI_1_DOC_NUMBER,
                amount_applied=Decimal("250.00"),  # Exceeds 200
            )
        ],
    )
    with pytest.raises(ValueError, match="open_amount"):
        await create_customer_receipt(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)


@pytest.mark.asyncio
async def test_create_allocation_wrong_customer() -> None:
    """
    Create Receipt where allocation targets an invoice belonging to a different customer → ValueError.
    """
    db = _FakeDB()
    db["ar_invoices_v2"]._add(
        _make_ar_invoice(
            doc_entry=ARI_OTHER_CUST_ENTRY,
            doc_number=ARI_OTHER_CUST_NUMBER,
            customer_id=OTHER_CUSTOMER_ID,
            gross=500.0,
        )
    )

    payload = CustomerReceiptCreate(
        organization_id=ORG_ID,
        company_code=COMPANY_CODE,
        customer_id=CUSTOMER_ID,  # Receipt is for customer A
        customer_name=CUSTOMER_NAME,
        doc_date=date(2026, 2, 1),
        payment_method="bank_transfer",
        bank_account_id=BANK_ACCOUNT_ID,
        amount_received=Decimal("500.00"),
        allocations=[
            ReceiptAllocationCreate(
                ar_invoice_doc_entry=ARI_OTHER_CUST_ENTRY,  # But invoice is for customer B
                ar_invoice_doc_number=ARI_OTHER_CUST_NUMBER,
                amount_applied=Decimal("500.00"),
            )
        ],
    )
    with pytest.raises(ValueError, match="customer"):
        await create_customer_receipt(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)


@pytest.mark.asyncio
async def test_create_duplicate_allocation_rejected_by_schema() -> None:
    """
    Create Receipt with duplicate ar_invoice_doc_entry in allocations → ValidationError.
    """
    with pytest.raises(Exception, match="Duplicate"):
        CustomerReceiptCreate(
            organization_id=ORG_ID,
            company_code=COMPANY_CODE,
            customer_id=CUSTOMER_ID,
            customer_name=CUSTOMER_NAME,
            doc_date=date(2026, 2, 1),
            payment_method="bank_transfer",
            bank_account_id=BANK_ACCOUNT_ID,
            amount_received=Decimal("1000.00"),
            allocations=[
                ReceiptAllocationCreate(
                    ar_invoice_doc_entry=ARI_1_DOC_ENTRY,
                    ar_invoice_doc_number=ARI_1_DOC_NUMBER,
                    amount_applied=Decimal("500.00"),
                ),
                ReceiptAllocationCreate(
                    ar_invoice_doc_entry=ARI_1_DOC_ENTRY,  # Duplicate
                    ar_invoice_doc_number=ARI_1_DOC_NUMBER,
                    amount_applied=Decimal("500.00"),
                ),
            ],
        )


# ---------------------------------------------------------------------------
# Tests: create_customer_receipt_from_invoice (shortcut)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_from_invoice_happy_path() -> None:
    """
    Create Receipt from invoice shortcut — single-allocation receipt for full open_amount.
    """
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ar_invoice(gross=500.0))

    payload = CustomerReceiptFromInvoiceRequest(
        company_code=COMPANY_CODE,
        doc_date=date(2026, 2, 1),
        payment_method="bank_transfer",
        payment_ref="TRF-001",
        bank_account_id=BANK_ACCOUNT_ID,
    )
    receipt = await create_customer_receipt_from_invoice(
        db,
        ar_invoice_doc_entry=ARI_1_DOC_ENTRY,
        payload=payload,
        org_id=ORG_ID,
        user_id=USER_ID,
    )

    assert receipt.status == DocumentStatus.DRAFT
    assert len(receipt.allocations) == 1
    assert receipt.allocations[0].ar_invoice_doc_entry == ARI_1_DOC_ENTRY
    # Should default to full open_amount (500.00)
    assert receipt.amount_received == Decimal("500.00")
    assert receipt.allocations[0].amount_applied == Decimal("500.00")


# ---------------------------------------------------------------------------
# Tests: DRAFT → OPEN transition (the payment event)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_open_transition_increments_ar_invoice_paid_amount() -> None:
    """
    DRAFT → OPEN: AR Invoice paid_amount incremented; status transitions to CLOSED
    (full payment); outbox event emitted; back-pointer added to invoice.
    """
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ar_invoice(gross=500.0, paid_amount=0.0))

    payload = _make_create_payload(amount_received=Decimal("500.00"))

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value="event-cr-001",
    ):
        receipt = await create_customer_receipt(
            db, payload=payload, org_id=ORG_ID, user_id=USER_ID
        )
        result = await transition_status(
            db, doc_entry=receipt.doc_entry, request_body=_open_transition(),
            org_id=ORG_ID, user_id=USER_ID,
        )

    assert result.status == DocumentStatus.OPEN
    assert result.outbox_event_id == "event-cr-001"

    # Check AR Invoice was updated.
    ari_raw = await db["ar_invoices_v2"].find_one(
        {"docEntry": ARI_1_DOC_ENTRY, "organizationId": ORG_ID}
    )
    assert ari_raw["totals"]["paidAmount"] == 500.0
    assert ari_raw["totals"]["openAmount"] == 0.0
    # Full payment → CLOSED
    assert ari_raw["status"] == "closed"
    # Back-pointer added to AR Invoice
    assert any(
        ref.get("docId") == receipt.doc_entry
        for ref in ari_raw.get("targetDocRefs", [])
    )


@pytest.mark.asyncio
async def test_open_transition_partial_payment_sets_partly_closed() -> None:
    """
    DRAFT → OPEN with partial payment: AR Invoice transitions to PARTLY_CLOSED.
    """
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ar_invoice(gross=500.0, paid_amount=0.0))

    payload = _make_create_payload(
        amount_received=Decimal("200.00"),
        allocations=[
            ReceiptAllocationCreate(
                ar_invoice_doc_entry=ARI_1_DOC_ENTRY,
                ar_invoice_doc_number=ARI_1_DOC_NUMBER,
                amount_applied=Decimal("200.00"),
            )
        ],
    )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value="event-partial-001",
    ):
        receipt = await create_customer_receipt(
            db, payload=payload, org_id=ORG_ID, user_id=USER_ID
        )
        await transition_status(
            db, doc_entry=receipt.doc_entry, request_body=_open_transition(),
            org_id=ORG_ID, user_id=USER_ID,
        )

    ari_raw = await db["ar_invoices_v2"].find_one(
        {"docEntry": ARI_1_DOC_ENTRY, "organizationId": ORG_ID}
    )
    assert ari_raw["totals"]["paidAmount"] == 200.0
    assert ari_raw["totals"]["openAmount"] == 300.0
    assert ari_raw["status"] == "partly_closed"


@pytest.mark.asyncio
async def test_open_transition_two_allocations_both_invoices_closed() -> None:
    """
    DRAFT → OPEN with two allocations each fully paying their invoice → both CLOSED.
    """
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ar_invoice(doc_entry=ARI_1_DOC_ENTRY, gross=300.0))
    db["ar_invoices_v2"]._add(
        _make_ar_invoice(doc_entry=ARI_2_DOC_ENTRY, doc_number=ARI_2_DOC_NUMBER, gross=200.0)
    )

    payload = _make_create_payload(
        amount_received=Decimal("500.00"),
        allocations=[
            ReceiptAllocationCreate(
                ar_invoice_doc_entry=ARI_1_DOC_ENTRY,
                ar_invoice_doc_number=ARI_1_DOC_NUMBER,
                amount_applied=Decimal("300.00"),
            ),
            ReceiptAllocationCreate(
                ar_invoice_doc_entry=ARI_2_DOC_ENTRY,
                ar_invoice_doc_number=ARI_2_DOC_NUMBER,
                amount_applied=Decimal("200.00"),
            ),
        ],
    )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value="event-two-alloc-001",
    ):
        receipt = await create_customer_receipt(
            db, payload=payload, org_id=ORG_ID, user_id=USER_ID
        )
        await transition_status(
            db, doc_entry=receipt.doc_entry, request_body=_open_transition(),
            org_id=ORG_ID, user_id=USER_ID,
        )

    ari1 = await db["ar_invoices_v2"].find_one(
        {"docEntry": ARI_1_DOC_ENTRY, "organizationId": ORG_ID}
    )
    ari2 = await db["ar_invoices_v2"].find_one(
        {"docEntry": ARI_2_DOC_ENTRY, "organizationId": ORG_ID}
    )
    assert ari1["status"] == "closed"
    assert ari2["status"] == "closed"


# ---------------------------------------------------------------------------
# Tests: OPEN → CANCELLED (cancellation reversal)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancel_reverses_ar_invoice_paid_amount() -> None:
    """
    OPEN → CANCELLED: AR Invoice paid_amount decremented; status restored to OPEN.
    """
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ar_invoice(gross=500.0, paid_amount=0.0))

    payload = _make_create_payload(amount_received=Decimal("500.00"))

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value="event-open-001",
    ):
        receipt = await create_customer_receipt(
            db, payload=payload, org_id=ORG_ID, user_id=USER_ID
        )
        opened = await transition_status(
            db, doc_entry=receipt.doc_entry, request_body=_open_transition(),
            org_id=ORG_ID, user_id=USER_ID,
        )
        assert opened.status == DocumentStatus.OPEN

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value="event-cancel-001",
    ):
        cancelled = await transition_status(
            db, doc_entry=receipt.doc_entry, request_body=_cancel_transition(),
            org_id=ORG_ID, user_id=USER_ID,
        )

    assert cancelled.status == DocumentStatus.CANCELLED

    # AR Invoice should be restored to OPEN with paid_amount = 0.
    ari_raw = await db["ar_invoices_v2"].find_one(
        {"docEntry": ARI_1_DOC_ENTRY, "organizationId": ORG_ID}
    )
    assert ari_raw["totals"]["paidAmount"] == 0.0
    assert ari_raw["status"] == "open"


@pytest.mark.asyncio
async def test_cancel_restores_partly_closed_when_other_receipts_remain() -> None:
    """
    OPEN → CANCELLED: when another receipt already paid part of the invoice,
    status restores to PARTLY_CLOSED (not OPEN).
    """
    db = _FakeDB()
    # Invoice already has 100 paid by a previous receipt (not this one)
    db["ar_invoices_v2"]._add(_make_ar_invoice(gross=500.0, paid_amount=100.0))

    # This receipt pays another 200
    payload = _make_create_payload(
        amount_received=Decimal("200.00"),
        allocations=[
            ReceiptAllocationCreate(
                ar_invoice_doc_entry=ARI_1_DOC_ENTRY,
                ar_invoice_doc_number=ARI_1_DOC_NUMBER,
                amount_applied=Decimal("200.00"),
            )
        ],
    )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value="event-partly-001",
    ):
        receipt = await create_customer_receipt(
            db, payload=payload, org_id=ORG_ID, user_id=USER_ID
        )
        await transition_status(
            db, doc_entry=receipt.doc_entry, request_body=_open_transition(),
            org_id=ORG_ID, user_id=USER_ID,
        )

    # paid_amount is now 300 (100 pre-existing + 200 this receipt)

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value="event-partly-cancel-001",
    ):
        await transition_status(
            db, doc_entry=receipt.doc_entry, request_body=_cancel_transition(),
            org_id=ORG_ID, user_id=USER_ID,
        )

    # After cancelling this receipt (-200), paid_amount = 100 (the other receipt remains).
    ari_raw = await db["ar_invoices_v2"].find_one(
        {"docEntry": ARI_1_DOC_ENTRY, "organizationId": ORG_ID}
    )
    assert ari_raw["totals"]["paidAmount"] == 100.0
    # Still has 100 paid → PARTLY_CLOSED (not OPEN)
    assert ari_raw["status"] == "partly_closed"


# ---------------------------------------------------------------------------
# Tests: concurrent payment guard
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_concurrent_payment_second_open_fails_cleanly() -> None:
    """
    Two Receipts target the same invoice. The second OPEN-transition fails when
    the first has already consumed the open_amount.
    """
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ar_invoice(gross=500.0, paid_amount=0.0))

    payload1 = _make_create_payload(amount_received=Decimal("500.00"))
    payload2 = _make_create_payload(amount_received=Decimal("500.00"))

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value="event-conc-001",
    ):
        receipt1 = await create_customer_receipt(
            db, payload=payload1, org_id=ORG_ID, user_id=USER_ID
        )
        receipt2 = await create_customer_receipt(
            db, payload=payload2, org_id=ORG_ID, user_id=USER_ID
        )

        # First receipt posts successfully.
        await transition_status(
            db, doc_entry=receipt1.doc_entry, request_body=_open_transition(),
            org_id=ORG_ID, user_id=USER_ID,
        )

        # Second receipt tries to post against the same now-paid invoice → should fail.
        with pytest.raises(ValueError, match="open_amount|status"):
            await transition_status(
                db, doc_entry=receipt2.doc_entry, request_body=_open_transition(),
                org_id=ORG_ID, user_id=USER_ID,
            )


# ---------------------------------------------------------------------------
# Tests: update and delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_patch_draft_receipt_succeeds() -> None:
    """
    PATCH on a DRAFT receipt → 200, fields updated.
    """
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ar_invoice())

    payload = _make_create_payload()
    receipt = await create_customer_receipt(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)

    update = CustomerReceiptUpdate(notes="Updated notes", payment_ref="NEW-REF-999")
    updated = await update_customer_receipt(
        db, doc_entry=receipt.doc_entry, payload=update, org_id=ORG_ID, user_id=USER_ID
    )
    assert updated is not None
    assert updated.notes == "Updated notes"
    assert updated.payment_ref == "NEW-REF-999"


@pytest.mark.asyncio
async def test_patch_open_receipt_rejected() -> None:
    """
    PATCH on an OPEN receipt → ValueError (409-class).
    """
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ar_invoice())

    payload = _make_create_payload()

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value="event-patch-001",
    ):
        receipt = await create_customer_receipt(
            db, payload=payload, org_id=ORG_ID, user_id=USER_ID
        )
        await transition_status(
            db, doc_entry=receipt.doc_entry, request_body=_open_transition(),
            org_id=ORG_ID, user_id=USER_ID,
        )

    update = CustomerReceiptUpdate(notes="Attempt to update")
    with pytest.raises(ValueError, match="only DRAFT"):
        await update_customer_receipt(
            db, doc_entry=receipt.doc_entry, payload=update, org_id=ORG_ID, user_id=USER_ID
        )


@pytest.mark.asyncio
async def test_delete_draft_receipt_succeeds() -> None:
    """
    DELETE a DRAFT receipt → True (204).
    """
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ar_invoice())

    payload = _make_create_payload()
    receipt = await create_customer_receipt(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)

    deleted = await delete_customer_receipt(
        db, doc_entry=receipt.doc_entry, org_id=ORG_ID, user_id=USER_ID
    )
    assert deleted is True

    # Receipt should be gone.
    retrieved = await get_customer_receipt(db, doc_entry=receipt.doc_entry, org_id=ORG_ID)
    assert retrieved is None


@pytest.mark.asyncio
async def test_delete_open_receipt_rejected() -> None:
    """
    DELETE an OPEN receipt → ValueError (409-class).
    """
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ar_invoice())

    payload = _make_create_payload()

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value="event-del-001",
    ):
        receipt = await create_customer_receipt(
            db, payload=payload, org_id=ORG_ID, user_id=USER_ID
        )
        await transition_status(
            db, doc_entry=receipt.doc_entry, request_body=_open_transition(),
            org_id=ORG_ID, user_id=USER_ID,
        )

    with pytest.raises(ValueError, match="only DRAFT"):
        await delete_customer_receipt(
            db, doc_entry=receipt.doc_entry, org_id=ORG_ID, user_id=USER_ID
        )


# ---------------------------------------------------------------------------
# Tests: list, get, cross-org isolation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_receipt_not_found_returns_none() -> None:
    """
    GET with unknown doc_entry → None.
    """
    db = _FakeDB()
    result = await get_customer_receipt(db, doc_entry="nonexistent-uuid", org_id=ORG_ID)
    assert result is None


@pytest.mark.asyncio
async def test_list_receipts_pagination() -> None:
    """
    Create two receipts; list returns both with correct pagination metadata.
    """
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ar_invoice(doc_entry=ARI_1_DOC_ENTRY, gross=300.0))
    db["ar_invoices_v2"]._add(
        _make_ar_invoice(doc_entry=ARI_2_DOC_ENTRY, doc_number=ARI_2_DOC_NUMBER, gross=200.0)
    )

    p1 = _make_create_payload(
        amount_received=Decimal("300.00"),
        allocations=[
            ReceiptAllocationCreate(
                ar_invoice_doc_entry=ARI_1_DOC_ENTRY,
                ar_invoice_doc_number=ARI_1_DOC_NUMBER,
                amount_applied=Decimal("300.00"),
            )
        ],
    )
    p2 = _make_create_payload(
        amount_received=Decimal("200.00"),
        allocations=[
            ReceiptAllocationCreate(
                ar_invoice_doc_entry=ARI_2_DOC_ENTRY,
                ar_invoice_doc_number=ARI_2_DOC_NUMBER,
                amount_applied=Decimal("200.00"),
            )
        ],
    )
    await create_customer_receipt(db, payload=p1, org_id=ORG_ID, user_id=USER_ID)
    await create_customer_receipt(db, payload=p2, org_id=ORG_ID, user_id=USER_ID)

    result = await list_customer_receipts(db, org_id=ORG_ID, page=1, size=10)
    assert result["total"] == 2
    assert len(result["items"]) == 2


@pytest.mark.asyncio
async def test_cross_org_isolation() -> None:
    """
    A receipt created for ORG_ID is not visible to OTHER_ORG_ID.
    """
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ar_invoice())

    payload = _make_create_payload()
    receipt = await create_customer_receipt(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)

    # Query from different org should find nothing.
    retrieved = await get_customer_receipt(db, doc_entry=receipt.doc_entry, org_id=OTHER_ORG_ID)
    assert retrieved is None

    result = await list_customer_receipts(db, org_id=OTHER_ORG_ID)
    assert result["total"] == 0


# ---------------------------------------------------------------------------
# Tests: outbox event emission
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_open_transition_emits_outbox_event() -> None:
    """
    DRAFT → OPEN: customer_payment_received outbox event emitted and event_id stored.
    """
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ar_invoice())

    payload = _make_create_payload()

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value="event-outbox-001",
    ) as mock_publish:
        receipt = await create_customer_receipt(
            db, payload=payload, org_id=ORG_ID, user_id=USER_ID
        )
        result = await transition_status(
            db, doc_entry=receipt.doc_entry, request_body=_open_transition(),
            org_id=ORG_ID, user_id=USER_ID,
        )

        mock_publish.assert_called_once()
        call_kwargs = mock_publish.call_args.kwargs
        assert call_kwargs["event_type"] == "customer_payment_received"
        assert call_kwargs["organization_id"] == ORG_ID

    assert result.outbox_event_id == "event-outbox-001"
    assert result.outbox_event_emitted_at is not None


@pytest.mark.asyncio
async def test_cancel_transition_emits_cancellation_event() -> None:
    """
    OPEN → CANCELLED: customer_payment_cancelled event emitted.
    """
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ar_invoice())

    payload = _make_create_payload()

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value="event-cancel-outbox-001",
    ) as mock_publish:
        receipt = await create_customer_receipt(
            db, payload=payload, org_id=ORG_ID, user_id=USER_ID
        )
        await transition_status(
            db, doc_entry=receipt.doc_entry, request_body=_open_transition(),
            org_id=ORG_ID, user_id=USER_ID,
        )
        await transition_status(
            db, doc_entry=receipt.doc_entry, request_body=_cancel_transition(),
            org_id=ORG_ID, user_id=USER_ID,
        )

        # publish was called twice (once for open, once for cancel)
        assert mock_publish.call_count == 2
        cancel_call_kwargs = mock_publish.call_args.kwargs
        assert cancel_call_kwargs["event_type"] == "customer_payment_cancelled"


# ---------------------------------------------------------------------------
# Tests: illegal transition guard
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_illegal_transition_raises_value_error() -> None:
    """
    Attempting an illegal transition (e.g. DRAFT → CLOSED) raises ValueError.
    """
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ar_invoice())

    payload = _make_create_payload()
    receipt = await create_customer_receipt(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)

    bad_transition = CustomerReceiptStatusTransitionRequest(new_status=DocumentStatus.CLOSED)
    with pytest.raises(ValueError):
        await transition_status(
            db, doc_entry=receipt.doc_entry, request_body=bad_transition,
            org_id=ORG_ID, user_id=USER_ID,
        )
