"""
Tests for T-910 — _handle_ap_credit_note_posted posting handler.

Covers:
  - Happy path with VAT → 3-line JE: DR AP Control / CR GR/IR Clearing /
    CR Input VAT, exact accounts + amounts, debits == credits.
  - Zero-tax path → 2-line JE, no CR Input VAT line.
  - Missing grIrClearingAccountId config → 400, no JE created.
  - Missing apControlAccountId config → 400, no JE created.
  - Idempotency: sending the same eventId twice creates exactly one JE.
  - Multi-cost-center case: CR GR/IR Clearing splits per line.costCenterId.

Posting pattern for ap_credit_note_posted (T-910 spec — reverse of an AP
Invoice bill):
  DR  AP Control      (totals.gross)
  CR  GR/IR Clearing  (per costCenterId bucket of lineNet)
  CR  Input VAT       (totals.tax, only if > 0)

Balance:
  DR = gross
  CR = sum(lineNet) + tax = net + tax = gross
"""

import os
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

# Override DB and secrets BEFORE importing any finance module.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test_secret_key")
os.environ["FINANCE_INGESTION_SECRET"] = "test-ingest-secret"

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import func, select  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker  # noqa: E402

from finance.db.session import engine, get_db  # noqa: E402
from finance.main import app  # noqa: E402
from finance.models.orm.models import (  # noqa: E402
    AccountLevelEnum,
    CompanyPostingSetup,
    FiscalPeriod,
    GLAccount,
    JournalEntry,
    JournalEntryLine,
    PeriodStatusEnum,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_INGEST_URL = "/api/v1/finance/events/ingest"
_VALID_SECRET = "test-ingest-secret"
# Reason: fixed UUID keeps tests consistent across module; stored as string.
_ORG_UUID = "b0000000-0000-4000-8000-000000000092"
_ORG = _ORG_UUID


# ---------------------------------------------------------------------------
# Session + client fixtures
# ---------------------------------------------------------------------------

_TestSessionLocal = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)


@pytest_asyncio.fixture
async def db_session() -> AsyncSession:
    """Fresh session per test (rolled back after each test)."""
    async with _TestSessionLocal() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncClient:
    """Async HTTP client with DB session overridden to the test session."""

    async def _override_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


def _make_jwt(role: str = "finance_admin") -> str:
    """Generate a test JWT signed with the test SECRET_KEY."""
    from jose import jwt

    payload = {
        "userId": "test-user-acn",
        "email": "test@a64core.com",
        "role": role,
        "type": "access",
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    return jwt.encode(payload, "test_secret_key", algorithm="HS256")


async def _seed_company(client: AsyncClient, code: str) -> None:
    """Create a company (seeds CoA)."""
    resp = await client.post(
        "/api/v1/finance/companies",
        json={
            "companyCode": code,
            "organizationId": _ORG,
            "legalName": f"ACN Test Company {code} LLC",
        },
        headers={"Authorization": "Bearer " + _make_jwt()},
    )
    assert resp.status_code in (201, 409), resp.text


async def _get_active_account_id(
    db_session: AsyncSession,
    organization_id: str,
    offset: int = 0,
) -> str:
    """Return the accountId of an active GL account (with optional offset)."""
    result = await db_session.execute(
        select(GLAccount.accountId)
        .where(
            GLAccount.organizationId == organization_id,
            GLAccount.isActive == True,  # noqa: E712
            GLAccount.accountLevel == AccountLevelEnum.ACTIVE,
        )
        .offset(offset)
        .limit(1)
    )
    account_id = result.scalar_one_or_none()
    assert account_id is not None, (
        f"No active GL account at offset {offset} — CoA seed must run first"
    )
    return account_id


async def _seed_posting_setup(
    db_session: AsyncSession,
    organization_id: str,
    company_code: str,
    ap_control_id: Optional[str] = "USE_REAL",
    grIr_id: Optional[str] = "USE_REAL",
    input_vat_id: Optional[str] = "USE_REAL",
) -> CompanyPostingSetup:
    """
    Insert a CompanyPostingSetup row.

    Pass "USE_REAL" to auto-resolve an active GL account; pass None to leave
    the field null (simulates unconfigured state); pass an explicit ID to use it.

    Offsets: ap_control_id=0, grIr_id=1, input_vat_id=2 — kept distinct so
    tests can independently null out any one of them.
    """
    if ap_control_id == "USE_REAL":
        ap_control_id = await _get_active_account_id(db_session, organization_id, offset=0)
    if grIr_id == "USE_REAL":
        grIr_id = await _get_active_account_id(db_session, organization_id, offset=1)
    if input_vat_id == "USE_REAL":
        input_vat_id = await _get_active_account_id(db_session, organization_id, offset=2)

    setup = CompanyPostingSetup(
        setupId=str(uuid.uuid4()),
        organizationId=organization_id,
        companyCode=company_code,
        apControlAccountId=ap_control_id,
        grIrClearingAccountId=grIr_id,
        inputVatAccountId=input_vat_id,
        isComplete=False,
    )
    db_session.add(setup)
    await db_session.flush()
    return setup


async def _seed_fiscal_period(
    db_session: AsyncSession,
    company_code: str,
    start: date = date(2026, 1, 1),
    end: date = date(2026, 12, 31),
    status: PeriodStatusEnum = PeriodStatusEnum.OPEN,
) -> str:
    """Insert a fiscal period and return its periodId."""
    period = FiscalPeriod(
        periodId=str(uuid.uuid4()),
        companyCode=company_code,
        fiscalYear=start.year,
        periodNumber=1,
        startDate=start,
        endDate=end,
        status=status,
    )
    db_session.add(period)
    await db_session.flush()
    return period.periodId


def _make_acn_line(
    line_number: int = 1,
    quantity: str = "1.000",
    unit_price: str = "1000.00",
    tax_code: Optional[str] = "S",
    tax_rate: str = "0.05",
    cost_center_id: Optional[str] = None,
    item_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Build an ApCreditNotePostedLine dict, arithmetically consistent."""
    qty = Decimal(quantity)
    price = Decimal(unit_price)
    rate = Decimal(tax_rate)

    line_net = (qty * price).quantize(Decimal("0.01"))
    line_tax = (line_net * rate).quantize(Decimal("0.01"))
    line_gross = line_net + line_tax

    return {
        "lineNumber": line_number,
        "itemId": item_id or str(uuid.uuid4()),
        "itemCode": "FERT-001",
        "quantity": str(qty),
        "unitPrice": str(price),
        "lineNet": str(line_net),
        "taxCode": tax_code,
        "taxRate": str(rate),
        "lineTax": str(line_tax),
        "lineGross": str(line_gross),
        "costCenterId": cost_center_id,
    }


def _make_acn_event(
    organization_id: str = _ORG_UUID,
    company_code: str = "ACN01",
    doc_date: str = "2026-06-15",
    lines: Optional[List[Dict[str, Any]]] = None,
    event_id: Optional[str] = None,
    vendor_id: Optional[str] = None,
    vendor_name: str = "Test Vendor LLC",
) -> Dict[str, Any]:
    """Return a valid ap_credit_note_posted event dict."""
    if lines is None:
        lines = [_make_acn_line()]

    vendor_id = vendor_id or str(uuid.uuid4())
    total_net = sum(Decimal(str(ln["lineNet"])) for ln in lines)
    total_tax = sum(Decimal(str(ln["lineTax"])) for ln in lines)
    total_gross = sum(Decimal(str(ln["lineGross"])) for ln in lines)

    return {
        "eventId": event_id or str(uuid.uuid4()),
        "eventType": "ap_credit_note_posted",
        "organizationId": organization_id,
        "companyCode": company_code,
        "occurredAt": datetime.utcnow().isoformat(),
        "sourceUserId": str(uuid.uuid4()),
        "payload": {
            "acnDocId": str(uuid.uuid4()),
            "acnDocNumber": f"ACN-2026-{uuid.uuid4().hex[:4].upper()}",
            "docDate": doc_date,
            "vendorId": vendor_id,
            "vendorName": vendor_name,
            "currency": "AED",
            "exchangeRate": "1.0",
            "baseApInvoiceDocId": "",
            "baseApInvoiceDocNumber": "",
            "totals": {
                "net": str(total_net),
                "tax": str(total_tax),
                "gross": str(total_gross),
            },
            "lines": lines,
        },
    }


async def _setup_standard(
    client: AsyncClient,
    db_session: AsyncSession,
    company_code: str,
    grIr_id: Optional[str] = "USE_REAL",
) -> Dict[str, str]:
    """Seed company, posting setup (AP control + GR/IR + input VAT), period."""
    await _seed_company(client, code=company_code)

    ap_control_id = await _get_active_account_id(db_session, _ORG, offset=0)
    input_vat_id = await _get_active_account_id(db_session, _ORG, offset=2)

    real_grIr_id: Optional[str] = None
    if grIr_id == "USE_REAL":
        real_grIr_id = await _get_active_account_id(db_session, _ORG, offset=1)
    else:
        real_grIr_id = grIr_id  # None or explicit

    await _seed_posting_setup(
        db_session,
        _ORG,
        company_code,
        ap_control_id=ap_control_id,
        grIr_id=real_grIr_id,
        input_vat_id=input_vat_id,
    )
    await _seed_fiscal_period(db_session, company_code)

    return {
        "ap_control_id": ap_control_id,
        "grIr_id": real_grIr_id,
        "input_vat_id": input_vat_id,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_happy_path_with_vat(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Happy path: ACN with VAT → 3-line JE.

    net=1000.00, tax=50.00, gross=1050.00.
      L1  DR  AP Control      1050.00
      L2  CR  GR/IR Clearing  1000.00
      L3  CR  Input VAT         50.00

    totalDebit == totalCredit == 1050.00.
    """
    accts = await _setup_standard(client, db_session, "ACN01")

    vendor_id = str(uuid.uuid4())
    line = _make_acn_line(quantity="1.000", unit_price="1000.00", tax_rate="0.05")
    event = _make_acn_event(company_code="ACN01", vendor_id=vendor_id, lines=[line])

    resp = await client.post(
        _INGEST_URL, json=event, headers={"X-Service-Secret": _VALID_SECRET}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "processed"

    je = (
        await db_session.execute(
            select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
        )
    ).scalar_one_or_none()
    assert je is not None, "JournalEntry must be created"
    assert je.sourceEventType == "ap_credit_note_posted"
    assert je.status.value == "posted"
    assert je.sourceDocNumber == event["payload"]["acnDocNumber"]

    # Balance invariant
    assert je.totalDebit == je.totalCredit
    assert float(je.totalDebit) == 1050.0

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
    assert len(je_lines) == 3, f"Expected 3 lines, got {len(je_lines)}"

    dr_lines = [l for l in je_lines if l.debit is not None]
    cr_lines = [l for l in je_lines if l.credit is not None]
    assert len(dr_lines) == 1  # AP Control
    assert len(cr_lines) == 2  # GR/IR + Input VAT

    ap_line = dr_lines[0]
    assert ap_line.accountId == accts["ap_control_id"]
    assert float(ap_line.debit) == 1050.0
    assert ap_line.referenceLineId == vendor_id

    grIr_line = next(l for l in cr_lines if l.accountId == accts["grIr_id"])
    assert float(grIr_line.credit) == 1000.0

    vat_line = next(l for l in cr_lines if l.accountId == accts["input_vat_id"])
    assert float(vat_line.credit) == 50.0


@pytest.mark.asyncio
async def test_zero_tax_no_vat_line(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Zero-rated ACN (tax=0) → 2-line JE, no CR Input VAT line."""
    accts = await _setup_standard(client, db_session, "ACN02")

    line = _make_acn_line(
        quantity="2.000", unit_price="500.00", tax_code="Z", tax_rate="0"
    )
    event = _make_acn_event(company_code="ACN02", lines=[line])

    resp = await client.post(
        _INGEST_URL, json=event, headers={"X-Service-Secret": _VALID_SECRET}
    )
    assert resp.status_code == 200, resp.text

    je = (
        await db_session.execute(
            select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
        )
    ).scalar_one()
    assert je.totalDebit == je.totalCredit
    assert float(je.totalDebit) == 1000.0

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
    assert len(je_lines) == 2, f"Expected 2 lines (no VAT), got {len(je_lines)}"
    assert all(l.accountId != accts["input_vat_id"] for l in je_lines)


@pytest.mark.asyncio
async def test_missing_gr_ir_clearing_account_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Posting setup exists but grIrClearingAccountId is null → 400.
    No JE should be created.
    """
    await _seed_company(client, code="ACN03")
    await _seed_posting_setup(
        db_session,
        _ORG,
        "ACN03",
        ap_control_id="USE_REAL",
        grIr_id=None,
        input_vat_id="USE_REAL",
    )
    await _seed_fiscal_period(db_session, "ACN03")

    event = _make_acn_event(company_code="ACN03")
    resp = await client.post(
        _INGEST_URL, json=event, headers={"X-Service-Secret": _VALID_SECRET}
    )
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "grIrClearingAccountId" in detail or "GR/IR Clearing" in detail

    je_count = (
        await db_session.execute(
            select(func.count())
            .select_from(JournalEntry)
            .where(JournalEntry.sourceEventId == event["eventId"])
        )
    ).scalar()
    assert je_count == 0


@pytest.mark.asyncio
async def test_missing_ap_control_account_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Posting setup exists but apControlAccountId is null → 400. No JE created."""
    await _seed_company(client, code="ACN04")
    await _seed_posting_setup(
        db_session,
        _ORG,
        "ACN04",
        ap_control_id=None,
        grIr_id="USE_REAL",
        input_vat_id="USE_REAL",
    )
    await _seed_fiscal_period(db_session, "ACN04")

    event = _make_acn_event(company_code="ACN04")
    resp = await client.post(
        _INGEST_URL, json=event, headers={"X-Service-Secret": _VALID_SECRET}
    )
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "apControlAccountId" in detail or "AP Control" in detail

    je_count = (
        await db_session.execute(
            select(func.count())
            .select_from(JournalEntry)
            .where(JournalEntry.sourceEventId == event["eventId"])
        )
    ).scalar()
    assert je_count == 0


@pytest.mark.asyncio
async def test_idempotency_second_event_already_processed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Sending the same eventId twice returns already_processed on the second call."""
    await _setup_standard(client, db_session, "ACN05")

    event_id = str(uuid.uuid4())
    event = _make_acn_event(company_code="ACN05", event_id=event_id)

    resp1 = await client.post(
        _INGEST_URL, json=event, headers={"X-Service-Secret": _VALID_SECRET}
    )
    assert resp1.status_code == 200, resp1.text
    assert resp1.json()["status"] == "processed"

    resp2 = await client.post(
        _INGEST_URL, json=event, headers={"X-Service-Secret": _VALID_SECRET}
    )
    assert resp2.status_code == 200, resp2.text
    assert resp2.json()["status"] == "already_processed"

    je_count = (
        await db_session.execute(
            select(func.count())
            .select_from(JournalEntry)
            .where(JournalEntry.sourceEventId == event_id)
        )
    ).scalar()
    assert je_count == 1


@pytest.mark.asyncio
async def test_multi_cost_center_splits_gr_ir_credit(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Two lines with two different cost centres → two CR GR/IR lines, each
    tagged with its costCenterId. CR Input VAT and DR AP Control stay
    single aggregate lines.

    Line 1 (CC-A): qty=10, price=100, tax=5% → lineNet=1000, lineTax=50
    Line 2 (CC-B): qty=5,  price=100, tax=5% → lineNet=500,  lineTax=25

    Expected 4 JE lines total:
      L1  DR  AP Control        1575.00   (un-tagged)
      L2  CR  GR/IR (CC-A)      1000.00
      L3  CR  GR/IR (CC-B)       500.00
      L4  CR  Input VAT           75.00   (un-tagged)

    Balance: DR = 1575.00; CR = 1575.00.
    """
    accts = await _setup_standard(client, db_session, "ACN06")

    vendor_id = str(uuid.uuid4())
    lines = [
        _make_acn_line(
            line_number=1, quantity="10.000", unit_price="100.00", cost_center_id="CC-A"
        ),
        _make_acn_line(
            line_number=2, quantity="5.000", unit_price="100.00", cost_center_id="CC-B"
        ),
    ]
    event = _make_acn_event(company_code="ACN06", vendor_id=vendor_id, lines=lines)

    resp = await client.post(
        _INGEST_URL, json=event, headers={"X-Service-Secret": _VALID_SECRET}
    )
    assert resp.status_code == 200, resp.text

    je = (
        await db_session.execute(
            select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
        )
    ).scalar_one()
    assert float(je.totalDebit) == 1575.0
    assert je.totalDebit == je.totalCredit

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
    assert len(je_lines) == 4, f"Expected 4 JE lines after per-CC split, got {len(je_lines)}"

    # AP Control — one un-tagged aggregate DR line.
    ap_lines = [l for l in je_lines if l.accountId == accts["ap_control_id"]]
    assert len(ap_lines) == 1
    assert ap_lines[0].costCenterId is None
    assert float(ap_lines[0].debit) == 1575.0
    assert ap_lines[0].referenceLineId == vendor_id

    # GR/IR credits — one per CC, summing to 1500.
    grIr_lines = [l for l in je_lines if l.accountId == accts["grIr_id"]]
    assert len(grIr_lines) == 2
    grIr_by_cc = {l.costCenterId: l for l in grIr_lines}
    assert "CC-A" in grIr_by_cc and "CC-B" in grIr_by_cc
    assert float(grIr_by_cc["CC-A"].credit) == 1000.0
    assert float(grIr_by_cc["CC-B"].credit) == 500.0

    # Input VAT — one un-tagged aggregate CR line.
    vat_lines = [l for l in je_lines if l.accountId == accts["input_vat_id"]]
    assert len(vat_lines) == 1
    assert vat_lines[0].costCenterId is None
    assert float(vat_lines[0].credit) == 75.0
