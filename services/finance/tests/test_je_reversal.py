"""
Tests for POST /journal-entries/{je_id}/reverse — JE Reversal endpoint.

Covers:
  - Happy path: reverse a 3-line JE → original status=void, reversal exists
    with swapped lines, totals balanced (DR == CR invariant).
  - Reverse a JE that is already void → 400.
  - Reverse a non-existent JE → 404.
  - Non-finance role tries to reverse → 403.
  - Original period closed, but current period open → reversal posts in
    current period (verify jeDate=today, periodId=current open).
  - Reversal description includes the user-provided reason.
  - Original JE line debits become reversal credits and vice versa.
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

_ORG = "org-reversal-test"
_COMPANY_CODE = "REV1"
_BASE_URL = "http://test"
_REVERSAL_URL_TEMPLATE = "/api/v1/finance/journal-entries/{je_id}/reverse"


# ---------------------------------------------------------------------------
# Session + client fixtures (module-scoped table creation)
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


def make_token(role: str = "finance_admin", user_id: str = "user-rev-001") -> str:
    """Generate a signed JWT for the given role."""
    from datetime import timedelta

    from jose import jwt

    payload = {
        "userId": user_id,
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


async def _ensure_account(db: AsyncSession) -> str:
    """Return or create a GL account for the test org."""
    result = await db.execute(
        select(GLAccount.accountId)
        .where(
            GLAccount.organizationId == _ORG,
            GLAccount.isActive == True,  # noqa: E712
        )
        .limit(1)
    )
    acct_id = result.scalar_one_or_none()
    if acct_id is not None:
        return acct_id

    # Seed a minimal account so tests are self-contained
    from finance.models.orm.models import (
        AccountLevelEnum,
        AccountRoleEnum,
        AccountTypeEnum,
        DrawerEnum,
    )

    acct = GLAccount(
        accountId=str(uuid.uuid4()),
        organizationId=_ORG,
        accountNumber="100000-REV",
        accountName="Test Asset Account",
        drawer=DrawerEnum.ASSETS,
        accountType=AccountTypeEnum.ASSET,
        isHeader=False,
        isControlAccount=False,
        isActive=True,
        isLockedNumber=False,
        accountLevel=AccountLevelEnum.ACTIVE,
    )
    db.add(acct)
    await db.flush()
    return acct.accountId


async def _ensure_open_period(
    db: AsyncSession,
    company_code: str = _COMPANY_CODE,
    year: int = 2026,
    period_number: int = 5,
    start: date = date(2026, 5, 1),
    end: date = date(2026, 5, 31),
) -> str:
    """Return or create an OPEN fiscal period covering the given range."""
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
        status=PeriodStatusEnum.OPEN,
    )
    db.add(period)
    await db.flush()
    return period.periodId


async def _ensure_closed_period(
    db: AsyncSession,
    company_code: str = _COMPANY_CODE,
    year: int = 2026,
    period_number: int = 1,
    start: date = date(2026, 1, 1),
    end: date = date(2026, 1, 31),
) -> str:
    """Return or create a CLOSED fiscal period for past months."""
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
        status=PeriodStatusEnum.CLOSED,
    )
    db.add(period)
    await db.flush()
    return period.periodId


async def _create_posted_je(
    db: AsyncSession,
    account_id: str,
    period_id: str,
    je_suffix: str = "9001",
    num_dr_lines: int = 2,
    dr_amount: Decimal = Decimal("500.00"),
    cr_amount: Decimal = Decimal("1000.00"),
    je_date: date = date(2026, 1, 15),
) -> str:
    """
    Create a posted JE with `num_dr_lines` debit lines and one credit line.

    Default: 2 DR lines of 500 each + 1 CR line of 1000 (balanced).
    Returns the jeId.
    """
    je_id = str(uuid.uuid4())
    total = dr_amount * num_dr_lines

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
        sourceDocNumber=f"GR-2026-{je_suffix}",
        description="Test JE for reversal tests",
        totalDebit=total,
        totalCredit=total,
        status=JEStatusEnum.POSTED,
        postedAt=datetime.now(timezone.utc).replace(tzinfo=None),
        postedBy="system",
    )
    db.add(je)

    # Add DR lines
    for i in range(1, num_dr_lines + 1):
        db.add(JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=je_id,
            lineNumber=i,
            accountId=account_id,
            debit=dr_amount,
            credit=None,
            description=f"DR line {i}",
        ))

    # Add CR line
    db.add(JournalEntryLine(
        jeLineId=str(uuid.uuid4()),
        jeId=je_id,
        lineNumber=num_dr_lines + 1,
        accountId=account_id,
        debit=None,
        credit=total,
        description="CR clearing line",
    ))

    await db.flush()
    return je_id


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reverse_happy_path_3_line_je(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Happy path: reverse a 3-line JE (2 DR + 1 CR).

    Verifies the standard reversing-entry pattern (cf39a23):
    - original stays POSTED (not voided — two posted JEs net to zero)
    - original.reversedByJeNumber is populated with the reversal JE number
    - reversal exists with swapped lines and is also POSTED
    - totalDebit == totalCredit on the reversal (DR == CR invariant)
    - reversal description contains the user-provided reason
    - original DR lines become reversal CR lines and vice versa
    """
    account_id = await _ensure_account(db_session)
    period_id = await _ensure_open_period(db_session)
    je_id = await _create_posted_je(
        db_session, account_id, period_id, je_suffix="9100",
        num_dr_lines=2, dr_amount=Decimal("500.00"),
    )

    reason = "Incorrectly booked — reversing per finance review"
    response = await client.post(
        _REVERSAL_URL_TEMPLATE.format(je_id=je_id),
        json={"reason": reason},
        params={"organization_id": _ORG},
        headers=auth_headers("finance_admin"),
    )
    assert response.status_code == 201, response.text

    data = response.json()["data"]

    # --- Original remains posted (standard reversing-entry pattern) ---
    original = data["original"]
    assert original["jeId"] == je_id
    assert original["status"] == "posted"
    # reversedByJeNumber is populated so the UI can show a "Reversed" badge
    assert original["reversedByJeNumber"] is not None

    # --- Reversal is posted ---
    reversal = data["reversal"]
    assert reversal["status"] == "posted"
    assert reversal["sourceEventType"] == "je_reversal"
    assert reversal["sourceDocId"] == je_id
    assert reversal["sourceDocNumber"] == original["jeNumber"]

    # --- Reversal description contains the reason ---
    assert reason in reversal["description"]

    # --- DR == CR invariant on the reversal ---
    rev_dr = Decimal(reversal["totalDebit"])
    rev_cr = Decimal(reversal["totalCredit"])
    assert rev_dr == rev_cr, f"Reversal imbalance: DR={rev_dr} CR={rev_cr}"

    # --- Totals are swapped from original ---
    orig_dr = Decimal(original["totalDebit"])
    orig_cr = Decimal(original["totalCredit"])
    assert rev_dr == orig_cr
    assert rev_cr == orig_dr

    # --- Lines: DR lines of original become CR lines in reversal ---
    orig_lines = original["lines"]
    rev_lines = reversal["lines"]
    assert len(orig_lines) == len(rev_lines) == 3

    # Build lookup by lineNumber
    orig_by_num = {ln["lineNumber"]: ln for ln in orig_lines}
    rev_by_num = {ln["lineNumber"]: ln for ln in rev_lines}

    for ln_num in orig_by_num:
        orig_line = orig_by_num[ln_num]
        rev_line = rev_by_num[ln_num]

        orig_dr_val = orig_line.get("debit")
        orig_cr_val = orig_line.get("credit")

        # Original DR → reversal CR
        if orig_dr_val is not None:
            assert rev_line["credit"] is not None, (
                f"Line {ln_num}: expected reversal CR but got None"
            )
            assert Decimal(str(rev_line["credit"])) == Decimal(str(orig_dr_val)), (
                f"Line {ln_num}: reversal CR {rev_line['credit']} != original DR {orig_dr_val}"
            )
            assert rev_line["debit"] is None

        # Original CR → reversal DR
        if orig_cr_val is not None:
            assert rev_line["debit"] is not None, (
                f"Line {ln_num}: expected reversal DR but got None"
            )
            assert Decimal(str(rev_line["debit"])) == Decimal(str(orig_cr_val)), (
                f"Line {ln_num}: reversal DR {rev_line['debit']} != original CR {orig_cr_val}"
            )
            assert rev_line["credit"] is None


@pytest.mark.asyncio
async def test_reverse_already_void_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Reversing a JE that has already been reversed must return 400.

    Standard reversing-entry pattern (cf39a23): original stays posted, the
    guard checks for an existing je_reversal sourced from the same jeNumber
    and returns 400 with "has already been reversed by" in the detail.
    """
    account_id = await _ensure_account(db_session)
    # Use May 2026 (period_number=5) so the period covers today (2026-05-24).
    period_id = await _ensure_open_period(db_session, period_number=5,
                                           start=date(2026, 5, 1), end=date(2026, 5, 31))
    je_id = await _create_posted_je(
        db_session, account_id, period_id, je_suffix="9200",
    )

    # First reversal — should succeed
    resp1 = await client.post(
        _REVERSAL_URL_TEMPLATE.format(je_id=je_id),
        json={"reason": "First reversal — legitimate"},
        params={"organization_id": _ORG},
        headers=auth_headers(),
    )
    assert resp1.status_code == 201, resp1.text

    # Second reversal attempt on the already-reversed JE.
    # Guard message: "Journal entry {jeNumber} has already been reversed by {reversalJeNumber}."
    resp2 = await client.post(
        _REVERSAL_URL_TEMPLATE.format(je_id=je_id),
        json={"reason": "Trying to reverse again"},
        params={"organization_id": _ORG},
        headers=auth_headers(),
    )
    assert resp2.status_code == 400
    assert "reversed" in resp2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_reverse_nonexistent_je_returns_404(
    client: AsyncClient,
) -> None:
    """Reversing a non-existent JE must return 404."""
    resp = await client.post(
        _REVERSAL_URL_TEMPLATE.format(je_id=str(uuid.uuid4())),
        json={"reason": "Attempting reversal of ghost JE"},
        params={"organization_id": _ORG},
        headers=auth_headers(),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_reverse_unauthorized_role_returns_403(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Non-finance roles (accountant, auditor) must get 403."""
    account_id = await _ensure_account(db_session)
    period_id = await _ensure_open_period(db_session, period_number=7,
                                           start=date(2026, 7, 1), end=date(2026, 7, 31))
    je_id = await _create_posted_je(
        db_session, account_id, period_id, je_suffix="9300",
    )

    for role in ("accountant", "auditor"):
        resp = await client.post(
            _REVERSAL_URL_TEMPLATE.format(je_id=je_id),
            json={"reason": "Should be rejected due to insufficient role"},
            params={"organization_id": _ORG},
            headers=auth_headers(role=role),
        )
        assert resp.status_code == 403, (
            f"Expected 403 for role={role}, got {resp.status_code}"
        )


@pytest.mark.asyncio
async def test_reverse_original_in_closed_period_posts_in_current_open_period(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    When the original JE is in a closed period, the reversal must still
    post in today's open fiscal period (not the original's closed period).

    Uses an isolated company code (REVC) to avoid fiscal period collisions
    with other tests that also create open periods covering today.

    Verifies:
    - reversal.jeDate = today
    - reversal.periodId = current open period (NOT the closed original period)
    """
    # Reason: use a dedicated company code so this test's fiscal periods are
    # completely isolated from those created by other tests in this module.
    _isolated_company = "REVC"

    account_id = await _ensure_account(db_session)

    # Original JE goes into a closed period (Jan 2026) under the isolated company
    closed_period_id = await _ensure_closed_period(
        db_session,
        company_code=_isolated_company,
        period_number=1,
        start=date(2026, 1, 1),
        end=date(2026, 1, 31),
    )

    # Current open period covers today (May 2026) under the isolated company
    current_period_id = await _ensure_open_period(
        db_session,
        company_code=_isolated_company,
        period_number=5,
        start=date(2026, 5, 1),
        end=date(2026, 5, 31),
    )

    # Create the JE in the closed period, but under the isolated company
    je_id = str(uuid.uuid4())
    from finance.models.orm.models import JournalEntry, JournalEntryLine, JEStatusEnum
    je = JournalEntry(
        jeId=je_id,
        organizationId=_ORG,
        companyCode=_isolated_company,
        jeNumber=f"JE-{_isolated_company}-2026-9400",
        jeDate=date(2026, 1, 15),
        periodId=closed_period_id,
        sourceEventType="purchase_received",
        sourceEventId=str(uuid.uuid4()),
        sourceDocId=str(uuid.uuid4()),
        sourceDocNumber="GR-REVC-9400",
        description="Test JE in closed period",
        totalDebit=Decimal("500.00"),
        totalCredit=Decimal("500.00"),
        status=JEStatusEnum.POSTED,
        postedAt=datetime.now(timezone.utc).replace(tzinfo=None),
        postedBy="system",
    )
    db_session.add(je)
    db_session.add(JournalEntryLine(
        jeLineId=str(uuid.uuid4()), jeId=je_id, lineNumber=1,
        accountId=account_id, debit=Decimal("500.00"), credit=None,
        description="DR test",
    ))
    db_session.add(JournalEntryLine(
        jeLineId=str(uuid.uuid4()), jeId=je_id, lineNumber=2,
        accountId=account_id, debit=None, credit=Decimal("500.00"),
        description="CR test",
    ))
    await db_session.flush()

    resp = await client.post(
        _REVERSAL_URL_TEMPLATE.format(je_id=je_id),
        json={"reason": "Reversing JE from closed period"},
        params={"organization_id": _ORG},
        headers=auth_headers(),
    )
    assert resp.status_code == 201, resp.text

    reversal = resp.json()["data"]["reversal"]

    today = date.today().isoformat()
    assert reversal["jeDate"] == today, (
        f"Reversal jeDate should be today ({today}), got {reversal['jeDate']}"
    )
    assert reversal["periodId"] == current_period_id, (
        f"Reversal should use current open period {current_period_id}, "
        f"got {reversal['periodId']}"
    )
    assert reversal["periodId"] != closed_period_id, (
        "Reversal must NOT be posted in the original's closed period"
    )


@pytest.mark.asyncio
async def test_reversal_description_contains_reason(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """The reversal JE description must include the user-provided reason."""
    account_id = await _ensure_account(db_session)
    period_id = await _ensure_open_period(db_session, period_number=9,
                                           start=date(2026, 9, 1), end=date(2026, 9, 30))
    je_id = await _create_posted_je(
        db_session, account_id, period_id, je_suffix="9500",
    )

    reason = "Duplicate posting identified in month-end review"
    resp = await client.post(
        _REVERSAL_URL_TEMPLATE.format(je_id=je_id),
        json={"reason": reason},
        params={"organization_id": _ORG},
        headers=auth_headers(),
    )
    assert resp.status_code == 201, resp.text

    reversal = resp.json()["data"]["reversal"]
    assert reason in reversal["description"], (
        f"Reversal description '{reversal['description']}' should contain reason: {reason}"
    )


@pytest.mark.asyncio
async def test_reversal_dr_cr_swap_is_exact(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Every original DR line must become a CR line of the same amount in the
    reversal, and every original CR line must become a DR line.

    Uses a 1-DR + 1-CR JE for simplicity and unambiguous mapping.
    """
    account_id = await _ensure_account(db_session)
    period_id = await _ensure_open_period(db_session, period_number=10,
                                           start=date(2026, 10, 1), end=date(2026, 10, 31))

    # Create a simple 1 DR + 1 CR JE
    je_id = await _create_posted_je(
        db_session, account_id, period_id, je_suffix="9600",
        num_dr_lines=1, dr_amount=Decimal("750.00"),
    )

    resp = await client.post(
        _REVERSAL_URL_TEMPLATE.format(je_id=je_id),
        json={"reason": "Testing exact DR/CR swap"},
        params={"organization_id": _ORG},
        headers=auth_headers(),
    )
    assert resp.status_code == 201, resp.text

    original_lines = resp.json()["data"]["original"]["lines"]
    reversal_lines = resp.json()["data"]["reversal"]["lines"]

    orig_by_num = {ln["lineNumber"]: ln for ln in original_lines}
    rev_by_num = {ln["lineNumber"]: ln for ln in reversal_lines}

    # Line 1: original DR 750 → reversal CR 750
    assert orig_by_num[1]["debit"] is not None
    assert Decimal(str(orig_by_num[1]["debit"])) == Decimal("750.00")
    assert rev_by_num[1]["credit"] is not None
    assert Decimal(str(rev_by_num[1]["credit"])) == Decimal("750.00")
    assert rev_by_num[1]["debit"] is None

    # Line 2: original CR 750 → reversal DR 750
    assert orig_by_num[2]["credit"] is not None
    assert Decimal(str(orig_by_num[2]["credit"])) == Decimal("750.00")
    assert rev_by_num[2]["debit"] is not None
    assert Decimal(str(rev_by_num[2]["debit"])) == Decimal("750.00")
    assert rev_by_num[2]["credit"] is None
