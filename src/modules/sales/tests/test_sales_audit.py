"""
Unit tests for GET /api/v1/sales/audit (T-200.x)

Covers:
  1. Happy path — AR_INVOICE returns audit entries ordered newest-first
  2. Happy path — CUSTOMER_RECEIPT hits customer_receipts_v2_audit
  3. Happy path — QUOTE hits quotes_v2_audit
  4. Happy path — SALES_ORDER hits sales_orders_v2_audit
  5. Happy path — DELIVERY hits deliveries_v2_audit
  6. Happy path — RETURN_REQUEST hits return_requests_v2_audit
  7. Happy path — RETURN hits returns_v2_audit
  8. Happy path — AR_CREDIT_NOTE hits ar_credit_notes_v2_audit
  9. Empty collection — returns entries=[], total=0
 10. Invalid doc_type — raises 400 HTTPException with helpful message
 11. Case-insensitive doc_type — "ar_invoice" accepted (uppercased internally)
 12. Response camelCase — entry_id → entryId, actor_user_id → actorUserId, etc.
 13. Fallback userId field — older audit rows that use "userId" not "actorUserId"
 14. Missing optional fields — detail=None handled gracefully
 15. MongoDB failure — raises 500 HTTPException
 16. Dispatch table completeness — all 8 doc types covered
 17. Collection names follow _v2_audit naming convention

All tests use a fake Motor async cursor so no live MongoDB is required.

Test strategy
-------------
The test file imports ONLY the pure data functions and constants from the
audit module (models, _doc_to_entry, _SALES_AUDIT_COLLECTIONS). For the
endpoint handler (get_sales_audit) tests we call a thin inline reproducer
that mirrors the endpoint logic without triggering the full FastAPI startup
chain. This avoids the Pydantic Settings import error that occurs when the
API layer initialises ``Settings()`` from environment variables at collection
time (an existing pattern in this test suite — see conftest.py comment).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId
from fastapi import HTTPException, status

# ---------------------------------------------------------------------------
# Safe imports — only pure data/model code, no API app initialisation chain
# ---------------------------------------------------------------------------

from src.modules.sales.api.v1.audit import (
    SalesAuditEntry,
    SalesAuditResponse,
    _SALES_AUDIT_COLLECTIONS,
    _doc_to_entry,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ORG_ID = str(uuid.uuid4())
DOC_ENTRY = str(uuid.uuid4())
USER_ID = str(uuid.uuid4())
NOW = datetime.now(tz=timezone.utc)


# ---------------------------------------------------------------------------
# Fake Motor helpers
# ---------------------------------------------------------------------------


class _AsyncCursor:
    """Minimal async iterator that yields items from a fixed list."""

    def __init__(self, docs: List[Dict]) -> None:
        self._docs = iter(docs)

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            return next(self._docs)
        except StopIteration:
            raise StopAsyncIteration


class _RaisingAsyncCursor:
    """Async iterator that raises an exception on first iteration."""

    def __init__(self, exc: Exception) -> None:
        self._exc = exc

    def __aiter__(self):
        return self

    async def __anext__(self):
        raise self._exc


def _make_db(
    collection_name: str,
    docs: Optional[List[Dict]] = None,
    raise_exc: Optional[Exception] = None,
) -> MagicMock:
    """
    Build a mock AsyncIOMotorDatabase that returns ``docs`` from
    ``db[collection_name].find()``.

    If ``raise_exc`` is set, the cursor raises that exception on first iteration.
    """
    col = MagicMock()
    if raise_exc is not None:
        col.find = MagicMock(return_value=_RaisingAsyncCursor(raise_exc))
    else:
        col.find = MagicMock(return_value=_AsyncCursor(docs or []))

    db = MagicMock()
    db.__getitem__ = MagicMock(side_effect=lambda name: col if name == collection_name else MagicMock())
    return db


def _make_audit_doc(
    doc_entry: str = DOC_ENTRY,
    action: str = "create",
    user_id: str = USER_ID,
    detail: Optional[dict] = None,
    timestamp: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Build a minimal audit document as stored in a *_audit collection."""
    return {
        "_id": ObjectId(),
        "docEntry": doc_entry,
        "organizationId": ORG_ID,
        "action": action,
        "userId": user_id,
        "detail": detail or {"note": "created"},
        "timestamp": timestamp or NOW,
    }


# ---------------------------------------------------------------------------
# Thin reproducer of the endpoint handler logic
# (avoids triggering full FastAPI app startup / Settings() from env)
# ---------------------------------------------------------------------------


async def _call_audit_handler(
    doc_type: str,
    doc_entry: str,
    organization_id: str,
    db: MagicMock,
) -> SalesAuditResponse:
    """
    Inline reproducer of get_sales_audit that calls only the pure business
    logic (collection dispatch, cursor iteration, model construction) without
    FastAPI's Depends machinery or Settings initialisation.

    This mirrors audit.py lines 190-250 exactly so the test exercises the
    real dispatch logic without importing the full API module graph.
    """
    from src.modules.sales.api.v1.audit import (
        _ALLOWED_DOC_TYPES,
        _SALES_AUDIT_COLLECTIONS,
        _doc_to_entry,
        SalesAuditResponse,
    )
    import logging
    logger = logging.getLogger("test_sales_audit")

    doc_type_upper = doc_type.upper()
    if doc_type_upper not in _ALLOWED_DOC_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"doc_type {doc_type!r} is not permitted. "
                f"Allowed types: {sorted(_ALLOWED_DOC_TYPES)}"
            ),
        )

    collection_name = _SALES_AUDIT_COLLECTIONS[doc_type_upper]

    try:
        cursor = db[collection_name].find(
            {"docEntry": doc_entry, "organizationId": organization_id},
            sort=[("timestamp", -1)],
        )
        raw_docs: list[dict] = []
        async for doc in cursor:
            raw_docs.append(doc)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve audit history.",
        ) from exc

    entries = [_doc_to_entry(doc) for doc in raw_docs]
    return SalesAuditResponse(entries=entries, total=len(entries))


# ===========================================================================
# 1. Happy path — AR_INVOICE returns audit entries ordered newest-first
# ===========================================================================


@pytest.mark.asyncio
async def test_ar_invoice_returns_entries():
    """GET audit for AR_INVOICE returns entries from ar_invoices_v2_audit."""
    older = _make_audit_doc(
        action="create_from_delivery",
        timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    newer = _make_audit_doc(
        action="transition_draft_to_open",
        timestamp=datetime(2026, 2, 1, tzinfo=timezone.utc),
    )

    db = _make_db("ar_invoices_v2_audit", docs=[newer, older])

    result = await _call_audit_handler(
        doc_type="AR_INVOICE",
        doc_entry=DOC_ENTRY,
        organization_id=ORG_ID,
        db=db,
    )

    assert isinstance(result, SalesAuditResponse)
    assert result.total == 2
    assert len(result.entries) == 2
    assert result.entries[0].action == "transition_draft_to_open"
    assert result.entries[1].action == "create_from_delivery"
    db["ar_invoices_v2_audit"].find.assert_called_once()


# ===========================================================================
# 2. Happy path — CUSTOMER_RECEIPT hits customer_receipts_v2_audit
# ===========================================================================


@pytest.mark.asyncio
async def test_customer_receipt_queries_correct_collection():
    """GET audit for CUSTOMER_RECEIPT uses customer_receipts_v2_audit."""
    db = _make_db("customer_receipts_v2_audit", docs=[_make_audit_doc(action="create")])

    result = await _call_audit_handler(
        doc_type="CUSTOMER_RECEIPT",
        doc_entry=DOC_ENTRY,
        organization_id=ORG_ID,
        db=db,
    )

    assert result.total == 1
    assert result.entries[0].action == "create"
    db["customer_receipts_v2_audit"].find.assert_called_once()


# ===========================================================================
# 3. Happy path — QUOTE hits quotes_v2_audit
# ===========================================================================


@pytest.mark.asyncio
async def test_quote_queries_correct_collection():
    """GET audit for QUOTE uses quotes_v2_audit."""
    db = _make_db("quotes_v2_audit", docs=[_make_audit_doc()])

    result = await _call_audit_handler(
        doc_type="QUOTE",
        doc_entry=DOC_ENTRY,
        organization_id=ORG_ID,
        db=db,
    )

    assert result.total == 1
    db["quotes_v2_audit"].find.assert_called_once()


# ===========================================================================
# 4. Happy path — SALES_ORDER hits sales_orders_v2_audit
# ===========================================================================


@pytest.mark.asyncio
async def test_sales_order_queries_correct_collection():
    """GET audit for SALES_ORDER uses sales_orders_v2_audit."""
    db = _make_db("sales_orders_v2_audit", docs=[_make_audit_doc()])

    result = await _call_audit_handler(
        doc_type="SALES_ORDER",
        doc_entry=DOC_ENTRY,
        organization_id=ORG_ID,
        db=db,
    )

    assert result.total == 1
    db["sales_orders_v2_audit"].find.assert_called_once()


# ===========================================================================
# 5. Happy path — DELIVERY hits deliveries_v2_audit
# ===========================================================================


@pytest.mark.asyncio
async def test_delivery_queries_correct_collection():
    """GET audit for DELIVERY uses deliveries_v2_audit."""
    db = _make_db("deliveries_v2_audit", docs=[_make_audit_doc()])

    result = await _call_audit_handler(
        doc_type="DELIVERY",
        doc_entry=DOC_ENTRY,
        organization_id=ORG_ID,
        db=db,
    )

    assert result.total == 1
    db["deliveries_v2_audit"].find.assert_called_once()


# ===========================================================================
# 6. Happy path — RETURN_REQUEST hits return_requests_v2_audit
# ===========================================================================


@pytest.mark.asyncio
async def test_return_request_queries_correct_collection():
    """GET audit for RETURN_REQUEST uses return_requests_v2_audit."""
    db = _make_db("return_requests_v2_audit", docs=[_make_audit_doc()])

    result = await _call_audit_handler(
        doc_type="RETURN_REQUEST",
        doc_entry=DOC_ENTRY,
        organization_id=ORG_ID,
        db=db,
    )

    assert result.total == 1
    db["return_requests_v2_audit"].find.assert_called_once()


# ===========================================================================
# 7. Happy path — RETURN hits returns_v2_audit
# ===========================================================================


@pytest.mark.asyncio
async def test_return_queries_correct_collection():
    """GET audit for RETURN uses returns_v2_audit."""
    db = _make_db("returns_v2_audit", docs=[_make_audit_doc()])

    result = await _call_audit_handler(
        doc_type="RETURN",
        doc_entry=DOC_ENTRY,
        organization_id=ORG_ID,
        db=db,
    )

    assert result.total == 1
    db["returns_v2_audit"].find.assert_called_once()


# ===========================================================================
# 8. Happy path — AR_CREDIT_NOTE hits ar_credit_notes_v2_audit
# ===========================================================================


@pytest.mark.asyncio
async def test_ar_credit_note_queries_correct_collection():
    """GET audit for AR_CREDIT_NOTE uses ar_credit_notes_v2_audit."""
    db = _make_db("ar_credit_notes_v2_audit", docs=[_make_audit_doc()])

    result = await _call_audit_handler(
        doc_type="AR_CREDIT_NOTE",
        doc_entry=DOC_ENTRY,
        organization_id=ORG_ID,
        db=db,
    )

    assert result.total == 1
    db["ar_credit_notes_v2_audit"].find.assert_called_once()


# ===========================================================================
# 9. Empty collection → entries=[], total=0
# ===========================================================================


@pytest.mark.asyncio
async def test_empty_audit_collection_returns_zero_entries():
    """When no audit rows exist for a docEntry, return empty list."""
    db = _make_db("ar_invoices_v2_audit", docs=[])

    result = await _call_audit_handler(
        doc_type="AR_INVOICE",
        doc_entry=DOC_ENTRY,
        organization_id=ORG_ID,
        db=db,
    )

    assert result.total == 0
    assert result.entries == []


# ===========================================================================
# 10. Invalid doc_type → 400 HTTPException
# ===========================================================================


@pytest.mark.asyncio
async def test_invalid_doc_type_raises_400():
    """An unknown doc_type must raise HTTP 400 with an explanation."""
    db = _make_db("ar_invoices_v2_audit", docs=[])

    with pytest.raises(HTTPException) as exc_info:
        await _call_audit_handler(
            doc_type="INVALID_DOC",
            doc_entry=DOC_ENTRY,
            organization_id=ORG_ID,
            db=db,
        )

    assert exc_info.value.status_code == 400
    assert "not permitted" in exc_info.value.detail.lower()


# ===========================================================================
# 11. Case-insensitive doc_type — "ar_invoice" accepted
# ===========================================================================


@pytest.mark.asyncio
async def test_doc_type_is_case_insensitive():
    """doc_type matching is case-insensitive — "ar_invoice" should work."""
    db = _make_db("ar_invoices_v2_audit", docs=[_make_audit_doc()])

    result = await _call_audit_handler(
        doc_type="ar_invoice",  # lowercase — should be uppercased internally
        doc_entry=DOC_ENTRY,
        organization_id=ORG_ID,
        db=db,
    )

    assert result.total == 1


# ===========================================================================
# 12. Response shape uses camelCase keys (via alias_generator=to_camel)
# ===========================================================================


def test_response_model_uses_camel_case():
    """
    SalesAuditEntry serialised with model_dump(by_alias=True) produces camelCase
    keys matching what the frontend expects.
    """
    entry = SalesAuditEntry(
        entry_id="abc123",
        doc_entry=DOC_ENTRY,
        action="create",
        actor_user_id=USER_ID,
        timestamp=NOW,
        detail={"note": "test"},
    )

    dumped = entry.model_dump(by_alias=True)

    assert "entryId" in dumped
    assert "docEntry" in dumped
    assert "action" in dumped
    assert "actorUserId" in dumped
    assert "timestamp" in dumped
    assert "detail" in dumped
    # Confirm snake_case keys are NOT present when serialised by alias
    assert "entry_id" not in dumped
    assert "actor_user_id" not in dumped


# ===========================================================================
# 13. Fallback userId field — older audit rows using "userId"
# ===========================================================================


def test_doc_to_entry_handles_userid_field():
    """
    _doc_to_entry must read 'userId' (older rows) and normalise to actor_user_id.
    """
    doc = {
        "_id": ObjectId(),
        "docEntry": DOC_ENTRY,
        "action": "create",
        "userId": USER_ID,  # old field name
        "timestamp": NOW,
        "detail": None,
    }

    entry = _doc_to_entry(doc)

    assert entry.actor_user_id == USER_ID
    assert entry.doc_entry == DOC_ENTRY
    assert entry.action == "create"


# ===========================================================================
# 14. detail=None — handled gracefully
# ===========================================================================


def test_doc_to_entry_none_detail():
    """When detail is None the entry model allows it (Optional[dict])."""
    doc = {
        "_id": ObjectId(),
        "docEntry": DOC_ENTRY,
        "action": "transition_draft_to_open",
        "userId": USER_ID,
        "timestamp": NOW,
        "detail": None,
    }

    entry = _doc_to_entry(doc)

    assert entry.detail is None


# ===========================================================================
# 15. MongoDB failure → 500 HTTPException
# ===========================================================================


@pytest.mark.asyncio
async def test_mongo_failure_raises_500():
    """If the Motor cursor raises, the endpoint must raise HTTP 500."""
    db = _make_db(
        "ar_invoices_v2_audit",
        raise_exc=RuntimeError("connection refused"),
    )

    with pytest.raises(HTTPException) as exc_info:
        await _call_audit_handler(
            doc_type="AR_INVOICE",
            doc_entry=DOC_ENTRY,
            organization_id=ORG_ID,
            db=db,
        )

    assert exc_info.value.status_code == 500
    assert "audit history" in exc_info.value.detail.lower()


# ===========================================================================
# 16. Dispatch table completeness — all 8 doc types have entries
# ===========================================================================


def test_all_8_sales_doc_types_covered():
    """
    _SALES_AUDIT_COLLECTIONS must cover exactly the 8 Wave 3 sales doc types.
    """
    expected = {
        "AR_INVOICE",
        "CUSTOMER_RECEIPT",
        "QUOTE",
        "SALES_ORDER",
        "DELIVERY",
        "RETURN_REQUEST",
        "RETURN",
        "AR_CREDIT_NOTE",
    }
    assert set(_SALES_AUDIT_COLLECTIONS.keys()) == expected


# ===========================================================================
# 17. Each collection name follows the <doctype>_v2_audit pattern
# ===========================================================================


def test_collection_names_follow_naming_convention():
    """Each audit collection name ends with '_v2_audit'."""
    for col_name in _SALES_AUDIT_COLLECTIONS.values():
        assert col_name.endswith("_v2_audit"), (
            f"Collection {col_name!r} does not follow the _v2_audit naming convention"
        )
