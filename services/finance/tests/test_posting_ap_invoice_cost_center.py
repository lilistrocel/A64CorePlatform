"""
Tests for T-057-1a (Wave 1a) — per-cost-centre JE tagging on
`_handle_ap_invoice_posted`.

The AP posting handler must split the DR GR/IR Clearing line and the DR Input
VAT line into one JE line per distinct `costCenterId` on the payload lines,
with each split line carrying the `costCenterId` so cost-centre reports can
attribute the cleared cost and reclaimable VAT.

Lines without a `costCenterId` collapse into a single un-tagged JE line per
account. The CR AP Control line stays a single aggregate (vendor liability,
not per-CC). The CR Output VAT and DR/CR PPV lines also stay aggregate.

These tests reuse the helpers and fixtures defined in
`test_posting_ap_invoice_posted.py` directly.
"""

import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from finance.models.orm.models import JournalEntry, JournalEntryLine

from tests.test_posting_ap_invoice_posted import (  # noqa: E402
    _INGEST_URL,
    _VALID_SECRET,
    _make_ap_event,
    _make_ap_line,
    _setup_standard,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ap_line_with_cc(
    *,
    line_number: int,
    cost_center_id: str | None,
    quantity: str = "10.000",
    po_unit_price: str = "100.00",
    invoice_unit_price: str = "100.00",
    tax_code: str = "S",
    tax_rate: str = "0.05",
) -> dict:
    """Wrap _make_ap_line and inject costCenterId."""
    ln = _make_ap_line(
        line_number=line_number,
        quantity=quantity,
        po_unit_price=po_unit_price,
        invoice_unit_price=invoice_unit_price,
        tax_code=tax_code,
        tax_rate=tax_rate,
    )
    ln["costCenterId"] = cost_center_id
    return ln


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_two_distinct_cost_centers_split_gr_ir_and_input_vat(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Two lines with two different cost centres → two DR GR/IR lines and two
    DR Input VAT lines, each tagged with its costCenterId.

    Line 1 (CC-A): qty=10, price=100, tax=5% → lineNet=1000, lineTax=50
    Line 2 (CC-B): qty=5,  price=100, tax=5% → lineNet=500,  lineTax=25

    Zero variance so no PPV line. Expected 5 JE lines total:
      L1  DR  GR/IR (CC-A)    1000.00
      L2  DR  GR/IR (CC-B)     500.00
      L3  DR  Input VAT (CC-A)  50.00
      L4  DR  Input VAT (CC-B)  25.00
      L5  CR  AP Control      1575.00   (un-tagged)

    Balance: DR = 1575.00; CR = 1575.00.
    """
    accts = await _setup_standard(client, db_session, "APCC1")

    vendor_id = str(uuid.uuid4())
    lines = [
        _ap_line_with_cc(line_number=1, cost_center_id="CC-A", quantity="10.000"),
        _ap_line_with_cc(line_number=2, cost_center_id="CC-B", quantity="5.000"),
    ]
    event = _make_ap_event(
        company_code="APCC1",
        vendor_id=vendor_id,
        lines=lines,
    )

    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 200, resp.text

    je_result = await db_session.execute(
        select(JournalEntry).where(
            JournalEntry.sourceEventId == event["eventId"]
        )
    )
    je = je_result.scalar_one_or_none()
    assert je is not None

    # Total debit and credit must still balance to 1575.00.
    assert float(je.totalDebit) == 1575.0
    assert je.totalDebit == je.totalCredit

    je_lines_result = await db_session.execute(
        select(JournalEntryLine)
        .where(JournalEntryLine.jeId == je.jeId)
        .order_by(JournalEntryLine.lineNumber)
    )
    je_lines = je_lines_result.scalars().all()

    # Expect 5 JE lines (2 DR GR/IR, 2 DR VAT, 1 CR AP).
    assert len(je_lines) == 5, (
        f"Expected 5 JE lines after per-CC split, got {len(je_lines)}"
    )

    # GR/IR debits — one per CC, summing to 1500.
    grIr_lines = [l for l in je_lines if l.accountId == accts["grIr_id"]]
    assert len(grIr_lines) == 2
    grIr_by_cc = {l.costCenterId: l for l in grIr_lines}
    assert "CC-A" in grIr_by_cc and "CC-B" in grIr_by_cc
    assert float(grIr_by_cc["CC-A"].debit) == 1000.0
    assert float(grIr_by_cc["CC-B"].debit) == 500.0

    # Input VAT debits — one per CC, summing to 75.
    vat_lines = [l for l in je_lines if l.accountId == accts["input_vat_id"]]
    assert len(vat_lines) == 2
    vat_by_cc = {l.costCenterId: l for l in vat_lines}
    assert float(vat_by_cc["CC-A"].debit) == 50.0
    assert float(vat_by_cc["CC-B"].debit) == 25.0

    # CR AP Control — one un-tagged aggregate line.
    ap_cr_lines = [l for l in je_lines if l.accountId == accts["ap_control_id"]]
    assert len(ap_cr_lines) == 1
    assert ap_cr_lines[0].costCenterId is None
    assert float(ap_cr_lines[0].credit) == 1575.0
    assert ap_cr_lines[0].referenceLineId == vendor_id


@pytest.mark.asyncio
async def test_all_lines_same_cost_center_single_tagged_dr_line(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Two lines, both with the same cost centre → one DR GR/IR line and one DR
    Input VAT line, both tagged with that CC. JE shape matches the no-CC
    baseline shape (3 lines) but with costCenterId set on each DR line.
    """
    accts = await _setup_standard(client, db_session, "APCC2")

    vendor_id = str(uuid.uuid4())
    lines = [
        _ap_line_with_cc(line_number=1, cost_center_id="CC-OPS", quantity="10.000"),
        _ap_line_with_cc(line_number=2, cost_center_id="CC-OPS", quantity="5.000"),
    ]
    event = _make_ap_event(
        company_code="APCC2",
        vendor_id=vendor_id,
        lines=lines,
    )

    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 200, resp.text

    je = (
        await db_session.execute(
            select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
        )
    ).scalar_one()

    je_lines = (
        (
            await db_session.execute(
                select(JournalEntryLine)
                .where(JournalEntryLine.jeId == je.jeId)
                .order_by(JournalEntryLine.lineNumber)
            )
        )
        .scalars()
        .all()
    )

    # Exactly 3 lines: 1 DR GR/IR + 1 DR VAT + 1 CR AP (same shape as baseline).
    assert len(je_lines) == 3

    grIr_line = next(l for l in je_lines if l.accountId == accts["grIr_id"])
    vat_line = next(l for l in je_lines if l.accountId == accts["input_vat_id"])
    ap_line = next(l for l in je_lines if l.accountId == accts["ap_control_id"])

    assert grIr_line.costCenterId == "CC-OPS"
    assert vat_line.costCenterId == "CC-OPS"
    assert ap_line.costCenterId is None  # AP stays un-tagged
    assert float(grIr_line.debit) == 1500.0
    assert float(vat_line.debit) == 75.0
    assert float(ap_line.credit) == 1575.0


@pytest.mark.asyncio
async def test_mixed_tagged_and_untagged_lines_emit_separate_buckets(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    One line with a CC, one without → two DR GR/IR lines (one tagged, one None).
    Same for DR Input VAT.
    """
    accts = await _setup_standard(client, db_session, "APCC3")

    vendor_id = str(uuid.uuid4())
    lines = [
        _ap_line_with_cc(line_number=1, cost_center_id="CC-FARM", quantity="10.000"),
        _ap_line_with_cc(line_number=2, cost_center_id=None, quantity="5.000"),
    ]
    event = _make_ap_event(
        company_code="APCC3",
        vendor_id=vendor_id,
        lines=lines,
    )

    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 200, resp.text

    je = (
        await db_session.execute(
            select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
        )
    ).scalar_one()

    je_lines = (
        (
            await db_session.execute(
                select(JournalEntryLine)
                .where(JournalEntryLine.jeId == je.jeId)
                .order_by(JournalEntryLine.lineNumber)
            )
        )
        .scalars()
        .all()
    )

    # 5 lines: 2 DR GR/IR + 2 DR VAT + 1 CR AP
    assert len(je_lines) == 5

    grIr_lines = [l for l in je_lines if l.accountId == accts["grIr_id"]]
    grIr_by_cc = {l.costCenterId: l for l in grIr_lines}
    assert set(grIr_by_cc.keys()) == {"CC-FARM", None}
    assert float(grIr_by_cc["CC-FARM"].debit) == 1000.0
    assert float(grIr_by_cc[None].debit) == 500.0

    vat_lines = [l for l in je_lines if l.accountId == accts["input_vat_id"]]
    vat_by_cc = {l.costCenterId: l for l in vat_lines}
    assert set(vat_by_cc.keys()) == {"CC-FARM", None}
    assert float(vat_by_cc["CC-FARM"].debit) == 50.0
    assert float(vat_by_cc[None].debit) == 25.0

    # JE balanced.
    assert je.totalDebit == je.totalCredit
    assert float(je.totalDebit) == 1575.0


@pytest.mark.asyncio
async def test_no_cost_center_anywhere_matches_baseline_shape(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Regression test — when no line carries costCenterId, the JE shape must
    exactly match the original baseline (single DR GR/IR + single DR VAT +
    single CR AP), and both DR lines must have costCenterId=None.
    """
    accts = await _setup_standard(client, db_session, "APCC4")

    vendor_id = str(uuid.uuid4())
    lines = [
        _ap_line_with_cc(line_number=1, cost_center_id=None, quantity="10.000"),
    ]
    event = _make_ap_event(
        company_code="APCC4",
        vendor_id=vendor_id,
        lines=lines,
    )

    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 200, resp.text

    je = (
        await db_session.execute(
            select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
        )
    ).scalar_one()

    je_lines = (
        (
            await db_session.execute(
                select(JournalEntryLine)
                .where(JournalEntryLine.jeId == je.jeId)
                .order_by(JournalEntryLine.lineNumber)
            )
        )
        .scalars()
        .all()
    )

    assert len(je_lines) == 3
    for ln in je_lines:
        assert ln.costCenterId is None
