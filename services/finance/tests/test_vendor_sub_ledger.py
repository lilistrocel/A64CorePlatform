"""
Tests for the Vendor Sub-ledger report endpoint.

GET /api/v1/finance/reports/vendor-sub-ledger

Coverage:
  - Empty JE table → empty byVendor, totalOutstanding=0.
  - After AP invoice posted (CR AP for 35000) → vendor row credits=35000, debits=0, balance=35000.
  - After payment (DR AP for 35000) → vendor totalCredits=35000, totalDebits=35000, balance=0.
  - Multiple vendors → multiple rows, all aggregated correctly.
  - vendor_id filter narrows to single vendor.
  - Missing posting setup returns 400.
  - Missing apControlAccountId in setup returns 400.
  - Accountant role can GET.
"""

import os
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional

# Override DB and secrets BEFORE importing any finance module.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test_secret_key")
os.environ.setdefault("FINANCE_INGESTION_SECRET", "test-ingest-secret")

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker  # noqa: E402

from finance.db.session import engine, get_db  # noqa: E402
from finance.main import app  # noqa: E402
from finance.models.orm.models import (  # noqa: E402
    AccountLevelEnum,
    CompanyPostingSetup,
    FiscalPeriod,
    GLAccount,
    JEStatusEnum,
    JournalEntry,
    JournalEntryLine,
    PeriodStatusEnum,
    ValuationMethodEnum,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_BASE = "/api/v1/finance"
_SUBLEDGER_URL = f"{_BASE}/reports/vendor-sub-ledger"
_ORG = "sl-test-org-0000-0000-000000000002"

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
# JWT helpers
# ---------------------------------------------------------------------------


def _make_jwt(role: str = "finance_admin", user_id: str = "test-user-sl") -> str:
    """Generate a test JWT signed with the test SECRET_KEY."""
    from jose import jwt

    payload = {
        "userId": user_id,
        "email": "sl@a64core.com",
        "role": role,
        "type": "access",
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    return jwt.encode(payload, "test_secret_key", algorithm="HS256")


def _auth(role: str = "finance_admin") -> dict:
    return {"Authorization": f"Bearer {_make_jwt(role=role)}"}


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


async def _get_active_account_id(db_session: AsyncSession, offset: int = 0) -> str:
    """Return accountId of the Nth active GL account seeded under _ORG."""
    result = await db_session.execute(
        select(GLAccount.accountId)
        .where(
            GLAccount.organizationId == _ORG,
            GLAccount.isActive == True,  # noqa: E712
            GLAccount.accountLevel == AccountLevelEnum.ACTIVE,
        )
        .offset(offset)
        .limit(1)
    )
    account_id = result.scalar_one_or_none()
    assert account_id is not None, f"No active GL account at offset {offset}"
    return account_id


async def _seed_company(client: AsyncClient, code: str) -> None:
    """Create a company (seeds CoA)."""
    resp = await client.post(
        f"{_BASE}/companies",
        json={
            "companyCode": code,
            "organizationId": _ORG,
            "legalName": f"Sub-Ledger Test {code} LLC",
        },
        headers=_auth(),
    )
    assert resp.status_code in (201, 409), resp.text


async def _seed_posting_setup(
    db_session: AsyncSession,
    company_code: str,
    ap_control_id: Optional[str] = "USE_REAL",
) -> CompanyPostingSetup:
    """Insert a CompanyPostingSetup row."""
    if ap_control_id == "USE_REAL":
        ap_control_id = await _get_active_account_id(db_session, offset=0)

    setup = CompanyPostingSetup(
        setupId=str(uuid.uuid4()),
        organizationId=_ORG,
        companyCode=company_code,
        apControlAccountId=ap_control_id,
        isComplete=(ap_control_id is not None),
        defaultValuationMethod=ValuationMethodEnum.MOVING_AVERAGE,
    )
    db_session.add(setup)
    await db_session.flush()
    return setup


async def _seed_fiscal_period(
    db_session: AsyncSession,
    company_code: str,
    start: date = date(2026, 1, 1),
    end: date = date(2026, 12, 31),
) -> str:
    """Insert an open fiscal period and return its periodId."""
    period = FiscalPeriod(
        periodId=str(uuid.uuid4()),
        companyCode=company_code,
        fiscalYear=start.year,
        periodNumber=1,
        startDate=start,
        endDate=end,
        status=PeriodStatusEnum.OPEN,
    )
    db_session.add(period)
    await db_session.flush()
    return period.periodId


async def _seed_je_with_ap_line(
    db_session: AsyncSession,
    company_code: str,
    period_id: str,
    ap_account_id: str,
    other_account_id: str,
    vendor_id: str,
    ap_credit: Optional[Decimal] = None,
    ap_debit: Optional[Decimal] = None,
    je_date: date = date(2026, 5, 1),
    organization_id: str = _ORG,
) -> str:
    """
    Seed a posted JE with two lines:
      - Line 1: AP Control account with referenceLineId = vendor_id
                (either debit or credit per the ap_credit/ap_debit args)
      - Line 2: Counterpart account (expense or bank)

    Returns the jeId.
    """
    je_id = str(uuid.uuid4())
    amount = ap_credit if ap_credit is not None else ap_debit
    assert amount is not None, "Must supply either ap_credit or ap_debit"

    je = JournalEntry(
        jeId=je_id,
        organizationId=organization_id,
        companyCode=company_code,
        jeNumber=f"JE-{company_code}-2026-{str(uuid.uuid4())[:4]}",
        jeDate=je_date,
        periodId=period_id,
        sourceEventType="test",
        sourceEventId=str(uuid.uuid4()),
        description="Test JE for sub-ledger",
        totalDebit=amount,
        totalCredit=amount,
        status=JEStatusEnum.POSTED,
        postedAt=datetime.utcnow(),
        postedBy="test-user",
    )
    db_session.add(je)

    # AP Control line — CR for invoice, DR for payment
    db_session.add(JournalEntryLine(
        jeLineId=str(uuid.uuid4()),
        jeId=je_id,
        lineNumber=1,
        accountId=ap_account_id,
        debit=ap_debit,
        credit=ap_credit,
        description="AP sub-ledger line",
        referenceLineId=vendor_id,  # Reason: this IS the vendor sub-ledger hook
    ))

    # Counterpart line (no referenceLineId — not a vendor sub-ledger entry)
    db_session.add(JournalEntryLine(
        jeLineId=str(uuid.uuid4()),
        jeId=je_id,
        lineNumber=2,
        accountId=other_account_id,
        debit=ap_credit,   # opposite side
        credit=ap_debit,
        description="Counterpart line",
    ))

    await db_session.flush()
    return je_id


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_vendor_sub_ledger_empty_no_jes(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Empty JE table returns empty byVendor and totalOutstanding=0."""
    code = "SL01"
    await _seed_company(client, code)
    await _seed_posting_setup(db_session, code)

    resp = await client.get(
        _SUBLEDGER_URL,
        params={"organization_id": _ORG, "company_code": code},
        headers=_auth(),
    )
    assert resp.status_code == 200, resp.text

    data = resp.json()["data"]
    assert Decimal(data["totalOutstanding"]) == Decimal("0")
    assert data["byVendor"] == []


@pytest.mark.asyncio
async def test_vendor_sub_ledger_after_invoice_posted(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Phase C scenario: AP invoice posted → CR AP 35000.

    Expected result: one vendor row with totalCredits=35000, totalDebits=0,
    balance=35000.
    """
    code = "SL02"
    await _seed_company(client, code)
    setup = await _seed_posting_setup(db_session, code)
    period_id = await _seed_fiscal_period(db_session, code)

    ap_account_id = setup.apControlAccountId
    other_account_id = await _get_active_account_id(db_session, offset=1)
    vendor_id = "vendor-phase-c"

    await _seed_je_with_ap_line(
        db_session,
        code,
        period_id,
        ap_account_id=ap_account_id,
        other_account_id=other_account_id,
        vendor_id=vendor_id,
        ap_credit=Decimal("35000.00"),
    )

    resp = await client.get(
        _SUBLEDGER_URL,
        params={
            "organization_id": _ORG,
            "company_code": code,
            "as_of_date": "2026-12-31",
        },
        headers=_auth(),
    )
    assert resp.status_code == 200, resp.text

    data = resp.json()["data"]
    assert len(data["byVendor"]) == 1

    row = data["byVendor"][0]
    assert row["vendorId"] == vendor_id
    assert Decimal(row["totalCredits"]) == Decimal("35000.00")
    assert Decimal(row["totalDebits"]) == Decimal("0")
    assert Decimal(row["balance"]) == Decimal("35000.00")
    assert Decimal(data["totalOutstanding"]) == Decimal("35000.00")


@pytest.mark.asyncio
async def test_vendor_sub_ledger_after_payment_balance_zero(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Phase D scenario: invoice (CR 35000) then payment (DR 35000).

    Expected: totalCredits=35000, totalDebits=35000, balance=0.
    """
    code = "SL03"
    await _seed_company(client, code)
    setup = await _seed_posting_setup(db_session, code)
    period_id = await _seed_fiscal_period(db_session, code)

    ap_account_id = setup.apControlAccountId
    other_account_id = await _get_active_account_id(db_session, offset=1)
    vendor_id = "vendor-phase-d"

    # Phase C: invoice — CR AP
    await _seed_je_with_ap_line(
        db_session, code, period_id,
        ap_account_id=ap_account_id,
        other_account_id=other_account_id,
        vendor_id=vendor_id,
        ap_credit=Decimal("35000.00"),
    )

    # Phase D: payment — DR AP
    await _seed_je_with_ap_line(
        db_session, code, period_id,
        ap_account_id=ap_account_id,
        other_account_id=other_account_id,
        vendor_id=vendor_id,
        ap_debit=Decimal("35000.00"),
        je_date=date(2026, 6, 1),
    )

    resp = await client.get(
        _SUBLEDGER_URL,
        params={
            "organization_id": _ORG,
            "company_code": code,
            "as_of_date": "2026-12-31",
        },
        headers=_auth(),
    )
    assert resp.status_code == 200, resp.text

    data = resp.json()["data"]
    assert len(data["byVendor"]) == 1

    row = data["byVendor"][0]
    assert Decimal(row["totalCredits"]) == Decimal("35000.00")
    assert Decimal(row["totalDebits"]) == Decimal("35000.00")
    assert Decimal(row["balance"]) == Decimal("0")
    assert Decimal(data["totalOutstanding"]) == Decimal("0")


@pytest.mark.asyncio
async def test_vendor_sub_ledger_multiple_vendors(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Multiple vendors produce multiple rows, each aggregated correctly."""
    code = "SL04"
    await _seed_company(client, code)
    setup = await _seed_posting_setup(db_session, code)
    period_id = await _seed_fiscal_period(db_session, code)

    ap_account_id = setup.apControlAccountId
    other_account_id = await _get_active_account_id(db_session, offset=1)

    vendor_a = "vendor-multi-a"
    vendor_b = "vendor-multi-b"

    # Vendor A: invoice 10000 + partial payment 4000 → balance 6000
    await _seed_je_with_ap_line(
        db_session, code, period_id,
        ap_account_id=ap_account_id,
        other_account_id=other_account_id,
        vendor_id=vendor_a,
        ap_credit=Decimal("10000.00"),
    )
    await _seed_je_with_ap_line(
        db_session, code, period_id,
        ap_account_id=ap_account_id,
        other_account_id=other_account_id,
        vendor_id=vendor_a,
        ap_debit=Decimal("4000.00"),
        je_date=date(2026, 6, 1),
    )

    # Vendor B: two invoices 8000 + 12000 → balance 20000
    await _seed_je_with_ap_line(
        db_session, code, period_id,
        ap_account_id=ap_account_id,
        other_account_id=other_account_id,
        vendor_id=vendor_b,
        ap_credit=Decimal("8000.00"),
    )
    await _seed_je_with_ap_line(
        db_session, code, period_id,
        ap_account_id=ap_account_id,
        other_account_id=other_account_id,
        vendor_id=vendor_b,
        ap_credit=Decimal("12000.00"),
        je_date=date(2026, 6, 1),
    )

    resp = await client.get(
        _SUBLEDGER_URL,
        params={
            "organization_id": _ORG,
            "company_code": code,
            "as_of_date": "2026-12-31",
        },
        headers=_auth(),
    )
    assert resp.status_code == 200, resp.text

    data = resp.json()["data"]
    assert len(data["byVendor"]) == 2

    # Build lookup by vendorId
    by_id = {row["vendorId"]: row for row in data["byVendor"]}

    row_a = by_id[vendor_a]
    assert Decimal(row_a["totalCredits"]) == Decimal("10000.00")
    assert Decimal(row_a["totalDebits"]) == Decimal("4000.00")
    assert Decimal(row_a["balance"]) == Decimal("6000.00")

    row_b = by_id[vendor_b]
    assert Decimal(row_b["totalCredits"]) == Decimal("20000.00")
    assert Decimal(row_b["totalDebits"]) == Decimal("0")
    assert Decimal(row_b["balance"]) == Decimal("20000.00")

    # Vendor B sorted first (larger balance)
    assert data["byVendor"][0]["vendorId"] == vendor_b
    assert data["byVendor"][1]["vendorId"] == vendor_a

    assert Decimal(data["totalOutstanding"]) == Decimal("26000.00")


@pytest.mark.asyncio
async def test_vendor_sub_ledger_vendor_id_filter(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """vendor_id query param filters results to that single vendor."""
    code = "SL05"
    await _seed_company(client, code)
    setup = await _seed_posting_setup(db_session, code)
    period_id = await _seed_fiscal_period(db_session, code)

    ap_account_id = setup.apControlAccountId
    other_account_id = await _get_active_account_id(db_session, offset=1)

    vendor_target = "vendor-filter-target"
    vendor_other = "vendor-filter-other"

    await _seed_je_with_ap_line(
        db_session, code, period_id,
        ap_account_id=ap_account_id,
        other_account_id=other_account_id,
        vendor_id=vendor_target,
        ap_credit=Decimal("5000.00"),
    )
    await _seed_je_with_ap_line(
        db_session, code, period_id,
        ap_account_id=ap_account_id,
        other_account_id=other_account_id,
        vendor_id=vendor_other,
        ap_credit=Decimal("9000.00"),
    )

    resp = await client.get(
        _SUBLEDGER_URL,
        params={
            "organization_id": _ORG,
            "company_code": code,
            "vendor_id": vendor_target,
        },
        headers=_auth(),
    )
    assert resp.status_code == 200, resp.text

    data = resp.json()["data"]
    assert len(data["byVendor"]) == 1
    assert data["byVendor"][0]["vendorId"] == vendor_target
    assert Decimal(data["totalOutstanding"]) == Decimal("5000.00")


@pytest.mark.asyncio
async def test_vendor_sub_ledger_no_posting_setup_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """GET without a posting setup returns 400."""
    code = "SL06"
    await _seed_company(client, code)
    # Deliberately do NOT seed posting setup

    resp = await client.get(
        _SUBLEDGER_URL,
        params={"organization_id": _ORG, "company_code": code},
        headers=_auth(),
    )
    assert resp.status_code == 400, resp.text
    assert "posting setup" in resp.json().get("detail", "").lower()


@pytest.mark.asyncio
async def test_vendor_sub_ledger_missing_ap_control_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """GET with posting setup but missing apControlAccountId returns 400."""
    code = "SL07"
    await _seed_company(client, code)
    await _seed_posting_setup(db_session, code, ap_control_id=None)

    resp = await client.get(
        _SUBLEDGER_URL,
        params={"organization_id": _ORG, "company_code": code},
        headers=_auth(),
    )
    assert resp.status_code == 400, resp.text
    assert "ap control" in resp.json().get("detail", "").lower()


@pytest.mark.asyncio
async def test_vendor_sub_ledger_accountant_role_allowed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Accountant role can access the sub-ledger endpoint."""
    code = "SL08"
    await _seed_company(client, code)
    await _seed_posting_setup(db_session, code)

    resp = await client.get(
        _SUBLEDGER_URL,
        params={"organization_id": _ORG, "company_code": code},
        headers=_auth("accountant"),
    )
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_vendor_sub_ledger_sample_response(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Produces a sample sub-ledger response for the implementation report.

    Two vendors: one with outstanding balance, one fully paid.
    """
    code = "SL09"
    await _seed_company(client, code)
    setup = await _seed_posting_setup(db_session, code)
    period_id = await _seed_fiscal_period(db_session, code)

    ap_account_id = setup.apControlAccountId
    other_account_id = await _get_active_account_id(db_session, offset=1)

    # Vendor 1: outstanding 25000 (invoiced 35000, paid 10000)
    await _seed_je_with_ap_line(
        db_session, code, period_id,
        ap_account_id=ap_account_id,
        other_account_id=other_account_id,
        vendor_id="vnd-sl-report-1",
        ap_credit=Decimal("35000.00"),
    )
    await _seed_je_with_ap_line(
        db_session, code, period_id,
        ap_account_id=ap_account_id,
        other_account_id=other_account_id,
        vendor_id="vnd-sl-report-1",
        ap_debit=Decimal("10000.00"),
        je_date=date(2026, 6, 1),
    )

    # Vendor 2: fully paid (invoiced 12000, paid 12000)
    await _seed_je_with_ap_line(
        db_session, code, period_id,
        ap_account_id=ap_account_id,
        other_account_id=other_account_id,
        vendor_id="vnd-sl-report-2",
        ap_credit=Decimal("12000.00"),
    )
    await _seed_je_with_ap_line(
        db_session, code, period_id,
        ap_account_id=ap_account_id,
        other_account_id=other_account_id,
        vendor_id="vnd-sl-report-2",
        ap_debit=Decimal("12000.00"),
        je_date=date(2026, 6, 1),
    )

    resp = await client.get(
        _SUBLEDGER_URL,
        params={
            "organization_id": _ORG,
            "company_code": code,
            "as_of_date": "2026-12-31",
        },
        headers=_auth(),
    )
    assert resp.status_code == 200, resp.text

    data = resp.json()["data"]
    assert Decimal(data["totalOutstanding"]) == Decimal("25000.00")
    assert len(data["byVendor"]) == 2

    print(
        f"\n--- Sample Vendor Sub-Ledger Response ---\n"
        f"asOfDate: {data['asOfDate']}\n"
        f"totalOutstanding: {data['totalOutstanding']}\n"
        f"byVendor ({len(data['byVendor'])} rows):\n"
    )
    for row in data["byVendor"]:
        print(
            f"  vendorId:      {row['vendorId']}\n"
            f"  totalCredits:  {row['totalCredits']}\n"
            f"  totalDebits:   {row['totalDebits']}\n"
            f"  balance:       {row['balance']}\n"
            f"  entryCount:    {row['entryCount']}\n"
            f"  lastActivityAt:{row['lastActivityAt']}\n"
        )
    print("-----------------------------------------\n")
