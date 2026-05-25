"""
Tests for Phase B.3 — _handle_purchase_received posting handler.

Covers:
  - Happy path: posting setup + item ext + fiscal period → JE created with
    N debit lines + 1 credit line; debits sum equals credit.
  - Posting setup missing → 400 with specific message.
  - GR/IR Clearing not configured → 400.
  - Item ext missing for one line item → 400, no JE created (rollback).
  - Item ext exists but inventoryAccountId null → 400.
  - No open fiscal period for grDate → 400.
  - Multiple lines with different inventory accounts → one DR per GR line
    (not aggregated by account — preserves per-line audit trail).
  - VAT in line is ignored — JE total matches lineNet sum, NOT lineGross sum.
  - JE number is monotonic — two consecutive GRs produce sequential numbers.

Design note for _next_je_number:
  One DR line is produced per GR event line. This preserves the per-PO-line
  audit trail (referenceLineId links back to the PO line UUID). Aggregating
  by account would collapse lines for the same item type into a single DR,
  which loses traceability. The finance reconciliation team prefers verbosity.
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
    CompanyPostingSetup,
    FiscalPeriod,
    GLAccount,
    JournalEntry,
    JournalEntryLine,
    PeriodStatusEnum,
    PurchaseItemFinanceExt,
    ValuationMethodEnum,
)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_INGEST_URL = "/api/v1/finance/events/ingest"
_VALID_SECRET = "test-ingest-secret"
# Reason: organizationId in the event envelope must be a valid UUID (pydantic strict).
# We use a fixed UUID here for consistency across all tests in this module.
_ORG_UUID = "a0000000-0000-4000-8000-000000000001"
_ORG = _ORG_UUID   # alias used in DB queries (stored as string)
_COMPANY_CODE = "GR01"


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


async def _seed_company(client: AsyncClient, code: str = _COMPANY_CODE) -> None:
    """Create a company (seeds CoA)."""
    resp = await client.post(
        "/api/v1/finance/companies",
        json={
            "companyCode": code,
            "organizationId": _ORG,
            "legalName": "GR Test Company LLC",
        },
        headers={"Authorization": "Bearer " + _make_jwt()},
    )
    assert resp.status_code in (201, 409), resp.text


def _make_jwt(role: str = "finance_admin") -> str:
    """Generate a test JWT signed with the test SECRET_KEY."""
    from datetime import timedelta

    from jose import jwt

    payload = {
        "userId": "test-user-gr",
        "email": "test@a64core.com",
        "role": role,
        "type": "access",
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    return jwt.encode(payload, "test_secret_key", algorithm="HS256")


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
    grIrClearingAccountId: Optional[str] = None,
    use_real_account: bool = True,
) -> CompanyPostingSetup:
    """
    Insert a CompanyPostingSetup row.

    Args:
        grIrClearingAccountId: If None and use_real_account=True, auto-resolve
            the second active account from the CoA.  If None and
            use_real_account=False, leaves grIrClearingAccountId as null
            (simulates unconfigured GR/IR clearing).
    """
    if use_real_account and grIrClearingAccountId is None:
        grIrClearingAccountId = await _get_active_account_id(db_session, organization_id, offset=1)

    setup = CompanyPostingSetup(
        setupId=str(uuid.uuid4()),
        organizationId=organization_id,
        companyCode=company_code,
        grIrClearingAccountId=grIrClearingAccountId,
        isComplete=grIrClearingAccountId is not None,
    )
    db_session.add(setup)
    await db_session.flush()
    return setup


async def _seed_item_ext(
    db_session: AsyncSession,
    organization_id: str,
    item_id: str,
    item_code: str,
    inventory_account_id: Optional[str] = None,
) -> PurchaseItemFinanceExt:
    """
    Insert a PurchaseItemFinanceExt row.

    If inventory_account_id is None the field stays null (simulates
    item not yet mapped to an inventory account).
    """
    ext = PurchaseItemFinanceExt(
        extId=str(uuid.uuid4()),
        organizationId=organization_id,
        itemId=item_id,
        itemCode=item_code,
        itemName=f"Test Item {item_code}",
        itemType=None,
        inventoryAccountId=inventory_account_id,
        valuationMethod=ValuationMethodEnum.MOVING_AVERAGE,
        isActive=True,
    )
    db_session.add(ext)
    await db_session.flush()
    return ext


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


def _make_gr_event(
    organization_id: str = _ORG_UUID,
    company_code: str = _COMPANY_CODE,
    gr_date: str = "2026-06-15",
    lines: Optional[List[Dict[str, Any]]] = None,
    event_id: Optional[str] = None,
    po_doc_number: str = "PO-2026-0001",
    vendor_code: str = "VND-001",
) -> Dict[str, Any]:
    """
    Return a valid purchase_received event dict.

    Args:
        lines: GoodsReceivedLine dicts. Defaults to a single raw_material line.
    """
    if lines is None:
        lines = [
            {
                "lineNumber": 1,
                "itemId": str(uuid.uuid4()),
                "itemCode": "FERT-001",
                "itemName": "Fertilizer A",
                "itemType": "raw_material",
                "quantity": "10.000",
                "uom": "KG",
                "unitPrice": "100.00",
                "lineNet": "1000.00",
                "lineTax": "50.00",
                "lineGross": "1050.00",
                "taxCode": "VAT5",
                "baseLineId": str(uuid.uuid4()),
            }
        ]

    total_net = sum(Decimal(str(ln["lineNet"])) for ln in lines)
    total_tax = sum(Decimal(str(ln["lineTax"])) for ln in lines)
    total_gross = sum(Decimal(str(ln["lineGross"])) for ln in lines)

    return {
        "eventId": event_id or str(uuid.uuid4()),
        "eventType": "purchase_received",
        "organizationId": organization_id,
        "companyCode": company_code,
        "occurredAt": datetime.utcnow().isoformat(),
        "sourceUserId": str(uuid.uuid4()),
        "payload": {
            "grDocId": str(uuid.uuid4()),
            "grDocNumber": f"GR-2026-{uuid.uuid4().hex[:4].upper()}",
            "grDate": gr_date,
            "poDocId": str(uuid.uuid4()),
            "poDocNumber": po_doc_number,
            "vendorId": str(uuid.uuid4()),
            "vendorCode": vendor_code,
            "companyCode": company_code,
            "lines": lines,
            "currencyCode": "AED",
            "totalNetAmount": str(total_net),
            "totalTaxAmount": str(total_tax),
            "totalGrossAmount": str(total_gross),
        },
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_happy_path_single_line_je_created(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Happy path: all prerequisites configured → JE created with 1 DR + 1 CR line.

    Verifies:
    - HTTP 200 with status=processed.
    - JournalEntry row exists with correct fields.
    - 2 JournalEntryLine rows (1 DR + 1 CR).
    - totalDebit == totalCredit == lineNet.
    - DR line references the inventory account, not GR/IR Clearing.
    - CR line references GR/IR Clearing.
    """
    await _seed_company(client)

    inv_acct_id = await _get_active_account_id(db_session, _ORG, offset=0)
    grIr_acct_id = await _get_active_account_id(db_session, _ORG, offset=1)

    await _seed_posting_setup(
        db_session, _ORG, _COMPANY_CODE,
        grIrClearingAccountId=grIr_acct_id,
    )

    item_id = str(uuid.uuid4())
    await _seed_item_ext(db_session, _ORG, item_id, "FERT-001", inv_acct_id)
    await _seed_fiscal_period(db_session, _COMPANY_CODE)

    lines = [
        {
            "lineNumber": 1,
            "itemId": item_id,
            "itemCode": "FERT-001",
            "itemName": "Fertilizer A",
            "itemType": "raw_material",
            "quantity": "10.000",
            "uom": "KG",
            "unitPrice": "100.00",
            "lineNet": "1000.00",
            "lineTax": "50.00",
            "lineGross": "1050.00",
            "taxCode": "VAT5",
            "baseLineId": str(uuid.uuid4()),
        }
    ]
    event = _make_gr_event(lines=lines)
    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "processed"

    # Verify JE header
    result = await db_session.execute(
        select(JournalEntry).where(
            JournalEntry.organizationId == _ORG,
            JournalEntry.sourceEventId == event["eventId"],
        )
    )
    je = result.scalar_one_or_none()
    assert je is not None, "JournalEntry must be created"
    assert je.companyCode == _COMPANY_CODE
    assert je.sourceEventType == "purchase_received"
    assert je.status.value == "posted"
    assert float(je.totalDebit) == 1000.0
    assert float(je.totalCredit) == 1000.0
    assert je.postedBy == "system"
    assert je.jeNumber.startswith(f"JE-{_COMPANY_CODE}-2026-")

    # Verify JE lines
    lines_result = await db_session.execute(
        select(JournalEntryLine).where(JournalEntryLine.jeId == je.jeId)
    )
    je_lines = lines_result.scalars().all()
    assert len(je_lines) == 2, f"Expected 2 lines (1 DR + 1 CR), got {len(je_lines)}"

    dr_lines = [l for l in je_lines if l.debit is not None]
    cr_lines = [l for l in je_lines if l.credit is not None]
    assert len(dr_lines) == 1
    assert len(cr_lines) == 1
    assert float(dr_lines[0].debit) == 1000.0
    assert dr_lines[0].accountId == inv_acct_id
    assert float(cr_lines[0].credit) == 1000.0
    assert cr_lines[0].accountId == grIr_acct_id


@pytest.mark.asyncio
async def test_posting_setup_missing_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    No posting setup row for the company → 400 with descriptive message.
    No JE should be created.
    """
    await _seed_company(client, code="GR02")
    # Deliberately do NOT seed a posting setup for GR02

    item_id = str(uuid.uuid4())
    inv_acct_id = await _get_active_account_id(db_session, _ORG, offset=0)
    await _seed_item_ext(db_session, _ORG, item_id, "FERT-002", inv_acct_id)
    await _seed_fiscal_period(db_session, "GR02")

    event = _make_gr_event(company_code="GR02")
    event["payload"]["lines"][0]["itemId"] = item_id
    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 400, resp.text
    assert "Company posting setup not configured" in resp.json()["detail"]
    assert "GR02" in resp.json()["detail"]

    # Verify no JE was created
    je_count = await db_session.execute(
        select(func.count()).select_from(JournalEntry).where(
            JournalEntry.sourceEventId == event["eventId"]
        )
    )
    assert je_count.scalar() == 0


@pytest.mark.asyncio
async def test_grIrClearing_not_configured_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Posting setup exists but grIrClearingAccountId is null → 400.
    """
    await _seed_company(client, code="GR03")
    # Seed setup WITHOUT grIrClearingAccountId
    await _seed_posting_setup(
        db_session, _ORG, "GR03",
        grIrClearingAccountId=None,
        use_real_account=False,
    )

    item_id = str(uuid.uuid4())
    inv_acct_id = await _get_active_account_id(db_session, _ORG, offset=0)
    await _seed_item_ext(db_session, _ORG, item_id, "FERT-003", inv_acct_id)
    await _seed_fiscal_period(db_session, "GR03")

    lines = [
        {
            "lineNumber": 1,
            "itemId": item_id,
            "itemCode": "FERT-003",
            "itemName": "Fertilizer B",
            "itemType": "raw_material",
            "quantity": "5.000",
            "uom": "KG",
            "unitPrice": "50.00",
            "lineNet": "250.00",
            "lineTax": "12.50",
            "lineGross": "262.50",
        }
    ]
    event = _make_gr_event(company_code="GR03", lines=lines)
    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 400, resp.text
    assert "GR/IR Clearing account not configured" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_item_ext_missing_returns_400_no_je(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Item ext row does not exist for one of the line items → 400.
    No JE should be created (rollback on first missing item).
    """
    await _seed_company(client, code="GR04")
    grIr_acct_id = await _get_active_account_id(db_session, _ORG, offset=1)
    await _seed_posting_setup(
        db_session, _ORG, "GR04",
        grIrClearingAccountId=grIr_acct_id,
    )
    await _seed_fiscal_period(db_session, "GR04")
    # Deliberately do NOT seed item ext for the item in this event

    unknown_item_id = str(uuid.uuid4())
    lines = [
        {
            "lineNumber": 1,
            "itemId": unknown_item_id,
            "itemCode": "UNKNOWN-001",
            "itemName": "Mystery Item",
            "itemType": "consumable",
            "quantity": "2.000",
            "uom": "EA",
            "unitPrice": "20.00",
            "lineNet": "40.00",
            "lineTax": "2.00",
            "lineGross": "42.00",
        }
    ]
    event = _make_gr_event(company_code="GR04", lines=lines)
    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "UNKNOWN-001" in detail
    assert "not configured" in detail.lower() or "finance master data" in detail.lower()

    # No JE created
    je_count = await db_session.execute(
        select(func.count()).select_from(JournalEntry).where(
            JournalEntry.sourceEventId == event["eventId"]
        )
    )
    assert je_count.scalar() == 0


@pytest.mark.asyncio
async def test_item_ext_inventory_account_null_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Item ext row exists but inventoryAccountId is null → 400.
    """
    await _seed_company(client, code="GR05")
    grIr_acct_id = await _get_active_account_id(db_session, _ORG, offset=1)
    await _seed_posting_setup(
        db_session, _ORG, "GR05",
        grIrClearingAccountId=grIr_acct_id,
    )
    await _seed_fiscal_period(db_session, "GR05")

    item_id = str(uuid.uuid4())
    # Seed ext with NO inventoryAccountId
    await _seed_item_ext(db_session, _ORG, item_id, "CONS-001", inventory_account_id=None)

    lines = [
        {
            "lineNumber": 1,
            "itemId": item_id,
            "itemCode": "CONS-001",
            "itemName": "Consumable A",
            "itemType": "consumable",
            "quantity": "3.000",
            "uom": "EA",
            "unitPrice": "15.00",
            "lineNet": "45.00",
            "lineTax": "2.25",
            "lineGross": "47.25",
        }
    ]
    event = _make_gr_event(company_code="GR05", lines=lines)
    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "CONS-001" in detail
    assert "no inventory account" in detail.lower() or "inventoryAccountId" in detail


@pytest.mark.asyncio
async def test_no_open_fiscal_period_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    No open fiscal period covering grDate → 400.
    """
    await _seed_company(client, code="GR06")
    grIr_acct_id = await _get_active_account_id(db_session, _ORG, offset=1)
    await _seed_posting_setup(
        db_session, _ORG, "GR06",
        grIrClearingAccountId=grIr_acct_id,
    )

    item_id = str(uuid.uuid4())
    inv_acct_id = await _get_active_account_id(db_session, _ORG, offset=0)
    await _seed_item_ext(db_session, _ORG, item_id, "FERT-006", inv_acct_id)

    # Seed a CLOSED period instead of an open one
    await _seed_fiscal_period(
        db_session, "GR06",
        start=date(2026, 1, 1),
        end=date(2026, 12, 31),
        status=PeriodStatusEnum.CLOSED,
    )

    lines = [
        {
            "lineNumber": 1,
            "itemId": item_id,
            "itemCode": "FERT-006",
            "itemName": "Fertilizer F",
            "itemType": "raw_material",
            "quantity": "5.000",
            "uom": "KG",
            "unitPrice": "100.00",
            "lineNet": "500.00",
            "lineTax": "25.00",
            "lineGross": "525.00",
        }
    ]
    event = _make_gr_event(company_code="GR06", lines=lines, gr_date="2026-06-15")
    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 400, resp.text
    assert "No open fiscal period" in resp.json()["detail"]
    assert "2026-06-15" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_multiple_lines_different_accounts_separate_dr_per_line(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Two GR lines mapped to different inventory accounts produce two separate
    DR lines (one per GR line, not aggregated by account).

    Also verifies VAT is ignored: totalDebit == sum(lineNet), not sum(lineGross).
    """
    await _seed_company(client, code="GR07")

    inv_acct_a = await _get_active_account_id(db_session, _ORG, offset=0)
    inv_acct_b = await _get_active_account_id(db_session, _ORG, offset=2)
    grIr_acct_id = await _get_active_account_id(db_session, _ORG, offset=1)

    await _seed_posting_setup(
        db_session, _ORG, "GR07",
        grIrClearingAccountId=grIr_acct_id,
    )
    await _seed_fiscal_period(db_session, "GR07")

    item_a_id = str(uuid.uuid4())
    item_b_id = str(uuid.uuid4())
    await _seed_item_ext(db_session, _ORG, item_a_id, "RAW-A", inv_acct_a)
    await _seed_item_ext(db_session, _ORG, item_b_id, "CONS-B", inv_acct_b)

    lines = [
        {
            "lineNumber": 1,
            "itemId": item_a_id,
            "itemCode": "RAW-A",
            "itemName": "Raw Material A",
            "itemType": "raw_material",
            "quantity": "10.000",
            "uom": "KG",
            "unitPrice": "100.00",
            "lineNet": "1000.00",
            "lineTax": "50.00",
            "lineGross": "1050.00",
            "taxCode": "VAT5",
        },
        {
            "lineNumber": 2,
            "itemId": item_b_id,
            "itemCode": "CONS-B",
            "itemName": "Consumable B",
            "itemType": "consumable",
            "quantity": "5.000",
            "uom": "EA",
            "unitPrice": "40.00",
            "lineNet": "200.00",
            "lineTax": "10.00",
            "lineGross": "210.00",
            "taxCode": "VAT5",
        },
    ]
    event = _make_gr_event(company_code="GR07", lines=lines)
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
    je = je_result.scalar_one()

    # 2 DR lines + 1 CR line = 3 total
    lines_result = await db_session.execute(
        select(JournalEntryLine).where(JournalEntryLine.jeId == je.jeId)
    )
    je_lines = lines_result.scalars().all()
    assert len(je_lines) == 3, f"Expected 3 lines (2 DR + 1 CR), got {len(je_lines)}"

    dr_lines = sorted(
        [l for l in je_lines if l.debit is not None],
        key=lambda l: float(l.debit),
    )
    cr_lines = [l for l in je_lines if l.credit is not None]
    assert len(dr_lines) == 2
    assert len(cr_lines) == 1

    # DR accounts must match the two distinct inventory accounts
    dr_account_ids = {l.accountId for l in dr_lines}
    assert dr_account_ids == {inv_acct_a, inv_acct_b}

    # CR account is GR/IR Clearing
    assert cr_lines[0].accountId == grIr_acct_id

    # DR amounts
    dr_amounts = sorted(float(l.debit) for l in dr_lines)
    assert dr_amounts == [200.0, 1000.0]

    # CR total == sum of lineNet (1000 + 200 = 1200)
    assert float(cr_lines[0].credit) == 1200.0

    # JE header totals: must be lineNet sum, NOT lineGross sum
    # lineGross sum = 1050 + 210 = 1260; lineNet sum = 1000 + 200 = 1200
    assert float(je.totalDebit) == 1200.0
    assert float(je.totalCredit) == 1200.0


@pytest.mark.asyncio
async def test_vat_is_ignored_totals_match_linenet_not_linegross(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    VAT in GR lines is intentionally ignored at posting time.

    Assert that JE totalDebit == sum(lineNet) NOT sum(lineGross).
    The 5% VAT lives on the AP Invoice (Phase C).
    """
    await _seed_company(client, code="GR08")

    inv_acct_id = await _get_active_account_id(db_session, _ORG, offset=0)
    grIr_acct_id = await _get_active_account_id(db_session, _ORG, offset=1)
    await _seed_posting_setup(
        db_session, _ORG, "GR08",
        grIrClearingAccountId=grIr_acct_id,
    )
    await _seed_fiscal_period(db_session, "GR08")

    item_id = str(uuid.uuid4())
    await _seed_item_ext(db_session, _ORG, item_id, "SEED-001", inv_acct_id)

    # lineNet = 500, lineTax = 25 (5% VAT), lineGross = 525
    lines = [
        {
            "lineNumber": 1,
            "itemId": item_id,
            "itemCode": "SEED-001",
            "itemName": "Seed Batch",
            "itemType": "raw_material",
            "quantity": "100.000",
            "uom": "G",
            "unitPrice": "5.00",
            "lineNet": "500.00",
            "lineTax": "25.00",
            "lineGross": "525.00",
            "taxCode": "VAT5",
        }
    ]
    event = _make_gr_event(company_code="GR08", lines=lines)
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
    je = je_result.scalar_one()

    # Must be 500.00, not 525.00
    assert float(je.totalDebit) == 500.0, (
        f"Expected 500.00 (lineNet), got {je.totalDebit} — VAT must not be included at GR"
    )
    assert float(je.totalCredit) == 500.0

    # Verify CR line amount
    lines_result = await db_session.execute(
        select(JournalEntryLine).where(
            JournalEntryLine.jeId == je.jeId,
            JournalEntryLine.credit != None,  # noqa: E711
        )
    )
    cr_line = lines_result.scalar_one()
    assert float(cr_line.credit) == 500.0


@pytest.mark.asyncio
async def test_je_number_is_monotonic_for_sequential_grs(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Two consecutive GRs for the same company/year produce sequential JE numbers.

    e.g. JE-GR09-2026-0001 then JE-GR09-2026-0002.
    """
    await _seed_company(client, code="GR09")

    inv_acct_id = await _get_active_account_id(db_session, _ORG, offset=0)
    grIr_acct_id = await _get_active_account_id(db_session, _ORG, offset=1)
    await _seed_posting_setup(
        db_session, _ORG, "GR09",
        grIrClearingAccountId=grIr_acct_id,
    )
    await _seed_fiscal_period(db_session, "GR09")

    item_id = str(uuid.uuid4())
    await _seed_item_ext(db_session, _ORG, item_id, "PART-001", inv_acct_id)

    def _build_line(item_id: str) -> Dict[str, Any]:
        return {
            "lineNumber": 1,
            "itemId": item_id,
            "itemCode": "PART-001",
            "itemName": "Part A",
            "itemType": "raw_material",
            "quantity": "1.000",
            "uom": "EA",
            "unitPrice": "10.00",
            "lineNet": "10.00",
            "lineTax": "0.50",
            "lineGross": "10.50",
        }

    event_1 = _make_gr_event(
        company_code="GR09", lines=[_build_line(item_id)], gr_date="2026-03-01"
    )
    event_2 = _make_gr_event(
        company_code="GR09", lines=[_build_line(item_id)], gr_date="2026-03-02"
    )

    resp1 = await client.post(
        _INGEST_URL, json=event_1, headers={"X-Service-Secret": _VALID_SECRET}
    )
    assert resp1.status_code == 200, resp1.text

    resp2 = await client.post(
        _INGEST_URL, json=event_2, headers={"X-Service-Secret": _VALID_SECRET}
    )
    assert resp2.status_code == 200, resp2.text

    # Fetch both JEs and compare numbers
    je_result = await db_session.execute(
        select(JournalEntry.jeNumber)
        .where(
            JournalEntry.organizationId == _ORG,
            JournalEntry.companyCode == "GR09",
        )
        .order_by(JournalEntry.createdAt)
    )
    numbers = [row[0] for row in je_result.all()]
    assert len(numbers) == 2, f"Expected 2 JEs, got {numbers}"

    # Both must follow the prefix pattern
    prefix = "JE-GR09-2026-"
    assert all(n.startswith(prefix) for n in numbers), f"Unexpected prefix in {numbers}"

    # Extract numeric suffixes and verify they are sequential
    suffixes = [int(n[len(prefix):]) for n in numbers]
    assert suffixes[1] == suffixes[0] + 1, (
        f"JE numbers not sequential: {numbers[0]} then {numbers[1]}"
    )
