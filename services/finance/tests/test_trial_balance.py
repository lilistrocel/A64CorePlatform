"""
Tests for GET /reports/trial-balance — Trial Balance report endpoint.

Covers:
  - Empty database → all active accounts present with zero balances.
  - After posting a GR JE (DR assets, CR liability): total DR == total CR == 35000.
  - Balance sign conventions: asset accounts show positive DR balance;
    liability accounts show positive CR balance.
  - as_of_date filter excludes JEs after that date.
  - include_voided=true includes voided JEs.
  - include_voided=false (default) excludes voided JEs.
  - Non-finance role → 403.
"""

import os
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

# Override DB and secrets BEFORE importing any finance module.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test_secret_key")

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker  # noqa: E402

from finance.db.session import engine, get_db  # noqa: E402
from finance.main import app  # noqa: E402
from finance.models.orm.base import Base  # noqa: E402
from finance.models.orm.models import (  # noqa: E402
    AccountLevelEnum,
    AccountRoleEnum,
    AccountTypeEnum,
    DrawerEnum,
    FiscalPeriod,
    GLAccount,
    JEStatusEnum,
    JournalEntry,
    JournalEntryLine,
    PeriodStatusEnum,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_ORG = "org-tb-test"
_COMPANY_CODE = "TB01"
_BASE_URL = "http://test"
_TB_URL = "/api/v1/finance/reports/trial-balance"


# ---------------------------------------------------------------------------
# Session + client fixtures
# ---------------------------------------------------------------------------

_TestSessionLocal = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)


@pytest_asyncio.fixture(scope="module", autouse=True)
async def create_tables():
    """Create all tables once for this module."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest_asyncio.fixture
async def db_session() -> AsyncSession:
    """Fresh session per test, rolled back after each test."""
    async with _TestSessionLocal() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncClient:
    """Async HTTP client bound to the test DB session."""

    async def _override_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url=_BASE_URL) as ac:
        yield ac
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------


def make_token(role: str = "finance_admin") -> str:
    """Generate a signed JWT for the given role."""
    from datetime import timedelta

    from jose import jwt

    payload = {
        "userId": "user-tb-001",
        "email": "finance@test.com",
        "role": role,
        "type": "access",
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    return jwt.encode(payload, "test_secret_key", algorithm="HS256")


def auth_headers(role: str = "finance_admin") -> dict:
    """Authorization headers for the given role."""
    return {"Authorization": f"Bearer {make_token(role=role)}"}


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


async def _seed_accounts(
    db: AsyncSession,
    org: str = _ORG,
) -> dict[str, str]:
    """
    Seed three active GL accounts mimicking the Phase B JE-1000-2026-0001:
      - 121000-001  Finished Goods Inventory (asset)
      - 121000-002  Raw Materials - Fertilisers (asset)
      - 221000-099  GR/IR Clearing Account (liability)

    Returns a dict mapping accountNumber → accountId.
    """
    accounts_def = [
        ("121000-001", "Finished Goods Inventory", AccountTypeEnum.ASSET, DrawerEnum.ASSETS),
        ("121000-002", "Raw Materials - Fertilisers", AccountTypeEnum.ASSET, DrawerEnum.ASSETS),
        ("221000-099", "GR/IR Clearing Account", AccountTypeEnum.LIABILITY, DrawerEnum.LIABILITIES),
    ]

    result: dict[str, str] = {}

    for number, name, acct_type, drawer in accounts_def:
        # Check if already seeded (module-scoped SQLite)
        existing = await db.execute(
            select(GLAccount.accountId).where(
                GLAccount.organizationId == org,
                GLAccount.accountNumber == number,
            )
        )
        acct_id = existing.scalar_one_or_none()
        if acct_id is not None:
            result[number] = acct_id
            continue

        acct_id = str(uuid.uuid4())
        db.add(GLAccount(
            accountId=acct_id,
            organizationId=org,
            accountNumber=number,
            accountName=name,
            drawer=drawer,
            accountType=acct_type,
            isHeader=False,
            isControlAccount=False,
            isActive=True,
            isLockedNumber=False,
            accountLevel=AccountLevelEnum.ACTIVE,
        ))
        result[number] = acct_id

    await db.flush()
    return result


async def _ensure_period(
    db: AsyncSession,
    company_code: str = _COMPANY_CODE,
    year: int = 2026,
    period_number: int = 1,
    start: date = date(2026, 1, 1),
    end: date = date(2026, 12, 31),
    status: PeriodStatusEnum = PeriodStatusEnum.OPEN,
) -> str:
    """Return or create a fiscal period."""
    result = await db.execute(
        select(FiscalPeriod.periodId).where(
            FiscalPeriod.companyCode == company_code,
            FiscalPeriod.fiscalYear == year,
            FiscalPeriod.periodNumber == period_number,
        )
    )
    pid = result.scalar_one_or_none()
    if pid is not None:
        return pid

    period = FiscalPeriod(
        periodId=str(uuid.uuid4()),
        companyCode=company_code,
        fiscalYear=year,
        periodNumber=period_number,
        startDate=start,
        endDate=end,
        status=status,
    )
    db.add(period)
    await db.flush()
    return period.periodId


async def _create_je(
    db: AsyncSession,
    period_id: str,
    lines: list[dict],  # each: {accountId, debit, credit}
    je_suffix: str = "0001",
    je_date: date = date(2026, 1, 15),
    je_status: JEStatusEnum = JEStatusEnum.POSTED,
) -> str:
    """Insert a JE with arbitrary lines. Returns jeId."""
    total_dr = sum(Decimal(str(ln.get("debit") or 0)) for ln in lines)
    total_cr = sum(Decimal(str(ln.get("credit") or 0)) for ln in lines)

    je_id = str(uuid.uuid4())
    je = JournalEntry(
        jeId=je_id,
        organizationId=_ORG,
        companyCode=_COMPANY_CODE,
        jeNumber=f"JE-{_COMPANY_CODE}-2026-{je_suffix}",
        jeDate=je_date,
        periodId=period_id,
        sourceEventType="purchase_received",
        sourceEventId=str(uuid.uuid4()),
        sourceDocId=str(uuid.uuid4()),
        sourceDocNumber=f"GR-{je_suffix}",
        description=f"Test JE {je_suffix}",
        totalDebit=total_dr,
        totalCredit=total_cr,
        status=je_status,
        postedAt=datetime.now(timezone.utc).replace(tzinfo=None),
        postedBy="system",
    )
    db.add(je)

    for i, ln in enumerate(lines, start=1):
        db.add(JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=je_id,
            lineNumber=i,
            accountId=ln["accountId"],
            debit=Decimal(str(ln["debit"])) if ln.get("debit") else None,
            credit=Decimal(str(ln["credit"])) if ln.get("credit") else None,
            description=ln.get("description", f"Line {i}"),
        ))

    await db.flush()
    return je_id


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_trial_balance_empty_db_returns_zero_balances(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    With no JEs posted, all active accounts must appear in the result
    with totalDebit = totalCredit = balance = 0.

    The totals row must also show 0 / 0.
    """
    await _seed_accounts(db_session)

    resp = await client.get(
        _TB_URL,
        params={"organization_id": _ORG, "company_code": _COMPANY_CODE},
        headers=auth_headers(),
    )
    assert resp.status_code == 200, resp.text

    body = resp.json()["data"]
    assert body["organizationId"] == _ORG
    assert body["companyCode"] == _COMPANY_CODE
    assert len(body["accounts"]) >= 3  # at least our seeded accounts

    for acct in body["accounts"]:
        assert Decimal(acct["totalDebit"]) == Decimal("0"), (
            f"Account {acct['accountNumber']} should have zero debit"
        )
        assert Decimal(acct["totalCredit"]) == Decimal("0"), (
            f"Account {acct['accountNumber']} should have zero credit"
        )

    assert Decimal(body["totals"]["totalDebit"]) == Decimal("0")
    assert Decimal(body["totals"]["totalCredit"]) == Decimal("0")


@pytest.mark.asyncio
async def test_trial_balance_after_gr_je_totals_balance(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    After posting the Phase-B GR JE (DR 121000-001 15000, DR 121000-002 20000,
    CR 221000-099 35000):
    - Total debit across all accounts == 35000
    - Total credit across all accounts == 35000
    - Balance for 121000-001 is positive (asset, natural DR)
    - Balance for 221000-099 is positive (liability, natural CR)
    """
    accounts = await _seed_accounts(db_session)
    period_id = await _ensure_period(db_session, period_number=2)

    await _create_je(
        db_session,
        period_id=period_id,
        je_suffix="8001",
        lines=[
            {"accountId": accounts["121000-001"], "debit": "15000.00", "credit": None,
             "description": "DR Finished Goods 15000"},
            {"accountId": accounts["121000-002"], "debit": "20000.00", "credit": None,
             "description": "DR Raw Materials 20000"},
            {"accountId": accounts["221000-099"], "debit": None, "credit": "35000.00",
             "description": "CR GR/IR Clearing 35000"},
        ],
    )

    resp = await client.get(
        _TB_URL,
        params={"organization_id": _ORG, "company_code": _COMPANY_CODE},
        headers=auth_headers(),
    )
    assert resp.status_code == 200, resp.text

    body = resp.json()["data"]
    totals = body["totals"]

    # Grand totals must equal 35000 (proves books balance)
    assert Decimal(totals["totalDebit"]) == Decimal("35000.00"), (
        f"Expected total DR=35000, got {totals['totalDebit']}"
    )
    assert Decimal(totals["totalCredit"]) == Decimal("35000.00"), (
        f"Expected total CR=35000, got {totals['totalCredit']}"
    )

    # Per-account assertions
    acct_by_number = {acct["accountNumber"]: acct for acct in body["accounts"]}

    # 121000-001 is an asset (DR natural) → positive balance
    fg_acct = acct_by_number["121000-001"]
    assert Decimal(fg_acct["totalDebit"]) == Decimal("15000.00")
    assert Decimal(fg_acct["balance"]) > Decimal("0"), (
        "Asset account 121000-001 should have a positive DR balance"
    )

    # 121000-002 is an asset → positive balance
    rm_acct = acct_by_number["121000-002"]
    assert Decimal(rm_acct["totalDebit"]) == Decimal("20000.00")
    assert Decimal(rm_acct["balance"]) > Decimal("0")

    # 221000-099 is a liability (CR natural) → positive balance
    grir_acct = acct_by_number["221000-099"]
    assert Decimal(grir_acct["totalCredit"]) == Decimal("35000.00")
    assert Decimal(grir_acct["balance"]) > Decimal("0"), (
        "Liability account 221000-099 should have a positive CR balance"
    )

    # Sample output for the report requirement
    import json
    sample = {
        "organizationId": body["organizationId"],
        "companyCode": body["companyCode"],
        "asOfDate": body["asOfDate"],
        "generatedAt": body["generatedAt"],
        "includesVoided": body["includesVoided"],
        "accounts": [
            {k: acct[k] for k in (
                "accountNumber", "accountName", "accountType",
                "totalDebit", "totalCredit", "balance",
            )}
            for acct in body["accounts"]
            if acct["accountNumber"] in ("121000-001", "121000-002", "221000-099")
        ],
        "totals": body["totals"],
    }
    # Write sample JSON to stdout so it appears in pytest -s output
    print("\n--- Sample Trial Balance JSON ---")
    print(json.dumps(sample, indent=2))


@pytest.mark.asyncio
async def test_trial_balance_as_of_date_filter(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    JEs posted after as_of_date must be excluded from the balance.

    We post two JEs:
    - JE-A on 2026-03-01 (DR 1000)
    - JE-B on 2026-04-01 (DR 2000)

    as_of_date=2026-03-31 should include JE-A but not JE-B.
    """
    accounts = await _seed_accounts(db_session)
    period_id = await _ensure_period(db_session, period_number=3,
                                      start=date(2026, 3, 1), end=date(2026, 4, 30))

    await _create_je(
        db_session, period_id, je_suffix="8010",
        je_date=date(2026, 3, 1),
        lines=[
            {"accountId": accounts["121000-001"], "debit": "1000.00", "credit": None},
            {"accountId": accounts["221000-099"], "debit": None, "credit": "1000.00"},
        ],
    )
    await _create_je(
        db_session, period_id, je_suffix="8011",
        je_date=date(2026, 4, 1),
        lines=[
            {"accountId": accounts["121000-001"], "debit": "2000.00", "credit": None},
            {"accountId": accounts["221000-099"], "debit": None, "credit": "2000.00"},
        ],
    )

    # Query as of 2026-03-31 — should include only JE-A
    resp = await client.get(
        _TB_URL,
        params={
            "organization_id": _ORG,
            "company_code": _COMPANY_CODE,
            "as_of_date": "2026-03-31",
        },
        headers=auth_headers(),
    )
    assert resp.status_code == 200, resp.text

    body = resp.json()["data"]
    assert body["asOfDate"] == "2026-03-31"

    acct_by_number = {acct["accountNumber"]: acct for acct in body["accounts"]}
    fg_total_dr = Decimal(acct_by_number["121000-001"]["totalDebit"])

    # Should reflect only JE-A (1000) from this test run, possibly combined
    # with other seeded amounts from earlier tests.  Key assertion: not 3000.
    # We verify the 2026-04-01 JE is excluded.
    # Since SQLite doesn't roll back between tests sharing the same engine,
    # we check relative: the amount must be < 3000 (JE-B excluded).
    # Absolute: we check that JE-B's 2000 is NOT included at the 2026-03-31 cutoff.
    # Safer: query again without filter and compare.
    resp_all = await client.get(
        _TB_URL,
        params={"organization_id": _ORG, "company_code": _COMPANY_CODE},
        headers=auth_headers(),
    )
    all_accts = {acct["accountNumber"]: acct for acct in resp_all.json()["data"]["accounts"]}
    full_total = Decimal(all_accts["121000-001"]["totalDebit"])

    # The filtered total must be less than the full total by at least 2000
    # (the amount from JE-B posted on 2026-04-01)
    assert full_total - fg_total_dr >= Decimal("2000.00"), (
        f"as_of_date filter should exclude JE-B (2000). "
        f"Full total: {full_total}, filtered total: {fg_total_dr}"
    )


@pytest.mark.asyncio
async def test_trial_balance_include_voided_true(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    include_voided=true must include voided JEs in the balance.
    include_voided=false (default) must exclude them.
    """
    accounts = await _seed_accounts(db_session)
    period_id = await _ensure_period(db_session, period_number=4,
                                      start=date(2026, 4, 1), end=date(2026, 4, 30))

    # Post a voided JE
    await _create_je(
        db_session, period_id, je_suffix="8020",
        je_date=date(2026, 4, 10),
        je_status=JEStatusEnum.VOID,
        lines=[
            {"accountId": accounts["121000-001"], "debit": "9999.00", "credit": None},
            {"accountId": accounts["221000-099"], "debit": None, "credit": "9999.00"},
        ],
    )

    # include_voided=false → 9999 should NOT appear in 121000-001's total
    resp_excl = await client.get(
        _TB_URL,
        params={
            "organization_id": _ORG,
            "company_code": _COMPANY_CODE,
            "include_voided": "false",
        },
        headers=auth_headers(),
    )
    assert resp_excl.status_code == 200
    accts_excl = {a["accountNumber"]: a for a in resp_excl.json()["data"]["accounts"]}
    excl_dr = Decimal(accts_excl["121000-001"]["totalDebit"])

    # include_voided=true → 9999 MUST appear
    resp_incl = await client.get(
        _TB_URL,
        params={
            "organization_id": _ORG,
            "company_code": _COMPANY_CODE,
            "include_voided": "true",
        },
        headers=auth_headers(),
    )
    assert resp_incl.status_code == 200
    accts_incl = {a["accountNumber"]: a for a in resp_incl.json()["data"]["accounts"]}
    incl_dr = Decimal(accts_incl["121000-001"]["totalDebit"])

    assert incl_dr > excl_dr, (
        f"include_voided=true ({incl_dr}) should be greater than "
        f"include_voided=false ({excl_dr}) due to the 9999 voided JE"
    )
    assert incl_dr - excl_dr >= Decimal("9999.00"), (
        "Difference must account for the voided JE's 9999 debit"
    )


@pytest.mark.asyncio
async def test_trial_balance_non_finance_role_forbidden(
    client: AsyncClient,
) -> None:
    """Non-finance roles must receive 403."""
    for role in ("farmer", "operator", "viewer"):
        resp = await client.get(
            _TB_URL,
            params={"organization_id": _ORG, "company_code": _COMPANY_CODE},
            headers=auth_headers(role=role),
        )
        assert resp.status_code == 403, (
            f"Expected 403 for role={role}, got {resp.status_code}"
        )
