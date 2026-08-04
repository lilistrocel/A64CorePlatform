"""
Tests for T-201.5 — AR Invoice ↔ Delivery visibility and auto-close.

Covers:
  - Part B-1: list_deliveries returns openInvoiceQty (camelCase alias) field,
    correctly summed across lines, and decreasing as AR Invoices are created.
  - Part B-1: filter behaviour preserved (status=OPEN filter works as before).
  - Part B-2: creating a from-Delivery AR Invoice that consumes all remaining
    qty transitions the DN to CLOSED.
  - Part B-2: partial invoicing leaves the Delivery in OPEN.
  - Part B-2: multi-line Delivery — closing requires ALL lines fully invoiced.
  - Part B-2: auto-close writes an audit entry to deliveries_v2_audit with
    action="auto_close_on_full_invoice".
  - Part B-2: already-CLOSED Delivery does not trigger a second auto-close.

Uses the same in-memory fake Motor DB pattern as test_deliveries.py and
test_ar_invoices.py.  Finance ext lookups are mocked at the service-layer
helper level.

Run:
    pytest src/modules/sales/tests/test_delivery_invoice_visibility.py -v
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, patch

import pytest

from src.core.documents.document_links import DocumentLinkRef
from src.core.documents.document_status import DocumentStatus
from src.modules.sales.models.ar_invoices import (
    ARInvoiceFromDeliveryLineRequest,
    ARInvoiceFromDeliveryRequest,
    ARInvoiceLineCreate,
    ARInvoiceStatusTransitionRequest,
    ARInvoiceUpdate,
)
from src.modules.sales.services.ar_invoice_service import (
    create_ar_invoice_from_delivery,
    delete_ar_invoice,
    transition_status,
    update_ar_invoice,
)
from src.modules.sales.services.delivery_service import list_deliveries

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
                _apply_update_embedded(doc, query, update)
                return doc
        if upsert:
            new_doc: Dict[str, Any] = {}
            if "_id" in query:
                new_doc["_id"] = query["_id"]
            _apply_update_embedded(new_doc, query, update)
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
    """Minimal fake Motor database."""

    def __init__(self) -> None:
        self._collections: Dict[str, _FakeCollection] = {}

    def __getitem__(self, name: str) -> _FakeCollection:
        if name not in self._collections:
            self._collections[name] = _FakeCollection()
        return self._collections[name]


# ---------------------------------------------------------------------------
# Query / update helpers (identical to test_ar_invoices.py)
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


def _apply_update_embedded(
    doc: Dict[str, Any], query: Dict[str, Any], update: Dict[str, Any]
) -> None:
    """Apply updates including positional operator ($) on embedded arrays."""
    line_id_query: Optional[str] = None
    for k, v in query.items():
        if k == "lines.lineId":
            line_id_query = v

    if "$set" in update:
        for field, val in update["$set"].items():
            if ".$." not in field:
                doc[field] = val

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

    if "$pull" in update:
        for field, match_spec in update["$pull"].items():
            if field.startswith("lines.$."):
                # Pull matching items from an embedded array on the matched line.
                sub_field = field[len("lines.$.") :]
                if line_id_query is not None:
                    for line in doc.get("lines", []):
                        if line.get("lineId") == line_id_query:
                            arr = line.get(sub_field, [])
                            line[sub_field] = [
                                item for item in arr if not _matches(item, match_spec)
                            ]
                            break
            else:
                # Pull matching items from a top-level array field.
                arr = doc.get(field, [])
                doc[field] = [item for item in arr if not _matches(item, match_spec)]


# ---------------------------------------------------------------------------
# Constants and shared fixtures
# ---------------------------------------------------------------------------

ORG_ID = "org-test-vis-001"
OTHER_ORG_ID = "org-test-vis-other"
USER_ID = "user-vis-abc-123"
COMPANY_CODE = "A001"
CUSTOMER_ID = "customer-vis-001"
CUSTOMER_NAME = "Visibility Test Customer"
ITEM_1_ID = "item-vis-001"
ITEM_2_ID = "item-vis-002"

DN_LINE_1_ID = str(uuid.uuid4())
DN_LINE_2_ID = str(uuid.uuid4())

REVENUE_ACCOUNT_ID = "gl-revenue-vis-001"

_ITEM_FIN_EXT_DATA_1 = {
    "sale_item_finance_ext_id": "ext-vis-001",
    "itemId": ITEM_1_ID,
    "organizationId": ORG_ID,
    "revenueAccountId": REVENUE_ACCOUNT_ID,
    "cogsAccountId": "gl-cogs-vis-001",
    "salesTaxCode": None,
    "isSellable": True,
}

_ITEM_FIN_EXT_DATA_2 = {
    "sale_item_finance_ext_id": "ext-vis-002",
    "itemId": ITEM_2_ID,
    "organizationId": ORG_ID,
    "revenueAccountId": REVENUE_ACCOUNT_ID,
    "cogsAccountId": "gl-cogs-vis-001",
    "salesTaxCode": None,
    "isSellable": True,
}


def _patch_item_ext_multi() -> Any:
    """Patch _get_item_finance_ext to handle item 1 and item 2."""

    async def _side_effect(
        item_id: str, org_id: str, auth_token: Any
    ) -> Dict[str, Any]:
        if item_id == ITEM_1_ID:
            return dict(_ITEM_FIN_EXT_DATA_1)
        if item_id == ITEM_2_ID:
            return dict(_ITEM_FIN_EXT_DATA_2)
        raise ValueError(f"Item '{item_id}' has no sale_item_finance_ext record")

    return patch(
        "src.modules.sales.services.ar_invoice_service._get_item_finance_ext",
        side_effect=_side_effect,
    )


def _patch_customer_ext() -> Any:
    """Patch _get_customer_finance_ext to return a canned response."""
    return patch(
        "src.modules.sales.services.ar_invoice_service._get_customer_finance_ext",
        new_callable=AsyncMock,
        return_value={
            "customerId": CUSTOMER_ID,
            "arControlAccountId": "gl-ar-vis-001",
        },
    )


def _make_delivery(
    doc_entry: Optional[str] = None,
    status: str = "open",
    line1_qty: float = 10.0,
    line1_invoiced: float = 0.0,
    line1_credited: float = 0.0,
    line1_cancelled: float = 0.0,
    include_line2: bool = False,
    line2_qty: float = 5.0,
    line2_invoiced: float = 0.0,
    line2_credited: float = 0.0,
    line2_cancelled: float = 0.0,
) -> Dict[str, Any]:
    """
    Build a minimal deliveries_v2 document for testing.

    Args:
        doc_entry:       UUID override for stable test references.
        status:          Document status value string.
        line1_qty:       Line 1 quantity (orderedQty = quantity).
        line1_invoiced:  Line 1 invoicedQty (already invoiced before this test).
        line1_credited:  Line 1 creditedQty.
        line1_cancelled: Line 1 cancelledQty.
        include_line2:   Whether to add a second line.
        line2_qty/etc:   Same fields for line 2.

    Returns:
        Raw deliveries_v2 document dict.
    """
    entry = doc_entry or str(uuid.uuid4())
    lines = [
        {
            "lineId": DN_LINE_1_ID,
            "lineNumber": 1,
            "itemId": ITEM_1_ID,
            "itemCode": "ITEM-VIS-001",
            "itemName": "Visibility Test Item 1",
            "description": "Visibility Test Item 1",
            "quantity": line1_qty,
            "uom": "pcs",
            "warehouseId": "WH-VIS",
            "unitCost": 50.0,
            "lineCogs": line1_qty * 50.0,
            "costCenterId": None,
            "orderedQty": line1_qty,
            "invoicedQty": line1_invoiced,
            "creditedQty": line1_credited,
            "cancelledQty": line1_cancelled,
            "targetDocRefs": [],
            "baseDocRef": None,
        },
    ]
    if include_line2:
        lines.append(
            {
                "lineId": DN_LINE_2_ID,
                "lineNumber": 2,
                "itemId": ITEM_2_ID,
                "itemCode": "ITEM-VIS-002",
                "itemName": "Visibility Test Item 2",
                "description": "Visibility Test Item 2",
                "quantity": line2_qty,
                "uom": "kg",
                "warehouseId": "WH-VIS",
                "unitCost": 30.0,
                "lineCogs": line2_qty * 30.0,
                "costCenterId": None,
                "orderedQty": line2_qty,
                "invoicedQty": line2_invoiced,
                "creditedQty": line2_credited,
                "cancelledQty": line2_cancelled,
                "targetDocRefs": [],
                "baseDocRef": None,
            }
        )

    return {
        "docEntry": entry,
        "docNumber": "DN-2026-VIS-0001",
        "docType": "DELIVERY",
        "organizationId": ORG_ID,
        "companyCode": COMPANY_CODE,
        "customerId": CUSTOMER_ID,
        "customerName": CUSTOMER_NAME,
        # Reason: use bare date objects (not datetime) in the fake DB to match
        # the existing test_ar_invoices.py pattern; this avoids the
        # datetime vs date comparison error in _compute_tax_date when the
        # service reads back actualDeliveryDate as the date_of_supply.
        "docDate": date(2026, 1, 15),
        "actualDeliveryDate": date(2026, 1, 15),
        "status": status,
        "deliveredByUserId": None,
        "notes": None,
        "totalCogs": sum(ln["lineCogs"] for ln in lines),
        "baseDocRef": {
            "docType": "SO",
            "docId": "so-vis-001",
            "docNumber": "SO-2026-VIS-0001",
            "lineId": None,
        },
        "targetDocRefs": [],
        "outboxEventId": None,
        "outboxEventEmittedAt": None,
        "lines": lines,
        "createdAt": datetime.now(tz=timezone.utc),
        "createdBy": USER_ID,
        "updatedAt": datetime.now(tz=timezone.utc),
        "updatedBy": USER_ID,
    }


def _make_from_delivery_payload(
    qty1: float = 5.0,
    include_line2: bool = False,
    qty2: float = 3.0,
) -> ARInvoiceFromDeliveryRequest:
    """Build a minimal ARInvoiceFromDeliveryRequest for testing."""
    lines: List[ARInvoiceFromDeliveryLineRequest] = [
        ARInvoiceFromDeliveryLineRequest(
            delivery_line_id=DN_LINE_1_ID,
            quantity=Decimal(str(qty1)),
            unit_price=Decimal("100"),
        )
    ]
    if include_line2:
        lines.append(
            ARInvoiceFromDeliveryLineRequest(
                delivery_line_id=DN_LINE_2_ID,
                quantity=Decimal(str(qty2)),
                unit_price=Decimal("80"),
            )
        )
    return ARInvoiceFromDeliveryRequest(
        company_code=COMPANY_CODE,
        doc_date=date(2026, 2, 1),
        invoice_date=date(2026, 2, 1),
        lines=lines,
    )


# ---------------------------------------------------------------------------
# Part B-1 tests: openInvoiceQty in list_deliveries
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_deliveries_includes_open_invoice_qty_field() -> None:
    """
    list_deliveries returns openInvoiceQty (camelCase alias via response config).

    A freshly-created Delivery with no invoiced qty should have
    open_invoice_qty = sum of line quantities.
    """
    db = _FakeDB()
    doc_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=doc_entry, line1_qty=10.0)
    db["deliveries_v2"]._add(dn)

    result = await list_deliveries(db, ORG_ID)

    assert result["total"] == 1
    items = result["items"]
    assert len(items) == 1
    item = items[0]

    # The field must be present on the model.
    assert hasattr(item, "open_invoice_qty")
    # All 10 units un-invoiced.
    assert item.open_invoice_qty == Decimal("10")


@pytest.mark.asyncio
async def test_list_deliveries_open_invoice_qty_sums_across_lines() -> None:
    """
    open_invoice_qty sums line1 + line2 remaining quantities correctly.

    line1: qty=10, invoiced=0 → open=10
    line2: qty=5,  invoiced=0 → open=5
    total open = 15
    """
    db = _FakeDB()
    doc_entry = str(uuid.uuid4())
    dn = _make_delivery(
        doc_entry=doc_entry,
        line1_qty=10.0,
        include_line2=True,
        line2_qty=5.0,
    )
    db["deliveries_v2"]._add(dn)

    result = await list_deliveries(db, ORG_ID)
    item = result["items"][0]
    assert item.open_invoice_qty == Decimal("15")


@pytest.mark.asyncio
async def test_list_deliveries_open_invoice_qty_decreases_after_partial_invoice() -> (
    None
):
    """
    After partially invoicing, open_invoice_qty reflects the remaining qty.

    Seeded state: qty=10, already invoiced=3 → open=7.
    """
    db = _FakeDB()
    doc_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=doc_entry, line1_qty=10.0, line1_invoiced=3.0)
    db["deliveries_v2"]._add(dn)

    result = await list_deliveries(db, ORG_ID)
    item = result["items"][0]
    assert item.open_invoice_qty == Decimal("7")


@pytest.mark.asyncio
async def test_list_deliveries_open_invoice_qty_zero_when_fully_invoiced() -> None:
    """
    A fully-invoiced Delivery should have open_invoice_qty = 0.

    Seeded state: qty=10, invoiced=10 → open=0.
    """
    db = _FakeDB()
    doc_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=doc_entry, line1_qty=10.0, line1_invoiced=10.0)
    db["deliveries_v2"]._add(dn)

    result = await list_deliveries(db, ORG_ID)
    item = result["items"][0]
    assert item.open_invoice_qty == Decimal("0")


@pytest.mark.asyncio
async def test_list_deliveries_open_invoice_qty_accounts_for_credited_qty() -> None:
    """
    creditedQty also reduces open_invoice_qty.

    qty=10, invoiced=4, credited=2 → open=4.
    """
    db = _FakeDB()
    doc_entry = str(uuid.uuid4())
    dn = _make_delivery(
        doc_entry=doc_entry,
        line1_qty=10.0,
        line1_invoiced=4.0,
        line1_credited=2.0,
    )
    db["deliveries_v2"]._add(dn)

    result = await list_deliveries(db, ORG_ID)
    item = result["items"][0]
    assert item.open_invoice_qty == Decimal("4")


@pytest.mark.asyncio
async def test_list_deliveries_status_filter_preserved() -> None:
    """
    Filtering by status=OPEN works exactly as before the B-1 change.

    Two Deliveries: one OPEN, one CLOSED.  Filter status=open → only the
    OPEN one returned.
    """
    db = _FakeDB()
    open_entry = str(uuid.uuid4())
    closed_entry = str(uuid.uuid4())
    dn_open = _make_delivery(doc_entry=open_entry, status="open", line1_qty=10.0)
    dn_closed = _make_delivery(
        doc_entry=closed_entry,
        status="closed",
        line1_qty=10.0,
        line1_invoiced=10.0,
    )
    db["deliveries_v2"]._add(dn_open)
    db["deliveries_v2"]._add(dn_closed)

    result = await list_deliveries(db, ORG_ID, status="open")

    assert result["total"] == 1
    assert result["items"][0].doc_entry == open_entry


@pytest.mark.asyncio
async def test_list_deliveries_customer_filter_preserved() -> None:
    """
    Filtering by customer_id works correctly alongside the new open_invoice_qty.
    """
    db = _FakeDB()
    entry_a = str(uuid.uuid4())
    entry_b = str(uuid.uuid4())
    dn_a = _make_delivery(doc_entry=entry_a, line1_qty=10.0)
    # Alter customer for the second doc.
    dn_b = _make_delivery(doc_entry=entry_b, line1_qty=5.0)
    dn_b = dict(dn_b)
    dn_b["customerId"] = "other-customer"
    db["deliveries_v2"]._add(dn_a)
    db["deliveries_v2"]._add(dn_b)

    result = await list_deliveries(db, ORG_ID, customer_id=CUSTOMER_ID)

    assert result["total"] == 1
    assert result["items"][0].doc_entry == entry_a


@pytest.mark.asyncio
async def test_list_deliveries_pagination_total_count_correct() -> None:
    """
    Pagination + total count are unaffected by the B-1 change.

    Insert 3 Deliveries; fetch page 1 with size=2.
    """
    db = _FakeDB()
    for _ in range(3):
        db["deliveries_v2"]._add(_make_delivery(doc_entry=str(uuid.uuid4())))

    result = await list_deliveries(db, ORG_ID, page=1, size=2)

    assert result["total"] == 3
    assert len(result["items"]) == 2
    assert result["totalPages"] == 2


@pytest.mark.asyncio
async def test_list_deliveries_open_invoice_qty_updates_after_create_from_delivery() -> (
    None
):
    """
    Integration: open_invoice_qty reported by list_deliveries decreases after
    an AR Invoice is created from the Delivery.

    Step 1: Seed a Delivery with qty=10, invoiced=0.
    Step 2: Create an AR Invoice for qty=6.
    Step 3: list_deliveries → open_invoice_qty should be 4.
    """
    db = _FakeDB()
    doc_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=doc_entry, line1_qty=10.0)
    db["deliveries_v2"]._add(dn)

    # Create AR Invoice for 6 units.
    payload = _make_from_delivery_payload(qty1=6.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=doc_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    result = await list_deliveries(db, ORG_ID)
    item = result["items"][0]
    assert item.open_invoice_qty == Decimal("4")


# ---------------------------------------------------------------------------
# Part B-2 tests: auto-close Delivery on full invoice
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_full_invoice_closes_delivery() -> None:
    """
    Creating a from-Delivery AR Invoice that consumes ALL remaining qty
    transitions the Delivery from OPEN to CLOSED.
    """
    db = _FakeDB()
    doc_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=doc_entry, line1_qty=10.0)
    db["deliveries_v2"]._add(dn)

    # Invoice for all 10 units.
    payload = _make_from_delivery_payload(qty1=10.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=doc_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # Reload the Delivery from the fake DB.
    dn_docs = [d for d in db["deliveries_v2"]._docs if d.get("docEntry") == doc_entry]
    assert len(dn_docs) == 1
    assert dn_docs[0]["status"] == DocumentStatus.CLOSED.value


@pytest.mark.asyncio
async def test_partial_invoice_leaves_delivery_open() -> None:
    """
    Creating a from-Delivery AR Invoice for LESS than the full qty does NOT
    close the Delivery — it stays OPEN.
    """
    db = _FakeDB()
    doc_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=doc_entry, line1_qty=10.0)
    db["deliveries_v2"]._add(dn)

    # Invoice for only 6 out of 10 units.
    payload = _make_from_delivery_payload(qty1=6.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=doc_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    dn_docs = [d for d in db["deliveries_v2"]._docs if d.get("docEntry") == doc_entry]
    assert dn_docs[0]["status"] == DocumentStatus.OPEN.value


@pytest.mark.asyncio
async def test_partial_then_full_invoice_closes_delivery() -> None:
    """
    Two sequential AR Invoices: first partial (6/10), second consumes the rest
    (4/10).  After the second invoice the Delivery should be CLOSED.
    """
    db = _FakeDB()
    doc_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=doc_entry, line1_qty=10.0)
    db["deliveries_v2"]._add(dn)

    # First invoice: 6 units.
    payload1 = _make_from_delivery_payload(qty1=6.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=doc_entry,
            payload=payload1,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    dn_docs = [d for d in db["deliveries_v2"]._docs if d.get("docEntry") == doc_entry]
    assert (
        dn_docs[0]["status"] == DocumentStatus.OPEN.value
    ), "Should still be OPEN after partial"

    # Second invoice: remaining 4 units.
    payload2 = _make_from_delivery_payload(qty1=4.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=doc_entry,
            payload=payload2,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    dn_docs = [d for d in db["deliveries_v2"]._docs if d.get("docEntry") == doc_entry]
    assert (
        dn_docs[0]["status"] == DocumentStatus.CLOSED.value
    ), "Should be CLOSED after full invoice"


@pytest.mark.asyncio
async def test_multiline_partial_one_line_does_not_close() -> None:
    """
    Multi-line Delivery: invoicing only line 1 fully does NOT close the
    Delivery while line 2 still has open qty.
    """
    db = _FakeDB()
    doc_entry = str(uuid.uuid4())
    dn = _make_delivery(
        doc_entry=doc_entry,
        line1_qty=10.0,
        include_line2=True,
        line2_qty=5.0,
    )
    db["deliveries_v2"]._add(dn)

    # Invoice only line 1 fully; skip line 2.
    payload = _make_from_delivery_payload(qty1=10.0, include_line2=False)
    with _patch_item_ext_multi(), _patch_customer_ext():
        await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=doc_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    dn_docs = [d for d in db["deliveries_v2"]._docs if d.get("docEntry") == doc_entry]
    assert (
        dn_docs[0]["status"] == DocumentStatus.OPEN.value
    ), "Delivery must stay OPEN when line 2 is not yet invoiced"


@pytest.mark.asyncio
async def test_multiline_all_lines_full_invoice_closes_delivery() -> None:
    """
    Multi-line Delivery: invoicing BOTH lines fully closes the Delivery.
    """
    db = _FakeDB()
    doc_entry = str(uuid.uuid4())
    dn = _make_delivery(
        doc_entry=doc_entry,
        line1_qty=10.0,
        include_line2=True,
        line2_qty=5.0,
    )
    db["deliveries_v2"]._add(dn)

    # Invoice both lines fully in one AR Invoice.
    payload = _make_from_delivery_payload(qty1=10.0, include_line2=True, qty2=5.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=doc_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    dn_docs = [d for d in db["deliveries_v2"]._docs if d.get("docEntry") == doc_entry]
    assert dn_docs[0]["status"] == DocumentStatus.CLOSED.value


@pytest.mark.asyncio
async def test_auto_close_writes_audit_entry() -> None:
    """
    When a full-invoice triggers auto-close, an audit entry with
    action='auto_close_on_full_invoice' must appear in deliveries_v2_audit.
    """
    db = _FakeDB()
    doc_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=doc_entry, line1_qty=10.0)
    db["deliveries_v2"]._add(dn)

    payload = _make_from_delivery_payload(qty1=10.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=doc_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    audit_entries = db["deliveries_v2_audit"]._docs
    auto_close_entries = [
        e
        for e in audit_entries
        if e.get("action") == "auto_close_on_full_invoice"
        and e.get("docEntry") == doc_entry
    ]
    assert len(auto_close_entries) == 1
    entry = auto_close_entries[0]
    assert entry["userId"] == USER_ID
    assert "triggeredByAriDocEntry" in entry.get("detail", {})


@pytest.mark.asyncio
async def test_auto_close_audit_references_ari_doc_number() -> None:
    """
    The audit entry detail must contain the ARI doc_number that triggered it.
    """
    db = _FakeDB()
    doc_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=doc_entry, line1_qty=10.0)
    db["deliveries_v2"]._add(dn)

    payload = _make_from_delivery_payload(qty1=10.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        ari = await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=doc_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    audit_entries = db["deliveries_v2_audit"]._docs
    entry = next(
        e for e in audit_entries if e.get("action") == "auto_close_on_full_invoice"
    )
    # The triggering AR Invoice doc_entry must be recorded.
    assert entry["detail"]["triggeredByAriDocEntry"] == ari.doc_entry


@pytest.mark.asyncio
async def test_partial_invoice_does_not_write_auto_close_audit() -> None:
    """
    A partial invoice must NOT write an auto_close_on_full_invoice audit entry.
    """
    db = _FakeDB()
    doc_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=doc_entry, line1_qty=10.0)
    db["deliveries_v2"]._add(dn)

    payload = _make_from_delivery_payload(qty1=6.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=doc_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    audit_entries = db["deliveries_v2_audit"]._docs
    auto_close_entries = [
        e for e in audit_entries if e.get("action") == "auto_close_on_full_invoice"
    ]
    assert len(auto_close_entries) == 0


@pytest.mark.asyncio
async def test_already_closed_delivery_not_re_closed() -> None:
    """
    If a Delivery is already CLOSED (e.g. manual transition before full invoicing),
    the auto-close code must NOT update its status again or write a second audit
    entry.
    """
    db = _FakeDB()
    doc_entry = str(uuid.uuid4())
    # Delivery already CLOSED with invoiced=5 (partial), closed manually.
    dn = _make_delivery(
        doc_entry=doc_entry,
        status="closed",
        line1_qty=10.0,
        line1_invoiced=5.0,
    )
    db["deliveries_v2"]._add(dn)

    # Invoice the remaining 5 units (which would trigger auto-close if OPEN).
    payload = _make_from_delivery_payload(qty1=5.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=doc_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # Status must remain CLOSED (not changed by auto-close).
    dn_docs = [d for d in db["deliveries_v2"]._docs if d.get("docEntry") == doc_entry]
    assert dn_docs[0]["status"] == DocumentStatus.CLOSED.value

    # No auto_close_on_full_invoice audit entry should be written.
    audit_entries = db["deliveries_v2_audit"]._docs
    auto_close_entries = [
        e for e in audit_entries if e.get("action") == "auto_close_on_full_invoice"
    ]
    assert len(auto_close_entries) == 0


@pytest.mark.asyncio
async def test_auto_close_list_deliveries_shows_closed_status() -> None:
    """
    After auto-close, list_deliveries reports the Delivery as CLOSED with
    open_invoice_qty = 0.
    """
    db = _FakeDB()
    doc_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=doc_entry, line1_qty=10.0)
    db["deliveries_v2"]._add(dn)

    # Full invoice — triggers auto-close.
    payload = _make_from_delivery_payload(qty1=10.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=doc_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    result = await list_deliveries(db, ORG_ID)
    item = result["items"][0]
    assert item.status == DocumentStatus.CLOSED
    assert item.open_invoice_qty == Decimal("0")


# ---------------------------------------------------------------------------
# T-201.6 tests: update_ar_invoice DN counter reconciliation + release reopen
# ---------------------------------------------------------------------------


def _make_update_payload_with_lines(
    dn_doc_entry: str,
    dn_doc_number: str,
    dn_line_id: str,
    qty: float,
) -> ARInvoiceUpdate:
    """
    Build an ARInvoiceUpdate that replaces the line set with a single line
    anchored to the given Delivery line.

    Args:
        dn_doc_entry:  Delivery docEntry UUID.
        dn_doc_number: Delivery docNumber (for base_doc_ref snapshot).
        dn_line_id:    The Delivery line UUID to reference.
        qty:           New quantity for the line.

    Returns:
        ARInvoiceUpdate with lines set.
    """
    return ARInvoiceUpdate(
        lines=[
            ARInvoiceLineCreate(
                item_id=ITEM_1_ID,
                item_code="ITEM-VIS-001",
                item_name="Visibility Test Item 1",
                quantity=Decimal(str(qty)),
                uom="pcs",
                unit_price=Decimal("100"),
                base_doc_ref=DocumentLinkRef(
                    doc_type="DELIVERY",
                    doc_id=dn_doc_entry,
                    doc_number=dn_doc_number,
                    line_id=dn_line_id,
                ),
            )
        ]
    )


@pytest.mark.asyncio
async def test_update_increases_qty_reconciles_dn_counter() -> None:
    """
    T-201.6 test 1: edit DRAFT from 60 → 80; DN invoicedQty becomes 80; DN stays OPEN.

    DN has orderedQty=100, so 80 is within range.
    """
    db = _FakeDB()
    dn_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=dn_entry, line1_qty=100.0)
    db["deliveries_v2"]._add(dn)

    # Create DRAFT invoice for 60.
    payload = _make_from_delivery_payload(qty1=60.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        ari = await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=dn_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # Verify invoicedQty == 60 on the DN line.
    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    assert dn_doc["lines"][0]["invoicedQty"] == pytest.approx(60.0)
    assert dn_doc["status"] == DocumentStatus.OPEN.value

    # Edit DRAFT to 80.
    update_payload = _make_update_payload_with_lines(
        dn_doc_entry=dn_entry,
        dn_doc_number="DN-2026-VIS-0001",
        dn_line_id=DN_LINE_1_ID,
        qty=80.0,
    )
    with _patch_item_ext_multi():
        await update_ar_invoice(db, ari.doc_entry, update_payload, ORG_ID, USER_ID)

    # DN invoicedQty must be 80; status must still be OPEN (not fully invoiced).
    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    assert dn_doc["lines"][0]["invoicedQty"] == pytest.approx(80.0)
    assert dn_doc["status"] == DocumentStatus.OPEN.value


@pytest.mark.asyncio
async def test_update_decreases_qty_reconciles_dn_counter() -> None:
    """
    T-201.6 test 2: edit DRAFT from 60 → 40; DN invoicedQty becomes 40; DN stays OPEN.
    """
    db = _FakeDB()
    dn_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=dn_entry, line1_qty=100.0)
    db["deliveries_v2"]._add(dn)

    payload = _make_from_delivery_payload(qty1=60.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        ari = await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=dn_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # Edit DRAFT to 40.
    update_payload = _make_update_payload_with_lines(
        dn_doc_entry=dn_entry,
        dn_doc_number="DN-2026-VIS-0001",
        dn_line_id=DN_LINE_1_ID,
        qty=40.0,
    )
    with _patch_item_ext_multi():
        await update_ar_invoice(db, ari.doc_entry, update_payload, ORG_ID, USER_ID)

    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    assert dn_doc["lines"][0]["invoicedQty"] == pytest.approx(40.0)
    assert dn_doc["status"] == DocumentStatus.OPEN.value


@pytest.mark.asyncio
async def test_update_removes_line_releases_dn_counter() -> None:
    """
    T-201.6 test 3: DRAFT covers 2 DN lines; edit drops one line;
    the dropped DN line counter goes back to its pre-invoice state.

    DN: line1=100, line2=50. Invoice covers both.
    Edit: remove line2 from the invoice → DN line2 invoicedQty drops back to 0.
    """
    db = _FakeDB()
    dn_entry = str(uuid.uuid4())
    dn = _make_delivery(
        doc_entry=dn_entry,
        line1_qty=100.0,
        include_line2=True,
        line2_qty=50.0,
    )
    db["deliveries_v2"]._add(dn)

    # Invoice both lines.
    payload = _make_from_delivery_payload(qty1=60.0, include_line2=True, qty2=30.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        ari = await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=dn_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # Verify both lines were incremented.
    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    assert dn_doc["lines"][0]["invoicedQty"] == pytest.approx(60.0)
    assert dn_doc["lines"][1]["invoicedQty"] == pytest.approx(30.0)

    # Edit: keep only line 1 (drop line 2 from the invoice).
    update_payload = _make_update_payload_with_lines(
        dn_doc_entry=dn_entry,
        dn_doc_number="DN-2026-VIS-0001",
        dn_line_id=DN_LINE_1_ID,
        qty=60.0,
    )
    with _patch_item_ext_multi():
        await update_ar_invoice(db, ari.doc_entry, update_payload, ORG_ID, USER_ID)

    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    # Line 1 unchanged (still 60).
    assert dn_doc["lines"][0]["invoicedQty"] == pytest.approx(60.0)
    # Line 2 fully released back to 0.
    assert dn_doc["lines"][1]["invoicedQty"] == pytest.approx(0.0)


@pytest.mark.asyncio
async def test_update_exceeds_open_qty_raises_value_error() -> None:
    """
    T-201.6 test 4: create DRAFT for 60; with 40 still open (orderedQty=100),
    try to edit up to 110 — must raise ValueError (exceeds open_invoice_qty).

    After creating for 60, the DN line has:
      invoicedQty=60, orderedQty=100 → open=40
    Editing to 110 means delta=+50 which exceeds open=40 → ValueError.
    """
    db = _FakeDB()
    dn_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=dn_entry, line1_qty=100.0)
    db["deliveries_v2"]._add(dn)

    payload = _make_from_delivery_payload(qty1=60.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        ari = await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=dn_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # Attempt edit to 110 (exceeds capacity).
    update_payload = _make_update_payload_with_lines(
        dn_doc_entry=dn_entry,
        dn_doc_number="DN-2026-VIS-0001",
        dn_line_id=DN_LINE_1_ID,
        qty=110.0,
    )
    with _patch_item_ext_multi(), pytest.raises(ValueError, match="open_invoice_qty"):
        await update_ar_invoice(db, ari.doc_entry, update_payload, ORG_ID, USER_ID)


@pytest.mark.asyncio
async def test_update_full_to_partial_reopens_dn() -> None:
    """
    T-201.6 test 5: invoice the full 100, DN auto-closes; edit DRAFT down to 70;
    DN must auto-RE-OPEN with audit action 'auto_reopen_on_invoice_release'.
    """
    db = _FakeDB()
    dn_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=dn_entry, line1_qty=100.0)
    db["deliveries_v2"]._add(dn)

    # Full invoice — triggers auto-close.
    payload = _make_from_delivery_payload(qty1=100.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        ari = await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=dn_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # Confirm DN is CLOSED.
    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    assert dn_doc["status"] == DocumentStatus.CLOSED.value

    # Edit DRAFT down to 70 — DN should reopen.
    update_payload = _make_update_payload_with_lines(
        dn_doc_entry=dn_entry,
        dn_doc_number="DN-2026-VIS-0001",
        dn_line_id=DN_LINE_1_ID,
        qty=70.0,
    )
    with _patch_item_ext_multi():
        await update_ar_invoice(db, ari.doc_entry, update_payload, ORG_ID, USER_ID)

    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    assert dn_doc["status"] == DocumentStatus.OPEN.value
    assert dn_doc["lines"][0]["invoicedQty"] == pytest.approx(70.0)

    # Audit entry with auto_reopen_on_invoice_release must exist.
    reopen_entries = [
        e
        for e in db["deliveries_v2_audit"]._docs
        if e.get("action") == "auto_reopen_on_invoice_release"
        and e.get("docEntry") == dn_entry
    ]
    assert len(reopen_entries) == 1
    assert reopen_entries[0]["detail"]["triggeredByAriDocEntry"] == ari.doc_entry


@pytest.mark.asyncio
async def test_update_partial_to_full_closes_dn() -> None:
    """
    T-201.6 test 6: invoice 60 of 100 (DN stays OPEN); edit DRAFT up to 100;
    DN must auto-CLOSE.
    """
    db = _FakeDB()
    dn_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=dn_entry, line1_qty=100.0)
    db["deliveries_v2"]._add(dn)

    # Partial invoice: 60.
    payload = _make_from_delivery_payload(qty1=60.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        ari = await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=dn_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # DN should still be OPEN.
    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    assert dn_doc["status"] == DocumentStatus.OPEN.value

    # Edit DRAFT up to 100 (full coverage) — DN should auto-close.
    update_payload = _make_update_payload_with_lines(
        dn_doc_entry=dn_entry,
        dn_doc_number="DN-2026-VIS-0001",
        dn_line_id=DN_LINE_1_ID,
        qty=100.0,
    )
    with _patch_item_ext_multi():
        await update_ar_invoice(db, ari.doc_entry, update_payload, ORG_ID, USER_ID)

    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    assert dn_doc["status"] == DocumentStatus.CLOSED.value
    assert dn_doc["lines"][0]["invoicedQty"] == pytest.approx(100.0)


@pytest.mark.asyncio
async def test_delete_after_auto_close_reopens_dn() -> None:
    """
    T-201.6 test 7: invoice the full 100, DN auto-closes; delete the DRAFT;
    DN must auto-RE-OPEN with audit action 'auto_reopen_on_invoice_release'
    referencing the deleted ARI docEntry.
    """
    db = _FakeDB()
    dn_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=dn_entry, line1_qty=100.0)
    db["deliveries_v2"]._add(dn)

    payload = _make_from_delivery_payload(qty1=100.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        ari = await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=dn_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # Confirm DN is CLOSED.
    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    assert dn_doc["status"] == DocumentStatus.CLOSED.value

    # Delete the DRAFT invoice.
    deleted = await delete_ar_invoice(db, ari.doc_entry, ORG_ID, USER_ID)
    assert deleted is True

    # DN must now be OPEN.
    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    assert dn_doc["status"] == DocumentStatus.OPEN.value

    # Reopen audit entry must reference the deleted ARI.
    reopen_entries = [
        e
        for e in db["deliveries_v2_audit"]._docs
        if e.get("action") == "auto_reopen_on_invoice_release"
        and e.get("docEntry") == dn_entry
    ]
    assert len(reopen_entries) == 1
    assert reopen_entries[0]["detail"]["triggeredByAriDocEntry"] == ari.doc_entry


@pytest.mark.asyncio
async def test_cancel_after_auto_close_reopens_dn() -> None:
    """
    T-201.6 test 8: invoice 100 → DN auto-closes; post DRAFT → OPEN; then
    OPEN → CANCELLED (super_admin path); DN must auto-RE-OPEN.
    """
    db = _FakeDB()
    dn_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=dn_entry, line1_qty=100.0)
    db["deliveries_v2"]._add(dn)

    # Create DRAFT invoice for 100 (DN auto-closes).
    payload = _make_from_delivery_payload(qty1=100.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        ari = await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=dn_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    assert dn_doc["status"] == DocumentStatus.CLOSED.value

    # Transition DRAFT → OPEN (posting step).
    with _patch_item_ext_multi(), _patch_customer_ext():
        with patch(
            "src.modules.sales.services.ar_invoice_service.OutboxWriter",
            create=True,
        ) as mock_ob:
            mock_ob.publish = AsyncMock(return_value=str(uuid.uuid4()))
            await transition_status(
                db,
                ari.doc_entry,
                ARInvoiceStatusTransitionRequest(new_status=DocumentStatus.OPEN),
                ORG_ID,
                USER_ID,
            )

    # Transition OPEN → CANCELLED.
    with patch(
        "src.modules.sales.services.ar_invoice_service.OutboxWriter",
        create=True,
    ) as mock_ob:
        mock_ob.publish = AsyncMock(return_value=str(uuid.uuid4()))
        await transition_status(
            db,
            ari.doc_entry,
            ARInvoiceStatusTransitionRequest(
                new_status=DocumentStatus.CANCELLED,
                reason="test cancel",
            ),
            ORG_ID,
            USER_ID,
        )

    # DN must now be OPEN.
    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    assert dn_doc["status"] == DocumentStatus.OPEN.value

    # Reopen audit entry must exist.
    reopen_entries = [
        e
        for e in db["deliveries_v2_audit"]._docs
        if e.get("action") == "auto_reopen_on_invoice_release"
        and e.get("docEntry") == dn_entry
    ]
    assert len(reopen_entries) == 1
    assert reopen_entries[0]["detail"]["triggeredByAriDocEntry"] == ari.doc_entry


@pytest.mark.asyncio
async def test_update_multiline_reduce_one_line_reopens_dn() -> None:
    """
    T-201.6 test 9: 2 DN lines × 100 each; invoice covers both fully (DN auto-closed);
    edit reduces only line 1 from 100 → 70; DN must re-OPEN.
    """
    db = _FakeDB()
    dn_entry = str(uuid.uuid4())
    dn = _make_delivery(
        doc_entry=dn_entry,
        line1_qty=100.0,
        include_line2=True,
        line2_qty=100.0,
    )
    db["deliveries_v2"]._add(dn)

    # Invoice both lines fully (200 total).
    payload = _make_from_delivery_payload(qty1=100.0, include_line2=True, qty2=100.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        ari = await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=dn_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # Confirm DN is CLOSED.
    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    assert dn_doc["status"] == DocumentStatus.CLOSED.value

    # Edit: keep line 1 at 70 + line 2 still at 100.
    # Only line 1 changes; we replace both lines in the update payload.
    update_payload = ARInvoiceUpdate(
        lines=[
            ARInvoiceLineCreate(
                item_id=ITEM_1_ID,
                item_code="ITEM-VIS-001",
                item_name="Visibility Test Item 1",
                quantity=Decimal("70"),
                uom="pcs",
                unit_price=Decimal("100"),
                base_doc_ref=DocumentLinkRef(
                    doc_type="DELIVERY",
                    doc_id=dn_entry,
                    doc_number="DN-2026-VIS-0001",
                    line_id=DN_LINE_1_ID,
                ),
            ),
            ARInvoiceLineCreate(
                item_id=ITEM_2_ID,
                item_code="ITEM-VIS-002",
                item_name="Visibility Test Item 2",
                quantity=Decimal("100"),
                uom="kg",
                unit_price=Decimal("80"),
                base_doc_ref=DocumentLinkRef(
                    doc_type="DELIVERY",
                    doc_id=dn_entry,
                    doc_number="DN-2026-VIS-0001",
                    line_id=DN_LINE_2_ID,
                ),
            ),
        ]
    )
    with _patch_item_ext_multi():
        await update_ar_invoice(db, ari.doc_entry, update_payload, ORG_ID, USER_ID)

    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    # DN must now be OPEN (line 1 is no longer fully invoiced).
    assert dn_doc["status"] == DocumentStatus.OPEN.value
    assert dn_doc["lines"][0]["invoicedQty"] == pytest.approx(70.0)
    assert dn_doc["lines"][1]["invoicedQty"] == pytest.approx(100.0)

    # Reopen audit entry must exist.
    reopen_entries = [
        e
        for e in db["deliveries_v2_audit"]._docs
        if e.get("action") == "auto_reopen_on_invoice_release"
        and e.get("docEntry") == dn_entry
    ]
    assert len(reopen_entries) == 1


@pytest.mark.asyncio
async def test_update_noop_header_only_leaves_dn_targetdocrefs_unchanged() -> None:
    """
    T-201.7 sanity: a header-only edit (no lines payload) must NOT touch the
    Delivery targetDocRefs at all.  Existing refs stay intact.
    """
    db = _FakeDB()
    dn_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=dn_entry, line1_qty=100.0)
    db["deliveries_v2"]._add(dn)

    payload = _make_from_delivery_payload(qty1=60.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        ari = await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=dn_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # Header-only edit — no lines payload.
    header_only = ARInvoiceUpdate(notes="T-201.7 sanity note")
    await update_ar_invoice(db, ari.doc_entry, header_only, ORG_ID, USER_ID)

    # Delivery header targetDocRefs must still contain the ARI ref.
    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    header_refs = dn_doc.get("targetDocRefs", [])
    assert any(
        r.get("docId") == ari.doc_entry for r in header_refs
    ), "Header targetDocRefs must not be cleared by a header-only edit"


@pytest.mark.asyncio
async def test_update_noop_header_only_leaves_dn_unchanged() -> None:
    """
    T-201.6 test 10: edit only header fields (notes); DN counters and status
    unchanged; no spurious DN audit entries.
    """
    db = _FakeDB()
    dn_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=dn_entry, line1_qty=100.0)
    db["deliveries_v2"]._add(dn)

    # Create DRAFT invoice for 60.
    payload = _make_from_delivery_payload(qty1=60.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        ari = await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=dn_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # Verify pre-edit state.
    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    pre_invoiced_qty = dn_doc["lines"][0]["invoicedQty"]
    pre_status = dn_doc["status"]
    assert pre_invoiced_qty == pytest.approx(60.0)
    assert pre_status == DocumentStatus.OPEN.value

    # Header-only edit (notes only, no lines payload).
    header_only_update = ARInvoiceUpdate(notes="Updated note — no lines change")
    await update_ar_invoice(db, ari.doc_entry, header_only_update, ORG_ID, USER_ID)

    # DN counters must be unchanged.
    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    assert dn_doc["lines"][0]["invoicedQty"] == pytest.approx(pre_invoiced_qty)
    assert dn_doc["status"] == pre_status

    # No DN audit entries of any kind (from this edit).
    # The only audit entries that exist should be those from the initial create
    # (which writes no DN audit because it was partial).
    reopen_entries = [
        e
        for e in db["deliveries_v2_audit"]._docs
        if e.get("action")
        in ("auto_reopen_on_invoice_release", "auto_close_on_full_invoice")
    ]
    assert len(reopen_entries) == 0


# ---------------------------------------------------------------------------
# T-201.7 tests: dangling targetDocRefs cleanup on AR Invoice delete / update
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_cleans_header_target_doc_ref() -> None:
    """
    T-201.7 test 1: create AR Invoice from DN; assert Delivery.targetDocRefs
    length == 1 with the ARI docEntry. Delete the DRAFT. Assert length == 0.
    """
    db = _FakeDB()
    dn_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=dn_entry, line1_qty=10.0)
    db["deliveries_v2"]._add(dn)

    payload = _make_from_delivery_payload(qty1=6.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        ari = await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=dn_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # Assert pre-delete state.
    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    header_refs = dn_doc.get("targetDocRefs", [])
    assert len(header_refs) == 1
    assert header_refs[0]["docId"] == ari.doc_entry

    # Delete the DRAFT.
    deleted = await delete_ar_invoice(db, ari.doc_entry, ORG_ID, USER_ID)
    assert deleted is True

    # Delivery.targetDocRefs must now be empty.
    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    header_refs_after = dn_doc.get("targetDocRefs", [])
    assert (
        len(header_refs_after) == 0
    ), f"Expected 0 header targetDocRefs after delete, got {header_refs_after}"


@pytest.mark.asyncio
async def test_delete_cleans_per_line_target_doc_refs() -> None:
    """
    T-201.7 test 2: 2-line invoice from a 2-line DN. Assert each DN line has
    1 targetDocRef entry. Delete DRAFT. Assert each DN line has 0 entries.
    """
    db = _FakeDB()
    dn_entry = str(uuid.uuid4())
    dn = _make_delivery(
        doc_entry=dn_entry,
        line1_qty=10.0,
        include_line2=True,
        line2_qty=5.0,
    )
    db["deliveries_v2"]._add(dn)

    # Invoice both lines.
    payload = _make_from_delivery_payload(qty1=6.0, include_line2=True, qty2=3.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        ari = await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=dn_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # Assert pre-delete state: each DN line has 1 targetDocRef.
    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    assert len(dn_doc["lines"][0].get("targetDocRefs", [])) == 1
    assert len(dn_doc["lines"][1].get("targetDocRefs", [])) == 1

    # Delete.
    await delete_ar_invoice(db, ari.doc_entry, ORG_ID, USER_ID)

    # Assert both DN lines have 0 targetDocRefs.
    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    assert (
        len(dn_doc["lines"][0].get("targetDocRefs", [])) == 0
    ), "DN line 1 still has stale targetDocRefs after ARI delete"
    assert (
        len(dn_doc["lines"][1].get("targetDocRefs", [])) == 0
    ), "DN line 2 still has stale targetDocRefs after ARI delete"


@pytest.mark.asyncio
async def test_delete_partial_leaves_sibling_ari_ref_intact() -> None:
    """
    T-201.7 test 3: create AR Invoice A (partial), AR Invoice B (partial) from
    the same DN. Assert Delivery.targetDocRefs length == 2. Delete only A.
    Assert length == 1 and the remaining entry is B's docEntry (not A's).
    """
    db = _FakeDB()
    dn_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=dn_entry, line1_qty=10.0)
    db["deliveries_v2"]._add(dn)

    # AR Invoice A: 4 units.
    payload_a = _make_from_delivery_payload(qty1=4.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        ari_a = await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=dn_entry,
            payload=payload_a,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # AR Invoice B: 3 units.
    payload_b = _make_from_delivery_payload(qty1=3.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        ari_b = await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=dn_entry,
            payload=payload_b,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # Assert 2 header refs.
    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    assert len(dn_doc.get("targetDocRefs", [])) == 2

    # Delete only A.
    await delete_ar_invoice(db, ari_a.doc_entry, ORG_ID, USER_ID)

    # Assert 1 header ref and it is B's docEntry.
    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    header_refs = dn_doc.get("targetDocRefs", [])
    assert (
        len(header_refs) == 1
    ), f"Expected 1 header targetDocRef after deleting ARI A, got {len(header_refs)}"
    assert header_refs[0]["docId"] == ari_b.doc_entry, (
        f"Remaining ref should be B ({ari_b.doc_entry}), "
        f"got {header_refs[0]['docId']}"
    )


@pytest.mark.asyncio
async def test_update_reconciles_per_line_target_doc_refs() -> None:
    """
    T-201.7 test 4: create AR Invoice from DN; capture old line UUIDs from
    Delivery.lines[].targetDocRefs. Update the invoice with a new line set.
    Assert old line UUIDs are gone from DN line refs and new UUIDs are present.
    """
    db = _FakeDB()
    dn_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=dn_entry, line1_qty=100.0)
    db["deliveries_v2"]._add(dn)

    # Create DRAFT invoice.
    payload = _make_from_delivery_payload(qty1=60.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        ari = await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=dn_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # Capture old ARI line UUID from the DN line's targetDocRefs.
    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    old_line_refs = dn_doc["lines"][0].get("targetDocRefs", [])
    assert len(old_line_refs) == 1
    old_ari_line_id = old_line_refs[0]["lineId"]

    # Update the invoice with a new line set (qty changes; new lineId generated).
    update_payload = _make_update_payload_with_lines(
        dn_doc_entry=dn_entry,
        dn_doc_number="DN-2026-VIS-0001",
        dn_line_id=DN_LINE_1_ID,
        qty=70.0,
    )
    with _patch_item_ext_multi():
        await update_ar_invoice(db, ari.doc_entry, update_payload, ORG_ID, USER_ID)

    # Reload DN line targetDocRefs.
    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    new_line_refs = dn_doc["lines"][0].get("targetDocRefs", [])

    # Must have exactly 1 ref (replaced, not duplicated).
    assert len(new_line_refs) == 1, (
        f"Expected 1 per-line targetDocRef after update, got {len(new_line_refs)}: "
        f"{new_line_refs}"
    )

    # The old UUID must be gone.
    new_ari_line_id = new_line_refs[0]["lineId"]
    assert (
        new_ari_line_id != old_ari_line_id
    ), "Expected a fresh lineId UUID after the line set was replaced wholesale"

    # The docId must still point to the same AR Invoice (docEntry is stable).
    assert new_line_refs[0]["docId"] == ari.doc_entry


@pytest.mark.asyncio
async def test_update_then_delete_leaves_zero_refs() -> None:
    """
    T-201.7 test 5: create → update → delete. Final state: zero refs on DN.
    Combination test confirming the two fixes compose correctly.
    """
    db = _FakeDB()
    dn_entry = str(uuid.uuid4())
    dn = _make_delivery(doc_entry=dn_entry, line1_qty=100.0)
    db["deliveries_v2"]._add(dn)

    # Create DRAFT invoice.
    payload = _make_from_delivery_payload(qty1=60.0)
    with _patch_item_ext_multi(), _patch_customer_ext():
        ari = await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=dn_entry,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # Update the invoice (replaces line set, reconciles DN per-line refs).
    update_payload = _make_update_payload_with_lines(
        dn_doc_entry=dn_entry,
        dn_doc_number="DN-2026-VIS-0001",
        dn_line_id=DN_LINE_1_ID,
        qty=70.0,
    )
    with _patch_item_ext_multi():
        await update_ar_invoice(db, ari.doc_entry, update_payload, ORG_ID, USER_ID)

    # After update: 1 header ref, 1 per-line ref (new UUID).
    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    assert len(dn_doc.get("targetDocRefs", [])) == 1
    assert len(dn_doc["lines"][0].get("targetDocRefs", [])) == 1

    # Delete the DRAFT.
    deleted = await delete_ar_invoice(db, ari.doc_entry, ORG_ID, USER_ID)
    assert deleted is True

    # Final state: zero refs everywhere.
    dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
    assert (
        len(dn_doc.get("targetDocRefs", [])) == 0
    ), "Header targetDocRefs must be empty after update + delete"
    assert (
        len(dn_doc["lines"][0].get("targetDocRefs", [])) == 0
    ), "Per-line targetDocRefs must be empty after update + delete"
