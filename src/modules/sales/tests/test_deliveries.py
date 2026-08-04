"""
Tests for the Delivery Note (DN) backend — T-100.8.

Uses the same in-memory fake Motor DB pattern as test_sales_orders.py.

All tests call service functions directly; route-level auth is tested via
role/permission checks in the API layer (covered by the schema validator
and service-layer guards).

Run:
    pytest src/modules/sales/tests/test_deliveries.py -v

All async tests use pytest-asyncio with asyncio_mode = "auto".
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.core.documents.document_status import DocumentStatus
from src.modules.sales.models.deliveries import (
    DeliveryFromSORequest,
    DeliveryLineCreate,
    DeliveryStatusTransitionRequest,
    DeliveryUpdate,
)
from src.modules.sales.services.delivery_service import (
    create_delivery_from_so,
    delete_delivery,
    get_delivery,
    list_deliveries,
    transition_status,
    update_delivery,
)

# ---------------------------------------------------------------------------
# In-memory fake Motor DB — extends the pattern from test_sales_orders.py
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
                _apply_update(doc, update)
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


class _EmbeddedLineCollection(_FakeCollection):
    """
    Extends _FakeCollection to support MongoDB positional operator ($)
    for embedded-array updates used in delivery-to-SO write-back.

    When update_one is called with a query matching 'lines.lineId' and the
    update contains 'lines.$.deliveredQty' or 'lines.$.targetDocRefs',
    we find the matching embedded line and apply the delta directly.
    """

    async def update_one(
        self, query: Dict[str, Any], update: Dict[str, Any], **kwargs: Any
    ) -> None:
        for doc in self._docs:
            # Match top-level fields (docEntry, organizationId).
            top_matches = all(doc.get(k) == v for k, v in query.items() if "." not in k)
            if not top_matches:
                continue

            # Find embedded line query key.
            line_id_query: Optional[str] = None
            for k, v in query.items():
                if k == "lines.lineId":
                    line_id_query = v

            # Apply $set on top-level fields.
            if "$set" in update:
                for field, val in update["$set"].items():
                    if not field.startswith("lines.$."):
                        doc[field] = val

            # Apply $inc (including positional).
            if "$inc" in update:
                for field, delta in update["$inc"].items():
                    if field.startswith("lines.$."):
                        sub_field = field[len("lines.$.") :]
                        if line_id_query is not None:
                            for line in doc.get("lines", []):
                                if line.get("lineId") == line_id_query:
                                    line[sub_field] = line.get(sub_field, 0.0) + delta
                                    break
                    else:
                        doc[field] = doc.get(field, 0) + delta

            # Apply $push (including positional on embedded lines).
            if "$push" in update:
                for field, val in update["$push"].items():
                    if field.startswith("lines.$."):
                        sub_field = field[len("lines.$.") :]
                        if line_id_query is not None:
                            for line in doc.get("lines", []):
                                if line.get("lineId") == line_id_query:
                                    if sub_field not in line:
                                        line[sub_field] = []
                                    line[sub_field].append(val)
                                    break
                    else:
                        if field not in doc:
                            doc[field] = []
                        doc[field].append(val)

            return


class _FakeDB:
    """Minimal fake Motor database with embedded-line support for SO and Delivery."""

    def __init__(self) -> None:
        self._collections: Dict[str, _EmbeddedLineCollection] = {}

    def __getitem__(self, name: str) -> _EmbeddedLineCollection:
        if name not in self._collections:
            self._collections[name] = _EmbeddedLineCollection()
        return self._collections[name]


# ---------------------------------------------------------------------------
# Query matching helpers
# ---------------------------------------------------------------------------


def _matches(doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
    """Simple query matcher supporting equality, $gte, $lte, $ne, $in."""
    for key, val in query.items():
        # Handle nested key paths (e.g. "lines.lineId", "baseDocRef.docId")
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
                doc[key] = val
    if "$inc" in update:
        for field, delta in update["$inc"].items():
            if ".$." not in field:
                doc[field] = doc.get(field, 0) + delta
    if "$push" in update:
        for field, val in update["$push"].items():
            if ".$." not in field:
                if field not in doc:
                    doc[field] = []
                doc[field].append(val)


# ---------------------------------------------------------------------------
# Test fixtures and helpers
# ---------------------------------------------------------------------------

ORG_ID = "org-test-dn-001"
OTHER_ORG_ID = "org-test-other-dn"
USER_ID = "user-dn-abc-123"
COMPANY_CODE = "A001"

SO_DOC_ENTRY = str(uuid.uuid4())
SO_DOC_NUMBER = "SO-2026-0001"
LINE_1_ID = str(uuid.uuid4())
LINE_2_ID = str(uuid.uuid4())
CUSTOMER_ID = "customer-dn-001"
CUSTOMER_NAME = "Test Customer DN"
ITEM_1_ID = "item-dn-001"
ITEM_2_ID = "item-dn-002"
WAREHOUSE_ID = "WH-MAIN"


def _make_so(
    status: str = "open",
    line1_ordered: float = 10.0,
    line1_delivered: float = 0.0,
    line2_ordered: float = 5.0,
    line2_delivered: float = 0.0,
    include_line2: bool = True,
) -> Dict[str, Any]:
    """Build a minimal sales_orders_v2 document for testing."""
    lines = [
        {
            "lineId": LINE_1_ID,
            "lineNumber": 1,
            "itemId": ITEM_1_ID,
            "itemCode": "ITEM-DN-001",
            "itemName": "Test Item DN 1",
            "description": "Test Item DN 1",
            "quantity": line1_ordered,
            "uom": "pcs",
            "unitPrice": 100.0,
            "warehouseId": WAREHOUSE_ID,
            "orderedQty": line1_ordered,
            "deliveredQty": line1_delivered,
            "cancelledQty": 0.0,
            "committedQty": line1_ordered,
            "invoicedQty": 0.0,
            "targetDocRefs": [],
            "baseDocRef": None,
        },
    ]
    if include_line2:
        lines.append(
            {
                "lineId": LINE_2_ID,
                "lineNumber": 2,
                "itemId": ITEM_2_ID,
                "itemCode": "ITEM-DN-002",
                "itemName": "Test Item DN 2",
                "description": "Test Item DN 2",
                "quantity": line2_ordered,
                "uom": "kg",
                "unitPrice": 50.0,
                "warehouseId": WAREHOUSE_ID,
                "orderedQty": line2_ordered,
                "deliveredQty": line2_delivered,
                "cancelledQty": 0.0,
                "committedQty": line2_ordered,
                "invoicedQty": 0.0,
                "targetDocRefs": [],
                "baseDocRef": None,
            }
        )

    return {
        "docEntry": SO_DOC_ENTRY,
        "docNumber": SO_DOC_NUMBER,
        "docType": "SO",
        "organizationId": ORG_ID,
        "companyCode": COMPANY_CODE,
        "customerId": CUSTOMER_ID,
        "customerName": CUSTOMER_NAME,
        "docDate": date(2026, 1, 10),
        "deliveryDate": date(2026, 1, 20),
        "status": status,
        "currency": "AED",
        "exchangeRate": 1.0,
        "totals": {"net": 1000.0, "tax": 50.0, "gross": 1050.0},
        "targetDocRefs": [],
        "baseDocRef": None,
        "lines": lines,
        "createdAt": datetime.now(tz=timezone.utc),
        "createdBy": USER_ID,
        "updatedAt": datetime.now(tz=timezone.utc),
        "updatedBy": USER_ID,
    }


def _make_delivery_request(
    qty1: float = 5.0,
    include_line2: bool = False,
    qty2: float = 3.0,
) -> DeliveryFromSORequest:
    """Build a minimal DeliveryFromSORequest for testing."""
    lines: List[DeliveryLineCreate] = [
        DeliveryLineCreate(
            so_line_id=LINE_1_ID,
            so_line_number=1,
            item_id=ITEM_1_ID,
            item_code="ITEM-DN-001",
            item_name="Test Item DN 1",
            quantity=Decimal(str(qty1)),
            uom="pcs",
            warehouse_id=WAREHOUSE_ID,
        ),
    ]
    if include_line2:
        lines.append(
            DeliveryLineCreate(
                so_line_id=LINE_2_ID,
                so_line_number=2,
                item_id=ITEM_2_ID,
                item_code="ITEM-DN-002",
                item_name="Test Item DN 2",
                quantity=Decimal(str(qty2)),
                uom="kg",
                warehouse_id=WAREHOUSE_ID,
            )
        )
    return DeliveryFromSORequest(
        company_code=COMPANY_CODE,
        doc_date=date(2026, 1, 15),
        actual_delivery_date=date(2026, 1, 15),
        lines=lines,
    )


# ---------------------------------------------------------------------------
# Patch helpers
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Tests: create_delivery_from_so
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_delivery_from_so_happy_path() -> None:
    """
    Create a Delivery from an OPEN SO with a single line.
    Verify: DRAFT status, doc_number generated, line has base_doc_ref to SO line,
    unit_cost tentatively snapshotted, SO header gains target_doc_ref.
    """
    db = _FakeDB()
    db["sales_orders_v2"]._add(_make_so())

    request = _make_delivery_request(qty1=5.0)
    dn = await create_delivery_from_so(
        db, so_doc_entry=SO_DOC_ENTRY, payload=request, org_id=ORG_ID, user_id=USER_ID
    )

    assert dn.status == DocumentStatus.DRAFT
    assert dn.doc_number.startswith("DN-")
    assert len(dn.lines) == 1
    line = dn.lines[0]
    assert line.quantity == Decimal("5")
    assert line.base_doc_ref is not None
    assert line.base_doc_ref.doc_type == "SO"
    assert line.base_doc_ref.line_id == LINE_1_ID

    # unit_cost defaults to 0.00 (no inventory_balances record in fake DB)
    assert line.unit_cost == Decimal("0.00")
    assert line.line_cogs == Decimal("0.00")

    # SO header should have gained a target_doc_ref pointing to the new DN.
    so_doc = db["sales_orders_v2"]._docs[0]
    target_refs = so_doc.get("targetDocRefs", [])
    assert any(ref.get("docType") == "DELIVERY" for ref in target_refs)


@pytest.mark.asyncio
async def test_create_delivery_from_partly_closed_so() -> None:
    """Delivery creation from a PARTLY_CLOSED SO should succeed."""
    db = _FakeDB()
    db["sales_orders_v2"]._add(_make_so(status="partly_closed", line1_delivered=3.0))
    request = _make_delivery_request(qty1=5.0)  # 10 ordered, 3 delivered → 7 open
    dn = await create_delivery_from_so(
        db, so_doc_entry=SO_DOC_ENTRY, payload=request, org_id=ORG_ID, user_id=USER_ID
    )
    assert dn.status == DocumentStatus.DRAFT
    assert dn.lines[0].quantity == Decimal("5")


@pytest.mark.asyncio
async def test_create_delivery_qty_exceeds_open_qty_raises() -> None:
    """Requesting delivery qty > SO line open_qty should raise ValueError (→ 422)."""
    db = _FakeDB()
    db["sales_orders_v2"]._add(_make_so(line1_ordered=10.0, line1_delivered=0.0))

    request = _make_delivery_request(qty1=11.0)  # Only 10 available
    with pytest.raises(ValueError, match="exceeds available open_qty"):
        await create_delivery_from_so(
            db,
            so_doc_entry=SO_DOC_ENTRY,
            payload=request,
            org_id=ORG_ID,
            user_id=USER_ID,
        )


@pytest.mark.asyncio
async def test_create_delivery_from_cancelled_so_raises() -> None:
    """Creating a Delivery from a CANCELLED SO should raise ValueError (→ 409)."""
    db = _FakeDB()
    db["sales_orders_v2"]._add(_make_so(status="cancelled"))
    request = _make_delivery_request()
    with pytest.raises(ValueError, match="status is 'cancelled'"):
        await create_delivery_from_so(
            db,
            so_doc_entry=SO_DOC_ENTRY,
            payload=request,
            org_id=ORG_ID,
            user_id=USER_ID,
        )


@pytest.mark.asyncio
async def test_create_delivery_from_draft_so_raises() -> None:
    """Creating a Delivery from a DRAFT SO should raise ValueError (→ 409)."""
    db = _FakeDB()
    db["sales_orders_v2"]._add(_make_so(status="draft"))
    request = _make_delivery_request()
    with pytest.raises(ValueError, match="status is 'draft'"):
        await create_delivery_from_so(
            db,
            so_doc_entry=SO_DOC_ENTRY,
            payload=request,
            org_id=ORG_ID,
            user_id=USER_ID,
        )


@pytest.mark.asyncio
async def test_create_delivery_from_missing_so_raises() -> None:
    """Creating a Delivery from a non-existent SO should raise ValueError."""
    db = _FakeDB()
    request = _make_delivery_request()
    with pytest.raises(ValueError, match="not found"):
        await create_delivery_from_so(
            db,
            so_doc_entry="non-existent-so",
            payload=request,
            org_id=ORG_ID,
            user_id=USER_ID,
        )


@pytest.mark.asyncio
async def test_create_delivery_multiline_partial() -> None:
    """
    SO has 2 lines.  Deliver line 1 fully + line 2 partially.
    Verify: 2 Delivery lines created; SO should transition OPEN → PARTLY_CLOSED
    when the Delivery is OPENed (that happens in transition_status, not here —
    this test verifies the Draft creation only).
    """
    db = _FakeDB()
    db["sales_orders_v2"]._add(_make_so(include_line2=True))

    request = _make_delivery_request(qty1=10.0, include_line2=True, qty2=3.0)
    dn = await create_delivery_from_so(
        db, so_doc_entry=SO_DOC_ENTRY, payload=request, org_id=ORG_ID, user_id=USER_ID
    )

    assert len(dn.lines) == 2
    assert dn.lines[0].quantity == Decimal("10")
    assert dn.lines[1].quantity == Decimal("3")


@pytest.mark.asyncio
async def test_create_delivery_cross_org_isolation() -> None:
    """Delivery for a different org_id should not find the SO."""
    db = _FakeDB()
    db["sales_orders_v2"]._add(_make_so())
    request = _make_delivery_request()
    with pytest.raises(ValueError, match="not found"):
        await create_delivery_from_so(
            db,
            so_doc_entry=SO_DOC_ENTRY,
            payload=request,
            org_id=OTHER_ORG_ID,
            user_id=USER_ID,
        )


# ---------------------------------------------------------------------------
# Tests: DRAFT → OPEN transition (primary accounting event)
# ---------------------------------------------------------------------------


async def _create_draft_dn(
    db: _FakeDB,
    qty1: float = 5.0,
    include_line2: bool = False,
    qty2: float = 3.0,
) -> str:
    """Helper: create a Delivery in DRAFT and return its doc_entry."""
    db["sales_orders_v2"]._add(_make_so(include_line2=include_line2))
    request = _make_delivery_request(qty1=qty1, include_line2=include_line2, qty2=qty2)
    dn = await create_delivery_from_so(
        db, so_doc_entry=SO_DOC_ENTRY, payload=request, org_id=ORG_ID, user_id=USER_ID
    )
    return dn.doc_entry


@pytest.mark.asyncio
async def test_open_transition_decrements_inventory() -> None:
    """
    DRAFT → OPEN: inventory_movements rows should be created with negative quantity.
    """
    db = _FakeDB()
    doc_entry = await _create_draft_dn(db, qty1=5.0)

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        req = DeliveryStatusTransitionRequest(new_status=DocumentStatus.OPEN)
        dn = await transition_status(
            db, doc_entry=doc_entry, request_body=req, org_id=ORG_ID, user_id=USER_ID
        )

    assert dn is not None
    assert dn.status == DocumentStatus.OPEN

    # Check inventory_movements rows.
    movements = db["inventory_movements"]._docs
    assert len(movements) == 1
    mov = movements[0]
    assert mov["movementType"] == "delivery"
    assert mov["quantity"] < 0  # Outgoing (negative)
    assert mov["sourceDocType"] == "DELIVERY"
    assert mov["sourceDocEntry"] == doc_entry


@pytest.mark.asyncio
async def test_open_transition_increments_so_delivered_qty() -> None:
    """
    DRAFT → OPEN: SO line deliveredQty should be incremented by line qty.
    """
    db = _FakeDB()
    doc_entry = await _create_draft_dn(db, qty1=5.0)

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        req = DeliveryStatusTransitionRequest(new_status=DocumentStatus.OPEN)
        await transition_status(
            db, doc_entry=doc_entry, request_body=req, org_id=ORG_ID, user_id=USER_ID
        )

    # Reload SO and check deliveredQty on line 1.
    so_doc = db["sales_orders_v2"]._docs[0]
    so_line1 = next(ln for ln in so_doc["lines"] if ln["lineId"] == LINE_1_ID)
    assert so_line1["deliveredQty"] == pytest.approx(5.0)


@pytest.mark.asyncio
async def test_open_transition_emits_outbox_event() -> None:
    """
    DRAFT → OPEN: an outbox event with event_type=delivery_posted should be
    written with correct payload shape.
    """
    db = _FakeDB()
    doc_entry = await _create_draft_dn(db, qty1=5.0)

    emitted_event_id = str(uuid.uuid4())
    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=emitted_event_id,
    ) as mock_publish:
        req = DeliveryStatusTransitionRequest(new_status=DocumentStatus.OPEN)
        dn = await transition_status(
            db, doc_entry=doc_entry, request_body=req, org_id=ORG_ID, user_id=USER_ID
        )

    # Verify OutboxWriter.publish was called with delivery_posted event.
    mock_publish.assert_called_once()
    call_kwargs = mock_publish.call_args
    assert call_kwargs.kwargs["event_type"] == "delivery_posted"
    assert call_kwargs.kwargs["organization_id"] == ORG_ID

    payload = call_kwargs.kwargs["payload"]
    assert payload["deliveryDocEntry"] == doc_entry
    assert len(payload["lines"]) == 1
    assert "totalCogs" in payload
    assert "sourceSoDocEntry" in payload

    # outboxEventId should be stamped on the Delivery header.
    assert dn.outbox_event_id == emitted_event_id
    assert dn.outbox_event_emitted_at is not None


@pytest.mark.asyncio
async def test_open_transition_auto_closes_so_when_fully_delivered() -> None:
    """
    When all SO lines are fully delivered, the SO should transition to CLOSED.
    """
    db = _FakeDB()
    # Single-line SO with qty=10; deliver all 10.
    doc_entry = await _create_draft_dn(db, qty1=10.0)

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        req = DeliveryStatusTransitionRequest(new_status=DocumentStatus.OPEN)
        await transition_status(
            db, doc_entry=doc_entry, request_body=req, org_id=ORG_ID, user_id=USER_ID
        )

    so_doc = db["sales_orders_v2"]._docs[0]
    assert so_doc["status"] == DocumentStatus.CLOSED.value


@pytest.mark.asyncio
async def test_open_transition_partly_closes_so_when_partial_delivery() -> None:
    """
    When SO has open lines remaining after delivery, the SO transitions to PARTLY_CLOSED.
    """
    db = _FakeDB()
    # Single-line SO with qty=10; deliver only 5.
    doc_entry = await _create_draft_dn(db, qty1=5.0)

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        req = DeliveryStatusTransitionRequest(new_status=DocumentStatus.OPEN)
        await transition_status(
            db, doc_entry=doc_entry, request_body=req, org_id=ORG_ID, user_id=USER_ID
        )

    so_doc = db["sales_orders_v2"]._docs[0]
    assert so_doc["status"] == DocumentStatus.PARTLY_CLOSED.value


@pytest.mark.asyncio
async def test_multiline_so_partial_delivery_auto_partly_closed() -> None:
    """
    SO has 2 lines (qty=10 + qty=5). Deliver line 1 fully, line 2 partially.
    SO should remain PARTLY_CLOSED after the Delivery is OPENed.
    """
    db = _FakeDB()
    # Both lines on the SO; deliver all of line 1, only 3 of line 2.
    db["sales_orders_v2"]._add(_make_so(include_line2=True))
    request = _make_delivery_request(qty1=10.0, include_line2=True, qty2=3.0)
    dn_resp = await create_delivery_from_so(
        db, so_doc_entry=SO_DOC_ENTRY, payload=request, org_id=ORG_ID, user_id=USER_ID
    )
    doc_entry = dn_resp.doc_entry

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        req = DeliveryStatusTransitionRequest(new_status=DocumentStatus.OPEN)
        await transition_status(
            db, doc_entry=doc_entry, request_body=req, org_id=ORG_ID, user_id=USER_ID
        )

    so_doc = db["sales_orders_v2"]._docs[0]
    # Line 2 still has 2 open → PARTLY_CLOSED.
    assert so_doc["status"] == DocumentStatus.PARTLY_CLOSED.value


@pytest.mark.asyncio
async def test_multiline_all_lines_delivered_auto_closes_so() -> None:
    """
    SO has 2 lines. Deliver all of both lines → SO transitions to CLOSED.
    """
    db = _FakeDB()
    db["sales_orders_v2"]._add(_make_so(include_line2=True))
    request = _make_delivery_request(qty1=10.0, include_line2=True, qty2=5.0)
    dn_resp = await create_delivery_from_so(
        db, so_doc_entry=SO_DOC_ENTRY, payload=request, org_id=ORG_ID, user_id=USER_ID
    )
    doc_entry = dn_resp.doc_entry

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        req = DeliveryStatusTransitionRequest(new_status=DocumentStatus.OPEN)
        await transition_status(
            db, doc_entry=doc_entry, request_body=req, org_id=ORG_ID, user_id=USER_ID
        )

    so_doc = db["sales_orders_v2"]._docs[0]
    assert so_doc["status"] == DocumentStatus.CLOSED.value


# ---------------------------------------------------------------------------
# Tests: OPEN → CANCELLED
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancel_open_delivery_restores_inventory() -> None:
    """
    OPEN → CANCELLED: reversing inventory_movements rows should be created.
    """
    db = _FakeDB()
    doc_entry = await _create_draft_dn(db, qty1=5.0)

    # First open the delivery.
    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        open_req = DeliveryStatusTransitionRequest(new_status=DocumentStatus.OPEN)
        await transition_status(
            db,
            doc_entry=doc_entry,
            request_body=open_req,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    movements_after_open = len(db["inventory_movements"]._docs)

    # Now cancel the delivery.
    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        cancel_req = DeliveryStatusTransitionRequest(
            new_status=DocumentStatus.CANCELLED
        )
        dn = await transition_status(
            db,
            doc_entry=doc_entry,
            request_body=cancel_req,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    assert dn.status == DocumentStatus.CANCELLED
    # A reversing movement row should have been added.
    assert len(db["inventory_movements"]._docs) == movements_after_open + 1
    reversal = db["inventory_movements"]._docs[-1]
    assert reversal["movementType"] == "delivery_reversal"
    assert reversal["quantity"] > 0  # Positive = restore


@pytest.mark.asyncio
async def test_cancel_open_delivery_decrements_so_delivered_qty_back() -> None:
    """
    OPEN → CANCELLED: SO line deliveredQty should be decremented back.
    """
    db = _FakeDB()
    doc_entry = await _create_draft_dn(db, qty1=5.0)

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=doc_entry,
            request_body=DeliveryStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # Verify deliveredQty incremented.
    so_doc = db["sales_orders_v2"]._docs[0]
    line1 = next(ln for ln in so_doc["lines"] if ln["lineId"] == LINE_1_ID)
    assert line1["deliveredQty"] == pytest.approx(5.0)

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=doc_entry,
            request_body=DeliveryStatusTransitionRequest(
                new_status=DocumentStatus.CANCELLED
            ),
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # deliveredQty should be back to 0.
    so_doc = db["sales_orders_v2"]._docs[0]
    line1 = next(ln for ln in so_doc["lines"] if ln["lineId"] == LINE_1_ID)
    assert line1["deliveredQty"] == pytest.approx(0.0)


@pytest.mark.asyncio
async def test_cancel_delivery_emits_delivery_cancelled_event() -> None:
    """
    OPEN → CANCELLED: delivery_cancelled outbox event should be emitted with
    originalEventId referencing the delivery_posted event.
    """
    db = _FakeDB()
    doc_entry = await _create_draft_dn(db, qty1=5.0)

    original_event_id = str(uuid.uuid4())

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=original_event_id,
    ):
        await transition_status(
            db,
            doc_entry=doc_entry,
            request_body=DeliveryStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    cancel_event_id = str(uuid.uuid4())
    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=cancel_event_id,
    ) as mock_cancel_publish:
        await transition_status(
            db,
            doc_entry=doc_entry,
            request_body=DeliveryStatusTransitionRequest(
                new_status=DocumentStatus.CANCELLED
            ),
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # Verify the cancel event was published with delivery_cancelled event type.
    mock_cancel_publish.assert_called_once()
    call_kwargs = mock_cancel_publish.call_args
    assert call_kwargs.kwargs["event_type"] == "delivery_cancelled"
    payload = call_kwargs.kwargs["payload"]
    assert payload["originalEventId"] == original_event_id


# ---------------------------------------------------------------------------
# Tests: OPEN → CLOSED (terminal close — no side effects)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_open_to_closed_transition_no_inventory_effect() -> None:
    """
    OPEN → CLOSED: terminal close should not create inventory_movements rows
    beyond what was created at OPEN-transition.
    """
    db = _FakeDB()
    doc_entry = await _create_draft_dn(db, qty1=5.0)

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=doc_entry,
            request_body=DeliveryStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    movements_after_open = len(db["inventory_movements"]._docs)

    # For CLOSED transition, OutboxWriter should NOT be called.
    # We just call transition directly without any outbox mock needed
    # because the CLOSED branch doesn't call OutboxWriter.publish.
    dn = await transition_status(
        db,
        doc_entry=doc_entry,
        request_body=DeliveryStatusTransitionRequest(new_status=DocumentStatus.CLOSED),
        org_id=ORG_ID,
        user_id=USER_ID,
    )

    assert dn.status == DocumentStatus.CLOSED
    # No new inventory movements should have been created on CLOSED transition.
    assert len(db["inventory_movements"]._docs) == movements_after_open


# ---------------------------------------------------------------------------
# Tests: update and delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_patch_draft_delivery_succeeds() -> None:
    """PATCH on a DRAFT Delivery should update the notes field."""
    db = _FakeDB()
    doc_entry = await _create_draft_dn(db)

    update = DeliveryUpdate(notes="Updated notes for test")
    dn = await update_delivery(
        db, doc_entry=doc_entry, payload=update, org_id=ORG_ID, user_id=USER_ID
    )

    assert dn is not None
    assert dn.notes == "Updated notes for test"


@pytest.mark.asyncio
async def test_patch_open_delivery_raises() -> None:
    """PATCH on an OPEN Delivery should raise ValueError (→ 409)."""
    db = _FakeDB()
    doc_entry = await _create_draft_dn(db)

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=doc_entry,
            request_body=DeliveryStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    update = DeliveryUpdate(notes="Should fail")
    with pytest.raises(ValueError, match="only DRAFT Deliveries may be edited"):
        await update_delivery(
            db, doc_entry=doc_entry, payload=update, org_id=ORG_ID, user_id=USER_ID
        )


@pytest.mark.asyncio
async def test_delete_draft_delivery_succeeds() -> None:
    """DELETE on a DRAFT Delivery should return True and remove the document."""
    db = _FakeDB()
    doc_entry = await _create_draft_dn(db)

    deleted = await delete_delivery(
        db, doc_entry=doc_entry, org_id=ORG_ID, user_id=USER_ID
    )
    assert deleted is True

    # Should not be retrievable afterwards.
    result = await get_delivery(db, doc_entry=doc_entry, org_id=ORG_ID)
    assert result is None


@pytest.mark.asyncio
async def test_delete_open_delivery_raises() -> None:
    """DELETE on an OPEN Delivery should raise ValueError (→ 409)."""
    db = _FakeDB()
    doc_entry = await _create_draft_dn(db)

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=doc_entry,
            request_body=DeliveryStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    with pytest.raises(ValueError, match="only DRAFT Deliveries may be deleted"):
        await delete_delivery(db, doc_entry=doc_entry, org_id=ORG_ID, user_id=USER_ID)


# ---------------------------------------------------------------------------
# Tests: get / list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_delivery_returns_none_for_missing() -> None:
    """get_delivery should return None for a non-existent doc_entry."""
    db = _FakeDB()
    result = await get_delivery(db, doc_entry="no-such-dn", org_id=ORG_ID)
    assert result is None


@pytest.mark.asyncio
async def test_get_delivery_cross_org_isolation() -> None:
    """get_delivery with a different org_id should return None."""
    db = _FakeDB()
    doc_entry = await _create_draft_dn(db)
    result = await get_delivery(db, doc_entry=doc_entry, org_id=OTHER_ORG_ID)
    assert result is None


@pytest.mark.asyncio
async def test_list_deliveries_returns_created_doc() -> None:
    """list_deliveries should return the created DRAFT Delivery."""
    db = _FakeDB()
    await _create_draft_dn(db)

    result = await list_deliveries(db, org_id=ORG_ID)
    assert result["total"] == 1
    assert len(result["items"]) == 1
    assert result["items"][0].status == DocumentStatus.DRAFT


@pytest.mark.asyncio
async def test_list_deliveries_cross_org_isolation() -> None:
    """list_deliveries for a different org should return empty."""
    db = _FakeDB()
    await _create_draft_dn(db)
    result = await list_deliveries(db, org_id=OTHER_ORG_ID)
    assert result["total"] == 0


# ---------------------------------------------------------------------------
# Tests: illegal transitions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_draft_to_partly_closed_illegal() -> None:
    """DRAFT → PARTLY_CLOSED is illegal per the LEGAL_TRANSITIONS table."""
    db = _FakeDB()
    doc_entry = await _create_draft_dn(db)
    req = DeliveryStatusTransitionRequest(new_status=DocumentStatus.PARTLY_CLOSED)
    with pytest.raises(ValueError, match="Illegal DELIVERY transition"):
        await transition_status(
            db, doc_entry=doc_entry, request_body=req, org_id=ORG_ID, user_id=USER_ID
        )


@pytest.mark.asyncio
async def test_closed_delivery_is_terminal() -> None:
    """
    CLOSED is a terminal state — no further transitions are allowed.
    Verify that attempting CLOSED → OPEN raises IllegalTransition.
    """
    db = _FakeDB()
    doc_entry = await _create_draft_dn(db)

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=doc_entry,
            request_body=DeliveryStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=ORG_ID,
            user_id=USER_ID,
        )
        await transition_status(
            db,
            doc_entry=doc_entry,
            request_body=DeliveryStatusTransitionRequest(
                new_status=DocumentStatus.CLOSED
            ),
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # CLOSED → anything is illegal (terminal state).
    req = DeliveryStatusTransitionRequest(new_status=DocumentStatus.OPEN)
    with pytest.raises(ValueError, match="Illegal DELIVERY transition"):
        await transition_status(
            db, doc_entry=doc_entry, request_body=req, org_id=ORG_ID, user_id=USER_ID
        )


# ---------------------------------------------------------------------------
# Tests: moving avg cost with inventory_balances record present
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unit_cost_snapshotted_from_inventory_balances() -> None:
    """
    When an inventory_balances record exists, unit_cost should be snapshotted
    from avgCost instead of defaulting to 0.00.
    """
    db = _FakeDB()
    # Seed an inventory_balances record with avgCost = 12.50.
    db["inventory_balances"]._add(
        {
            "itemId": ITEM_1_ID,
            "warehouseId": WAREHOUSE_ID,
            "organizationId": ORG_ID,
            "avgCost": 12.50,
            "quantityOnHand": 100.0,
        }
    )
    db["sales_orders_v2"]._add(_make_so())

    request = _make_delivery_request(qty1=5.0)
    dn = await create_delivery_from_so(
        db, so_doc_entry=SO_DOC_ENTRY, payload=request, org_id=ORG_ID, user_id=USER_ID
    )

    line = dn.lines[0]
    assert line.unit_cost == Decimal("12.50")
    # line_cogs = 5 * 12.50 = 62.50
    assert line.line_cogs == Decimal("62.50")
