"""
Tests for the AR Aging report service — T-200.2.

Covers:
    1. Empty result for an org with no invoices.
    2. One invoice in each bucket (current / 1-30 / 31-60 / 61-90 / over90).
    3. Multi-currency grouping (AED + USD invoices stay separate rows).
    4. Customer filter (customer_id param isolates one customer's invoices).
    5. Invoices in DRAFT / CLOSED / CANCELLED are excluded from the report.
    6. Decimal precision: amounts rounded to 2dp; totals consistent.

Run:
    cd /home/noobcity/Code/A64CorePlatform
    PYTHONPATH=src python -m pytest src/modules/sales/tests/test_ar_aging.py -v

All async tests use pytest-asyncio with asyncio_mode = "auto".
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

import pytest

from src.modules.sales.services.reports_service import compute_ar_aging

# ---------------------------------------------------------------------------
# Minimal in-memory fake Motor DB (lifted from test_ar_invoices.py pattern)
# ---------------------------------------------------------------------------


class _FakeCollection:
    """Minimal fake Motor collection backed by an in-memory list."""

    def __init__(self) -> None:
        self._docs: List[Dict[str, Any]] = []

    def _add(self, doc: Dict[str, Any]) -> None:
        self._docs.append(doc)

    async def find_one(
        self, query: Dict[str, Any], *args: Any, **kwargs: Any
    ) -> Optional[Dict[str, Any]]:
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


class _FakeCursor:
    def __init__(self, docs: List[Dict[str, Any]]) -> None:
        self._docs = docs

    async def to_list(self, length: Optional[int] = None) -> List[Dict[str, Any]]:
        if length is None:
            return list(self._docs)
        return self._docs[:length]


class _FakeDB:
    """Dict-like fake database that creates collections on demand."""

    def __init__(self) -> None:
        self._cols: Dict[str, _FakeCollection] = defaultdict(_FakeCollection)

    def __getitem__(self, name: str) -> _FakeCollection:
        return self._cols[name]


def _matches(doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
    """
    Minimal MongoDB-style query matcher.

    Supports: exact value, $in, $nin operators.
    Does NOT support $gte/$lte or nested paths — not needed here.
    """
    for key, val in query.items():
        doc_val = doc.get(key)
        if isinstance(val, dict):
            if "$in" in val:
                if doc_val not in val["$in"]:
                    return False
            elif "$nin" in val:
                if doc_val in val["$nin"]:
                    return False
        else:
            if doc_val != val:
                return False
    return True


# ---------------------------------------------------------------------------
# Helper: build a minimal ar_invoices_v2 document
# ---------------------------------------------------------------------------

_ORG_ID = "00000000-0000-0000-0000-000000000001"
_CUSTOMER_A = "aaaa0000-0000-0000-0000-000000000001"
_CUSTOMER_B = "bbbb0000-0000-0000-0000-000000000002"


def _make_invoice(
    *,
    customer_id: str = _CUSTOMER_A,
    customer_name: str = "Acme Ltd",
    currency: str = "AED",
    due_date: date,
    status: str = "open",
    open_amount: Decimal = Decimal("100.00"),
) -> Dict[str, Any]:
    """Build a minimal ar_invoices_v2 document for testing."""
    return {
        "docEntry": str(uuid.uuid4()),
        "docNumber": f"ARI-2026-{uuid.uuid4().hex[:4].upper()}",
        "organizationId": _ORG_ID,
        "customerId": customer_id,
        "customerName": customer_name,
        "currency": currency,
        "dueDate": datetime(
            due_date.year, due_date.month, due_date.day, tzinfo=timezone.utc
        ),
        "status": status,
        "totals": {
            "net": float(open_amount),
            "tax": 0,
            "gross": float(open_amount),
            "paidAmount": 0,
            "creditedAmount": 0,
            "openAmount": float(open_amount),
        },
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_empty_result_no_invoices() -> None:
    """Empty org returns an empty customers list and zero grand totals."""
    db = _FakeDB()
    # No invoices seeded.
    report = await compute_ar_aging(db, _ORG_ID, as_of_date=date(2026, 5, 30))

    assert report.as_of_date == date(2026, 5, 30)
    assert report.customers == []
    assert report.grand_totals.total == Decimal("0.00")
    assert report.grand_totals.customer_count == 0
    assert report.grand_totals.invoice_count == 0


@pytest.mark.asyncio
async def test_one_invoice_per_bucket() -> None:
    """
    Seed five invoices with due dates that place them in each bucket.
    as_of_date = 2026-05-30

        current:   due 2026-05-31 (tomorrow — not yet due)
        1-30:      due 2026-05-15 (15 days overdue)
        31-60:     due 2026-04-20 (40 days overdue)
        61-90:     due 2026-03-31 (60 days overdue) — boundary
        over90:    due 2026-02-01 (118 days overdue)
    """
    db = _FakeDB()
    as_of = date(2026, 5, 30)

    inv_current = _make_invoice(
        due_date=date(2026, 5, 31), open_amount=Decimal("100.00")
    )
    inv_1_30 = _make_invoice(due_date=date(2026, 5, 15), open_amount=Decimal("200.00"))
    inv_31_60 = _make_invoice(due_date=date(2026, 4, 20), open_amount=Decimal("300.00"))
    inv_61_90 = _make_invoice(due_date=date(2026, 3, 1), open_amount=Decimal("400.00"))
    inv_over90 = _make_invoice(due_date=date(2026, 2, 1), open_amount=Decimal("500.00"))

    for inv in [inv_current, inv_1_30, inv_31_60, inv_61_90, inv_over90]:
        db["ar_invoices_v2"]._add(inv)

    report = await compute_ar_aging(db, _ORG_ID, as_of_date=as_of)

    assert len(report.customers) == 1
    row = report.customers[0]
    assert row.current == Decimal("100.00")
    assert row.days_1_to_30 == Decimal("200.00")
    assert row.days_31_to_60 == Decimal("300.00")
    assert row.days_61_to_90 == Decimal("400.00")
    assert row.over_90 == Decimal("500.00")
    assert row.total == Decimal("1500.00")
    assert row.invoice_count == 5

    gt = report.grand_totals
    assert gt.total == Decimal("1500.00")
    assert gt.invoice_count == 5
    assert gt.customer_count == 1


@pytest.mark.asyncio
async def test_multi_currency_grouping() -> None:
    """
    Invoices in different currencies for the same customer produce separate
    rows (one per currency) with correct amounts.
    """
    db = _FakeDB()
    as_of = date(2026, 5, 30)

    # Three AED invoices (all current — due tomorrow) for Customer A
    for _ in range(3):
        db["ar_invoices_v2"]._add(
            _make_invoice(
                currency="AED",
                due_date=date(2026, 5, 31),
                open_amount=Decimal("100.00"),
            )
        )
    # Two USD invoices (overdue 1-30) for Customer A
    for _ in range(2):
        db["ar_invoices_v2"]._add(
            _make_invoice(
                currency="USD",
                due_date=date(2026, 5, 15),
                open_amount=Decimal("50.00"),
            )
        )

    report = await compute_ar_aging(db, _ORG_ID, as_of_date=as_of)

    assert len(report.customers) == 2

    rows_by_currency = {r.currency: r for r in report.customers}
    assert "AED" in rows_by_currency
    assert "USD" in rows_by_currency

    aed_row = rows_by_currency["AED"]
    assert aed_row.current == Decimal("300.00")
    assert aed_row.days_1_to_30 == Decimal("0.00")
    assert aed_row.invoice_count == 3

    usd_row = rows_by_currency["USD"]
    assert usd_row.days_1_to_30 == Decimal("100.00")
    assert usd_row.current == Decimal("0.00")
    assert usd_row.invoice_count == 2


@pytest.mark.asyncio
async def test_customer_filter() -> None:
    """
    When customer_id is supplied, only that customer's invoices appear.
    """
    db = _FakeDB()
    as_of = date(2026, 5, 30)

    db["ar_invoices_v2"]._add(
        _make_invoice(
            customer_id=_CUSTOMER_A, customer_name="Alpha", due_date=date(2026, 5, 31)
        )
    )
    db["ar_invoices_v2"]._add(
        _make_invoice(
            customer_id=_CUSTOMER_B, customer_name="Beta", due_date=date(2026, 5, 31)
        )
    )

    report = await compute_ar_aging(
        db, _ORG_ID, customer_id=_CUSTOMER_A, as_of_date=as_of
    )

    assert len(report.customers) == 1
    assert report.customers[0].customer_id == _CUSTOMER_A
    assert report.grand_totals.customer_count == 1


@pytest.mark.asyncio
async def test_skips_non_outstanding_statuses() -> None:
    """
    Invoices in DRAFT, CLOSED, CANCELLED are excluded from the report.
    Only 'open' and 'partly_closed' should appear.
    """
    db = _FakeDB()
    as_of = date(2026, 5, 30)

    for skipped_status in ("draft", "closed", "cancelled"):
        db["ar_invoices_v2"]._add(
            _make_invoice(
                status=skipped_status,
                due_date=date(2026, 5, 15),
                open_amount=Decimal("999.00"),
            )
        )

    # One open invoice
    db["ar_invoices_v2"]._add(
        _make_invoice(
            status="open", due_date=date(2026, 5, 15), open_amount=Decimal("42.00")
        )
    )

    report = await compute_ar_aging(db, _ORG_ID, as_of_date=as_of)

    # Only the 'open' invoice should appear.
    assert len(report.customers) == 1
    assert report.grand_totals.total == Decimal("42.00")


@pytest.mark.asyncio
async def test_decimal_precision_and_sums() -> None:
    """
    Verify that amounts are quantized to exactly 2dp and that
    grand_totals.total == sum of all customer row totals.
    """
    db = _FakeDB()
    as_of = date(2026, 5, 30)

    # Two customers, each with one partly_closed invoice
    db["ar_invoices_v2"]._add(
        _make_invoice(
            customer_id=_CUSTOMER_A,
            customer_name="Alpha",
            status="partly_closed",
            due_date=date(2026, 5, 31),
            open_amount=Decimal("123.456"),  # should be rounded to 123.46
        )
    )
    db["ar_invoices_v2"]._add(
        _make_invoice(
            customer_id=_CUSTOMER_B,
            customer_name="Beta",
            status="open",
            due_date=date(2026, 5, 15),
            open_amount=Decimal("76.544"),  # should be rounded to 76.54
        )
    )

    report = await compute_ar_aging(db, _ORG_ID, as_of_date=as_of)

    assert len(report.customers) == 2

    for row in report.customers:
        # Verify all amounts are exactly 2dp.
        for field_name in (
            "current",
            "days_1_to_30",
            "days_31_to_60",
            "days_61_to_90",
            "over_90",
            "total",
        ):
            amount: Decimal = getattr(row, field_name)
            assert amount == amount.quantize(
                Decimal("0.01")
            ), f"Field {field_name} on row {row.customer_name} is not 2dp: {amount!r}"

    # Grand totals should equal sum of row totals.
    expected_grand_total = sum(r.total for r in report.customers)
    assert report.grand_totals.total == expected_grand_total.quantize(Decimal("0.01"))
    assert report.grand_totals.invoice_count == 2
    assert report.grand_totals.customer_count == 2
