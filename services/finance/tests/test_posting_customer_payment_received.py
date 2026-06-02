"""
Tests for T-100.10.1 — _handle_customer_payment_received / _handle_customer_payment_cancelled.

Wave 3 Phase 2 finale: cash collection wired end-to-end.

Posting pattern for customer_payment_received:
  DR  Bank / Cash Account   (payload.bankAccountId — validated ASSETS/asset/active/non-header)
  CR  AR Control Account    (resolved via 3-tier chain: customer_finance_ext →
                              company_posting_setup → 124000-001 account number lookup)

Single 2-line JE regardless of allocation count. Allocation detail lives in the
operations sub-ledger; finance records only the net cash movement.

Cancellation:
  Finds original customer_payment_received JE by sourceEventId == originalEventId,
  posts a reversing entry (DR/CR swapped), leaving original POSTED.
  Duplicate cancellation events are idempotent no-ops (handler-level guard).

Test cases
----------
Bank account validation:
 1. bank_account_not_found_returns_400
 2. bank_account_inactive_returns_400
 3. bank_account_wrong_drawer_returns_400
 4. bank_account_wrong_account_type_returns_400

Posting logic:
 5. happy_path_single_allocation — 2-line JE balanced (Dr Bank + Cr AR)
 6. happy_path_multi_allocation — still 2-line JE (sum), description lists all invoice numbers
 7. ar_resolution_all_tiers_fail_returns_400
 8. ar_resolution_tier1_customer_ext_used
 9. ar_resolution_tier3_fallback_used
10. closed_fiscal_period_returns_400
11. duplicate_event_id_is_idempotent

Cancellation:
12. cancellation_happy_path_reversal_nets_to_zero
13. cancellation_original_not_found_returns_400
14. cancellation_duplicate_is_idempotent
"""

import os
import uuid
from datetime import date, datetime, timezone
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
    AccountTypeEnum,
    CompanyPostingSetup,
    CustomerFinanceExt,
    DrawerEnum,
    FiscalPeriod,
    GLAccount,
    JournalEntry,
    JournalEntryLine,
    PeriodStatusEnum,
    ValuationMethodEnum,
)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_INGEST_URL = "/api/v1/finance/events/ingest"
_VALID_SECRET = "test-ingest-secret"
_ORG_UUID = "d0000000-0000-4000-8000-000000000099"
_ORG = _ORG_UUID
_COMPANY_CODE_BASE = "CPR"


# ---------------------------------------------------------------------------
# Session + client fixtures (module-local, isolated from conftest)
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
# JWT helper
# ---------------------------------------------------------------------------


def _make_jwt(role: str = "finance_admin") -> str:
    """Generate a test JWT signed with the test SECRET_KEY."""
    from datetime import timedelta

    from jose import jwt

    payload = {
        "userId": "test-user-cpr",
        "email": "test@a64core.com",
        "role": role,
        "type": "access",
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    return jwt.encode(payload, "test_secret_key", algorithm="HS256")


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


async def _seed_company(client: AsyncClient, code: str) -> None:
    """Create a company (seeds CoA + posting setup)."""
    resp = await client.post(
        "/api/v1/finance/companies",
        json={
            "companyCode": code,
            "organizationId": _ORG,
            "legalName": f"Customer Payment Test Co {code} LLC",
        },
        headers={"Authorization": "Bearer " + _make_jwt()},
    )
    assert resp.status_code in (201, 409), resp.text


async def _seed_posting_setup(
    db_session: AsyncSession,
    organization_id: str,
    company_code: str,
    ar_control_account_id: Optional[str] = None,
) -> CompanyPostingSetup:
    """Insert a minimal CompanyPostingSetup row."""
    setup = CompanyPostingSetup(
        setupId=str(uuid.uuid4()),
        organizationId=organization_id,
        companyCode=company_code,
        arControlAccountId=ar_control_account_id,
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


async def _make_gl_account(
    db_session: AsyncSession,
    organization_id: str,
    drawer: DrawerEnum,
    account_type: AccountTypeEnum,
    active: bool = True,
    is_header: bool = False,
    account_number: Optional[str] = None,
) -> str:
    """Create a synthetic GL account and return its accountId."""
    acct_id = str(uuid.uuid4())
    acct = GLAccount(
        accountId=acct_id,
        organizationId=organization_id,
        accountNumber=account_number or f"{drawer.value[:3]}-{acct_id[:6]}",
        accountName=f"Test {drawer.value} {acct_id[:4]}",
        drawer=drawer,
        accountType=account_type,
        isHeader=is_header,
        isActive=active,
        accountLevel=AccountLevelEnum.ACTIVE,
    )
    db_session.add(acct)
    await db_session.flush()
    return acct_id


async def _seed_customer_finance_ext(
    db_session: AsyncSession,
    organization_id: str,
    customer_id: str,
    ar_control_account_id: Optional[str] = None,
) -> CustomerFinanceExt:
    """Insert a CustomerFinanceExt row."""
    ext = CustomerFinanceExt(
        customer_finance_ext_id=str(uuid.uuid4()),
        organizationId=organization_id,
        customerId=customer_id,
        arControlAccountId=ar_control_account_id,
    )
    db_session.add(ext)
    await db_session.flush()
    return ext


def _make_receipt_event(
    organization_id: str = _ORG_UUID,
    company_code: str = _COMPANY_CODE_BASE,
    doc_date: str = "2026-06-20",
    customer_id: Optional[str] = None,
    customer_name: str = "Fresh Market LLC",
    bank_account_id: Optional[str] = None,
    amount_received: str = "1050.00",
    allocations: Optional[List[Dict[str, Any]]] = None,
    event_id: Optional[str] = None,
    receipt_doc_number: str = "IPAY-2026-0001",
) -> Dict[str, Any]:
    """
    Return a valid customer_payment_received event dict.

    Defaults to a single allocation of 1050.00 against ARI-2026-0001.
    """
    cid = customer_id or str(uuid.uuid4())
    bid = bank_account_id or str(uuid.uuid4())
    if allocations is None:
        allocations = [
            {
                "allocationLineNumber": 1,
                "arInvoiceDocEntry": str(uuid.uuid4()),
                "arInvoiceDocNumber": "ARI-2026-0001",
                "amountApplied": amount_received,
            }
        ]
    return {
        "eventId": event_id or str(uuid.uuid4()),
        "eventType": "customer_payment_received",
        "organizationId": organization_id,
        "companyCode": company_code,
        "occurredAt": datetime.utcnow().isoformat(),
        "sourceUserId": str(uuid.uuid4()),
        "payload": {
            "receiptDocEntry": str(uuid.uuid4()),
            "receiptDocNumber": receipt_doc_number,
            "docDate": doc_date,
            "customerId": cid,
            "customerName": customer_name,
            "bpRefNo": None,
            "paymentMethod": "bank_transfer",
            "paymentRef": "TRF-20260620-001",
            "bankAccountId": bid,
            "currency": "AED",
            "exchangeRate": "1.0",
            "amountReceived": amount_received,
            "allocations": allocations,
        },
    }


def _make_cancellation_event(
    original_event: Dict[str, Any],
    event_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build a customer_payment_cancelled event referencing the original posted event.
    """
    orig_payload = original_event["payload"]
    return {
        "eventId": event_id or str(uuid.uuid4()),
        "eventType": "customer_payment_cancelled",
        "organizationId": original_event["organizationId"],
        "companyCode": original_event["companyCode"],
        "occurredAt": datetime.utcnow().isoformat(),
        "sourceUserId": str(uuid.uuid4()),
        "payload": {
            **orig_payload,
            "originalEventId": original_event["eventId"],
        },
    }


async def _post_event(client: AsyncClient, event: Dict[str, Any]) -> Any:
    resp = await client.post(
        _INGEST_URL, json=event, headers={"X-Service-Secret": _VALID_SECRET}
    )
    return resp


# ---------------------------------------------------------------------------
# Test 1 — Bank account not found → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bank_account_not_found_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    bankAccountId points to a non-existent GL account → 400.
    """
    code = "CP01"
    await _seed_company(client, code)

    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124001-CP01"
    )
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=ar_acct)
    await _seed_fiscal_period(db_session, code)

    ghost_bank_id = str(uuid.uuid4())  # Never inserted
    event = _make_receipt_event(
        company_code=code,
        bank_account_id=ghost_bank_id,
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "bank account" in detail.lower() or "not found" in detail.lower()


# ---------------------------------------------------------------------------
# Test 2 — Bank account inactive → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bank_account_inactive_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    bankAccountId is an inactive GL account → 400.
    """
    code = "CP02"
    await _seed_company(client, code)

    inactive_bank = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        active=False, account_number="110002-DEAD"
    )
    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124002-CP02"
    )
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=ar_acct)
    await _seed_fiscal_period(db_session, code)

    event = _make_receipt_event(
        company_code=code,
        bank_account_id=inactive_bank,
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "inactive" in detail.lower() or "not found" in detail.lower()


# ---------------------------------------------------------------------------
# Test 3 — Bank account wrong drawer (REVENUE) → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bank_account_wrong_drawer_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    bankAccountId has drawer=REVENUE (not ASSETS) → 400.
    """
    code = "CP03"
    await _seed_company(client, code)

    wrong_drawer_bank = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-WRONG-CP03"
    )
    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124003-CP03"
    )
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=ar_acct)
    await _seed_fiscal_period(db_session, code)

    event = _make_receipt_event(
        company_code=code,
        bank_account_id=wrong_drawer_bank,
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "ASSETS" in detail or "drawer" in detail.lower()


# ---------------------------------------------------------------------------
# Test 4 — Bank account wrong accountType (liability) → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bank_account_wrong_account_type_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    bankAccountId has accountType=liability (not asset) but drawer=ASSETS → 400.

    This exercises the accountType guard after the drawer guard passes.
    """
    code = "CP04"
    await _seed_company(client, code)

    # Unusual: drawer=ASSETS but accountType=LIABILITY — misconfiguration scenario
    wrong_type_bank = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.LIABILITY,
        account_number="110004-TYPE-WRONG"
    )
    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124004-CP04"
    )
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=ar_acct)
    await _seed_fiscal_period(db_session, code)

    event = _make_receipt_event(
        company_code=code,
        bank_account_id=wrong_type_bank,
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "asset" in detail.lower() or "accountType" in detail


# ---------------------------------------------------------------------------
# Test 5 — Happy path single allocation → 2-line JE balanced
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_happy_path_single_allocation(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Single allocation receipt → exactly 2 JE lines (DR Bank + CR AR), balanced.

    Verifies:
    - JE header: sourceEventType, status=posted, totalDebit==totalCredit==amount
    - Line 1: DR bankAccountId  for amountReceived
    - Line 2: CR arControlAccountId for amountReceived
    - sourceDocNumber == receiptDocNumber
    """
    code = "CP05"
    await _seed_company(client, code)

    bank_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="110005-BANK"
    )
    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124005-AR"
    )
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=ar_acct)
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    event = _make_receipt_event(
        company_code=code,
        customer_id=customer_id,
        bank_account_id=bank_acct,
        amount_received="1050.00",
        receipt_doc_number="IPAY-2026-0005",
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "processed"

    # JE header checks
    result = await db_session.execute(
        select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
    )
    je = result.scalar_one_or_none()
    assert je is not None, "JournalEntry must be created"
    assert je.companyCode == code
    assert je.sourceEventType == "customer_payment_received"
    assert je.sourceDocNumber == "IPAY-2026-0005"
    assert je.status.value == "posted"
    assert float(je.totalDebit) == 1050.0
    assert float(je.totalCredit) == 1050.0
    assert je.postedBy == "system"
    assert "IPAY-2026-0005" in je.description
    assert "Fresh Market LLC" in je.description

    # Exactly 2 JE lines
    lines_result = await db_session.execute(
        select(JournalEntryLine).where(JournalEntryLine.jeId == je.jeId)
    )
    je_lines = lines_result.scalars().all()
    assert len(je_lines) == 2, f"Expected 2 lines (DR Bank + CR AR), got {len(je_lines)}"

    dr_lines = [l for l in je_lines if l.debit is not None]
    cr_lines = [l for l in je_lines if l.credit is not None]
    assert len(dr_lines) == 1
    assert len(cr_lines) == 1

    # DR line = bank account
    assert dr_lines[0].accountId == bank_acct
    assert float(dr_lines[0].debit) == 1050.0
    assert dr_lines[0].credit is None

    # CR line = AR control account
    assert cr_lines[0].accountId == ar_acct
    assert float(cr_lines[0].credit) == 1050.0
    assert cr_lines[0].debit is None

    # Balanced
    assert sum(float(l.debit) for l in dr_lines) == sum(float(l.credit) for l in cr_lines)


# ---------------------------------------------------------------------------
# Test 6 — Multi-allocation receipt → still 2-line JE (sum), description lists all
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_happy_path_multi_allocation(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Receipt that clears 3 AR invoices → still exactly 2 JE lines (flat sum).
    Description must mention all allocated invoice numbers.

    DR Bank  = total amountReceived (sum of all allocations)
    CR AR    = total amountReceived
    No per-allocation lines — finance records net cash movement only.
    """
    code = "CP06"
    await _seed_company(client, code)

    bank_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="110006-BANK"
    )
    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124006-AR"
    )
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=ar_acct)
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    allocations = [
        {
            "allocationLineNumber": 1,
            "arInvoiceDocEntry": str(uuid.uuid4()),
            "arInvoiceDocNumber": "ARI-2026-0010",
            "amountApplied": "500.00",
        },
        {
            "allocationLineNumber": 2,
            "arInvoiceDocEntry": str(uuid.uuid4()),
            "arInvoiceDocNumber": "ARI-2026-0011",
            "amountApplied": "300.00",
        },
        {
            "allocationLineNumber": 3,
            "arInvoiceDocEntry": str(uuid.uuid4()),
            "arInvoiceDocNumber": "ARI-2026-0012",
            "amountApplied": "250.00",
        },
    ]
    total = "1050.00"  # 500 + 300 + 250
    event = _make_receipt_event(
        company_code=code,
        customer_id=customer_id,
        bank_account_id=bank_acct,
        amount_received=total,
        allocations=allocations,
        receipt_doc_number="IPAY-2026-0006",
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 200, resp.text

    result = await db_session.execute(
        select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
    )
    je = result.scalar_one_or_none()
    assert je is not None

    # Still exactly 2 lines regardless of allocation count
    lines_result = await db_session.execute(
        select(JournalEntryLine).where(JournalEntryLine.jeId == je.jeId)
    )
    je_lines = lines_result.scalars().all()
    assert len(je_lines) == 2, (
        f"Expected 2 lines regardless of allocation count, got {len(je_lines)}"
    )

    # Both JE totals = full amount received
    assert float(je.totalDebit) == 1050.0
    assert float(je.totalCredit) == 1050.0

    # Description should list all three invoice numbers
    for inv_num in ("ARI-2026-0010", "ARI-2026-0011", "ARI-2026-0012"):
        assert inv_num in je.description, (
            f"Expected {inv_num} in JE description: {je.description}"
        )


# ---------------------------------------------------------------------------
# Test 7 — AR resolution falls through all 3 tiers → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ar_resolution_all_tiers_fail_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    No customer ext, no setup.arControlAccountId, and the seeded 124000-001
    account is deactivated → AR resolution fails → 400.
    """
    code = "CP07"
    await _seed_company(client, code)

    bank_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="110007-BANK"
    )
    # Setup has NO arControlAccountId
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=None)
    await _seed_fiscal_period(db_session, code)

    # Deactivate the seeded 124000-001 so the tier-3 lookup returns nothing
    seeded_fallback_result = await db_session.execute(
        select(GLAccount).where(
            GLAccount.organizationId == _ORG,
            GLAccount.accountNumber == "124000-001",
        )
    )
    seeded_fallback = seeded_fallback_result.scalar_one_or_none()
    if seeded_fallback is not None:
        seeded_fallback.isActive = False
        await db_session.flush()

    event = _make_receipt_event(
        company_code=code,
        bank_account_id=bank_acct,
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "AR control account" in detail or "arControlAccountId" in detail


# ---------------------------------------------------------------------------
# Test 8 — AR resolution uses Tier 1 (customer ext) when configured
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ar_resolution_tier1_customer_ext_used(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    When customer_finance_ext.arControlAccountId is set, the CR line uses THAT
    account (not the setup or 124000-001 fallback).
    """
    code = "CP08"
    await _seed_company(client, code)

    bank_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="110008-BANK"
    )
    tier1_ar = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124008-T1"
    )
    tier2_ar = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124008-T2"
    )
    # Setup has tier2_ar as default
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=tier2_ar)
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    # Customer ext overrides to tier1_ar
    await _seed_customer_finance_ext(db_session, _ORG, customer_id, tier1_ar)

    event = _make_receipt_event(
        company_code=code,
        customer_id=customer_id,
        bank_account_id=bank_acct,
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 200, resp.text

    result = await db_session.execute(
        select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
    )
    je = result.scalar_one_or_none()
    assert je is not None
    lines_result = await db_session.execute(
        select(JournalEntryLine).where(JournalEntryLine.jeId == je.jeId)
    )
    je_lines = lines_result.scalars().all()

    cr_lines = [l for l in je_lines if l.credit is not None]
    assert len(cr_lines) == 1
    assert cr_lines[0].accountId == tier1_ar, (
        f"Tier 1 AR should be used: expected {tier1_ar}, got {cr_lines[0].accountId}"
    )


# ---------------------------------------------------------------------------
# Test 9 — AR resolution uses Tier 3 (124000-001 fallback)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ar_resolution_tier3_fallback_used(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    No customer ext, no setup.arControlAccountId → JE CR line uses the seeded
    124000-001 account (tier 3 system fallback).
    """
    code = "CP09"
    await _seed_company(client, code)

    bank_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="110009-BANK"
    )

    # The CoA seed creates '124000-001' — look it up; don't create a duplicate.
    fallback_result = await db_session.execute(
        select(GLAccount.accountId).where(
            GLAccount.organizationId == _ORG,
            GLAccount.accountNumber == "124000-001",
        )
    )
    fallback_ar = fallback_result.scalar_one_or_none()
    assert fallback_ar is not None, (
        "Expected '124000-001' to be seeded by company creation; it is missing."
    )

    # Setup has NO arControlAccountId
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=None)
    await _seed_fiscal_period(db_session, code)

    event = _make_receipt_event(
        company_code=code,
        bank_account_id=bank_acct,
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 200, resp.text

    result = await db_session.execute(
        select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
    )
    je = result.scalar_one_or_none()
    assert je is not None
    lines_result = await db_session.execute(
        select(JournalEntryLine).where(JournalEntryLine.jeId == je.jeId)
    )
    je_lines = lines_result.scalars().all()

    cr_lines = [l for l in je_lines if l.credit is not None]
    assert len(cr_lines) == 1
    assert cr_lines[0].accountId == fallback_ar, (
        f"Tier 3 fallback should be used: expected {fallback_ar}, got {cr_lines[0].accountId}"
    )


# ---------------------------------------------------------------------------
# Test 10 — Closed fiscal period → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_closed_fiscal_period_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    No open fiscal period covering docDate → 400.
    """
    code = "CP10"
    await _seed_company(client, code)

    bank_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="110010-BANK"
    )
    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124010-AR"
    )
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=ar_acct)
    # Seed a CLOSED period only
    await _seed_fiscal_period(
        db_session, code,
        start=date(2026, 1, 1), end=date(2026, 12, 31),
        status=PeriodStatusEnum.CLOSED,
    )

    event = _make_receipt_event(
        company_code=code,
        bank_account_id=bank_acct,
        doc_date="2026-06-20",
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    assert "No open fiscal period" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Test 11 — Duplicate event_id → idempotent no-op
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_duplicate_event_id_is_idempotent(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Posting same event_id twice → second is already_processed, no duplicate JE.
    """
    code = "CP11"
    await _seed_company(client, code)

    bank_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="110011-BANK"
    )
    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124011-AR"
    )
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=ar_acct)
    await _seed_fiscal_period(db_session, code)

    fixed_event_id = str(uuid.uuid4())
    event = _make_receipt_event(
        company_code=code,
        bank_account_id=bank_acct,
        event_id=fixed_event_id,
    )

    resp1 = await _post_event(client, event)
    assert resp1.status_code == 200, resp1.text
    assert resp1.json()["status"] == "processed"

    resp2 = await _post_event(client, event)
    assert resp2.status_code == 200, resp2.text
    assert resp2.json()["status"] == "already_processed"

    # Exactly one JE
    count = await db_session.execute(
        select(func.count()).select_from(JournalEntry).where(
            JournalEntry.sourceEventId == fixed_event_id
        )
    )
    assert count.scalar() == 1, "Duplicate event must not create a second JE"


# ---------------------------------------------------------------------------
# Test 12 — Cancellation happy path → reversal JE, totals net to zero
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancellation_happy_path_reversal_nets_to_zero(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Post customer receipt → post customer_payment_cancelled → reversal JE exists.
    Original stays POSTED. Sum of all debits == sum of all credits across both JEs.
    """
    code = "CP12"
    await _seed_company(client, code)

    bank_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="110012-BANK"
    )
    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124012-AR"
    )
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=ar_acct)
    # Wide period to cover both posting date and today's reversal date
    await _seed_fiscal_period(
        db_session, code,
        start=date(2026, 1, 1), end=date(2027, 12, 31),
        status=PeriodStatusEnum.OPEN,
    )

    receipt_event = _make_receipt_event(
        company_code=code,
        bank_account_id=bank_acct,
        amount_received="2100.00",
        receipt_doc_number="IPAY-2026-CANCEL",
    )
    resp_post = await _post_event(client, receipt_event)
    assert resp_post.status_code == 200, resp_post.text

    cancel_event = _make_cancellation_event(receipt_event)
    resp_cancel = await _post_event(client, cancel_event)
    assert resp_cancel.status_code == 200, resp_cancel.text
    assert resp_cancel.json()["status"] == "processed"

    # Both JEs exist
    je_result = await db_session.execute(
        select(JournalEntry).where(
            JournalEntry.organizationId == _ORG,
            JournalEntry.companyCode == code,
        )
    )
    all_jes = je_result.scalars().all()
    assert len(all_jes) == 2, f"Expected 2 JEs (original + reversal), got {len(all_jes)}"

    original_je = next(
        j for j in all_jes if j.sourceEventType == "customer_payment_received"
    )
    reversal_je = next(
        j for j in all_jes if j.sourceEventType == "customer_payment_cancelled"
    )

    # Both remain POSTED
    assert original_je.status.value == "posted"
    assert reversal_je.status.value == "posted"

    # Reversal header amounts are swapped
    assert float(reversal_je.totalDebit) == float(original_je.totalCredit)
    assert float(reversal_je.totalCredit) == float(original_je.totalDebit)

    # sourceDocNumber of reversal points to original JE number
    assert reversal_je.sourceDocNumber == original_je.jeNumber

    # Net-to-zero across all lines
    all_lines_result = await db_session.execute(
        select(JournalEntryLine).where(
            JournalEntryLine.jeId.in_([original_je.jeId, reversal_je.jeId])
        )
    )
    all_lines = all_lines_result.scalars().all()
    total_debits = sum(float(l.debit) for l in all_lines if l.debit is not None)
    total_credits = sum(float(l.credit) for l in all_lines if l.credit is not None)
    assert total_debits == total_credits, (
        f"Original + reversal must net to zero: debits={total_debits} credits={total_credits}"
    )

    # Reversal has exactly 2 lines (mirroring the original)
    reversal_lines_result = await db_session.execute(
        select(JournalEntryLine).where(JournalEntryLine.jeId == reversal_je.jeId)
    )
    reversal_lines = reversal_lines_result.scalars().all()
    assert len(reversal_lines) == 2, (
        f"Reversal must also have 2 lines, got {len(reversal_lines)}"
    )


# ---------------------------------------------------------------------------
# Test 13 — Cancellation: original event not found → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancellation_original_not_found_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    customer_payment_cancelled with a non-existent originalEventId → 400.
    """
    code = "CP13"
    await _seed_company(client, code)

    bank_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="110013-BANK"
    )
    await _seed_posting_setup(db_session, _ORG, code)
    await _seed_fiscal_period(
        db_session, code,
        start=date(2026, 1, 1), end=date(2027, 12, 31),
    )

    # Build a fake original receipt event (never posted)
    fake_original_event_id = str(uuid.uuid4())
    fake_receipt_event = _make_receipt_event(
        company_code=code,
        bank_account_id=bank_acct,
        event_id=fake_original_event_id,
        receipt_doc_number="IPAY-GHOST-001",
    )
    cancel_event = _make_cancellation_event(fake_receipt_event)
    resp = await _post_event(client, cancel_event)
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "originalEventId" in detail or "customer_payment_received JE" in detail.lower()


# ---------------------------------------------------------------------------
# Test 14 — Duplicate cancellation → idempotent no-op (one reversal JE only)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancellation_duplicate_is_idempotent(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Post customer_payment_cancelled twice for same original → second is a no-op.
    Exactly one reversal JE in DB.
    """
    code = "CP14"
    await _seed_company(client, code)

    bank_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="110014-BANK"
    )
    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124014-AR"
    )
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=ar_acct)
    await _seed_fiscal_period(
        db_session, code,
        start=date(2026, 1, 1), end=date(2027, 12, 31),
    )

    receipt_event = _make_receipt_event(
        company_code=code,
        bank_account_id=bank_acct,
        amount_received="750.00",
    )
    resp_post = await _post_event(client, receipt_event)
    assert resp_post.status_code == 200, resp_post.text

    cancel_event_1 = _make_cancellation_event(receipt_event)
    cancel_event_2 = _make_cancellation_event(receipt_event, event_id=str(uuid.uuid4()))

    resp_c1 = await _post_event(client, cancel_event_1)
    assert resp_c1.status_code == 200, resp_c1.text

    resp_c2 = await _post_event(client, cancel_event_2)
    # Different event_id → gets recorded in outbox table but produces no new reversal JE
    assert resp_c2.status_code == 200, resp_c2.text

    # Exactly one reversal JE
    reversal_count = await db_session.execute(
        select(func.count()).select_from(JournalEntry).where(
            JournalEntry.organizationId == _ORG,
            JournalEntry.companyCode == code,
            JournalEntry.sourceEventType == "customer_payment_cancelled",
        )
    )
    assert reversal_count.scalar() == 1, (
        "Duplicate cancellation must not create a second reversal JE"
    )
