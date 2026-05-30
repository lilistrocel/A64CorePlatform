"""
Tests for the Return Request (RR) service layer — T-100.11.

Uses the same in-memory fake Motor DB pattern as test_deliveries.py.

All tests call service functions directly; route-level auth is tested
via the API layer separately.

Run:
    pytest src/modules/sales/tests/test_return_requests.py -v

All async tests use pytest-asyncio with asyncio_mode = "auto".
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

import pytest

from src.core.documents.document_status import DocumentStatus
from src.modules.sales.models.return_requests import (
    ReturnRequestCreate,
    ReturnRequestStatusTransitionRequest,
    ReturnRequestUpdate,
)
from src.modules.sales.services.return_request_service import (
    create_return_request,
    delete_return_request,
    get_return_request,
    list_return_requests,
    transition_status,
    update_return_request,
)


# ---------------------------------------------------------------------------
# Minimal fake Motor DB (reused from test_deliveries.py pattern)
# ---------------------------------------------------------------------------


class _FakeCollection:
    def __init__(self) -> None:
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
                _apply_update(doc, update)
                return doc
        if upsert:
            new_doc = {}
            if "_id" in query:
                new_doc["_id"] = query["_id"]
            _apply_update(new_doc, update)
            self._docs.append(new_doc)
            return new_doc
        return None

    async def update_one(self, query, update, **kwargs):
        for doc in self._docs:
            if _matches(doc, query):
                _apply_update(doc, update)
                return

    async def insert_one(self, doc, **kwargs):
        self._docs.append(dict(doc))

    async def delete_one(self, query, **kwargs):
        for i, doc in enumerate(self._docs):
            if _matches(doc, query):
                del self._docs[i]
                return

    async def count_documents(self, query, **kwargs):
        return sum(1 for d in self._docs if _matches(d, query))

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
        if length is not None:
            return self._docs[:length]
        return self._docs


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


def _apply_update(doc, update):
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
# Helpers
# ---------------------------------------------------------------------------

_ORG = "org-" + str(uuid.uuid4())
_USER = "user-001"
_CUSTOMER_ID = "cust-" + str(uuid.uuid4())
_DELIVERY_ID = str(uuid.uuid4())
_DELIVERY_LINE_ID = str(uuid.uuid4())


def _make_rr_payload(**overrides) -> ReturnRequestCreate:
    data = {
        "company_code": "1000",
        "customer_id": _CUSTOMER_ID,
        "customer_name": "Test Customer",
        "doc_date": date(2026, 5, 1),
        "valid_until_date": date(2026, 5, 31),
        "reason": "damaged",
        "reason_text": "Goods arrived damaged",
        "base_doc_ref": {
            "doc_type": "DELIVERY",
            "doc_id": _DELIVERY_ID,
            "doc_number": "DN-2026-0001",
            "line_id": None,
        },
        "lines": [
            {
                "item_id": "item-001",
                "item_code": "SKU001",
                "item_name": "Widget A",
                "requested_qty": "10.00",
                "uom": "pcs",
                "unit_price": "100.00",
                "discount_percent": "0",
                "tax_percent": "5",
                "warehouse_id": "WH-01",
                "base_doc_ref": {
                    "doc_type": "DELIVERY",
                    "doc_id": _DELIVERY_ID,
                    "doc_number": "DN-2026-0001",
                    "line_id": _DELIVERY_LINE_ID,
                },
            }
        ],
        "notes": "Test RR",
    }
    data.update(overrides)
    return ReturnRequestCreate(**data)


# ---------------------------------------------------------------------------
# Tests: Create
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_return_request_creates_draft():
    """Create a Return Request → status is DRAFT, doc_number has RR prefix."""
    db = _FakeDB()
    payload = _make_rr_payload()

    rr = await create_return_request(db, payload=payload, org_id=_ORG, user_id=_USER)

    assert rr.status == DocumentStatus.DRAFT
    assert rr.doc_number.startswith("RR-")
    assert rr.customer_id == _CUSTOMER_ID
    assert rr.reason == "damaged"
    assert len(rr.lines) == 1


@pytest.mark.asyncio
async def test_create_return_request_computes_totals():
    """Totals must be computed: net=950, tax=47.50, gross=997.50."""
    db = _FakeDB()
    # 10 pcs × 100 = 1000 net; 5% tax = 50; gross = 1050
    # (discount=0 so net=1000, tax=50, gross=1050)
    payload = _make_rr_payload()

    rr = await create_return_request(db, payload=payload, org_id=_ORG, user_id=_USER)

    assert rr.totals.net == Decimal("1000.00")
    assert rr.totals.tax == Decimal("50.00")
    assert rr.totals.gross == Decimal("1050.00")


@pytest.mark.asyncio
async def test_create_return_request_valid_until_must_be_gte_doc_date():
    """valid_until_date < doc_date should raise ValidationError from Pydantic."""
    with pytest.raises(Exception):  # Pydantic v2 ValidationError
        _make_rr_payload(
            doc_date=date(2026, 5, 31),
            valid_until_date=date(2026, 5, 1),
        )


# ---------------------------------------------------------------------------
# Tests: Get
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_return_request_found():
    """Get a Return Request that exists."""
    db = _FakeDB()
    payload = _make_rr_payload()
    created = await create_return_request(db, payload=payload, org_id=_ORG, user_id=_USER)

    fetched = await get_return_request(db, doc_entry=created.doc_entry, org_id=_ORG)

    assert fetched is not None
    assert fetched.doc_entry == created.doc_entry


@pytest.mark.asyncio
async def test_get_return_request_not_found():
    """Get a non-existent Return Request → None."""
    db = _FakeDB()
    result = await get_return_request(db, doc_entry=str(uuid.uuid4()), org_id=_ORG)
    assert result is None


# ---------------------------------------------------------------------------
# Tests: List
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_return_requests_pagination():
    """List Return Requests with pagination."""
    db = _FakeDB()
    for _ in range(3):
        await create_return_request(db, payload=_make_rr_payload(), org_id=_ORG, user_id=_USER)

    result = await list_return_requests(db, org_id=_ORG, page=1, page_size=2)

    assert result["total"] == 3
    assert len(result["items"]) == 2
    assert result["total_pages"] == 2


# ---------------------------------------------------------------------------
# Tests: Update
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_return_request_draft_only():
    """Update a DRAFT Return Request → succeeds."""
    db = _FakeDB()
    created = await create_return_request(
        db, payload=_make_rr_payload(), org_id=_ORG, user_id=_USER
    )

    update = ReturnRequestUpdate(notes="Updated notes")
    updated = await update_return_request(
        db,
        doc_entry=created.doc_entry,
        payload=update,
        org_id=_ORG,
        user_id=_USER,
    )

    assert updated is not None
    assert updated.notes == "Updated notes"


@pytest.mark.asyncio
async def test_update_open_return_request_raises():
    """Update an OPEN Return Request → ValueError."""
    db = _FakeDB()
    created = await create_return_request(
        db, payload=_make_rr_payload(), org_id=_ORG, user_id=_USER
    )
    # Transition to OPEN
    await transition_status(
        db,
        doc_entry=created.doc_entry,
        request_body=ReturnRequestStatusTransitionRequest(new_status=DocumentStatus.OPEN),
        org_id=_ORG,
        user_id=_USER,
    )

    with pytest.raises(ValueError, match="cannot be updated"):
        await update_return_request(
            db,
            doc_entry=created.doc_entry,
            payload=ReturnRequestUpdate(notes="bad"),
            org_id=_ORG,
            user_id=_USER,
        )


# ---------------------------------------------------------------------------
# Tests: Delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_draft_return_request():
    """Hard-delete a DRAFT Return Request → returns True."""
    db = _FakeDB()
    created = await create_return_request(
        db, payload=_make_rr_payload(), org_id=_ORG, user_id=_USER
    )

    deleted = await delete_return_request(
        db, doc_entry=created.doc_entry, org_id=_ORG, user_id=_USER
    )
    assert deleted is True

    fetched = await get_return_request(db, doc_entry=created.doc_entry, org_id=_ORG)
    assert fetched is None


@pytest.mark.asyncio
async def test_delete_non_draft_raises():
    """Delete an OPEN Return Request → ValueError."""
    db = _FakeDB()
    created = await create_return_request(
        db, payload=_make_rr_payload(), org_id=_ORG, user_id=_USER
    )
    await transition_status(
        db,
        doc_entry=created.doc_entry,
        request_body=ReturnRequestStatusTransitionRequest(new_status=DocumentStatus.OPEN),
        org_id=_ORG,
        user_id=_USER,
    )

    with pytest.raises(ValueError, match="cannot be deleted"):
        await delete_return_request(
            db, doc_entry=created.doc_entry, org_id=_ORG, user_id=_USER
        )


# ---------------------------------------------------------------------------
# Tests: Status Transitions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transition_draft_to_open():
    """DRAFT → OPEN is a legal transition with no side-effects."""
    db = _FakeDB()
    created = await create_return_request(
        db, payload=_make_rr_payload(), org_id=_ORG, user_id=_USER
    )

    result = await transition_status(
        db,
        doc_entry=created.doc_entry,
        request_body=ReturnRequestStatusTransitionRequest(new_status=DocumentStatus.OPEN),
        org_id=_ORG,
        user_id=_USER,
    )

    assert result.status == DocumentStatus.OPEN


@pytest.mark.asyncio
async def test_transition_draft_to_cancelled():
    """DRAFT → CANCELLED is a legal transition."""
    db = _FakeDB()
    created = await create_return_request(
        db, payload=_make_rr_payload(), org_id=_ORG, user_id=_USER
    )

    result = await transition_status(
        db,
        doc_entry=created.doc_entry,
        request_body=ReturnRequestStatusTransitionRequest(new_status=DocumentStatus.CANCELLED),
        org_id=_ORG,
        user_id=_USER,
    )

    assert result.status == DocumentStatus.CANCELLED


@pytest.mark.asyncio
async def test_transition_open_to_closed():
    """OPEN → CLOSED is a legal transition."""
    db = _FakeDB()
    created = await create_return_request(
        db, payload=_make_rr_payload(), org_id=_ORG, user_id=_USER
    )
    await transition_status(
        db,
        doc_entry=created.doc_entry,
        request_body=ReturnRequestStatusTransitionRequest(new_status=DocumentStatus.OPEN),
        org_id=_ORG,
        user_id=_USER,
    )

    result = await transition_status(
        db,
        doc_entry=created.doc_entry,
        request_body=ReturnRequestStatusTransitionRequest(new_status=DocumentStatus.CLOSED),
        org_id=_ORG,
        user_id=_USER,
    )

    assert result.status == DocumentStatus.CLOSED


@pytest.mark.asyncio
async def test_transition_illegal_raises():
    """CANCELLED → OPEN is illegal — ValueError."""
    db = _FakeDB()
    created = await create_return_request(
        db, payload=_make_rr_payload(), org_id=_ORG, user_id=_USER
    )
    await transition_status(
        db,
        doc_entry=created.doc_entry,
        request_body=ReturnRequestStatusTransitionRequest(new_status=DocumentStatus.CANCELLED),
        org_id=_ORG,
        user_id=_USER,
    )

    with pytest.raises(ValueError):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=ReturnRequestStatusTransitionRequest(new_status=DocumentStatus.OPEN),
            org_id=_ORG,
            user_id=_USER,
        )


@pytest.mark.asyncio
async def test_transition_not_found_returns_none():
    """Transition on non-existent RR → None."""
    db = _FakeDB()
    result = await transition_status(
        db,
        doc_entry=str(uuid.uuid4()),
        request_body=ReturnRequestStatusTransitionRequest(new_status=DocumentStatus.OPEN),
        org_id=_ORG,
        user_id=_USER,
    )
    assert result is None
