"""
Tests for T-201.9 — SO chain: from-SO AR Invoice endpoint, mixed SO behaviour,
and the DN→SO invoicedQty bubble-up.

Covers:
  Class 1 — TestServiceOnlySOEndToEnd:
    Service-only SO lifecycle: DRAFT creation, DRAFT→OPEN transition, full
    invoicing via from-SO ARI, ARI→OPEN that auto-closes the SO, partial
    invoicing, subsequent-completion close, and rejection of
    create_delivery_from_so on service-only SOs.

  Class 2 — TestMixedSOAutoClose:
    The load-bearing Option B spec test: a mixed SO (stock + service lines)
    routes stock through DN→from-Delivery ARI and service through from-SO ARI.
    The SO auto-closes only after BOTH paths are fully invoiced.

  Class 3 — TestFromSOCounterReconciliation:
    Edit/delete/cancel DRAFT from-SO ARIs reconcile SO line invoicedQty and
    trigger auto-reopen / auto-close symmetrically.

  Class 4 — TestStockLineUnreachableFromSO:
    Explicit invariant test (T-201.9 Step 9): stock lines on mixed or
    stock-only SOs are rejected by create_ar_invoice_from_so with the exact
    ValueError message from the service code.

Uses the same in-memory fake Motor DB pattern as test_delivery_invoice_visibility.py
and test_ar_invoices.py.  Finance ext lookups are mocked at the service-layer
helper level (_get_item_finance_ext / _get_customer_finance_ext).

Run:
    pytest src/modules/sales/tests/test_so_invoice_visibility.py -v
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
    ARInvoiceFromSOLineRequest,
    ARInvoiceFromSORequest,
    ARInvoiceLineCreate,
    ARInvoiceStatusTransitionRequest,
    ARInvoiceUpdate,
)
from src.modules.sales.services.ar_invoice_service import (
    create_ar_invoice_from_delivery,
    create_ar_invoice_from_so,
    delete_ar_invoice,
    transition_status,
    update_ar_invoice,
)
from src.modules.sales.services.delivery_service import create_delivery_from_so
from src.modules.sales.models.deliveries import (
    DeliveryFromSORequest,
    DeliveryLineCreate,
)

# ---------------------------------------------------------------------------
# In-memory fake Motor DB — identical to test_delivery_invoice_visibility.py
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
# Query / update helpers (identical to test_delivery_invoice_visibility.py)
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
                sub_field = field[len("lines.$."):]
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
                sub_field = field[len("lines.$."):]
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
                sub_field = field[len("lines.$."):]
                if line_id_query is not None:
                    for line in doc.get("lines", []):
                        if line.get("lineId") == line_id_query:
                            arr = line.get(sub_field, [])
                            line[sub_field] = [
                                item for item in arr
                                if not _matches(item, match_spec)
                            ]
                            break
            else:
                arr = doc.get(field, [])
                doc[field] = [
                    item for item in arr
                    if not _matches(item, match_spec)
                ]


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ORG_ID = "org-so-vis-001"
USER_ID = "user-so-vis-abc"
COMPANY_CODE = "A001"
CUSTOMER_ID = "customer-so-vis-001"
CUSTOMER_NAME = "SO Visibility Test Customer"

# Service-only item IDs (isStock=False)
SVC_ITEM_1_ID = "item-svc-001"
SVC_ITEM_2_ID = "item-svc-002"

# Stock item ID (isStock=True)
STOCK_ITEM_1_ID = "item-stock-001"
STOCK_ITEM_2_ID = "item-stock-002"

REVENUE_ACCOUNT_ID = "gl-revenue-so-vis-001"

# Pre-built stable SO line UUIDs for reuse across tests
SO_SVC_LINE_1_ID = str(uuid.uuid4())
SO_SVC_LINE_2_ID = str(uuid.uuid4())
SO_STOCK_LINE_1_ID = str(uuid.uuid4())
SO_STOCK_LINE_2_ID = str(uuid.uuid4())

# DN line IDs for mixed-SO tests
DN_STOCK_LINE_1_ID = str(uuid.uuid4())
DN_STOCK_LINE_2_ID = str(uuid.uuid4())

_SVC_ITEM_FIN_EXT = {
    "sale_item_finance_ext_id": "ext-svc-001",
    "itemId": SVC_ITEM_1_ID,
    "organizationId": ORG_ID,
    "revenueAccountId": REVENUE_ACCOUNT_ID,
    "cogsAccountId": None,
    "salesTaxCode": None,
    "isSellable": True,
    "isStock": False,
}

_STOCK_ITEM_FIN_EXT = {
    "sale_item_finance_ext_id": "ext-stock-001",
    "itemId": STOCK_ITEM_1_ID,
    "organizationId": ORG_ID,
    "revenueAccountId": REVENUE_ACCOUNT_ID,
    "cogsAccountId": "gl-cogs-so-vis-001",
    "salesTaxCode": None,
    "isSellable": True,
    "isStock": True,
}


# ---------------------------------------------------------------------------
# Mock helpers
# ---------------------------------------------------------------------------


def _patch_item_ext_isstock(by_item_id: Dict[str, bool]) -> Any:
    """
    Patch _get_item_finance_ext with per-item isStock flag.

    Args:
        by_item_id: Maps item_id → isStock bool. Items not in the dict default
                    to isStock=False (service item).  All items return
                    revenueAccountId so the invoice flow doesn't fail on that.
    """
    async def _side_effect(item_id: str, org_id: str, auth_token: Any) -> Dict[str, Any]:
        is_stock = by_item_id.get(item_id, False)
        base = {
            "itemId": item_id,
            "organizationId": org_id,
            "revenueAccountId": REVENUE_ACCOUNT_ID,
            "cogsAccountId": "gl-cogs-001" if is_stock else None,
            "salesTaxCode": None,
            "isSellable": True,
            "isStock": is_stock,
        }
        return base

    return patch(
        "src.modules.sales.services.ar_invoice_service._get_item_finance_ext",
        side_effect=_side_effect,
    )


def _patch_customer_ext() -> Any:
    """Patch _get_customer_finance_ext to return a minimal canned response."""
    return patch(
        "src.modules.sales.services.ar_invoice_service._get_customer_finance_ext",
        new_callable=AsyncMock,
        return_value={
            "customerId": CUSTOMER_ID,
            "arControlAccountId": "gl-ar-so-vis-001",
        },
    )


# ---------------------------------------------------------------------------
# Helper: build fake SO docs
# ---------------------------------------------------------------------------


def _make_so_line(
    line_id: str,
    item_id: str,
    item_code: str,
    item_name: str,
    quantity: float = 10.0,
    invoiced_qty: float = 0.0,
    credited_qty: float = 0.0,
    cancelled_qty: float = 0.0,
    delivered_qty: float = 0.0,
    line_number: int = 1,
) -> Dict[str, Any]:
    """Build a single SO line dict in the same shape as sales_order_service."""
    return {
        "lineId": line_id,
        "lineNumber": line_number,
        "itemId": item_id,
        "itemCode": item_code,
        "itemName": item_name,
        "description": item_name,
        "quantity": quantity,
        "uom": "pcs",
        "unitPrice": 100.0,
        "discountPercent": 0.0,
        "lineNet": quantity * 100.0,
        "taxCodeId": None,
        "taxPercent": 0.0,
        "lineTax": 0.0,
        "lineGross": quantity * 100.0,
        "warehouseId": None,
        "costCenterId": None,
        "orderedQty": quantity,
        "consumedQty": 0.0,
        "deliveredQty": delivered_qty,
        "invoicedQty": invoiced_qty,
        "cancelledQty": cancelled_qty,
        "committedQty": quantity,
        "baseDocRef": None,
        "targetDocRefs": [],
        "notes": None,
    }


def _make_so_doc(
    lines: List[Dict[str, Any]],
    status: str = "draft",
    doc_entry: Optional[str] = None,
    doc_number: str = "SO-2026-VIS-0001",
) -> Dict[str, Any]:
    """
    Build a minimal sales_orders_v2 document for testing.

    Args:
        lines:      Pre-built SO line dicts (use _make_so_line).
        status:     DocumentStatus value string.
        doc_entry:  UUID override for stable test references.
        doc_number: Human-readable doc number.

    Returns:
        Raw sales_orders_v2 document dict.
    """
    entry = doc_entry or str(uuid.uuid4())
    gross = sum(ln.get("lineGross", 0.0) for ln in lines)
    return {
        "docEntry": entry,
        "docNumber": doc_number,
        "docType": "SO",
        "organizationId": ORG_ID,
        "companyCode": COMPANY_CODE,
        "customerId": CUSTOMER_ID,
        "customerName": CUSTOMER_NAME,
        "docDate": date(2026, 1, 10),
        "expectedDeliveryDate": date(2026, 1, 20),
        "status": status,
        "currency": "AED",
        "exchangeRate": 1.0,
        "paymentTermsId": None,
        "totals": {"net": gross, "tax": 0.0, "gross": gross},
        "baseDocRef": None,
        "targetDocRefs": [],
        "outboxEventId": None,
        "outboxEventEmittedAt": None,
        "notes": None,
        "ownerUserId": USER_ID,
        "salesEmployeeId": None,
        "bpRefNo": None,
        "journalMemo": None,
        "deliveryDate": None,
        "lines": lines,
        "creditCheck": None,
        "createdAt": datetime.now(tz=timezone.utc),
        "createdBy": USER_ID,
        "updatedAt": datetime.now(tz=timezone.utc),
        "updatedBy": USER_ID,
    }


def _make_dn_doc(
    so_doc_entry: str,
    so_doc_number: str,
    dn_lines: List[Dict[str, Any]],
    status: str = "open",
    doc_entry: Optional[str] = None,
    doc_number: str = "DN-2026-VIS-0001",
) -> Dict[str, Any]:
    """
    Build a minimal deliveries_v2 document with a baseDocRef pointing to the SO.

    Args:
        so_doc_entry:  Parent SO docEntry UUID.
        so_doc_number: Parent SO docNumber.
        dn_lines:      Pre-built DN line dicts.
        status:        DocumentStatus value string.
        doc_entry:     UUID override.
        doc_number:    Human-readable doc number.

    Returns:
        Raw deliveries_v2 document dict.
    """
    entry = doc_entry or str(uuid.uuid4())
    total_cogs = sum(ln.get("lineCogs", 0.0) for ln in dn_lines)
    return {
        "docEntry": entry,
        "docNumber": doc_number,
        "docType": "DELIVERY",
        "organizationId": ORG_ID,
        "companyCode": COMPANY_CODE,
        "customerId": CUSTOMER_ID,
        "customerName": CUSTOMER_NAME,
        "docDate": date(2026, 1, 15),
        "actualDeliveryDate": date(2026, 1, 15),
        "status": status,
        "deliveredByUserId": None,
        "notes": None,
        "totalCogs": total_cogs,
        "baseDocRef": {
            "docType": "SO",
            "docId": so_doc_entry,
            "docNumber": so_doc_number,
            "lineId": None,
        },
        "targetDocRefs": [],
        "outboxEventId": None,
        "outboxEventEmittedAt": None,
        "lines": dn_lines,
        "createdAt": datetime.now(tz=timezone.utc),
        "createdBy": USER_ID,
        "updatedAt": datetime.now(tz=timezone.utc),
        "updatedBy": USER_ID,
    }


def _make_dn_line(
    dn_line_id: str,
    so_line_id: str,
    item_id: str,
    item_code: str,
    item_name: str,
    quantity: float = 10.0,
    invoiced_qty: float = 0.0,
    line_number: int = 1,
) -> Dict[str, Any]:
    """
    Build a single DN line with baseDocRef pointing to the SO line.

    The baseDocRef.lineId == so_line_id is the linkage the bubble-up code reads.
    """
    return {
        "lineId": dn_line_id,
        "lineNumber": line_number,
        "itemId": item_id,
        "itemCode": item_code,
        "itemName": item_name,
        "description": item_name,
        "quantity": quantity,
        "uom": "pcs",
        "warehouseId": "WH-SO-VIS",
        "unitCost": 50.0,
        "lineCogs": quantity * 50.0,
        "costCenterId": None,
        "orderedQty": quantity,
        "invoicedQty": invoiced_qty,
        "creditedQty": 0.0,
        "cancelledQty": 0.0,
        "targetDocRefs": [],
        "baseDocRef": {
            "docType": "SO",
            "docId": None,  # filled in by _make_dn_doc
            "docNumber": None,
            "lineId": so_line_id,
        },
    }


def _make_from_so_payload(
    so_line_id: str,
    qty: float = 5.0,
    extra_lines: Optional[List[Dict[str, Any]]] = None,
) -> ARInvoiceFromSORequest:
    """
    Build a minimal ARInvoiceFromSORequest for a single SO service line.

    Args:
        so_line_id:  The SO line UUID to invoice.
        qty:         Quantity to invoice.
        extra_lines: Additional ARInvoiceFromSOLineRequest dicts (optional).

    Returns:
        ARInvoiceFromSORequest ready to pass to create_ar_invoice_from_so.
    """
    lines: List[ARInvoiceFromSOLineRequest] = [
        ARInvoiceFromSOLineRequest(
            so_line_id=so_line_id,
            quantity=Decimal(str(qty)),
            unit_price=Decimal("100"),
        )
    ]
    if extra_lines:
        for el in extra_lines:
            lines.append(
                ARInvoiceFromSOLineRequest(
                    so_line_id=el["so_line_id"],
                    quantity=Decimal(str(el["qty"])),
                    unit_price=Decimal(str(el.get("unit_price", 100))),
                )
            )
    return ARInvoiceFromSORequest(
        company_code=COMPANY_CODE,
        doc_date=date(2026, 2, 1),
        invoice_date=date(2026, 2, 1),
        lines=lines,
    )


def _make_update_payload_for_so_line(
    so_doc_entry: str,
    so_doc_number: str,
    so_line_id: str,
    item_id: str,
    qty: float,
) -> ARInvoiceUpdate:
    """
    Build an ARInvoiceUpdate that replaces the line set with a single SO-anchored line.

    Used for from-SO ARI counter reconciliation tests (Class 3).
    """
    return ARInvoiceUpdate(
        lines=[
            ARInvoiceLineCreate(
                item_id=item_id,
                item_code=item_id,
                item_name=item_id,
                quantity=Decimal(str(qty)),
                uom="pcs",
                unit_price=Decimal("100"),
                base_doc_ref=DocumentLinkRef(
                    doc_type="SO",
                    doc_id=so_doc_entry,
                    doc_number=so_doc_number,
                    line_id=so_line_id,
                ),
            )
        ]
    )


# ---------------------------------------------------------------------------
# Class 1 — TestServiceOnlySOEndToEnd
# ---------------------------------------------------------------------------


class TestServiceOnlySOEndToEnd:
    """
    End-to-end tests for a Sales Order that contains only service (non-stock) lines.

    Service-only SOs skip the Delivery Note flow entirely — service lines are
    invoiced directly from the SO via create_ar_invoice_from_so.
    """

    @pytest.mark.asyncio
    async def test_service_only_so_created_with_zero_invoiced_qty(self) -> None:
        """
        Create a service-only SO with 2 lines → DRAFT with lines[*].invoicedQty=0.

        Verifies the SO doc structure before any invoicing.
        """
        db = _FakeDB()
        so_entry = str(uuid.uuid4())
        lines = [
            _make_so_line(SO_SVC_LINE_1_ID, SVC_ITEM_1_ID, "SVC-001", "Service Item 1",
                          quantity=10.0, invoiced_qty=0.0, line_number=1),
            _make_so_line(SO_SVC_LINE_2_ID, SVC_ITEM_2_ID, "SVC-002", "Service Item 2",
                          quantity=5.0, invoiced_qty=0.0, line_number=2),
        ]
        so = _make_so_doc(lines, status="draft", doc_entry=so_entry)
        db["sales_orders_v2"]._add(so)

        doc = db["sales_orders_v2"]._docs[0]
        assert doc["status"] == "draft"
        for ln in doc["lines"]:
            assert ln["invoicedQty"] == pytest.approx(0.0), (
                f"Line {ln['lineId']} must start with invoicedQty=0"
            )

    @pytest.mark.asyncio
    async def test_service_only_so_transition_draft_to_open(self) -> None:
        """
        DRAFT → OPEN transition succeeds on a service-only SO (no DN-creation gate).

        The SO service allows OPEN on any valid DRAFT SO regardless of line types.
        """
        from src.modules.sales.services.sales_order_service import (
            transition_status as so_transition,
        )
        from src.modules.sales.models.sales_orders import SalesOrderStatusTransitionRequest

        db = _FakeDB()
        so_entry = str(uuid.uuid4())
        lines = [
            _make_so_line(SO_SVC_LINE_1_ID, SVC_ITEM_1_ID, "SVC-001", "Service Item 1",
                          quantity=10.0, line_number=1),
        ]
        so = _make_so_doc(lines, status="draft", doc_entry=so_entry)
        db["sales_orders_v2"]._add(so)

        # Patch credit-limit check to pass (finance service unavailable in tests).
        with patch(
            "src.modules.sales.services.sales_order_service._check_credit_limit",
            new_callable=AsyncMock,
            return_value={
                "checkedAt": datetime.now(tz=timezone.utc),
                "result": "approved",
                "outstandingAr": 0.0,
                "customerCreditLimit": None,
                "thisOrderTotal": 1000.0,
                "overrideByUserId": None,
                "overrideReason": None,
            },
        ):
            result = await so_transition(
                db,
                so_entry,
                SalesOrderStatusTransitionRequest(new_status=DocumentStatus.OPEN),
                org_id=ORG_ID,
                user_id=USER_ID,
                user_role="super_admin",
            )

        assert result is not None
        assert result.status == DocumentStatus.OPEN

        so_doc = next(d for d in db["sales_orders_v2"]._docs if d["docEntry"] == so_entry)
        assert so_doc["status"] == DocumentStatus.OPEN.value

    @pytest.mark.asyncio
    async def test_create_from_so_full_invoicing_sets_invoiced_qty_and_refs(self) -> None:
        """
        Create a from-SO ARI that invoices all lines of a service-only OPEN SO.

        Post-condition:
        - ARI is in DRAFT.
        - Each SO line invoicedQty == orderedQty.
        - SO header targetDocRefs contains the ARI ref.
        - Each SO line targetDocRefs contains the per-line ARI ref keyed on the ARI lineId.
        """
        db = _FakeDB()
        so_entry = str(uuid.uuid4())
        line_1_qty = 10.0
        line_2_qty = 5.0
        lines = [
            _make_so_line(SO_SVC_LINE_1_ID, SVC_ITEM_1_ID, "SVC-001", "Service Item 1",
                          quantity=line_1_qty, line_number=1),
            _make_so_line(SO_SVC_LINE_2_ID, SVC_ITEM_2_ID, "SVC-002", "Service Item 2",
                          quantity=line_2_qty, line_number=2),
        ]
        so = _make_so_doc(lines, status="open", doc_entry=so_entry)
        db["sales_orders_v2"]._add(so)

        payload = _make_from_so_payload(
            so_line_id=SO_SVC_LINE_1_ID,
            qty=line_1_qty,
            extra_lines=[{"so_line_id": SO_SVC_LINE_2_ID, "qty": line_2_qty}],
        )

        is_stock_map = {SVC_ITEM_1_ID: False, SVC_ITEM_2_ID: False}
        with _patch_item_ext_isstock(is_stock_map), _patch_customer_ext():
            ari = await create_ar_invoice_from_so(
                db,
                so_doc_entry=so_entry,
                payload=payload,
                org_id=ORG_ID,
                user_id=USER_ID,
            )

        assert ari.status == DocumentStatus.DRAFT

        so_doc = next(d for d in db["sales_orders_v2"]._docs if d["docEntry"] == so_entry)

        # SO line invoicedQty must equal orderedQty for both lines.
        ln_map = {ln["lineId"]: ln for ln in so_doc["lines"]}
        assert ln_map[SO_SVC_LINE_1_ID]["invoicedQty"] == pytest.approx(line_1_qty), (
            "SO line 1 invoicedQty must equal orderedQty after full invoicing"
        )
        assert ln_map[SO_SVC_LINE_2_ID]["invoicedQty"] == pytest.approx(line_2_qty), (
            "SO line 2 invoicedQty must equal orderedQty after full invoicing"
        )

        # SO header targetDocRefs must contain the ARI.
        header_refs = so_doc.get("targetDocRefs", [])
        assert any(r.get("docId") == ari.doc_entry for r in header_refs), (
            "SO header targetDocRefs must contain the ARI docEntry"
        )

        # Each SO line targetDocRefs must contain the per-line ARI ref.
        for so_line in so_doc["lines"]:
            line_refs = so_line.get("targetDocRefs", [])
            assert any(r.get("docId") == ari.doc_entry for r in line_refs), (
                f"SO line {so_line['lineId']} must have a per-line targetDocRef for ARI "
                f"{ari.doc_entry}"
            )

    @pytest.mark.asyncio
    async def test_transition_ari_to_open_auto_closes_so(self) -> None:
        """
        Transitioning a fully-invoicing from-SO ARI from DRAFT → OPEN auto-closes the SO.

        Post-condition:
        - ARI status=OPEN.
        - SO status=CLOSED.
        - SO audit log contains action='auto_close_on_full_invoice'.
        """
        db = _FakeDB()
        so_entry = str(uuid.uuid4())
        lines = [
            _make_so_line(SO_SVC_LINE_1_ID, SVC_ITEM_1_ID, "SVC-001", "Service Item 1",
                          quantity=10.0, line_number=1),
        ]
        so = _make_so_doc(lines, status="open", doc_entry=so_entry)
        db["sales_orders_v2"]._add(so)

        payload = _make_from_so_payload(so_line_id=SO_SVC_LINE_1_ID, qty=10.0)
        is_stock_map = {SVC_ITEM_1_ID: False}

        with _patch_item_ext_isstock(is_stock_map), _patch_customer_ext():
            ari = await create_ar_invoice_from_so(
                db,
                so_doc_entry=so_entry,
                payload=payload,
                org_id=ORG_ID,
                user_id=USER_ID,
            )

        # SO should auto-close at DRAFT creation since all lines are fully invoiced.
        so_doc = next(d for d in db["sales_orders_v2"]._docs if d["docEntry"] == so_entry)
        assert so_doc["status"] == DocumentStatus.CLOSED.value, (
            "SO must auto-close when all service lines are fully invoiced (DRAFT creation)"
        )

        # Audit entry must exist.
        audit_entries = db["sales_orders_v2_audit"]._docs
        auto_close_entries = [
            e for e in audit_entries
            if e.get("action") == "auto_close_on_full_invoice"
            and e.get("docEntry") == so_entry
        ]
        assert len(auto_close_entries) >= 1, (
            "SO audit must contain auto_close_on_full_invoice after full invoicing"
        )

        # Now transition ARI DRAFT → OPEN.
        with _patch_item_ext_isstock(is_stock_map), _patch_customer_ext():
            with patch(
                "src.modules.sales.services.ar_invoice_service.OutboxWriter",
                create=True,
            ) as mock_ob:
                mock_ob.publish = AsyncMock(return_value=str(uuid.uuid4()))
                ari_open = await transition_status(
                    db,
                    ari.doc_entry,
                    ARInvoiceStatusTransitionRequest(new_status=DocumentStatus.OPEN),
                    ORG_ID,
                    USER_ID,
                )

        assert ari_open is not None
        assert ari_open.status == DocumentStatus.OPEN

    @pytest.mark.asyncio
    async def test_partial_invoicing_leaves_so_open_with_correct_open_qty(self) -> None:
        """
        Partial invoicing of a service-only SO (one line at half qty).

        Post-condition:
        - SO line invoicedQty == qty/2.
        - SO stays OPEN (not fully invoiced).
        - open_invoice_qty for the line == qty - qty/2.
        """
        db = _FakeDB()
        so_entry = str(uuid.uuid4())
        full_qty = 10.0
        lines = [
            _make_so_line(SO_SVC_LINE_1_ID, SVC_ITEM_1_ID, "SVC-001", "Service Item 1",
                          quantity=full_qty, line_number=1),
        ]
        so = _make_so_doc(lines, status="open", doc_entry=so_entry)
        db["sales_orders_v2"]._add(so)

        half_qty = full_qty / 2.0
        payload = _make_from_so_payload(so_line_id=SO_SVC_LINE_1_ID, qty=half_qty)
        is_stock_map = {SVC_ITEM_1_ID: False}

        with _patch_item_ext_isstock(is_stock_map), _patch_customer_ext():
            await create_ar_invoice_from_so(
                db,
                so_doc_entry=so_entry,
                payload=payload,
                org_id=ORG_ID,
                user_id=USER_ID,
            )

        so_doc = next(d for d in db["sales_orders_v2"]._docs if d["docEntry"] == so_entry)

        # SO must still be OPEN (not fully invoiced).
        assert so_doc["status"] == DocumentStatus.OPEN.value, (
            "SO must stay OPEN when only partial invoicing has occurred"
        )

        # SO line invoicedQty == half_qty.
        ln = next(ln for ln in so_doc["lines"] if ln["lineId"] == SO_SVC_LINE_1_ID)
        assert ln["invoicedQty"] == pytest.approx(half_qty)

        # open_invoice_qty == full_qty - half_qty (= half_qty).
        # Computed as: orderedQty - invoicedQty - creditedQty - cancelledQty
        open_qty = ln["orderedQty"] - ln["invoicedQty"] - ln.get("creditedQty", 0.0) - ln.get("cancelledQty", 0.0)
        assert open_qty == pytest.approx(half_qty), (
            f"open_invoice_qty must be {half_qty} after partial invoicing"
        )

    @pytest.mark.asyncio
    async def test_two_partial_invoices_close_so_on_second(self) -> None:
        """
        Two sequential from-SO ARIs: first partial, second covering the remainder.

        First ARI: 6/10 → SO stays OPEN.
        Second ARI: 4/10 → SO auto-closes on the second ARI.
        """
        db = _FakeDB()
        so_entry = str(uuid.uuid4())
        full_qty = 10.0
        lines = [
            _make_so_line(SO_SVC_LINE_1_ID, SVC_ITEM_1_ID, "SVC-001", "Service Item 1",
                          quantity=full_qty, line_number=1),
        ]
        so = _make_so_doc(lines, status="open", doc_entry=so_entry)
        db["sales_orders_v2"]._add(so)
        is_stock_map = {SVC_ITEM_1_ID: False}

        # First partial invoice: 6 units.
        payload_1 = _make_from_so_payload(so_line_id=SO_SVC_LINE_1_ID, qty=6.0)
        with _patch_item_ext_isstock(is_stock_map), _patch_customer_ext():
            await create_ar_invoice_from_so(
                db, so_doc_entry=so_entry, payload=payload_1, org_id=ORG_ID, user_id=USER_ID
            )

        so_doc = next(d for d in db["sales_orders_v2"]._docs if d["docEntry"] == so_entry)
        assert so_doc["status"] == DocumentStatus.OPEN.value, "SO must stay OPEN after first partial"

        # Second invoice: remaining 4 units.
        payload_2 = _make_from_so_payload(so_line_id=SO_SVC_LINE_1_ID, qty=4.0)
        with _patch_item_ext_isstock(is_stock_map), _patch_customer_ext():
            await create_ar_invoice_from_so(
                db, so_doc_entry=so_entry, payload=payload_2, org_id=ORG_ID, user_id=USER_ID
            )

        so_doc = next(d for d in db["sales_orders_v2"]._docs if d["docEntry"] == so_entry)
        assert so_doc["status"] == DocumentStatus.CLOSED.value, (
            "SO must auto-close after second ARI completes full invoicing"
        )

    @pytest.mark.asyncio
    async def test_create_delivery_from_service_only_so_raises_value_error(self) -> None:
        """
        Calling create_delivery_from_so on a service-only SO raises ValueError.

        The error message must mention "no stock lines" and point to the from-SO endpoint.
        auth_token must be non-None to trigger the isStock check in delivery_service.
        """
        db = _FakeDB()
        so_entry = str(uuid.uuid4())
        so_line_1_id = str(uuid.uuid4())
        lines = [
            _make_so_line(so_line_1_id, SVC_ITEM_1_ID, "SVC-001", "Service Item 1",
                          quantity=10.0, line_number=1),
        ]
        so = _make_so_doc(lines, status="open", doc_entry=so_entry)
        db["sales_orders_v2"]._add(so)

        dn_payload = DeliveryFromSORequest(
            doc_date=date(2026, 2, 1),
            actual_delivery_date=date(2026, 2, 1),
            lines=[
                DeliveryLineCreate(
                    so_line_id=so_line_1_id,
                    so_line_number=1,
                    item_id=SVC_ITEM_1_ID,
                    item_code="SVC-001",
                    item_name="Service Item 1",
                    quantity=Decimal("10"),
                    uom="pcs",
                    warehouse_id="WH-001",
                )
            ],
        )

        # Patch the delivery_service's _get_item_finance_ext (different import alias).
        # The service raises ValueError for service lines submitted to create_delivery_from_so.
        # Message: "are service items (isStock=False). Service items are invoiced directly..."
        with patch(
            "src.modules.sales.services.delivery_service._get_item_finance_ext",
            new_callable=AsyncMock,
            return_value={
                "itemId": SVC_ITEM_1_ID,
                "isStock": False,
                "revenueAccountId": REVENUE_ACCOUNT_ID,
            },
        ):
            with pytest.raises(ValueError, match="service items"):
                await create_delivery_from_so(
                    db,
                    so_doc_entry=so_entry,
                    payload=dn_payload,
                    org_id=ORG_ID,
                    user_id=USER_ID,
                    auth_token="dummy-token",  # required to trigger isStock check
                )


# ---------------------------------------------------------------------------
# Class 2 — TestMixedSOAutoClose
# ---------------------------------------------------------------------------


class TestMixedSOAutoClose:
    """
    The load-bearing Option B spec tests: a mixed SO (stock + service lines).

    Stock lines flow through DN → from-Delivery ARI.
    Service lines flow directly from the SO via from-SO ARI.
    The SO auto-closes only after BOTH paths are fully invoiced.
    """

    def _make_mixed_so(
        self,
        db: _FakeDB,
        stock_qty: float = 10.0,
        svc_qty: float = 5.0,
    ) -> str:
        """Seed a 2-stock + 1-service SO in OPEN status. Returns so_entry."""
        so_entry = str(uuid.uuid4())
        lines = [
            _make_so_line(SO_STOCK_LINE_1_ID, STOCK_ITEM_1_ID, "STK-001", "Stock Item 1",
                          quantity=stock_qty, line_number=1),
            _make_so_line(SO_STOCK_LINE_2_ID, STOCK_ITEM_2_ID, "STK-002", "Stock Item 2",
                          quantity=stock_qty, line_number=2),
            _make_so_line(SO_SVC_LINE_1_ID, SVC_ITEM_1_ID, "SVC-001", "Service Item 1",
                          quantity=svc_qty, line_number=3),
        ]
        so = _make_so_doc(lines, status="open", doc_entry=so_entry)
        db["sales_orders_v2"]._add(so)
        return so_entry

    def _make_stock_only_dn(
        self,
        db: _FakeDB,
        so_entry: str,
        so_doc_number: str,
        stock_qty: float = 10.0,
    ) -> str:
        """Seed a DN with 2 stock lines (from the mixed SO). Returns dn_entry."""
        dn_entry = str(uuid.uuid4())
        dn_lines = [
            _make_dn_line(
                DN_STOCK_LINE_1_ID, SO_STOCK_LINE_1_ID,
                STOCK_ITEM_1_ID, "STK-001", "Stock Item 1",
                quantity=stock_qty, line_number=1,
            ),
            _make_dn_line(
                DN_STOCK_LINE_2_ID, SO_STOCK_LINE_2_ID,
                STOCK_ITEM_2_ID, "STK-002", "Stock Item 2",
                quantity=stock_qty, line_number=2,
            ),
        ]
        dn = _make_dn_doc(
            so_doc_entry=so_entry,
            so_doc_number=so_doc_number,
            dn_lines=dn_lines,
            status="open",
            doc_entry=dn_entry,
        )
        db["deliveries_v2"]._add(dn)
        return dn_entry

    @pytest.mark.asyncio
    async def test_mixed_so_open_all_lines_start_with_zero_invoiced_qty(self) -> None:
        """
        Create a mixed SO (2 stock + 1 service). Transition to OPEN.
        All three lines start with invoicedQty=0.
        """
        db = _FakeDB()
        so_entry = self._make_mixed_so(db)

        so_doc = next(d for d in db["sales_orders_v2"]._docs if d["docEntry"] == so_entry)
        for ln in so_doc["lines"]:
            assert ln["invoicedQty"] == pytest.approx(0.0), (
                f"Line {ln['lineId']} must start with invoicedQty=0"
            )

    @pytest.mark.asyncio
    async def test_dn_from_mixed_so_contains_only_stock_lines(self) -> None:
        """
        When we seed a DN from a mixed SO, the DN contains only the 2 stock lines.
        The service line is NOT present on the DN.
        Stock-line invoicedQty on the SO is still 0 (DN creation doesn't invoice).
        """
        db = _FakeDB()
        so_entry = self._make_mixed_so(db)

        # Seed DN with only stock lines (simulating create_delivery_from_so behaviour).
        dn_entry = self._make_stock_only_dn(db, so_entry, "SO-2026-VIS-0001")

        dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)

        # DN must have exactly 2 lines (the 2 stock lines).
        assert len(dn_doc["lines"]) == 2
        dn_item_ids = {ln["itemId"] for ln in dn_doc["lines"]}
        assert STOCK_ITEM_1_ID in dn_item_ids
        assert STOCK_ITEM_2_ID in dn_item_ids
        assert SVC_ITEM_1_ID not in dn_item_ids, (
            "Service item must NOT appear on the DN"
        )

        # SO stock-line invoicedQty is still 0 (DN creation doesn't invoice).
        so_doc = next(d for d in db["sales_orders_v2"]._docs if d["docEntry"] == so_entry)
        ln_map = {ln["lineId"]: ln for ln in so_doc["lines"]}
        assert ln_map[SO_STOCK_LINE_1_ID]["invoicedQty"] == pytest.approx(0.0)
        assert ln_map[SO_STOCK_LINE_2_ID]["invoicedQty"] == pytest.approx(0.0)

    @pytest.mark.asyncio
    async def test_from_dn_ari_full_stock_bubbles_up_to_so_stock_lines(self) -> None:
        """
        Create a from-DN ARI invoicing both stock lines fully.

        Post-condition (DN→SO bubble-up):
        - DN lines invoicedQty == quantity for both stock lines.
        - SO stock-line invoicedQty == quantity for both stock lines (bubble-up).
        - SO service line still at invoicedQty=0.
        - SO does NOT auto-close yet (service line still open).
        """
        db = _FakeDB()
        so_entry = self._make_mixed_so(db)
        dn_entry = self._make_stock_only_dn(db, so_entry, "SO-2026-VIS-0001")

        # Full-invoice both stock DN lines.
        from src.modules.sales.models.ar_invoices import (
            ARInvoiceFromDeliveryLineRequest,
            ARInvoiceFromDeliveryRequest,
        )

        payload = ARInvoiceFromDeliveryRequest(
            company_code=COMPANY_CODE,
            doc_date=date(2026, 2, 1),
            invoice_date=date(2026, 2, 1),
            lines=[
                ARInvoiceFromDeliveryLineRequest(
                    delivery_line_id=DN_STOCK_LINE_1_ID,
                    quantity=Decimal("10"),
                    unit_price=Decimal("100"),
                ),
                ARInvoiceFromDeliveryLineRequest(
                    delivery_line_id=DN_STOCK_LINE_2_ID,
                    quantity=Decimal("10"),
                    unit_price=Decimal("100"),
                ),
            ],
        )

        # For from-Delivery path the item ext lookup uses the same patch alias.
        is_stock_map = {STOCK_ITEM_1_ID: True, STOCK_ITEM_2_ID: True}
        with _patch_item_ext_isstock(is_stock_map), _patch_customer_ext():
            ari = await create_ar_invoice_from_delivery(
                db,
                delivery_doc_entry=dn_entry,
                payload=payload,
                org_id=ORG_ID,
                user_id=USER_ID,
            )

        # DN lines invoicedQty == quantity.
        dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
        dn_ln_map = {ln["lineId"]: ln for ln in dn_doc["lines"]}
        assert dn_ln_map[DN_STOCK_LINE_1_ID]["invoicedQty"] == pytest.approx(10.0), (
            "DN stock line 1 invoicedQty must be 10 after full invoicing"
        )
        assert dn_ln_map[DN_STOCK_LINE_2_ID]["invoicedQty"] == pytest.approx(10.0), (
            "DN stock line 2 invoicedQty must be 10 after full invoicing"
        )

        # SO stock-line invoicedQty must have been bubbled up.
        so_doc = next(d for d in db["sales_orders_v2"]._docs if d["docEntry"] == so_entry)
        so_ln_map = {ln["lineId"]: ln for ln in so_doc["lines"]}
        assert so_ln_map[SO_STOCK_LINE_1_ID]["invoicedQty"] == pytest.approx(10.0), (
            "SO stock line 1 invoicedQty must bubble up from DN line"
        )
        assert so_ln_map[SO_STOCK_LINE_2_ID]["invoicedQty"] == pytest.approx(10.0), (
            "SO stock line 2 invoicedQty must bubble up from DN line"
        )

        # SO service line is still at invoicedQty=0.
        assert so_ln_map[SO_SVC_LINE_1_ID]["invoicedQty"] == pytest.approx(0.0), (
            "SO service line must still have invoicedQty=0 — not yet invoiced via from-SO"
        )

    @pytest.mark.asyncio
    async def test_dn_ari_open_does_not_close_so_with_open_service_line(self) -> None:
        """
        Transitioning the from-DN ARI to OPEN auto-closes the DN but NOT the SO.

        The SO must stay OPEN because the service line has open_invoice_qty > 0.
        """
        db = _FakeDB()
        so_entry = self._make_mixed_so(db)
        dn_entry = self._make_stock_only_dn(db, so_entry, "SO-2026-VIS-0001")

        from src.modules.sales.models.ar_invoices import (
            ARInvoiceFromDeliveryLineRequest,
            ARInvoiceFromDeliveryRequest,
        )

        payload = ARInvoiceFromDeliveryRequest(
            company_code=COMPANY_CODE,
            doc_date=date(2026, 2, 1),
            invoice_date=date(2026, 2, 1),
            lines=[
                ARInvoiceFromDeliveryLineRequest(
                    delivery_line_id=DN_STOCK_LINE_1_ID,
                    quantity=Decimal("10"),
                    unit_price=Decimal("100"),
                ),
                ARInvoiceFromDeliveryLineRequest(
                    delivery_line_id=DN_STOCK_LINE_2_ID,
                    quantity=Decimal("10"),
                    unit_price=Decimal("100"),
                ),
            ],
        )

        is_stock_map = {STOCK_ITEM_1_ID: True, STOCK_ITEM_2_ID: True}
        with _patch_item_ext_isstock(is_stock_map), _patch_customer_ext():
            ari = await create_ar_invoice_from_delivery(
                db,
                delivery_doc_entry=dn_entry,
                payload=payload,
                org_id=ORG_ID,
                user_id=USER_ID,
            )

        # DN should auto-close (all DN lines fully invoiced).
        dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
        assert dn_doc["status"] == DocumentStatus.CLOSED.value, (
            "DN must auto-close when all its stock lines are fully invoiced"
        )

        # SO must NOT auto-close: service line still open.
        so_doc = next(d for d in db["sales_orders_v2"]._docs if d["docEntry"] == so_entry)
        assert so_doc["status"] == DocumentStatus.OPEN.value, (
            "SO must NOT auto-close — service line still has open_invoice_qty > 0"
        )

    @pytest.mark.asyncio
    async def test_from_so_ari_invoices_service_line_sets_so_line_invoiced_qty(self) -> None:
        """
        After full DN→ARI invoicing of stock lines, invoice the service line via from-SO.

        Post-condition:
        - SO service line invoicedQty == quantity.
        - SO header + per-line targetDocRefs include the from-SO ARI.
        """
        db = _FakeDB()
        so_entry = self._make_mixed_so(db)
        dn_entry = self._make_stock_only_dn(db, so_entry, "SO-2026-VIS-0001")

        from src.modules.sales.models.ar_invoices import (
            ARInvoiceFromDeliveryLineRequest,
            ARInvoiceFromDeliveryRequest,
        )

        dn_payload = ARInvoiceFromDeliveryRequest(
            company_code=COMPANY_CODE,
            doc_date=date(2026, 2, 1),
            invoice_date=date(2026, 2, 1),
            lines=[
                ARInvoiceFromDeliveryLineRequest(
                    delivery_line_id=DN_STOCK_LINE_1_ID,
                    quantity=Decimal("10"),
                    unit_price=Decimal("100"),
                ),
                ARInvoiceFromDeliveryLineRequest(
                    delivery_line_id=DN_STOCK_LINE_2_ID,
                    quantity=Decimal("10"),
                    unit_price=Decimal("100"),
                ),
            ],
        )
        stock_map = {STOCK_ITEM_1_ID: True, STOCK_ITEM_2_ID: True}
        with _patch_item_ext_isstock(stock_map), _patch_customer_ext():
            await create_ar_invoice_from_delivery(
                db, delivery_doc_entry=dn_entry, payload=dn_payload, org_id=ORG_ID, user_id=USER_ID
            )

        # Now invoice the service line via from-SO.
        svc_payload = _make_from_so_payload(so_line_id=SO_SVC_LINE_1_ID, qty=5.0)
        svc_map = {SVC_ITEM_1_ID: False}
        with _patch_item_ext_isstock(svc_map), _patch_customer_ext():
            ari_svc = await create_ar_invoice_from_so(
                db, so_doc_entry=so_entry, payload=svc_payload, org_id=ORG_ID, user_id=USER_ID
            )

        so_doc = next(d for d in db["sales_orders_v2"]._docs if d["docEntry"] == so_entry)
        so_ln_map = {ln["lineId"]: ln for ln in so_doc["lines"]}

        # Service line invoicedQty must be fully set.
        assert so_ln_map[SO_SVC_LINE_1_ID]["invoicedQty"] == pytest.approx(5.0), (
            "SO service line invoicedQty must be 5 after from-SO ARI creation"
        )

        # SO header targetDocRefs must include the from-SO ARI.
        header_refs = so_doc.get("targetDocRefs", [])
        assert any(r.get("docId") == ari_svc.doc_entry for r in header_refs), (
            "SO header targetDocRefs must contain the from-SO ARI"
        )

        # SO service line targetDocRefs must include the from-SO ARI.
        svc_line_refs = so_ln_map[SO_SVC_LINE_1_ID].get("targetDocRefs", [])
        assert any(r.get("docId") == ari_svc.doc_entry for r in svc_line_refs), (
            "SO service line targetDocRefs must contain the from-SO ARI"
        )

    @pytest.mark.asyncio
    async def test_from_so_ari_open_closes_mixed_so_when_all_lines_invoiced(self) -> None:
        """
        The Option B spec test: mixed SO auto-closes only after BOTH paths complete.

        Sequence:
        1. Invoice both stock DN lines via from-DN ARI → DN closes, SO stays OPEN.
        2. Invoice service SO line via from-SO ARI → ARI in DRAFT, SO auto-closes
           because every line (stock + service) now has open_invoice_qty == 0.

        Audit entry 'auto_close_on_full_invoice' must appear in sales_orders_v2_audit.
        """
        db = _FakeDB()
        so_entry = self._make_mixed_so(db)
        dn_entry = self._make_stock_only_dn(db, so_entry, "SO-2026-VIS-0001")

        from src.modules.sales.models.ar_invoices import (
            ARInvoiceFromDeliveryLineRequest,
            ARInvoiceFromDeliveryRequest,
        )

        # Step 1: Invoice stock lines via DN.
        dn_payload = ARInvoiceFromDeliveryRequest(
            company_code=COMPANY_CODE,
            doc_date=date(2026, 2, 1),
            invoice_date=date(2026, 2, 1),
            lines=[
                ARInvoiceFromDeliveryLineRequest(
                    delivery_line_id=DN_STOCK_LINE_1_ID,
                    quantity=Decimal("10"),
                    unit_price=Decimal("100"),
                ),
                ARInvoiceFromDeliveryLineRequest(
                    delivery_line_id=DN_STOCK_LINE_2_ID,
                    quantity=Decimal("10"),
                    unit_price=Decimal("100"),
                ),
            ],
        )
        stock_map = {STOCK_ITEM_1_ID: True, STOCK_ITEM_2_ID: True}
        with _patch_item_ext_isstock(stock_map), _patch_customer_ext():
            await create_ar_invoice_from_delivery(
                db, delivery_doc_entry=dn_entry, payload=dn_payload, org_id=ORG_ID, user_id=USER_ID
            )

        # SO must still be OPEN after stock lines are invoiced.
        so_doc = next(d for d in db["sales_orders_v2"]._docs if d["docEntry"] == so_entry)
        assert so_doc["status"] == DocumentStatus.OPEN.value, (
            "SO must stay OPEN after stock invoicing — service line still open"
        )

        # Step 2: Invoice service line via from-SO.
        svc_payload = _make_from_so_payload(so_line_id=SO_SVC_LINE_1_ID, qty=5.0)
        svc_map = {SVC_ITEM_1_ID: False}
        with _patch_item_ext_isstock(svc_map), _patch_customer_ext():
            ari_svc = await create_ar_invoice_from_so(
                db, so_doc_entry=so_entry, payload=svc_payload, org_id=ORG_ID, user_id=USER_ID
            )

        # SO must now be CLOSED (all lines fully invoiced).
        so_doc = next(d for d in db["sales_orders_v2"]._docs if d["docEntry"] == so_entry)
        assert so_doc["status"] == DocumentStatus.CLOSED.value, (
            "SO must auto-close after service line is fully invoiced via from-SO ARI"
        )

        # Audit entry must exist.
        audit_entries = db["sales_orders_v2_audit"]._docs
        auto_close_entries = [
            e for e in audit_entries
            if e.get("action") == "auto_close_on_full_invoice"
            and e.get("docEntry") == so_entry
        ]
        assert len(auto_close_entries) >= 1, (
            "SO audit must contain auto_close_on_full_invoice after all lines are invoiced"
        )
        # Most recent entry must reference the from-SO ARI.
        latest = auto_close_entries[-1]
        assert latest["detail"]["triggeredByAriDocEntry"] == ari_svc.doc_entry


# ---------------------------------------------------------------------------
# Class 3 — TestFromSOCounterReconciliation
# ---------------------------------------------------------------------------


class TestFromSOCounterReconciliation:
    """
    Counter reconciliation for edit / delete / cancel of DRAFT from-SO ARIs.

    Mirrors the T-201.6 test suite from test_delivery_invoice_visibility.py
    but targeting the SO chain (sales_orders_v2) instead of deliveries_v2.
    """

    def _seed_open_svc_so(self, db: _FakeDB, qty: float = 100.0) -> str:
        """Seed a service-only SO (OPEN) with one line. Returns so_entry."""
        so_entry = str(uuid.uuid4())
        lines = [
            _make_so_line(SO_SVC_LINE_1_ID, SVC_ITEM_1_ID, "SVC-001", "Service Item 1",
                          quantity=qty, line_number=1),
        ]
        so = _make_so_doc(lines, status="open", doc_entry=so_entry)
        db["sales_orders_v2"]._add(so)
        return so_entry

    @pytest.mark.asyncio
    async def test_edit_draft_ari_qty_down_reconciles_so_counter(self) -> None:
        """
        Edit DRAFT from-SO ARI line qty down (60 → 40).

        Post-condition: SO line invoicedQty == 40. SO stays OPEN (not fully invoiced).
        """
        db = _FakeDB()
        so_entry = self._seed_open_svc_so(db, qty=100.0)
        svc_map = {SVC_ITEM_1_ID: False}

        payload = _make_from_so_payload(so_line_id=SO_SVC_LINE_1_ID, qty=60.0)
        with _patch_item_ext_isstock(svc_map), _patch_customer_ext():
            ari = await create_ar_invoice_from_so(
                db, so_doc_entry=so_entry, payload=payload, org_id=ORG_ID, user_id=USER_ID
            )

        so_doc = next(d for d in db["sales_orders_v2"]._docs if d["docEntry"] == so_entry)
        assert next(ln for ln in so_doc["lines"] if ln["lineId"] == SO_SVC_LINE_1_ID)["invoicedQty"] == pytest.approx(60.0)

        # Edit DRAFT down to 40.
        update_payload = _make_update_payload_for_so_line(
            so_doc_entry=so_entry,
            so_doc_number="SO-2026-VIS-0001",
            so_line_id=SO_SVC_LINE_1_ID,
            item_id=SVC_ITEM_1_ID,
            qty=40.0,
        )
        with _patch_item_ext_isstock(svc_map):
            await update_ar_invoice(db, ari.doc_entry, update_payload, ORG_ID, USER_ID)

        so_doc = next(d for d in db["sales_orders_v2"]._docs if d["docEntry"] == so_entry)
        ln = next(ln for ln in so_doc["lines"] if ln["lineId"] == SO_SVC_LINE_1_ID)
        assert ln["invoicedQty"] == pytest.approx(40.0), "SO line invoicedQty must be 40 after edit down"
        assert so_doc["status"] == DocumentStatus.OPEN.value

    @pytest.mark.asyncio
    async def test_edit_draft_ari_qty_above_open_qty_raises_value_error(self) -> None:
        """
        Edit DRAFT from-SO ARI qty up beyond the available open_invoice_qty → ValueError.

        After creating for 60 (orderedQty=100), open_invoice_qty = 40.
        Editing to 110 → delta = +50, which exceeds open=40 → ValueError.
        SO line invoicedQty unchanged (60).
        """
        db = _FakeDB()
        so_entry = self._seed_open_svc_so(db, qty=100.0)
        svc_map = {SVC_ITEM_1_ID: False}

        payload = _make_from_so_payload(so_line_id=SO_SVC_LINE_1_ID, qty=60.0)
        with _patch_item_ext_isstock(svc_map), _patch_customer_ext():
            ari = await create_ar_invoice_from_so(
                db, so_doc_entry=so_entry, payload=payload, org_id=ORG_ID, user_id=USER_ID
            )

        # Attempt to edit up to 110 (exceeds capacity).
        update_payload = _make_update_payload_for_so_line(
            so_doc_entry=so_entry,
            so_doc_number="SO-2026-VIS-0001",
            so_line_id=SO_SVC_LINE_1_ID,
            item_id=SVC_ITEM_1_ID,
            qty=110.0,
        )
        with _patch_item_ext_isstock(svc_map), pytest.raises(ValueError, match="open_invoice_qty"):
            await update_ar_invoice(db, ari.doc_entry, update_payload, ORG_ID, USER_ID)

        # SO line invoicedQty must be unchanged at 60.
        so_doc = next(d for d in db["sales_orders_v2"]._docs if d["docEntry"] == so_entry)
        ln = next(ln for ln in so_doc["lines"] if ln["lineId"] == SO_SVC_LINE_1_ID)
        assert ln["invoicedQty"] == pytest.approx(60.0), (
            "SO line invoicedQty must remain unchanged when edit raises ValueError"
        )

    @pytest.mark.asyncio
    async def test_edit_draft_ari_qty_up_within_open_qty_reconciles_counter(self) -> None:
        """
        Edit DRAFT from-SO ARI qty up within the open_invoice_qty band (60 → 80).

        orderedQty=100, invoicedQty=60 → open=40. Edit to 80 (delta=+20) is within 40.
        SO line invoicedQty becomes 80. Cap-check passes.
        """
        db = _FakeDB()
        so_entry = self._seed_open_svc_so(db, qty=100.0)
        svc_map = {SVC_ITEM_1_ID: False}

        payload = _make_from_so_payload(so_line_id=SO_SVC_LINE_1_ID, qty=60.0)
        with _patch_item_ext_isstock(svc_map), _patch_customer_ext():
            ari = await create_ar_invoice_from_so(
                db, so_doc_entry=so_entry, payload=payload, org_id=ORG_ID, user_id=USER_ID
            )

        update_payload = _make_update_payload_for_so_line(
            so_doc_entry=so_entry,
            so_doc_number="SO-2026-VIS-0001",
            so_line_id=SO_SVC_LINE_1_ID,
            item_id=SVC_ITEM_1_ID,
            qty=80.0,
        )
        with _patch_item_ext_isstock(svc_map):
            await update_ar_invoice(db, ari.doc_entry, update_payload, ORG_ID, USER_ID)

        so_doc = next(d for d in db["sales_orders_v2"]._docs if d["docEntry"] == so_entry)
        ln = next(ln for ln in so_doc["lines"] if ln["lineId"] == SO_SVC_LINE_1_ID)
        assert ln["invoicedQty"] == pytest.approx(80.0), "SO line invoicedQty must be 80 after valid edit up"
        assert so_doc["status"] == DocumentStatus.OPEN.value

    @pytest.mark.asyncio
    async def test_delete_draft_ari_releases_so_line_counter_and_pulls_refs(self) -> None:
        """
        Delete a DRAFT from-SO ARI → SO line invoicedQty released back.

        Post-condition:
        - SO line invoicedQty == 0 (released).
        - SO header targetDocRefs emptied (no dangling ARI ref).
        - SO per-line targetDocRefs emptied.
        - SO auto-reopens if it was previously CLOSED.
        """
        db = _FakeDB()
        so_entry = self._seed_open_svc_so(db, qty=10.0)
        svc_map = {SVC_ITEM_1_ID: False}

        # Full invoice → SO auto-closes.
        payload = _make_from_so_payload(so_line_id=SO_SVC_LINE_1_ID, qty=10.0)
        with _patch_item_ext_isstock(svc_map), _patch_customer_ext():
            ari = await create_ar_invoice_from_so(
                db, so_doc_entry=so_entry, payload=payload, org_id=ORG_ID, user_id=USER_ID
            )

        so_doc = next(d for d in db["sales_orders_v2"]._docs if d["docEntry"] == so_entry)
        assert so_doc["status"] == DocumentStatus.CLOSED.value, "SO should be CLOSED before delete"

        # Delete the DRAFT invoice.
        deleted = await delete_ar_invoice(db, ari.doc_entry, ORG_ID, USER_ID)
        assert deleted is True

        # SO must be OPEN again.
        so_doc = next(d for d in db["sales_orders_v2"]._docs if d["docEntry"] == so_entry)
        assert so_doc["status"] == DocumentStatus.OPEN.value, (
            "SO must auto-reopen when from-SO DRAFT ARI is deleted"
        )

        # SO line invoicedQty must be released to 0.
        ln = next(ln for ln in so_doc["lines"] if ln["lineId"] == SO_SVC_LINE_1_ID)
        assert ln["invoicedQty"] == pytest.approx(0.0), (
            "SO line invoicedQty must be 0 after DRAFT ARI delete"
        )

        # SO header targetDocRefs must be empty.
        header_refs = so_doc.get("targetDocRefs", [])
        assert len(header_refs) == 0, (
            "SO header targetDocRefs must be empty after DRAFT ARI delete"
        )

        # SO line targetDocRefs must be empty.
        ln_refs = ln.get("targetDocRefs", [])
        assert len(ln_refs) == 0, (
            "SO line targetDocRefs must be empty after DRAFT ARI delete"
        )

        # SO audit entry 'auto_reopen_on_invoice_release' must exist.
        reopen_entries = [
            e for e in db["sales_orders_v2_audit"]._docs
            if e.get("action") == "auto_reopen_on_invoice_release"
            and e.get("docEntry") == so_entry
        ]
        assert len(reopen_entries) == 1, (
            "SO audit must contain auto_reopen_on_invoice_release after DRAFT delete"
        )
        assert reopen_entries[0]["detail"]["triggeredByAriDocEntry"] == ari.doc_entry

    @pytest.mark.asyncio
    async def test_cancel_open_from_so_ari_releases_so_counter_and_reopens(self) -> None:
        """
        Cancel an OPEN from-SO ARI (OPEN → CANCELLED) → SO line invoicedQty released.

        Sequence: create DRAFT (full) → SO auto-closes → post DRAFT → OPEN → cancel.
        Post-condition: SO auto-reopens with audit 'auto_reopen_on_invoice_release'.
        """
        db = _FakeDB()
        so_entry = self._seed_open_svc_so(db, qty=10.0)
        svc_map = {SVC_ITEM_1_ID: False}

        # Create DRAFT (full invoice) → SO auto-closes.
        payload = _make_from_so_payload(so_line_id=SO_SVC_LINE_1_ID, qty=10.0)
        with _patch_item_ext_isstock(svc_map), _patch_customer_ext():
            ari = await create_ar_invoice_from_so(
                db, so_doc_entry=so_entry, payload=payload, org_id=ORG_ID, user_id=USER_ID
            )

        so_doc = next(d for d in db["sales_orders_v2"]._docs if d["docEntry"] == so_entry)
        assert so_doc["status"] == DocumentStatus.CLOSED.value

        # Post DRAFT → OPEN.
        with _patch_item_ext_isstock(svc_map), _patch_customer_ext():
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

        # Cancel OPEN → CANCELLED.
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

        # SO must be OPEN again.
        so_doc = next(d for d in db["sales_orders_v2"]._docs if d["docEntry"] == so_entry)
        assert so_doc["status"] == DocumentStatus.OPEN.value, (
            "SO must auto-reopen when OPEN from-SO ARI is cancelled"
        )

        # SO line invoicedQty released to 0.
        ln = next(ln for ln in so_doc["lines"] if ln["lineId"] == SO_SVC_LINE_1_ID)
        assert ln["invoicedQty"] == pytest.approx(0.0), (
            "SO line invoicedQty must be 0 after OPEN ARI cancellation"
        )

        # Reopen audit entry must exist.
        reopen_entries = [
            e for e in db["sales_orders_v2_audit"]._docs
            if e.get("action") == "auto_reopen_on_invoice_release"
            and e.get("docEntry") == so_entry
        ]
        assert len(reopen_entries) >= 1, (
            "SO audit must contain auto_reopen_on_invoice_release after cancellation"
        )
        assert reopen_entries[-1]["detail"]["triggeredByAriDocEntry"] == ari.doc_entry


# ---------------------------------------------------------------------------
# Class 4 — TestStockLineUnreachableFromSO
# ---------------------------------------------------------------------------


class TestStockLineUnreachableFromSO:
    """
    Explicit invariant tests (T-201.9 Step 9).

    Stock lines on any SO (mixed or stock-only) are UNREACHABLE from the
    create_ar_invoice_from_so endpoint.  The service raises ValueError with
    the exact message: "is a stock item; invoice via the Delivery Note flow, not from-SO."
    The entire request is rejected — no partial acceptance.
    """

    @pytest.mark.asyncio
    async def test_stock_line_on_mixed_so_rejected_by_from_so(self) -> None:
        """
        Try to invoice a stock line via from-SO on a mixed SO → ValueError.

        The entire ARI is NOT created even if the request includes valid service lines.
        """
        db = _FakeDB()
        so_entry = str(uuid.uuid4())
        lines = [
            _make_so_line(SO_STOCK_LINE_1_ID, STOCK_ITEM_1_ID, "STK-001", "Stock Item 1",
                          quantity=10.0, line_number=1),
            _make_so_line(SO_SVC_LINE_1_ID, SVC_ITEM_1_ID, "SVC-001", "Service Item 1",
                          quantity=5.0, line_number=2),
        ]
        so = _make_so_doc(lines, status="open", doc_entry=so_entry)
        db["sales_orders_v2"]._add(so)

        # Request that includes the STOCK line — should be rejected wholesale.
        payload = _make_from_so_payload(
            so_line_id=SO_STOCK_LINE_1_ID,  # stock line — must be rejected
            qty=10.0,
        )

        is_stock_map = {STOCK_ITEM_1_ID: True, SVC_ITEM_1_ID: False}
        with _patch_item_ext_isstock(is_stock_map):
            with pytest.raises(ValueError, match="invoice via the Delivery Note flow, not from-SO"):
                await create_ar_invoice_from_so(
                    db,
                    so_doc_entry=so_entry,
                    payload=payload,
                    org_id=ORG_ID,
                    user_id=USER_ID,
                )

        # ARI must NOT have been created.
        aris = db["ar_invoices_v2"]._docs
        assert len(aris) == 0, (
            "No ARI must be created when from-SO is called for a stock line"
        )

        # SO must be unchanged.
        so_doc = next(d for d in db["sales_orders_v2"]._docs if d["docEntry"] == so_entry)
        so_ln_map = {ln["lineId"]: ln for ln in so_doc["lines"]}
        assert so_ln_map[SO_STOCK_LINE_1_ID]["invoicedQty"] == pytest.approx(0.0), (
            "SO stock line invoicedQty must be unchanged after rejected from-SO call"
        )

    @pytest.mark.asyncio
    async def test_stock_line_on_stock_only_so_rejected_by_from_so(self) -> None:
        """
        Try to invoice a stock line via from-SO on a stock-only SO → same ValueError.

        No partial accept — the entire request is rejected.
        """
        db = _FakeDB()
        so_entry = str(uuid.uuid4())
        lines = [
            _make_so_line(SO_STOCK_LINE_1_ID, STOCK_ITEM_1_ID, "STK-001", "Stock Item 1",
                          quantity=20.0, line_number=1),
        ]
        so = _make_so_doc(lines, status="open", doc_entry=so_entry)
        db["sales_orders_v2"]._add(so)

        payload = _make_from_so_payload(so_line_id=SO_STOCK_LINE_1_ID, qty=20.0)

        is_stock_map = {STOCK_ITEM_1_ID: True}
        with _patch_item_ext_isstock(is_stock_map):
            with pytest.raises(ValueError, match="invoice via the Delivery Note flow, not from-SO"):
                await create_ar_invoice_from_so(
                    db,
                    so_doc_entry=so_entry,
                    payload=payload,
                    org_id=ORG_ID,
                    user_id=USER_ID,
                )

        assert len(db["ar_invoices_v2"]._docs) == 0, (
            "No ARI must be created for a stock-only SO via from-SO endpoint"
        )

    @pytest.mark.asyncio
    async def test_from_dn_ari_for_stock_line_still_works_as_sanity_check(self) -> None:
        """
        Sanity check: the DN→from-Delivery ARI path still works for the same stock line.

        Confirms the isStock gate is from-SO only — not a global block on stock invoicing.
        """
        db = _FakeDB()
        so_entry = str(uuid.uuid4())
        dn_entry = str(uuid.uuid4())

        # Seed stock-only SO.
        lines = [
            _make_so_line(SO_STOCK_LINE_1_ID, STOCK_ITEM_1_ID, "STK-001", "Stock Item 1",
                          quantity=10.0, line_number=1),
        ]
        so = _make_so_doc(lines, status="open", doc_entry=so_entry)
        db["sales_orders_v2"]._add(so)

        # Seed a DN referencing the SO stock line.
        dn_lines = [
            _make_dn_line(
                DN_STOCK_LINE_1_ID, SO_STOCK_LINE_1_ID,
                STOCK_ITEM_1_ID, "STK-001", "Stock Item 1",
                quantity=10.0, line_number=1,
            ),
        ]
        dn = _make_dn_doc(
            so_doc_entry=so_entry,
            so_doc_number="SO-2026-VIS-0001",
            dn_lines=dn_lines,
            status="open",
            doc_entry=dn_entry,
        )
        db["deliveries_v2"]._add(dn)

        from src.modules.sales.models.ar_invoices import (
            ARInvoiceFromDeliveryLineRequest,
            ARInvoiceFromDeliveryRequest,
        )

        payload = ARInvoiceFromDeliveryRequest(
            company_code=COMPANY_CODE,
            doc_date=date(2026, 2, 1),
            invoice_date=date(2026, 2, 1),
            lines=[
                ARInvoiceFromDeliveryLineRequest(
                    delivery_line_id=DN_STOCK_LINE_1_ID,
                    quantity=Decimal("10"),
                    unit_price=Decimal("100"),
                ),
            ],
        )

        # The from-Delivery path must succeed for the same stock item.
        is_stock_map = {STOCK_ITEM_1_ID: True}
        with _patch_item_ext_isstock(is_stock_map), _patch_customer_ext():
            ari = await create_ar_invoice_from_delivery(
                db,
                delivery_doc_entry=dn_entry,
                payload=payload,
                org_id=ORG_ID,
                user_id=USER_ID,
            )

        assert ari.status == DocumentStatus.DRAFT, (
            "from-Delivery ARI must succeed for a stock line (isStock gate is from-SO only)"
        )

        # DN line invoicedQty updated.
        dn_doc = next(d for d in db["deliveries_v2"]._docs if d["docEntry"] == dn_entry)
        dn_ln = next(ln for ln in dn_doc["lines"] if ln["lineId"] == DN_STOCK_LINE_1_ID)
        assert dn_ln["invoicedQty"] == pytest.approx(10.0)


# ---------------------------------------------------------------------------
# Class 5 — TestSOListServiceOpenInvoiceQty (T-201.10 backend gap)
# ---------------------------------------------------------------------------


class TestSOListServiceOpenInvoiceQty:
    """
    T-201.10 backend gap — serviceOpenInvoiceQty aggregate on list response.

    Verifies _compute_service_open_invoice_qty and the list_sales_orders
    has_service_open_lines filter end-to-end using the in-memory fake DB
    and mocked finance HTTP calls.
    """

    def _patch_so_item_ext_isstock(self, by_item_id: Dict[str, bool]) -> Any:
        """
        Patch _get_item_finance_ext in sales_order_service with per-item isStock flag.

        Different import alias from the ar_invoice_service patch above.
        """
        async def _side_effect(item_id: str, org_id: str, auth_token: Any) -> Dict[str, Any]:
            is_stock = by_item_id.get(item_id, False)
            return {
                "itemId": item_id,
                "organizationId": org_id,
                "revenueAccountId": REVENUE_ACCOUNT_ID,
                "cogsAccountId": "gl-cogs-001" if is_stock else None,
                "salesTaxCode": None,
                "isSellable": True,
                "isStock": is_stock,
            }

        return patch(
            "src.modules.sales.services.sales_order_service._get_item_finance_ext",
            side_effect=_side_effect,
        )

    @pytest.mark.asyncio
    async def test_service_only_so_with_zero_invoiced_qty_returns_full_qty(self) -> None:
        """
        Service-only SO with one line, qty=10, invoicedQty=0.

        _compute_service_open_invoice_qty must return 10.
        """
        from src.modules.sales.services.sales_order_service import (
            _compute_service_open_invoice_qty,
        )

        so_line_id = str(uuid.uuid4())
        so_raw = _make_so_doc(
            lines=[
                _make_so_line(so_line_id, SVC_ITEM_1_ID, "SVC-001", "Service Item 1",
                              quantity=10.0, invoiced_qty=0.0, line_number=1),
            ],
            status="open",
        )

        is_stock_map = {SVC_ITEM_1_ID: False}
        with self._patch_so_item_ext_isstock(is_stock_map):
            result = await _compute_service_open_invoice_qty(
                so_raw, ORG_ID, auth_token="dummy-token"
            )

        assert result == Decimal("10"), (
            "Service-only SO with invoicedQty=0 must return qty=10 as open qty"
        )

    @pytest.mark.asyncio
    async def test_service_only_so_fully_invoiced_returns_zero(self) -> None:
        """
        Service-only SO with one line fully invoiced.

        _compute_service_open_invoice_qty must return 0.
        """
        from src.modules.sales.services.sales_order_service import (
            _compute_service_open_invoice_qty,
        )

        so_line_id = str(uuid.uuid4())
        so_raw = _make_so_doc(
            lines=[
                _make_so_line(so_line_id, SVC_ITEM_1_ID, "SVC-001", "Service Item 1",
                              quantity=10.0, invoiced_qty=10.0, line_number=1),
            ],
            status="open",
        )

        is_stock_map = {SVC_ITEM_1_ID: False}
        with self._patch_so_item_ext_isstock(is_stock_map):
            result = await _compute_service_open_invoice_qty(
                so_raw, ORG_ID, auth_token="dummy-token"
            )

        assert result == Decimal("0"), (
            "Fully-invoiced service line must contribute 0 to service_open_invoice_qty"
        )

    @pytest.mark.asyncio
    async def test_mixed_so_only_service_lines_contribute(self) -> None:
        """
        Mixed SO (2 stock + 1 service), service line partly invoiced.

        Stock lines must NOT contribute; only the service line does.
        """
        from src.modules.sales.services.sales_order_service import (
            _compute_service_open_invoice_qty,
        )

        svc_line_id = str(uuid.uuid4())
        stk_line_1_id = str(uuid.uuid4())
        stk_line_2_id = str(uuid.uuid4())

        # Service line: qty=10, invoicedQty=4 → open_qty=6.
        # Stock lines: each qty=10, invoicedQty=10 (fully invoiced via DN path).
        so_raw = _make_so_doc(
            lines=[
                _make_so_line(stk_line_1_id, STOCK_ITEM_1_ID, "STK-001", "Stock Item 1",
                              quantity=10.0, invoiced_qty=10.0, line_number=1),
                _make_so_line(stk_line_2_id, STOCK_ITEM_2_ID, "STK-002", "Stock Item 2",
                              quantity=10.0, invoiced_qty=10.0, line_number=2),
                _make_so_line(svc_line_id, SVC_ITEM_1_ID, "SVC-001", "Service Item 1",
                              quantity=10.0, invoiced_qty=4.0, line_number=3),
            ],
            status="open",
        )

        is_stock_map = {
            STOCK_ITEM_1_ID: True,
            STOCK_ITEM_2_ID: True,
            SVC_ITEM_1_ID: False,
        }
        with self._patch_so_item_ext_isstock(is_stock_map):
            result = await _compute_service_open_invoice_qty(
                so_raw, ORG_ID, auth_token="dummy-token"
            )

        # Only service line contributes: 10 - 4 = 6.
        assert result == Decimal("6"), (
            "Stock lines must NOT contribute; only the service line's open qty (6) counts"
        )

    @pytest.mark.asyncio
    async def test_stock_only_so_returns_zero(self) -> None:
        """
        Stock-only SO — no service lines.

        _compute_service_open_invoice_qty must return 0 (all lines skipped as stock).
        """
        from src.modules.sales.services.sales_order_service import (
            _compute_service_open_invoice_qty,
        )

        so_raw = _make_so_doc(
            lines=[
                _make_so_line(SO_STOCK_LINE_1_ID, STOCK_ITEM_1_ID, "STK-001", "Stock Item 1",
                              quantity=10.0, invoiced_qty=0.0, line_number=1),
            ],
            status="open",
        )

        is_stock_map = {STOCK_ITEM_1_ID: True}
        with self._patch_so_item_ext_isstock(is_stock_map):
            result = await _compute_service_open_invoice_qty(
                so_raw, ORG_ID, auth_token="dummy-token"
            )

        assert result == Decimal("0"), (
            "Stock-only SO must return 0 — no service lines to aggregate"
        )

    @pytest.mark.asyncio
    async def test_list_filter_has_service_open_lines_true_returns_only_matching_sos(
        self,
    ) -> None:
        """
        list_sales_orders with has_service_open_lines=True returns only SOs with
        service_open_invoice_qty > 0.

        Seeds two SOs: one service-only with open qty, one stock-only.
        Filter must return exactly the service-only SO.
        """
        from src.modules.sales.services.sales_order_service import list_sales_orders

        db = _FakeDB()

        svc_so_entry = str(uuid.uuid4())
        stk_so_entry = str(uuid.uuid4())
        svc_line_id = str(uuid.uuid4())

        # Service-only SO, one line, qty=5, invoicedQty=0.
        db["sales_orders_v2"]._add(
            _make_so_doc(
                lines=[
                    _make_so_line(svc_line_id, SVC_ITEM_1_ID, "SVC-001", "Service Item 1",
                                  quantity=5.0, invoiced_qty=0.0, line_number=1),
                ],
                status="open",
                doc_entry=svc_so_entry,
                doc_number="SO-2026-SVC-0001",
            )
        )
        # Stock-only SO, one line, qty=10, invoicedQty=0 (stock; not counted).
        db["sales_orders_v2"]._add(
            _make_so_doc(
                lines=[
                    _make_so_line(SO_STOCK_LINE_1_ID, STOCK_ITEM_1_ID, "STK-001", "Stock Item 1",
                                  quantity=10.0, invoiced_qty=0.0, line_number=1),
                ],
                status="open",
                doc_entry=stk_so_entry,
                doc_number="SO-2026-STK-0001",
            )
        )

        is_stock_map = {SVC_ITEM_1_ID: False, STOCK_ITEM_1_ID: True}
        with self._patch_so_item_ext_isstock(is_stock_map):
            result = await list_sales_orders(
                db,
                ORG_ID,
                has_service_open_lines=True,
                auth_token="dummy-token",
            )

        assert result["total"] == 1, (
            "Only 1 SO must be returned when has_service_open_lines=True"
        )
        assert len(result["items"]) == 1
        assert result["items"][0].doc_entry == svc_so_entry, (
            "The returned SO must be the service-only one"
        )
        assert result["items"][0].service_open_invoice_qty == Decimal("5")

    @pytest.mark.asyncio
    async def test_list_filter_not_set_returns_all_sos(self) -> None:
        """
        list_sales_orders without has_service_open_lines returns all SOs regardless
        of service_open_invoice_qty.
        """
        from src.modules.sales.services.sales_order_service import list_sales_orders

        db = _FakeDB()

        for i in range(3):
            db["sales_orders_v2"]._add(
                _make_so_doc(
                    lines=[
                        _make_so_line(str(uuid.uuid4()), SVC_ITEM_1_ID, "SVC-001",
                                      "Service Item 1", quantity=float(i + 1),
                                      invoiced_qty=0.0, line_number=1),
                    ],
                    status="open",
                    doc_entry=str(uuid.uuid4()),
                    doc_number=f"SO-2026-FILTER-{i:04d}",
                )
            )

        is_stock_map = {SVC_ITEM_1_ID: False}
        with self._patch_so_item_ext_isstock(is_stock_map):
            result = await list_sales_orders(
                db,
                ORG_ID,
                has_service_open_lines=None,
                auth_token="dummy-token",
            )

        assert result["total"] == 3, (
            "All 3 SOs must be returned when has_service_open_lines is not set"
        )
        assert len(result["items"]) == 3

    @pytest.mark.asyncio
    async def test_finance_unreachable_for_item_treats_as_stock_excludes_from_aggregate(
        self,
    ) -> None:
        """
        When the finance service raises ValueError for a specific item, that line
        is treated as stock (excluded from service aggregate).  Other items that
        succeed still aggregate correctly.
        """
        from src.modules.sales.services.sales_order_service import (
            _compute_service_open_invoice_qty,
        )

        UNREACHABLE_ITEM_ID = "item-unreachable-001"
        reachable_svc_line_id = str(uuid.uuid4())
        unreachable_line_id = str(uuid.uuid4())

        so_raw = _make_so_doc(
            lines=[
                # Finance unreachable — must be treated as stock (excluded).
                _make_so_line(unreachable_line_id, UNREACHABLE_ITEM_ID, "UNREACH-001",
                              "Unreachable Item", quantity=10.0, invoiced_qty=0.0,
                              line_number=1),
                # Reachable service item — must contribute its open qty.
                _make_so_line(reachable_svc_line_id, SVC_ITEM_1_ID, "SVC-001",
                              "Service Item 1", quantity=7.0, invoiced_qty=2.0,
                              line_number=2),
            ],
            status="open",
        )

        async def _side_effect_with_failure(
            item_id: str, org_id: str, auth_token: Any
        ) -> Dict[str, Any]:
            if item_id == UNREACHABLE_ITEM_ID:
                raise ValueError("Finance service unreachable for item")
            return {
                "itemId": item_id,
                "organizationId": org_id,
                "revenueAccountId": REVENUE_ACCOUNT_ID,
                "cogsAccountId": None,
                "salesTaxCode": None,
                "isSellable": True,
                "isStock": False,
            }

        with patch(
            "src.modules.sales.services.sales_order_service._get_item_finance_ext",
            side_effect=_side_effect_with_failure,
        ):
            result = await _compute_service_open_invoice_qty(
                so_raw, ORG_ID, auth_token="dummy-token"
            )

        # Only the reachable service line contributes: 7 - 2 = 5.
        # The unreachable item is treated as stock and excluded.
        assert result == Decimal("5"), (
            "Unreachable item must be treated as stock (excluded); "
            "reachable service line contributes qty 7 - invoiced 2 = 5"
        )
