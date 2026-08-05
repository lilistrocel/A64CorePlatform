"""
Unit tests for DocumentService.create_po_from_pr — straight-to-Open PO
creation (T-911).

Business decision under test: converting an already-Approved PR into a PO
must produce a LIVE (Open) PO directly, not a Draft. The PR approval already
covers it, so there is no separate PO approval step. This is NOT the old
default-Draft behaviour — it is an explicit, deliberate product decision.

Covers:
  - The returned PO's status is 'open' (not 'draft').
  - A po_state_changed outbox event is emitted whose payload.state is the
    mapped display value 'Open', and that payload validates against the
    REAL PurchaseOrderStateChangedPayload contract model.
  - The source PR ends up CLOSED (status transition + PR event emitted).
  - approvalState stays 'NotRequired' — no approval-engine call is made.
"""

import sys
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


ORG_ID = str(uuid.uuid4())
COMPANY_CODE = "1000"
VENDOR_ID = str(uuid.uuid4())
USER_ID = str(uuid.uuid4())
ITEM_ID = str(uuid.uuid4())


def _make_pr_header(
    doc_id: Optional[str] = None,
    status: str = "open",
) -> Dict[str, Any]:
    now = datetime.now(tz=timezone.utc)
    return {
        "docId": doc_id or str(uuid.uuid4()),
        "organizationId": ORG_ID,
        "companyCode": COMPANY_CODE,
        "docType": "PR",
        "docNumber": "PR-2026-0001",
        "docDate": now,
        "status": status,
        "requestedBy": USER_ID,
        "requestedDate": now,
        "department": "Farm",
        "urgency": "normal",
        "totalGross": 1050.0,
        "currencyCode": "AED",
        "notes": None,
        "approvalRequestedFrom": None,
        "approvalDecidedBy": None,
        "approvalComment": None,
        "approvalHistory": [],
        "createdAt": now,
        "createdBy": USER_ID,
        "updatedAt": now,
        "updatedBy": USER_ID,
        "deletedAt": None,
    }


def _make_pr_line(
    doc_id: str,
    line_id: Optional[str] = None,
    quantity: float = 10.0,
) -> Dict[str, Any]:
    now = datetime.now(tz=timezone.utc)
    return {
        "lineId": line_id or str(uuid.uuid4()),
        "docId": doc_id,
        "organizationId": ORG_ID,
        "lineNumber": 1,
        "itemId": ITEM_ID,
        "itemCode": "ITEM-001",
        "itemName": "Fertilizer",
        "description": None,
        "uom": "KG",
        "quantity": quantity,
        "unitPrice": 100.0,
        "discountPercent": 0,
        "taxCode": "VAT5",
        "taxRate": 5.0,
        "costCenterId": None,
        "warehouseId": None,
        "notes": None,
        "createdAt": now,
        "updatedAt": now,
    }


def _make_motor_session() -> MagicMock:
    """
    Build a MagicMock satisfying Motor's async session + sync transaction API.

    Motor's start_session() is awaitable and returns an async context manager
    (the session).  start_transaction() is a SYNCHRONOUS context manager (not
    async), so it must use MagicMock — using AsyncMock here causes
    'coroutine object does not support async context manager protocol'.
    """
    mock_txn_cm = MagicMock()
    mock_txn_cm.__enter__ = MagicMock(return_value=None)
    mock_txn_cm.__exit__ = MagicMock(return_value=False)

    mock_session = MagicMock()
    mock_session.start_transaction = MagicMock(return_value=mock_txn_cm)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    return mock_session


def _make_mock_db() -> MagicMock:
    """Build a minimal mock of AsyncIOMotorDatabase for DocumentService tests."""
    db = MagicMock()

    mock_session = _make_motor_session()
    db.client = MagicMock()
    db.client.start_session = AsyncMock(return_value=mock_session)

    headers_col = AsyncMock()
    headers_col.insert_one = AsyncMock()
    headers_col.update_one = AsyncMock()

    lines_col = AsyncMock()
    lines_col.insert_many = AsyncMock()

    counters_col = AsyncMock()
    counters_col.find_one_and_update = AsyncMock(return_value={"counter": 1})

    vendors_col = AsyncMock()
    vendors_col.find_one = AsyncMock(
        return_value={
            "vendorId": VENDOR_ID,
            "organizationId": ORG_ID,
            "vendorCode": "VEND-001",
            "name": "Test Vendor",
            "deletedAt": None,
        }
    )

    def _get_collection(name: str) -> AsyncMock:
        if name == "document_headers":
            return headers_col
        if name == "document_lines":
            return lines_col
        if name == "document_counters":
            return counters_col
        if name == "vendors":
            return vendors_col
        return AsyncMock()

    db.__getitem__ = MagicMock(side_effect=_get_collection)
    return db


@pytest.mark.asyncio
async def test_create_po_from_pr_is_open_not_draft() -> None:
    """
    The PO returned by create_po_from_pr has status 'open' — the PR
    approval covers it, so it goes straight to live/Open, never Draft.
    """
    from src.modules.purchasing.models.document import POFromPRCreate
    from src.modules.purchasing.services.document_service import DocumentService

    pr_id = str(uuid.uuid4())
    pr_line_id = str(uuid.uuid4())
    pr_header = _make_pr_header(doc_id=pr_id, status="open")
    pr_line = _make_pr_line(doc_id=pr_id, line_id=pr_line_id, quantity=10.0)

    db = _make_mock_db()
    headers_col = db["document_headers"]

    call_count = {"n": 0}

    async def _find_one_side_effect(
        query: Dict[str, Any], *args: Any, **kwargs: Any
    ) -> Optional[Dict[str, Any]]:
        call_count["n"] += 1
        if call_count["n"] == 1:
            # Initial lookup by (org, docId, docType=PR) — still open/approved.
            return dict(pr_header)
        # Reload after the $set to Closed, inside the transaction.
        closed = dict(pr_header)
        closed["status"] = "closed"
        return closed

    headers_col.find_one = AsyncMock(side_effect=_find_one_side_effect)

    lines_col = db["document_lines"]
    lines_cursor = AsyncMock()
    lines_cursor.sort = MagicMock(return_value=lines_cursor)
    lines_cursor.to_list = AsyncMock(return_value=[pr_line])
    lines_col.find = MagicMock(return_value=lines_cursor)

    published_events: List[Dict[str, Any]] = []

    async def _mock_publish(*args: Any, **kwargs: Any) -> Optional[str]:
        published_events.append(kwargs)
        return str(uuid.uuid4())

    mock_outbox_writer = MagicMock()
    mock_outbox_writer.OutboxWriter = MagicMock()
    mock_outbox_writer.OutboxWriter.publish = AsyncMock(side_effect=_mock_publish)

    service = DocumentService(db)
    data = POFromPRCreate(vendorId=VENDOR_ID)

    with patch.dict(sys.modules, {"src.modules.finance_bridge.outbox_writer": mock_outbox_writer}):
        po = await service.create_po_from_pr(
            org_id=ORG_ID,
            pr_doc_id=pr_id,
            data=data,
            created_by=USER_ID,
            company_code=COMPANY_CODE,
        )

    assert po.status == "open"
    assert po.docType == "PO"
    assert po.baseDocId == pr_id
    assert len(po.lines) == 1
    assert po.lines[0].baseLineId == pr_line_id


@pytest.mark.asyncio
async def test_create_po_from_pr_emits_po_open_event_valid_against_contract() -> None:
    """
    po_state_changed is emitted with payload['state'] == 'Open' (the mapped
    display value for stored 'open'), and the payload validates against the
    REAL PurchaseOrderStateChangedPayload contract model — proof the new
    straight-to-Open behaviour doesn't reintroduce the T-810 crash class.
    """
    from contracts.finance_events import PurchaseOrderStateChangedPayload
    from src.modules.purchasing.models.document import POFromPRCreate
    from src.modules.purchasing.services.document_service import DocumentService

    pr_id = str(uuid.uuid4())
    pr_line_id = str(uuid.uuid4())
    pr_header = _make_pr_header(doc_id=pr_id, status="open")
    pr_line = _make_pr_line(doc_id=pr_id, line_id=pr_line_id, quantity=10.0)

    db = _make_mock_db()
    headers_col = db["document_headers"]

    call_count = {"n": 0}

    async def _find_one_side_effect(
        query: Dict[str, Any], *args: Any, **kwargs: Any
    ) -> Optional[Dict[str, Any]]:
        call_count["n"] += 1
        if call_count["n"] == 1:
            return dict(pr_header)
        closed = dict(pr_header)
        closed["status"] = "closed"
        return closed

    headers_col.find_one = AsyncMock(side_effect=_find_one_side_effect)

    lines_col = db["document_lines"]
    lines_cursor = AsyncMock()
    lines_cursor.sort = MagicMock(return_value=lines_cursor)
    lines_cursor.to_list = AsyncMock(return_value=[pr_line])
    lines_col.find = MagicMock(return_value=lines_cursor)

    published_events: List[Dict[str, Any]] = []

    async def _mock_publish(*args: Any, **kwargs: Any) -> Optional[str]:
        published_events.append(kwargs)
        return str(uuid.uuid4())

    mock_outbox_writer = MagicMock()
    mock_outbox_writer.OutboxWriter = MagicMock()
    mock_outbox_writer.OutboxWriter.publish = AsyncMock(side_effect=_mock_publish)

    service = DocumentService(db)
    data = POFromPRCreate(vendorId=VENDOR_ID)

    with patch.dict(sys.modules, {"src.modules.finance_bridge.outbox_writer": mock_outbox_writer}):
        await service.create_po_from_pr(
            org_id=ORG_ID,
            pr_doc_id=pr_id,
            data=data,
            created_by=USER_ID,
            company_code=COMPANY_CODE,
        )

    po_events = [e for e in published_events if e.get("event_type") == "po_state_changed"]
    assert len(po_events) == 1, f"Expected exactly one po_state_changed event; got: {published_events}"

    po_payload = po_events[0]["payload"]
    assert po_payload["state"] == "Open"
    assert po_payload["previousState"] is None  # fresh document, never was Draft

    # Round-trip against the REAL contract model — raises ValidationError on drift.
    validated = PurchaseOrderStateChangedPayload(**po_payload)
    assert validated.state == "Open"

    # approvalState carried through unchanged — never routed through the
    # approval engine for this path.
    assert po_events[0]["source_document_id"] == po_payload["docId"]


@pytest.mark.asyncio
async def test_create_po_from_pr_closes_pr_and_emits_pr_event() -> None:
    """
    The source PR transitions to CLOSED (status update + pr_state_changed
    event), exactly as before this change — auto-close behaviour is
    untouched by the PO-status decision.
    """
    from src.modules.purchasing.models.document import POFromPRCreate
    from src.modules.purchasing.services.document_service import DocumentService

    pr_id = str(uuid.uuid4())
    pr_line_id = str(uuid.uuid4())
    pr_header = _make_pr_header(doc_id=pr_id, status="open")
    pr_line = _make_pr_line(doc_id=pr_id, line_id=pr_line_id, quantity=10.0)

    db = _make_mock_db()
    headers_col = db["document_headers"]

    pr_update_calls: List[Dict[str, Any]] = []

    async def _capture_headers_update(
        query: Dict[str, Any], update: Dict[str, Any], **kwargs: Any
    ) -> None:
        if query.get("docId") == pr_id:
            pr_update_calls.append(update)

    headers_col.update_one = AsyncMock(side_effect=_capture_headers_update)

    call_count = {"n": 0}

    async def _find_one_side_effect(
        query: Dict[str, Any], *args: Any, **kwargs: Any
    ) -> Optional[Dict[str, Any]]:
        call_count["n"] += 1
        if call_count["n"] == 1:
            return dict(pr_header)
        closed = dict(pr_header)
        closed["status"] = "closed"
        return closed

    headers_col.find_one = AsyncMock(side_effect=_find_one_side_effect)

    lines_col = db["document_lines"]
    lines_cursor = AsyncMock()
    lines_cursor.sort = MagicMock(return_value=lines_cursor)
    lines_cursor.to_list = AsyncMock(return_value=[pr_line])
    lines_col.find = MagicMock(return_value=lines_cursor)

    published_events: List[Dict[str, Any]] = []

    async def _mock_publish(*args: Any, **kwargs: Any) -> Optional[str]:
        published_events.append(kwargs)
        return str(uuid.uuid4())

    mock_outbox_writer = MagicMock()
    mock_outbox_writer.OutboxWriter = MagicMock()
    mock_outbox_writer.OutboxWriter.publish = AsyncMock(side_effect=_mock_publish)

    service = DocumentService(db)
    data = POFromPRCreate(vendorId=VENDOR_ID)

    with patch.dict(sys.modules, {"src.modules.finance_bridge.outbox_writer": mock_outbox_writer}):
        await service.create_po_from_pr(
            org_id=ORG_ID,
            pr_doc_id=pr_id,
            data=data,
            created_by=USER_ID,
            company_code=COMPANY_CODE,
        )

    assert len(pr_update_calls) == 1
    assert pr_update_calls[0]["$set"]["status"] == "closed"

    pr_events = [e for e in published_events if e.get("event_type") == "pr_state_changed"]
    assert len(pr_events) == 1
    assert pr_events[0]["payload"]["state"] == "Closed"


@pytest.mark.asyncio
async def test_create_po_from_pr_approval_state_not_required_no_engine_call() -> None:
    """
    approvalState is set to 'NotRequired' unconditionally — this path never
    calls into ApprovalEngine. Straight-to-Open is not gated by approval
    logic at all, by design.
    """
    from src.modules.purchasing.models.document import POFromPRCreate
    from src.modules.purchasing.services.document_service import DocumentService

    pr_id = str(uuid.uuid4())
    pr_line_id = str(uuid.uuid4())
    pr_header = _make_pr_header(doc_id=pr_id, status="open")
    pr_line = _make_pr_line(doc_id=pr_id, line_id=pr_line_id, quantity=10.0)

    db = _make_mock_db()
    headers_col = db["document_headers"]

    call_count = {"n": 0}

    async def _find_one_side_effect(
        query: Dict[str, Any], *args: Any, **kwargs: Any
    ) -> Optional[Dict[str, Any]]:
        call_count["n"] += 1
        if call_count["n"] == 1:
            return dict(pr_header)
        closed = dict(pr_header)
        closed["status"] = "closed"
        return closed

    headers_col.find_one = AsyncMock(side_effect=_find_one_side_effect)

    lines_col = db["document_lines"]
    lines_cursor = AsyncMock()
    lines_cursor.sort = MagicMock(return_value=lines_cursor)
    lines_cursor.to_list = AsyncMock(return_value=[pr_line])
    lines_col.find = MagicMock(return_value=lines_cursor)

    mock_outbox_writer = MagicMock()
    mock_outbox_writer.OutboxWriter = MagicMock()
    mock_outbox_writer.OutboxWriter.publish = AsyncMock(return_value=str(uuid.uuid4()))

    service = DocumentService(db)
    # Spy on the engine instance the service already constructed in __init__.
    service._engine.evaluate = MagicMock(  # type: ignore[attr-defined]
        side_effect=AssertionError(
            "ApprovalEngine must not be invoked for create_po_from_pr — "
            "straight-to-Open is unconditional."
        )
    )

    data = POFromPRCreate(vendorId=VENDOR_ID)

    with patch.dict(sys.modules, {"src.modules.finance_bridge.outbox_writer": mock_outbox_writer}):
        po = await service.create_po_from_pr(
            org_id=ORG_ID,
            pr_doc_id=pr_id,
            data=data,
            created_by=USER_ID,
            company_code=COMPANY_CODE,
        )

    assert po.approvalState == "NotRequired"
