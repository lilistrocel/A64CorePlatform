"""
Tests for T-100.9b — _handle_sales_invoice_posted / _handle_sales_invoice_cancelled.

Wave 3 Phase 2 finale: revenue side of the Income Statement wired end-to-end.

Posting pattern for sales_invoice_posted:
  DR  AR Control Account        totals.gross   (resolved via 3-tier chain)
  CR  Revenue (per line)        line.lineNet   (per revenueAccountId)
  CR  Output VAT (combined)     totals.tax     (skipped if tax == 0)

AR Control account resolution (3-tier priority):
  Tier 1: customer_finance_ext.arControlAccountId (per-customer override)
  Tier 2: company_posting_setup.arControlAccountId (company default)
  Tier 3: gl_accounts lookup by accountNumber '124000-001' (system fallback)

Cancellation:
  Finds original sales_invoice_posted JE by sourceEventId == originalEventId,
  posts a reversing entry (DR/CR swapped), leaving original POSTED.
  Duplicate cancellation events are idempotent no-ops (handler-level guard).

Test cases
----------
AR Resolution chain:
 1. tier1_customer_ext_wins — customer_finance_ext.arControlAccountId used
 2. tier2_setup_wins_when_no_ext — setup.arControlAccountId used when no customer ext
 3. tier3_fallback_wins_when_tiers_1_and_2_empty — 124000-001 account number lookup
 4. all_three_fail_returns_400 — no AR account anywhere → 400 with clear error
 5. resolved_account_inactive_returns_400 — inactive resolved account → 400
 6. resolved_account_wrong_drawer_returns_400 — LIABILITIES drawer resolved → 400

Posting logic:
 7. happy_path_2_line_with_vat — 2 lines + VAT → 4 JE lines (1 DR + 2 CR Rev + 1 CR VAT)
 8. zero_vat_path — 2 lines zero-rated → 3 JE lines (1 DR + 2 CR Rev, no VAT line)
 9. missing_output_vat_account_with_nonzero_tax_returns_400
10. missing_output_vat_account_with_zero_tax_returns_200
11. revenue_account_inactive_returns_400
12. revenue_account_wrong_drawer_returns_400
13. closed_fiscal_period_returns_400
14. duplicate_event_id_is_idempotent

Cancellation:
15. cancellation_happy_path_reversal_nets_to_zero
16. cancellation_original_not_found_returns_400
17. cancellation_duplicate_is_idempotent

arControlAccountId on PostingSetup (column + guards exercised via posting):
18. ar_control_on_setup_valid_asset_account_used_as_tier2
19. ar_control_on_setup_wrong_type_via_resolution_returns_400
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
_ORG_UUID = "c0000000-0000-4000-8000-000000000099"
_ORG = _ORG_UUID
_COMPANY_CODE_BASE = "ARI"


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
        "userId": "test-user-ari",
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
            "legalName": f"AR Invoice Test Company {code} LLC",
        },
        headers={"Authorization": "Bearer " + _make_jwt()},
    )
    assert resp.status_code in (201, 409), resp.text


async def _seed_posting_setup(
    db_session: AsyncSession,
    organization_id: str,
    company_code: str,
    ar_control_account_id: Optional[str] = None,
    output_vat_account_id: Optional[str] = None,
) -> CompanyPostingSetup:
    """Insert a minimal CompanyPostingSetup row."""
    setup = CompanyPostingSetup(
        setupId=str(uuid.uuid4()),
        organizationId=organization_id,
        companyCode=company_code,
        arControlAccountId=ar_control_account_id,
        outputVatAccountId=output_vat_account_id,
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
    """Create a synthetic GL account."""
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


def _make_sales_invoice_event(
    organization_id: str = _ORG_UUID,
    company_code: str = _COMPANY_CODE_BASE,
    doc_date: str = "2026-06-15",
    tax_date: str = "2026-06-15",
    customer_id: Optional[str] = None,
    customer_name: str = "Fresh Market LLC",
    lines: Optional[List[Dict[str, Any]]] = None,
    totals: Optional[Dict[str, Any]] = None,
    event_id: Optional[str] = None,
    ar_invoice_doc_number: str = "ARI-2026-0001",
) -> Dict[str, Any]:
    """
    Return a valid sales_invoice_posted event dict.

    Defaults to a single line with net=500, tax=25, gross=525.
    """
    cid = customer_id or str(uuid.uuid4())
    if lines is None:
        rev_acct_id = str(uuid.uuid4())  # caller overrides this in most tests
        lines = [
            {
                "lineNumber": 1,
                "itemId": str(uuid.uuid4()),
                "itemCode": "ITEM-REV-001",
                "quantity": "10.000",
                "unitPrice": "50.00",
                "lineNet": "500.00",
                "taxCodeId": None,
                "taxPercent": "5.00",
                "lineTax": "25.00",
                "lineGross": "525.00",
                "revenueAccountId": rev_acct_id,
                "costCenterId": None,
                "sourceDeliveryLineRef": None,
            }
        ]
    if totals is None:
        totals = {
            "net": str(sum(Decimal(str(l["lineNet"])) for l in lines)),
            "tax": str(sum(Decimal(str(l["lineTax"])) for l in lines)),
            "gross": str(sum(Decimal(str(l["lineGross"])) for l in lines)),
            "downPaymentApplied": "0.00",
        }
    return {
        "eventId": event_id or str(uuid.uuid4()),
        "eventType": "sales_invoice_posted",
        "organizationId": organization_id,
        "companyCode": company_code,
        "occurredAt": datetime.utcnow().isoformat(),
        "sourceUserId": str(uuid.uuid4()),
        "payload": {
            "arInvoiceDocEntry": str(uuid.uuid4()),
            "arInvoiceDocNumber": ar_invoice_doc_number,
            "docDate": doc_date,
            "taxDate": tax_date,
            "dueDate": "2026-07-15",
            "customerId": cid,
            "customerName": customer_name,
            "bpRefNo": "PO-CUST-001",
            "currency": "AED",
            "exchangeRate": "1.0",
            "paymentTermsId": None,
            "baseDeliveryDocRef": None,
            "isReserveInvoice": False,
            "totals": totals,
            "lines": lines,
        },
    }


def _make_cancellation_event(
    original_event: Dict[str, Any],
    event_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build a sales_invoice_cancelled event referencing the original posted event.
    """
    orig_payload = original_event["payload"]
    return {
        "eventId": event_id or str(uuid.uuid4()),
        "eventType": "sales_invoice_cancelled",
        "organizationId": original_event["organizationId"],
        "companyCode": original_event["companyCode"],
        "occurredAt": datetime.utcnow().isoformat(),
        "sourceUserId": str(uuid.uuid4()),
        "payload": {
            **orig_payload,
            "originalEventId": original_event["eventId"],
        },
    }


# ---------------------------------------------------------------------------
# Helper: post event and assert success
# ---------------------------------------------------------------------------


async def _post_event(client: AsyncClient, event: Dict[str, Any]) -> Any:
    resp = await client.post(
        _INGEST_URL, json=event, headers={"X-Service-Secret": _VALID_SECRET}
    )
    return resp


# ---------------------------------------------------------------------------
# Test 1 — Tier 1: customer_finance_ext.arControlAccountId used
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tier1_customer_ext_ar_account_used(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    When customer_finance_ext.arControlAccountId is set,
    the JE DR line uses THAT account (not the setup or 124000-001).
    """
    code = "AR01"
    await _seed_company(client, code)

    # Create three distinct AR accounts so we can tell which was used
    tier1_ar = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124001-T1"
    )
    tier2_ar = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124002-T2"
    )
    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-T1"
    )
    output_vat = await _make_gl_account(
        db_session, _ORG, DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY,
        account_number="2200-T1"
    )

    # Setup has tier2_ar as default
    await _seed_posting_setup(
        db_session, _ORG, code,
        ar_control_account_id=tier2_ar,
        output_vat_account_id=output_vat,
    )
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    # Customer ext overrides to tier1_ar
    await _seed_customer_finance_ext(db_session, _ORG, customer_id, tier1_ar)

    lines = [{
        "lineNumber": 1, "itemId": str(uuid.uuid4()), "itemCode": "REV-ITEM",
        "quantity": "2.000", "unitPrice": "100.00",
        "lineNet": "200.00", "taxCodeId": None, "taxPercent": "5.00",
        "lineTax": "10.00", "lineGross": "210.00",
        "revenueAccountId": rev_acct, "costCenterId": None, "sourceDeliveryLineRef": None,
    }]
    totals = {"net": "200.00", "tax": "10.00", "gross": "210.00", "downPaymentApplied": "0.00"}
    event = _make_sales_invoice_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 200, resp.text

    # Verify the DR line uses tier1_ar, not tier2_ar
    result = await db_session.execute(
        select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
    )
    je = result.scalar_one_or_none()
    assert je is not None
    lines_result = await db_session.execute(
        select(JournalEntryLine).where(JournalEntryLine.jeId == je.jeId)
    )
    je_lines = lines_result.scalars().all()
    dr_lines = [l for l in je_lines if l.debit is not None]
    assert len(dr_lines) == 1
    assert dr_lines[0].accountId == tier1_ar, (
        f"Tier 1 should win: expected {tier1_ar}, got {dr_lines[0].accountId}"
    )


# ---------------------------------------------------------------------------
# Test 2 — Tier 2: setup.arControlAccountId used when no customer ext
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tier2_setup_ar_account_used_when_no_customer_ext(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    When customer_finance_ext has no arControlAccountId (or no row),
    the JE DR line uses setup.arControlAccountId (tier 2).
    """
    code = "AR02"
    await _seed_company(client, code)

    tier2_ar = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124002-AR02"
    )
    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-AR02"
    )
    output_vat = await _make_gl_account(
        db_session, _ORG, DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY,
        account_number="2200-AR02"
    )

    await _seed_posting_setup(
        db_session, _ORG, code,
        ar_control_account_id=tier2_ar,
        output_vat_account_id=output_vat,
    )
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    # No customer_finance_ext row at all

    lines = [{
        "lineNumber": 1, "itemId": str(uuid.uuid4()), "itemCode": "REV-ITEM-T2",
        "quantity": "1.000", "unitPrice": "300.00",
        "lineNet": "300.00", "taxCodeId": None, "taxPercent": "5.00",
        "lineTax": "15.00", "lineGross": "315.00",
        "revenueAccountId": rev_acct, "costCenterId": None, "sourceDeliveryLineRef": None,
    }]
    totals = {"net": "300.00", "tax": "15.00", "gross": "315.00", "downPaymentApplied": "0.00"}
    event = _make_sales_invoice_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals
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
    dr_lines = [l for l in je_lines if l.debit is not None]
    assert len(dr_lines) == 1
    assert dr_lines[0].accountId == tier2_ar, (
        f"Tier 2 should win: expected {tier2_ar}, got {dr_lines[0].accountId}"
    )


# ---------------------------------------------------------------------------
# Test 3 — Tier 3: 124000-001 fallback when tiers 1 and 2 are empty
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tier3_account_number_fallback(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    When both customer_finance_ext and setup.arControlAccountId are null,
    the JE DR line uses the account with accountNumber='124000-001'.

    The default CoA seed inserts '124000-001' on company creation — we look
    it up by account number rather than creating a duplicate.
    """
    code = "AR03"
    await _seed_company(client, code)

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

    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-AR03"
    )
    output_vat = await _make_gl_account(
        db_session, _ORG, DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY,
        account_number="2200-AR03"
    )

    # Setup has NO arControlAccountId
    await _seed_posting_setup(
        db_session, _ORG, code,
        ar_control_account_id=None,
        output_vat_account_id=output_vat,
    )
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    # No customer_finance_ext row either

    lines = [{
        "lineNumber": 1, "itemId": str(uuid.uuid4()), "itemCode": "FALLBACK-ITEM",
        "quantity": "1.000", "unitPrice": "1000.00",
        "lineNet": "1000.00", "taxCodeId": None, "taxPercent": "5.00",
        "lineTax": "50.00", "lineGross": "1050.00",
        "revenueAccountId": rev_acct, "costCenterId": None, "sourceDeliveryLineRef": None,
    }]
    totals = {"net": "1000.00", "tax": "50.00", "gross": "1050.00", "downPaymentApplied": "0.00"}
    event = _make_sales_invoice_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals
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
    dr_lines = [l for l in je_lines if l.debit is not None]
    assert len(dr_lines) == 1
    assert dr_lines[0].accountId == fallback_ar, (
        f"Tier 3 fallback should win: expected {fallback_ar}, got {dr_lines[0].accountId}"
    )


# ---------------------------------------------------------------------------
# Test 4 — All three tiers fail → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_all_ar_tiers_fail_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    No customer ext, no setup.arControlAccountId, and the seeded 124000-001
    account is deactivated → all three tiers fail → 400.

    The tier-3 fallback filters by isActive=True, so deactivating the account
    simulates the all-tiers-fail scenario without deleting it (which would
    break FK constraints).
    """
    code = "AR04"
    await _seed_company(client, code)

    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-AR04"
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

    customer_id = str(uuid.uuid4())
    lines = [{
        "lineNumber": 1, "itemId": str(uuid.uuid4()), "itemCode": "NO-AR-ITEM",
        "quantity": "1.000", "unitPrice": "100.00",
        "lineNet": "100.00", "taxCodeId": None, "taxPercent": "0.00",
        "lineTax": "0.00", "lineGross": "100.00",
        "revenueAccountId": rev_acct, "costCenterId": None, "sourceDeliveryLineRef": None,
    }]
    totals = {"net": "100.00", "tax": "0.00", "gross": "100.00", "downPaymentApplied": "0.00"}
    event = _make_sales_invoice_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "AR control account" in detail or "arControlAccountId" in detail


# ---------------------------------------------------------------------------
# Test 5 — Resolved AR account inactive → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resolved_ar_account_inactive_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    The resolved AR control account (tier 2) is inactive → 400.
    """
    code = "AR05"
    await _seed_company(client, code)

    inactive_ar = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        active=False, account_number="124005-DEAD"
    )
    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-AR05"
    )
    await _seed_posting_setup(
        db_session, _ORG, code, ar_control_account_id=inactive_ar
    )
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    lines = [{
        "lineNumber": 1, "itemId": str(uuid.uuid4()), "itemCode": "INACTIVE-AR",
        "quantity": "1.000", "unitPrice": "100.00",
        "lineNet": "100.00", "taxCodeId": None, "taxPercent": "0.00",
        "lineTax": "0.00", "lineGross": "100.00",
        "revenueAccountId": rev_acct, "costCenterId": None, "sourceDeliveryLineRef": None,
    }]
    totals = {"net": "100.00", "tax": "0.00", "gross": "100.00", "downPaymentApplied": "0.00"}
    event = _make_sales_invoice_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    assert "inactive" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Test 6 — Resolved AR account wrong drawer (LIABILITIES) → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resolved_ar_account_wrong_drawer_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    The resolved AR control account is in LIABILITIES drawer → 400.
    """
    code = "AR06"
    await _seed_company(client, code)

    wrong_ar = await _make_gl_account(
        db_session, _ORG, DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY,
        account_number="200006-WRONG"
    )
    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-AR06"
    )
    await _seed_posting_setup(
        db_session, _ORG, code, ar_control_account_id=wrong_ar
    )
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    lines = [{
        "lineNumber": 1, "itemId": str(uuid.uuid4()), "itemCode": "BAD-DRAWER",
        "quantity": "1.000", "unitPrice": "100.00",
        "lineNet": "100.00", "taxCodeId": None, "taxPercent": "0.00",
        "lineTax": "0.00", "lineGross": "100.00",
        "revenueAccountId": rev_acct, "costCenterId": None, "sourceDeliveryLineRef": None,
    }]
    totals = {"net": "100.00", "tax": "0.00", "gross": "100.00", "downPaymentApplied": "0.00"}
    event = _make_sales_invoice_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "ASSETS" in detail or "drawer" in detail.lower()


# ---------------------------------------------------------------------------
# Test 7 — Happy path 2-line invoice with VAT → 4 JE lines
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_happy_path_2_line_with_vat(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    2-line invoice with VAT → 4 JE lines:
      Line 1: DR AR        (gross=1155)
      Line 2: CR Revenue-A (net=500)
      Line 3: CR Revenue-B (net=600)
      Line 4: CR Output VAT (tax=55)
    Totals balanced: 1155 DR == 1155 CR.
    """
    code = "AR07"
    await _seed_company(client, code)

    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124007"
    )
    rev_a = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4001-AR07"
    )
    rev_b = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4002-AR07"
    )
    output_vat = await _make_gl_account(
        db_session, _ORG, DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY,
        account_number="2200-AR07"
    )

    await _seed_posting_setup(
        db_session, _ORG, code,
        ar_control_account_id=ar_acct,
        output_vat_account_id=output_vat,
    )
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    lines = [
        {
            "lineNumber": 1, "itemId": str(uuid.uuid4()), "itemCode": "PROD-A",
            "quantity": "10.000", "unitPrice": "50.00",
            "lineNet": "500.00", "taxCodeId": None, "taxPercent": "5.00",
            "lineTax": "25.00", "lineGross": "525.00",
            "revenueAccountId": rev_a, "costCenterId": None, "sourceDeliveryLineRef": None,
        },
        {
            "lineNumber": 2, "itemId": str(uuid.uuid4()), "itemCode": "PROD-B",
            "quantity": "6.000", "unitPrice": "100.00",
            "lineNet": "600.00", "taxCodeId": None, "taxPercent": "5.00",
            "lineTax": "30.00", "lineGross": "630.00",
            "revenueAccountId": rev_b, "costCenterId": None, "sourceDeliveryLineRef": None,
        },
    ]
    totals = {"net": "1100.00", "tax": "55.00", "gross": "1155.00", "downPaymentApplied": "0.00"}
    event = _make_sales_invoice_event(
        company_code=code, customer_id=customer_id,
        lines=lines, totals=totals,
        ar_invoice_doc_number="ARI-2026-0007",
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "processed"

    # Verify JE header
    result = await db_session.execute(
        select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
    )
    je = result.scalar_one_or_none()
    assert je is not None, "JournalEntry must be created"
    assert je.companyCode == code
    assert je.sourceEventType == "sales_invoice_posted"
    assert je.status.value == "posted"
    assert float(je.totalDebit) == 1155.0
    assert float(je.totalCredit) == 1155.0
    assert je.postedBy == "system"
    assert "ARI-2026-0007" in je.description
    assert "Fresh Market LLC" in je.description

    # Verify 4 JE lines
    lines_result = await db_session.execute(
        select(JournalEntryLine).where(JournalEntryLine.jeId == je.jeId)
    )
    je_lines = lines_result.scalars().all()
    assert len(je_lines) == 4, f"Expected 4 lines (1 DR + 2 CR Rev + 1 CR VAT), got {len(je_lines)}"

    dr_lines = [l for l in je_lines if l.debit is not None]
    cr_lines = [l for l in je_lines if l.credit is not None]
    assert len(dr_lines) == 1
    assert len(cr_lines) == 3

    # DR line = AR account, gross amount
    assert dr_lines[0].accountId == ar_acct
    assert float(dr_lines[0].debit) == 1155.0

    # CR lines: revenue A, revenue B, output VAT
    cr_accounts = {l.accountId for l in cr_lines}
    assert rev_a in cr_accounts
    assert rev_b in cr_accounts
    assert output_vat in cr_accounts

    # Revenue amounts
    rev_cr_lines = [l for l in cr_lines if l.accountId in (rev_a, rev_b)]
    rev_credits = sorted(float(l.credit) for l in rev_cr_lines)
    assert rev_credits == [500.0, 600.0]

    # VAT line amount
    vat_cr_lines = [l for l in cr_lines if l.accountId == output_vat]
    assert len(vat_cr_lines) == 1
    assert float(vat_cr_lines[0].credit) == 55.0
    assert "Output VAT" in vat_cr_lines[0].description

    # Total DR == Total CR
    assert sum(float(l.debit) for l in dr_lines) == sum(float(l.credit) for l in cr_lines)


# ---------------------------------------------------------------------------
# Test 8 — Zero VAT path → 3 JE lines (no Output VAT line)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_zero_vat_no_output_vat_line(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    2-line invoice all zero-rated → 3 JE lines (1 DR + 2 CR Rev, no Output VAT).
    outputVatAccountId null is OK because tax == 0.
    """
    code = "AR08"
    await _seed_company(client, code)

    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124008"
    )
    rev_a = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4001-AR08"
    )
    rev_b = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4002-AR08"
    )

    # No outputVatAccountId configured — that's fine for zero-VAT
    await _seed_posting_setup(
        db_session, _ORG, code,
        ar_control_account_id=ar_acct,
        output_vat_account_id=None,
    )
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    lines = [
        {
            "lineNumber": 1, "itemId": str(uuid.uuid4()), "itemCode": "ZERO-A",
            "quantity": "5.000", "unitPrice": "200.00",
            "lineNet": "1000.00", "taxCodeId": None, "taxPercent": "0.00",
            "lineTax": "0.00", "lineGross": "1000.00",
            "revenueAccountId": rev_a, "costCenterId": None, "sourceDeliveryLineRef": None,
        },
        {
            "lineNumber": 2, "itemId": str(uuid.uuid4()), "itemCode": "ZERO-B",
            "quantity": "2.000", "unitPrice": "250.00",
            "lineNet": "500.00", "taxCodeId": None, "taxPercent": "0.00",
            "lineTax": "0.00", "lineGross": "500.00",
            "revenueAccountId": rev_b, "costCenterId": None, "sourceDeliveryLineRef": None,
        },
    ]
    totals = {"net": "1500.00", "tax": "0.00", "gross": "1500.00", "downPaymentApplied": "0.00"}
    event = _make_sales_invoice_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals
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
    assert len(je_lines) == 3, f"Expected 3 lines (1 DR + 2 CR Rev), got {len(je_lines)}"

    dr_lines = [l for l in je_lines if l.debit is not None]
    cr_lines = [l for l in je_lines if l.credit is not None]
    assert len(dr_lines) == 1
    assert len(cr_lines) == 2
    assert float(dr_lines[0].debit) == 1500.0
    cr_amounts = sorted(float(l.credit) for l in cr_lines)
    assert cr_amounts == [500.0, 1000.0]


# ---------------------------------------------------------------------------
# Test 9 — Missing outputVatAccountId with non-zero tax → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_missing_output_vat_account_with_nonzero_tax_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Invoice has non-zero tax but setup.outputVatAccountId is null → 400.
    """
    code = "AR09"
    await _seed_company(client, code)

    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124009"
    )
    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-AR09"
    )
    # NO output VAT account
    await _seed_posting_setup(
        db_session, _ORG, code, ar_control_account_id=ar_acct, output_vat_account_id=None
    )
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    lines = [{
        "lineNumber": 1, "itemId": str(uuid.uuid4()), "itemCode": "VAT-ITEM",
        "quantity": "1.000", "unitPrice": "500.00",
        "lineNet": "500.00", "taxCodeId": None, "taxPercent": "5.00",
        "lineTax": "25.00", "lineGross": "525.00",
        "revenueAccountId": rev_acct, "costCenterId": None, "sourceDeliveryLineRef": None,
    }]
    totals = {"net": "500.00", "tax": "25.00", "gross": "525.00", "downPaymentApplied": "0.00"}
    event = _make_sales_invoice_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "outputVatAccountId" in detail or "Output VAT" in detail


# ---------------------------------------------------------------------------
# Test 10 — Missing outputVatAccountId with zero tax → 200 (no VAT needed)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_missing_output_vat_account_with_zero_tax_returns_200(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Invoice has zero tax and setup.outputVatAccountId is null → 200 (no VAT line needed).
    """
    code = "AR10"
    await _seed_company(client, code)

    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124010"
    )
    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-AR10"
    )
    await _seed_posting_setup(
        db_session, _ORG, code, ar_control_account_id=ar_acct, output_vat_account_id=None
    )
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    lines = [{
        "lineNumber": 1, "itemId": str(uuid.uuid4()), "itemCode": "ZERO-VAT",
        "quantity": "1.000", "unitPrice": "200.00",
        "lineNet": "200.00", "taxCodeId": None, "taxPercent": "0.00",
        "lineTax": "0.00", "lineGross": "200.00",
        "revenueAccountId": rev_acct, "costCenterId": None, "sourceDeliveryLineRef": None,
    }]
    totals = {"net": "200.00", "tax": "0.00", "gross": "200.00", "downPaymentApplied": "0.00"}
    event = _make_sales_invoice_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 200, resp.text


# ---------------------------------------------------------------------------
# Test 11 — Revenue account inactive → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_revenue_account_inactive_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    revenueAccountId on a line points to an inactive account → 400.
    """
    code = "AR11"
    await _seed_company(client, code)

    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124011"
    )
    inactive_rev = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        active=False, account_number="4000-AR11-DEAD"
    )
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=ar_acct)
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    lines = [{
        "lineNumber": 1, "itemId": str(uuid.uuid4()), "itemCode": "DEAD-REV",
        "quantity": "1.000", "unitPrice": "100.00",
        "lineNet": "100.00", "taxCodeId": None, "taxPercent": "0.00",
        "lineTax": "0.00", "lineGross": "100.00",
        "revenueAccountId": inactive_rev, "costCenterId": None, "sourceDeliveryLineRef": None,
    }]
    totals = {"net": "100.00", "tax": "0.00", "gross": "100.00", "downPaymentApplied": "0.00"}
    event = _make_sales_invoice_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    assert "inactive" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Test 12 — Revenue account wrong drawer → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_revenue_account_wrong_drawer_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    revenueAccountId has drawer=ASSETS (not REVENUE) → 400.
    """
    code = "AR12"
    await _seed_company(client, code)

    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124012"
    )
    wrong_drawer_rev = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="1200-WRONG-AR12"
    )
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=ar_acct)
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    lines = [{
        "lineNumber": 1, "itemId": str(uuid.uuid4()), "itemCode": "WRONG-DRAWER",
        "quantity": "1.000", "unitPrice": "100.00",
        "lineNet": "100.00", "taxCodeId": None, "taxPercent": "0.00",
        "lineTax": "0.00", "lineGross": "100.00",
        "revenueAccountId": wrong_drawer_rev, "costCenterId": None, "sourceDeliveryLineRef": None,
    }]
    totals = {"net": "100.00", "tax": "0.00", "gross": "100.00", "downPaymentApplied": "0.00"}
    event = _make_sales_invoice_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "REVENUE" in detail or "drawer" in detail.lower()


# ---------------------------------------------------------------------------
# Test 13 — Closed fiscal period → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_closed_fiscal_period_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    No open fiscal period covering docDate → 400.
    """
    code = "AR13"
    await _seed_company(client, code)

    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124013"
    )
    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-AR13"
    )
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=ar_acct)
    # Seed a CLOSED period only
    await _seed_fiscal_period(
        db_session, code,
        start=date(2026, 1, 1), end=date(2026, 12, 31),
        status=PeriodStatusEnum.CLOSED,
    )

    customer_id = str(uuid.uuid4())
    lines = [{
        "lineNumber": 1, "itemId": str(uuid.uuid4()), "itemCode": "PERIOD-ITEM",
        "quantity": "1.000", "unitPrice": "100.00",
        "lineNet": "100.00", "taxCodeId": None, "taxPercent": "0.00",
        "lineTax": "0.00", "lineGross": "100.00",
        "revenueAccountId": rev_acct, "costCenterId": None, "sourceDeliveryLineRef": None,
    }]
    totals = {"net": "100.00", "tax": "0.00", "gross": "100.00", "downPaymentApplied": "0.00"}
    event = _make_sales_invoice_event(
        company_code=code, customer_id=customer_id,
        lines=lines, totals=totals, doc_date="2026-06-15"
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    assert "No open fiscal period" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Test 14 — Duplicate event_id → idempotent no-op
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_duplicate_event_id_is_idempotent(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Posting same event_id twice → second is already_processed, no duplicate JE.
    """
    code = "AR14"
    await _seed_company(client, code)

    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124014"
    )
    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-AR14"
    )
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=ar_acct)
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    fixed_event_id = str(uuid.uuid4())
    lines = [{
        "lineNumber": 1, "itemId": str(uuid.uuid4()), "itemCode": "IDEM-ITEM",
        "quantity": "1.000", "unitPrice": "500.00",
        "lineNet": "500.00", "taxCodeId": None, "taxPercent": "0.00",
        "lineTax": "0.00", "lineGross": "500.00",
        "revenueAccountId": rev_acct, "costCenterId": None, "sourceDeliveryLineRef": None,
    }]
    totals = {"net": "500.00", "tax": "0.00", "gross": "500.00", "downPaymentApplied": "0.00"}
    event = _make_sales_invoice_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals,
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
# Test 15 — Cancellation happy path: post + cancel → reversal nets to zero
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancellation_happy_path_reversal_nets_to_zero(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Post AR invoice → post sales_invoice_cancelled → reversal JE exists,
    original stays POSTED, totals net to zero across both JEs.
    """
    code = "AR15"
    await _seed_company(client, code)

    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124015"
    )
    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-AR15"
    )
    output_vat = await _make_gl_account(
        db_session, _ORG, DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY,
        account_number="2200-AR15"
    )
    await _seed_posting_setup(
        db_session, _ORG, code,
        ar_control_account_id=ar_acct,
        output_vat_account_id=output_vat,
    )
    # Use a wide period to cover both posting and today's reversal date
    await _seed_fiscal_period(
        db_session, code,
        start=date(2026, 1, 1), end=date(2027, 12, 31),
        status=PeriodStatusEnum.OPEN,
    )

    customer_id = str(uuid.uuid4())
    lines = [{
        "lineNumber": 1, "itemId": str(uuid.uuid4()), "itemCode": "CANCEL-REV",
        "quantity": "3.000", "unitPrice": "200.00",
        "lineNet": "600.00", "taxCodeId": None, "taxPercent": "5.00",
        "lineTax": "30.00", "lineGross": "630.00",
        "revenueAccountId": rev_acct, "costCenterId": None, "sourceDeliveryLineRef": None,
    }]
    totals = {"net": "600.00", "tax": "30.00", "gross": "630.00", "downPaymentApplied": "0.00"}
    invoice_event = _make_sales_invoice_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals,
        ar_invoice_doc_number="ARI-2026-CANCEL",
    )
    resp_post = await _post_event(client, invoice_event)
    assert resp_post.status_code == 200, resp_post.text

    cancel_event = _make_cancellation_event(invoice_event)
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

    original_je = next(j for j in all_jes if j.sourceEventType == "sales_invoice_posted")
    reversal_je = next(j for j in all_jes if j.sourceEventType == "sales_invoice_cancelled")

    # Original remains POSTED
    assert original_je.status.value == "posted"
    assert reversal_je.status.value == "posted"

    # Reversal header amounts are swapped
    assert float(reversal_je.totalDebit) == float(original_je.totalCredit)
    assert float(reversal_je.totalCredit) == float(original_je.totalDebit)

    # sourceDocNumber of reversal points to original JE number
    assert reversal_je.sourceDocNumber == original_je.jeNumber

    # Sum of all debits across both JEs == sum of all credits
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


# ---------------------------------------------------------------------------
# Test 16 — Cancellation: original event not found → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancellation_original_not_found_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    sales_invoice_cancelled with a non-existent originalEventId → 400.
    """
    code = "AR16"
    await _seed_company(client, code)
    await _seed_posting_setup(db_session, _ORG, code)
    await _seed_fiscal_period(
        db_session, code,
        start=date(2026, 1, 1), end=date(2027, 12, 31),
    )

    # Build a fake original invoice event (never posted)
    fake_original_event_id = str(uuid.uuid4())
    fake_invoice_event = {
        "eventId": fake_original_event_id,
        "organizationId": _ORG_UUID,
        "companyCode": code,
        "payload": {
            "arInvoiceDocEntry": str(uuid.uuid4()),
            "arInvoiceDocNumber": "ARI-GHOST-001",
            "docDate": "2026-06-15",
            "taxDate": "2026-06-15",
            "dueDate": "2026-07-15",
            "customerId": str(uuid.uuid4()),
            "customerName": "Ghost Customer",
            "bpRefNo": None,
            "currency": "AED",
            "exchangeRate": "1.0",
            "paymentTermsId": None,
            "baseDeliveryDocRef": None,
            "isReserveInvoice": False,
            "totals": {"net": "100.00", "tax": "0.00", "gross": "100.00", "downPaymentApplied": "0.00"},
            "lines": [],
            "originalEventId": fake_original_event_id,
        },
    }
    cancel_event = _make_cancellation_event(fake_invoice_event)
    resp = await _post_event(client, cancel_event)
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "originalEventId" in detail or "sales_invoice_posted JE" in detail.lower()


# ---------------------------------------------------------------------------
# Test 17 — Duplicate cancellation → idempotent no-op (one reversal JE only)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancellation_duplicate_is_idempotent(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Post sales_invoice_cancelled twice for the same original → second is a no-op,
    exactly one reversal JE in the DB.
    """
    code = "AR17"
    await _seed_company(client, code)

    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124017"
    )
    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-AR17"
    )
    await _seed_posting_setup(
        db_session, _ORG, code, ar_control_account_id=ar_acct
    )
    await _seed_fiscal_period(
        db_session, code,
        start=date(2026, 1, 1), end=date(2027, 12, 31),
    )

    customer_id = str(uuid.uuid4())
    lines = [{
        "lineNumber": 1, "itemId": str(uuid.uuid4()), "itemCode": "IDEM-CANCEL",
        "quantity": "1.000", "unitPrice": "250.00",
        "lineNet": "250.00", "taxCodeId": None, "taxPercent": "0.00",
        "lineTax": "0.00", "lineGross": "250.00",
        "revenueAccountId": rev_acct, "costCenterId": None, "sourceDeliveryLineRef": None,
    }]
    totals = {"net": "250.00", "tax": "0.00", "gross": "250.00", "downPaymentApplied": "0.00"}
    invoice_event = _make_sales_invoice_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals
    )
    resp_post = await _post_event(client, invoice_event)
    assert resp_post.status_code == 200, resp_post.text

    cancel_event_1 = _make_cancellation_event(invoice_event)
    cancel_event_2 = _make_cancellation_event(invoice_event, event_id=str(uuid.uuid4()))

    resp_c1 = await _post_event(client, cancel_event_1)
    assert resp_c1.status_code == 200, resp_c1.text

    resp_c2 = await _post_event(client, cancel_event_2)
    # Second cancellation with a different event_id is recorded in outbox table
    # (processed) but creates no new reversal JE (handler-level idempotency guard).
    assert resp_c2.status_code == 200, resp_c2.text

    # Exactly one reversal JE
    reversal_count = await db_session.execute(
        select(func.count()).select_from(JournalEntry).where(
            JournalEntry.organizationId == _ORG,
            JournalEntry.companyCode == code,
            JournalEntry.sourceEventType == "sales_invoice_cancelled",
        )
    )
    assert reversal_count.scalar() == 1, "Duplicate cancellation must not create a second reversal"


# ---------------------------------------------------------------------------
# Test 18 — arControlAccountId on PostingSetup: valid asset account used as tier 2
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ar_control_on_setup_valid_asset_used(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    setup.arControlAccountId set to a valid ASSETS/asset account →
    posting succeeds and uses that account (tier 2).
    """
    code = "AR18"
    await _seed_company(client, code)

    setup_ar = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124018"
    )
    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-AR18"
    )
    await _seed_posting_setup(
        db_session, _ORG, code, ar_control_account_id=setup_ar
    )
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    lines = [{
        "lineNumber": 1, "itemId": str(uuid.uuid4()), "itemCode": "AR18-ITEM",
        "quantity": "1.000", "unitPrice": "400.00",
        "lineNet": "400.00", "taxCodeId": None, "taxPercent": "0.00",
        "lineTax": "0.00", "lineGross": "400.00",
        "revenueAccountId": rev_acct, "costCenterId": None, "sourceDeliveryLineRef": None,
    }]
    totals = {"net": "400.00", "tax": "0.00", "gross": "400.00", "downPaymentApplied": "0.00"}
    event = _make_sales_invoice_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals
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
    dr_lines = [l for l in je_lines if l.debit is not None]
    assert dr_lines[0].accountId == setup_ar


# ---------------------------------------------------------------------------
# Test 19 — arControlAccountId wrong type → resolved account fails validation → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ar_control_wrong_type_on_resolution_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    setup.arControlAccountId set to a REVENUE account (wrong type) →
    resolution validates it and returns 400 (wrong drawer).
    """
    code = "AR19"
    await _seed_company(client, code)

    wrong_type_ar = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-WRONG-AR19"
    )
    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4001-AR19"
    )
    # Setup points arControlAccountId at a revenue account (misconfiguration)
    await _seed_posting_setup(
        db_session, _ORG, code, ar_control_account_id=wrong_type_ar
    )
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    lines = [{
        "lineNumber": 1, "itemId": str(uuid.uuid4()), "itemCode": "WRONG-TYPE",
        "quantity": "1.000", "unitPrice": "100.00",
        "lineNet": "100.00", "taxCodeId": None, "taxPercent": "0.00",
        "lineTax": "0.00", "lineGross": "100.00",
        "revenueAccountId": rev_acct, "costCenterId": None, "sourceDeliveryLineRef": None,
    }]
    totals = {"net": "100.00", "tax": "0.00", "gross": "100.00", "downPaymentApplied": "0.00"}
    event = _make_sales_invoice_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "ASSETS" in detail or "drawer" in detail.lower()
