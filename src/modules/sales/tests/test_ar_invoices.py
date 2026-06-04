"""
Tests for the AR Invoice backend — T-100.9a.

Uses the same in-memory fake Motor DB pattern as test_deliveries.py.
Finance ext lookups (sale_item_finance_ext, customer_finance_ext) are mocked
via unittest.mock.patch on the service-layer helpers (_get_item_finance_ext,
_get_customer_finance_ext) — these call the finance microservice via HTTP
and must NOT be tested against MongoDB.

All tests call service functions directly; route-level auth is tested via
role/permission checks in the API layer (covered by the schema validator
and service-layer guards).

Run:
    pytest src/modules/sales/tests/test_ar_invoices.py -v

All async tests use pytest-asyncio with asyncio_mode = "auto".
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, patch

import pytest

from src.core.documents.document_status import DocumentStatus
from src.modules.sales.models.ar_invoices import (
    ARInvoiceCreate,
    ARInvoiceFromDeliveryLineRequest,
    ARInvoiceFromDeliveryRequest,
    ARInvoiceLineCreate,
    ARInvoiceStatusTransitionRequest,
    ARInvoiceUpdate,
)
from src.modules.sales.services.ar_invoice_service import (
    create_ar_invoice,
    create_ar_invoice_from_delivery,
    delete_ar_invoice,
    get_ar_invoice,
    list_ar_invoices,
    transition_status,
    update_ar_invoice,
)

# ---------------------------------------------------------------------------
# In-memory fake Motor DB — mirrors the pattern from test_deliveries.py
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
    """Minimal fake Motor database with embedded-line support."""

    def __init__(self) -> None:
        self._collections: Dict[str, _FakeCollection] = {}

    def __getitem__(self, name: str) -> _FakeCollection:
        if name not in self._collections:
            self._collections[name] = _FakeCollection()
        return self._collections[name]


# ---------------------------------------------------------------------------
# Query / update helpers
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


def _apply_update_embedded(
    doc: Dict[str, Any], query: Dict[str, Any], update: Dict[str, Any]
) -> None:
    """Apply updates including positional operator ($) on embedded arrays."""
    # Find embedded line query key.
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


# ---------------------------------------------------------------------------
# Test fixtures and helpers
# ---------------------------------------------------------------------------

ORG_ID = "org-test-ari-001"
OTHER_ORG_ID = "org-test-ari-other"
USER_ID = "user-ari-abc-123"
COMPANY_CODE = "A001"
CUSTOMER_ID = "customer-ari-001"
CUSTOMER_NAME = "Test AR Invoice Customer"
ITEM_1_ID = "item-ari-001"
ITEM_2_ID = "item-ari-002"
DN_DOC_ENTRY = str(uuid.uuid4())
DN_DOC_NUMBER = "DN-2026-0001"
DN_LINE_1_ID = str(uuid.uuid4())
DN_LINE_2_ID = str(uuid.uuid4())
REVENUE_ACCOUNT_ID = "gl-revenue-001"
TAX_CODE_ID = "vat5"

# ---------------------------------------------------------------------------
# Finance ext mock helpers
#
# These replace the former _seed_db_for_direct_invoice MongoDB seeding.
# sale_item_finance_ext and customer_finance_ext live in the finance
# microservice's MySQL DB — they are NOT in the ops MongoDB.
# ---------------------------------------------------------------------------

_ITEM_FIN_EXT_DATA = {
    "sale_item_finance_ext_id": "ext-001",
    "itemId": ITEM_1_ID,
    "organizationId": ORG_ID,
    "revenueAccountId": REVENUE_ACCOUNT_ID,
    "cogsAccountId": "gl-cogs-001",
    "salesTaxCode": None,
    "isSellable": True,
    # Reason: existing tests use service items; isStock=False prevents isStock gating
    # from blocking tests that pre-date the T-201.8 feature.
    "isStock": False,
}

_ITEM_2_FIN_EXT_DATA = {
    "sale_item_finance_ext_id": "ext-002",
    "itemId": ITEM_2_ID,
    "organizationId": ORG_ID,
    "revenueAccountId": REVENUE_ACCOUNT_ID,
    "cogsAccountId": "gl-cogs-001",
    "salesTaxCode": None,
    "isSellable": True,
    # Reason: same as _ITEM_FIN_EXT_DATA above.
    "isStock": False,
}

_CUST_FIN_EXT_DATA = {
    "customer_finance_ext_id": "cust-ext-001",
    "customerId": CUSTOMER_ID,
    "organizationId": ORG_ID,
    "arControlAccountId": "gl-ar-control-001",
    "paymentTermsId": "NET30",
    "creditLimit": "100000.00",
    "creditLimitCurrency": "AED",
}


def _patch_item_ext(
    revenue_account_id: Optional[str] = REVENUE_ACCOUNT_ID,
    raise_not_found: bool = False,
):
    """
    Context manager: patch _get_item_finance_ext to return a canned response.

    Use raise_not_found=True to simulate a 404 (no ext configured).
    Use revenue_account_id=None to simulate a record with null revenueAccountId.
    """
    if raise_not_found:
        side_effect = ValueError(
            f"Item '{ITEM_1_ID}' has no sale_item_finance_ext record in org '{ORG_ID}'. "
            "Configure the item's finance extension (revenueAccountId) before invoicing."
        )
        return patch(
            "src.modules.sales.services.ar_invoice_service._get_item_finance_ext",
            new_callable=AsyncMock,
            side_effect=side_effect,
        )
    ext_data = dict(_ITEM_FIN_EXT_DATA)
    ext_data["revenueAccountId"] = revenue_account_id
    return patch(
        "src.modules.sales.services.ar_invoice_service._get_item_finance_ext",
        new_callable=AsyncMock,
        return_value=ext_data,
    )


def _patch_item_ext_multi(
    items: Optional[Dict[str, Optional[str]]] = None,
):
    """
    Patch _get_item_finance_ext to handle multiple item IDs with a side_effect.

    Args:
        items: Dict mapping item_id → revenue_account_id (or None for missing).
               Defaults to both ITEM_1_ID and ITEM_2_ID mapped to REVENUE_ACCOUNT_ID.
    """
    if items is None:
        items = {ITEM_1_ID: REVENUE_ACCOUNT_ID, ITEM_2_ID: REVENUE_ACCOUNT_ID}

    async def _side_effect(item_id: str, org_id: str, auth_token: Any) -> Dict[str, Any]:
        if item_id not in items:
            raise ValueError(f"Item '{item_id}' has no sale_item_finance_ext record")
        rev = items[item_id]
        return {**_ITEM_FIN_EXT_DATA, "itemId": item_id, "revenueAccountId": rev}

    return patch(
        "src.modules.sales.services.ar_invoice_service._get_item_finance_ext",
        side_effect=_side_effect,
    )


def _patch_customer_ext(
    present: bool = True,
) -> Any:
    """
    Patch _get_customer_finance_ext to return a canned response or None.

    Args:
        present: If True returns the default customer ext dict; if False returns None
                 (simulating no customer finance ext configured — which is allowed).
    """
    return patch(
        "src.modules.sales.services.ar_invoice_service._get_customer_finance_ext",
        new_callable=AsyncMock,
        return_value=_CUST_FIN_EXT_DATA if present else None,
    )


def _patch_tax_percent(
    return_value: Decimal = Decimal("5.00"),
    raise_exc: Optional[Exception] = None,
):
    """
    Context manager: patch get_tax_percent (the HTTP helper imported into
    ar_invoice_service) to return a canned Decimal or raise an exception.

    Architectural rule (T-202 / T-100.9a.1):
      tax_codes live in the finance microservice's MySQL DB — tests must mock
      the HTTP helper, never seed db["tax_codes"] with Mongo docs.
    """
    if raise_exc is not None:
        return patch(
            "src.modules.sales.services.ar_invoice_service.get_tax_percent",
            new_callable=AsyncMock,
            side_effect=raise_exc,
        )
    return patch(
        "src.modules.sales.services.ar_invoice_service.get_tax_percent",
        new_callable=AsyncMock,
        return_value=return_value,
    )


def _make_delivery(
    status: str = "open",
    line1_ordered: float = 10.0,
    line1_invoiced: float = 0.0,
    include_line2: bool = False,
    line2_ordered: float = 5.0,
    line2_invoiced: float = 0.0,
) -> Dict[str, Any]:
    """Build a minimal deliveries_v2 document for testing."""
    lines = [
        {
            "lineId": DN_LINE_1_ID,
            "lineNumber": 1,
            "itemId": ITEM_1_ID,
            "itemCode": "ITEM-ARI-001",
            "itemName": "Test Item ARI 1",
            "description": "Test Item ARI 1",
            "quantity": line1_ordered,
            "uom": "pcs",
            "warehouseId": "WH-MAIN",
            "unitCost": 50.0,
            "lineCogs": line1_ordered * 50.0,
            "costCenterId": None,
            "orderedQty": line1_ordered,
            "invoicedQty": line1_invoiced,
            "creditedQty": 0.0,
            "cancelledQty": 0.0,
            "targetDocRefs": [],
            "baseDocRef": None,
        },
    ]
    if include_line2:
        lines.append({
            "lineId": DN_LINE_2_ID,
            "lineNumber": 2,
            "itemId": ITEM_2_ID,
            "itemCode": "ITEM-ARI-002",
            "itemName": "Test Item ARI 2",
            "description": "Test Item ARI 2",
            "quantity": line2_ordered,
            "uom": "kg",
            "warehouseId": "WH-MAIN",
            "unitCost": 30.0,
            "lineCogs": line2_ordered * 30.0,
            "costCenterId": None,
            "orderedQty": line2_ordered,
            "invoicedQty": line2_invoiced,
            "creditedQty": 0.0,
            "cancelledQty": 0.0,
            "targetDocRefs": [],
            "baseDocRef": None,
        })

    return {
        "docEntry": DN_DOC_ENTRY,
        "docNumber": DN_DOC_NUMBER,
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
        "totalCogs": 500.0,
        "baseDocRef": {"docType": "SO", "docId": "so-001", "docNumber": "SO-2026-0001", "lineId": None},
        "targetDocRefs": [],
        "outboxEventId": None,
        "outboxEventEmittedAt": None,
        "lines": lines,
        "createdAt": datetime.now(tz=timezone.utc),
        "createdBy": USER_ID,
        "updatedAt": datetime.now(tz=timezone.utc),
        "updatedBy": USER_ID,
    }


def _make_direct_create_payload(
    tax_code_id: Optional[str] = None,
    date_of_supply: Optional[date] = None,
    invoice_date: Optional[date] = None,
    doc_date: Optional[date] = None,
    use_camel_case: bool = False,
) -> ARInvoiceCreate:
    """
    Build a minimal ARInvoiceCreate payload for direct-invoice flow.

    Args:
        use_camel_case: If True, build using camelCase field names to exercise
                        the alias acceptance path.
    """
    _doc_date = doc_date or date(2026, 2, 1)
    _invoice_date = invoice_date or date(2026, 2, 1)
    _date_of_supply = date_of_supply or date(2026, 1, 15)

    if use_camel_case:
        # Reason: exercise the camelCase alias path — mirrors what the frontend sends.
        return ARInvoiceCreate.model_validate({
            "organizationId": ORG_ID,
            "companyCode": COMPANY_CODE,
            "customerId": CUSTOMER_ID,
            "customerName": CUSTOMER_NAME,
            "docDate": str(_doc_date),
            "dateOfSupply": str(_date_of_supply),
            "invoiceDate": str(_invoice_date),
            "lines": [
                {
                    "itemId": ITEM_1_ID,
                    "itemCode": "ITEM-ARI-001",
                    "itemName": "Test Item ARI 1",
                    "quantity": "5",
                    "uom": "pcs",
                    "unitPrice": "100",
                    "discountPercent": "0",
                    "taxCodeId": tax_code_id,
                }
            ],
        })

    return ARInvoiceCreate(
        organization_id=ORG_ID,
        company_code=COMPANY_CODE,
        customer_id=CUSTOMER_ID,
        customer_name=CUSTOMER_NAME,
        doc_date=_doc_date,
        date_of_supply=_date_of_supply,
        invoice_date=_invoice_date,
        lines=[
            ARInvoiceLineCreate(
                item_id=ITEM_1_ID,
                item_code="ITEM-ARI-001",
                item_name="Test Item ARI 1",
                quantity=Decimal("5"),
                uom="pcs",
                unit_price=Decimal("100"),
                discount_percent=Decimal("0"),
                tax_code_id=tax_code_id,
            )
        ],
    )


def _make_from_delivery_payload(
    qty: float = 5.0,
    include_line2: bool = False,
    qty2: float = 3.0,
    date_of_supply: Optional[date] = None,
) -> ARInvoiceFromDeliveryRequest:
    """Build a minimal ARInvoiceFromDeliveryRequest payload."""
    lines: List[ARInvoiceFromDeliveryLineRequest] = [
        ARInvoiceFromDeliveryLineRequest(
            delivery_line_id=DN_LINE_1_ID,
            quantity=Decimal(str(qty)),
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
        date_of_supply=date_of_supply,
        lines=lines,
    )


# ---------------------------------------------------------------------------
# Tests: create_ar_invoice (direct flow)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_direct_create_happy_path() -> None:
    """
    Direct create — happy path.

    Verify: DRAFT status, doc_number ARI-YYYY-NNNN, totals correct,
    revenue_account_id captured per line, tax_date computed correctly.
    """
    db = _FakeDB()

    with _patch_item_ext(), _patch_customer_ext():
        payload = _make_direct_create_payload(
            date_of_supply=date(2026, 1, 15),
            invoice_date=date(2026, 2, 1),
        )
        ari = await create_ar_invoice(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)

    assert ari.status == DocumentStatus.DRAFT
    assert ari.doc_number.startswith("ARI-")
    assert len(ari.lines) == 1
    line = ari.lines[0]
    # unit_price=100, qty=5, no discount, no tax → line_net=500, line_tax=0, line_gross=500
    assert line.line_net == Decimal("500.00")
    assert line.line_tax == Decimal("0.00")
    assert line.line_gross == Decimal("500.00")
    assert line.revenue_account_id == REVENUE_ACCOUNT_ID
    assert line.tax_percent == Decimal("0.00")
    # tax_date = min(2026-01-15, 2026-02-01) = 2026-01-15
    assert ari.tax_date == date(2026, 1, 15)
    assert ari.totals.net == Decimal("500.00")
    assert ari.totals.gross == Decimal("500.00")
    assert ari.totals.open_amount == Decimal("500.00")


@pytest.mark.asyncio
async def test_direct_create_with_tax_code() -> None:
    """
    Direct create with a 5% tax code — verify line_tax and totals computed.

    T-202: tax_percent is now looked up via HTTP from the finance service's
    tax-codes list.  The test mocks get_tax_percent (the HTTP helper) — it must
    NOT seed db["tax_codes"] (that was the broken pre-T-202 pattern).
    """
    db = _FakeDB()

    with _patch_item_ext(), _patch_customer_ext(), _patch_tax_percent(Decimal("5.00")):
        payload = _make_direct_create_payload(tax_code_id=TAX_CODE_ID)
        ari = await create_ar_invoice(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)

    line = ari.lines[0]
    # qty=5, price=100, 5% tax → net=500, tax=25, gross=525
    assert line.line_net == Decimal("500.00")
    assert line.line_tax == Decimal("25.00")
    assert line.line_gross == Decimal("525.00")
    assert line.tax_percent == Decimal("5.00")


@pytest.mark.asyncio
async def test_direct_create_missing_finance_ext_raises() -> None:
    """
    Create with item missing sale_item_finance_ext → ValueError (→ 400).

    The finance microservice returns 404 → _get_item_finance_ext raises ValueError.
    """
    db = _FakeDB()

    with _patch_item_ext(raise_not_found=True), _patch_customer_ext():
        payload = _make_direct_create_payload()
        with pytest.raises(ValueError, match="sale_item_finance_ext"):
            await create_ar_invoice(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)


@pytest.mark.asyncio
async def test_direct_create_null_revenue_account_raises() -> None:
    """
    Create with ext record present but revenueAccountId=None → ValueError (→ 400).

    The finance service returns the ext record with a null revenueAccountId.
    """
    db = _FakeDB()

    with _patch_item_ext(revenue_account_id=None), _patch_customer_ext():
        payload = _make_direct_create_payload()
        with pytest.raises(ValueError, match="revenueAccountId"):
            await create_ar_invoice(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)


@pytest.mark.asyncio
async def test_tax_date_supply_before_invoice() -> None:
    """
    When date_of_supply < invoice_date → tax_date = date_of_supply.
    """
    db = _FakeDB()

    with _patch_item_ext(), _patch_customer_ext():
        payload = _make_direct_create_payload(
            date_of_supply=date(2026, 1, 10),
            invoice_date=date(2026, 2, 1),
        )
        ari = await create_ar_invoice(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)
    assert ari.tax_date == date(2026, 1, 10)


@pytest.mark.asyncio
async def test_tax_date_invoice_before_supply() -> None:
    """
    When invoice_date < date_of_supply → tax_date = invoice_date.
    """
    db = _FakeDB()

    with _patch_item_ext(), _patch_customer_ext():
        payload = _make_direct_create_payload(
            date_of_supply=date(2026, 2, 15),
            invoice_date=date(2026, 2, 1),
            doc_date=date(2026, 2, 1),
        )
        ari = await create_ar_invoice(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)
    assert ari.tax_date == date(2026, 2, 1)


@pytest.mark.asyncio
async def test_direct_create_cross_org_isolation() -> None:
    """
    create_ar_invoice for a different org should not find the item finance ext.

    Simulated by having the mock raise for the "other" org.
    """
    db = _FakeDB()

    # Raise for any org — simulates finance ext not configured for OTHER_ORG_ID.
    with _patch_item_ext(raise_not_found=True), _patch_customer_ext(present=False):
        payload = _make_direct_create_payload()
        with pytest.raises(ValueError, match="sale_item_finance_ext"):
            await create_ar_invoice(db, payload=payload, org_id=OTHER_ORG_ID, user_id=USER_ID)


# ---------------------------------------------------------------------------
# Bug-fix regression tests: camelCase / snake_case / org_id (T-100.9a.1)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_camelcase_payload_accepted() -> None:
    """
    Bug #2 regression: camelCase request payload must be accepted.

    Callers (frontend, smoke tests) send organizationId, companyCode, customerId,
    docDate, etc.  Verifies that the Pydantic aliases work end-to-end.
    """
    db = _FakeDB()

    with _patch_item_ext(), _patch_customer_ext():
        payload = _make_direct_create_payload(use_camel_case=True)
        ari = await create_ar_invoice(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)

    assert ari.status == DocumentStatus.DRAFT
    assert ari.customer_id == CUSTOMER_ID


@pytest.mark.asyncio
async def test_snakecase_payload_still_accepted() -> None:
    """
    Bug #2 regression: snake_case request payload must still be accepted.

    populate_by_name=True means BOTH shapes work; existing tests/callers
    using snake_case must not regress.
    """
    db = _FakeDB()

    with _patch_item_ext(), _patch_customer_ext():
        # Standard snake_case payload (legacy path).
        payload = _make_direct_create_payload(use_camel_case=False)
        ari = await create_ar_invoice(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)

    assert ari.status == DocumentStatus.DRAFT


@pytest.mark.asyncio
async def test_org_id_from_query_string_only() -> None:
    """
    Bug #3 regression: org_id in query string only (no body org_id) must work.

    ARInvoiceCreate.organization_id is Optional; the canonical value comes from
    the query string (resolved by _resolve_org_id in the route handler).
    Service layer receives org_id as a separate argument, not from the payload.
    """
    db = _FakeDB()

    with _patch_item_ext(), _patch_customer_ext():
        # Build payload WITHOUT organization_id in body.
        payload = ARInvoiceCreate(
            company_code=COMPANY_CODE,
            customer_id=CUSTOMER_ID,
            customer_name=CUSTOMER_NAME,
            doc_date=date(2026, 2, 1),
            date_of_supply=date(2026, 1, 15),
            invoice_date=date(2026, 2, 1),
            lines=[
                ARInvoiceLineCreate(
                    item_id=ITEM_1_ID,
                    item_code="ITEM-ARI-001",
                    item_name="Test Item ARI 1",
                    quantity=Decimal("5"),
                    uom="pcs",
                    unit_price=Decimal("100"),
                )
            ],
        )
        # org_id comes from query string (passed as separate arg to service)
        ari = await create_ar_invoice(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)

    assert ari.organization_id == ORG_ID


@pytest.mark.asyncio
async def test_finance_ext_http_404_raises_400_clear_message() -> None:
    """
    Bug #1 regression: when the finance service returns 404 for item ext
    the service must raise ValueError with a clear diagnostic message.
    (Route handler maps ValueError with 'finance_ext' keyword → HTTP 400.)
    """
    db = _FakeDB()

    with _patch_item_ext(raise_not_found=True), _patch_customer_ext():
        payload = _make_direct_create_payload()
        with pytest.raises(ValueError) as exc_info:
            await create_ar_invoice(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)

    assert "sale_item_finance_ext" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_finance_ext_null_revenue_account_raises() -> None:
    """
    Bug #1 regression: finance service returns ext record but revenueAccountId
    is null → ValueError with 'revenueAccountId' in message.
    """
    db = _FakeDB()

    with _patch_item_ext(revenue_account_id=None), _patch_customer_ext():
        payload = _make_direct_create_payload()
        with pytest.raises(ValueError, match="revenueAccountId"):
            await create_ar_invoice(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)


# ---------------------------------------------------------------------------
# Tests: T-202 — tax_percent HTTP lookup contract
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_t202_valid_tax_code_stamps_tax_percent() -> None:
    """
    T-202 Case 1: tax code "S" returned as 5% by finance service.

    Verifies that the ARI line receives taxPercent=5.00 and lineTax=25.00
    when get_tax_percent returns Decimal("5.00").
    """
    db = _FakeDB()

    with _patch_item_ext(), _patch_customer_ext(), _patch_tax_percent(Decimal("5.00")):
        payload = _make_direct_create_payload(tax_code_id="S")
        ari = await create_ar_invoice(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)

    line = ari.lines[0]
    # qty=5, price=100, 5% tax → net=500, tax=25, gross=525
    assert line.tax_percent == Decimal("5.00")
    assert line.line_tax == Decimal("25.00")
    assert line.line_gross == Decimal("525.00")
    assert line.tax_code_id == "S"


@pytest.mark.asyncio
async def test_t202_unknown_tax_code_raises_value_error() -> None:
    """
    T-202 Case 2: unknown tax code "BOGUS" → ValueError raised, no ARI persisted.

    The finance service returns a list that does not contain "BOGUS", causing
    get_tax_percent to raise ValueError.  The create must fail entirely.
    """
    db = _FakeDB()
    exc = ValueError("Tax code 'BOGUS' not found in org '...'.")

    with _patch_item_ext(), _patch_customer_ext(), _patch_tax_percent(raise_exc=exc):
        payload = _make_direct_create_payload(tax_code_id="BOGUS")
        with pytest.raises(ValueError, match="BOGUS"):
            await create_ar_invoice(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)

    # Verify no document was persisted
    assert db["ar_invoices_v2"]._docs == []


@pytest.mark.asyncio
async def test_t202_finance_unreachable_raises_value_error() -> None:
    """
    T-202 Case 3: finance service unreachable → ValueError raised, no ARI persisted.

    get_tax_percent raises ValueError when httpx itself fails (connection error).
    The create must propagate the error and leave no document in the DB.
    """
    db = _FakeDB()
    exc = ValueError("Finance service unreachable when looking up tax code 'S'.")

    with _patch_item_ext(), _patch_customer_ext(), _patch_tax_percent(raise_exc=exc):
        payload = _make_direct_create_payload(tax_code_id="S")
        with pytest.raises(ValueError, match="Finance service unreachable"):
            await create_ar_invoice(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)

    assert db["ar_invoices_v2"]._docs == []


@pytest.mark.asyncio
async def test_t202_exempt_line_zero_tax_no_http_call() -> None:
    """
    T-202 Case 4: taxCodeId=None → taxPercent=0, no HTTP call issued.

    When tax_code_id is None the short-circuit in get_tax_percent returns
    Decimal("0.00") immediately without making an HTTP request.  We verify
    this by patching httpx.AsyncClient — if it is called the test fails.

    Using the real get_tax_percent (not a mock) so the short-circuit logic
    actually executes.
    """
    db = _FakeDB()

    with _patch_item_ext(), _patch_customer_ext():
        with patch("httpx.AsyncClient") as mock_client:
            # tax_code_id=None → exempt line
            payload = _make_direct_create_payload(tax_code_id=None)
            ari = await create_ar_invoice(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)

    line = ari.lines[0]
    assert line.tax_percent == Decimal("0.00")
    assert line.line_tax == Decimal("0.00")
    # Reason: httpx.AsyncClient must NOT have been used for the tax lookup.
    # (It may still be used for item finance ext lookup — verify tax-specific
    # path by checking the call had nothing to do with tax-codes URL.)
    tax_code_calls = [
        call for call in mock_client.call_args_list
        if "tax-codes" in str(call)
    ]
    assert tax_code_calls == [], (
        "httpx.AsyncClient should not be called for exempt (None) tax code, "
        f"but found calls: {tax_code_calls}"
    )


# ---------------------------------------------------------------------------
# Tests: create_ar_invoice_from_delivery
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_from_delivery_happy_path() -> None:
    """
    From-Delivery happy path — invoice in DRAFT, Delivery line invoiced_qty incremented.
    """
    db = _FakeDB()
    db["deliveries_v2"]._add(_make_delivery(status="open"))

    with _patch_item_ext(), _patch_customer_ext():
        payload = _make_from_delivery_payload(qty=5.0)
        ari = await create_ar_invoice_from_delivery(
            db, delivery_doc_entry=DN_DOC_ENTRY, payload=payload, org_id=ORG_ID, user_id=USER_ID
        )

    assert ari.status == DocumentStatus.DRAFT
    assert ari.doc_number.startswith("ARI-")
    assert ari.base_doc_ref is not None
    assert ari.base_doc_ref.doc_type == "DELIVERY"
    assert len(ari.lines) == 1
    assert ari.lines[0].base_doc_ref is not None

    # Check Delivery line invoiced_qty was incremented.
    dn_doc = db["deliveries_v2"]._docs[0]
    dn_line = next(ln for ln in dn_doc["lines"] if ln["lineId"] == DN_LINE_1_ID)
    assert dn_line["invoicedQty"] == pytest.approx(5.0)

    # Check Delivery header gained a target_doc_ref.
    assert any(ref.get("docType") == "AR_INVOICE" for ref in dn_doc.get("targetDocRefs", []))


@pytest.mark.asyncio
async def test_from_delivery_inherits_dates() -> None:
    """
    From-Delivery create with no date_of_supply override should inherit
    Delivery.actual_delivery_date as the supply date.
    """
    db = _FakeDB()
    db["deliveries_v2"]._add(_make_delivery(status="open"))

    with _patch_item_ext(), _patch_customer_ext():
        payload = _make_from_delivery_payload(qty=5.0, date_of_supply=None)
        ari = await create_ar_invoice_from_delivery(
            db, delivery_doc_entry=DN_DOC_ENTRY, payload=payload, org_id=ORG_ID, user_id=USER_ID
        )
    # Delivery.actualDeliveryDate = 2026-01-15, invoice_date = 2026-02-01
    # tax_date = min(2026-01-15, 2026-02-01) = 2026-01-15
    assert ari.date_of_supply == date(2026, 1, 15)
    assert ari.tax_date == date(2026, 1, 15)


@pytest.mark.asyncio
async def test_from_delivery_line_qty_exceeds_open_raises() -> None:
    """
    From-Delivery: requesting qty > open invoice qty on Delivery line → ValueError (422).
    """
    db = _FakeDB()
    # 10 ordered, 8 already invoiced → open = 2.
    db["deliveries_v2"]._add(_make_delivery(status="open", line1_ordered=10.0, line1_invoiced=8.0))

    with _patch_item_ext(), _patch_customer_ext():
        payload = _make_from_delivery_payload(qty=5.0)  # Only 2 available.
        with pytest.raises(ValueError, match="open_invoice_qty"):
            await create_ar_invoice_from_delivery(
                db, delivery_doc_entry=DN_DOC_ENTRY, payload=payload, org_id=ORG_ID, user_id=USER_ID
            )


@pytest.mark.asyncio
async def test_from_delivery_draft_status_raises() -> None:
    """
    From-Delivery: Delivery in DRAFT status → ValueError (409).
    """
    db = _FakeDB()
    db["deliveries_v2"]._add(_make_delivery(status="draft"))

    with _patch_item_ext(), _patch_customer_ext():
        payload = _make_from_delivery_payload()
        with pytest.raises(ValueError, match="status is 'draft'"):
            await create_ar_invoice_from_delivery(
                db, delivery_doc_entry=DN_DOC_ENTRY, payload=payload, org_id=ORG_ID, user_id=USER_ID
            )


@pytest.mark.asyncio
async def test_from_delivery_cancelled_status_raises() -> None:
    """
    From-Delivery: Delivery in CANCELLED status → ValueError (409).
    """
    db = _FakeDB()
    db["deliveries_v2"]._add(_make_delivery(status="cancelled"))

    with _patch_item_ext(), _patch_customer_ext():
        payload = _make_from_delivery_payload()
        with pytest.raises(ValueError, match="status is 'cancelled'"):
            await create_ar_invoice_from_delivery(
                db, delivery_doc_entry=DN_DOC_ENTRY, payload=payload, org_id=ORG_ID, user_id=USER_ID
            )


@pytest.mark.asyncio
async def test_from_delivery_closed_status_succeeds() -> None:
    """
    From-Delivery: Delivery in CLOSED status should succeed (COGS was posted).
    """
    db = _FakeDB()
    db["deliveries_v2"]._add(_make_delivery(status="closed"))

    with _patch_item_ext(), _patch_customer_ext():
        payload = _make_from_delivery_payload(qty=5.0)
        ari = await create_ar_invoice_from_delivery(
            db, delivery_doc_entry=DN_DOC_ENTRY, payload=payload, org_id=ORG_ID, user_id=USER_ID
        )
    assert ari.status == DocumentStatus.DRAFT


@pytest.mark.asyncio
async def test_from_delivery_missing_delivery_raises() -> None:
    """
    From-Delivery: non-existent Delivery → ValueError (404).
    """
    db = _FakeDB()

    with _patch_item_ext(), _patch_customer_ext():
        payload = _make_from_delivery_payload()
        with pytest.raises(ValueError, match="not found"):
            await create_ar_invoice_from_delivery(
                db, delivery_doc_entry="no-such-dn", payload=payload, org_id=ORG_ID, user_id=USER_ID
            )


# ---------------------------------------------------------------------------
# Tests: DRAFT → OPEN transition (primary accounting event)
# ---------------------------------------------------------------------------


async def _create_draft_ari(db: _FakeDB, from_delivery: bool = False) -> str:
    """Helper: create an AR Invoice in DRAFT and return its doc_entry."""
    if from_delivery:
        db["deliveries_v2"]._add(_make_delivery(status="open"))
        with _patch_item_ext(), _patch_customer_ext():
            payload = _make_from_delivery_payload(qty=5.0)
            ari = await create_ar_invoice_from_delivery(
                db,
                delivery_doc_entry=DN_DOC_ENTRY,
                payload=payload,
                org_id=ORG_ID,
                user_id=USER_ID,
            )
    else:
        with _patch_item_ext(), _patch_customer_ext():
            payload = _make_direct_create_payload()
            ari = await create_ar_invoice(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)
    return ari.doc_entry


@pytest.mark.asyncio
async def test_open_transition_emits_outbox_event() -> None:
    """
    DRAFT → OPEN: sales_invoice_posted outbox event should be emitted with
    correct payload shape; outbox_event_id persisted on header.
    """
    db = _FakeDB()
    doc_entry = await _create_draft_ari(db)

    emitted_event_id = str(uuid.uuid4())
    with (
        _patch_item_ext(),
        _patch_customer_ext(),
        patch(
            "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
            new_callable=AsyncMock,
            return_value=emitted_event_id,
        ) as mock_publish,
    ):
        req = ARInvoiceStatusTransitionRequest(new_status=DocumentStatus.OPEN)
        ari = await transition_status(
            db, doc_entry=doc_entry, request_body=req, org_id=ORG_ID, user_id=USER_ID
        )

    assert ari is not None
    assert ari.status == DocumentStatus.OPEN

    mock_publish.assert_called_once()
    call_kwargs = mock_publish.call_args
    assert call_kwargs.kwargs["event_type"] == "sales_invoice_posted"
    assert call_kwargs.kwargs["organization_id"] == ORG_ID

    payload = call_kwargs.kwargs["payload"]
    assert payload["arInvoiceDocEntry"] == doc_entry
    assert "lines" in payload
    assert len(payload["lines"]) == 1
    assert "revenueAccountId" in payload["lines"][0]
    assert "taxDate" in payload
    assert "dueDate" in payload

    # outboxEventId should be stamped on the invoice header.
    assert ari.outbox_event_id == emitted_event_id
    assert ari.outbox_event_emitted_at is not None


@pytest.mark.asyncio
async def test_open_transition_revalidates_revenue_account() -> None:
    """
    DRAFT → OPEN: if the sale_item_finance_ext record is removed after DRAFT
    creation (finance service now returns 404), the transition should be blocked.
    """
    db = _FakeDB()
    doc_entry = await _create_draft_ari(db)

    # Simulate the finance ext being deactivated/removed after DRAFT was created.
    with _patch_item_ext(raise_not_found=True), _patch_customer_ext():
        req = ARInvoiceStatusTransitionRequest(new_status=DocumentStatus.OPEN)
        with pytest.raises(ValueError, match="revenueAccountId"):
            await transition_status(
                db, doc_entry=doc_entry, request_body=req, org_id=ORG_ID, user_id=USER_ID
            )


@pytest.mark.asyncio
async def test_open_transition_outbox_event_id_persisted() -> None:
    """
    DRAFT → OPEN: outbox_event_id must be stored on the AR Invoice document.
    """
    db = _FakeDB()
    doc_entry = await _create_draft_ari(db)

    event_id = str(uuid.uuid4())
    with (
        _patch_item_ext(),
        _patch_customer_ext(),
        patch(
            "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
            new_callable=AsyncMock,
            return_value=event_id,
        ),
    ):
        req = ARInvoiceStatusTransitionRequest(new_status=DocumentStatus.OPEN)
        ari = await transition_status(
            db, doc_entry=doc_entry, request_body=req, org_id=ORG_ID, user_id=USER_ID
        )

    # Check persisted on the header doc directly.
    ari_doc = db["ar_invoices_v2"]._docs[0]
    assert ari_doc["outboxEventId"] == event_id
    assert ari.outbox_event_id == event_id


# ---------------------------------------------------------------------------
# Tests: OPEN → CANCELLED (super_admin override path)
# ---------------------------------------------------------------------------


async def _open_ari(db: _FakeDB, doc_entry: str) -> str:
    """Helper: transition an AR Invoice from DRAFT → OPEN."""
    with (
        _patch_item_ext(),
        _patch_customer_ext(),
        patch(
            "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
            new_callable=AsyncMock,
            return_value=str(uuid.uuid4()),
        ),
    ):
        req = ARInvoiceStatusTransitionRequest(new_status=DocumentStatus.OPEN)
        await transition_status(
            db, doc_entry=doc_entry, request_body=req, org_id=ORG_ID, user_id=USER_ID
        )
    return doc_entry


@pytest.mark.asyncio
async def test_cancel_open_invoice_emits_cancelled_event() -> None:
    """
    OPEN → CANCELLED: sales_invoice_cancelled event emitted with originalEventId.
    """
    db = _FakeDB()
    doc_entry = await _create_draft_ari(db)

    original_event_id = str(uuid.uuid4())
    with (
        _patch_item_ext(),
        _patch_customer_ext(),
        patch(
            "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
            new_callable=AsyncMock,
            return_value=original_event_id,
        ),
    ):
        req = ARInvoiceStatusTransitionRequest(new_status=DocumentStatus.OPEN)
        await transition_status(
            db, doc_entry=doc_entry, request_body=req, org_id=ORG_ID, user_id=USER_ID
        )

    cancel_event_id = str(uuid.uuid4())
    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=cancel_event_id,
    ) as mock_cancel:
        cancel_req = ARInvoiceStatusTransitionRequest(new_status=DocumentStatus.CANCELLED)
        ari = await transition_status(
            db, doc_entry=doc_entry, request_body=cancel_req, org_id=ORG_ID, user_id=USER_ID
        )

    assert ari.status == DocumentStatus.CANCELLED
    mock_cancel.assert_called_once()
    cancel_payload = mock_cancel.call_args.kwargs["payload"]
    assert cancel_payload["originalEventId"] == original_event_id
    assert mock_cancel.call_args.kwargs["event_type"] == "sales_invoice_cancelled"


@pytest.mark.asyncio
async def test_cancel_open_from_delivery_decrements_invoiced_qty() -> None:
    """
    OPEN → CANCELLED: Delivery line invoiced_qty should be decremented back.
    """
    db = _FakeDB()
    doc_entry = await _create_draft_ari(db, from_delivery=True)

    # Verify invoiced_qty was incremented on DRAFT creation.
    dn_doc = db["deliveries_v2"]._docs[0]
    dn_line = next(ln for ln in dn_doc["lines"] if ln["lineId"] == DN_LINE_1_ID)
    assert dn_line["invoicedQty"] == pytest.approx(5.0)

    # Open the invoice.
    with (
        _patch_item_ext(),
        _patch_customer_ext(),
        patch(
            "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
            new_callable=AsyncMock,
            return_value=str(uuid.uuid4()),
        ),
    ):
        await transition_status(
            db,
            doc_entry=doc_entry,
            request_body=ARInvoiceStatusTransitionRequest(new_status=DocumentStatus.OPEN),
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # Cancel the invoice.
    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new_callable=AsyncMock,
        return_value=str(uuid.uuid4()),
    ):
        await transition_status(
            db,
            doc_entry=doc_entry,
            request_body=ARInvoiceStatusTransitionRequest(new_status=DocumentStatus.CANCELLED),
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # invoiced_qty should be decremented back.
    dn_doc = db["deliveries_v2"]._docs[0]
    dn_line = next(ln for ln in dn_doc["lines"] if ln["lineId"] == DN_LINE_1_ID)
    assert dn_line["invoicedQty"] == pytest.approx(0.0)


# ---------------------------------------------------------------------------
# Tests: OPEN → PARTLY_CLOSED / CLOSED (super_admin direct mark-paid)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_open_to_partly_closed_direct_call_succeeds() -> None:
    """
    OPEN → PARTLY_CLOSED via direct transition call should succeed (super_admin
    manual mark-paid; normal path is via Customer Receipt in T-100.10).
    """
    db = _FakeDB()
    doc_entry = await _create_draft_ari(db)
    await _open_ari(db, doc_entry)

    req = ARInvoiceStatusTransitionRequest(
        new_status=DocumentStatus.PARTLY_CLOSED,
        reason="Manual super_admin mark — partial payment received outside system",
    )
    ari = await transition_status(
        db, doc_entry=doc_entry, request_body=req, org_id=ORG_ID, user_id=USER_ID
    )
    assert ari.status == DocumentStatus.PARTLY_CLOSED


# ---------------------------------------------------------------------------
# Tests: update (DRAFT only)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_patch_draft_invoice_succeeds() -> None:
    """PATCH on a DRAFT AR Invoice should update the notes field."""
    db = _FakeDB()
    doc_entry = await _create_draft_ari(db)

    upd = ARInvoiceUpdate(notes="Updated note for test")
    ari = await update_ar_invoice(
        db, doc_entry=doc_entry, payload=upd, org_id=ORG_ID, user_id=USER_ID
    )
    assert ari is not None
    assert ari.notes == "Updated note for test"


@pytest.mark.asyncio
async def test_patch_open_invoice_raises() -> None:
    """PATCH on an OPEN AR Invoice should raise ValueError (→ 409)."""
    db = _FakeDB()
    doc_entry = await _create_draft_ari(db)
    await _open_ari(db, doc_entry)

    upd = ARInvoiceUpdate(notes="Should fail")
    with pytest.raises(ValueError, match="only DRAFT AR Invoices may be edited"):
        await update_ar_invoice(
            db, doc_entry=doc_entry, payload=upd, org_id=ORG_ID, user_id=USER_ID
        )


# ---------------------------------------------------------------------------
# Tests: delete (DRAFT only)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_draft_invoice_succeeds() -> None:
    """DELETE on a DRAFT AR Invoice should return True and remove the document."""
    db = _FakeDB()
    doc_entry = await _create_draft_ari(db)

    deleted = await delete_ar_invoice(db, doc_entry=doc_entry, org_id=ORG_ID, user_id=USER_ID)
    assert deleted is True

    result = await get_ar_invoice(db, doc_entry=doc_entry, org_id=ORG_ID)
    assert result is None


@pytest.mark.asyncio
async def test_delete_draft_from_delivery_releases_invoiced_qty() -> None:
    """
    DELETE on a DRAFT from-Delivery AR Invoice should release
    the Delivery line invoiced_qty back to the original value.
    """
    db = _FakeDB()
    doc_entry = await _create_draft_ari(db, from_delivery=True)

    # Verify qty was incremented.
    dn_doc = db["deliveries_v2"]._docs[0]
    dn_line = next(ln for ln in dn_doc["lines"] if ln["lineId"] == DN_LINE_1_ID)
    assert dn_line["invoicedQty"] == pytest.approx(5.0)

    await delete_ar_invoice(db, doc_entry=doc_entry, org_id=ORG_ID, user_id=USER_ID)

    # invoiced_qty should be released.
    dn_line = next(ln for ln in dn_doc["lines"] if ln["lineId"] == DN_LINE_1_ID)
    assert dn_line["invoicedQty"] == pytest.approx(0.0)


@pytest.mark.asyncio
async def test_delete_open_invoice_raises() -> None:
    """DELETE on an OPEN AR Invoice should raise ValueError (→ 409)."""
    db = _FakeDB()
    doc_entry = await _create_draft_ari(db)
    await _open_ari(db, doc_entry)

    with pytest.raises(ValueError, match="only DRAFT AR Invoices may be deleted"):
        await delete_ar_invoice(db, doc_entry=doc_entry, org_id=ORG_ID, user_id=USER_ID)


# ---------------------------------------------------------------------------
# Tests: get / list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_ar_invoice_returns_none_for_missing() -> None:
    """get_ar_invoice should return None for a non-existent doc_entry."""
    db = _FakeDB()
    result = await get_ar_invoice(db, doc_entry="no-such-ari", org_id=ORG_ID)
    assert result is None


@pytest.mark.asyncio
async def test_get_ar_invoice_cross_org_isolation() -> None:
    """get_ar_invoice with a different org_id should return None."""
    db = _FakeDB()
    doc_entry = await _create_draft_ari(db)
    result = await get_ar_invoice(db, doc_entry=doc_entry, org_id=OTHER_ORG_ID)
    assert result is None


@pytest.mark.asyncio
async def test_list_ar_invoices_returns_created_doc() -> None:
    """list_ar_invoices should return the created DRAFT AR Invoice."""
    db = _FakeDB()
    await _create_draft_ari(db)

    result = await list_ar_invoices(db, org_id=ORG_ID)
    assert result["total"] == 1
    assert len(result["items"]) == 1
    assert result["items"][0].status == DocumentStatus.DRAFT


@pytest.mark.asyncio
async def test_list_ar_invoices_cross_org_isolation() -> None:
    """list_ar_invoices for a different org should return empty."""
    db = _FakeDB()
    await _create_draft_ari(db)
    result = await list_ar_invoices(db, org_id=OTHER_ORG_ID)
    assert result["total"] == 0


# ---------------------------------------------------------------------------
# Tests: auth / illegal transitions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_draft_to_cancelled_illegal() -> None:
    """
    DRAFT → CANCELLED is illegal for AR_INVOICE per the LEGAL_TRANSITIONS table.
    """
    db = _FakeDB()
    doc_entry = await _create_draft_ari(db)
    req = ARInvoiceStatusTransitionRequest(new_status=DocumentStatus.CANCELLED)
    with pytest.raises(ValueError, match="Illegal AR_INVOICE transition"):
        await transition_status(
            db, doc_entry=doc_entry, request_body=req, org_id=ORG_ID, user_id=USER_ID
        )


@pytest.mark.asyncio
async def test_closed_invoice_is_terminal() -> None:
    """
    CLOSED is a terminal state — no further transitions are allowed.
    """
    db = _FakeDB()
    doc_entry = await _create_draft_ari(db)
    await _open_ari(db, doc_entry)

    # OPEN → CLOSED
    req = ARInvoiceStatusTransitionRequest(new_status=DocumentStatus.CLOSED)
    await transition_status(
        db, doc_entry=doc_entry, request_body=req, org_id=ORG_ID, user_id=USER_ID
    )

    # CLOSED → OPEN is illegal.
    req2 = ARInvoiceStatusTransitionRequest(new_status=DocumentStatus.OPEN)
    with pytest.raises(ValueError, match="Illegal AR_INVOICE transition"):
        await transition_status(
            db, doc_entry=doc_entry, request_body=req2, org_id=ORG_ID, user_id=USER_ID
        )


@pytest.mark.asyncio
async def test_due_date_computed_from_payment_terms() -> None:
    """
    due_date should be doc_date + payment_terms_days (30 default when no terms).
    """
    db = _FakeDB()
    # Override with a 60-day term in the DB.
    db["payment_terms"]._add({
        "_id": "net60",
        "organizationId": ORG_ID,
        "netDays": 60,
    })

    doc_date = date(2026, 3, 1)
    with _patch_item_ext(), _patch_customer_ext():
        payload2 = ARInvoiceCreate(
            organization_id=ORG_ID,
            company_code=COMPANY_CODE,
            customer_id=CUSTOMER_ID,
            customer_name=CUSTOMER_NAME,
            doc_date=doc_date,
            date_of_supply=date(2026, 2, 15),
            invoice_date=date(2026, 3, 1),
            payment_terms_id="net60",
            lines=[
                ARInvoiceLineCreate(
                    item_id=ITEM_1_ID,
                    item_code="ITEM-ARI-001",
                    item_name="Test Item ARI 1",
                    quantity=Decimal("1"),
                    uom="pcs",
                    unit_price=Decimal("100"),
                )
            ],
        )
        ari = await create_ar_invoice(db, payload=payload2, org_id=ORG_ID, user_id=USER_ID)
    assert ari.due_date == doc_date + __import__("datetime").timedelta(days=60)


@pytest.mark.asyncio
async def test_outbox_failure_does_not_block_transition() -> None:
    """
    If OutboxWriter.publish raises an exception, the DRAFT → OPEN transition
    should still complete (outbox failure is logged but non-blocking).
    """
    db = _FakeDB()
    doc_entry = await _create_draft_ari(db)

    with (
        _patch_item_ext(),
        _patch_customer_ext(),
        patch(
            "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
            new_callable=AsyncMock,
            side_effect=Exception("Outbox DB down"),
        ),
    ):
        req = ARInvoiceStatusTransitionRequest(new_status=DocumentStatus.OPEN)
        ari = await transition_status(
            db, doc_entry=doc_entry, request_body=req, org_id=ORG_ID, user_id=USER_ID
        )

    # Transition should succeed even though outbox failed.
    assert ari.status == DocumentStatus.OPEN
    # outbox_event_id should be None since publish failed.
    assert ari.outbox_event_id is None


# ---------------------------------------------------------------------------
# Tests: Bug #4 — BSON date encoding (T-100.9a.2)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_direct_stores_datetime_not_date() -> None:
    """
    Bug #4 regression test — T-100.9a.2.

    AR Invoice create must store ``datetime.datetime`` objects in MongoDB for
    all date fields (docDate, dateOfSupply, invoiceDate, taxDate, dueDate).
    PyMongo cannot encode bare ``datetime.date`` objects and raises
    ``bson.errors.InvalidDocument`` at runtime.

    Verifies that the raw document stored in the fake-DB collection has
    ``datetime.datetime`` instances (not ``datetime.date``) for all five
    date fields.
    """
    db = _FakeDB()

    with _patch_item_ext(), _patch_customer_ext():
        payload = _make_direct_create_payload(
            date_of_supply=date(2026, 1, 15),
            invoice_date=date(2026, 2, 1),
            doc_date=date(2026, 2, 1),
        )
        ari = await create_ar_invoice(db, payload=payload, org_id=ORG_ID, user_id=USER_ID)

    # Fetch the raw document directly from the in-memory collection to inspect
    # the types stored — the response model re-parses dates through Pydantic.
    raw_docs = db[_ARI_COL]._docs
    assert raw_docs, "No document was inserted"
    raw = raw_docs[0]

    date_fields = ["docDate", "dateOfSupply", "invoiceDate", "taxDate", "dueDate"]
    for field in date_fields:
        value = raw.get(field)
        assert isinstance(value, datetime), (
            f"Field '{field}' must be datetime.datetime for BSON compatibility, "
            f"got {type(value).__name__!r} ({value!r}). "
            "Bug #4: PyMongo cannot encode bare datetime.date."
        )
        # Reason: all dates should be stored at midnight UTC.
        assert value.hour == 0 and value.minute == 0, (
            f"Field '{field}' should be midnight UTC, got {value}"
        )
        assert value.tzinfo is not None, (
            f"Field '{field}' should be timezone-aware, got naive datetime"
        )

    # Sanity: docDate stored as 2026-02-01 midnight UTC.
    assert raw["docDate"] == datetime(2026, 2, 1, 0, 0, 0, tzinfo=timezone.utc)
    # taxDate = min(2026-01-15, 2026-02-01) = 2026-01-15.
    assert raw["taxDate"] == datetime(2026, 1, 15, 0, 0, 0, tzinfo=timezone.utc)
    # dueDate = docDate + 30 days default = 2026-03-03 (Feb has 28 days in 2026).
    assert raw["dueDate"] == datetime(2026, 3, 3, 0, 0, 0, tzinfo=timezone.utc)
    # Response model still returns date values for the consumer.
    assert isinstance(ari.doc_date, (date, datetime))


@pytest.mark.asyncio
async def test_update_draft_stores_datetime_not_date() -> None:
    """
    Bug #4 regression test — update path.

    When a DRAFT AR Invoice is patched with new date fields, the updated
    values stored in MongoDB must also be ``datetime.datetime`` instances.
    """
    db = _FakeDB()

    with _patch_item_ext(), _patch_customer_ext():
        doc_entry = await _create_draft_ari(db)

        update_payload = ARInvoiceUpdate(
            doc_date=date(2026, 3, 1),
            date_of_supply=date(2026, 2, 15),
            invoice_date=date(2026, 3, 1),
        )
        await update_ar_invoice(
            db,
            doc_entry=doc_entry,
            payload=update_payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    raw_docs = db[_ARI_COL]._docs
    assert raw_docs, "No document found after update"
    raw = raw_docs[0]

    for field in ["docDate", "dateOfSupply", "invoiceDate", "taxDate", "dueDate"]:
        value = raw.get(field)
        assert isinstance(value, datetime), (
            f"After update, field '{field}' must be datetime.datetime, "
            f"got {type(value).__name__!r}. Bug #4."
        )


@pytest.mark.asyncio
async def test_create_from_delivery_stores_datetime_not_date() -> None:
    """
    Bug #4 regression test — from-Delivery create path.

    Creating an AR Invoice from a Delivery must also store datetime.datetime
    values (not datetime.date) for all date fields.
    """
    db = _FakeDB()
    db[_DN_COL]._add(_make_delivery(status="open"))

    with _patch_item_ext(), _patch_customer_ext():
        payload = _make_from_delivery_payload(date_of_supply=date(2026, 1, 20))
        await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=DN_DOC_ENTRY,
            payload=payload,
            org_id=ORG_ID,
            user_id=USER_ID,
        )

    # Find the AR Invoice document (not the Delivery).
    ari_docs = db[_ARI_COL]._docs
    assert ari_docs, "No AR Invoice document was inserted"
    raw = ari_docs[0]

    date_fields = ["docDate", "dateOfSupply", "invoiceDate", "taxDate", "dueDate"]
    for field in date_fields:
        value = raw.get(field)
        assert isinstance(value, datetime), (
            f"From-Delivery create: field '{field}' must be datetime.datetime, "
            f"got {type(value).__name__!r}. Bug #4."
        )


# Expose _ARI_COL so the test above can reference it.
_ARI_COL = "ar_invoices_v2"
_DN_COL = "deliveries_v2"
