"""
Tests for T-910 — _handle_ap_down_payment_posted posting handler.

Covers:
  - Happy path with VAT → 3-line JE: DR Vendor Advance / DR Input VAT /
    CR AP Control, exact accounts + amounts, debits == credits.
  - Zero-tax path → 2-line JE, no DR Input VAT line.
  - Missing vendorAdvanceAccountId config → 400, no JE created.
  - Missing apControlAccountId config → 400, no JE created.
  - Idempotency: sending the same eventId twice creates exactly one JE.

Posting pattern for ap_down_payment_posted (T-910 spec):
  DR  Vendor Advance   (totals.net)
  DR  Input VAT        (totals.tax, only if > 0)
  CR  AP Control       (totals.gross)

Balance:
  DR = net + tax = gross = CR
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
_ORG_UUID = "b0000000-0000-4000-8000-000000000091"
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
        "userId": "test-user-dpi",
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
            "legalName": f"DPI Test Company {code} LLC",
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
    input_vat_id: Optional[str] = "USE_REAL",
    vendor_advance_id: Optional[str] = "USE_REAL",
) -> CompanyPostingSetup:
    """
    Insert a CompanyPostingSetup row.

    Pass "USE_REAL" to auto-resolve an active GL account; pass None to leave
    the field null (simulates unconfigured state); pass an explicit ID to use it.

    Offsets: ap_control_id=0, input_vat_id=1, vendor_advance_id=2 — kept
    distinct so tests can independently null out any one of them.
    """
    if ap_control_id == "USE_REAL":
        ap_control_id = await _get_active_account_id(db_session, organization_id, offset=0)
    if input_vat_id == "USE_REAL":
        input_vat_id = await _get_active_account_id(db_session, organization_id, offset=1)
    if vendor_advance_id == "USE_REAL":
        vendor_advance_id = await _get_active_account_id(db_session, organization_id, offset=2)

    setup = CompanyPostingSetup(
        setupId=str(uuid.uuid4()),
        organizationId=organization_id,
        companyCode=company_code,
        apControlAccountId=ap_control_id,
        inputVatAccountId=input_vat_id,
        vendorAdvanceAccountId=vendor_advance_id,
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


def _make_dpi_line(
    line_number: int = 1,
    quantity: str = "1.000",
    unit_price: str = "1000.00",
    tax_code: Optional[str] = "S",
    tax_rate: str = "0.05",
    cost_center_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Build an ApDownPaymentPostedLine dict, arithmetically consistent."""
    qty = Decimal(quantity)
    price = Decimal(unit_price)
    rate = Decimal(tax_rate)

    line_net = (qty * price).quantize(Decimal("0.01"))
    line_tax = (line_net * rate).quantize(Decimal("0.01"))
    line_gross = line_net + line_tax

    return {
        "lineNumber": line_number,
        "itemId": None,
        "itemCode": "",
        "quantity": str(qty),
        "unitPrice": str(price),
        "lineNet": str(line_net),
        "taxCode": tax_code,
        "taxRate": str(rate),
        "lineTax": str(line_tax),
        "lineGross": str(line_gross),
        "costCenterId": cost_center_id,
    }


def _make_dpi_event(
    organization_id: str = _ORG_UUID,
    company_code: str = "DPI01",
    doc_date: str = "2026-06-15",
    lines: Optional[List[Dict[str, Any]]] = None,
    event_id: Optional[str] = None,
    vendor_id: Optional[str] = None,
    vendor_name: str = "Test Vendor LLC",
) -> Dict[str, Any]:
    """Return a valid ap_down_payment_posted event dict."""
    if lines is None:
        lines = [_make_dpi_line()]

    vendor_id = vendor_id or str(uuid.uuid4())
    total_net = sum(Decimal(str(ln["lineNet"])) for ln in lines)
    total_tax = sum(Decimal(str(ln["lineTax"])) for ln in lines)
    total_gross = sum(Decimal(str(ln["lineGross"])) for ln in lines)

    return {
        "eventId": event_id or str(uuid.uuid4()),
        "eventType": "ap_down_payment_posted",
        "organizationId": organization_id,
        "companyCode": company_code,
        "occurredAt": datetime.utcnow().isoformat(),
        "sourceUserId": str(uuid.uuid4()),
        "payload": {
            "dpiDocId": str(uuid.uuid4()),
            "dpiDocNumber": f"DPI-2026-{uuid.uuid4().hex[:4].upper()}",
            "docDate": doc_date,
            "vendorId": vendor_id,
            "vendorName": vendor_name,
            "currency": "AED",
            "exchangeRate": "1.0",
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
    vendor_advance_id: Optional[str] = "USE_REAL",
) -> Dict[str, str]:
    """Seed company, posting setup (AP control + input VAT + vendor advance), period."""
    await _seed_company(client, code=company_code)

    ap_control_id = await _get_active_account_id(db_session, _ORG, offset=0)
    input_vat_id = await _get_active_account_id(db_session, _ORG, offset=1)

    real_vendor_advance_id: Optional[str] = None
    if vendor_advance_id == "USE_REAL":
        real_vendor_advance_id = await _get_active_account_id(db_session, _ORG, offset=2)
    else:
        real_vendor_advance_id = vendor_advance_id  # None or explicit

    await _seed_posting_setup(
        db_session,
        _ORG,
        company_code,
        ap_control_id=ap_control_id,
        input_vat_id=input_vat_id,
        vendor_advance_id=real_vendor_advance_id,
    )
    await _seed_fiscal_period(db_session, company_code)

    return {
        "ap_control_id": ap_control_id,
        "input_vat_id": input_vat_id,
        "vendor_advance_id": real_vendor_advance_id,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_happy_path_with_vat(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Happy path: DPI with VAT → 3-line JE.

    net=1000.00, tax=50.00, gross=1050.00.
      L1  DR  Vendor Advance   1000.00
      L2  DR  Input VAT          50.00
      L3  CR  AP Control       1050.00

    totalDebit == totalCredit == 1050.00.
    """
    accts = await _setup_standard(client, db_session, "DPI01")

    vendor_id = str(uuid.uuid4())
    line = _make_dpi_line(quantity="1.000", unit_price="1000.00", tax_rate="0.05")
    event = _make_dpi_event(company_code="DPI01", vendor_id=vendor_id, lines=[line])

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
    assert je.sourceEventType == "ap_down_payment_posted"
    assert je.status.value == "posted"
    assert je.sourceDocNumber == event["payload"]["dpiDocNumber"]

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
    assert len(dr_lines) == 2  # Vendor Advance + Input VAT
    assert len(cr_lines) == 1  # AP Control

    advance_line = next(l for l in dr_lines if l.accountId == accts["vendor_advance_id"])
    assert float(advance_line.debit) == 1000.0
    assert advance_line.referenceLineId == vendor_id

    vat_line = next(l for l in dr_lines if l.accountId == accts["input_vat_id"])
    assert float(vat_line.debit) == 50.0

    ap_line = cr_lines[0]
    assert ap_line.accountId == accts["ap_control_id"]
    assert float(ap_line.credit) == 1050.0
    assert ap_line.referenceLineId == vendor_id


@pytest.mark.asyncio
async def test_zero_tax_no_vat_line(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Zero-rated DPI (tax=0) → 2-line JE, no DR Input VAT line."""
    accts = await _setup_standard(client, db_session, "DPI02")

    line = _make_dpi_line(
        quantity="2.000", unit_price="500.00", tax_code="Z", tax_rate="0"
    )
    event = _make_dpi_event(company_code="DPI02", lines=[line])

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
async def test_missing_vendor_advance_account_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Posting setup exists but vendorAdvanceAccountId is null → 400.
    No JE should be created.
    """
    await _seed_company(client, code="DPI03")
    await _seed_posting_setup(
        db_session,
        _ORG,
        "DPI03",
        ap_control_id="USE_REAL",
        input_vat_id="USE_REAL",
        vendor_advance_id=None,
    )
    await _seed_fiscal_period(db_session, "DPI03")

    event = _make_dpi_event(company_code="DPI03")
    resp = await client.post(
        _INGEST_URL, json=event, headers={"X-Service-Secret": _VALID_SECRET}
    )
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "vendorAdvanceAccountId" in detail or "Vendor Advance" in detail

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
    await _seed_company(client, code="DPI04")
    await _seed_posting_setup(
        db_session,
        _ORG,
        "DPI04",
        ap_control_id=None,
        input_vat_id="USE_REAL",
        vendor_advance_id="USE_REAL",
    )
    await _seed_fiscal_period(db_session, "DPI04")

    event = _make_dpi_event(company_code="DPI04")
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
    await _setup_standard(client, db_session, "DPI05")

    event_id = str(uuid.uuid4())
    event = _make_dpi_event(company_code="DPI05", event_id=event_id)

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
