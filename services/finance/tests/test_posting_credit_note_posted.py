"""
Tests for T-100.11 — _handle_credit_note_posted / _handle_credit_note_cancelled.

Wave 3 Phase 2 finale: revenue reversal when an AR Credit Note is posted.

Posting pattern for credit_note_posted:
  DR  Revenue (per line)           line.lineNet   per line.revenueAccountId
  DR  Output VAT (combined)        totals.tax     from setup.outputVatAccountId
                                                  (skipped if tax == 0)
  CR  AR Control Account           totals.gross   (resolved via 3-tier chain)

This is the symmetric reversal of sales_invoice_posted:
  sales_invoice_posted: DR AR / CR Revenue / CR Output VAT
  credit_note_posted:   DR Revenue / DR Output VAT / CR AR

AR Control account resolution (3-tier priority):
  Tier 1: customer_finance_ext.arControlAccountId (per-customer override)
  Tier 2: company_posting_setup.arControlAccountId (company default)
  Tier 3: gl_accounts lookup by accountNumber '124000-001' (system fallback)

Balance:
  DR = total_net (sum of lineNet) + total_tax = total_gross = CR

Cancellation:
  Finds original credit_note_posted JE by sourceEventId == originalEventId,
  posts a reversing entry (DR/CR swapped), leaving original POSTED.
  Duplicate cancellation events are idempotent no-ops (handler-level guard).

Test cases
----------
AR Resolution chain (reusing same chain as sales_invoice_posted):
 1. tier1_customer_ext_wins — customer_finance_ext.arControlAccountId used.
 2. tier2_setup_wins_when_no_customer_ext — setup.arControlAccountId used.
 3. all_ar_tiers_fail_returns_400 — no valid AR account anywhere → 400.

Posting logic:
 4. happy_path_2_line_with_vat — 2 lines + VAT → 4 JE lines (2 DR Rev + 1 DR VAT + 1 CR AR).
 5. zero_vat_path — 2 lines zero-rated → 3 JE lines (2 DR Rev + 1 CR AR, no VAT line).
 6. missing_output_vat_account_with_nonzero_tax_returns_400.
 7. missing_output_vat_account_with_zero_tax_returns_200.
 8. revenue_account_inactive_returns_400.
 9. revenue_account_wrong_drawer_returns_400.
10. closed_fiscal_period_returns_400.
11. duplicate_event_id_is_idempotent.

Cancellation:
12. cancellation_happy_path_reversal_nets_to_zero.
13. cancellation_original_not_found_returns_400.
14. cancellation_duplicate_is_idempotent.

Balance:
15. je_balance_verified_total_net_plus_tax_equals_gross.
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
)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_INGEST_URL = "/api/v1/finance/events/ingest"
_VALID_SECRET = "test-ingest-secret"
_ORG_UUID = "f2000000-0000-4000-8000-000000000002"
_ORG = _ORG_UUID
_COMPANY_CODE_BASE = "ARC"


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
        "userId": "test-user-arc",
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
            "legalName": f"Credit Note Test Company {code} LLC",
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
    """Insert a CompanyPostingSetup row with configurable fields."""
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
        isHeader=False,
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


# ---------------------------------------------------------------------------
# Event factory helpers
# ---------------------------------------------------------------------------


def _make_credit_note_line(
    line_number: int,
    revenue_account_id: str,
    item_code: str = "ITEM-ARC",
    credited_qty: str = "5.000",
    unit_price: str = "100.00",
    line_net: str = "500.00",
    tax_percent: str = "5.00",
    line_tax: str = "25.00",
    line_gross: str = "525.00",
    cost_center_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Build a single CreditNotePostedLine dict."""
    return {
        "lineNumber": line_number,
        "itemId": str(uuid.uuid4()),
        "itemCode": item_code,
        "creditedQty": credited_qty,
        "unitPrice": unit_price,
        "lineNet": line_net,
        "taxCodeId": None,
        "taxPercent": tax_percent,
        "lineTax": line_tax,
        "lineGross": line_gross,
        "revenueAccountId": revenue_account_id,
        "costCenterId": cost_center_id,
    }


def _make_credit_note_event(
    organization_id: str = _ORG_UUID,
    company_code: str = _COMPANY_CODE_BASE,
    doc_date: str = "2026-06-15",
    tax_date: str = "2026-06-15",
    customer_id: Optional[str] = None,
    customer_name: str = "Fresh Market LLC",
    lines: Optional[List[Dict[str, Any]]] = None,
    totals: Optional[Dict[str, Any]] = None,
    event_id: Optional[str] = None,
    arc_doc_number: str = "ARC-2026-0001",
    credit_reason: str = "DEFECTIVE_GOODS",
) -> Dict[str, Any]:
    """
    Return a valid credit_note_posted event dict.

    Defaults to a single line with net=500, tax=25, gross=525.
    """
    cid = customer_id or str(uuid.uuid4())
    if lines is None:
        rev_acct_id = str(uuid.uuid4())  # caller overrides in most tests
        lines = [
            _make_credit_note_line(
                line_number=1,
                revenue_account_id=rev_acct_id,
            )
        ]
    if totals is None:
        totals = {
            "net": str(sum(Decimal(str(l["lineNet"])) for l in lines)),
            "tax": str(sum(Decimal(str(l["lineTax"])) for l in lines)),
            "gross": str(sum(Decimal(str(l["lineGross"])) for l in lines)),
        }
    return {
        "eventId": event_id or str(uuid.uuid4()),
        "eventType": "credit_note_posted",
        "organizationId": organization_id,
        "companyCode": company_code,
        "occurredAt": datetime.utcnow().isoformat(),
        "sourceUserId": str(uuid.uuid4()),
        "payload": {
            "arcDocEntry": str(uuid.uuid4()),
            "arcDocNumber": arc_doc_number,
            "docDate": doc_date,
            "taxDate": tax_date,
            "customerId": cid,
            "customerName": customer_name,
            "bpRefNo": "PO-CUST-ARC-001",
            "currency": "AED",
            "exchangeRate": "1.0",
            "creditReason": credit_reason,
            "baseReturnDocEntry": "",
            "baseReturnDocNumber": "",
            "totals": totals,
            "lines": lines,
            "allocations": [
                {
                    "allocationLineNumber": 1,
                    "arInvoiceDocEntry": str(uuid.uuid4()),
                    "arInvoiceDocNumber": "ARI-2026-0001",
                    "amountApplied": totals["gross"],
                }
            ],
        },
    }


def _make_cancellation_event(
    original_event: Dict[str, Any],
    event_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Build a credit_note_cancelled event referencing the original posted event."""
    orig_payload = original_event["payload"]
    return {
        "eventId": event_id or str(uuid.uuid4()),
        "eventType": "credit_note_cancelled",
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
    """POST an event to the ingest endpoint."""
    return await client.post(
        _INGEST_URL, json=event, headers={"X-Service-Secret": _VALID_SECRET}
    )


# ---------------------------------------------------------------------------
# Test 1 — Tier 1: customer_finance_ext.arControlAccountId used as CR account
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tier1_customer_ext_ar_account_used(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    When customer_finance_ext.arControlAccountId is set,
    the JE CR line uses THAT account (not setup or 124000-001).
    """
    code = "AC01"
    await _seed_company(client, code)

    tier1_ar = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124001-AC01"
    )
    tier2_ar = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124002-AC01"
    )
    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-AC01"
    )
    output_vat = await _make_gl_account(
        db_session, _ORG, DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY,
        account_number="2200-AC01"
    )

    # Setup has tier2_ar; customer ext overrides to tier1_ar
    await _seed_posting_setup(
        db_session, _ORG, code,
        ar_control_account_id=tier2_ar,
        output_vat_account_id=output_vat,
    )
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    await _seed_customer_finance_ext(db_session, _ORG, customer_id, tier1_ar)

    lines = [
        _make_credit_note_line(1, rev_acct, "PROD-A", "2.000", "100.00", "200.00", "5.00", "10.00", "210.00")
    ]
    totals = {"net": "200.00", "tax": "10.00", "gross": "210.00"}
    event = _make_credit_note_event(
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
    cr_lines = [l for l in je_lines if l.credit is not None]
    # The single CR line must go to tier1_ar (customer ext override)
    assert len(cr_lines) == 1
    assert cr_lines[0].accountId == tier1_ar, (
        f"Tier 1 should win: expected {tier1_ar}, got {cr_lines[0].accountId}"
    )


# ---------------------------------------------------------------------------
# Test 2 — Tier 2: setup.arControlAccountId used when no customer ext
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tier2_setup_ar_account_used_when_no_customer_ext(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    When no customer_finance_ext exists, setup.arControlAccountId (tier 2) is used.
    """
    code = "AC02"
    await _seed_company(client, code)

    tier2_ar = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124002-AC02"
    )
    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-AC02"
    )
    await _seed_posting_setup(
        db_session, _ORG, code, ar_control_account_id=tier2_ar
    )
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    # No customer_finance_ext row

    lines = [
        _make_credit_note_line(1, rev_acct, "PROD-B", "1.000", "300.00", "300.00", "0.00", "0.00", "300.00")
    ]
    totals = {"net": "300.00", "tax": "0.00", "gross": "300.00"}
    event = _make_credit_note_event(
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
    cr_lines = [l for l in je_lines if l.credit is not None]
    assert len(cr_lines) == 1
    assert cr_lines[0].accountId == tier2_ar, (
        f"Tier 2 should win: expected {tier2_ar}, got {cr_lines[0].accountId}"
    )


# ---------------------------------------------------------------------------
# Test 3 — All AR tiers fail → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_all_ar_tiers_fail_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    No customer ext, no setup.arControlAccountId, and 124000-001 deactivated → 400.
    """
    code = "AC03"
    await _seed_company(client, code)

    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-AC03"
    )
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=None)
    await _seed_fiscal_period(db_session, code)

    # Deactivate the seeded 124000-001 so tier-3 lookup returns nothing
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
    lines = [
        _make_credit_note_line(1, rev_acct, "PROD-C", "1.000", "100.00", "100.00", "0.00", "0.00", "100.00")
    ]
    totals = {"net": "100.00", "tax": "0.00", "gross": "100.00"}
    event = _make_credit_note_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "AR control account" in detail or "arControlAccountId" in detail


# ---------------------------------------------------------------------------
# Test 4 — Happy path: 2-line credit note with VAT → 4 JE lines
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_happy_path_2_line_with_vat(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    2-line credit note with VAT → 4 JE lines:
      Line 1: DR Revenue-A    (net=500)
      Line 2: DR Revenue-B    (net=600)
      Line 3: DR Output VAT   (tax=55)
      Line 4: CR AR           (gross=1155)
    Totals balanced: 1155 DR == 1155 CR.
    JE description contains ARC doc number and customer name.
    """
    code = "AC04"
    await _seed_company(client, code)

    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124004"
    )
    rev_a = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4001-AC04"
    )
    rev_b = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4002-AC04"
    )
    output_vat = await _make_gl_account(
        db_session, _ORG, DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY,
        account_number="2200-AC04"
    )

    await _seed_posting_setup(
        db_session, _ORG, code,
        ar_control_account_id=ar_acct,
        output_vat_account_id=output_vat,
    )
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    lines = [
        _make_credit_note_line(1, rev_a, "PROD-A04", "10.000", "50.00", "500.00", "5.00", "25.00", "525.00"),
        _make_credit_note_line(2, rev_b, "PROD-B04", "6.000", "100.00", "600.00", "5.00", "30.00", "630.00"),
    ]
    totals = {"net": "1100.00", "tax": "55.00", "gross": "1155.00"}
    event = _make_credit_note_event(
        company_code=code, customer_id=customer_id,
        lines=lines, totals=totals,
        arc_doc_number="ARC-2026-0004",
        customer_name="Fresh Market LLC",
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
    assert je.sourceEventType == "credit_note_posted"
    assert je.status.value == "posted"
    assert float(je.totalDebit) == 1155.0
    assert float(je.totalCredit) == 1155.0
    assert je.postedBy == "system"
    assert "ARC-2026-0004" in je.description
    assert "Fresh Market LLC" in je.description

    # Verify 4 JE lines (2 DR Rev + 1 DR VAT + 1 CR AR)
    lines_result = await db_session.execute(
        select(JournalEntryLine).where(JournalEntryLine.jeId == je.jeId)
    )
    je_lines = lines_result.scalars().all()
    assert len(je_lines) == 4, f"Expected 4 lines (2 DR Rev + 1 DR VAT + 1 CR AR), got {len(je_lines)}"

    dr_lines = [l for l in je_lines if l.debit is not None]
    cr_lines = [l for l in je_lines if l.credit is not None]
    assert len(dr_lines) == 3
    assert len(cr_lines) == 1

    # CR line = AR account, gross amount
    assert cr_lines[0].accountId == ar_acct
    assert float(cr_lines[0].credit) == 1155.0

    # DR lines: Revenue-A, Revenue-B, Output VAT
    dr_accounts = {l.accountId for l in dr_lines}
    assert rev_a in dr_accounts
    assert rev_b in dr_accounts
    assert output_vat in dr_accounts

    # Revenue reversal amounts
    rev_dr_lines = [l for l in dr_lines if l.accountId in (rev_a, rev_b)]
    rev_dr_amounts = sorted(float(l.debit) for l in rev_dr_lines)
    assert rev_dr_amounts == [500.0, 600.0]

    # VAT reversal amount
    vat_dr_lines = [l for l in dr_lines if l.accountId == output_vat]
    assert len(vat_dr_lines) == 1
    assert float(vat_dr_lines[0].debit) == 55.0
    assert "Output VAT" in vat_dr_lines[0].description

    # Total DR == Total CR
    assert sum(float(l.debit) for l in dr_lines) == sum(float(l.credit) for l in cr_lines)


# ---------------------------------------------------------------------------
# Test 5 — Zero VAT path: 2-line credit note → 3 JE lines (no Output VAT line)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_zero_vat_no_output_vat_line(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    2-line zero-rated credit note → 3 JE lines (2 DR Rev + 1 CR AR).
    outputVatAccountId null is OK because tax == 0.
    """
    code = "AC05"
    await _seed_company(client, code)

    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124005"
    )
    rev_a = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4001-AC05"
    )
    rev_b = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4002-AC05"
    )

    # No outputVatAccountId — fine for zero-VAT credit notes
    await _seed_posting_setup(
        db_session, _ORG, code,
        ar_control_account_id=ar_acct,
        output_vat_account_id=None,
    )
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    lines = [
        _make_credit_note_line(1, rev_a, "ZERO-A", "5.000", "200.00", "1000.00", "0.00", "0.00", "1000.00"),
        _make_credit_note_line(2, rev_b, "ZERO-B", "2.000", "250.00", "500.00", "0.00", "0.00", "500.00"),
    ]
    totals = {"net": "1500.00", "tax": "0.00", "gross": "1500.00"}
    event = _make_credit_note_event(
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
    assert len(je_lines) == 3, f"Expected 3 lines (2 DR Rev + 1 CR AR), got {len(je_lines)}"

    dr_lines = [l for l in je_lines if l.debit is not None]
    cr_lines = [l for l in je_lines if l.credit is not None]
    assert len(dr_lines) == 2
    assert len(cr_lines) == 1
    assert float(cr_lines[0].credit) == 1500.0
    dr_amounts = sorted(float(l.debit) for l in dr_lines)
    assert dr_amounts == [500.0, 1000.0]


# ---------------------------------------------------------------------------
# Test 6 — Missing outputVatAccountId with non-zero tax → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_missing_output_vat_account_with_nonzero_tax_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Credit note carries non-zero tax but setup.outputVatAccountId is null → 400.
    """
    code = "AC06"
    await _seed_company(client, code)

    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124006"
    )
    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-AC06"
    )
    # No Output VAT account configured
    await _seed_posting_setup(
        db_session, _ORG, code, ar_control_account_id=ar_acct, output_vat_account_id=None
    )
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    lines = [
        _make_credit_note_line(1, rev_acct, "VAT-ITEM", "1.000", "500.00", "500.00", "5.00", "25.00", "525.00")
    ]
    totals = {"net": "500.00", "tax": "25.00", "gross": "525.00"}
    event = _make_credit_note_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "outputVatAccountId" in detail or "Output VAT" in detail


# ---------------------------------------------------------------------------
# Test 7 — Missing outputVatAccountId with zero tax → 200 (no VAT line needed)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_missing_output_vat_account_with_zero_tax_returns_200(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Credit note has zero tax and setup.outputVatAccountId is null → 200.
    No Output VAT JE line is written.
    """
    code = "AC07"
    await _seed_company(client, code)

    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124007-ARC"
    )
    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-AC07"
    )
    await _seed_posting_setup(
        db_session, _ORG, code, ar_control_account_id=ar_acct, output_vat_account_id=None
    )
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    lines = [
        _make_credit_note_line(1, rev_acct, "ZERO-VAT-ARC", "1.000", "200.00", "200.00", "0.00", "0.00", "200.00")
    ]
    totals = {"net": "200.00", "tax": "0.00", "gross": "200.00"}
    event = _make_credit_note_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 200, resp.text


# ---------------------------------------------------------------------------
# Test 8 — Revenue account inactive → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_revenue_account_inactive_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    revenueAccountId on a line points to an inactive account → 400.
    """
    code = "AC08"
    await _seed_company(client, code)

    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124008-ARC"
    )
    inactive_rev = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        active=False, account_number="4000-AC08-DEAD"
    )
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=ar_acct)
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    lines = [
        _make_credit_note_line(1, inactive_rev, "DEAD-REV-ARC", "1.000", "100.00", "100.00", "0.00", "0.00", "100.00")
    ]
    totals = {"net": "100.00", "tax": "0.00", "gross": "100.00"}
    event = _make_credit_note_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    assert "inactive" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Test 9 — Revenue account wrong drawer → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_revenue_account_wrong_drawer_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    revenueAccountId has drawer=ASSETS (not REVENUE) → 400.
    """
    code = "AC09"
    await _seed_company(client, code)

    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124009-ARC"
    )
    wrong_drawer_rev = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="1200-WRONG-AC09"
    )
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=ar_acct)
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    lines = [
        _make_credit_note_line(1, wrong_drawer_rev, "WRONG-DRAWER-ARC", "1.000", "100.00", "100.00", "0.00", "0.00", "100.00")
    ]
    totals = {"net": "100.00", "tax": "0.00", "gross": "100.00"}
    event = _make_credit_note_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "REVENUE" in detail or "drawer" in detail.lower()


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
    code = "AC10"
    await _seed_company(client, code)

    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124010-ARC"
    )
    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-AC10"
    )
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=ar_acct)
    # Seed a CLOSED period only
    await _seed_fiscal_period(
        db_session, code,
        start=date(2026, 1, 1), end=date(2026, 12, 31),
        status=PeriodStatusEnum.CLOSED,
    )

    customer_id = str(uuid.uuid4())
    lines = [
        _make_credit_note_line(1, rev_acct, "PERIOD-ARC", "1.000", "100.00", "100.00", "0.00", "0.00", "100.00")
    ]
    totals = {"net": "100.00", "tax": "0.00", "gross": "100.00"}
    event = _make_credit_note_event(
        company_code=code, customer_id=customer_id,
        lines=lines, totals=totals, doc_date="2026-06-15"
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
    code = "AC11"
    await _seed_company(client, code)

    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124011-ARC"
    )
    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-AC11"
    )
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=ar_acct)
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    fixed_event_id = str(uuid.uuid4())
    lines = [
        _make_credit_note_line(1, rev_acct, "IDEM-ARC", "1.000", "500.00", "500.00", "0.00", "0.00", "500.00")
    ]
    totals = {"net": "500.00", "tax": "0.00", "gross": "500.00"}
    event = _make_credit_note_event(
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
# Test 12 — Cancellation happy path: post + cancel → reversal nets to zero
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancellation_happy_path_reversal_nets_to_zero(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Post credit note → post credit_note_cancelled → reversal JE exists,
    original stays POSTED, totals net to zero across both JEs.

    Reversal pattern:
      Original: DR Revenue / DR Output VAT / CR AR
      Reversal: CR Revenue / CR Output VAT / DR AR
    """
    code = "AC12"
    await _seed_company(client, code)

    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124012-ARC"
    )
    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-AC12"
    )
    output_vat = await _make_gl_account(
        db_session, _ORG, DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY,
        account_number="2200-AC12"
    )
    await _seed_posting_setup(
        db_session, _ORG, code,
        ar_control_account_id=ar_acct,
        output_vat_account_id=output_vat,
    )
    # Wide period covers both posting and today's reversal date
    await _seed_fiscal_period(
        db_session, code,
        start=date(2026, 1, 1), end=date(2027, 12, 31),
        status=PeriodStatusEnum.OPEN,
    )

    customer_id = str(uuid.uuid4())
    lines = [
        _make_credit_note_line(1, rev_acct, "CANCEL-ARC", "3.000", "200.00", "600.00", "5.00", "30.00", "630.00")
    ]
    totals = {"net": "600.00", "tax": "30.00", "gross": "630.00"}
    cn_event = _make_credit_note_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals,
        arc_doc_number="ARC-2026-CANCEL",
    )
    resp_post = await _post_event(client, cn_event)
    assert resp_post.status_code == 200, resp_post.text

    cancel_event = _make_cancellation_event(cn_event)
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

    original_je = next(j for j in all_jes if j.sourceEventType == "credit_note_posted")
    reversal_je = next(j for j in all_jes if j.sourceEventType == "credit_note_cancelled")

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
# Test 13 — Cancellation: original event not found → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancellation_original_not_found_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    credit_note_cancelled with a non-existent originalEventId → 400.
    """
    code = "AC13"
    await _seed_company(client, code)
    await _seed_posting_setup(db_session, _ORG, code)
    await _seed_fiscal_period(
        db_session, code,
        start=date(2026, 1, 1), end=date(2027, 12, 31),
    )

    # Build a fake CN event (never posted) to derive a cancellation from it
    fake_original_event_id = str(uuid.uuid4())
    fake_cn_event = {
        "eventId": fake_original_event_id,
        "organizationId": _ORG_UUID,
        "companyCode": code,
        "payload": {
            "arcDocEntry": str(uuid.uuid4()),
            "arcDocNumber": "ARC-GHOST-001",
            "docDate": "2026-06-15",
            "taxDate": "2026-06-15",
            "customerId": str(uuid.uuid4()),
            "customerName": "Ghost Customer",
            "bpRefNo": None,
            "currency": "AED",
            "exchangeRate": "1.0",
            "creditReason": "OTHER",
            "baseReturnDocEntry": "",
            "baseReturnDocNumber": "",
            "totals": {"net": "100.00", "tax": "0.00", "gross": "100.00"},
            "lines": [],
            "allocations": [],
        },
    }
    cancel_event = _make_cancellation_event(fake_cn_event)
    resp = await _post_event(client, cancel_event)
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "originalEventId" in detail or "credit_note_posted JE" in detail.lower()


# ---------------------------------------------------------------------------
# Test 14 — Duplicate cancellation → idempotent no-op
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancellation_duplicate_is_idempotent(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Post credit_note_cancelled twice for the same original → second is a no-op,
    exactly one reversal JE in the DB.
    """
    code = "AC14"
    await _seed_company(client, code)

    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124014-ARC"
    )
    rev_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4000-AC14"
    )
    await _seed_posting_setup(db_session, _ORG, code, ar_control_account_id=ar_acct)
    await _seed_fiscal_period(
        db_session, code,
        start=date(2026, 1, 1), end=date(2027, 12, 31),
    )

    customer_id = str(uuid.uuid4())
    lines = [
        _make_credit_note_line(1, rev_acct, "IDEM-CANCEL-ARC", "1.000", "250.00", "250.00", "0.00", "0.00", "250.00")
    ]
    totals = {"net": "250.00", "tax": "0.00", "gross": "250.00"}
    cn_event = _make_credit_note_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals
    )
    resp_post = await _post_event(client, cn_event)
    assert resp_post.status_code == 200, resp_post.text

    cancel_event_1 = _make_cancellation_event(cn_event)
    cancel_event_2 = _make_cancellation_event(cn_event, event_id=str(uuid.uuid4()))

    resp_c1 = await _post_event(client, cancel_event_1)
    assert resp_c1.status_code == 200, resp_c1.text

    resp_c2 = await _post_event(client, cancel_event_2)
    # Second cancellation has a different event_id (recorded in outbox_events_processed)
    # but the handler-level idempotency guard prevents a second reversal JE.
    assert resp_c2.status_code == 200, resp_c2.text

    # Exactly one reversal JE
    reversal_count = await db_session.execute(
        select(func.count()).select_from(JournalEntry).where(
            JournalEntry.organizationId == _ORG,
            JournalEntry.companyCode == code,
            JournalEntry.sourceEventType == "credit_note_cancelled",
        )
    )
    assert reversal_count.scalar() == 1, "Duplicate cancellation must not create a second reversal JE"


# ---------------------------------------------------------------------------
# Test 15 — JE balance: total_net + total_tax == total_gross (DR == CR)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_je_balance_net_plus_tax_equals_gross(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    For a 3-line credit note with mixed VAT rates, verify that:
      totalDebit == total_net + total_tax == total_gross == totalCredit
    The handler asserts this internally; this test verifies it via JE header values.
    """
    code = "AC15"
    await _seed_company(client, code)

    ar_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="124015-ARC"
    )
    rev_a = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4001-AC15"
    )
    rev_b = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4002-AC15"
    )
    rev_c = await _make_gl_account(
        db_session, _ORG, DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        account_number="4003-AC15"
    )
    output_vat = await _make_gl_account(
        db_session, _ORG, DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY,
        account_number="2200-AC15"
    )
    await _seed_posting_setup(
        db_session, _ORG, code,
        ar_control_account_id=ar_acct,
        output_vat_account_id=output_vat,
    )
    await _seed_fiscal_period(db_session, code)

    customer_id = str(uuid.uuid4())
    # line1: net=1000, tax=50, gross=1050
    # line2: net=600,  tax=30, gross=630
    # line3: net=400,  tax=0,  gross=400  (zero-rated)
    # totals: net=2000, tax=80, gross=2080
    lines = [
        _make_credit_note_line(1, rev_a, "P-A15", "10.000", "100.00", "1000.00", "5.00", "50.00", "1050.00"),
        _make_credit_note_line(2, rev_b, "P-B15", "6.000", "100.00", "600.00", "5.00", "30.00", "630.00"),
        _make_credit_note_line(3, rev_c, "P-C15", "4.000", "100.00", "400.00", "0.00", "0.00", "400.00"),
    ]
    totals = {"net": "2000.00", "tax": "80.00", "gross": "2080.00"}
    event = _make_credit_note_event(
        company_code=code, customer_id=customer_id, lines=lines, totals=totals
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 200, resp.text

    result = await db_session.execute(
        select(JournalEntry).where(JournalEntry.sourceEventId == event["eventId"])
    )
    je = result.scalar_one_or_none()
    assert je is not None
    # The handler posts: DR = 2000 (rev) + 80 (vat) = 2080 = CR (AR)
    assert float(je.totalDebit) == 2080.0, f"Expected totalDebit=2080, got {je.totalDebit}"
    assert float(je.totalCredit) == 2080.0, f"Expected totalCredit=2080, got {je.totalCredit}"
    assert float(je.totalDebit) == float(je.totalCredit), "JE must be balanced"

    # 5 JE lines: 3 DR Revenue + 1 DR Output VAT + 1 CR AR
    lines_result = await db_session.execute(
        select(JournalEntryLine).where(JournalEntryLine.jeId == je.jeId)
    )
    je_lines = lines_result.scalars().all()
    assert len(je_lines) == 5, f"Expected 5 lines (3 DR Rev + 1 DR VAT + 1 CR AR), got {len(je_lines)}"
