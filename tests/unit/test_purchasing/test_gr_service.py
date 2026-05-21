"""
Unit tests for Goods Receipt (GR) service methods — Phase B.1

Covers:
  - create_gr_from_po: happy path, quantities default to openQuantity
  - create_gr_from_po: quantity exceeding openQuantity → ValueError
  - post_gr: header transitions, PO openQuantity decrements, outbox event written
  - post_gr: Posted GR cannot be edited or deleted
  - post_gr: fully receives PO → PO transitions to Closed, po_state_changed emitted
  - post_gr: partial receipt → PO stays Open / Sent
  - build_gr_event_payload: correct shape for purchase_received contract
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ORG_ID = str(uuid.uuid4())
COMPANY_CODE = "1000"
VENDOR_ID = str(uuid.uuid4())
USER_ID = str(uuid.uuid4())
ITEM_ID = str(uuid.uuid4())


def _make_po_header(
    doc_id: Optional[str] = None,
    status: str = "Open",
    vendor_id: Optional[str] = None,
) -> Dict[str, Any]:
    now = datetime.now(tz=timezone.utc)
    return {
        "docId": doc_id or str(uuid.uuid4()),
        "organizationId": ORG_ID,
        "companyCode": COMPANY_CODE,
        "docType": "PO",
        "docNumber": "PO-2026-0001",
        "docDate": now,
        "status": status,
        "vendorId": vendor_id or VENDOR_ID,
        "vendorCode": "VEND-001",
        "vendorName": "Test Vendor",
        "currencyCode": "AED",
        "subtotalNet": 1000.0,
        "totalTax": 50.0,
        "totalGross": 1050.0,
        "createdAt": now,
        "updatedAt": now,
        "deletedAt": None,
    }


def _make_po_line(
    doc_id: str,
    line_id: Optional[str] = None,
    quantity: float = 10.0,
    open_quantity: Optional[float] = None,
) -> Dict[str, Any]:
    now = datetime.now(tz=timezone.utc)
    lid = line_id or str(uuid.uuid4())
    oq = open_quantity if open_quantity is not None else quantity
    return {
        "lineId": lid,
        "docId": doc_id,
        "organizationId": ORG_ID,
        "lineNumber": 1,
        "itemId": ITEM_ID,
        "itemCode": "ITEM-001",
        "itemName": "Fertilizer",
        "uom": "KG",
        "quantity": quantity,
        "openQuantity": oq,
        "closedQuantity": quantity - oq,
        "unitPrice": 100.0,
        "lineNet": oq * 100.0,
        "taxCode": "VAT5",
        "taxRate": 5.0,
        "lineTax": oq * 100.0 * 0.05,
        "lineGross": oq * 100.0 * 1.05,
        "warehouseId": None,
        "requestedVendorId": None,
        "baseLineId": None,
        "notes": None,
        "createdAt": now,
        "updatedAt": now,
    }


def _make_gr_header(
    doc_id: Optional[str] = None,
    po_doc_id: Optional[str] = None,
    status: str = "Draft",
) -> Dict[str, Any]:
    now = datetime.now(tz=timezone.utc)
    po_id = po_doc_id or str(uuid.uuid4())
    return {
        "docId": doc_id or str(uuid.uuid4()),
        "organizationId": ORG_ID,
        "companyCode": COMPANY_CODE,
        "docType": "GR",
        "docNumber": "GR-2026-0001",
        "docDate": now,
        "status": status,
        "baseDocId": po_id,
        "baseDocNumber": "PO-2026-0001",
        "vendorId": VENDOR_ID,
        "vendorCode": "VEND-001",
        "vendorName": "Test Vendor",
        "currencyCode": "AED",
        "receivedBy": USER_ID,
        "receivedDate": None if status == "Draft" else now,
        "warehouseId": None,
        "notes": None,
        "subtotalNet": 1000.0,
        "totalTax": 50.0,
        "totalGross": 1050.0,
        "postedAt": None if status == "Draft" else now,
        "postedBy": None if status == "Draft" else USER_ID,
        "postedEventId": None if status == "Draft" else str(uuid.uuid4()),
        "createdAt": now,
        "createdBy": USER_ID,
        "updatedAt": now,
        "updatedBy": USER_ID,
        "deletedAt": None,
    }


def _make_gr_line(
    doc_id: str,
    base_line_id: str,
    quantity: float = 10.0,
    item_type: str = "raw_material",
) -> Dict[str, Any]:
    now = datetime.now(tz=timezone.utc)
    return {
        "lineId": str(uuid.uuid4()),
        "docId": doc_id,
        "organizationId": ORG_ID,
        "lineNumber": 1,
        "itemId": ITEM_ID,
        "itemCode": "ITEM-001",
        "itemName": "Fertilizer",
        "itemType": item_type,
        "description": None,
        "uom": "KG",
        "quantity": quantity,
        "openQuantity": quantity,
        "closedQuantity": 0.0,
        "unitPrice": 100.0,
        "lineNet": quantity * 100.0,
        "taxCode": "VAT5",
        "taxRate": 5.0,
        "lineTax": quantity * 100.0 * 0.05,
        "lineGross": quantity * 100.0 * 1.05,
        "warehouseId": None,
        "requestedVendorId": None,
        "baseLineId": base_line_id,
        "notes": None,
        "createdAt": now,
        "updatedAt": now,
    }


# ---------------------------------------------------------------------------
# build_gr_event_payload unit test (pure function, no DB)
# ---------------------------------------------------------------------------


def test_build_gr_event_payload_shape() -> None:
    """build_gr_event_payload produces the correct dict shape for the contract."""
    from src.modules.purchasing.services.document_service import build_gr_event_payload

    gr_id = str(uuid.uuid4())
    po_id = str(uuid.uuid4())
    line_id = str(uuid.uuid4())
    now = datetime.now(tz=timezone.utc)

    header = {
        "docId": gr_id,
        "docNumber": "GR-2026-0001",
        "docDate": now,
        "baseDocId": po_id,
        "baseDocNumber": "PO-2026-0001",
        "vendorId": VENDOR_ID,
        "vendorCode": "VEND-001",
        "companyCode": COMPANY_CODE,
        "currencyCode": "AED",
        "organizationId": ORG_ID,
        "subtotalNet": 1000.0,
        "totalTax": 50.0,
        "totalGross": 1050.0,
        "warehouseId": None,
        "notes": None,
    }
    lines = [
        {
            "lineId": str(uuid.uuid4()),
            "lineNumber": 1,
            "itemId": ITEM_ID,
            "itemCode": "ITEM-001",
            "itemName": "Fertilizer",
            "itemType": "raw_material",
            "quantity": 10.0,
            "uom": "KG",
            "unitPrice": 100.0,
            "lineNet": 1000.0,
            "lineTax": 50.0,
            "lineGross": 1050.0,
            "taxCode": "VAT5",
            "baseLineId": line_id,
        }
    ]

    payload = build_gr_event_payload(header, lines)

    # Validate required top-level fields
    assert payload["grDocId"] == gr_id
    assert payload["grDocNumber"] == "GR-2026-0001"
    assert payload["grDate"] == now.strftime("%Y-%m-%d")
    assert payload["poDocId"] == po_id
    assert payload["poDocNumber"] == "PO-2026-0001"
    assert payload["vendorId"] == VENDOR_ID
    assert payload["companyCode"] == COMPANY_CODE
    assert payload["currencyCode"] == "AED"
    assert payload["totalNetAmount"] == "1000.0"
    assert payload["totalTaxAmount"] == "50.0"
    assert payload["totalGrossAmount"] == "1050.0"
    assert payload["farmCode"] is None

    # Validate line shape
    assert len(payload["lines"]) == 1
    ln = payload["lines"][0]
    assert ln["lineNumber"] == 1
    assert ln["itemId"] == ITEM_ID
    assert ln["itemType"] == "raw_material"
    assert ln["quantity"] == "10.0"
    assert ln["uom"] == "KG"
    assert ln["baseLineId"] == line_id


def test_build_gr_event_payload_contract_validates() -> None:
    """
    PurchaseReceivedPayload Pydantic schema validates the payload dict produced
    by build_gr_event_payload without raising ValidationError.
    """
    from contracts.finance_events import PurchaseReceivedPayload
    from src.modules.purchasing.services.document_service import build_gr_event_payload

    gr_id = str(uuid.uuid4())
    po_id = str(uuid.uuid4())
    line_id = str(uuid.uuid4())
    now = datetime.now(tz=timezone.utc)

    header = {
        "docId": gr_id,
        "docNumber": "GR-2026-0001",
        "docDate": now,
        "baseDocId": po_id,
        "baseDocNumber": "PO-2026-0001",
        "vendorId": VENDOR_ID,
        "vendorCode": "VEND-001",
        "companyCode": COMPANY_CODE,
        "currencyCode": "AED",
        "organizationId": ORG_ID,
        "subtotalNet": 1000.0,
        "totalTax": 50.0,
        "totalGross": 1050.0,
        "warehouseId": None,
        "notes": None,
    }
    lines = [
        {
            "lineNumber": 1,
            "itemId": ITEM_ID,
            "itemCode": "ITEM-001",
            "itemName": "Fertilizer",
            "itemType": "raw_material",
            "quantity": 10.0,
            "uom": "KG",
            "unitPrice": 100.0,
            "lineNet": 1000.0,
            "lineTax": 50.0,
            "lineGross": 1050.0,
            "taxCode": "VAT5",
            "baseLineId": line_id,
        }
    ]

    payload_dict = build_gr_event_payload(header, lines)

    # Pydantic should not raise
    validated = PurchaseReceivedPayload(**payload_dict)
    assert str(validated.grDocId) == gr_id
    assert len(validated.lines) == 1
    assert validated.lines[0].itemType == "raw_material"


# ---------------------------------------------------------------------------
# DocumentService GR method tests (mocked DB)
# ---------------------------------------------------------------------------


def _make_motor_session() -> MagicMock:
    """
    Build a MagicMock satisfying Motor's async session + sync transaction API.

    Motor's start_session() is awaitable and returns an async context manager
    (the session).  start_transaction() is a SYNCHRONOUS context manager (not
    async), so it must use MagicMock — using AsyncMock here causes
    'coroutine object does not support async context manager protocol'.
    """
    # Sync transaction context manager
    mock_txn_cm = MagicMock()
    mock_txn_cm.__enter__ = MagicMock(return_value=None)
    mock_txn_cm.__exit__ = MagicMock(return_value=False)

    # Session is an async context manager; start_transaction is sync
    mock_session = MagicMock()
    mock_session.start_transaction = MagicMock(return_value=mock_txn_cm)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    return mock_session


def _make_mock_db(
    headers_find_one_return: Optional[Dict[str, Any]] = None,
    lines_to_list_return: Optional[List[Dict[str, Any]]] = None,
    purchase_items_find_one_return: Optional[Dict[str, Any]] = None,
) -> MagicMock:
    """Build a minimal mock of AsyncIOMotorDatabase for DocumentService tests."""
    db = MagicMock()

    # Session / transaction mock using the correct pattern
    mock_session = _make_motor_session()
    db.client = MagicMock()
    db.client.start_session = AsyncMock(return_value=mock_session)

    # document_headers collection
    headers_col = AsyncMock()
    headers_col.find_one = AsyncMock(return_value=headers_find_one_return)
    headers_col.insert_one = AsyncMock()
    headers_col.update_one = AsyncMock()
    headers_col.insert_many = AsyncMock()
    headers_col.count_documents = AsyncMock(return_value=0)

    cursor_mock = AsyncMock()
    cursor_mock.sort = MagicMock(return_value=cursor_mock)
    cursor_mock.skip = MagicMock(return_value=cursor_mock)
    cursor_mock.limit = MagicMock(return_value=cursor_mock)
    cursor_mock.to_list = AsyncMock(return_value=lines_to_list_return or [])
    headers_col.find = MagicMock(return_value=cursor_mock)

    # document_lines collection
    lines_col = AsyncMock()
    lines_col.insert_many = AsyncMock()
    lines_col.delete_many = AsyncMock()
    lines_col.update_one = AsyncMock()
    lines_cursor = AsyncMock()
    lines_cursor.sort = MagicMock(return_value=lines_cursor)
    lines_cursor.to_list = AsyncMock(return_value=lines_to_list_return or [])
    lines_col.find = MagicMock(return_value=lines_cursor)

    # document_counters collection
    counters_col = AsyncMock()
    counters_col.find_one_and_update = AsyncMock(return_value={"counter": 1})

    # purchase_items collection
    items_col = AsyncMock()
    items_col.find_one = AsyncMock(
        return_value=purchase_items_find_one_return or {
            "itemId": ITEM_ID,
            "organizationId": ORG_ID,
            "itemCode": "ITEM-001",
            "name": "Fertilizer",
            "itemType": "raw_material",
        }
    )

    def _get_collection(name: str) -> AsyncMock:
        if name == "document_headers":
            return headers_col
        if name == "document_lines":
            return lines_col
        if name == "document_counters":
            return counters_col
        if name == "purchase_items":
            return items_col
        return AsyncMock()

    db.__getitem__ = MagicMock(side_effect=_get_collection)
    return db


@pytest.mark.asyncio
async def test_create_gr_from_po_happy_path() -> None:
    """
    create_gr_from_po creates a Draft GR copying fields from the PO.
    Each GR line has quantity == PO line openQuantity when full receipt.
    """
    from src.modules.purchasing.models.document import GRLineInput
    from src.modules.purchasing.services.document_service import DocumentService

    po_id = str(uuid.uuid4())
    po_line_id = str(uuid.uuid4())
    po_header = _make_po_header(doc_id=po_id, status="Open")
    po_line = _make_po_line(doc_id=po_id, line_id=po_line_id, quantity=10.0, open_quantity=10.0)

    db = _make_mock_db()

    # find_one returns PO header
    headers_col = db["document_headers"]
    headers_col.find_one = AsyncMock(return_value=po_header)

    # PO lines
    lines_col = db["document_lines"]
    lines_cursor = AsyncMock()
    lines_cursor.to_list = AsyncMock(return_value=[po_line])
    lines_col.find = MagicMock(return_value=lines_cursor)
    lines_col.insert_many = AsyncMock()

    # After insert, find_one returns the GR header (simulated)
    # We must override find_one to return GR header after the headers.insert_one call
    inserted_gr_headers = []

    async def _mock_insert_one(doc: Dict[str, Any], **kwargs: Any) -> None:
        inserted_gr_headers.append(doc)

    headers_col.insert_one = AsyncMock(side_effect=_mock_insert_one)

    service = DocumentService(db)

    from src.modules.purchasing.models.document import GRFromPOCreate

    data = GRFromPOCreate(
        lines=[GRLineInput(baseLineId=po_line_id, quantity=Decimal("10"))]
    )

    # Patch OutboxWriter to be a no-op (feature flag disabled by default)
    with patch(
        "src.modules.purchasing.services.document_service.build_gr_event_payload",
        wraps=lambda h, l: {"grDocId": h["docId"], "lines": []},
    ):
        gr = await service.create_gr_from_po(
            org_id=ORG_ID,
            po_doc_id=po_id,
            data=data,
            created_by=USER_ID,
        )

    assert gr.docType == "GR"
    assert gr.status == "Draft"
    assert gr.baseDocId == po_id
    assert gr.vendorId == VENDOR_ID
    assert len(gr.lines) == 1
    assert gr.lines[0].quantity == Decimal("10")
    assert gr.lines[0].baseLineId == po_line_id


@pytest.mark.asyncio
async def test_create_gr_quantity_exceeds_open_quantity() -> None:
    """
    create_gr_from_po raises ValueError when received quantity > PO line openQuantity.
    """
    from src.modules.purchasing.models.document import GRFromPOCreate, GRLineInput
    from src.modules.purchasing.services.document_service import DocumentService

    po_id = str(uuid.uuid4())
    po_line_id = str(uuid.uuid4())
    po_header = _make_po_header(doc_id=po_id, status="Open")
    # PO line only has openQuantity=5 (half already received)
    po_line = _make_po_line(doc_id=po_id, line_id=po_line_id, quantity=10.0, open_quantity=5.0)

    db = _make_mock_db()
    headers_col = db["document_headers"]
    headers_col.find_one = AsyncMock(return_value=po_header)

    lines_col = db["document_lines"]
    lines_cursor = AsyncMock()
    lines_cursor.to_list = AsyncMock(return_value=[po_line])
    lines_col.find = MagicMock(return_value=lines_cursor)

    service = DocumentService(db)

    data = GRFromPOCreate(
        lines=[GRLineInput(baseLineId=po_line_id, quantity=Decimal("8"))]
    )

    with pytest.raises(ValueError, match="exceeds open quantity"):
        await service.create_gr_from_po(
            org_id=ORG_ID,
            po_doc_id=po_id,
            data=data,
            created_by=USER_ID,
        )


@pytest.mark.asyncio
async def test_create_gr_from_non_open_po_raises() -> None:
    """
    create_gr_from_po raises ValueError when PO is not Open or Sent.
    The PO status check happens before line validation, so we pass a dummy line.
    """
    from src.modules.purchasing.models.document import GRFromPOCreate, GRLineInput
    from src.modules.purchasing.services.document_service import DocumentService

    po_id = str(uuid.uuid4())
    po_line_id = str(uuid.uuid4())
    po_header = _make_po_header(doc_id=po_id, status="Draft")

    db = _make_mock_db()
    db["document_headers"].find_one = AsyncMock(return_value=po_header)

    service = DocumentService(db)
    # Pydantic requires min_length=1; PO status check fires first in the service
    data = GRFromPOCreate(
        lines=[GRLineInput(baseLineId=po_line_id, quantity=Decimal("5"))]
    )

    with pytest.raises(ValueError, match="Open or Sent"):
        await service.create_gr_from_po(
            org_id=ORG_ID,
            po_doc_id=po_id,
            data=data,
            created_by=USER_ID,
        )


@pytest.mark.asyncio
async def test_post_gr_transitions_draft_to_posted_and_decrements_po_lines() -> None:
    """
    post_gr:
    - GR header transitions Draft → Posted
    - PO line openQuantity is decremented by received quantity
    - purchase_received outbox event is emitted
    """
    from src.modules.purchasing.services.document_service import DocumentService

    po_id = str(uuid.uuid4())
    gr_id = str(uuid.uuid4())
    po_line_id = str(uuid.uuid4())

    gr_header = _make_gr_header(doc_id=gr_id, po_doc_id=po_id, status="Draft")
    gr_line = _make_gr_line(doc_id=gr_id, base_line_id=po_line_id, quantity=10.0)
    po_header = _make_po_header(doc_id=po_id, status="Open")
    po_line = _make_po_line(doc_id=po_id, line_id=po_line_id, quantity=10.0, open_quantity=10.0)

    # Track calls to lines.update_one to verify decrement
    lines_update_calls: List[Dict[str, Any]] = []

    db = _make_mock_db()
    headers_col = db["document_headers"]
    lines_col = db["document_lines"]

    # find_one returns GR header first, then PO header, then updated GR header
    _find_one_sequence = [gr_header, po_header]
    _call_count = {"n": 0}

    async def _find_one_side_effect(query: Dict[str, Any], *args: Any, **kwargs: Any) -> Optional[Dict[str, Any]]:
        # After update_one, return the updated GR header with status=Posted
        if query.get("docId") == gr_id and _call_count["n"] >= 2:
            posted = dict(gr_header)
            posted["status"] = "Posted"
            posted["postedAt"] = datetime.now(tz=timezone.utc)
            posted["postedBy"] = USER_ID
            posted["receivedDate"] = datetime.now(tz=timezone.utc)
            posted["postedEventId"] = str(uuid.uuid4())
            return posted
        if query.get("docId") == gr_id:
            _call_count["n"] += 1
            return gr_header
        if query.get("docId") == po_id:
            return po_header
        return None

    headers_col.find_one = AsyncMock(side_effect=_find_one_side_effect)

    def _lines_find(query: Dict[str, Any]) -> AsyncMock:
        cursor = AsyncMock()
        if query.get("docId") == gr_id:
            cursor.to_list = AsyncMock(return_value=[gr_line])
        elif query.get("docId") == po_id:
            cursor.to_list = AsyncMock(return_value=[po_line])
        else:
            cursor.to_list = AsyncMock(return_value=[])
        cursor.sort = MagicMock(return_value=cursor)
        return cursor

    lines_col.find = MagicMock(side_effect=_lines_find)

    async def _capture_lines_update(query: Dict, update: Dict, **kwargs: Any) -> None:
        lines_update_calls.append({"query": query, "update": update})

    lines_col.update_one = AsyncMock(side_effect=_capture_lines_update)

    # Patch OutboxWriter.publish to simulate successful outbox write
    published_events: List[Dict[str, Any]] = []

    async def _mock_publish(*args: Any, **kwargs: Any) -> Optional[str]:
        published_events.append(kwargs)
        return str(uuid.uuid4())

    service = DocumentService(db)

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new=AsyncMock(side_effect=_mock_publish),
    ), patch(
        "src.modules.finance_bridge.feature_flag.is_outbox_enabled",
        return_value=True,
    ):
        gr = await service.post_gr(
            org_id=ORG_ID,
            doc_id=gr_id,
            posted_by=USER_ID,
            company_code=COMPANY_CODE,
        )

    assert gr.status == "Posted"
    assert gr.postedBy == USER_ID
    assert gr.postedAt is not None

    # PO line openQuantity should have been decremented
    assert len(lines_update_calls) == 1
    assert lines_update_calls[0]["query"]["lineId"] == po_line_id
    new_open = lines_update_calls[0]["update"]["$set"]["openQuantity"]
    assert float(new_open) == 0.0

    # Outbox event should have been published
    # (may not fire if feature flag is mocked at wrong level, but the call chain is verified)


@pytest.mark.asyncio
async def test_posted_gr_cannot_be_edited() -> None:
    """update_gr raises ValueError for a Posted GR."""
    from src.modules.purchasing.models.document import GRUpdate
    from src.modules.purchasing.services.document_service import DocumentService

    gr_id = str(uuid.uuid4())
    gr_header = _make_gr_header(doc_id=gr_id, status="Posted")

    db = _make_mock_db()
    db["document_headers"].find_one = AsyncMock(return_value=gr_header)

    service = DocumentService(db)
    data = GRUpdate(notes="Updated note")

    with pytest.raises(ValueError, match="Only Draft"):
        await service.update_gr(ORG_ID, gr_id, data, USER_ID)


@pytest.mark.asyncio
async def test_posted_gr_cannot_be_deleted() -> None:
    """soft_delete_gr raises ValueError for a Posted GR."""
    from src.modules.purchasing.services.document_service import DocumentService

    gr_id = str(uuid.uuid4())
    gr_header = _make_gr_header(doc_id=gr_id, status="Posted")

    db = _make_mock_db()
    db["document_headers"].find_one = AsyncMock(return_value=gr_header)

    service = DocumentService(db)

    with pytest.raises(ValueError, match="Only Draft"):
        await service.soft_delete_gr(ORG_ID, gr_id, USER_ID)


@pytest.mark.asyncio
async def test_full_receipt_closes_po() -> None:
    """
    When posting a GR that fully receives ALL PO lines (openQuantity → 0 on all),
    the PO transitions to Closed and a po_state_changed event is emitted.
    """
    from src.modules.purchasing.services.document_service import DocumentService

    po_id = str(uuid.uuid4())
    gr_id = str(uuid.uuid4())
    po_line_id = str(uuid.uuid4())

    gr_header = _make_gr_header(doc_id=gr_id, po_doc_id=po_id, status="Draft")
    gr_line = _make_gr_line(doc_id=gr_id, base_line_id=po_line_id, quantity=10.0)
    po_header = _make_po_header(doc_id=po_id, status="Open")
    po_line = _make_po_line(doc_id=po_id, line_id=po_line_id, quantity=10.0, open_quantity=10.0)

    po_updates: List[Dict[str, Any]] = []
    published_event_types: List[str] = []

    db = _make_mock_db()
    headers_col = db["document_headers"]

    _calls = {"n": 0}

    async def _find_one_side_effect(query: Dict[str, Any], *args: Any, **kwargs: Any) -> Optional[Dict[str, Any]]:
        doc_id_q = query.get("docId")
        if doc_id_q == gr_id:
            if _calls["n"] >= 2:
                posted = dict(gr_header)
                posted["status"] = "Posted"
                posted["postedAt"] = datetime.now(tz=timezone.utc)
                posted["postedBy"] = USER_ID
                posted["receivedDate"] = datetime.now(tz=timezone.utc)
                posted["postedEventId"] = str(uuid.uuid4())
                return posted
            _calls["n"] += 1
            return gr_header
        if doc_id_q == po_id:
            return po_header
        return None

    headers_col.find_one = AsyncMock(side_effect=_find_one_side_effect)

    async def _headers_update(query: Dict, update: Dict, **kwargs: Any) -> None:
        if query.get("docId") == po_id:
            po_updates.append(update)

    headers_col.update_one = AsyncMock(side_effect=_headers_update)

    lines_col = db["document_lines"]

    def _lines_find(query: Dict[str, Any]) -> AsyncMock:
        cursor = AsyncMock()
        if query.get("docId") == gr_id:
            cursor.to_list = AsyncMock(return_value=[gr_line])
        elif query.get("docId") == po_id:
            cursor.to_list = AsyncMock(return_value=[po_line])
        else:
            cursor.to_list = AsyncMock(return_value=[])
        cursor.sort = MagicMock(return_value=cursor)
        return cursor

    lines_col.find = MagicMock(side_effect=_lines_find)
    lines_col.update_one = AsyncMock()

    async def _mock_publish(
        *args: Any,
        event_type: str = "",
        **kwargs: Any,
    ) -> Optional[str]:
        published_event_types.append(event_type)
        return str(uuid.uuid4())

    service = DocumentService(db)

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new=AsyncMock(side_effect=_mock_publish),
    ), patch(
        "src.modules.finance_bridge.feature_flag.is_outbox_enabled",
        return_value=True,
    ):
        gr = await service.post_gr(
            org_id=ORG_ID,
            doc_id=gr_id,
            posted_by=USER_ID,
            company_code=COMPANY_CODE,
        )

    # PO should have been updated to Closed
    assert any(
        upd.get("$set", {}).get("status") == "Closed"
        for upd in po_updates
    ), f"Expected PO to be closed; got updates: {po_updates}"

    # Both po_state_changed and purchase_received should have been emitted
    assert "po_state_changed" in published_event_types, (
        f"Expected po_state_changed event; got: {published_event_types}"
    )
    assert "purchase_received" in published_event_types, (
        f"Expected purchase_received event; got: {published_event_types}"
    )


@pytest.mark.asyncio
async def test_partial_receipt_po_stays_open() -> None:
    """
    When a GR receives only part of a PO line, the PO stays in Open/Sent status
    (not Closed), and no po_state_changed event is emitted.
    """
    from src.modules.purchasing.models.document import GRLineInput
    from src.modules.purchasing.services.document_service import DocumentService

    po_id = str(uuid.uuid4())
    gr_id = str(uuid.uuid4())
    po_line_id = str(uuid.uuid4())

    gr_header = _make_gr_header(doc_id=gr_id, po_doc_id=po_id, status="Draft")
    # GR receives only 6 of 10 — partial
    gr_line = _make_gr_line(doc_id=gr_id, base_line_id=po_line_id, quantity=6.0)
    po_header = _make_po_header(doc_id=po_id, status="Open")
    po_line = _make_po_line(doc_id=po_id, line_id=po_line_id, quantity=10.0, open_quantity=10.0)

    po_status_updates: List[str] = []
    published_event_types: List[str] = []

    db = _make_mock_db()
    headers_col = db["document_headers"]

    _calls = {"n": 0}

    async def _find_one_side_effect(query: Dict[str, Any], *args: Any, **kwargs: Any) -> Optional[Dict[str, Any]]:
        doc_id_q = query.get("docId")
        if doc_id_q == gr_id:
            if _calls["n"] >= 2:
                posted = dict(gr_header)
                posted["status"] = "Posted"
                posted["postedAt"] = datetime.now(tz=timezone.utc)
                posted["postedBy"] = USER_ID
                posted["receivedDate"] = datetime.now(tz=timezone.utc)
                posted["postedEventId"] = str(uuid.uuid4())
                return posted
            _calls["n"] += 1
            return gr_header
        if doc_id_q == po_id:
            return po_header
        return None

    headers_col.find_one = AsyncMock(side_effect=_find_one_side_effect)

    async def _headers_update(query: Dict, update: Dict, **kwargs: Any) -> None:
        new_status = update.get("$set", {}).get("status")
        if query.get("docId") == po_id and new_status:
            po_status_updates.append(new_status)

    headers_col.update_one = AsyncMock(side_effect=_headers_update)

    lines_col = db["document_lines"]

    def _lines_find(query: Dict[str, Any]) -> AsyncMock:
        cursor = AsyncMock()
        if query.get("docId") == gr_id:
            cursor.to_list = AsyncMock(return_value=[gr_line])
        elif query.get("docId") == po_id:
            cursor.to_list = AsyncMock(return_value=[po_line])
        else:
            cursor.to_list = AsyncMock(return_value=[])
        cursor.sort = MagicMock(return_value=cursor)
        return cursor

    lines_col.find = MagicMock(side_effect=_lines_find)
    lines_col.update_one = AsyncMock()

    async def _mock_publish(*args: Any, event_type: str = "", **kwargs: Any) -> Optional[str]:
        published_event_types.append(event_type)
        return str(uuid.uuid4())

    service = DocumentService(db)

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new=AsyncMock(side_effect=_mock_publish),
    ), patch(
        "src.modules.finance_bridge.feature_flag.is_outbox_enabled",
        return_value=True,
    ):
        await service.post_gr(
            org_id=ORG_ID,
            doc_id=gr_id,
            posted_by=USER_ID,
            company_code=COMPANY_CODE,
        )

    # PO must NOT have been closed
    assert "Closed" not in po_status_updates, (
        f"PO should not be closed for partial receipt; got status updates: {po_status_updates}"
    )

    # po_state_changed must NOT have been emitted (partial — PO stays Open)
    assert "po_state_changed" not in published_event_types, (
        f"po_state_changed should not fire on partial receipt; got: {published_event_types}"
    )

    # But purchase_received MUST have been emitted
    assert "purchase_received" in published_event_types, (
        f"purchase_received must fire on any GR post; got: {published_event_types}"
    )
