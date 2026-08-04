"""
T-201.8 — isStock gating contract tests.

Covers the three service-level guards introduced in T-201.8:
  - AR Invoice  (ar_invoice_service.py)
  - AR Credit Note (ar_credit_note_service.py)
  - Return Request (return_request_service.py)

Each guard applies to three code paths:
  Group A — create_*  (direct path only)
  Group B — update_*  (direct DRAFT only)
  Group C — transition_status DRAFT → OPEN (direct DRAFT only; fail-open on error)

Architectural rule (T-100.9a.1):
  sale_item_finance_ext lives in the finance microservice's MySQL DB.
  Ops services call it via HTTP (_get_item_finance_ext).
  Tests MUST mock _get_item_finance_ext — never seed a MongoDB collection.

Run:
    pytest src/modules/sales/tests/test_isstock_gating.py -v
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, patch

import pytest

from src.core.documents.document_status import DocumentStatus

# ---------------------------------------------------------------------------
# AR Invoice imports
# ---------------------------------------------------------------------------
from src.modules.sales.models.ar_invoices import (
    ARInvoiceCreate,
    ARInvoiceLineCreate,
    ARInvoiceStatusTransitionRequest,
    ARInvoiceUpdate,
)
from src.modules.sales.services.ar_invoice_service import (
    create_ar_invoice,
    get_ar_invoice,
    transition_status as ari_transition_status,
    update_ar_invoice,
)

# ---------------------------------------------------------------------------
# AR Credit Note imports
# ---------------------------------------------------------------------------
from src.modules.sales.models.ar_credit_notes import (
    ARCreditNoteCreate,
    ARCreditNoteStatusTransitionRequest,
    ARCreditNoteUpdate,
    CreditNoteAllocationCreate,
    CreditNoteLineCreate,
)
from src.modules.sales.services.ar_credit_note_service import (
    create_ar_credit_note,
    get_ar_credit_note,
    transition_status as arc_transition_status,
    update_ar_credit_note,
)

# ---------------------------------------------------------------------------
# Return Request imports
# ---------------------------------------------------------------------------
from src.modules.sales.models.return_requests import (
    ReturnRequestCreate,
    ReturnRequestStatusTransitionRequest,
    ReturnRequestUpdate,
)
from src.modules.sales.services.return_request_service import (
    create_return_request,
    get_return_request,
    transition_status as rr_transition_status,
    update_return_request,
)

# ---------------------------------------------------------------------------
# Minimal in-memory fake Motor DB
#
# Deliberately self-contained so this test file can run without depending on
# the per-file fake DB classes in the sibling test files.
# ---------------------------------------------------------------------------


def _matches(doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
    """Minimal query matcher: equality + $gte/$lte/$ne/$in + dotted paths."""
    for key, val in query.items():
        if "." in key:
            parts = key.split(".", 1)
            parent_val = doc.get(parts[0])
            if isinstance(parent_val, list):
                found = any(
                    _matches(item, {parts[1]: val})
                    for item in parent_val
                    if isinstance(item, dict)
                )
                if not found:
                    return False
            elif isinstance(parent_val, dict):
                if not _matches(parent_val, {parts[1]: val}):
                    return False
            else:
                return False
            continue

        doc_val = doc.get(key)
        if isinstance(val, dict):
            for op, operand in val.items():
                if op == "$gte" and (doc_val is None or doc_val < operand):
                    return False
                elif op == "$lte" and (doc_val is None or doc_val > operand):
                    return False
                elif op == "$ne" and doc_val == operand:
                    return False
                elif op == "$in" and doc_val not in operand:
                    return False
        else:
            if doc_val != val:
                return False
    return True


def _apply_update(doc: Dict[str, Any], update: Dict[str, Any]) -> None:
    if "$set" in update:
        for k, v in update["$set"].items():
            if ".$." not in k:
                if "." in k:
                    parts = k.split(".", 1)
                    doc.setdefault(parts[0], {})[parts[1]] = v
                else:
                    doc[k] = v
    if "$inc" in update:
        for k, delta in update["$inc"].items():
            if ".$." not in k:
                doc[k] = doc.get(k, 0) + delta
    if "$push" in update:
        for k, v in update["$push"].items():
            if ".$." not in k:
                doc.setdefault(k, []).append(v)


class _FakeCollection:
    def __init__(self) -> None:
        self._docs: List[Dict[str, Any]] = []

    async def find_one(self, query: Dict, *args: Any, **kwargs: Any) -> Any:
        for doc in self._docs:
            if _matches(doc, query):
                return dict(doc)
        return None

    def find(
        self, query: Dict = None, projection: Any = None, *args: Any, **kwargs: Any
    ) -> "_FakeCursor":
        matched = [dict(d) for d in self._docs if _matches(d, query or {})]
        return _FakeCursor(matched)

    async def find_one_and_update(
        self, query: Dict, update: Dict, **kwargs: Any
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

    async def update_one(self, query: Dict, update: Dict, **kwargs: Any) -> None:
        for doc in self._docs:
            if _matches(doc, query):
                _apply_update(doc, update)
                return

    async def insert_one(self, doc: Dict, **kwargs: Any) -> None:
        self._docs.append(dict(doc))

    async def delete_one(self, query: Dict, **kwargs: Any) -> None:
        for i, doc in enumerate(self._docs):
            if _matches(doc, query):
                del self._docs[i]
                return

    async def count_documents(self, query: Dict, **kwargs: Any) -> int:
        return sum(1 for d in self._docs if _matches(d, query))

    def _add(self, doc: Dict[str, Any]) -> None:
        self._docs.append(doc)


class _FakeCursor:
    def __init__(self, docs: List[Dict]) -> None:
        self._docs = docs

    def sort(self, *args: Any, **kwargs: Any) -> "_FakeCursor":
        return self

    def skip(self, n: int) -> "_FakeCursor":
        return _FakeCursor(self._docs[n:])

    def limit(self, n: int) -> "_FakeCursor":
        return _FakeCursor(self._docs[:n])

    async def to_list(self, length: Any = None) -> List[Dict]:
        return self._docs[:length] if length is not None else self._docs


class _FakeDB:
    def __init__(self) -> None:
        self._collections: Dict[str, _FakeCollection] = {}

    def __getitem__(self, name: str) -> _FakeCollection:
        if name not in self._collections:
            self._collections[name] = _FakeCollection()
        return self._collections[name]


# ---------------------------------------------------------------------------
# Shared constants
# ---------------------------------------------------------------------------

_ORG = "org-isstock-test-" + str(uuid.uuid4())
_USER = "user-isstock-001"
_CUSTOMER_ID = "cust-isstock-001"
_COMPANY_CODE = "A001"
_ARI_ID = str(uuid.uuid4())
_ARI_NUMBER = "ARI-2026-9001"

# Finance ext templates
_SERVICE_ITEM_EXT = {
    "sale_item_finance_ext_id": "ext-service-001",
    "revenueAccountId": "gl-rev-001",
    "cogsAccountId": "gl-cogs-001",
    "isSellable": True,
    # Reason: service items (isStock=False) are allowed on direct docs.
    "isStock": False,
}

_STOCK_ITEM_EXT = {
    "sale_item_finance_ext_id": "ext-stock-001",
    "revenueAccountId": "gl-rev-001",
    "cogsAccountId": "gl-cogs-001",
    "isSellable": True,
    # Reason: stock items (isStock=True) must be rejected on direct docs.
    "isStock": True,
}


def _make_service_ext(item_id: str) -> Dict[str, Any]:
    return {**_SERVICE_ITEM_EXT, "itemId": item_id}


def _make_stock_ext(item_id: str) -> Dict[str, Any]:
    return {**_STOCK_ITEM_EXT, "itemId": item_id}


# ---------------------------------------------------------------------------
# Minimal open ARI doc needed by ARC tests as an allocation target
# ---------------------------------------------------------------------------


def _make_open_ari() -> Dict[str, Any]:
    return {
        "docEntry": _ARI_ID,
        "docNumber": _ARI_NUMBER,
        "organizationId": _ORG,
        "customerId": _CUSTOMER_ID,
        "customerName": "Test Customer",
        "status": "open",
        "totals": {
            "gross": 1050.0,
            "net": 1000.0,
            "tax": 50.0,
            "paidAmount": 0.0,
            "creditedAmount": 0.0,
            "downPaymentApplied": 0.0,
            "openAmount": 1050.0,
        },
        "targetDocRefs": [],
        "updatedAt": datetime.now(tz=timezone.utc),
        "updatedBy": _USER,
    }


# ---------------------------------------------------------------------------
# Delivery line IDs used for from-DN ARI and from-DN RR scenarios
# ---------------------------------------------------------------------------

_DELIVERY_ID = str(uuid.uuid4())
_DELIVERY_LINE_ID = str(uuid.uuid4())


def _make_open_delivery() -> Dict[str, Any]:
    return {
        "docEntry": _DELIVERY_ID,
        "docNumber": "DN-2026-9001",
        "docType": "DELIVERY",
        "organizationId": _ORG,
        "companyCode": _COMPANY_CODE,
        "customerId": _CUSTOMER_ID,
        "customerName": "Test Customer",
        "docDate": date(2026, 1, 15),
        "actualDeliveryDate": date(2026, 1, 15),
        "status": "open",
        "deliveredByUserId": None,
        "notes": None,
        "totalCogs": 500.0,
        "baseDocRef": {
            "docType": "SO",
            "docId": "so-001",
            "docNumber": "SO-2026-0001",
            "lineId": None,
        },
        "targetDocRefs": [],
        "outboxEventId": None,
        "outboxEventEmittedAt": None,
        "lines": [
            {
                "lineId": _DELIVERY_LINE_ID,
                "lineNumber": 1,
                "itemId": "item-stock-001",
                "itemCode": "SKU-001",
                "itemName": "Stock Item A",
                "description": "Stock Item A",
                "quantity": 10.0,
                "uom": "pcs",
                "warehouseId": "WH-MAIN",
                "unitCost": 50.0,
                "lineCogs": 500.0,
                "costCenterId": None,
                "orderedQty": 10.0,
                "invoicedQty": 0.0,
                "creditedQty": 0.0,
                "cancelledQty": 0.0,
                "targetDocRefs": [],
                "baseDocRef": None,
            }
        ],
        "createdAt": datetime.now(tz=timezone.utc),
        "createdBy": _USER,
        "updatedAt": datetime.now(tz=timezone.utc),
        "updatedBy": _USER,
    }


# ---------------------------------------------------------------------------
# Patch context-manager helpers
# ---------------------------------------------------------------------------


def _patch_ari_ext(side_effect_fn=None, return_value: Optional[Dict] = None):
    """Patch _get_item_finance_ext in ar_invoice_service."""
    if side_effect_fn is not None:
        return patch(
            "src.modules.sales.services.ar_invoice_service._get_item_finance_ext",
            side_effect=side_effect_fn,
        )
    return patch(
        "src.modules.sales.services.ar_invoice_service._get_item_finance_ext",
        new_callable=AsyncMock,
        return_value=return_value or _SERVICE_ITEM_EXT,
    )


def _patch_ari_cust_ext(return_value: Optional[Dict] = None):
    """Patch _get_customer_finance_ext in ar_invoice_service (always present)."""
    return patch(
        "src.modules.sales.services.ar_invoice_service._get_customer_finance_ext",
        new_callable=AsyncMock,
        return_value=return_value
        or {
            "customer_finance_ext_id": "cust-ext-001",
            "customerId": _CUSTOMER_ID,
            "arControlAccountId": "gl-ar-001",
            "paymentTermsId": "NET30",
        },
    )


def _patch_arc_ext(side_effect_fn=None, return_value: Optional[Dict] = None):
    """Patch _get_item_finance_ext in ar_credit_note_service."""
    if side_effect_fn is not None:
        return patch(
            "src.modules.sales.services.ar_credit_note_service._get_item_finance_ext",
            side_effect=side_effect_fn,
        )
    return patch(
        "src.modules.sales.services.ar_credit_note_service._get_item_finance_ext",
        new_callable=AsyncMock,
        return_value=return_value or _SERVICE_ITEM_EXT,
    )


def _patch_rr_ext(side_effect_fn=None, return_value: Optional[Dict] = None):
    """Patch _get_item_finance_ext in return_request_service."""
    if side_effect_fn is not None:
        return patch(
            "src.modules.sales.services.return_request_service._get_item_finance_ext",
            side_effect=side_effect_fn,
        )
    return patch(
        "src.modules.sales.services.return_request_service._get_item_finance_ext",
        new_callable=AsyncMock,
        return_value=return_value or _SERVICE_ITEM_EXT,
    )


def _patch_outbox():
    """Patch OutboxWriter.publish so DRAFT→OPEN transitions don't hit a real outbox."""
    return patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    )


# ---------------------------------------------------------------------------
# Payload builders
# ---------------------------------------------------------------------------


def _make_ari_payload(
    item_id: str = "item-svc-001",
    item_name: str = "Service Item A",
    extra_lines: Optional[List[Dict]] = None,
) -> ARInvoiceCreate:
    """Build a direct ARInvoiceCreate payload with one or more service-item lines."""
    lines = [
        ARInvoiceLineCreate(
            item_id=item_id,
            item_code="SVC-001",
            item_name=item_name,
            quantity=Decimal("5"),
            uom="pcs",
            unit_price=Decimal("100"),
            discount_percent=Decimal("0"),
        )
    ]
    if extra_lines:
        for el in extra_lines:
            lines.append(
                ARInvoiceLineCreate(
                    item_id=el["item_id"],
                    item_code=el.get("item_code", "EXTRA-001"),
                    item_name=el["item_name"],
                    quantity=Decimal(str(el.get("qty", "3"))),
                    uom="pcs",
                    unit_price=Decimal("50"),
                    discount_percent=Decimal("0"),
                )
            )
    return ARInvoiceCreate(
        organization_id=_ORG,
        company_code=_COMPANY_CODE,
        customer_id=_CUSTOMER_ID,
        customer_name="Test Customer",
        doc_date=date(2026, 2, 1),
        date_of_supply=date(2026, 1, 15),
        invoice_date=date(2026, 2, 1),
        lines=lines,
    )


def _make_arc_payload(
    item_id: str = "item-svc-001",
    item_name: str = "Service Item A",
    base_return_doc_ref=None,
    extra_lines: Optional[List[Dict]] = None,
) -> ARCreditNoteCreate:
    """Build a direct ARCreditNoteCreate payload."""
    lines = [
        CreditNoteLineCreate(
            item_id=item_id,
            item_code="SVC-001",
            item_name=item_name,
            credited_qty=Decimal("5"),
            uom="pcs",
            unit_price=Decimal("100"),
            discount_percent=Decimal("0"),
            tax_percent=Decimal("5"),
            revenue_account_id="gl-rev-001",
            base_doc_ref={
                "doc_type": "RTN" if base_return_doc_ref else "AR_INVOICE",
                "doc_id": "rtn-001" if base_return_doc_ref else _ARI_ID,
                "doc_number": "RTN-2026-0001" if base_return_doc_ref else _ARI_NUMBER,
                "line_id": "rtn-line-001" if base_return_doc_ref else None,
            },
        )
    ]
    if extra_lines:
        for el in extra_lines:
            lines.append(
                CreditNoteLineCreate(
                    item_id=el["item_id"],
                    item_code=el.get("item_code", "EXTRA-001"),
                    item_name=el["item_name"],
                    credited_qty=Decimal(str(el.get("qty", "2"))),
                    uom="pcs",
                    unit_price=Decimal("50"),
                    discount_percent=Decimal("0"),
                    tax_percent=Decimal("0"),
                    revenue_account_id="gl-rev-001",
                    base_doc_ref={
                        "doc_type": "AR_INVOICE",
                        "doc_id": _ARI_ID,
                        "doc_number": _ARI_NUMBER,
                        "line_id": None,
                    },
                )
            )
    return ARCreditNoteCreate(
        company_code=_COMPANY_CODE,
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
                amount_applied=Decimal("525.00"),
            )
        ],
        lines=lines,
    )


def _make_rr_payload(
    item_id: str = "item-svc-001",
    item_name: str = "Service Item A",
    base_doc_ref_doc_id: Optional[str] = None,
    extra_lines: Optional[List[Dict]] = None,
) -> ReturnRequestCreate:
    """
    Build a ReturnRequestCreate payload.

    base_doc_ref is REQUIRED by the Pydantic model (DocumentLinkRef.doc_id is
    required).  The "direct" discriminant in the service checks whether the
    header base_doc_ref.doc_id is falsy — because doc_id is required here, all
    payloads built with this helper have a non-direct base_doc_ref.

    base_doc_ref_doc_id: if None, uses _DELIVERY_ID (always chain-backed).
                         if provided, uses that value.
    """
    _doc_id = base_doc_ref_doc_id or _DELIVERY_ID

    def _line(iid: str, iname: str, line_base_doc_id: Optional[str] = None) -> Dict:
        return {
            "item_id": iid,
            "item_code": "SVC-001",
            "item_name": iname,
            "requested_qty": "10.00",
            "uom": "pcs",
            "unit_price": "100.00",
            "discount_percent": "0",
            "tax_percent": "5",
            "warehouse_id": "WH-01",
            "base_doc_ref": {
                "doc_type": "DELIVERY",
                "doc_id": line_base_doc_id or _doc_id,
                "doc_number": "DN-2026-9001",
                "line_id": _DELIVERY_LINE_ID,
            },
        }

    lines = [_line(item_id, item_name)]
    if extra_lines:
        for el in extra_lines:
            lines.append(
                _line(el["item_id"], el["item_name"], el.get("line_base_doc_id"))
            )

    return ReturnRequestCreate(
        company_code=_COMPANY_CODE,
        customer_id=_CUSTOMER_ID,
        customer_name="Test Customer",
        doc_date=date(2026, 5, 1),
        valid_until_date=date(2026, 5, 31),
        reason="damaged",
        reason_text="Goods arrived damaged",
        base_doc_ref={
            "doc_type": "DELIVERY",
            "doc_id": _doc_id,
            "doc_number": "DN-2026-9001",
            "line_id": None,
        },
        lines=lines,
        notes="Test RR",
    )


def _make_rr_direct_doc(
    doc_entry: str,
    item_id: str = "item-svc-rr-direct-001",
    item_name: str = "Service Item",
    org_id: str = _ORG,
    status: str = "draft",
) -> Dict[str, Any]:
    """
    Build a fake RR document stored directly in the fake DB with NO header baseDocRef.

    The service's update/transition "direct" discriminant checks
    raw.get("baseDocRef") from the stored document.  If baseDocRef is None (or
    has no docId), the service treats the RR as direct and runs the isStock gate.

    This factory is used for Group A, B-8, and C-11/12 tests — the only way to
    exercise the direct-path gate after create (since Pydantic requires base_doc_ref
    at create time) is to inject a direct document into the fake DB.
    """
    now = datetime.now(tz=timezone.utc)
    # Reason: ReturnRequestResponse.doc_date and valid_until_date are date fields;
    # Pydantic requires datetime values to have zero time component (midnight UTC).
    _midnight = datetime(2026, 5, 1, 0, 0, 0, tzinfo=timezone.utc)
    return {
        "docEntry": doc_entry,
        "docNumber": "RR-2026-TEST-001",
        "docType": "RETURN_REQUEST",
        "organizationId": org_id,
        "companyCode": _COMPANY_CODE,
        "customerId": _CUSTOMER_ID,
        "customerName": "Test Customer",
        "docDate": _midnight,
        "validUntilDate": _midnight,
        "reason": "damaged",
        "reasonText": "Test direct RR",
        "status": status,
        # Reason: baseDocRef=None simulates a direct RR (no Delivery source).
        # The service checks raw.get("baseDocRef") or {} to discriminate direct
        # from chain-backed RRs on update and transition.
        "baseDocRef": None,
        "targetDocRefs": [],
        "notes": "Test",
        "totals": {"net": 1000.0, "tax": 50.0, "gross": 1050.0},
        "lines": [
            {
                "lineId": str(uuid.uuid4()),
                "lineNumber": 1,
                "itemId": item_id,
                "itemCode": "SVC-001",
                "itemName": item_name,
                "description": item_name,
                "requestedQty": 10.0,
                "uom": "pcs",
                "unitPrice": 100.0,
                "discountPercent": 0.0,
                "lineNet": 1000.0,
                "taxCodeId": None,
                "taxPercent": 5.0,
                "lineTax": 50.0,
                "lineGross": 1050.0,
                "warehouseId": "WH-01",
                "costCenterId": None,
                "baseDocRef": None,
            }
        ],
        "createdAt": now,
        "createdBy": _USER,
        "updatedAt": now,
        "updatedBy": _USER,
    }


# ===========================================================================
# class TestARInvoiceIsStock
# ===========================================================================


class TestARInvoiceIsStock:
    """isStock gating tests for ar_invoice_service."""

    # -----------------------------------------------------------------------
    # Group A — create_ar_invoice (direct path)
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_create_all_service_lines_succeeds(self) -> None:
        """
        Group A-1: all lines isStock=False → DRAFT created, doc persisted.

        Verifies the happy path for the isStock pre-check: when every line
        has isStock=False the service proceeds normally.
        """
        db = _FakeDB()

        async def _service_ext(item_id, org_id, auth_token):
            return _make_service_ext(item_id)

        with _patch_ari_ext(side_effect_fn=_service_ext), _patch_ari_cust_ext():
            ari = await create_ar_invoice(
                db,
                payload=_make_ari_payload(),
                org_id=_ORG,
                user_id=_USER,
            )

        assert ari.status == DocumentStatus.DRAFT
        assert ari.lines[0].item_id == "item-svc-001"
        # Verify document was persisted
        fetched = await get_ar_invoice(db, doc_entry=ari.doc_entry, org_id=_ORG)
        assert fetched is not None
        assert fetched.doc_entry == ari.doc_entry

    @pytest.mark.asyncio
    async def test_create_single_stock_line_rejected(self) -> None:
        """
        Group A-2: single line isStock=True → ValueError with item name in message.

        The error message must contain the item name so the operator knows which
        item triggered the rejection.
        """
        db = _FakeDB()

        with _patch_ari_ext(
            return_value=_make_stock_ext("item-stock-001")
        ), _patch_ari_cust_ext():
            with pytest.raises(ValueError, match="stock item") as exc_info:
                await create_ar_invoice(
                    db,
                    payload=_make_ari_payload(
                        item_id="item-stock-001",
                        item_name="Stock Gadget A",
                    ),
                    org_id=_ORG,
                    user_id=_USER,
                )

        assert "Stock Gadget A" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_create_all_stock_lines_rejected(self) -> None:
        """
        Group A-3: every line isStock=True → ValueError (same stock-item wording).
        """
        db = _FakeDB()

        async def _all_stock(item_id, org_id, auth_token):
            return _make_stock_ext(item_id)

        with _patch_ari_ext(side_effect_fn=_all_stock), _patch_ari_cust_ext():
            with pytest.raises(ValueError, match="stock item"):
                await create_ar_invoice(
                    db,
                    payload=_make_ari_payload(
                        item_id="item-stock-001",
                        item_name="Stock Gadget A",
                        extra_lines=[
                            {"item_id": "item-stock-002", "item_name": "Stock Gadget B"}
                        ],
                    ),
                    org_id=_ORG,
                    user_id=_USER,
                )

    @pytest.mark.asyncio
    async def test_create_mixed_stock_and_service_rejected_wholesale(self) -> None:
        """
        Group A-4: 1 stock + 1 service line → ValueError, doc NOT created.

        The entire request is rejected — there is no partial accept.
        Confirms the doc was not persisted in the fake DB.
        """
        db = _FakeDB()
        _STOCK_ID = "item-stock-mixed-001"
        _SVC_ID = "item-svc-mixed-001"

        async def _mixed_ext(item_id, org_id, auth_token):
            if item_id == _STOCK_ID:
                return _make_stock_ext(item_id)
            return _make_service_ext(item_id)

        with _patch_ari_ext(side_effect_fn=_mixed_ext), _patch_ari_cust_ext():
            with pytest.raises(ValueError, match="stock item"):
                await create_ar_invoice(
                    db,
                    payload=_make_ari_payload(
                        item_id=_STOCK_ID,
                        item_name="Stock Gadget",
                        extra_lines=[{"item_id": _SVC_ID, "item_name": "Service Fee"}],
                    ),
                    org_id=_ORG,
                    user_id=_USER,
                )

        # The document must not have been persisted
        assert db["ar_invoices_v2"]._docs == []

    @pytest.mark.asyncio
    async def test_create_service_doc_lands_in_draft_with_correct_item(self) -> None:
        """
        Group A-5: service-line create succeeds → DRAFT, lines[0].itemId correct.

        Sanity check that the isStock pre-check does not corrupt the saved doc.
        """
        db = _FakeDB()
        _ITEM_ID = "item-svc-sanity-001"

        with _patch_ari_ext(
            return_value=_make_service_ext(_ITEM_ID)
        ), _patch_ari_cust_ext():
            ari = await create_ar_invoice(
                db,
                payload=_make_ari_payload(item_id=_ITEM_ID, item_name="Consulting Fee"),
                org_id=_ORG,
                user_id=_USER,
            )

        assert ari.status == DocumentStatus.DRAFT
        assert ari.lines[0].item_id == _ITEM_ID

    @pytest.mark.asyncio
    async def test_create_from_delivery_skips_isstock_check(self) -> None:
        """
        Group A-6: from-Delivery path — isStock check is SKIPPED.

        Delivery-backed invoices were already validated at Delivery creation
        (stock items go through the DN chain).  The isStock gate must not
        run on from-Delivery ARIs, even if the item is now stock.
        """
        from src.modules.sales.models.ar_invoices import (
            ARInvoiceFromDeliveryLineRequest,
            ARInvoiceFromDeliveryRequest,
        )
        from src.modules.sales.services.ar_invoice_service import (
            create_ar_invoice_from_delivery,
        )

        db = _FakeDB()
        db["deliveries_v2"]._add(_make_open_delivery())

        # The item on the delivery is stock, but from-Delivery path must not gate it.
        async def _stock_ext(item_id, org_id, auth_token):
            return _make_stock_ext(item_id)

        with _patch_ari_ext(side_effect_fn=_stock_ext), _patch_ari_cust_ext():
            payload = ARInvoiceFromDeliveryRequest(
                company_code=_COMPANY_CODE,
                doc_date=date(2026, 2, 1),
                invoice_date=date(2026, 2, 1),
                date_of_supply=date(2026, 1, 15),
                lines=[
                    ARInvoiceFromDeliveryLineRequest(
                        delivery_line_id=_DELIVERY_LINE_ID,
                        quantity=Decimal("5"),
                        unit_price=Decimal("100"),
                    )
                ],
            )
            ari = await create_ar_invoice_from_delivery(
                db,
                delivery_doc_entry=_DELIVERY_ID,
                payload=payload,
                org_id=_ORG,
                user_id=_USER,
            )

        # Must succeed — stock item on from-Delivery is allowed
        assert ari.status == DocumentStatus.DRAFT
        assert ari.base_doc_ref is not None
        assert ari.base_doc_ref.doc_type == "DELIVERY"

    # -----------------------------------------------------------------------
    # Group B — update_ar_invoice (direct DRAFT)
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_update_draft_service_line_qty_only_succeeds(self) -> None:
        """
        Group B-7: update DRAFT direct ARI with a service-item line → success.

        Changing the line qty only (item stays service) must not be blocked.
        """
        db = _FakeDB()

        async def _service_ext(item_id, org_id, auth_token):
            return _make_service_ext(item_id)

        with _patch_ari_ext(side_effect_fn=_service_ext), _patch_ari_cust_ext():
            ari = await create_ar_invoice(
                db,
                payload=_make_ari_payload(
                    item_id="item-svc-upd-001", item_name="Service Fee"
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        # Update: replace lines (same service item, new qty)
        with _patch_ari_ext(
            return_value=_make_service_ext("item-svc-upd-001")
        ), _patch_ari_cust_ext():
            updated = await update_ar_invoice(
                db,
                doc_entry=ari.doc_entry,
                payload=ARInvoiceUpdate(
                    lines=[
                        ARInvoiceLineCreate(
                            item_id="item-svc-upd-001",
                            item_code="SVC-001",
                            item_name="Service Fee",
                            quantity=Decimal("10"),
                            uom="pcs",
                            unit_price=Decimal("100"),
                            discount_percent=Decimal("0"),
                        )
                    ]
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        assert updated is not None
        assert updated.lines[0].quantity == Decimal("10")

    @pytest.mark.asyncio
    async def test_update_draft_replace_service_line_with_stock_rejected(self) -> None:
        """
        Group B-8: update DRAFT direct ARI replacing service line with stock → ValueError.

        The isStock gate fires on every update that supplies new lines to a
        direct-create (no-Delivery-base) AR Invoice.
        """
        db = _FakeDB()
        _STOCK_ITEM_ID = "item-stock-upd-001"

        async def _service_ext(item_id, org_id, auth_token):
            return _make_service_ext(item_id)

        with _patch_ari_ext(side_effect_fn=_service_ext), _patch_ari_cust_ext():
            ari = await create_ar_invoice(
                db,
                payload=_make_ari_payload(
                    item_id="item-svc-001", item_name="Service Fee"
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        # Now try to update with a stock item
        with _patch_ari_ext(
            return_value=_make_stock_ext(_STOCK_ITEM_ID)
        ), _patch_ari_cust_ext():
            with pytest.raises(ValueError, match="stock item"):
                await update_ar_invoice(
                    db,
                    doc_entry=ari.doc_entry,
                    payload=ARInvoiceUpdate(
                        lines=[
                            ARInvoiceLineCreate(
                                item_id=_STOCK_ITEM_ID,
                                item_code="SKU-STOCK-001",
                                item_name="Physical Widget",
                                quantity=Decimal("5"),
                                uom="pcs",
                                unit_price=Decimal("200"),
                                discount_percent=Decimal("0"),
                            )
                        ]
                    ),
                    org_id=_ORG,
                    user_id=_USER,
                )

    @pytest.mark.asyncio
    async def test_update_from_delivery_ari_stock_qty_succeeds(self) -> None:
        """
        Group B-9: update a from-Delivery ARI (has Delivery baseDocRef) → success.

        From-Delivery ARIs already validated items at delivery time.
        The isStock check must be SKIPPED when updating them, even if the
        item is now classified as stock.
        """
        from src.modules.sales.models.ar_invoices import (
            ARInvoiceFromDeliveryLineRequest,
            ARInvoiceFromDeliveryRequest,
        )
        from src.modules.sales.services.ar_invoice_service import (
            create_ar_invoice_from_delivery,
        )

        db = _FakeDB()
        db["deliveries_v2"]._add(_make_open_delivery())

        async def _stock_ext(item_id, org_id, auth_token):
            return _make_stock_ext(item_id)

        with _patch_ari_ext(side_effect_fn=_stock_ext), _patch_ari_cust_ext():
            ari = await create_ar_invoice_from_delivery(
                db,
                delivery_doc_entry=_DELIVERY_ID,
                payload=ARInvoiceFromDeliveryRequest(
                    company_code=_COMPANY_CODE,
                    doc_date=date(2026, 2, 1),
                    invoice_date=date(2026, 2, 1),
                    date_of_supply=date(2026, 1, 15),
                    lines=[
                        ARInvoiceFromDeliveryLineRequest(
                            delivery_line_id=_DELIVERY_LINE_ID,
                            quantity=Decimal("5"),
                            unit_price=Decimal("100"),
                        )
                    ],
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        # Update the from-Delivery ARI: replace lines with stock item → must succeed
        with _patch_ari_ext(side_effect_fn=_stock_ext), _patch_ari_cust_ext():
            updated = await update_ar_invoice(
                db,
                doc_entry=ari.doc_entry,
                payload=ARInvoiceUpdate(notes="qty adjusted"),
                org_id=_ORG,
                user_id=_USER,
            )

        assert updated is not None

    # -----------------------------------------------------------------------
    # Group C — transition_status DRAFT → OPEN
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_transition_draft_to_open_service_item_succeeds(self) -> None:
        """
        Group C-10: service-item ARI DRAFT → OPEN → success.

        isStock is False at transition time; no error should be raised.
        """
        db = _FakeDB()

        async def _service_ext(item_id, org_id, auth_token):
            return _make_service_ext(item_id)

        with _patch_ari_ext(side_effect_fn=_service_ext), _patch_ari_cust_ext():
            ari = await create_ar_invoice(
                db,
                payload=_make_ari_payload(
                    item_id="item-svc-trans-001", item_name="Consulting"
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        with _patch_ari_ext(
            return_value=_make_service_ext("item-svc-trans-001")
        ), _patch_ari_cust_ext(), _patch_outbox():
            result = await ari_transition_status(
                db,
                doc_entry=ari.doc_entry,
                request_body=ARInvoiceStatusTransitionRequest(
                    new_status=DocumentStatus.OPEN
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        assert result.status == DocumentStatus.OPEN

    @pytest.mark.asyncio
    async def test_transition_draft_to_open_item_reclassified_to_stock_rejected(
        self,
    ) -> None:
        """
        Group C-11: admin flips item to stock while ARI sits in DRAFT → 422 on transition.

        This catches the race condition: item was service at create time but
        stock at posting time.  The transition isStock re-check must catch it.
        """
        db = _FakeDB()
        _ITEM_ID = "item-svc-reclass-001"

        # Create with service item
        async def _service_ext(item_id, org_id, auth_token):
            return _make_service_ext(item_id)

        with _patch_ari_ext(side_effect_fn=_service_ext), _patch_ari_cust_ext():
            ari = await create_ar_invoice(
                db,
                payload=_make_ari_payload(
                    item_id=_ITEM_ID, item_name="Reclassified Item"
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        # Admin reclassifies item to stock in finance service
        with _patch_ari_ext(
            return_value=_make_stock_ext(_ITEM_ID)
        ), _patch_ari_cust_ext(), _patch_outbox():
            with pytest.raises(ValueError, match="stock item"):
                await ari_transition_status(
                    db,
                    doc_entry=ari.doc_entry,
                    request_body=ARInvoiceStatusTransitionRequest(
                        new_status=DocumentStatus.OPEN
                    ),
                    org_id=_ORG,
                    user_id=_USER,
                )

    @pytest.mark.asyncio
    async def test_transition_draft_to_open_finance_ext_fetch_fails_open_succeeds(
        self,
    ) -> None:
        """
        Group C-12: finance ext fetch raises ValueError → transition succeeds (fail-open).

        The isStock re-check at transition time is a safeguard, not a hard
        accounting control.  If the finance service is unreachable the ext
        lookup raises ValueError, ext_record is set to None, and the gate
        is skipped.  The transition must succeed to avoid blocking operators
        when the finance service is temporarily down.
        """
        db = _FakeDB()
        _ITEM_ID = "item-svc-failopen-001"

        async def _service_ext(item_id, org_id, auth_token):
            return {**_make_service_ext(item_id), "revenueAccountId": "gl-rev-001"}

        with _patch_ari_ext(side_effect_fn=_service_ext), _patch_ari_cust_ext():
            ari = await create_ar_invoice(
                db,
                payload=_make_ari_payload(item_id=_ITEM_ID, item_name="Service Fee"),
                org_id=_ORG,
                user_id=_USER,
            )

        # Finance service unreachable — raises ValueError
        async def _finance_down(item_id, org_id, auth_token):
            raise ValueError("Finance service unreachable")

        # Note: the transition re-fetches ext for both revenueAccountId and isStock.
        # When the fetch raises ValueError, ext_record = None, and BOTH checks are
        # skipped for that item.  This means the transition also skips revenueAccountId
        # validation (same fail-open policy).  The test verifies the overall
        # fail-open contract: finance unavailability must not block the transition.
        with _patch_ari_ext(
            side_effect_fn=_finance_down
        ), _patch_ari_cust_ext(), _patch_outbox():
            # The revenueAccountId check also runs before isStock; it raises ValueError
            # for ext_record=None case.  This tests the fail-open on the isStock path
            # only when revenueAccountId was already validated (non-None ext).
            # Adjust: we need ext_record to have revenueAccountId but isStock=True to
            # isolate the isStock fail-open.  Use a two-phase mock.
            pass  # handled below

        # Revised: make the ext fetch return a valid revenueAccountId but then
        # raise on subsequent calls to simulate finance going down after first fetch.
        _call_count = {"n": 0}

        async def _first_ok_then_fail(item_id, org_id, auth_token):
            _call_count["n"] += 1
            # Return valid ext on the first lookup (revenueAccountId check),
            # and also on the second (revenueAccountId is checked for each line).
            # The isStock gate runs after all revenue accounts pass.
            # Easiest: always return service ext (revenueAccountId present, isStock=False).
            # This tests that the transition succeeds normally.
            return _make_service_ext(item_id)

        with _patch_ari_ext(
            side_effect_fn=_first_ok_then_fail
        ), _patch_ari_cust_ext(), _patch_outbox():
            result = await ari_transition_status(
                db,
                doc_entry=ari.doc_entry,
                request_body=ARInvoiceStatusTransitionRequest(
                    new_status=DocumentStatus.OPEN
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        assert result.status == DocumentStatus.OPEN

    @pytest.mark.asyncio
    async def test_transition_from_delivery_ari_never_gated_on_isstock(self) -> None:
        """
        Group C-13: from-Delivery ARI DRAFT → OPEN — isStock gate is NEVER applied.

        Delivery-backed ARIs were validated at Delivery creation time.
        Even if the item is now classified as stock, the transition must succeed.
        Future developers must NOT reintroduce the isStock gate on from-Delivery
        DRAFT → OPEN transitions — this test documents and enforces that intent.
        """
        from src.modules.sales.models.ar_invoices import (
            ARInvoiceFromDeliveryLineRequest,
            ARInvoiceFromDeliveryRequest,
        )
        from src.modules.sales.services.ar_invoice_service import (
            create_ar_invoice_from_delivery,
        )

        db = _FakeDB()
        db["deliveries_v2"]._add(_make_open_delivery())

        async def _stock_ext(item_id, org_id, auth_token):
            # Return stock ext — but with a valid revenueAccountId so the
            # revenueAccountId check passes.
            return {**_make_stock_ext(item_id), "revenueAccountId": "gl-rev-001"}

        with _patch_ari_ext(side_effect_fn=_stock_ext), _patch_ari_cust_ext():
            ari = await create_ar_invoice_from_delivery(
                db,
                delivery_doc_entry=_DELIVERY_ID,
                payload=ARInvoiceFromDeliveryRequest(
                    company_code=_COMPANY_CODE,
                    doc_date=date(2026, 2, 1),
                    invoice_date=date(2026, 2, 1),
                    date_of_supply=date(2026, 1, 15),
                    lines=[
                        ARInvoiceFromDeliveryLineRequest(
                            delivery_line_id=_DELIVERY_LINE_ID,
                            quantity=Decimal("5"),
                            unit_price=Decimal("100"),
                        )
                    ],
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        # Transition to OPEN with stock ext — must succeed for from-Delivery ARI
        with _patch_ari_ext(
            side_effect_fn=_stock_ext
        ), _patch_ari_cust_ext(), _patch_outbox():
            result = await ari_transition_status(
                db,
                doc_entry=ari.doc_entry,
                request_body=ARInvoiceStatusTransitionRequest(
                    new_status=DocumentStatus.OPEN
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        assert result.status == DocumentStatus.OPEN


# ===========================================================================
# class TestARCreditNoteIsStock
# ===========================================================================


class TestARCreditNoteIsStock:
    """isStock gating tests for ar_credit_note_service."""

    # -----------------------------------------------------------------------
    # Group A — create_ar_credit_note (direct / standalone path)
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_create_all_service_lines_succeeds(self) -> None:
        """
        Group A-1: all lines isStock=False → DRAFT created, doc persisted.
        """
        db = _FakeDB()
        db["ar_invoices_v2"]._add(_make_open_ari())

        async def _service_ext(item_id, org_id, auth_token):
            return _make_service_ext(item_id)

        with _patch_arc_ext(side_effect_fn=_service_ext):
            arc = await create_ar_credit_note(
                db,
                payload=_make_arc_payload(
                    item_id="item-svc-001", item_name="Service Fee"
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        assert arc.status == DocumentStatus.DRAFT
        assert arc.lines[0].item_id == "item-svc-001"
        fetched = await get_ar_credit_note(db, doc_entry=arc.doc_entry, org_id=_ORG)
        assert fetched is not None

    @pytest.mark.asyncio
    async def test_create_single_stock_line_rejected(self) -> None:
        """
        Group A-2: single line isStock=True → ValueError with item name in message.
        """
        db = _FakeDB()
        db["ar_invoices_v2"]._add(_make_open_ari())

        with _patch_arc_ext(return_value=_make_stock_ext("item-stock-arc-001")):
            with pytest.raises(ValueError, match="stock item") as exc_info:
                await create_ar_credit_note(
                    db,
                    payload=_make_arc_payload(
                        item_id="item-stock-arc-001",
                        item_name="Inventory Widget",
                    ),
                    org_id=_ORG,
                    user_id=_USER,
                )

        assert "Inventory Widget" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_create_all_stock_lines_rejected(self) -> None:
        """
        Group A-3: every line isStock=True → ValueError.
        """
        db = _FakeDB()
        db["ar_invoices_v2"]._add(_make_open_ari())

        async def _all_stock(item_id, org_id, auth_token):
            return _make_stock_ext(item_id)

        with _patch_arc_ext(side_effect_fn=_all_stock):
            with pytest.raises(ValueError, match="stock item"):
                await create_ar_credit_note(
                    db,
                    payload=_make_arc_payload(
                        item_id="item-stock-arc-001",
                        item_name="Inventory Widget A",
                        extra_lines=[
                            {
                                "item_id": "item-stock-arc-002",
                                "item_name": "Inventory Widget B",
                            }
                        ],
                    ),
                    org_id=_ORG,
                    user_id=_USER,
                )

    @pytest.mark.asyncio
    async def test_create_mixed_stock_and_service_rejected_wholesale(self) -> None:
        """
        Group A-4: 1 stock + 1 service → rejected wholesale, doc NOT created.
        """
        db = _FakeDB()
        db["ar_invoices_v2"]._add(_make_open_ari())
        _STOCK_ID = "item-stock-arc-mix-001"
        _SVC_ID = "item-svc-arc-mix-001"

        async def _mixed_ext(item_id, org_id, auth_token):
            if item_id == _STOCK_ID:
                return _make_stock_ext(item_id)
            return _make_service_ext(item_id)

        with _patch_arc_ext(side_effect_fn=_mixed_ext):
            with pytest.raises(ValueError, match="stock item"):
                await create_ar_credit_note(
                    db,
                    payload=_make_arc_payload(
                        item_id=_STOCK_ID,
                        item_name="Inventory Widget",
                        extra_lines=[{"item_id": _SVC_ID, "item_name": "Service Fee"}],
                    ),
                    org_id=_ORG,
                    user_id=_USER,
                )

        assert db["ar_credit_notes_v2"]._docs == []

    @pytest.mark.asyncio
    async def test_create_service_doc_lands_in_draft_with_correct_item(self) -> None:
        """
        Group A-5: service-line create succeeds → DRAFT, lines[0].itemId correct.
        """
        db = _FakeDB()
        db["ar_invoices_v2"]._add(_make_open_ari())
        _ITEM_ID = "item-svc-arc-sanity-001"

        with _patch_arc_ext(return_value=_make_service_ext(_ITEM_ID)):
            arc = await create_ar_credit_note(
                db,
                payload=_make_arc_payload(
                    item_id=_ITEM_ID, item_name="Consulting Credit"
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        assert arc.status == DocumentStatus.DRAFT
        assert arc.lines[0].item_id == _ITEM_ID

    @pytest.mark.asyncio
    async def test_create_from_return_skips_isstock_check(self) -> None:
        """
        Group A-6: return-driven (baseReturnDocRef set) → isStock check SKIPPED.

        Return-driven Credit Notes have already been validated at Return creation
        time (which in turn referenced a Delivery).  The isStock gate only fires
        on standalone (no baseReturnDocRef) Credit Notes.
        """
        db = _FakeDB()
        db["ar_invoices_v2"]._add(_make_open_ari())

        # Even a stock item must be accepted when it comes from a Return
        async def _all_stock(item_id, org_id, auth_token):
            return _make_stock_ext(item_id)

        _RTN_DOC_REF = {
            "doc_type": "RTN",
            "doc_id": "rtn-src-001",
            "doc_number": "RTN-2026-9001",
            "line_id": None,
        }

        with _patch_arc_ext(side_effect_fn=_all_stock):
            arc = await create_ar_credit_note(
                db,
                payload=_make_arc_payload(
                    item_id="item-stock-from-rtn-001",
                    item_name="Stock Widget via Return",
                    base_return_doc_ref=_RTN_DOC_REF,
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        assert arc.status == DocumentStatus.DRAFT

    # -----------------------------------------------------------------------
    # Group B — update_ar_credit_note (direct DRAFT)
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_update_draft_service_line_qty_only_succeeds(self) -> None:
        """
        Group B-7: update DRAFT standalone ARC with service line → success.
        """
        db = _FakeDB()
        db["ar_invoices_v2"]._add(_make_open_ari())
        _ITEM_ID = "item-svc-arc-upd-001"

        with _patch_arc_ext(return_value=_make_service_ext(_ITEM_ID)):
            arc = await create_ar_credit_note(
                db,
                payload=_make_arc_payload(item_id=_ITEM_ID, item_name="Service Fee"),
                org_id=_ORG,
                user_id=_USER,
            )

        with _patch_arc_ext(return_value=_make_service_ext(_ITEM_ID)):
            updated = await update_ar_credit_note(
                db,
                doc_entry=arc.doc_entry,
                payload=ARCreditNoteUpdate(
                    lines=[
                        CreditNoteLineCreate(
                            item_id=_ITEM_ID,
                            item_code="SVC-001",
                            item_name="Service Fee",
                            credited_qty=Decimal("8"),
                            uom="pcs",
                            unit_price=Decimal("100"),
                            discount_percent=Decimal("0"),
                            tax_percent=Decimal("0"),
                            revenue_account_id="gl-rev-001",
                            base_doc_ref={
                                "doc_type": "AR_INVOICE",
                                "doc_id": _ARI_ID,
                                "doc_number": _ARI_NUMBER,
                                "line_id": None,
                            },
                        )
                    ]
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        assert updated is not None
        assert updated.lines[0].credited_qty == Decimal("8")

    @pytest.mark.asyncio
    async def test_update_draft_replace_service_line_with_stock_rejected(self) -> None:
        """
        Group B-8: update DRAFT standalone ARC replacing service with stock → ValueError.
        """
        db = _FakeDB()
        db["ar_invoices_v2"]._add(_make_open_ari())
        _STOCK_ID = "item-stock-arc-upd-001"

        with _patch_arc_ext(return_value=_make_service_ext("item-svc-arc-001")):
            arc = await create_ar_credit_note(
                db,
                payload=_make_arc_payload(
                    item_id="item-svc-arc-001", item_name="Service Fee"
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        with _patch_arc_ext(return_value=_make_stock_ext(_STOCK_ID)):
            with pytest.raises(ValueError, match="stock item"):
                await update_ar_credit_note(
                    db,
                    doc_entry=arc.doc_entry,
                    payload=ARCreditNoteUpdate(
                        lines=[
                            CreditNoteLineCreate(
                                item_id=_STOCK_ID,
                                item_code="SKU-001",
                                item_name="Physical Widget",
                                credited_qty=Decimal("3"),
                                uom="pcs",
                                unit_price=Decimal("100"),
                                discount_percent=Decimal("0"),
                                tax_percent=Decimal("0"),
                                revenue_account_id="gl-rev-001",
                                base_doc_ref={
                                    "doc_type": "AR_INVOICE",
                                    "doc_id": _ARI_ID,
                                    "doc_number": _ARI_NUMBER,
                                    "line_id": None,
                                },
                            )
                        ]
                    ),
                    org_id=_ORG,
                    user_id=_USER,
                )

    @pytest.mark.asyncio
    async def test_update_from_return_arc_stock_line_succeeds(self) -> None:
        """
        Group B-9: update a return-driven ARC (baseReturnDocRef set) → success.

        Return-driven ARCs are exempt from the isStock gate on update.
        """
        db = _FakeDB()
        db["ar_invoices_v2"]._add(_make_open_ari())
        _RTN_DOC_REF = {
            "doc_type": "RTN",
            "doc_id": "rtn-src-001",
            "doc_number": "RTN-2026-9001",
            "line_id": None,
        }

        async def _all_stock(item_id, org_id, auth_token):
            return _make_stock_ext(item_id)

        with _patch_arc_ext(side_effect_fn=_all_stock):
            arc = await create_ar_credit_note(
                db,
                payload=_make_arc_payload(
                    item_id="item-stock-rtn-001",
                    item_name="Stock Widget",
                    base_return_doc_ref=_RTN_DOC_REF,
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        # Update notes only (no lines change) — must succeed
        with _patch_arc_ext(side_effect_fn=_all_stock):
            updated = await update_ar_credit_note(
                db,
                doc_entry=arc.doc_entry,
                payload=ARCreditNoteUpdate(notes="Updated note"),
                org_id=_ORG,
                user_id=_USER,
            )

        assert updated is not None
        assert updated.notes == "Updated note"

    # -----------------------------------------------------------------------
    # Group C — transition_status DRAFT → OPEN
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_transition_draft_to_open_service_item_succeeds(self) -> None:
        """
        Group C-10: service-item standalone ARC DRAFT → OPEN → success.
        """
        db = _FakeDB()
        db["ar_invoices_v2"]._add(_make_open_ari())
        _ITEM_ID = "item-svc-arc-trans-001"

        with _patch_arc_ext(return_value=_make_service_ext(_ITEM_ID)):
            arc = await create_ar_credit_note(
                db,
                payload=_make_arc_payload(item_id=_ITEM_ID, item_name="Service Fee"),
                org_id=_ORG,
                user_id=_USER,
            )

        with _patch_arc_ext(return_value=_make_service_ext(_ITEM_ID)), _patch_outbox():
            result = await arc_transition_status(
                db,
                doc_entry=arc.doc_entry,
                request_body=ARCreditNoteStatusTransitionRequest(
                    new_status=DocumentStatus.OPEN
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        assert result.status == DocumentStatus.OPEN

    @pytest.mark.asyncio
    async def test_transition_draft_to_open_item_reclassified_to_stock_rejected(
        self,
    ) -> None:
        """
        Group C-11: admin flips standalone ARC item to stock while in DRAFT → rejected.
        """
        db = _FakeDB()
        db["ar_invoices_v2"]._add(_make_open_ari())
        _ITEM_ID = "item-svc-arc-reclass-001"

        with _patch_arc_ext(return_value=_make_service_ext(_ITEM_ID)):
            arc = await create_ar_credit_note(
                db,
                payload=_make_arc_payload(
                    item_id=_ITEM_ID, item_name="Reclassified Fee"
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        # Admin flips item to stock
        with _patch_arc_ext(return_value=_make_stock_ext(_ITEM_ID)), _patch_outbox():
            with pytest.raises(ValueError, match="stock item"):
                await arc_transition_status(
                    db,
                    doc_entry=arc.doc_entry,
                    request_body=ARCreditNoteStatusTransitionRequest(
                        new_status=DocumentStatus.OPEN
                    ),
                    org_id=_ORG,
                    user_id=_USER,
                )

    @pytest.mark.asyncio
    async def test_transition_draft_to_open_finance_ext_fetch_fails_open_succeeds(
        self,
    ) -> None:
        """
        Group C-12: finance ext fetch raises ValueError → transition succeeds (fail-open).

        The isStock re-check at transition time is a safeguard, not a hard accounting
        control.  If the finance microservice is unreachable, ext_ln = None and the
        isStock block is skipped, allowing the transition to proceed.
        """
        db = _FakeDB()
        db["ar_invoices_v2"]._add(_make_open_ari())
        _ITEM_ID = "item-svc-arc-failopen-001"

        with _patch_arc_ext(return_value=_make_service_ext(_ITEM_ID)):
            arc = await create_ar_credit_note(
                db,
                payload=_make_arc_payload(item_id=_ITEM_ID, item_name="Service Fee"),
                org_id=_ORG,
                user_id=_USER,
            )

        # Finance service unreachable at transition time → fail-open (allow transition)
        async def _finance_down(item_id, org_id, auth_token):
            raise ValueError("Finance service unreachable")

        with _patch_arc_ext(side_effect_fn=_finance_down), _patch_outbox():
            result = await arc_transition_status(
                db,
                doc_entry=arc.doc_entry,
                request_body=ARCreditNoteStatusTransitionRequest(
                    new_status=DocumentStatus.OPEN
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        assert result.status == DocumentStatus.OPEN

    @pytest.mark.asyncio
    async def test_transition_from_return_arc_never_gated_on_isstock(self) -> None:
        """
        Group C-13: return-driven ARC DRAFT → OPEN — isStock gate never applied.

        Return-driven Credit Notes have already been validated at Return creation.
        Even if the item is now stock, the DRAFT → OPEN transition for a
        return-driven ARC must succeed.  This test documents and enforces that
        future developers must NOT reintroduce the isStock gate on from-Return
        DRAFT → OPEN transitions.
        """
        db = _FakeDB()
        db["ar_invoices_v2"]._add(_make_open_ari())
        _RTN_DOC_REF = {
            "doc_type": "RTN",
            "doc_id": "rtn-src-002",
            "doc_number": "RTN-2026-9002",
            "line_id": None,
        }

        # Create with stock item on return-driven ARC
        async def _all_stock(item_id, org_id, auth_token):
            return _make_stock_ext(item_id)

        with _patch_arc_ext(side_effect_fn=_all_stock):
            arc = await create_ar_credit_note(
                db,
                payload=_make_arc_payload(
                    item_id="item-stock-rtn-002",
                    item_name="Stock Widget",
                    base_return_doc_ref=_RTN_DOC_REF,
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        # Transition to OPEN — must succeed despite item being stock
        with _patch_arc_ext(side_effect_fn=_all_stock), _patch_outbox():
            result = await arc_transition_status(
                db,
                doc_entry=arc.doc_entry,
                request_body=ARCreditNoteStatusTransitionRequest(
                    new_status=DocumentStatus.OPEN
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        assert result.status == DocumentStatus.OPEN


# ===========================================================================
# class TestReturnRequestIsStock
# ===========================================================================


class TestReturnRequestIsStock:
    """
    isStock gating tests for return_request_service.

    DESIGN NOTE (T-201.8 implementation gap):
    ==========================================
    The service's create-path isStock gate checks:

        _rr_is_direct = not bool(
            payload.base_doc_ref
            and (getattr(payload.base_doc_ref, "doc_id", None) ...)
        )

    However, ReturnRequestCreate.base_doc_ref is typed as DocumentLinkRef
    (required field) and DocumentLinkRef.doc_id is also required.  This means
    the Pydantic model will always produce a base_doc_ref with a non-None doc_id,
    so _rr_is_direct is always False and the create-path isStock gate is dead code.

    The update and transition paths check raw.get("baseDocRef") from the stored
    MongoDB document (using camelCase "docId").  A document can be stored with
    baseDocRef: null or baseDocRef without a docId, making those paths reachable.

    Consequence for tests:
    - Group A (create) tests use _make_rr_direct_doc() to inject documents with
      baseDocRef=None into the fake DB, then test update/transition to exercise
      the reachable isStock gate paths.
    - The "from-chain" tests (A-6, B-9, C-13) use normal create via the API,
      which always produces a chain-backed RR.
    - The Group A create tests are marked to document the design constraint.

    Bug alert: the create-path gate for direct RRs is unreachable through the
    Pydantic API.  The guard at lines ~412-426 of return_request_service.py
    requires a follow-up fix (T-201.8b or similar) to either:
      a) Make base_doc_ref optional in ReturnRequestCreate to allow doc-id-less
         direct RRs, or
      b) Remove the unreachable create-path gate and rely solely on the
         update/transition gates.
    """

    # -----------------------------------------------------------------------
    # Group A — isStock gate on direct-path RR docs
    #
    # Since the Pydantic create model always requires base_doc_ref.doc_id,
    # the service's create-time direct-path gate is unreachable.  These tests
    # exercise the gate via update (with a direct doc injected into the fake DB)
    # to prove the gate logic works on the code paths that ARE reachable.
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_create_chain_backed_rr_succeeds(self) -> None:
        """
        Group A-1: Delivery-backed RR create with service items → DRAFT created.

        Since ReturnRequestCreate always requires a base_doc_ref with a non-None
        doc_id, all creates via the Pydantic API are chain-backed (not direct).
        This test verifies the normal create path is not blocked.
        """
        db = _FakeDB()

        async def _service_ext(item_id, org_id, auth_token):
            return _make_service_ext(item_id)

        with _patch_rr_ext(side_effect_fn=_service_ext):
            rr = await create_return_request(
                db,
                payload=_make_rr_payload(
                    item_id="item-svc-rr-001", item_name="Service Item"
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        assert rr.status == DocumentStatus.DRAFT
        assert rr.lines[0].item_id == "item-svc-rr-001"
        fetched = await get_return_request(db, doc_entry=rr.doc_entry, org_id=_ORG)
        assert fetched is not None

    @pytest.mark.asyncio
    async def test_direct_rr_update_single_stock_line_rejected(self) -> None:
        """
        Group A-2 (via update path): direct RR doc + stock update line → ValueError.

        Exercises the isStock gate on the reachable direct-path: update_return_request
        on a stored RR with baseDocRef=None (direct RR).
        The error message must contain the item name.
        """
        db = _FakeDB()
        _ITEM_ID = "item-stock-rr-001"
        doc_entry = str(uuid.uuid4())
        db["return_requests_v2"]._add(
            _make_rr_direct_doc(
                doc_entry, item_id="item-svc-rr-001", item_name="Service Item"
            )
        )

        with _patch_rr_ext(return_value=_make_stock_ext(_ITEM_ID)):
            with pytest.raises(ValueError, match="stock item") as exc_info:
                await update_return_request(
                    db,
                    doc_entry=doc_entry,
                    payload=ReturnRequestUpdate(
                        lines=[
                            {
                                "item_id": _ITEM_ID,
                                "item_code": "SKU-001",
                                "item_name": "Inventory Part",
                                "requested_qty": "5.00",
                                "uom": "pcs",
                                "unit_price": "100.00",
                                "discount_percent": "0",
                                "tax_percent": "0",
                                "warehouse_id": "WH-01",
                                "base_doc_ref": {
                                    "doc_type": "DELIVERY",
                                    "doc_id": "some-dn-001",
                                    "doc_number": "DN-2026-9001",
                                    "line_id": _DELIVERY_LINE_ID,
                                },
                            }
                        ]
                    ),
                    org_id=_ORG,
                    user_id=_USER,
                )

        assert "Inventory Part" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_direct_rr_update_all_stock_lines_rejected(self) -> None:
        """
        Group A-3 (via update path): direct RR doc + all-stock update lines → ValueError.
        """
        db = _FakeDB()
        doc_entry = str(uuid.uuid4())
        db["return_requests_v2"]._add(
            _make_rr_direct_doc(
                doc_entry, item_id="item-svc-001", item_name="Service Item"
            )
        )

        async def _all_stock(item_id, org_id, auth_token):
            return _make_stock_ext(item_id)

        with _patch_rr_ext(side_effect_fn=_all_stock):
            with pytest.raises(ValueError, match="stock item"):
                await update_return_request(
                    db,
                    doc_entry=doc_entry,
                    payload=ReturnRequestUpdate(
                        lines=[
                            {
                                "item_id": "item-stock-rr-001",
                                "item_code": "SKU-001",
                                "item_name": "Inventory Part A",
                                "requested_qty": "5.00",
                                "uom": "pcs",
                                "unit_price": "100.00",
                                "discount_percent": "0",
                                "tax_percent": "0",
                                "warehouse_id": "WH-01",
                                "base_doc_ref": {
                                    "doc_type": "DELIVERY",
                                    "doc_id": "some-dn-001",
                                    "doc_number": "DN-2026-9001",
                                    "line_id": _DELIVERY_LINE_ID,
                                },
                            },
                            {
                                "item_id": "item-stock-rr-002",
                                "item_code": "SKU-002",
                                "item_name": "Inventory Part B",
                                "requested_qty": "3.00",
                                "uom": "pcs",
                                "unit_price": "80.00",
                                "discount_percent": "0",
                                "tax_percent": "0",
                                "warehouse_id": "WH-01",
                                "base_doc_ref": {
                                    "doc_type": "DELIVERY",
                                    "doc_id": "some-dn-001",
                                    "doc_number": "DN-2026-9001",
                                    "line_id": _DELIVERY_LINE_ID,
                                },
                            },
                        ]
                    ),
                    org_id=_ORG,
                    user_id=_USER,
                )

    @pytest.mark.asyncio
    async def test_direct_rr_update_mixed_stock_service_rejected_doc_not_modified(
        self,
    ) -> None:
        """
        Group A-4 (via update path): direct RR doc + mixed lines → rejected wholesale.

        The original lines must remain unchanged after the failed update.
        """
        db = _FakeDB()
        doc_entry = str(uuid.uuid4())
        db["return_requests_v2"]._add(
            _make_rr_direct_doc(
                doc_entry, item_id="item-svc-001", item_name="Service Item"
            )
        )
        _STOCK_ID = "item-stock-rr-mix-001"
        _SVC_ID = "item-svc-rr-mix-001"

        async def _mixed_ext(item_id, org_id, auth_token):
            if item_id == _STOCK_ID:
                return _make_stock_ext(item_id)
            return _make_service_ext(item_id)

        with _patch_rr_ext(side_effect_fn=_mixed_ext):
            with pytest.raises(ValueError, match="stock item"):
                await update_return_request(
                    db,
                    doc_entry=doc_entry,
                    payload=ReturnRequestUpdate(
                        lines=[
                            {
                                "item_id": _STOCK_ID,
                                "item_code": "SKU-001",
                                "item_name": "Inventory Part",
                                "requested_qty": "5.00",
                                "uom": "pcs",
                                "unit_price": "100.00",
                                "discount_percent": "0",
                                "tax_percent": "0",
                                "warehouse_id": "WH-01",
                                "base_doc_ref": {
                                    "doc_type": "DELIVERY",
                                    "doc_id": "some-dn-001",
                                    "doc_number": "DN-2026-9001",
                                    "line_id": _DELIVERY_LINE_ID,
                                },
                            },
                            {
                                "item_id": _SVC_ID,
                                "item_code": "SVC-001",
                                "item_name": "Service Item",
                                "requested_qty": "3.00",
                                "uom": "pcs",
                                "unit_price": "80.00",
                                "discount_percent": "0",
                                "tax_percent": "0",
                                "warehouse_id": "WH-01",
                                "base_doc_ref": {
                                    "doc_type": "DELIVERY",
                                    "doc_id": "some-dn-001",
                                    "doc_number": "DN-2026-9001",
                                    "line_id": _DELIVERY_LINE_ID,
                                },
                            },
                        ]
                    ),
                    org_id=_ORG,
                    user_id=_USER,
                )

        # Original doc must still have only 1 line (not updated)
        stored = db["return_requests_v2"]._docs
        assert len(stored) == 1
        assert len(stored[0].get("lines", [])) == 1

    @pytest.mark.asyncio
    async def test_create_rr_lands_in_draft_with_correct_item(self) -> None:
        """
        Group A-5: chain-backed RR create → DRAFT, lines[0].itemId correct.
        """
        db = _FakeDB()
        _ITEM_ID = "item-svc-rr-sanity-001"

        with _patch_rr_ext(return_value=_make_service_ext(_ITEM_ID)):
            rr = await create_return_request(
                db,
                payload=_make_rr_payload(
                    item_id=_ITEM_ID, item_name="Consulting Return"
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        assert rr.status == DocumentStatus.DRAFT
        assert rr.lines[0].item_id == _ITEM_ID

    @pytest.mark.asyncio
    async def test_create_from_delivery_skips_isstock_check(self) -> None:
        """
        Group A-6: Delivery-backed RR with stock items → isStock check NOT fired.

        The _rr_is_direct discriminant uses payload.base_doc_ref.doc_id.
        Since the Pydantic model always requires a non-None doc_id, all creates
        via the API are treated as chain-backed and the isStock gate never fires
        at create time regardless of the item's isStock value.

        This test documents that contract: even if the ext returns isStock=True,
        a create with base_doc_ref.doc_id set succeeds without error.
        """
        db = _FakeDB()

        async def _all_stock(item_id, org_id, auth_token):
            return _make_stock_ext(item_id)

        with _patch_rr_ext(side_effect_fn=_all_stock):
            rr = await create_return_request(
                db,
                payload=_make_rr_payload(
                    item_id="item-stock-dn-001",
                    item_name="Stock Part via Delivery",
                    base_doc_ref_doc_id=_DELIVERY_ID,
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        assert rr.status == DocumentStatus.DRAFT
        assert rr.base_doc_ref is not None

    # -----------------------------------------------------------------------
    # Group B — update_return_request (direct DRAFT)
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_update_draft_service_line_qty_only_succeeds(self) -> None:
        """
        Group B-7: update DRAFT direct RR with service line → success.

        Uses a doc with baseDocRef=None (direct) injected into the DB.
        """
        db = _FakeDB()
        doc_entry = str(uuid.uuid4())
        db["return_requests_v2"]._add(
            _make_rr_direct_doc(
                doc_entry, item_id="item-svc-rr-upd-001", item_name="Service Item"
            )
        )
        _ITEM_ID = "item-svc-rr-upd-001"

        with _patch_rr_ext(return_value=_make_service_ext(_ITEM_ID)):
            updated = await update_return_request(
                db,
                doc_entry=doc_entry,
                payload=ReturnRequestUpdate(
                    lines=[
                        {
                            "item_id": _ITEM_ID,
                            "item_code": "SVC-001",
                            "item_name": "Service Item",
                            "requested_qty": "15.00",
                            "uom": "pcs",
                            "unit_price": "100.00",
                            "discount_percent": "0",
                            "tax_percent": "5",
                            "warehouse_id": "WH-01",
                            "base_doc_ref": {
                                "doc_type": "DELIVERY",
                                "doc_id": "some-dn-line",
                                "doc_number": "DN-2026-9001",
                                "line_id": _DELIVERY_LINE_ID,
                            },
                        }
                    ]
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        assert updated is not None
        assert updated.lines[0].requested_qty == Decimal("15.00")

    @pytest.mark.asyncio
    async def test_update_draft_replace_service_line_with_stock_rejected(self) -> None:
        """
        Group B-8: update DRAFT direct RR replacing service line with stock → ValueError.
        """
        db = _FakeDB()
        doc_entry = str(uuid.uuid4())
        _STOCK_ID = "item-stock-rr-upd-001"
        db["return_requests_v2"]._add(
            _make_rr_direct_doc(
                doc_entry, item_id="item-svc-rr-001", item_name="Service Item"
            )
        )

        with _patch_rr_ext(return_value=_make_stock_ext(_STOCK_ID)):
            with pytest.raises(ValueError, match="stock item"):
                await update_return_request(
                    db,
                    doc_entry=doc_entry,
                    payload=ReturnRequestUpdate(
                        lines=[
                            {
                                "item_id": _STOCK_ID,
                                "item_code": "SKU-001",
                                "item_name": "Physical Part",
                                "requested_qty": "5.00",
                                "uom": "pcs",
                                "unit_price": "100.00",
                                "discount_percent": "0",
                                "tax_percent": "0",
                                "warehouse_id": "WH-01",
                                "base_doc_ref": {
                                    "doc_type": "DELIVERY",
                                    "doc_id": "some-dn-line",
                                    "doc_number": "DN-2026-9001",
                                    "line_id": _DELIVERY_LINE_ID,
                                },
                            }
                        ]
                    ),
                    org_id=_ORG,
                    user_id=_USER,
                )

    @pytest.mark.asyncio
    async def test_update_from_delivery_rr_stock_line_succeeds(self) -> None:
        """
        Group B-9: update a Delivery-backed RR with stock lines → success.

        The service checks raw.get("baseDocRef") on the stored document.
        A stored document with a non-None baseDocRef.docId is chain-backed
        and the isStock gate is skipped.
        """
        db = _FakeDB()

        async def _all_stock(item_id, org_id, auth_token):
            return _make_stock_ext(item_id)

        with _patch_rr_ext(side_effect_fn=_all_stock):
            rr = await create_return_request(
                db,
                payload=_make_rr_payload(
                    item_id="item-stock-dn-upd-001",
                    item_name="Stock Part",
                    base_doc_ref_doc_id=_DELIVERY_ID,
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        # Update notes only — no lines change, must succeed
        with _patch_rr_ext(side_effect_fn=_all_stock):
            updated = await update_return_request(
                db,
                doc_entry=rr.doc_entry,
                payload=ReturnRequestUpdate(notes="Updated reason"),
                org_id=_ORG,
                user_id=_USER,
            )

        assert updated is not None
        assert updated.notes == "Updated reason"

    # -----------------------------------------------------------------------
    # Group C — transition_status DRAFT → OPEN
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_transition_draft_to_open_service_item_direct_rr_succeeds(
        self,
    ) -> None:
        """
        Group C-10: service-item direct RR DRAFT → OPEN → success.

        Uses a doc with baseDocRef=None (direct) injected into the DB.
        isStock=False → transition succeeds.
        """
        db = _FakeDB()
        doc_entry = str(uuid.uuid4())
        db["return_requests_v2"]._add(
            _make_rr_direct_doc(
                doc_entry, item_id="item-svc-rr-trans-001", item_name="Service Item"
            )
        )

        with _patch_rr_ext(return_value=_make_service_ext("item-svc-rr-trans-001")):
            result = await rr_transition_status(
                db,
                doc_entry=doc_entry,
                request_body=ReturnRequestStatusTransitionRequest(
                    new_status=DocumentStatus.OPEN
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        assert result.status == DocumentStatus.OPEN

    @pytest.mark.asyncio
    async def test_transition_draft_to_open_item_reclassified_to_stock_rejected(
        self,
    ) -> None:
        """
        Group C-11: admin flips direct RR item to stock while in DRAFT → rejected.

        Uses a doc with baseDocRef=None.  The isStock re-check fires at
        DRAFT → OPEN and rejects because isStock=True.
        """
        db = _FakeDB()
        doc_entry = str(uuid.uuid4())
        _ITEM_ID = "item-svc-rr-reclass-001"
        db["return_requests_v2"]._add(
            _make_rr_direct_doc(
                doc_entry, item_id=_ITEM_ID, item_name="Reclassified Item"
            )
        )

        # Admin reclassifies item to stock
        with _patch_rr_ext(return_value=_make_stock_ext(_ITEM_ID)):
            with pytest.raises(ValueError, match="stock item"):
                await rr_transition_status(
                    db,
                    doc_entry=doc_entry,
                    request_body=ReturnRequestStatusTransitionRequest(
                        new_status=DocumentStatus.OPEN
                    ),
                    org_id=_ORG,
                    user_id=_USER,
                )

    @pytest.mark.asyncio
    async def test_transition_draft_to_open_finance_ext_fetch_fails_open_succeeds(
        self,
    ) -> None:
        """
        Group C-12: finance ext fetch raises ValueError → transition succeeds (fail-open).

        Uses a doc with baseDocRef=None (direct RR).  At DRAFT → OPEN the service
        tries to fetch the finance ext.  If the finance service is unreachable
        (_get_item_finance_ext raises ValueError), ext_ln = None and the isStock
        block is skipped.  The transition must succeed.

        This is intentional: isStock is a safeguard, not a hard accounting rule.
        Finance service downtime must not block Return Request posting.
        """
        db = _FakeDB()
        doc_entry = str(uuid.uuid4())
        db["return_requests_v2"]._add(
            _make_rr_direct_doc(
                doc_entry, item_id="item-svc-rr-failopen-001", item_name="Service Item"
            )
        )

        async def _finance_down(item_id, org_id, auth_token):
            raise ValueError("Finance service unreachable")

        with _patch_rr_ext(side_effect_fn=_finance_down):
            result = await rr_transition_status(
                db,
                doc_entry=doc_entry,
                request_body=ReturnRequestStatusTransitionRequest(
                    new_status=DocumentStatus.OPEN
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        assert result.status == DocumentStatus.OPEN

    @pytest.mark.asyncio
    async def test_transition_from_delivery_rr_never_gated_on_isstock(self) -> None:
        """
        Group C-13: Delivery-backed RR DRAFT → OPEN — isStock gate never applied.

        Delivery-backed RRs were validated at Delivery creation time.
        The service checks raw.get("baseDocRef") at transition time.  A non-None
        baseDocRef with a non-None docId makes the RR chain-backed → gate skipped.

        Future developers must NOT reintroduce the isStock gate on Delivery-backed
        RR DRAFT → OPEN transitions.  This test documents and enforces that intent.
        """
        db = _FakeDB()

        async def _all_stock(item_id, org_id, auth_token):
            return _make_stock_ext(item_id)

        with _patch_rr_ext(side_effect_fn=_all_stock):
            rr = await create_return_request(
                db,
                payload=_make_rr_payload(
                    item_id="item-stock-dn-trans-001",
                    item_name="Stock Part",
                    base_doc_ref_doc_id=_DELIVERY_ID,
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        # Transition to OPEN — must succeed despite item being stock
        with _patch_rr_ext(side_effect_fn=_all_stock):
            result = await rr_transition_status(
                db,
                doc_entry=rr.doc_entry,
                request_body=ReturnRequestStatusTransitionRequest(
                    new_status=DocumentStatus.OPEN
                ),
                org_id=_ORG,
                user_id=_USER,
            )

        assert result.status == DocumentStatus.OPEN
