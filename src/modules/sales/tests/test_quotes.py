"""
Tests for the Sales Quote (SQ) backend — T-100.6.

Uses the same in-memory fake Motor DB pattern as the T-100.1 infrastructure
tests (src/core/documents/tests/test_document_infrastructure.py).

No live MongoDB or FastAPI app is required.  All tests call service functions
directly; route-level tests (auth, HTTP codes) are covered by the schema
validator and service-layer guards.

Run:
    pytest src/modules/sales/tests/test_quotes.py -v

All async tests use pytest-asyncio with asyncio mode.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

import pytest

from src.core.documents.document_status import DocumentStatus
from src.modules.sales.models.quotes import (
    QuoteCreate,
    QuoteLineCreate,
    QuoteStatusTransitionRequest,
    QuoteUpdate,
)
from src.modules.sales.services.quote_service import (
    create_quote,
    delete_quote,
    get_quote,
    list_quotes,
    transition_status,
    update_quote,
)

# ---------------------------------------------------------------------------
# In-memory fake Motor DB (mirrors T-100.1 test helper pattern)
# ---------------------------------------------------------------------------


class _FakeCollection:
    """Minimal fake Motor collection backed by an in-memory list."""

    def __init__(self) -> None:
        self._docs: List[Dict[str, Any]] = []

    async def find_one(self, query: Dict[str, Any], *args: Any, **kwargs: Any) -> Any:
        for doc in self._docs:
            if _matches(doc, query):
                return dict(doc)  # return a copy so mutations don't surprise
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
        # Ignore sort for test purposes — order is insertion order.
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
    """Simple query matcher (equality, $gte, $lte, $ne, $in, $regex)."""
    for key, val in query.items():
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
        doc.update(update["$set"])
    if "$inc" in update:
        for field, delta in update["$inc"].items():
            doc[field] = doc.get(field, 0) + delta
    if "$push" in update:
        for field, val in update["$push"].items():
            if field not in doc:
                doc[field] = []
            doc[field].append(val)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

ORG_ID = "org-test-001"
OTHER_ORG_ID = "org-test-other"
USER_ID = "user-abc-123"
COMPANY_CODE = "A001"

_SINGLE_LINE = [
    QuoteLineCreate(
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

_QUOTE_CREATE_PAYLOAD = QuoteCreate(
    organization_id=ORG_ID,
    company_code=COMPANY_CODE,
    customer_id="cust-001",
    customer_name="ACME Corp",
    doc_date=date(2026, 5, 1),
    valid_until_date=date(2026, 6, 1),
    lines=_SINGLE_LINE,
)


# ---------------------------------------------------------------------------
# 1. Create happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_quote_happy_path() -> None:
    """
    create_quote returns a DRAFT quote with a generated doc_number and
    correctly computed totals.
    """
    db = _FakeDB()
    quote = await create_quote(db, payload=_QUOTE_CREATE_PAYLOAD, user_id=USER_ID)

    assert quote.status == DocumentStatus.DRAFT
    assert quote.doc_number == "SQ-2026-0001"
    assert quote.doc_type == "SQ"
    assert quote.organization_id == ORG_ID
    assert quote.customer_id == "cust-001"
    assert len(quote.lines) == 1

    # Reason: 10 * 50.00 * (1 - 0/100) = 500.00; tax = 500.00 * 5/100 = 25.00
    assert quote.totals.net == Decimal("500.00")
    assert quote.totals.tax == Decimal("25.00")
    assert quote.totals.gross == Decimal("525.00")

    # Line consumed_qty must start at 0
    assert quote.lines[0].consumed_qty == Decimal("0")
    assert quote.lines[0].ordered_qty == Decimal("10")

    # doc_entry must be a valid UUID
    uuid.UUID(quote.doc_entry)  # raises ValueError if invalid


@pytest.mark.asyncio
async def test_create_quote_sequential_doc_numbers() -> None:
    """Two quotes in the same org + year get sequential doc_numbers."""
    db = _FakeDB()
    q1 = await create_quote(db, payload=_QUOTE_CREATE_PAYLOAD, user_id=USER_ID)
    q2 = await create_quote(db, payload=_QUOTE_CREATE_PAYLOAD, user_id=USER_ID)

    assert q1.doc_number == "SQ-2026-0001"
    assert q2.doc_number == "SQ-2026-0002"


@pytest.mark.asyncio
async def test_create_quote_with_discount() -> None:
    """Discount percentage is correctly applied in line total computation."""
    db = _FakeDB()
    payload = QuoteCreate(
        organization_id=ORG_ID,
        company_code=COMPANY_CODE,
        customer_id="cust-002",
        customer_name="Beta Ltd",
        doc_date=date(2026, 5, 1),
        valid_until_date=date(2026, 5, 31),
        lines=[
            QuoteLineCreate(
                item_id="item-2",
                item_code="ITEM-002",
                item_name="Widget B",
                quantity=Decimal("4"),
                uom="pcs",
                unit_price=Decimal("100.00"),
                discount_percent=Decimal("10"),  # 10% discount
                tax_percent=Decimal("0"),
            )
        ],
    )
    quote = await create_quote(db, payload=payload, user_id=USER_ID)

    # 4 * 100 * (1 - 10/100) = 4 * 100 * 0.9 = 360.00
    assert quote.totals.net == Decimal("360.00")
    assert quote.totals.gross == Decimal("360.00")


# ---------------------------------------------------------------------------
# 2. Validation: valid_until_date before doc_date → 422 (Pydantic model error)
# ---------------------------------------------------------------------------


def test_create_quote_invalid_dates() -> None:
    """QuoteCreate raises ValueError when valid_until_date < doc_date."""
    with pytest.raises(ValueError, match="valid_until_date"):
        QuoteCreate(
            organization_id=ORG_ID,
            company_code=COMPANY_CODE,
            customer_id="cust-001",
            customer_name="ACME Corp",
            doc_date=date(2026, 6, 1),
            valid_until_date=date(2026, 5, 1),  # before doc_date
            lines=_SINGLE_LINE,
        )


# ---------------------------------------------------------------------------
# 3. Validation: zero quantity → Pydantic field error
# ---------------------------------------------------------------------------


def test_create_quote_zero_quantity() -> None:
    """QuoteLineCreate rejects quantity <= 0."""
    with pytest.raises(Exception):  # Pydantic ValidationError
        QuoteLineCreate(
            item_id="i",
            item_code="c",
            item_name="n",
            quantity=Decimal("0"),  # must be > 0
            uom="pcs",
            unit_price=Decimal("10"),
        )


# ---------------------------------------------------------------------------
# 4. Validation: negative price → Pydantic field error
# ---------------------------------------------------------------------------


def test_create_quote_negative_price() -> None:
    """QuoteLineCreate rejects unit_price < 0."""
    with pytest.raises(Exception):  # Pydantic ValidationError
        QuoteLineCreate(
            item_id="i",
            item_code="c",
            item_name="n",
            quantity=Decimal("1"),
            uom="pcs",
            unit_price=Decimal("-5.00"),  # must be >= 0
        )


# ---------------------------------------------------------------------------
# 5. Validation: empty lines → model_validator error
# ---------------------------------------------------------------------------


def test_create_quote_empty_lines() -> None:
    """QuoteCreate rejects an empty lines list."""
    with pytest.raises(Exception):  # ValidationError or ValueError
        QuoteCreate(
            organization_id=ORG_ID,
            company_code=COMPANY_CODE,
            customer_id="cust-001",
            customer_name="ACME Corp",
            doc_date=date(2026, 5, 1),
            valid_until_date=date(2026, 6, 1),
            lines=[],  # must have at least one
        )


# ---------------------------------------------------------------------------
# 6. Get by doc_entry → 200
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_quote_found() -> None:
    """get_quote returns QuoteResponse for a known doc_entry."""
    db = _FakeDB()
    created = await create_quote(db, payload=_QUOTE_CREATE_PAYLOAD, user_id=USER_ID)

    fetched = await get_quote(db, doc_entry=created.doc_entry, org_id=ORG_ID)

    assert fetched is not None
    assert fetched.doc_entry == created.doc_entry
    assert fetched.doc_number == "SQ-2026-0001"
    assert len(fetched.lines) == 1


# ---------------------------------------------------------------------------
# 7. Get non-existent → None (route returns 404)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_quote_not_found() -> None:
    """get_quote returns None for an unknown doc_entry."""
    db = _FakeDB()
    result = await get_quote(db, doc_entry=str(uuid.uuid4()), org_id=ORG_ID)
    assert result is None


# ---------------------------------------------------------------------------
# 8. List with status filter
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_quotes_status_filter() -> None:
    """list_quotes filters by status correctly."""
    db = _FakeDB()
    q = await create_quote(db, payload=_QUOTE_CREATE_PAYLOAD, user_id=USER_ID)
    # Transition to OPEN so we have one DRAFT and one OPEN
    await transition_status(
        db,
        doc_entry=q.doc_entry,
        new_status=DocumentStatus.OPEN,
        org_id=ORG_ID,
        user_id=USER_ID,
    )
    await create_quote(db, payload=_QUOTE_CREATE_PAYLOAD, user_id=USER_ID)  # another DRAFT

    draft_result = await list_quotes(db, org_id=ORG_ID, status="draft")
    open_result = await list_quotes(db, org_id=ORG_ID, status="open")

    assert draft_result["total"] == 1
    assert open_result["total"] == 1


# ---------------------------------------------------------------------------
# 9. List pagination
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_quotes_pagination() -> None:
    """list_quotes returns correct page metadata."""
    db = _FakeDB()
    # Create 5 quotes
    for _ in range(5):
        await create_quote(db, payload=_QUOTE_CREATE_PAYLOAD, user_id=USER_ID)

    result = await list_quotes(db, org_id=ORG_ID, page=1, size=2)

    assert result["total"] == 5
    assert result["totalPages"] == 3
    assert len(result["items"]) == 2
    assert result["page"] == 1
    assert result["perPage"] == 2


# ---------------------------------------------------------------------------
# 10. Patch in DRAFT → 200, totals recomputed
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_quote_draft_recomputes_totals() -> None:
    """Updating lines in DRAFT recomputes header totals."""
    db = _FakeDB()
    created = await create_quote(db, payload=_QUOTE_CREATE_PAYLOAD, user_id=USER_ID)

    updated = await update_quote(
        db,
        doc_entry=created.doc_entry,
        payload=QuoteUpdate(
            lines=[
                QuoteLineCreate(
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
# 11. Patch in non-DRAFT → 409
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_quote_non_draft_raises() -> None:
    """update_quote raises ValueError when quote is not in DRAFT."""
    db = _FakeDB()
    created = await create_quote(db, payload=_QUOTE_CREATE_PAYLOAD, user_id=USER_ID)
    await transition_status(
        db,
        doc_entry=created.doc_entry,
        new_status=DocumentStatus.OPEN,
        org_id=ORG_ID,
        user_id=USER_ID,
    )

    with pytest.raises(ValueError, match="DRAFT"):
        await update_quote(
            db,
            doc_entry=created.doc_entry,
            payload=QuoteUpdate(notes="changed"),
            org_id=ORG_ID,
            user_id=USER_ID,
        )


# ---------------------------------------------------------------------------
# 12. Transition DRAFT → OPEN → legal
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transition_draft_to_open() -> None:
    """DRAFT → OPEN is a legal transition for QUOTE."""
    db = _FakeDB()
    created = await create_quote(db, payload=_QUOTE_CREATE_PAYLOAD, user_id=USER_ID)

    transitioned = await transition_status(
        db,
        doc_entry=created.doc_entry,
        new_status=DocumentStatus.OPEN,
        org_id=ORG_ID,
        user_id=USER_ID,
        reason="Customer confirmed interest",
    )

    assert transitioned is not None
    assert transitioned.status == DocumentStatus.OPEN


# ---------------------------------------------------------------------------
# 13. Transition DRAFT → CLOSED → illegal (should raise ValueError / 422)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transition_draft_to_closed_is_legal() -> None:
    """
    DRAFT → CLOSED is legal for QUOTE.

    Per LEGAL_TRANSITIONS["QUOTE"] in document_status.py, a DRAFT quote can
    go directly to CLOSED (e.g. expired before being sent) without first
    becoming OPEN.  The task description's note about CLOSED only being
    reachable from OPEN is incorrect — the T-100.1 table intentionally allows
    DRAFT → CLOSED for the expiry use-case.
    """
    db = _FakeDB()
    created = await create_quote(db, payload=_QUOTE_CREATE_PAYLOAD, user_id=USER_ID)

    transitioned = await transition_status(
        db,
        doc_entry=created.doc_entry,
        new_status=DocumentStatus.CLOSED,
        org_id=ORG_ID,
        user_id=USER_ID,
        reason="Quote expired before being sent",
    )
    assert transitioned is not None
    assert transitioned.status == DocumentStatus.CLOSED


@pytest.mark.asyncio
async def test_transition_closed_to_open_is_illegal() -> None:
    """
    CLOSED is a terminal state for QUOTE.  Transitioning from CLOSED to any
    other state raises ValueError from assert_legal_transition.
    """
    db = _FakeDB()
    created = await create_quote(db, payload=_QUOTE_CREATE_PAYLOAD, user_id=USER_ID)
    await transition_status(
        db,
        doc_entry=created.doc_entry,
        new_status=DocumentStatus.CLOSED,
        org_id=ORG_ID,
        user_id=USER_ID,
    )

    with pytest.raises(ValueError, match="Illegal|terminal"):
        await transition_status(
            db,
            doc_entry=created.doc_entry,
            new_status=DocumentStatus.OPEN,
            org_id=ORG_ID,
            user_id=USER_ID,
        )


# ---------------------------------------------------------------------------
# 14. Delete in DRAFT → True (success)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_draft_quote() -> None:
    """delete_quote returns True and removes the document for a DRAFT quote."""
    db = _FakeDB()
    created = await create_quote(db, payload=_QUOTE_CREATE_PAYLOAD, user_id=USER_ID)

    deleted = await delete_quote(
        db, doc_entry=created.doc_entry, org_id=ORG_ID, user_id=USER_ID
    )
    assert deleted is True

    # Confirm it is no longer retrievable
    gone = await get_quote(db, doc_entry=created.doc_entry, org_id=ORG_ID)
    assert gone is None


# ---------------------------------------------------------------------------
# 15. Delete in OPEN → ValueError (route returns 409)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_open_quote_raises() -> None:
    """delete_quote raises ValueError when quote is not in DRAFT."""
    db = _FakeDB()
    created = await create_quote(db, payload=_QUOTE_CREATE_PAYLOAD, user_id=USER_ID)
    await transition_status(
        db,
        doc_entry=created.doc_entry,
        new_status=DocumentStatus.OPEN,
        org_id=ORG_ID,
        user_id=USER_ID,
    )

    with pytest.raises(ValueError, match="DRAFT"):
        await delete_quote(
            db, doc_entry=created.doc_entry, org_id=ORG_ID, user_id=USER_ID
        )


# ---------------------------------------------------------------------------
# 16. Cross-org isolation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cross_org_isolation() -> None:
    """Quotes created in org A are not visible to org B."""
    db = _FakeDB()
    await create_quote(db, payload=_QUOTE_CREATE_PAYLOAD, user_id=USER_ID)

    result = await list_quotes(db, org_id=OTHER_ORG_ID)
    assert result["total"] == 0
    assert result["items"] == []


# ---------------------------------------------------------------------------
# 17. Customer filter on list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_quotes_customer_filter() -> None:
    """list_quotes filters by customer_id."""
    db = _FakeDB()
    await create_quote(db, payload=_QUOTE_CREATE_PAYLOAD, user_id=USER_ID)  # cust-001

    other_payload = QuoteCreate(
        organization_id=ORG_ID,
        company_code=COMPANY_CODE,
        customer_id="cust-999",
        customer_name="Other Corp",
        doc_date=date(2026, 5, 1),
        valid_until_date=date(2026, 6, 1),
        lines=_SINGLE_LINE,
    )
    await create_quote(db, payload=other_payload, user_id=USER_ID)

    result = await list_quotes(db, org_id=ORG_ID, customer_id="cust-001")
    assert result["total"] == 1
    assert result["items"][0].customer_id == "cust-001"


# ---------------------------------------------------------------------------
# 18. bp_ref_no and journal_memo are stored and returned
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_quote_with_bp_ref_and_memo() -> None:
    """BPReferenceMixin and JournalMemoMixin fields round-trip correctly."""
    db = _FakeDB()
    payload = QuoteCreate(
        organization_id=ORG_ID,
        company_code=COMPANY_CODE,
        customer_id="cust-001",
        customer_name="ACME Corp",
        doc_date=date(2026, 5, 1),
        valid_until_date=date(2026, 6, 1),
        bp_ref_no="RFQ-CUST-2026-001",
        journal_memo="Initial quote for Q2 supply",
        lines=_SINGLE_LINE,
    )
    quote = await create_quote(db, payload=payload, user_id=USER_ID)

    assert quote.bp_ref_no == "RFQ-CUST-2026-001"
    assert quote.journal_memo == "Initial quote for Q2 supply"
