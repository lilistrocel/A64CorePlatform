"""
Tests for the Sales Order (SO) backend — T-100.7.

Uses the same in-memory fake Motor DB pattern as test_quotes.py (T-100.6).

All tests call service functions directly; route-level tests (auth, HTTP codes)
are covered by the schema validator and service-layer guards.

Run:
    pytest src/modules/sales/tests/test_sales_orders.py -v

All async tests use pytest-asyncio with asyncio mode.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.core.documents.document_status import DocumentStatus
from src.modules.sales.models.quotes import (
    QuoteCreate,
    QuoteLineCreate,
)
from src.modules.sales.models.sales_orders import (
    SalesOrderCreate,
    SalesOrderFromQuoteRequest,
    SalesOrderLineCreate,
    SalesOrderStatusTransitionRequest,
    SalesOrderUpdate,
)
from src.modules.sales.services.quote_service import create_quote
from src.modules.sales.services.sales_order_service import (
    create_sales_order,
    create_sales_order_from_quote,
    delete_sales_order,
    get_sales_order,
    list_sales_orders,
    transition_status,
    update_sales_order,
)

# ---------------------------------------------------------------------------
# In-memory fake Motor DB (mirrors test_quotes.py pattern)
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


class _FakeDB:
    """Minimal fake Motor database."""

    def __init__(self) -> None:
        self._collections: Dict[str, _FakeCollection] = {}

    def __getitem__(self, name: str) -> _FakeCollection:
        if name not in self._collections:
            self._collections[name] = _FakeCollection()
        return self._collections[name]


def _matches(doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
    """Simple query matcher supporting equality, $gte, $lte, $ne, $in, $regex."""
    for key, val in query.items():
        # Handle nested key paths (e.g. "lines.lineId")
        if "." in key:
            parts = key.split(".", 1)
            parent_key = parts[0]
            child_key = parts[1]
            parent_val = doc.get(parent_key)
            if isinstance(parent_val, list):
                # Match if any element in the list matches on child_key
                found = any(
                    _matches(item, {child_key: val})
                    for item in parent_val
                    if isinstance(item, dict)
                )
                if not found:
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
                elif op == "$regex":
                    if doc_val is None or operand.lstrip("^") not in str(doc_val):
                        return False
        else:
            if doc_val != val:
                return False
    return True


def _apply_update(doc: Dict[str, Any], update: Dict[str, Any]) -> None:
    if "$set" in update:
        for key, val in update["$set"].items():
            # Handle nested paths (e.g. "lines.$.consumedQty")
            if ".$." in key:
                # For fake DB: skip positional updates — handled via update_one query filter
                # The test fixtures pre-load documents; the $inc path below handles line updates.
                pass
            else:
                doc[key] = val
    if "$inc" in update:
        for field, delta in update["$inc"].items():
            doc[field] = doc.get(field, 0) + delta
    if "$push" in update:
        for field, val in update["$push"].items():
            if field not in doc:
                doc[field] = []
            doc[field].append(val)


# ---------------------------------------------------------------------------
# Specialised _FakeDB that handles embedded-array positional updates for Quote lines.
# ---------------------------------------------------------------------------


class _FakeDBWithEmbeddedLineSupport(_FakeDB):
    """
    Extends _FakeDB to support MongoDB's positional operator ($) for
    embedded line updates used in the Quote → SO conversion path.

    When update_one is called with a query that matches a ``lines.lineId``
    field and the update contains ``lines.$.consumedQty``, we find the
    matching line inside the document and apply the delta directly.
    """

    def __getitem__(self, name: str) -> "_EmbeddedLineCollection":
        if name not in self._collections:
            self._collections[name] = _EmbeddedLineCollection()
        return self._collections[name]


class _EmbeddedLineCollection(_FakeCollection):
    """
    Extends _FakeCollection to handle positional updates on embedded lines.
    """

    async def update_one(
        self, query: Dict[str, Any], update: Dict[str, Any], **kwargs: Any
    ) -> None:
        for doc in self._docs:
            # Check top-level query fields (doc_entry, organizationId).
            top_matches = all(
                doc.get(k) == v
                for k, v in query.items()
                if "." not in k
            )
            if not top_matches:
                continue

            # Check embedded lines.lineId match.
            line_id_query = None
            for k, v in query.items():
                if k == "lines.lineId":
                    line_id_query = v

            # Apply $set updates on top-level fields.
            if "$set" in update:
                for field, val in update["$set"].items():
                    if not field.startswith("lines.$."):
                        doc[field] = val

            # Apply $inc updates, including embedded positional.
            if "$inc" in update:
                for field, delta in update["$inc"].items():
                    if field.startswith("lines.$."):
                        sub_field = field[len("lines.$."):]
                        if line_id_query is not None:
                            for line in doc.get("lines", []):
                                if line.get("lineId") == line_id_query:
                                    line[sub_field] = line.get(sub_field, 0) + delta
                                    break
                    else:
                        doc[field] = doc.get(field, 0) + delta

            # Apply $push updates.
            if "$push" in update:
                for field, val in update["$push"].items():
                    if field not in doc:
                        doc[field] = []
                    doc[field].append(val)

            return


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_credit_check_approved() -> Dict[str, Any]:
    """Return a mock response body from the finance service (no limit configured)."""
    return {"data": {"creditLimit": None}}


def _make_credit_check_blocked(limit: float = 1000.0) -> Dict[str, Any]:
    """Return a mock response body with a finite credit limit."""
    return {"data": {"creditLimit": limit}}


def _mock_httpx_client(json_body: Dict[str, Any], status_code: int = 200):
    """
    Build a MagicMock for httpx.AsyncClient used as an async context manager.

    The service calls:
        async with httpx.AsyncClient(timeout=...) as client:
            resp = await client.get(url)

    Returns a context manager object that yields a mock with a ``.get()``
    coroutine returning a mock response with ``.status_code`` and ``.json()``.

    Args:
        json_body:   The dict the mock response's ``.json()`` returns.
        status_code: HTTP status code to simulate (default 200).

    Returns:
        A tuple (mock_cls_return_value,) suitable for:
            mock_client_cls.return_value = _mock_httpx_client(...)
    """
    mock_resp = MagicMock()
    mock_resp.status_code = status_code
    mock_resp.json.return_value = json_body

    mock_client = MagicMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    return mock_client


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

ORG_ID = "org-test-001"
OTHER_ORG_ID = "org-test-other"
USER_ID = "user-abc-123"
ADMIN_USER_ID = "admin-user-456"
COMPANY_CODE = "A001"

_SINGLE_LINE = [
    SalesOrderLineCreate(
        item_id="item-1",
        item_code="ITEM-001",
        item_name="Premium Widget",
        quantity=Decimal("10"),
        uom="pcs",
        unit_price=Decimal("50.00"),
        discount_percent=Decimal("0"),
        tax_percent=Decimal("5"),
    )
]

_SO_CREATE_PAYLOAD = SalesOrderCreate(
    organization_id=ORG_ID,
    company_code=COMPANY_CODE,
    customer_id="cust-001",
    customer_name="ACME Corp",
    doc_date=date(2026, 5, 1),
    lines=_SINGLE_LINE,
)

_QUOTE_LINE = QuoteLineCreate(
    item_id="item-1",
    item_code="ITEM-001",
    item_name="Premium Widget",
    quantity=Decimal("100"),
    uom="pcs",
    unit_price=Decimal("50.00"),
    discount_percent=Decimal("0"),
    tax_percent=Decimal("5"),
)

_QUOTE_CREATE_PAYLOAD = QuoteCreate(
    organization_id=ORG_ID,
    company_code=COMPANY_CODE,
    customer_id="cust-001",
    customer_name="ACME Corp",
    doc_date=date(2026, 5, 1),
    valid_until_date=date(2026, 6, 1),
    lines=[_QUOTE_LINE],
)


# ---------------------------------------------------------------------------
# 1. Create from scratch — happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_so_happy_path() -> None:
    """
    create_sales_order returns a DRAFT SO with generated doc_number
    and correctly computed totals.
    """
    db = _FakeDB()
    so = await create_sales_order(db, payload=_SO_CREATE_PAYLOAD, user_id=USER_ID)

    assert so.status == DocumentStatus.DRAFT
    assert so.doc_number == "SO-2026-0001"
    assert so.doc_type == "SO"
    assert so.organization_id == ORG_ID
    assert so.customer_id == "cust-001"
    assert len(so.lines) == 1

    # 10 * 50.00 * (1 - 0/100) = 500.00; tax = 500.00 * 5/100 = 25.00
    assert so.totals.net == Decimal("500.00")
    assert so.totals.tax == Decimal("25.00")
    assert so.totals.gross == Decimal("525.00")

    # All qty fields start at 0 in DRAFT
    ln = so.lines[0]
    assert ln.ordered_qty == Decimal("10")
    assert ln.consumed_qty == Decimal("0")
    assert ln.delivered_qty == Decimal("0")
    assert ln.committed_qty == Decimal("0")

    # doc_entry must be a valid UUID
    uuid.UUID(so.doc_entry)


@pytest.mark.asyncio
async def test_create_so_sequential_doc_numbers() -> None:
    """Two SOs in the same org + year get sequential doc_numbers."""
    db = _FakeDB()
    so1 = await create_sales_order(db, payload=_SO_CREATE_PAYLOAD, user_id=USER_ID)
    so2 = await create_sales_order(db, payload=_SO_CREATE_PAYLOAD, user_id=USER_ID)

    assert so1.doc_number == "SO-2026-0001"
    assert so2.doc_number == "SO-2026-0002"


# ---------------------------------------------------------------------------
# 2. Create from Quote — happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_so_from_quote_happy_path() -> None:
    """
    create_sales_order_from_quote returns a DRAFT SO; Quote line consumedQty
    is incremented and Quote header targetDocRefs contains the new SO ref.
    """
    db = _FakeDBWithEmbeddedLineSupport()
    quote = await create_quote(db, payload=_QUOTE_CREATE_PAYLOAD, user_id=USER_ID)

    so = await create_sales_order_from_quote(
        db,
        quote_doc_entry=quote.doc_entry,
        payload=SalesOrderFromQuoteRequest(),
        org_id=ORG_ID,
        user_id=USER_ID,
    )

    assert so.status == DocumentStatus.DRAFT
    assert so.doc_type == "SO"
    assert so.customer_id == "cust-001"
    assert len(so.lines) == 1

    # SO line quantity = open_qty of the Quote line (100 - 0 = 100)
    assert so.lines[0].ordered_qty == Decimal("100")
    # consumedQty on SO line records how much was taken from the Quote
    assert so.lines[0].consumed_qty == Decimal("100")
    # base_doc_ref on SO line points to Quote line (now a DocumentLinkRef Pydantic object)
    assert so.lines[0].base_doc_ref is not None
    assert so.lines[0].base_doc_ref.doc_type == "QUOTE"

    # SO header baseDocRef points to the Quote header
    assert so.base_doc_ref is not None
    assert so.base_doc_ref.doc_id == quote.doc_entry

    # Quote should now be CLOSED (all lines consumed)
    refreshed_quote_raw = await db["sales_quotes"].find_one(
        {"docEntry": quote.doc_entry, "organizationId": ORG_ID}
    )
    assert refreshed_quote_raw is not None
    assert refreshed_quote_raw["status"] == DocumentStatus.CLOSED.value


@pytest.mark.asyncio
async def test_create_so_from_quote_partial_consumption() -> None:
    """
    After creating SO from Quote, if Quote has > 1 line and only some are
    fully consumed, the Quote remains OPEN/DRAFT (not auto-closed).
    """
    db = _FakeDBWithEmbeddedLineSupport()
    two_line_quote = QuoteCreate(
        organization_id=ORG_ID,
        company_code=COMPANY_CODE,
        customer_id="cust-001",
        customer_name="ACME Corp",
        doc_date=date(2026, 5, 1),
        valid_until_date=date(2026, 6, 1),
        lines=[
            _QUOTE_LINE,   # line 1: qty 100
            QuoteLineCreate(
                item_id="item-2",
                item_code="ITEM-002",
                item_name="Widget B",
                quantity=Decimal("50"),
                uom="pcs",
                unit_price=Decimal("20"),
                tax_percent=Decimal("0"),
            ),
        ],
    )
    quote = await create_quote(db, payload=two_line_quote, user_id=USER_ID)

    # Manually partially consume line 1 (30 of 100) so it won't be fully taken.
    # The from-quote route takes the full open_qty; we pre-set consumedQty=70 on
    # line 1 so only 30 remains — the SO will take that 30 and line 2 fully.
    quote_raw = await db["sales_quotes"].find_one(
        {"docEntry": quote.doc_entry, "organizationId": ORG_ID}
    )
    for line in quote_raw["lines"]:
        if line["lineNumber"] == 1:
            line["consumedQty"] = 70.0  # 30 remains
    # Re-insert with mutation (fake DB stores references, so this updates in-place)

    so = await create_sales_order_from_quote(
        db,
        quote_doc_entry=quote.doc_entry,
        payload=SalesOrderFromQuoteRequest(),
        org_id=ORG_ID,
        user_id=USER_ID,
    )

    # SO was created — both lines had open_qty > 0 (30 and 50)
    assert so.status == DocumentStatus.DRAFT
    assert len(so.lines) == 2


# ---------------------------------------------------------------------------
# 3. Create from Quote — one line has open_qty == 0 → 409
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_so_from_quote_fully_consumed_line_raises() -> None:
    """
    create_sales_order_from_quote raises ValueError when any Quote line
    has open_qty == 0 (already fully consumed).
    """
    db = _FakeDBWithEmbeddedLineSupport()
    quote = await create_quote(db, payload=_QUOTE_CREATE_PAYLOAD, user_id=USER_ID)

    # Mark the single line as fully consumed.
    quote_raw = await db["sales_quotes"].find_one(
        {"docEntry": quote.doc_entry, "organizationId": ORG_ID}
    )
    for line in quote_raw["lines"]:
        line["consumedQty"] = float(line.get("orderedQty", line["quantity"]))

    with pytest.raises(ValueError, match="open_qty == 0"):
        await create_sales_order_from_quote(
            db,
            quote_doc_entry=quote.doc_entry,
            payload=SalesOrderFromQuoteRequest(),
            org_id=ORG_ID,
            user_id=USER_ID,
        )


# ---------------------------------------------------------------------------
# 4. Create from Quote when Quote is CANCELLED → ValueError
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_so_from_cancelled_quote_raises() -> None:
    """
    create_sales_order_from_quote raises ValueError when the Quote is CANCELLED.
    """
    from src.modules.sales.models.quotes import QuoteStatusTransitionRequest
    from src.modules.sales.services.quote_service import transition_status as q_transition

    db = _FakeDBWithEmbeddedLineSupport()
    quote = await create_quote(db, payload=_QUOTE_CREATE_PAYLOAD, user_id=USER_ID)
    await q_transition(
        db,
        doc_entry=quote.doc_entry,
        new_status=DocumentStatus.CANCELLED,
        org_id=ORG_ID,
        user_id=USER_ID,
    )

    with pytest.raises(ValueError, match="must be DRAFT or OPEN"):
        await create_sales_order_from_quote(
            db,
            quote_doc_entry=quote.doc_entry,
            payload=SalesOrderFromQuoteRequest(),
            org_id=ORG_ID,
            user_id=USER_ID,
        )


# ---------------------------------------------------------------------------
# 5. DRAFT → OPEN — credit limit allows → committed_qty set
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transition_draft_to_open_credit_approved() -> None:
    """
    DRAFT → OPEN with credit limit approved:
    committed_qty is set to ordered_qty on every line and credit_check is stored.
    """
    db = _FakeDB()
    so = await create_sales_order(db, payload=_SO_CREATE_PAYLOAD, user_id=USER_ID)

    # Mock the httpx call to return approved (no credit limit configured).
    with patch(
        "src.modules.sales.services.sales_order_service.httpx.AsyncClient"
    ) as mock_client_cls:
        mock_client_cls.return_value = _mock_httpx_client(_make_credit_check_approved())

        transitioned = await transition_status(
            db,
            doc_entry=so.doc_entry,
            request_body=SalesOrderStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=ORG_ID,
            user_id=USER_ID,
            user_role="user",
        )

    assert transitioned is not None
    assert transitioned.status == DocumentStatus.OPEN

    # committed_qty must now equal ordered_qty
    ln = transitioned.lines[0]
    assert ln.committed_qty == ln.ordered_qty

    # credit_check block must be present
    assert transitioned.credit_check is not None
    assert transitioned.credit_check.result == "approved"


# ---------------------------------------------------------------------------
# 6. DRAFT → OPEN — credit limit exceeded → ValueError (HTTP 409)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transition_draft_to_open_credit_blocked() -> None:
    """
    DRAFT → OPEN with credit limit exceeded and no override → ValueError.
    """
    db = _FakeDB()
    so = await create_sales_order(db, payload=_SO_CREATE_PAYLOAD, user_id=USER_ID)

    # SO gross total = 525.00; set credit limit to 100.00 (will block).
    with patch(
        "src.modules.sales.services.sales_order_service.httpx.AsyncClient"
    ) as mock_client_cls:
        mock_client_cls.return_value = _mock_httpx_client(_make_credit_check_blocked(limit=100.0))

        with pytest.raises(ValueError, match="[Cc]redit limit check BLOCKED"):
            await transition_status(
                db,
                doc_entry=so.doc_entry,
                request_body=SalesOrderStatusTransitionRequest(
                    new_status=DocumentStatus.OPEN
                ),
                org_id=ORG_ID,
                user_id=USER_ID,
                user_role="user",
            )


# ---------------------------------------------------------------------------
# 7. DRAFT → OPEN — credit exceeded + super_admin override → 200 with 'override'
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transition_draft_to_open_credit_blocked_admin_override() -> None:
    """
    DRAFT → OPEN with blocked credit but super_admin override:
    transition succeeds with credit_check.result == 'override'.
    """
    db = _FakeDB()
    so = await create_sales_order(db, payload=_SO_CREATE_PAYLOAD, user_id=USER_ID)

    with patch(
        "src.modules.sales.services.sales_order_service.httpx.AsyncClient"
    ) as mock_client_cls:
        mock_client_cls.return_value = _mock_httpx_client(_make_credit_check_blocked(limit=100.0))

        transitioned = await transition_status(
            db,
            doc_entry=so.doc_entry,
            request_body=SalesOrderStatusTransitionRequest(
                new_status=DocumentStatus.OPEN,
                override_credit_check=True,
                override_reason="CEO approved exception for strategic customer",
            ),
            org_id=ORG_ID,
            user_id=ADMIN_USER_ID,
            user_role="super_admin",
        )

    assert transitioned is not None
    assert transitioned.status == DocumentStatus.OPEN
    assert transitioned.credit_check is not None
    assert transitioned.credit_check.result == "override"
    assert transitioned.credit_check.override_by_user_id == ADMIN_USER_ID
    assert transitioned.credit_check.override_reason is not None


# ---------------------------------------------------------------------------
# 8. DRAFT → OPEN — credit exceeded + override from non-admin → PermissionError
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transition_draft_to_open_credit_blocked_non_admin_override_fails() -> None:
    """
    DRAFT → OPEN with override_credit_check=True but caller is not admin → PermissionError.
    """
    db = _FakeDB()
    so = await create_sales_order(db, payload=_SO_CREATE_PAYLOAD, user_id=USER_ID)

    with patch(
        "src.modules.sales.services.sales_order_service.httpx.AsyncClient"
    ) as mock_client_cls:
        mock_client_cls.return_value = _mock_httpx_client(_make_credit_check_blocked(limit=100.0))

        with pytest.raises(PermissionError, match="super_admin or finance_admin"):
            await transition_status(
                db,
                doc_entry=so.doc_entry,
                request_body=SalesOrderStatusTransitionRequest(
                    new_status=DocumentStatus.OPEN,
                    override_credit_check=True,
                    override_reason="I want to proceed anyway",
                ),
                org_id=ORG_ID,
                user_id=USER_ID,
                user_role="user",  # non-admin
            )


# ---------------------------------------------------------------------------
# 9. OPEN → CANCELLED — committed_qty cleared, Quote restored
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transition_open_to_cancelled_restores_quote() -> None:
    """
    OPEN → CANCELLED:
    - committed_qty set to 0 on all lines.
    - Quote's consumed_qty back-decremented.
    - Quote reopened if it was auto-closed.
    """
    db = _FakeDBWithEmbeddedLineSupport()
    quote = await create_quote(db, payload=_QUOTE_CREATE_PAYLOAD, user_id=USER_ID)

    so = await create_sales_order_from_quote(
        db,
        quote_doc_entry=quote.doc_entry,
        payload=SalesOrderFromQuoteRequest(),
        org_id=ORG_ID,
        user_id=USER_ID,
    )

    # Quote should be auto-closed now.
    quote_raw = await db["sales_quotes"].find_one(
        {"docEntry": quote.doc_entry, "organizationId": ORG_ID}
    )
    assert quote_raw["status"] == DocumentStatus.CLOSED.value

    # Transition SO to OPEN first.
    with patch(
        "src.modules.sales.services.sales_order_service.httpx.AsyncClient"
    ) as mock_client_cls:
        mock_client_cls.return_value = _mock_httpx_client(_make_credit_check_approved())

        open_so = await transition_status(
            db,
            doc_entry=so.doc_entry,
            request_body=SalesOrderStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=ORG_ID,
            user_id=USER_ID,
            user_role="user",
        )

    assert open_so.status == DocumentStatus.OPEN
    assert open_so.lines[0].committed_qty == open_so.lines[0].ordered_qty

    # Now cancel.
    cancelled_so = await transition_status(
        db,
        doc_entry=so.doc_entry,
        request_body=SalesOrderStatusTransitionRequest(
            new_status=DocumentStatus.CANCELLED
        ),
        org_id=ORG_ID,
        user_id=USER_ID,
        user_role="user",
    )

    assert cancelled_so.status == DocumentStatus.CANCELLED
    # committed_qty must be 0 after cancel
    assert cancelled_so.lines[0].committed_qty == Decimal("0")

    # Quote must have been reopened to OPEN (it was auto-closed by this SO).
    quote_raw_after = await db["sales_quotes"].find_one(
        {"docEntry": quote.doc_entry, "organizationId": ORG_ID}
    )
    assert quote_raw_after["status"] == DocumentStatus.OPEN.value


# ---------------------------------------------------------------------------
# 10. OPEN → CLOSED while lines have open_qty > 0 → ValueError (HTTP 422)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transition_open_to_closed_with_open_lines_raises() -> None:
    """
    → CLOSED is rejected when lines still have open_qty > 0.
    """
    db = _FakeDB()
    so = await create_sales_order(db, payload=_SO_CREATE_PAYLOAD, user_id=USER_ID)

    # DRAFT → OPEN first.
    with patch(
        "src.modules.sales.services.sales_order_service.httpx.AsyncClient"
    ) as mock_client_cls:
        mock_client_cls.return_value = _mock_httpx_client(_make_credit_check_approved())

        await transition_status(
            db,
            doc_entry=so.doc_entry,
            request_body=SalesOrderStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=ORG_ID,
            user_id=USER_ID,
            user_role="user",
        )

    with pytest.raises(ValueError, match="open_qty"):
        await transition_status(
            db,
            doc_entry=so.doc_entry,
            request_body=SalesOrderStatusTransitionRequest(
                new_status=DocumentStatus.CLOSED
            ),
            org_id=ORG_ID,
            user_id=USER_ID,
            user_role="user",
        )


# ---------------------------------------------------------------------------
# 11. Get / list / pagination
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_so_found() -> None:
    """get_sales_order returns SalesOrderResponse for a known doc_entry."""
    db = _FakeDB()
    created = await create_sales_order(db, payload=_SO_CREATE_PAYLOAD, user_id=USER_ID)

    fetched = await get_sales_order(db, doc_entry=created.doc_entry, org_id=ORG_ID)

    assert fetched is not None
    assert fetched.doc_entry == created.doc_entry
    assert fetched.doc_number == "SO-2026-0001"
    assert len(fetched.lines) == 1


@pytest.mark.asyncio
async def test_get_so_not_found() -> None:
    """get_sales_order returns None for an unknown doc_entry."""
    db = _FakeDB()
    result = await get_sales_order(db, doc_entry=str(uuid.uuid4()), org_id=ORG_ID)
    assert result is None


@pytest.mark.asyncio
async def test_list_sos_pagination() -> None:
    """list_sales_orders returns correct page metadata."""
    db = _FakeDB()
    for _ in range(5):
        await create_sales_order(db, payload=_SO_CREATE_PAYLOAD, user_id=USER_ID)

    result = await list_sales_orders(db, org_id=ORG_ID, page=1, size=2)

    assert result["total"] == 5
    assert result["totalPages"] == 3
    assert len(result["items"]) == 2


@pytest.mark.asyncio
async def test_list_sos_status_filter() -> None:
    """list_sales_orders filters by status correctly."""
    db = _FakeDB()
    so = await create_sales_order(db, payload=_SO_CREATE_PAYLOAD, user_id=USER_ID)

    with patch(
        "src.modules.sales.services.sales_order_service.httpx.AsyncClient"
    ) as mock_client_cls:
        mock_client_cls.return_value = _mock_httpx_client(_make_credit_check_approved())

        await transition_status(
            db,
            doc_entry=so.doc_entry,
            request_body=SalesOrderStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=ORG_ID,
            user_id=USER_ID,
            user_role="user",
        )

    await create_sales_order(db, payload=_SO_CREATE_PAYLOAD, user_id=USER_ID)

    draft_result = await list_sales_orders(db, org_id=ORG_ID, status="draft")
    open_result = await list_sales_orders(db, org_id=ORG_ID, status="open")

    assert draft_result["total"] == 1
    assert open_result["total"] == 1


# ---------------------------------------------------------------------------
# 12. Cross-org isolation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cross_org_isolation() -> None:
    """SOs created in org A are not visible to org B."""
    db = _FakeDB()
    await create_sales_order(db, payload=_SO_CREATE_PAYLOAD, user_id=USER_ID)

    result = await list_sales_orders(db, org_id=OTHER_ORG_ID)
    assert result["total"] == 0
    assert result["items"] == []


# ---------------------------------------------------------------------------
# 13. Patch in DRAFT → 200, totals recomputed
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_so_draft_recomputes_totals() -> None:
    """Updating lines in DRAFT recomputes header totals."""
    db = _FakeDB()
    created = await create_sales_order(db, payload=_SO_CREATE_PAYLOAD, user_id=USER_ID)

    updated = await update_sales_order(
        db,
        doc_entry=created.doc_entry,
        payload=SalesOrderUpdate(
            lines=[
                SalesOrderLineCreate(
                    item_id="item-1",
                    item_code="ITEM-001",
                    item_name="Premium Widget",
                    quantity=Decimal("20"),  # doubled
                    uom="pcs",
                    unit_price=Decimal("50.00"),
                    tax_percent=Decimal("5"),
                )
            ]
        ),
        org_id=ORG_ID,
        user_id=USER_ID,
    )

    assert updated is not None
    # 20 * 50 = 1000 net; 1000 * 0.05 = 50 tax
    assert updated.totals.net == Decimal("1000.00")
    assert updated.totals.tax == Decimal("50.00")
    assert updated.totals.gross == Decimal("1050.00")


# ---------------------------------------------------------------------------
# 14. Patch in OPEN → 409
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_so_non_draft_raises() -> None:
    """update_sales_order raises ValueError when SO is not in DRAFT."""
    db = _FakeDB()
    created = await create_sales_order(db, payload=_SO_CREATE_PAYLOAD, user_id=USER_ID)

    with patch(
        "src.modules.sales.services.sales_order_service.httpx.AsyncClient"
    ) as mock_client_cls:
        mock_client_cls.return_value = _mock_httpx_client(_make_credit_check_approved())

        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=SalesOrderStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=ORG_ID,
            user_id=USER_ID,
            user_role="user",
        )

    with pytest.raises(ValueError, match="DRAFT"):
        await update_sales_order(
            db,
            doc_entry=created.doc_entry,
            payload=SalesOrderUpdate(notes="changed"),
            org_id=ORG_ID,
            user_id=USER_ID,
        )


# ---------------------------------------------------------------------------
# 15. Delete from-quote SO in DRAFT → True, Quote consumed_qty restored
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_from_quote_so_in_draft_restores_quote() -> None:
    """
    Deleting a DRAFT from-quote SO returns True and restores the Quote's
    consumed_qty on each corresponding line.
    """
    db = _FakeDBWithEmbeddedLineSupport()
    quote = await create_quote(db, payload=_QUOTE_CREATE_PAYLOAD, user_id=USER_ID)

    so = await create_sales_order_from_quote(
        db,
        quote_doc_entry=quote.doc_entry,
        payload=SalesOrderFromQuoteRequest(),
        org_id=ORG_ID,
        user_id=USER_ID,
    )

    # SO is DRAFT — delete should succeed.
    deleted = await delete_sales_order(
        db, doc_entry=so.doc_entry, org_id=ORG_ID, user_id=USER_ID
    )
    assert deleted is True

    # SO must be gone.
    gone = await get_sales_order(db, doc_entry=so.doc_entry, org_id=ORG_ID)
    assert gone is None

    # Quote line consumedQty must be back to 0.
    refreshed_quote = await db["sales_quotes"].find_one(
        {"docEntry": quote.doc_entry, "organizationId": ORG_ID}
    )
    assert refreshed_quote is not None
    for line in refreshed_quote["lines"]:
        assert line.get("consumedQty", 0) == 0.0


# ---------------------------------------------------------------------------
# 16. Delete OPEN SO → ValueError (not DRAFT)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_open_so_raises() -> None:
    """delete_sales_order raises ValueError when SO is not in DRAFT."""
    db = _FakeDB()
    created = await create_sales_order(db, payload=_SO_CREATE_PAYLOAD, user_id=USER_ID)

    with patch(
        "src.modules.sales.services.sales_order_service.httpx.AsyncClient"
    ) as mock_client_cls:
        mock_client_cls.return_value = _mock_httpx_client(_make_credit_check_approved())

        await transition_status(
            db,
            doc_entry=created.doc_entry,
            request_body=SalesOrderStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=ORG_ID,
            user_id=USER_ID,
            user_role="user",
        )

    with pytest.raises(ValueError, match="DRAFT"):
        await delete_sales_order(
            db, doc_entry=created.doc_entry, org_id=ORG_ID, user_id=USER_ID
        )


# ---------------------------------------------------------------------------
# 17. Illegal transition (terminal state) → ValueError
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transition_from_closed_is_illegal() -> None:
    """
    CLOSED is a terminal state for SO.  Any further transition raises ValueError.
    """
    db = _FakeDB()
    so = await create_sales_order(db, payload=_SO_CREATE_PAYLOAD, user_id=USER_ID)

    # DRAFT → CANCELLED (legal).
    await transition_status(
        db,
        doc_entry=so.doc_entry,
        request_body=SalesOrderStatusTransitionRequest(
            new_status=DocumentStatus.CANCELLED
        ),
        org_id=ORG_ID,
        user_id=USER_ID,
        user_role="user",
    )

    # CANCELLED → anything must be illegal.
    with pytest.raises(ValueError, match="Illegal|terminal"):
        await transition_status(
            db,
            doc_entry=so.doc_entry,
            request_body=SalesOrderStatusTransitionRequest(
                new_status=DocumentStatus.OPEN
            ),
            org_id=ORG_ID,
            user_id=USER_ID,
            user_role="user",
        )


# ---------------------------------------------------------------------------
# 18. Customer filter on list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_sos_customer_filter() -> None:
    """list_sales_orders filters by customer_id."""
    db = _FakeDB()
    await create_sales_order(db, payload=_SO_CREATE_PAYLOAD, user_id=USER_ID)

    other_payload = SalesOrderCreate(
        organization_id=ORG_ID,
        company_code=COMPANY_CODE,
        customer_id="cust-999",
        customer_name="Other Corp",
        doc_date=date(2026, 5, 1),
        lines=_SINGLE_LINE,
    )
    await create_sales_order(db, payload=other_payload, user_id=USER_ID)

    result = await list_sales_orders(db, org_id=ORG_ID, customer_id="cust-001")
    assert result["total"] == 1
    assert result["items"][0].customer_id == "cust-001"


# ---------------------------------------------------------------------------
# 19. bp_ref_no and journal_memo round-trip
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_so_with_bp_ref_and_memo() -> None:
    """BPReferenceMixin and JournalMemoMixin fields round-trip correctly."""
    db = _FakeDB()
    payload = SalesOrderCreate(
        organization_id=ORG_ID,
        company_code=COMPANY_CODE,
        customer_id="cust-001",
        customer_name="ACME Corp",
        doc_date=date(2026, 5, 1),
        bp_ref_no="PO-CUST-2026-001",
        journal_memo="Q2 supply commitment",
        lines=_SINGLE_LINE,
    )
    so = await create_sales_order(db, payload=payload, user_id=USER_ID)

    assert so.bp_ref_no == "PO-CUST-2026-001"
    assert so.journal_memo == "Q2 supply commitment"


# ---------------------------------------------------------------------------
# 20. Schema validation: delivery_date before doc_date → ValueError
# ---------------------------------------------------------------------------


def test_create_so_invalid_delivery_date() -> None:
    """SalesOrderCreate raises ValueError when delivery_date < doc_date."""
    with pytest.raises(ValueError, match="delivery_date"):
        SalesOrderCreate(
            organization_id=ORG_ID,
            company_code=COMPANY_CODE,
            customer_id="cust-001",
            customer_name="ACME Corp",
            doc_date=date(2026, 6, 1),
            delivery_date=date(2026, 5, 1),  # before doc_date
            lines=_SINGLE_LINE,
        )
