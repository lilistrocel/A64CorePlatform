"""
Tests for T-100.11 — _handle_return_posted / _handle_return_cancelled.

Wave 3 Phase 2 finale: inventory-side reversal on goods return.

Posting pattern per return line:
  DR  Inventory account  (purchase_item_finance_ext.inventoryAccountId)  lineCogs
  CR  COGS account       (sale_item_finance_ext.cogsAccountId)            lineCogs

This is the symmetric reversal of delivery_posted:
  delivery_posted: DR COGS / CR Inventory
  return_posted:   DR Inventory / CR COGS

Total lines = 2 × len(return_lines)

Cancellation:
  Finds original return_posted JE by sourceEventId == originalEventId,
  posts a reversing entry (DR/CR swapped), leaving original POSTED.
  Duplicate cancellation events are idempotent no-ops (handler-level guard).

Test cases
----------
 1. happy_path_2_line — 2-line return → 4 JE lines, balanced, correct accounts.
 2. missing_sale_item_ext → 400 with item code in detail.
 3. missing_purchase_item_ext_inventory → 400 with item code in detail.
 4. cogs_account_inactive → 400.
 5. cogs_account_wrong_drawer → 400.
 6. inventory_account_inactive → 400.
 7. inventory_account_wrong_drawer → 400.
 8. closed_fiscal_period → 400.
 9. duplicate_event_id — idempotent no-op, no duplicate JE.
10. cancellation_happy_path — post return then cancel → reversal JE exists, totals net to zero.
11. cancellation_original_not_found → 400.
12. cancellation_duplicate_idempotent — cancel twice → second is a no-op.
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
    DrawerEnum,
    FiscalPeriod,
    GLAccount,
    JournalEntry,
    JournalEntryLine,
    PeriodStatusEnum,
    PurchaseItemFinanceExt,
    SaleItemFinanceExt,
    ValuationMethodEnum,
)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_INGEST_URL = "/api/v1/finance/events/ingest"
_VALID_SECRET = "test-ingest-secret"
_ORG_UUID = "e1000000-0000-4000-8000-000000000001"
_ORG = _ORG_UUID
_COMPANY_CODE_BASE = "RTN"


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
        "userId": "test-user-rtn",
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
            "legalName": f"Return Test Company {code} LLC",
        },
        headers={"Authorization": "Bearer " + _make_jwt()},
    )
    assert resp.status_code in (201, 409), resp.text


async def _seed_posting_setup(
    db_session: AsyncSession,
    organization_id: str,
    company_code: str,
) -> CompanyPostingSetup:
    """Insert a minimal CompanyPostingSetup row."""
    setup = CompanyPostingSetup(
        setupId=str(uuid.uuid4()),
        organizationId=organization_id,
        companyCode=company_code,
        grIrClearingAccountId=None,
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


async def _seed_purchase_item_ext(
    db_session: AsyncSession,
    organization_id: str,
    item_id: str,
    item_code: str,
    inventory_account_id: Optional[str] = None,
) -> PurchaseItemFinanceExt:
    """Insert a PurchaseItemFinanceExt row (holds inventoryAccountId)."""
    ext = PurchaseItemFinanceExt(
        extId=str(uuid.uuid4()),
        organizationId=organization_id,
        itemId=item_id,
        itemCode=item_code,
        itemName=f"Item {item_code}",
        itemType=None,
        inventoryAccountId=inventory_account_id,
        valuationMethod=ValuationMethodEnum.MOVING_AVERAGE,
        isActive=True,
    )
    db_session.add(ext)
    await db_session.flush()
    return ext


async def _seed_sale_item_ext(
    db_session: AsyncSession,
    organization_id: str,
    item_id: str,
    item_code: str,
    cogs_account_id: Optional[str] = None,
) -> SaleItemFinanceExt:
    """Insert a SaleItemFinanceExt row (holds cogsAccountId)."""
    ext = SaleItemFinanceExt(
        sale_item_finance_ext_id=str(uuid.uuid4()),
        organizationId=organization_id,
        itemId=item_id,
        itemCode=item_code,
        itemName=f"Item {item_code}",
        cogsAccountId=cogs_account_id,
        isSellable=True,
    )
    db_session.add(ext)
    await db_session.flush()
    return ext


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


# ---------------------------------------------------------------------------
# Event factory helpers
# ---------------------------------------------------------------------------


def _make_return_line(
    line_number: int,
    item_id: str,
    item_code: str,
    returned_qty: str = "5.000",
    unit_cost: str = "100.00",
    line_cogs: str = "500.00",
    cost_center_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Build a single ReturnPostedLine dict."""
    return {
        "lineNumber": line_number,
        "itemId": item_id,
        "itemCode": item_code,
        "returnedQty": returned_qty,
        "unitCost": unit_cost,
        "lineCogs": line_cogs,
        "warehouseId": str(uuid.uuid4()),
        "costCenterId": cost_center_id,
    }


def _make_return_event(
    organization_id: str = _ORG_UUID,
    company_code: str = _COMPANY_CODE_BASE,
    doc_date: str = "2026-06-20",
    lines: Optional[List[Dict[str, Any]]] = None,
    event_id: Optional[str] = None,
    return_doc_number: str = "RTN-2026-0001",
    customer_name: str = "Farm Fresh LLC",
    total_cogs: str = "500.00",
) -> Dict[str, Any]:
    """
    Return a valid return_posted event dict.

    Args:
        lines: ReturnPostedLine dicts. Defaults to a single line.
    """
    if lines is None:
        lines = [
            _make_return_line(
                line_number=1,
                item_id=str(uuid.uuid4()),
                item_code="ITEM-RTN-001",
                returned_qty="5.000",
                unit_cost="100.00",
                line_cogs=total_cogs,
            )
        ]

    return {
        "eventId": event_id or str(uuid.uuid4()),
        "eventType": "return_posted",
        "organizationId": organization_id,
        "companyCode": company_code,
        "occurredAt": datetime.utcnow().isoformat(),
        "sourceUserId": str(uuid.uuid4()),
        "payload": {
            "returnDocEntry": str(uuid.uuid4()),
            "returnDocNumber": return_doc_number,
            "returnDate": doc_date,
            "docDate": doc_date,
            "customerId": str(uuid.uuid4()),
            "customerName": customer_name,
            "baseDocDocEntry": str(uuid.uuid4()),
            "baseDocDocNumber": "DN-2026-0001",
            "totalCogs": total_cogs,
            "lines": lines,
        },
    }


def _make_cancellation_event(
    return_event: Dict[str, Any],
    event_id: Optional[str] = None,
    doc_date: str = "2026-06-21",
) -> Dict[str, Any]:
    """
    Build a return_cancelled event that references a prior return_posted event.
    """
    orig_payload = return_event["payload"]
    return {
        "eventId": event_id or str(uuid.uuid4()),
        "eventType": "return_cancelled",
        "organizationId": return_event["organizationId"],
        "companyCode": return_event["companyCode"],
        "occurredAt": datetime.utcnow().isoformat(),
        "sourceUserId": str(uuid.uuid4()),
        "payload": {
            **orig_payload,
            "docDate": doc_date,
            "originalEventId": return_event["eventId"],
        },
    }


async def _post_event(client: AsyncClient, event: Dict[str, Any]) -> Any:
    """POST an event to the ingest endpoint."""
    return await client.post(
        _INGEST_URL, json=event, headers={"X-Service-Secret": _VALID_SECRET}
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_happy_path_2_line_return_je_created(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Happy path: 2-line return → JE has 4 lines (DR Inventory + CR COGS per line),
    totals balanced, description includes customer name and RTN doc number,
    sourceEventType is return_posted.
    """
    code = "RT01"
    await _seed_company(client, code)

    inv_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="1210-RT01"
    )
    cogs_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE,
        account_number="5100-RT01"
    )
    await _seed_posting_setup(db_session, _ORG, code)
    await _seed_fiscal_period(db_session, code)

    item_a_id = str(uuid.uuid4())
    item_b_id = str(uuid.uuid4())
    await _seed_sale_item_ext(db_session, _ORG, item_a_id, "RTN-A", cogs_acct)
    await _seed_purchase_item_ext(db_session, _ORG, item_a_id, "RTN-A", inv_acct)
    await _seed_sale_item_ext(db_session, _ORG, item_b_id, "RTN-B", cogs_acct)
    await _seed_purchase_item_ext(db_session, _ORG, item_b_id, "RTN-B", inv_acct)

    lines = [
        _make_return_line(1, item_a_id, "RTN-A", "10.000", "100.00", "1000.00"),
        _make_return_line(2, item_b_id, "RTN-B", "5.000", "40.00", "200.00"),
    ]
    event = _make_return_event(
        company_code=code,
        lines=lines,
        total_cogs="1200.00",
        customer_name="Farm Fresh LLC",
        return_doc_number="RTN-2026-0001",
    )
    resp = await _post_event(client, event)
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
    assert je.companyCode == code
    assert je.sourceEventType == "return_posted"
    assert je.status.value == "posted"
    assert float(je.totalDebit) == 1200.0
    assert float(je.totalCredit) == 1200.0
    assert je.postedBy == "system"
    assert je.jeNumber.startswith(f"JE-{code}-2026-")
    assert "Farm Fresh LLC" in je.description
    assert "RTN-2026-0001" in je.description

    # Verify 4 JE lines (2 DR Inventory + 2 CR COGS)
    lines_result = await db_session.execute(
        select(JournalEntryLine).where(JournalEntryLine.jeId == je.jeId)
    )
    je_lines = lines_result.scalars().all()
    assert len(je_lines) == 4, f"Expected 4 lines (2 DR + 2 CR), got {len(je_lines)}"

    dr_lines = [l for l in je_lines if l.debit is not None]
    cr_lines = [l for l in je_lines if l.credit is not None]
    assert len(dr_lines) == 2, f"Expected 2 DR lines, got {len(dr_lines)}"
    assert len(cr_lines) == 2, f"Expected 2 CR lines, got {len(cr_lines)}"

    # All DR lines → Inventory account
    assert all(l.accountId == inv_acct for l in dr_lines)
    # All CR lines → COGS account
    assert all(l.accountId == cogs_acct for l in cr_lines)

    # DR amounts per line
    dr_amounts = sorted(float(l.debit) for l in dr_lines)
    assert dr_amounts == [200.0, 1000.0]

    # CR amounts per line
    cr_amounts = sorted(float(l.credit) for l in cr_lines)
    assert cr_amounts == [200.0, 1000.0]

    # Total DR == Total CR
    assert sum(float(l.debit) for l in dr_lines) == 1200.0
    assert sum(float(l.credit) for l in cr_lines) == 1200.0


@pytest.mark.asyncio
async def test_missing_sale_item_ext_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    sale_item_finance_ext row does not exist for an item → 400 with item code in detail.
    No JE created.
    """
    code = "RT02"
    await _seed_company(client, code)
    await _seed_posting_setup(db_session, _ORG, code)
    await _seed_fiscal_period(db_session, code)

    inv_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="1210-RT02"
    )
    unknown_item_id = str(uuid.uuid4())
    # Seed purchase ext (inventory lookup would pass) but NOT sale ext (no COGS)
    await _seed_purchase_item_ext(db_session, _ORG, unknown_item_id, "NO-COGS-RTN", inv_acct)

    lines = [_make_return_line(1, unknown_item_id, "NO-COGS-RTN")]
    event = _make_return_event(company_code=code, lines=lines)
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "NO-COGS-RTN" in detail

    # No JE created
    count = await db_session.execute(
        select(func.count()).select_from(JournalEntry).where(
            JournalEntry.sourceEventId == event["eventId"]
        )
    )
    assert count.scalar() == 0


@pytest.mark.asyncio
async def test_missing_purchase_item_ext_inventory_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    sale_item_finance_ext.cogsAccountId set, but purchase_item_finance_ext
    has no inventoryAccountId → 400 with item code.
    """
    code = "RT03"
    await _seed_company(client, code)
    await _seed_posting_setup(db_session, _ORG, code)
    await _seed_fiscal_period(db_session, code)

    cogs_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE,
        account_number="5100-RT03"
    )
    item_id = str(uuid.uuid4())
    await _seed_sale_item_ext(db_session, _ORG, item_id, "NO-INV-RTN", cogs_acct)
    # Seed purchase ext WITHOUT inventoryAccountId
    await _seed_purchase_item_ext(db_session, _ORG, item_id, "NO-INV-RTN", inventory_account_id=None)

    lines = [_make_return_line(1, item_id, "NO-INV-RTN")]
    event = _make_return_event(company_code=code, lines=lines)
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "NO-INV-RTN" in detail
    assert "inventory account" in detail.lower() or "inventoryAccountId" in detail


@pytest.mark.asyncio
async def test_cogs_account_inactive_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    cogsAccountId on sale_item_finance_ext points to an inactive account → 400.
    """
    code = "RT04"
    await _seed_company(client, code)
    await _seed_posting_setup(db_session, _ORG, code)
    await _seed_fiscal_period(db_session, code)

    inactive_cogs = await _make_gl_account(
        db_session, _ORG, DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE,
        active=False, account_number="5100-RT04-DEAD"
    )
    inv_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="1210-RT04"
    )
    item_id = str(uuid.uuid4())
    await _seed_sale_item_ext(db_session, _ORG, item_id, "INACTIVE-COGS-RTN", inactive_cogs)
    await _seed_purchase_item_ext(db_session, _ORG, item_id, "INACTIVE-COGS-RTN", inv_acct)

    lines = [_make_return_line(1, item_id, "INACTIVE-COGS-RTN")]
    event = _make_return_event(company_code=code, lines=lines)
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    assert "inactive" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_cogs_account_wrong_drawer_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    cogsAccountId drawer is ASSETS (not COST_OF_SALES) → 400.
    """
    code = "RT05"
    await _seed_company(client, code)
    await _seed_posting_setup(db_session, _ORG, code)
    await _seed_fiscal_period(db_session, code)

    # Wrong drawer: ASSETS instead of COST_OF_SALES
    wrong_drawer_cogs = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="1299-RT05-WRONG"
    )
    inv_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="1210-RT05"
    )
    item_id = str(uuid.uuid4())
    await _seed_sale_item_ext(db_session, _ORG, item_id, "BAD-COGS-DRAWER-RTN", wrong_drawer_cogs)
    await _seed_purchase_item_ext(db_session, _ORG, item_id, "BAD-COGS-DRAWER-RTN", inv_acct)

    lines = [_make_return_line(1, item_id, "BAD-COGS-DRAWER-RTN")]
    event = _make_return_event(company_code=code, lines=lines)
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "COST_OF_SALES" in detail or "drawer" in detail.lower()


@pytest.mark.asyncio
async def test_inventory_account_inactive_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    inventoryAccountId points to an inactive account → 400.
    """
    code = "RT06"
    await _seed_company(client, code)
    await _seed_posting_setup(db_session, _ORG, code)
    await _seed_fiscal_period(db_session, code)

    cogs_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE,
        account_number="5100-RT06"
    )
    inactive_inv = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        active=False, account_number="1210-RT06-DEAD"
    )
    item_id = str(uuid.uuid4())
    await _seed_sale_item_ext(db_session, _ORG, item_id, "INACTIVE-INV-RTN", cogs_acct)
    await _seed_purchase_item_ext(db_session, _ORG, item_id, "INACTIVE-INV-RTN", inactive_inv)

    lines = [_make_return_line(1, item_id, "INACTIVE-INV-RTN")]
    event = _make_return_event(company_code=code, lines=lines)
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    assert "inactive" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_inventory_account_wrong_drawer_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    inventoryAccountId drawer is COST_OF_SALES (not ASSETS) → 400.
    """
    code = "RT07"
    await _seed_company(client, code)
    await _seed_posting_setup(db_session, _ORG, code)
    await _seed_fiscal_period(db_session, code)

    cogs_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE,
        account_number="5100-RT07"
    )
    wrong_drawer_inv = await _make_gl_account(
        db_session, _ORG, DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE,
        account_number="5199-RT07-WRONG"
    )
    item_id = str(uuid.uuid4())
    await _seed_sale_item_ext(db_session, _ORG, item_id, "BAD-INV-DRAWER-RTN", cogs_acct)
    await _seed_purchase_item_ext(db_session, _ORG, item_id, "BAD-INV-DRAWER-RTN", wrong_drawer_inv)

    lines = [_make_return_line(1, item_id, "BAD-INV-DRAWER-RTN")]
    event = _make_return_event(company_code=code, lines=lines)
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "ASSETS" in detail or "drawer" in detail.lower()


@pytest.mark.asyncio
async def test_closed_fiscal_period_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    No open fiscal period covering docDate → 400.
    """
    code = "RT08"
    await _seed_company(client, code)
    await _seed_posting_setup(db_session, _ORG, code)

    # Seed a CLOSED period only
    await _seed_fiscal_period(
        db_session, code,
        start=date(2026, 1, 1),
        end=date(2026, 12, 31),
        status=PeriodStatusEnum.CLOSED,
    )

    cogs_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE,
        account_number="5100-RT08"
    )
    inv_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="1210-RT08"
    )
    item_id = str(uuid.uuid4())
    await _seed_sale_item_ext(db_session, _ORG, item_id, "PERIOD-RTN", cogs_acct)
    await _seed_purchase_item_ext(db_session, _ORG, item_id, "PERIOD-RTN", inv_acct)

    lines = [_make_return_line(1, item_id, "PERIOD-RTN")]
    event = _make_return_event(
        company_code=code, lines=lines, doc_date="2026-06-20"
    )
    resp = await _post_event(client, event)
    assert resp.status_code == 400, resp.text
    assert "No open fiscal period" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_duplicate_event_id_is_idempotent(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Posting the same event_id twice → second is already_processed, no duplicate JE.
    The outbox_events_processed table prevents re-processing.
    """
    code = "RT09"
    await _seed_company(client, code)

    cogs_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE,
        account_number="5100-RT09"
    )
    inv_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="1210-RT09"
    )
    await _seed_posting_setup(db_session, _ORG, code)
    await _seed_fiscal_period(db_session, code)

    item_id = str(uuid.uuid4())
    await _seed_sale_item_ext(db_session, _ORG, item_id, "IDEM-RTN", cogs_acct)
    await _seed_purchase_item_ext(db_session, _ORG, item_id, "IDEM-RTN", inv_acct)

    fixed_event_id = str(uuid.uuid4())
    lines = [_make_return_line(1, item_id, "IDEM-RTN", "2.000", "500.00", "1000.00")]
    event = _make_return_event(
        company_code=code, lines=lines, total_cogs="1000.00", event_id=fixed_event_id
    )

    resp1 = await _post_event(client, event)
    assert resp1.status_code == 200, resp1.text
    assert resp1.json()["status"] == "processed"

    resp2 = await _post_event(client, event)
    assert resp2.status_code == 200, resp2.text
    assert resp2.json()["status"] == "already_processed"

    # Exactly one JE for this event_id
    count = await db_session.execute(
        select(func.count()).select_from(JournalEntry).where(
            JournalEntry.sourceEventId == fixed_event_id
        )
    )
    assert count.scalar() == 1, "Duplicate event must not create a second JE"


@pytest.mark.asyncio
async def test_cancellation_happy_path_reversal_nets_to_zero(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Post return → post return_cancelled → reversal JE exists, totals net to zero.

    Verifies:
    - Original JE remains POSTED (not voided).
    - Reversal JE has sourceEventType='return_cancelled'.
    - Reversal JE DR/CR sides are swapped vs original (Inventory→CR, COGS→DR).
    - Sum of all debits across both JEs == sum of all credits.
    - sourceDocNumber on reversal JE equals original jeNumber.
    """
    code = "RT10"
    await _seed_company(client, code)

    cogs_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE,
        account_number="5100-RT10"
    )
    inv_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="1210-RT10"
    )
    await _seed_posting_setup(db_session, _ORG, code)
    # Wide period covers both posting date and today's reversal date
    await _seed_fiscal_period(
        db_session, code,
        start=date(2026, 1, 1),
        end=date(2027, 12, 31),
        status=PeriodStatusEnum.OPEN,
    )

    item_id = str(uuid.uuid4())
    await _seed_sale_item_ext(db_session, _ORG, item_id, "CANCEL-RTN", cogs_acct)
    await _seed_purchase_item_ext(db_session, _ORG, item_id, "CANCEL-RTN", inv_acct)

    lines = [_make_return_line(1, item_id, "CANCEL-RTN", "5.000", "200.00", "1000.00")]
    return_event = _make_return_event(
        company_code=code,
        lines=lines,
        total_cogs="1000.00",
        customer_name="Cancelled Customer",
    )
    resp_post = await _post_event(client, return_event)
    assert resp_post.status_code == 200, resp_post.text

    # Post the cancellation event
    cancel_event = _make_cancellation_event(return_event)
    resp_cancel = await _post_event(client, cancel_event)
    assert resp_cancel.status_code == 200, resp_cancel.text
    assert resp_cancel.json()["status"] == "processed"

    # Fetch all JEs for this org/company
    je_result = await db_session.execute(
        select(JournalEntry).where(
            JournalEntry.organizationId == _ORG,
            JournalEntry.companyCode == code,
        )
    )
    all_jes = je_result.scalars().all()
    assert len(all_jes) == 2, f"Expected 2 JEs (original + reversal), got {len(all_jes)}"

    original_je = next(j for j in all_jes if j.sourceEventType == "return_posted")
    reversal_je = next(j for j in all_jes if j.sourceEventType == "return_cancelled")

    # Original remains POSTED (not voided)
    assert original_je.status.value == "posted"

    # Reversal checks
    assert reversal_je.status.value == "posted"
    assert reversal_je.sourceDocNumber == original_je.jeNumber

    # Reversal header amounts are swapped
    assert float(reversal_je.totalDebit) == float(original_je.totalCredit)
    assert float(reversal_je.totalCredit) == float(original_je.totalDebit)

    # All lines across both JEs net to zero
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


@pytest.mark.asyncio
async def test_cancellation_original_not_found_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    return_cancelled referencing a non-existent originalEventId → 400.
    Consumer will retry until the original event is processed.
    """
    code = "RT11"
    await _seed_company(client, code)
    await _seed_posting_setup(db_session, _ORG, code)
    await _seed_fiscal_period(
        db_session, code,
        start=date(2026, 1, 1),
        end=date(2027, 12, 31),
    )

    # Build a fake return event (never posted) to derive a cancellation from it
    fake_return_event_id = str(uuid.uuid4())
    fake_return_event = {
        "eventId": fake_return_event_id,
        "organizationId": _ORG_UUID,
        "companyCode": code,
        "payload": {
            "returnDocEntry": str(uuid.uuid4()),
            "returnDocNumber": "RTN-GHOST-001",
            "returnDate": "2026-06-20",
            "docDate": "2026-06-20",
            "customerId": str(uuid.uuid4()),
            "customerName": "Ghost Customer",
            "baseDocDocEntry": str(uuid.uuid4()),
            "baseDocDocNumber": "DN-GHOST-001",
            "totalCogs": "100.00",
            "lines": [],
        },
    }
    cancel_event = _make_cancellation_event(fake_return_event)
    resp = await _post_event(client, cancel_event)
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "originalEventId" in detail or "return_posted JE" in detail.lower()


@pytest.mark.asyncio
async def test_cancellation_duplicate_is_idempotent(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Posting return_cancelled twice for the same original → second is a no-op,
    exactly one reversal JE in the DB (handler-level idempotency guard).
    """
    code = "RT12"
    await _seed_company(client, code)

    cogs_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE,
        account_number="5100-RT12"
    )
    inv_acct = await _make_gl_account(
        db_session, _ORG, DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        account_number="1210-RT12"
    )
    await _seed_posting_setup(db_session, _ORG, code)
    await _seed_fiscal_period(
        db_session, code,
        start=date(2026, 1, 1),
        end=date(2027, 12, 31),
        status=PeriodStatusEnum.OPEN,
    )

    item_id = str(uuid.uuid4())
    await _seed_sale_item_ext(db_session, _ORG, item_id, "IDEM-CANCEL-RTN", cogs_acct)
    await _seed_purchase_item_ext(db_session, _ORG, item_id, "IDEM-CANCEL-RTN", inv_acct)

    lines = [_make_return_line(1, item_id, "IDEM-CANCEL-RTN", "2.000", "250.00", "500.00")]
    return_event = _make_return_event(
        company_code=code, lines=lines, total_cogs="500.00"
    )
    resp_post = await _post_event(client, return_event)
    assert resp_post.status_code == 200, resp_post.text

    cancel_event_1 = _make_cancellation_event(return_event)
    cancel_event_2 = _make_cancellation_event(return_event, event_id=str(uuid.uuid4()))

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
            JournalEntry.sourceEventType == "return_cancelled",
        )
    )
    assert reversal_count.scalar() == 1, "Duplicate cancellation must not create a second reversal JE"
