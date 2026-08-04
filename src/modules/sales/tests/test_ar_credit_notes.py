"""
Tests for the AR Credit Note (ARC) service layer — T-100.11.

Uses the in-memory fake Motor DB pattern from test_deliveries.py.

Test cases
----------
 1.  create_arc_happy_path             — DRAFT ARC created with correct fields.
 2.  create_arc_invalid_invoice        — allocation target not found → ValueError.
 3.  create_arc_wrong_customer         — invoice belongs to different customer → ValueError.
 4.  create_arc_wrong_status           — invoice in DRAFT status → ValueError.
 5.  get_arc_found                     — returns ARCreditNoteResponse.
 6.  get_arc_not_found                 — returns None.
 7.  list_arcs_pagination              — pagination works.
 8.  update_draft_arc                  — fields updated.
 9.  update_open_arc_raises            — OPEN ARC cannot be updated.
10.  delete_draft_arc                  — deleted, not findable.
11.  delete_non_draft_raises           — ValueError.
12.  transition_draft_to_open_validates_allocation_sum — sum mismatch → ValueError.
13.  transition_draft_to_open_updates_credited_amount  — AR Invoice credited_amount incremented.
14.  transition_draft_to_open_auto_closes_invoice      — invoice fully credited → CLOSED.
15.  transition_draft_to_open_emits_outbox             — credit_note_posted emitted.
16.  transition_draft_to_open_increments_return_consumed_qty — RTN line consumed.
17.  rtn_auto_closed_when_fully_consumed               — RTN auto-closed.
18.  transition_open_to_cancelled_reversal             — credited_amount reversed.
19.  transition_open_to_cancelled_restores_invoice_status — invoice back to OPEN.
20.  transition_open_to_cancelled_emits_outbox         — credit_note_cancelled emitted.
21.  transition_draft_to_cancelled_no_side_effects     — status flip only.
22.  transition_illegal_raises                         — ValueError.
23.  transition_not_found_returns_none                 — None.
24.  over_credit_raises                                — amount > available → ValueError.
25.  compute_tax_date_min_logic                        — tax_date = min(date_of_supply, invoice_date).

Run:
    pytest src/modules/sales/tests/test_ar_credit_notes.py -v
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, patch

import pytest

from src.core.documents.document_status import DocumentStatus
from src.modules.sales.models.ar_credit_notes import (
    ARCreditNoteCreate,
    ARCreditNoteStatusTransitionRequest,
    ARCreditNoteUpdate,
    CreditNoteAllocationCreate,
    CreditNoteLineCreate,
)
from src.modules.sales.services.ar_credit_note_service import (
    create_ar_credit_note,
    delete_ar_credit_note,
    get_ar_credit_note,
    list_ar_credit_notes,
    transition_status,
    update_ar_credit_note,
)

# ---------------------------------------------------------------------------
# Finance ext mock
#
# T-201.8 added isStock gating to direct-path Credit Notes.  The service now
# calls _get_item_finance_ext (via the shared _finance_ext_client) for isStock
# validation.  Patch it module-wide to return isStock=False (service item) so
# existing tests pass without hitting the live finance service.
# ---------------------------------------------------------------------------

_ARC_ITEM_FIN_EXT = {
    "sale_item_finance_ext_id": "arc-ext-001",
    "itemId": "item-001",
    "revenueAccountId": "41000-001",
    "cogsAccountId": "gl-cogs-001",
    "isSellable": True,
    # Reason: isStock=False prevents isStock gating from blocking existing tests
    # that use service/fee items.  Tests that need isStock=True supply their own mock.
    "isStock": False,
}


@pytest.fixture(autouse=True)
def _mock_arc_item_finance_ext():
    """
    Auto-apply mock for _get_item_finance_ext in ar_credit_note_service.

    Patches the imported name in the service module so the isStock gate
    (added in T-201.8) does not call the live finance microservice during tests.
    Returns isStock=False by default (service item).
    """
    with patch(
        "src.modules.sales.services.ar_credit_note_service._get_item_finance_ext",
        new_callable=AsyncMock,
        return_value=_ARC_ITEM_FIN_EXT,
    ):
        yield


# ---------------------------------------------------------------------------
# Fake DB
# ---------------------------------------------------------------------------


class _FakeCollection:
    def __init__(self):
        self._docs: List[Dict[str, Any]] = []

    async def find_one(self, query, *args, **kwargs):
        for doc in self._docs:
            if _matches(doc, query):
                return dict(doc)
        return None

    def find(self, query=None, projection=None, *args, **kwargs):
        matched = [dict(d) for d in self._docs if _matches(d, query or {})]
        return _FakeCursor(matched)

    async def find_one_and_update(self, query, update, **kwargs):
        """Supports upsert=True for next_doc_number counter pattern."""
        upsert = kwargs.get("upsert", False)
        for doc in self._docs:
            if _matches(doc, query):
                _apply_update_simple(doc, update)
                return doc
        if upsert:
            new_doc: Dict[str, Any] = {}
            if "_id" in query:
                new_doc["_id"] = query["_id"]
            _apply_update_simple(new_doc, update)
            self._docs.append(new_doc)
            return new_doc
        return None

    async def insert_one(self, doc, **kwargs):
        self._docs.append(dict(doc))

    async def delete_one(self, query, **kwargs):
        for i, doc in enumerate(self._docs):
            if _matches(doc, query):
                del self._docs[i]
                return

    async def count_documents(self, query, **kwargs):
        return sum(1 for d in self._docs if _matches(d, query))

    async def update_one(self, query, update, **kwargs):
        for doc in self._docs:
            top_matches = all(doc.get(k) == v for k, v in query.items() if "." not in k)
            if not top_matches:
                continue

            line_id_query = None
            for k, v in query.items():
                if k == "lines.lineId":
                    line_id_query = v

            if "$set" in update:
                for field, val in update["$set"].items():
                    if not field.startswith("lines.$."):
                        # Handle nested dotted keys (e.g. "totals.creditedAmount")
                        if "." in field:
                            parts = field.split(".", 1)
                            doc.setdefault(parts[0], {})[parts[1]] = val
                        else:
                            doc[field] = val

            if "$inc" in update:
                for field, delta in update["$inc"].items():
                    if field.startswith("lines.$."):
                        sub_field = field[len("lines.$.") :]
                        if line_id_query:
                            for line in doc.get("lines", []):
                                if line.get("lineId") == line_id_query:
                                    line[sub_field] = line.get(sub_field, 0.0) + delta
                    elif "." in field:
                        parts = field.split(".", 1)
                        sub = doc.setdefault(parts[0], {})
                        sub[parts[1]] = sub.get(parts[1], 0) + delta
                    else:
                        doc[field] = doc.get(field, 0) + delta

            if "$push" in update:
                for field, val in update["$push"].items():
                    doc.setdefault(field, []).append(val)

            return

    def _add(self, doc):
        self._docs.append(doc)


class _FakeCursor:
    def __init__(self, docs):
        self._docs = docs

    def sort(self, *args, **kwargs):
        return self

    def skip(self, n):
        return _FakeCursor(self._docs[n:])

    def limit(self, n):
        return _FakeCursor(self._docs[:n])

    async def to_list(self, length=None):
        return self._docs[:length] if length else self._docs


class _FakeDB:
    def __init__(self):
        self._collections: Dict[str, _FakeCollection] = {}

    def __getitem__(self, name):
        if name not in self._collections:
            self._collections[name] = _FakeCollection()
        return self._collections[name]


def _matches(doc, query):
    for key, val in query.items():
        if isinstance(val, dict):
            doc_val = doc.get(key)
            if "$gte" in val and doc_val is not None and doc_val < val["$gte"]:
                return False
            if "$lte" in val and doc_val is not None and doc_val > val["$lte"]:
                return False
        else:
            if doc.get(key) != val:
                return False
    return True


def _apply_update_simple(doc: Dict[str, Any], update: Dict[str, Any]) -> None:
    """Simple flat update — used by find_one_and_update (counters, no embedded lines)."""
    if "$set" in update:
        for k, v in update["$set"].items():
            doc[k] = v
    if "$inc" in update:
        for k, delta in update["$inc"].items():
            doc[k] = doc.get(k, 0) + delta
    if "$push" in update:
        for k, v in update["$push"].items():
            doc.setdefault(k, []).append(v)


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------

_ORG = "org-" + str(uuid.uuid4())
_USER = "user-001"
_CUSTOMER_ID = "cust-001"
_ARI_ID = str(uuid.uuid4())
_ARI_NUMBER = "ARI-2026-0001"
_RTN_ID = str(uuid.uuid4())
_RTN_LINE_ID = str(uuid.uuid4())
_ITEM_ID = "item-001"


def _make_ari_doc(
    status: str = "open",
    gross: float = 1050.0,
    paid: float = 0.0,
    credited: float = 0.0,
) -> Dict[str, Any]:
    open_amount = gross - paid - credited
    return {
        "docEntry": _ARI_ID,
        "docNumber": _ARI_NUMBER,
        "organizationId": _ORG,
        "customerId": _CUSTOMER_ID,
        "customerName": "Test Customer",
        "status": status,
        "totals": {
            "gross": gross,
            "net": 1000.0,
            "tax": 50.0,
            "paidAmount": paid,
            "creditedAmount": credited,
            "downPaymentApplied": 0.0,
            "openAmount": open_amount,
        },
        "targetDocRefs": [],
        "updatedAt": datetime.now(tz=timezone.utc),
        "updatedBy": _USER,
    }


def _make_rtn_doc(status: str = "open") -> Dict[str, Any]:
    return {
        "docEntry": _RTN_ID,
        "docNumber": "RTN-2026-0001",
        "organizationId": _ORG,
        "status": status,
        "lines": [
            {
                "lineId": _RTN_LINE_ID,
                "lineNumber": 1,
                "itemId": _ITEM_ID,
                "returnedQty": 10.0,
                "orderedQty": 10.0,
                "consumedQty": 0.0,
            }
        ],
        "targetDocRefs": [],
        "updatedAt": datetime.now(tz=timezone.utc),
        "updatedBy": _USER,
    }


def _make_arc_payload(
    amount: float = 1050.0,
    base_return_doc_ref=None,
) -> ARCreditNoteCreate:
    return ARCreditNoteCreate(
        company_code="1000",
        customer_id=_CUSTOMER_ID,
        customer_name="Test Customer",
        doc_date=date(2026, 5, 10),
        date_of_supply=date(2026, 5, 5),
        invoice_date=date(2026, 5, 10),
        credit_reason="return",
        base_return_doc_ref=base_return_doc_ref,
        allocations=[
            CreditNoteAllocationCreate(
                ar_invoice_doc_entry=_ARI_ID,
                ar_invoice_doc_number=_ARI_NUMBER,
                amount_applied=Decimal(str(amount)),
            )
        ],
        lines=[
            CreditNoteLineCreate(
                item_id=_ITEM_ID,
                item_code="SKU001",
                item_name="Widget A",
                credited_qty=Decimal("10"),
                uom="pcs",
                unit_price=Decimal("100"),
                discount_percent=Decimal("0"),
                tax_percent=Decimal("5"),
                revenue_account_id="41000-001",
                base_doc_ref={
                    "doc_type": "RTN" if base_return_doc_ref else "AR_INVOICE",
                    "doc_id": _RTN_ID if base_return_doc_ref else _ARI_ID,
                    "doc_number": (
                        "RTN-2026-0001" if base_return_doc_ref else _ARI_NUMBER
                    ),
                    "line_id": _RTN_LINE_ID if base_return_doc_ref else None,
                },
            )
        ],
    )


# ---------------------------------------------------------------------------
# Tests: Create
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_arc_happy_path():
    """Create an ARC in DRAFT status with correct fields."""
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ari_doc())

    arc = await create_ar_credit_note(
        db, payload=_make_arc_payload(), org_id=_ORG, user_id=_USER
    )

    assert arc.status == DocumentStatus.DRAFT
    assert arc.doc_number.startswith("ARC-")
    assert len(arc.lines) == 1
    assert arc.credit_reason == "return"
    # tax_date = min(date_of_supply, invoice_date) = min(2026-05-05, 2026-05-10) = 2026-05-05
    assert arc.tax_date == date(2026, 5, 5)


@pytest.mark.asyncio
async def test_create_arc_invalid_invoice_raises():
    """Allocation target not found → ValueError."""
    db = _FakeDB()  # empty — no AR Invoice

    with pytest.raises(ValueError, match="not found"):
        await create_ar_credit_note(
            db, payload=_make_arc_payload(), org_id=_ORG, user_id=_USER
        )


@pytest.mark.asyncio
async def test_create_arc_wrong_customer_raises():
    """Invoice belongs to different customer → ValueError."""
    db = _FakeDB()
    ari = _make_ari_doc()
    ari["customerId"] = "different-customer"
    db["ar_invoices_v2"]._add(ari)

    with pytest.raises(ValueError, match="customer"):
        await create_ar_credit_note(
            db, payload=_make_arc_payload(), org_id=_ORG, user_id=_USER
        )


@pytest.mark.asyncio
async def test_create_arc_wrong_status_raises():
    """Invoice in DRAFT status → ValueError (not creditable)."""
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ari_doc(status="draft"))

    with pytest.raises(ValueError, match="status"):
        await create_ar_credit_note(
            db, payload=_make_arc_payload(), org_id=_ORG, user_id=_USER
        )


# ---------------------------------------------------------------------------
# Tests: Get, List
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_arc_found():
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ari_doc())
    created = await create_ar_credit_note(
        db, payload=_make_arc_payload(), org_id=_ORG, user_id=_USER
    )

    fetched = await get_ar_credit_note(db, doc_entry=created.doc_entry, org_id=_ORG)
    assert fetched is not None
    assert fetched.doc_entry == created.doc_entry


@pytest.mark.asyncio
async def test_get_arc_not_found():
    db = _FakeDB()
    result = await get_ar_credit_note(db, doc_entry=str(uuid.uuid4()), org_id=_ORG)
    assert result is None


@pytest.mark.asyncio
async def test_list_arcs_pagination():
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ari_doc())
    for _ in range(3):
        await create_ar_credit_note(
            db, payload=_make_arc_payload(), org_id=_ORG, user_id=_USER
        )

    result = await list_ar_credit_notes(db, org_id=_ORG, page=1, page_size=2)
    assert result["total"] == 3
    assert len(result["items"]) == 2


# ---------------------------------------------------------------------------
# Tests: Update
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_draft_arc():
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ari_doc())
    created = await create_ar_credit_note(
        db, payload=_make_arc_payload(), org_id=_ORG, user_id=_USER
    )

    updated = await update_ar_credit_note(
        db,
        doc_entry=created.doc_entry,
        payload=ARCreditNoteUpdate(notes="Updated note"),
        org_id=_ORG,
        user_id=_USER,
    )
    assert updated.notes == "Updated note"


@pytest.mark.asyncio
async def test_update_open_arc_raises():
    """OPEN ARC cannot be updated."""
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ari_doc())
    created = await create_ar_credit_note(
        db, payload=_make_arc_payload(), org_id=_ORG, user_id=_USER
    )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ARCreditNoteStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=_ORG,
            user_id=_USER,
        )

    with pytest.raises(ValueError, match="cannot be updated"):
        await update_ar_credit_note(
            db,
            doc_entry=created.doc_entry,
            payload=ARCreditNoteUpdate(notes="bad"),
            org_id=_ORG,
            user_id=_USER,
        )


# ---------------------------------------------------------------------------
# Tests: Delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_draft_arc():
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ari_doc())
    created = await create_ar_credit_note(
        db, payload=_make_arc_payload(), org_id=_ORG, user_id=_USER
    )

    deleted = await delete_ar_credit_note(
        db, doc_entry=created.doc_entry, org_id=_ORG, user_id=_USER
    )
    assert deleted is True
    assert (
        await get_ar_credit_note(db, doc_entry=created.doc_entry, org_id=_ORG) is None
    )


@pytest.mark.asyncio
async def test_delete_non_draft_raises():
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ari_doc())
    created = await create_ar_credit_note(
        db, payload=_make_arc_payload(), org_id=_ORG, user_id=_USER
    )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ARCreditNoteStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=_ORG,
            user_id=_USER,
        )

    with pytest.raises(ValueError, match="cannot be deleted"):
        await delete_ar_credit_note(
            db, doc_entry=created.doc_entry, org_id=_ORG, user_id=_USER
        )


# ---------------------------------------------------------------------------
# Tests: Status Transitions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transition_draft_to_open_validates_allocation_sum():
    """Allocation sum ≠ gross → ValueError."""
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ari_doc())
    # Create ARC with gross=1050 but allocation amount=500 (mismatch)
    created = await create_ar_credit_note(
        db,
        payload=_make_arc_payload(amount=500.0),
        org_id=_ORG,
        user_id=_USER,
    )
    # The totals.gross will be 1050 but allocation is 500 → mismatch

    with pytest.raises(ValueError, match="Allocation sum"):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ARCreditNoteStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=_ORG,
            user_id=_USER,
        )


@pytest.mark.asyncio
async def test_transition_draft_to_open_updates_credited_amount():
    """DRAFT → OPEN increments AR Invoice creditedAmount."""
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ari_doc())
    created = await create_ar_credit_note(
        db, payload=_make_arc_payload(), org_id=_ORG, user_id=_USER
    )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ARCreditNoteStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=_ORG,
            user_id=_USER,
        )

    ari = db["ar_invoices_v2"]._docs[0]
    credited = ari.get("totals", {}).get("creditedAmount", 0)
    assert credited == pytest.approx(1050.0)


@pytest.mark.asyncio
async def test_transition_draft_to_open_auto_closes_invoice():
    """When creditedAmount == gross (no payments), AR Invoice → CLOSED."""
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ari_doc(gross=1050.0))
    created = await create_ar_credit_note(
        db, payload=_make_arc_payload(amount=1050.0), org_id=_ORG, user_id=_USER
    )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ARCreditNoteStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=_ORG,
            user_id=_USER,
        )

    ari = db["ar_invoices_v2"]._docs[0]
    assert ari["status"] == "closed"


@pytest.mark.asyncio
async def test_over_credit_raises():
    """Credit amount > available creditable amount → ValueError."""
    db = _FakeDB()
    # Invoice already has 500 credited; gross=1050; available=550
    db["ar_invoices_v2"]._add(_make_ari_doc(gross=1050.0, credited=500.0))
    # Try to credit 1050 (entire gross) — but only 550 is available
    created = await create_ar_credit_note(
        db, payload=_make_arc_payload(amount=1050.0), org_id=_ORG, user_id=_USER
    )

    with pytest.raises(ValueError, match="exceeds available"):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ARCreditNoteStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=_ORG,
            user_id=_USER,
        )


@pytest.mark.asyncio
async def test_transition_draft_to_open_emits_outbox():
    """DRAFT → OPEN emits credit_note_posted outbox event."""
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ari_doc())
    created = await create_ar_credit_note(
        db, payload=_make_arc_payload(), org_id=_ORG, user_id=_USER
    )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ) as mock_publish:
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ARCreditNoteStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=_ORG,
            user_id=_USER,
        )

    mock_publish.assert_called_once()
    call_kwargs = mock_publish.call_args.kwargs
    assert call_kwargs.get("event_type") == "credit_note_posted"


@pytest.mark.asyncio
async def test_transition_draft_to_open_increments_return_consumed_qty():
    """Return-driven: DRAFT → OPEN increments RTN line consumedQty."""
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ari_doc())
    db["returns_v2"]._add(_make_rtn_doc(status="open"))

    base_return = {
        "doc_type": "RTN",
        "doc_id": _RTN_ID,
        "doc_number": "RTN-2026-0001",
        "line_id": None,
    }
    created = await create_ar_credit_note(
        db,
        payload=_make_arc_payload(base_return_doc_ref=base_return),
        org_id=_ORG,
        user_id=_USER,
    )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ARCreditNoteStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=_ORG,
            user_id=_USER,
        )

    rtn = db["returns_v2"]._docs[0]
    consumed = rtn["lines"][0].get("consumedQty", 0)
    assert consumed == pytest.approx(10.0)


@pytest.mark.asyncio
async def test_rtn_auto_closed_when_fully_consumed():
    """RTN auto-closed when all lines consumedQty == orderedQty."""
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ari_doc())
    db["returns_v2"]._add(_make_rtn_doc(status="open"))

    base_return = {
        "doc_type": "RTN",
        "doc_id": _RTN_ID,
        "doc_number": "RTN-2026-0001",
        "line_id": None,
    }
    created = await create_ar_credit_note(
        db,
        payload=_make_arc_payload(base_return_doc_ref=base_return),
        org_id=_ORG,
        user_id=_USER,
    )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ARCreditNoteStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=_ORG,
            user_id=_USER,
        )

    rtn = db["returns_v2"]._docs[0]
    # 10 credited = 10 ordered → auto-closed
    assert rtn["status"] == "closed"


@pytest.mark.asyncio
async def test_transition_open_to_cancelled_reversal():
    """OPEN → CANCELLED reverses AR Invoice creditedAmount."""
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ari_doc())
    created = await create_ar_credit_note(
        db, payload=_make_arc_payload(), org_id=_ORG, user_id=_USER
    )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ARCreditNoteStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=_ORG,
            user_id=_USER,
        )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ARCreditNoteStatusTransitionRequest(
                new_status=DocumentStatus.CANCELLED
            ),
            org_id=_ORG,
            user_id=_USER,
        )

    ari = db["ar_invoices_v2"]._docs[0]
    credited = ari.get("totals", {}).get("creditedAmount", 0)
    assert credited == pytest.approx(0.0)


@pytest.mark.asyncio
async def test_transition_open_to_cancelled_restores_invoice_status():
    """After cancellation, AR Invoice status restored to OPEN."""
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ari_doc())
    created = await create_ar_credit_note(
        db, payload=_make_arc_payload(), org_id=_ORG, user_id=_USER
    )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ARCreditNoteStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=_ORG,
            user_id=_USER,
        )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ARCreditNoteStatusTransitionRequest(
                new_status=DocumentStatus.CANCELLED
            ),
            org_id=_ORG,
            user_id=_USER,
        )

    ari = db["ar_invoices_v2"]._docs[0]
    assert ari["status"] == "open"


@pytest.mark.asyncio
async def test_transition_open_to_cancelled_emits_outbox():
    """OPEN → CANCELLED emits credit_note_cancelled."""
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ari_doc())
    created = await create_ar_credit_note(
        db, payload=_make_arc_payload(), org_id=_ORG, user_id=_USER
    )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ARCreditNoteStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=_ORG,
            user_id=_USER,
        )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ) as mock_cancel_publish:
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ARCreditNoteStatusTransitionRequest(
                new_status=DocumentStatus.CANCELLED
            ),
            org_id=_ORG,
            user_id=_USER,
        )

    mock_cancel_publish.assert_called_once()
    call_kwargs = mock_cancel_publish.call_args.kwargs
    assert call_kwargs.get("event_type") == "credit_note_cancelled"


@pytest.mark.asyncio
async def test_transition_draft_to_cancelled_no_side_effects():
    """DRAFT → CANCELLED: status flip only, no AR Invoice changes."""
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ari_doc())
    created = await create_ar_credit_note(
        db, payload=_make_arc_payload(), org_id=_ORG, user_id=_USER
    )

    result = await transition_status(
        db,
        doc_entry=created.doc_entry,
        request_body=ARCreditNoteStatusTransitionRequest(
            new_status=DocumentStatus.CANCELLED
        ),
        org_id=_ORG,
        user_id=_USER,
    )

    assert result.status == DocumentStatus.CANCELLED
    ari = db["ar_invoices_v2"]._docs[0]
    # creditedAmount must still be 0 — no changes were made
    assert ari.get("totals", {}).get("creditedAmount", 0) == 0


@pytest.mark.asyncio
async def test_transition_illegal_raises():
    """CLOSED → OPEN is illegal → ValueError."""
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ari_doc())
    created = await create_ar_credit_note(
        db, payload=_make_arc_payload(), org_id=_ORG, user_id=_USER
    )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ARCreditNoteStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=_ORG,
            user_id=_USER,
        )
    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ARCreditNoteStatusTransitionRequest(
                new_status=DocumentStatus.CLOSED
            ),
            org_id=_ORG,
            user_id=_USER,
        )

    with pytest.raises(ValueError):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ARCreditNoteStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=_ORG,
            user_id=_USER,
        )


@pytest.mark.asyncio
async def test_transition_not_found_returns_none():
    db = _FakeDB()
    result = await transition_status(
        db,
        doc_entry=str(uuid.uuid4()),
        request_body=ARCreditNoteStatusTransitionRequest(
            new_status=DocumentStatus.OPEN
        ),
        org_id=_ORG,
        user_id=_USER,
    )
    assert result is None


@pytest.mark.asyncio
async def test_compute_tax_date_min_logic():
    """tax_date = min(date_of_supply, invoice_date)."""
    db = _FakeDB()
    db["ar_invoices_v2"]._add(_make_ari_doc())

    arc = await create_ar_credit_note(
        db,
        payload=ARCreditNoteCreate(
            company_code="1000",
            customer_id=_CUSTOMER_ID,
            customer_name="Test Customer",
            doc_date=date(2026, 5, 10),
            date_of_supply=date(2026, 5, 1),
            invoice_date=date(2026, 5, 10),
            credit_reason="price_adjustment",
            allocations=[
                CreditNoteAllocationCreate(
                    ar_invoice_doc_entry=_ARI_ID,
                    ar_invoice_doc_number=_ARI_NUMBER,
                    amount_applied=Decimal("1050.00"),
                )
            ],
            lines=[
                CreditNoteLineCreate(
                    item_id=_ITEM_ID,
                    item_code="SKU001",
                    item_name="Widget A",
                    credited_qty=Decimal("10"),
                    uom="pcs",
                    unit_price=Decimal("100"),
                    tax_percent=Decimal("5"),
                    revenue_account_id="41000-001",
                    base_doc_ref={
                        "doc_type": "AR_INVOICE",
                        "doc_id": _ARI_ID,
                        "doc_number": _ARI_NUMBER,
                        "line_id": None,
                    },
                )
            ],
        ),
        org_id=_ORG,
        user_id=_USER,
    )

    # date_of_supply (2026-05-01) < invoice_date (2026-05-10) → tax_date = 2026-05-01
    assert arc.tax_date == date(2026, 5, 1)


# ---------------------------------------------------------------------------
# Tests: Bug #4 — BSON date encoding (T-100.9a.2)
# ---------------------------------------------------------------------------


def test_to_dt_converts_date_to_datetime() -> None:
    """
    Bug #4 regression test — T-100.9a.2.

    The ``_to_dt`` helper must convert bare ``datetime.date`` objects to
    timezone-aware ``datetime.datetime`` at midnight UTC.

    PyMongo / Motor cannot encode bare ``datetime.date`` objects; the helper
    is the single conversion point used by all AR Credit Note MongoDB writes.
    """
    from src.modules.sales.services.ar_credit_note_service import _to_dt

    d = date(2026, 5, 30)
    result = _to_dt(d)

    assert isinstance(
        result, datetime
    ), f"_to_dt must return datetime.datetime, got {type(result).__name__!r}"
    assert result.year == 2026 and result.month == 5 and result.day == 30
    assert result.hour == 0 and result.minute == 0 and result.second == 0
    assert result.tzinfo is not None, "_to_dt must return a timezone-aware datetime"
    assert result == datetime(2026, 5, 30, 0, 0, 0, tzinfo=timezone.utc)


def test_to_dt_is_idempotent_on_datetime() -> None:
    """
    ``_to_dt`` must not double-wrap a ``datetime.datetime`` that is already
    timezone-aware — it should return it unchanged.
    """
    from src.modules.sales.services.ar_credit_note_service import _to_dt

    dt = datetime(2026, 5, 30, 12, 30, 0, tzinfo=timezone.utc)
    result = _to_dt(dt)
    assert result is dt  # identity check — same object


def test_to_dt_adds_utc_to_naive_datetime() -> None:
    """
    ``_to_dt`` on a naive ``datetime.datetime`` (no tzinfo) must attach UTC.
    """
    from src.modules.sales.services.ar_credit_note_service import _to_dt

    naive_dt = datetime(2026, 5, 30, 0, 0, 0)  # no tzinfo
    result = _to_dt(naive_dt)
    assert result.tzinfo is not None
    assert result == datetime(2026, 5, 30, 0, 0, 0, tzinfo=timezone.utc)


@pytest.mark.asyncio
async def test_update_arc_stores_datetime_not_date() -> None:
    """
    Bug #4 regression test — update path for AR Credit Note.

    When a DRAFT Credit Note is patched with new date fields, the values
    stored in MongoDB must be ``datetime.datetime`` instances (not ``datetime.date``).

    This test seeds the fake DB directly (bypassing create + next_doc_number)
    and then calls update_ar_credit_note to exercise the update path.
    """
    _ARC_COL = "ar_credit_notes_v2"
    _ARC_DOC_ENTRY = str(uuid.uuid4())

    db = _FakeDB()

    # Seed a DRAFT ARC directly in the fake collection.
    # Dates seeded as datetime (already correct) to simulate a document already
    # existing; we then patch doc_date and dateOfSupply via update to exercise
    # the _to_dt path in update_ar_credit_note.
    db[_ARC_COL]._add(
        {
            "docEntry": _ARC_DOC_ENTRY,
            "docNumber": "ARC-2026-0001",
            "docType": "ARC",
            "organizationId": _ORG,
            "companyCode": "1000",
            "customerId": _CUSTOMER_ID,
            "customerName": "Test Customer",
            "status": "draft",
            "docDate": datetime(2026, 5, 1, 0, 0, 0, tzinfo=timezone.utc),
            "dateOfSupply": datetime(2026, 4, 30, 0, 0, 0, tzinfo=timezone.utc),
            "invoiceDate": datetime(2026, 5, 1, 0, 0, 0, tzinfo=timezone.utc),
            "taxDate": datetime(2026, 4, 30, 0, 0, 0, tzinfo=timezone.utc),
            "currency": "AED",
            "exchangeRate": 1.0,
            "creditReason": "return",
            "totals": {"net": 100.0, "tax": 5.0, "gross": 105.0},
            "lines": [],
            "allocations": [],
            "targetDocRefs": [],
            "createdAt": datetime.now(tz=timezone.utc),
            "createdBy": _USER,
            "updatedAt": datetime.now(tz=timezone.utc),
            "updatedBy": _USER,
        }
    )

    update_payload = ARCreditNoteUpdate(
        doc_date=date(2026, 6, 1),
        date_of_supply=date(2026, 5, 28),
        invoice_date=date(2026, 6, 1),
    )

    await update_ar_credit_note(
        db,
        doc_entry=_ARC_DOC_ENTRY,
        payload=update_payload,
        org_id=_ORG,
        user_id=_USER,
    )

    # Inspect the raw stored document.
    raw = db[_ARC_COL]._docs[0]

    for field in ["docDate", "dateOfSupply", "invoiceDate", "taxDate"]:
        value = raw.get(field)
        assert isinstance(value, datetime), (
            f"After update, field '{field}' must be datetime.datetime for BSON "
            f"compatibility, got {type(value).__name__!r}. Bug #4."
        )
        assert (
            value.tzinfo is not None
        ), f"After update, field '{field}' must be timezone-aware"

    # taxDate = min(2026-05-28, 2026-06-01) = 2026-05-28
    assert raw["taxDate"] == datetime(2026, 5, 28, 0, 0, 0, tzinfo=timezone.utc)
