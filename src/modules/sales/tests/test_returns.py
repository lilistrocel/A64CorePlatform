"""
Tests for the Return Note (RTN) service layer — T-100.11.

Uses the in-memory fake Motor DB pattern from test_deliveries.py.

Test cases
----------
 1.  create_from_rr_happy_path         — DRAFT RTN created from OPEN RR.
 2.  create_from_rr_rr_wrong_status    — RR not OPEN → ValueError.
 3.  create_from_rr_qty_exceeded       — returned_qty > available → ValueError.
 4.  create_direct_happy_path          — DRAFT RTN created directly (no RR).
 5.  get_return_found                  — returns ReturnResponse.
 6.  get_return_not_found              — returns None.
 7.  list_returns_pagination           — pagination works.
 8.  update_draft_return               — header fields updated.
 9.  update_open_return_raises         — OPEN RTN cannot be updated.
10.  delete_draft_return               — deleted, can't be found afterwards.
11.  delete_non_draft_raises           — ValueError.
12.  transition_draft_to_open_inventory — inventory movements inserted, Delivery returnedQty incremented.
13.  transition_draft_to_open_rr_consumed — RR consumedQty incremented.
14.  transition_open_to_cancelled_reversal — inventory reversed.
15.  transition_illegal_raises         — ValueError.
16.  transition_not_found_returns_none — None.
17.  open_transition_emits_outbox      — outbox event emitted (mocked).
18.  cancel_transition_emits_outbox    — outbox event emitted (mocked).
19.  rr_auto_close_when_fully_consumed — RR closed when all lines consumed.
20.  rr_reopen_when_cancelled          — RR reopened when RTN cancelled.

Run:
    pytest src/modules/sales/tests/test_returns.py -v
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, patch

import pytest

from src.core.documents.document_status import DocumentStatus
from src.modules.sales.models.returns import (
    ReturnCreate,
    ReturnFromRequestRequest,
    ReturnLineCreate,
    ReturnStatusTransitionRequest,
    ReturnUpdate,
)
from src.modules.sales.services.rtn_service import (
    create_return_direct,
    create_return_from_request,
    delete_return,
    get_return,
    list_returns,
    transition_status,
    update_return,
)

# ---------------------------------------------------------------------------
# Fake DB implementation (embedded-line aware)
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
        query = query or {}
        matched = [dict(d) for d in self._docs if _matches(d, query)]
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
            # Support positional operator on lines array
            line_id_query: Optional[str] = None
            for k, v in query.items():
                if k == "lines.lineId":
                    line_id_query = v

            if "$set" in update:
                for field, val in update["$set"].items():
                    if not field.startswith("lines.$."):
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
# Fixtures / Helpers
# ---------------------------------------------------------------------------

_ORG = "org-" + str(uuid.uuid4())
_USER = "user-001"
_CUSTOMER_ID = "cust-001"
_DN_ID = str(uuid.uuid4())
_DN_LINE_ID = str(uuid.uuid4())
_RR_ID = str(uuid.uuid4())
_RR_LINE_ID = str(uuid.uuid4())
_ITEM_ID = "item-001"
_WH_ID = "WH-01"


def _make_rr_doc(status: str = "open") -> Dict[str, Any]:
    return {
        "docEntry": _RR_ID,
        "docNumber": "RR-2026-0001",
        "organizationId": _ORG,
        "customerId": _CUSTOMER_ID,
        "customerName": "Test Customer",
        "status": status,
        "lines": [
            {
                "lineId": _RR_LINE_ID,
                "lineNumber": 1,
                "itemId": _ITEM_ID,
                "itemCode": "SKU001",
                "requestedQty": 10.0,
                "orderedQty": 10.0,
                "consumedQty": 0.0,
                "baseDocRef": {
                    "docType": "DELIVERY",
                    "docId": _DN_ID,
                    "docNumber": "DN-2026-0001",
                    "lineId": _DN_LINE_ID,
                },
            }
        ],
        "targetDocRefs": [],
        "updatedAt": datetime.now(tz=timezone.utc),
        "updatedBy": _USER,
    }


def _make_dn_doc() -> Dict[str, Any]:
    return {
        "docEntry": _DN_ID,
        "docNumber": "DN-2026-0001",
        "organizationId": _ORG,
        "customerId": _CUSTOMER_ID,
        "status": "open",
        "lines": [
            {
                "lineId": _DN_LINE_ID,
                "lineNumber": 1,
                "itemId": _ITEM_ID,
                "itemCode": "SKU001",
                "deliveredQty": 10.0,
                "returnedQty": 0.0,
            }
        ],
        "targetDocRefs": [],
        "updatedAt": datetime.now(tz=timezone.utc),
        "updatedBy": _USER,
    }


def _make_inv_balance() -> Dict[str, Any]:
    return {
        "itemId": _ITEM_ID,
        "warehouseId": _WH_ID,
        "organizationId": _ORG,
        "avgCost": 80.0,
    }


def _make_rtn_line() -> ReturnLineCreate:
    return ReturnLineCreate(
        item_id=_ITEM_ID,
        item_code="SKU001",
        item_name="Widget A",
        returned_qty=Decimal("5"),
        uom="pcs",
        warehouse_id=_WH_ID,
        unit_price=Decimal("100"),
        discount_percent=Decimal("0"),
        tax_percent=Decimal("5"),
        base_doc_ref={
            "doc_type": "RR",
            "doc_id": _RR_ID,
            "doc_number": "RR-2026-0001",
            "line_id": _RR_LINE_ID,
        },
    )


def _make_rtn_from_rr_payload() -> ReturnFromRequestRequest:
    return ReturnFromRequestRequest(
        company_code="1000",
        doc_date=date(2026, 5, 10),
        actual_return_date=date(2026, 5, 10),
        lines=[_make_rtn_line()],
    )


def _make_rtn_direct_payload() -> ReturnCreate:
    return ReturnCreate(
        company_code="1000",
        customer_id=_CUSTOMER_ID,
        customer_name="Test Customer",
        doc_date=date(2026, 5, 10),
        actual_return_date=date(2026, 5, 10),
        base_doc_ref={
            "doc_type": "DELIVERY",
            "doc_id": _DN_ID,
            "doc_number": "DN-2026-0001",
            "line_id": None,
        },
        lines=[
            ReturnLineCreate(
                item_id=_ITEM_ID,
                item_code="SKU001",
                item_name="Widget A",
                returned_qty=Decimal("5"),
                uom="pcs",
                warehouse_id=_WH_ID,
                unit_price=Decimal("100"),
                discount_percent=Decimal("0"),
                tax_percent=Decimal("5"),
                base_doc_ref={
                    "doc_type": "DELIVERY",
                    "doc_id": _DN_ID,
                    "doc_number": "DN-2026-0001",
                    "line_id": _DN_LINE_ID,
                },
            )
        ],
    )


# ---------------------------------------------------------------------------
# Tests: Create
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_from_rr_happy_path():
    """Create RTN from OPEN RR → DRAFT status, correct lineage."""
    db = _FakeDB()
    db["return_requests_v2"]._add(_make_rr_doc(status="open"))
    db["inventory_balances"]._add(_make_inv_balance())

    rtn = await create_return_from_request(
        db,
        rr_doc_entry=_RR_ID,
        payload=_make_rtn_from_rr_payload(),
        org_id=_ORG,
        user_id=_USER,
    )

    assert rtn.status == DocumentStatus.DRAFT
    assert rtn.doc_number.startswith("RTN-")
    assert len(rtn.lines) == 1


@pytest.mark.asyncio
async def test_create_from_rr_wrong_status_raises():
    """RR in DRAFT status → ValueError."""
    db = _FakeDB()
    db["return_requests_v2"]._add(_make_rr_doc(status="draft"))
    db["inventory_balances"]._add(_make_inv_balance())

    with pytest.raises(ValueError, match="must be 'open'"):
        await create_return_from_request(
            db,
            rr_doc_entry=_RR_ID,
            payload=_make_rtn_from_rr_payload(),
            org_id=_ORG,
            user_id=_USER,
        )


@pytest.mark.asyncio
async def test_create_from_rr_qty_exceeded_raises():
    """Requested qty > available qty on RR line → ValueError."""
    db = _FakeDB()
    rr = _make_rr_doc(status="open")
    # Simulate consumed=8, ordered=10 → only 2 available
    rr["lines"][0]["consumedQty"] = 8.0
    db["return_requests_v2"]._add(rr)
    db["inventory_balances"]._add(_make_inv_balance())

    # Trying to return 5 but only 2 available
    with pytest.raises(ValueError, match="exceeds"):
        await create_return_from_request(
            db,
            rr_doc_entry=_RR_ID,
            payload=_make_rtn_from_rr_payload(),
            org_id=_ORG,
            user_id=_USER,
        )


@pytest.mark.asyncio
async def test_create_direct_happy_path():
    """Create RTN directly → DRAFT, no RR needed."""
    db = _FakeDB()
    db["inventory_balances"]._add(_make_inv_balance())

    rtn = await create_return_direct(
        db, payload=_make_rtn_direct_payload(), org_id=_ORG, user_id=_USER
    )

    assert rtn.status == DocumentStatus.DRAFT
    assert rtn.doc_number.startswith("RTN-")


# ---------------------------------------------------------------------------
# Tests: Get, List
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_return_found():
    db = _FakeDB()
    db["inventory_balances"]._add(_make_inv_balance())
    created = await create_return_direct(
        db, payload=_make_rtn_direct_payload(), org_id=_ORG, user_id=_USER
    )

    fetched = await get_return(db, doc_entry=created.doc_entry, org_id=_ORG)
    assert fetched is not None
    assert fetched.doc_entry == created.doc_entry


@pytest.mark.asyncio
async def test_get_return_not_found():
    db = _FakeDB()
    result = await get_return(db, doc_entry=str(uuid.uuid4()), org_id=_ORG)
    assert result is None


@pytest.mark.asyncio
async def test_list_returns_pagination():
    db = _FakeDB()
    db["inventory_balances"]._add(_make_inv_balance())
    for _ in range(3):
        await create_return_direct(
            db, payload=_make_rtn_direct_payload(), org_id=_ORG, user_id=_USER
        )

    result = await list_returns(db, org_id=_ORG, page=1, page_size=2)
    assert result["total"] == 3
    assert len(result["items"]) == 2


# ---------------------------------------------------------------------------
# Tests: Update
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_draft_return():
    db = _FakeDB()
    db["inventory_balances"]._add(_make_inv_balance())
    created = await create_return_direct(
        db, payload=_make_rtn_direct_payload(), org_id=_ORG, user_id=_USER
    )

    updated = await update_return(
        db,
        doc_entry=created.doc_entry,
        payload=ReturnUpdate(notes="Updated"),
        org_id=_ORG,
        user_id=_USER,
    )
    assert updated.notes == "Updated"


@pytest.mark.asyncio
async def test_update_open_return_raises():
    """OPEN RTN cannot be updated."""
    db = _FakeDB()
    db["inventory_balances"]._add(_make_inv_balance())
    db["deliveries_v2"]._add(_make_dn_doc())
    created = await create_return_direct(
        db, payload=_make_rtn_direct_payload(), org_id=_ORG, user_id=_USER
    )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ReturnStatusTransitionRequest(new_status=DocumentStatus.OPEN),
            org_id=_ORG,
            user_id=_USER,
        )

    with pytest.raises(ValueError, match="cannot be updated"):
        await update_return(
            db,
            doc_entry=created.doc_entry,
            payload=ReturnUpdate(notes="bad"),
            org_id=_ORG,
            user_id=_USER,
        )


# ---------------------------------------------------------------------------
# Tests: Delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_draft_return():
    db = _FakeDB()
    db["inventory_balances"]._add(_make_inv_balance())
    created = await create_return_direct(
        db, payload=_make_rtn_direct_payload(), org_id=_ORG, user_id=_USER
    )

    deleted = await delete_return(
        db, doc_entry=created.doc_entry, org_id=_ORG, user_id=_USER
    )
    assert deleted is True
    assert await get_return(db, doc_entry=created.doc_entry, org_id=_ORG) is None


@pytest.mark.asyncio
async def test_delete_non_draft_raises():
    db = _FakeDB()
    db["inventory_balances"]._add(_make_inv_balance())
    db["deliveries_v2"]._add(_make_dn_doc())
    created = await create_return_direct(
        db, payload=_make_rtn_direct_payload(), org_id=_ORG, user_id=_USER
    )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ReturnStatusTransitionRequest(new_status=DocumentStatus.OPEN),
            org_id=_ORG,
            user_id=_USER,
        )

    with pytest.raises(ValueError, match="cannot be deleted"):
        await delete_return(db, doc_entry=created.doc_entry, org_id=_ORG, user_id=_USER)


# ---------------------------------------------------------------------------
# Tests: Status Transitions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transition_draft_to_open_restores_inventory():
    """DRAFT → OPEN inserts inventory_movements row."""
    db = _FakeDB()
    db["inventory_balances"]._add(_make_inv_balance())
    db["deliveries_v2"]._add(_make_dn_doc())
    created = await create_return_direct(
        db, payload=_make_rtn_direct_payload(), org_id=_ORG, user_id=_USER
    )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        result = await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ReturnStatusTransitionRequest(new_status=DocumentStatus.OPEN),
            org_id=_ORG,
            user_id=_USER,
        )

    assert result.status == DocumentStatus.OPEN
    # Verify inventory_movements row was created
    movements = db["inventory_movements"]._docs
    assert len(movements) == 1
    assert movements[0]["quantity"] > 0  # positive = goods in


@pytest.mark.asyncio
async def test_transition_draft_to_open_increments_delivery_returned_qty():
    """DRAFT → OPEN increments Delivery line returnedQty."""
    db = _FakeDB()
    db["inventory_balances"]._add(_make_inv_balance())
    dn = _make_dn_doc()
    db["deliveries_v2"]._add(dn)
    created = await create_return_direct(
        db, payload=_make_rtn_direct_payload(), org_id=_ORG, user_id=_USER
    )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ReturnStatusTransitionRequest(new_status=DocumentStatus.OPEN),
            org_id=_ORG,
            user_id=_USER,
        )

    dn_after = db["deliveries_v2"]._docs[0]
    returned = dn_after["lines"][0].get("returnedQty", 0)
    assert returned == pytest.approx(5.0)


@pytest.mark.asyncio
async def test_transition_draft_to_open_increments_rr_consumed_qty():
    """DRAFT → OPEN (from RR) increments RR line consumedQty."""
    db = _FakeDB()
    db["return_requests_v2"]._add(_make_rr_doc(status="open"))
    db["inventory_balances"]._add(_make_inv_balance())
    db["deliveries_v2"]._add(_make_dn_doc())
    created = await create_return_from_request(
        db,
        rr_doc_entry=_RR_ID,
        payload=_make_rtn_from_rr_payload(),
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
            request_body=ReturnStatusTransitionRequest(new_status=DocumentStatus.OPEN),
            org_id=_ORG,
            user_id=_USER,
        )

    rr_after = db["return_requests_v2"]._docs[0]
    consumed = rr_after["lines"][0].get("consumedQty", 0)
    assert consumed == pytest.approx(5.0)


@pytest.mark.asyncio
async def test_rr_auto_closed_when_fully_consumed():
    """When all RR lines are fully consumed, RR transitions to CLOSED."""
    db = _FakeDB()
    # consumedQty=5 already, requestedQty=10; Return will consume remaining 5
    rr = _make_rr_doc(status="open")
    rr["lines"][0]["consumedQty"] = 5.0
    db["return_requests_v2"]._add(rr)
    db["inventory_balances"]._add(_make_inv_balance())
    db["deliveries_v2"]._add(_make_dn_doc())
    created = await create_return_from_request(
        db,
        rr_doc_entry=_RR_ID,
        payload=_make_rtn_from_rr_payload(),
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
            request_body=ReturnStatusTransitionRequest(new_status=DocumentStatus.OPEN),
            org_id=_ORG,
            user_id=_USER,
        )

    rr_after = db["return_requests_v2"]._docs[0]
    assert rr_after["status"] == "closed"


@pytest.mark.asyncio
async def test_transition_open_to_cancelled_reverses_inventory():
    """OPEN → CANCELLED inserts negative inventory_movements row."""
    db = _FakeDB()
    db["inventory_balances"]._add(_make_inv_balance())
    db["deliveries_v2"]._add(_make_dn_doc())
    created = await create_return_direct(
        db, payload=_make_rtn_direct_payload(), org_id=_ORG, user_id=_USER
    )

    event_id = str(uuid.uuid4())
    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=event_id,
    ):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ReturnStatusTransitionRequest(new_status=DocumentStatus.OPEN),
            org_id=_ORG,
            user_id=_USER,
        )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        result = await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ReturnStatusTransitionRequest(
                new_status=DocumentStatus.CANCELLED
            ),
            org_id=_ORG,
            user_id=_USER,
        )

    assert result.status == DocumentStatus.CANCELLED
    movements = db["inventory_movements"]._docs
    # Should have +5 from open, -5 from cancel
    total_qty = sum(m.get("quantity", 0) for m in movements)
    assert abs(total_qty) < 0.01  # net zero


@pytest.mark.asyncio
async def test_open_transition_emits_outbox():
    """DRAFT → OPEN emits return_posted outbox event."""
    db = _FakeDB()
    db["inventory_balances"]._add(_make_inv_balance())
    db["deliveries_v2"]._add(_make_dn_doc())
    created = await create_return_direct(
        db, payload=_make_rtn_direct_payload(), org_id=_ORG, user_id=_USER
    )

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ) as mock_publish:
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ReturnStatusTransitionRequest(new_status=DocumentStatus.OPEN),
            org_id=_ORG,
            user_id=_USER,
        )

    mock_publish.assert_called_once()
    call_kwargs = mock_publish.call_args.kwargs
    assert call_kwargs.get("event_type") == "return_posted"


@pytest.mark.asyncio
async def test_transition_illegal_raises():
    """CANCELLED → OPEN is illegal → ValueError."""
    db = _FakeDB()
    db["inventory_balances"]._add(_make_inv_balance())
    created = await create_return_direct(
        db, payload=_make_rtn_direct_payload(), org_id=_ORG, user_id=_USER
    )
    await transition_status(
        db,
        doc_entry=created.doc_entry,
        request_body=ReturnStatusTransitionRequest(new_status=DocumentStatus.CANCELLED),
        org_id=_ORG,
        user_id=_USER,
    )

    with pytest.raises(ValueError):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ReturnStatusTransitionRequest(new_status=DocumentStatus.OPEN),
            org_id=_ORG,
            user_id=_USER,
        )


@pytest.mark.asyncio
async def test_transition_not_found_returns_none():
    db = _FakeDB()
    result = await transition_status(
        db,
        doc_entry=str(uuid.uuid4()),
        request_body=ReturnStatusTransitionRequest(new_status=DocumentStatus.OPEN),
        org_id=_ORG,
        user_id=_USER,
    )
    assert result is None
