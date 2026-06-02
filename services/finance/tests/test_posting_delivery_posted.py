"""
Tests for T-100.8.1 — _handle_delivery_posted / _handle_delivery_cancelled.

Wave 3 Phase 2: first sales-side JE on the GL.

posting pattern per delivery line:
  DR  COGS account     (sale_item_finance_ext.cogsAccountId)          lineCogs
  CR  Inventory account (purchase_item_finance_ext.inventoryAccountId) lineCogs

Total lines = 2 × len(delivery_lines)

Cancellation:
  Finds original delivery_posted JE by sourceEventId == originalEventId,
  posts a reversing entry (DR/CR swapped), leaving original POSTED.
  Duplicate cancellation events are idempotent no-ops.

Test cases
----------
 1. happy_path_2_line — 2-line delivery → 4 JE lines, balanced, correct accounts.
 2. missing_sale_item_ext → 400 with item code in detail.
 3. missing_purchase_item_ext_inventory → 400 with item code in detail.
 4. cogs_account_inactive → 400.
 5. cogs_account_wrong_drawer → 400.
 6. inventory_account_inactive → 400.
 7. inventory_account_wrong_drawer → 400.
 8. closed_fiscal_period → 400.
 9. duplicate_event_id — idempotent no-op, no duplicate JE.
10. cancellation_happy_path — post delivery then cancel → reversal JE exists, totals net to zero.
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
_ORG_UUID = "b0000000-0000-4000-8000-000000000002"
_ORG = _ORG_UUID
_COMPANY_CODE = "DN01"


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
        "userId": "test-user-dn",
        "email": "test@a64core.com",
        "role": role,
        "type": "access",
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    return jwt.encode(payload, "test_secret_key", algorithm="HS256")


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


async def _seed_company(client: AsyncClient, code: str = _COMPANY_CODE) -> None:
    """Create a company (seeds CoA + posting setup)."""
    resp = await client.post(
        "/api/v1/finance/companies",
        json={
            "companyCode": code,
            "organizationId": _ORG,
            "legalName": "Delivery Test Company LLC",
        },
        headers={"Authorization": "Bearer " + _make_jwt()},
    )
    assert resp.status_code in (201, 409), resp.text


async def _get_active_account_by_drawer(
    db_session: AsyncSession,
    organization_id: str,
    drawer: DrawerEnum,
    account_type: AccountTypeEnum,
    offset: int = 0,
) -> Optional[str]:
    """
    Return accountId of an active non-header account matching drawer + accountType.

    Returns None if no matching account exists.
    """
    result = await db_session.execute(
        select(GLAccount.accountId)
        .where(
            GLAccount.organizationId == organization_id,
            GLAccount.drawer == drawer,
            GLAccount.accountType == account_type,
            GLAccount.isActive == True,  # noqa: E712
            GLAccount.isHeader == False,  # noqa: E712
        )
        .offset(offset)
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _get_any_active_account(
    db_session: AsyncSession,
    organization_id: str,
    offset: int = 0,
) -> str:
    """Return any active account (used for posting setup without caring about type)."""
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
    assert account_id is not None, "No active GL account — CoA seed must run first"
    return account_id


async def _seed_posting_setup(
    db_session: AsyncSession,
    organization_id: str,
    company_code: str,
) -> CompanyPostingSetup:
    """Insert a minimal CompanyPostingSetup row (grIrClearingAccountId is not needed for delivery)."""
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


async def _seed_purchase_item_ext(
    db_session: AsyncSession,
    organization_id: str,
    item_id: str,
    item_code: str,
    inventory_account_id: Optional[str] = None,
) -> PurchaseItemFinanceExt:
    """Insert a PurchaseItemFinanceExt row (purchase side — holds inventoryAccountId)."""
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
    """Insert a SaleItemFinanceExt row (sale side — holds cogsAccountId)."""
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


async def _make_cogs_account(
    db_session: AsyncSession,
    organization_id: str,
    active: bool = True,
    drawer: DrawerEnum = DrawerEnum.COST_OF_SALES,
    account_type: AccountTypeEnum = AccountTypeEnum.EXPENSE,
    account_number: Optional[str] = None,
) -> str:
    """
    Create a synthetic COGS GL account with the given properties.

    Used for testing wrong-type / inactive account guards.
    """
    acct_id = str(uuid.uuid4())
    acct = GLAccount(
        accountId=acct_id,
        organizationId=organization_id,
        accountNumber=account_number or f"5100-{acct_id[:6]}",
        accountName=f"Test COGS {acct_id[:4]}",
        drawer=drawer,
        accountType=account_type,
        isHeader=False,
        isActive=active,
        accountLevel=AccountLevelEnum.ACTIVE,
    )
    db_session.add(acct)
    await db_session.flush()
    return acct_id


async def _make_inventory_account(
    db_session: AsyncSession,
    organization_id: str,
    active: bool = True,
    drawer: DrawerEnum = DrawerEnum.ASSETS,
    account_type: AccountTypeEnum = AccountTypeEnum.ASSET,
    account_number: Optional[str] = None,
) -> str:
    """
    Create a synthetic Inventory GL account with the given properties.

    Used for testing wrong-type / inactive account guards.
    """
    acct_id = str(uuid.uuid4())
    acct = GLAccount(
        accountId=acct_id,
        organizationId=organization_id,
        accountNumber=account_number or f"1210-{acct_id[:6]}",
        accountName=f"Test Inventory {acct_id[:4]}",
        drawer=drawer,
        accountType=account_type,
        isHeader=False,
        isActive=active,
        accountLevel=AccountLevelEnum.ACTIVE,
    )
    db_session.add(acct)
    await db_session.flush()
    return acct_id


def _make_delivery_event(
    organization_id: str = _ORG_UUID,
    company_code: str = _COMPANY_CODE,
    doc_date: str = "2026-06-20",
    lines: Optional[List[Dict[str, Any]]] = None,
    event_id: Optional[str] = None,
    delivery_doc_number: str = "DN-2026-0001",
    customer_name: str = "Farm Fresh LLC",
    total_cogs: str = "1000.00",
) -> Dict[str, Any]:
    """
    Return a valid delivery_posted event dict.

    Args:
        lines: DeliveryPostedLine dicts. Defaults to a single line.
    """
    if lines is None:
        lines = [
            {
                "lineNumber": 1,
                "itemId": str(uuid.uuid4()),
                "itemCode": "ITEM-001",
                "quantity": "10.000",
                "unitCost": "100.00",
                "lineCogs": "1000.00",
                "warehouseId": str(uuid.uuid4()),
                "costCenterId": None,
                "sourceSoLineNumber": 1,
            }
        ]

    return {
        "eventId": event_id or str(uuid.uuid4()),
        "eventType": "delivery_posted",
        "organizationId": organization_id,
        "companyCode": company_code,
        "occurredAt": datetime.utcnow().isoformat(),
        "sourceUserId": str(uuid.uuid4()),
        "payload": {
            "deliveryDocEntry": str(uuid.uuid4()),
            "deliveryDocNumber": delivery_doc_number,
            "deliveryDate": doc_date,
            "docDate": doc_date,
            "customerId": str(uuid.uuid4()),
            "customerName": customer_name,
            "sourceSoDocEntry": str(uuid.uuid4()),
            "sourceSoDocNumber": "SO-2026-0001",
            "totalCogs": total_cogs,
            "lines": lines,
        },
    }


def _make_cancellation_event(
    delivery_event: Dict[str, Any],
    event_id: Optional[str] = None,
    doc_date: str = "2026-06-21",
) -> Dict[str, Any]:
    """
    Build a delivery_cancelled event that references a prior delivery_posted event.
    """
    original_payload = delivery_event["payload"]
    return {
        "eventId": event_id or str(uuid.uuid4()),
        "eventType": "delivery_cancelled",
        "organizationId": delivery_event["organizationId"],
        "companyCode": delivery_event["companyCode"],
        "occurredAt": datetime.utcnow().isoformat(),
        "sourceUserId": str(uuid.uuid4()),
        "payload": {
            "deliveryDocEntry": original_payload["deliveryDocEntry"],
            "deliveryDocNumber": original_payload["deliveryDocNumber"],
            "deliveryDate": original_payload["deliveryDate"],
            "docDate": doc_date,
            "customerId": original_payload["customerId"],
            "customerName": original_payload["customerName"],
            "sourceSoDocEntry": original_payload["sourceSoDocEntry"],
            "sourceSoDocNumber": original_payload["sourceSoDocNumber"],
            "totalCogs": original_payload["totalCogs"],
            "lines": original_payload["lines"],
            "originalEventId": delivery_event["eventId"],
        },
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_happy_path_2_line_delivery_je_created(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Happy path: 2-line delivery → JE has 4 lines (DR COGS + CR Inventory per line),
    totals balanced, description includes customer name, sourceEventType is delivery_posted.
    """
    await _seed_company(client, code="DN01")

    cogs_acct = await _make_cogs_account(db_session, _ORG)
    inv_acct = await _make_inventory_account(db_session, _ORG)

    await _seed_posting_setup(db_session, _ORG, "DN01")
    await _seed_fiscal_period(db_session, "DN01")

    item_a_id = str(uuid.uuid4())
    item_b_id = str(uuid.uuid4())
    await _seed_sale_item_ext(db_session, _ORG, item_a_id, "ITEM-A", cogs_acct)
    await _seed_purchase_item_ext(db_session, _ORG, item_a_id, "ITEM-A", inv_acct)
    await _seed_sale_item_ext(db_session, _ORG, item_b_id, "ITEM-B", cogs_acct)
    await _seed_purchase_item_ext(db_session, _ORG, item_b_id, "ITEM-B", inv_acct)

    lines = [
        {
            "lineNumber": 1,
            "itemId": item_a_id,
            "itemCode": "ITEM-A",
            "quantity": "10.000",
            "unitCost": "100.00",
            "lineCogs": "1000.00",
            "warehouseId": str(uuid.uuid4()),
            "costCenterId": None,
            "sourceSoLineNumber": 1,
        },
        {
            "lineNumber": 2,
            "itemId": item_b_id,
            "itemCode": "ITEM-B",
            "quantity": "5.000",
            "unitCost": "40.00",
            "lineCogs": "200.00",
            "warehouseId": str(uuid.uuid4()),
            "costCenterId": None,
            "sourceSoLineNumber": 2,
        },
    ]
    event = _make_delivery_event(
        company_code="DN01",
        lines=lines,
        total_cogs="1200.00",
        customer_name="Farm Fresh LLC",
    )
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
    assert je.companyCode == "DN01"
    assert je.sourceEventType == "delivery_posted"
    assert je.status.value == "posted"
    assert float(je.totalDebit) == 1200.0
    assert float(je.totalCredit) == 1200.0
    assert je.postedBy == "system"
    assert je.jeNumber.startswith("JE-DN01-2026-")
    assert "Farm Fresh LLC" in je.description
    assert "DN-2026-0001" in je.description

    # Verify 4 JE lines (2 DR + 2 CR)
    lines_result = await db_session.execute(
        select(JournalEntryLine).where(JournalEntryLine.jeId == je.jeId)
    )
    je_lines = lines_result.scalars().all()
    assert len(je_lines) == 4, f"Expected 4 lines (2 DR + 2 CR), got {len(je_lines)}"

    dr_lines = [l for l in je_lines if l.debit is not None]
    cr_lines = [l for l in je_lines if l.credit is not None]
    assert len(dr_lines) == 2, f"Expected 2 DR lines, got {len(dr_lines)}"
    assert len(cr_lines) == 2, f"Expected 2 CR lines, got {len(cr_lines)}"

    # All DR lines go to COGS account
    assert all(l.accountId == cogs_acct for l in dr_lines)
    # All CR lines go to Inventory account
    assert all(l.accountId == inv_acct for l in cr_lines)

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
    sale_item_finance_ext row does not exist for an item → 400 with item code.
    No JE created.
    """
    await _seed_company(client, code="DN02")
    await _seed_posting_setup(db_session, _ORG, "DN02")
    await _seed_fiscal_period(db_session, "DN02")

    inv_acct = await _make_inventory_account(db_session, _ORG)
    unknown_item_id = str(uuid.uuid4())
    # Seed purchase ext (so inventory lookup would pass) but NOT sale ext
    await _seed_purchase_item_ext(db_session, _ORG, unknown_item_id, "NO-COGS-ITEM", inv_acct)

    lines = [
        {
            "lineNumber": 1,
            "itemId": unknown_item_id,
            "itemCode": "NO-COGS-ITEM",
            "quantity": "1.000",
            "unitCost": "50.00",
            "lineCogs": "50.00",
            "warehouseId": str(uuid.uuid4()),
            "costCenterId": None,
            "sourceSoLineNumber": 1,
        }
    ]
    event = _make_delivery_event(company_code="DN02", lines=lines, total_cogs="50.00")
    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "NO-COGS-ITEM" in detail
    assert "sale finance extension" in detail.lower() or "cogsAccountId" in detail or "sale_item_finance_ext" in detail

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
    await _seed_company(client, code="DN03")
    await _seed_posting_setup(db_session, _ORG, "DN03")
    await _seed_fiscal_period(db_session, "DN03")

    cogs_acct = await _make_cogs_account(db_session, _ORG)
    item_id = str(uuid.uuid4())
    await _seed_sale_item_ext(db_session, _ORG, item_id, "NO-INV-ITEM", cogs_acct)
    # Seed purchase ext WITHOUT inventoryAccountId
    await _seed_purchase_item_ext(db_session, _ORG, item_id, "NO-INV-ITEM", inventory_account_id=None)

    lines = [
        {
            "lineNumber": 1,
            "itemId": item_id,
            "itemCode": "NO-INV-ITEM",
            "quantity": "2.000",
            "unitCost": "75.00",
            "lineCogs": "150.00",
            "warehouseId": str(uuid.uuid4()),
            "costCenterId": None,
            "sourceSoLineNumber": 1,
        }
    ]
    event = _make_delivery_event(company_code="DN03", lines=lines, total_cogs="150.00")
    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "NO-INV-ITEM" in detail
    assert "inventory account" in detail.lower() or "inventoryAccountId" in detail


@pytest.mark.asyncio
async def test_cogs_account_inactive_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    cogsAccountId points to an inactive GL account → 400.
    """
    await _seed_company(client, code="DN04")
    await _seed_posting_setup(db_session, _ORG, "DN04")
    await _seed_fiscal_period(db_session, "DN04")

    # Create an INACTIVE COGS account
    inactive_cogs = await _make_cogs_account(db_session, _ORG, active=False)
    inv_acct = await _make_inventory_account(db_session, _ORG)

    item_id = str(uuid.uuid4())
    await _seed_sale_item_ext(db_session, _ORG, item_id, "INACTIVE-COGS", inactive_cogs)
    await _seed_purchase_item_ext(db_session, _ORG, item_id, "INACTIVE-COGS", inv_acct)

    lines = [
        {
            "lineNumber": 1,
            "itemId": item_id,
            "itemCode": "INACTIVE-COGS",
            "quantity": "1.000",
            "unitCost": "200.00",
            "lineCogs": "200.00",
            "warehouseId": str(uuid.uuid4()),
            "costCenterId": None,
            "sourceSoLineNumber": 1,
        }
    ]
    event = _make_delivery_event(company_code="DN04", lines=lines, total_cogs="200.00")
    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 400, resp.text
    assert "inactive" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_cogs_account_wrong_drawer_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    cogsAccountId drawer is ASSETS (not COST_OF_SALES) → 400.
    """
    await _seed_company(client, code="DN05")
    await _seed_posting_setup(db_session, _ORG, "DN05")
    await _seed_fiscal_period(db_session, "DN05")

    # Create a COGS account with the WRONG drawer (ASSETS)
    wrong_drawer_cogs = await _make_cogs_account(
        db_session, _ORG, drawer=DrawerEnum.ASSETS, account_type=AccountTypeEnum.ASSET
    )
    inv_acct = await _make_inventory_account(db_session, _ORG)

    item_id = str(uuid.uuid4())
    await _seed_sale_item_ext(db_session, _ORG, item_id, "BAD-COGS-DRAWER", wrong_drawer_cogs)
    await _seed_purchase_item_ext(db_session, _ORG, item_id, "BAD-COGS-DRAWER", inv_acct)

    lines = [
        {
            "lineNumber": 1,
            "itemId": item_id,
            "itemCode": "BAD-COGS-DRAWER",
            "quantity": "1.000",
            "unitCost": "100.00",
            "lineCogs": "100.00",
            "warehouseId": str(uuid.uuid4()),
            "costCenterId": None,
            "sourceSoLineNumber": 1,
        }
    ]
    event = _make_delivery_event(company_code="DN05", lines=lines, total_cogs="100.00")
    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "COST_OF_SALES" in detail or "drawer" in detail.lower()


@pytest.mark.asyncio
async def test_inventory_account_inactive_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    inventoryAccountId points to an inactive GL account → 400.
    """
    await _seed_company(client, code="DN06")
    await _seed_posting_setup(db_session, _ORG, "DN06")
    await _seed_fiscal_period(db_session, "DN06")

    cogs_acct = await _make_cogs_account(db_session, _ORG)
    # Create an INACTIVE inventory account
    inactive_inv = await _make_inventory_account(db_session, _ORG, active=False)

    item_id = str(uuid.uuid4())
    await _seed_sale_item_ext(db_session, _ORG, item_id, "INACTIVE-INV", cogs_acct)
    await _seed_purchase_item_ext(db_session, _ORG, item_id, "INACTIVE-INV", inactive_inv)

    lines = [
        {
            "lineNumber": 1,
            "itemId": item_id,
            "itemCode": "INACTIVE-INV",
            "quantity": "1.000",
            "unitCost": "300.00",
            "lineCogs": "300.00",
            "warehouseId": str(uuid.uuid4()),
            "costCenterId": None,
            "sourceSoLineNumber": 1,
        }
    ]
    event = _make_delivery_event(company_code="DN06", lines=lines, total_cogs="300.00")
    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 400, resp.text
    assert "inactive" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_inventory_account_wrong_drawer_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    inventoryAccountId drawer is COST_OF_SALES (not ASSETS) → 400.
    """
    await _seed_company(client, code="DN07")
    await _seed_posting_setup(db_session, _ORG, "DN07")
    await _seed_fiscal_period(db_session, "DN07")

    cogs_acct = await _make_cogs_account(db_session, _ORG)
    # Create inventory account with WRONG drawer
    wrong_drawer_inv = await _make_inventory_account(
        db_session, _ORG,
        drawer=DrawerEnum.COST_OF_SALES,
        account_type=AccountTypeEnum.EXPENSE,
    )

    item_id = str(uuid.uuid4())
    await _seed_sale_item_ext(db_session, _ORG, item_id, "BAD-INV-DRAWER", cogs_acct)
    await _seed_purchase_item_ext(db_session, _ORG, item_id, "BAD-INV-DRAWER", wrong_drawer_inv)

    lines = [
        {
            "lineNumber": 1,
            "itemId": item_id,
            "itemCode": "BAD-INV-DRAWER",
            "quantity": "1.000",
            "unitCost": "100.00",
            "lineCogs": "100.00",
            "warehouseId": str(uuid.uuid4()),
            "costCenterId": None,
            "sourceSoLineNumber": 1,
        }
    ]
    event = _make_delivery_event(company_code="DN07", lines=lines, total_cogs="100.00")
    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
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
    await _seed_company(client, code="DN08")
    await _seed_posting_setup(db_session, _ORG, "DN08")

    # Seed a CLOSED period
    await _seed_fiscal_period(
        db_session, "DN08",
        start=date(2026, 1, 1),
        end=date(2026, 12, 31),
        status=PeriodStatusEnum.CLOSED,
    )

    cogs_acct = await _make_cogs_account(db_session, _ORG)
    inv_acct = await _make_inventory_account(db_session, _ORG)
    item_id = str(uuid.uuid4())
    await _seed_sale_item_ext(db_session, _ORG, item_id, "PERIOD-ITEM", cogs_acct)
    await _seed_purchase_item_ext(db_session, _ORG, item_id, "PERIOD-ITEM", inv_acct)

    lines = [
        {
            "lineNumber": 1,
            "itemId": item_id,
            "itemCode": "PERIOD-ITEM",
            "quantity": "1.000",
            "unitCost": "100.00",
            "lineCogs": "100.00",
            "warehouseId": str(uuid.uuid4()),
            "costCenterId": None,
            "sourceSoLineNumber": 1,
        }
    ]
    event = _make_delivery_event(
        company_code="DN08", lines=lines, total_cogs="100.00", doc_date="2026-06-20"
    )
    resp = await client.post(
        _INGEST_URL,
        json=event,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert resp.status_code == 400, resp.text
    assert "No open fiscal period" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_duplicate_event_id_is_idempotent(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Posting the same event_id twice → second is a no-op, no duplicate JE.

    The outbox_events_processed table prevents re-processing.
    """
    await _seed_company(client, code="DN09")

    cogs_acct = await _make_cogs_account(db_session, _ORG)
    inv_acct = await _make_inventory_account(db_session, _ORG)
    await _seed_posting_setup(db_session, _ORG, "DN09")
    await _seed_fiscal_period(db_session, "DN09")

    item_id = str(uuid.uuid4())
    await _seed_sale_item_ext(db_session, _ORG, item_id, "IDEM-ITEM", cogs_acct)
    await _seed_purchase_item_ext(db_session, _ORG, item_id, "IDEM-ITEM", inv_acct)

    fixed_event_id = str(uuid.uuid4())
    lines = [
        {
            "lineNumber": 1,
            "itemId": item_id,
            "itemCode": "IDEM-ITEM",
            "quantity": "1.000",
            "unitCost": "500.00",
            "lineCogs": "500.00",
            "warehouseId": str(uuid.uuid4()),
            "costCenterId": None,
            "sourceSoLineNumber": 1,
        }
    ]
    event = _make_delivery_event(
        company_code="DN09", lines=lines, total_cogs="500.00", event_id=fixed_event_id
    )

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
    Post delivery → post delivery_cancelled → reversal JE exists, totals net to zero.

    Verifies:
    - Original JE remains POSTED (not voided).
    - Reversal JE has sourceEventType='delivery_cancelled'.
    - Reversal JE DR/CR sides are swapped vs original.
    - Sum of all debits across both JEs == sum of all credits.
    """
    await _seed_company(client, code="DN10")

    cogs_acct = await _make_cogs_account(db_session, _ORG)
    inv_acct = await _make_inventory_account(db_session, _ORG)
    await _seed_posting_setup(db_session, _ORG, "DN10")
    # Seed a period that covers both the posting date (2026-06-20) and today
    await _seed_fiscal_period(
        db_session, "DN10",
        start=date(2026, 1, 1),
        end=date(2027, 12, 31),
        status=PeriodStatusEnum.OPEN,
    )

    item_id = str(uuid.uuid4())
    await _seed_sale_item_ext(db_session, _ORG, item_id, "CANCEL-ITEM", cogs_acct)
    await _seed_purchase_item_ext(db_session, _ORG, item_id, "CANCEL-ITEM", inv_acct)

    lines = [
        {
            "lineNumber": 1,
            "itemId": item_id,
            "itemCode": "CANCEL-ITEM",
            "quantity": "5.000",
            "unitCost": "200.00",
            "lineCogs": "1000.00",
            "warehouseId": str(uuid.uuid4()),
            "costCenterId": None,
            "sourceSoLineNumber": 1,
        }
    ]
    delivery_event = _make_delivery_event(
        company_code="DN10",
        lines=lines,
        total_cogs="1000.00",
        customer_name="Cancelled Customer",
    )
    resp_post = await client.post(
        _INGEST_URL, json=delivery_event, headers={"X-Service-Secret": _VALID_SECRET}
    )
    assert resp_post.status_code == 200, resp_post.text

    # Post the cancellation event
    cancel_event = _make_cancellation_event(delivery_event)
    resp_cancel = await client.post(
        _INGEST_URL, json=cancel_event, headers={"X-Service-Secret": _VALID_SECRET}
    )
    assert resp_cancel.status_code == 200, resp_cancel.text
    assert resp_cancel.json()["status"] == "processed"

    # Fetch all JEs for this org/company
    je_result = await db_session.execute(
        select(JournalEntry).where(
            JournalEntry.organizationId == _ORG,
            JournalEntry.companyCode == "DN10",
        )
    )
    all_jes = je_result.scalars().all()
    assert len(all_jes) == 2, f"Expected 2 JEs (original + reversal), got {len(all_jes)}"

    original_je = next(j for j in all_jes if j.sourceEventType == "delivery_posted")
    reversal_je = next(j for j in all_jes if j.sourceEventType == "delivery_cancelled")

    # Original remains POSTED (not voided)
    assert original_je.status.value == "posted"

    # Reversal checks
    assert reversal_je.status.value == "posted"
    assert reversal_je.sourceDocNumber == original_je.jeNumber

    # Totals in reversal JE are swapped
    assert float(reversal_je.totalDebit) == float(original_je.totalCredit)
    assert float(reversal_je.totalCredit) == float(original_je.totalDebit)

    # Fetch all lines for both JEs
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
    delivery_cancelled referencing a non-existent originalEventId → 400.
    Consumer will retry until the original event is processed.
    """
    await _seed_company(client, code="DN11")
    await _seed_posting_setup(db_session, _ORG, "DN11")
    await _seed_fiscal_period(db_session, "DN11")

    fake_delivery_event_id = str(uuid.uuid4())
    # Build a fake delivery event so _make_cancellation_event works
    fake_delivery_event = {
        "eventId": fake_delivery_event_id,
        "organizationId": _ORG_UUID,
        "companyCode": "DN11",
        "payload": {
            "deliveryDocEntry": str(uuid.uuid4()),
            "deliveryDocNumber": "DN-GHOST-001",
            "deliveryDate": "2026-06-20",
            "docDate": "2026-06-20",
            "customerId": str(uuid.uuid4()),
            "customerName": "Ghost Customer",
            "sourceSoDocEntry": str(uuid.uuid4()),
            "sourceSoDocNumber": "SO-GHOST-001",
            "totalCogs": "100.00",
            "lines": [],
        },
    }
    cancel_event = _make_cancellation_event(fake_delivery_event)
    resp = await client.post(
        _INGEST_URL, json=cancel_event, headers={"X-Service-Secret": _VALID_SECRET}
    )
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "originalEventId" in detail or "delivery_posted JE" in detail.lower()


@pytest.mark.asyncio
async def test_cancellation_duplicate_is_idempotent(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Posting delivery_cancelled twice for the same original → second is a no-op,
    exactly one reversal JE in the DB.
    """
    await _seed_company(client, code="DN12")

    cogs_acct = await _make_cogs_account(db_session, _ORG)
    inv_acct = await _make_inventory_account(db_session, _ORG)
    await _seed_posting_setup(db_session, _ORG, "DN12")
    await _seed_fiscal_period(
        db_session, "DN12",
        start=date(2026, 1, 1),
        end=date(2027, 12, 31),
        status=PeriodStatusEnum.OPEN,
    )

    item_id = str(uuid.uuid4())
    await _seed_sale_item_ext(db_session, _ORG, item_id, "IDEM-CANCEL", cogs_acct)
    await _seed_purchase_item_ext(db_session, _ORG, item_id, "IDEM-CANCEL", inv_acct)

    lines = [
        {
            "lineNumber": 1,
            "itemId": item_id,
            "itemCode": "IDEM-CANCEL",
            "quantity": "2.000",
            "unitCost": "250.00",
            "lineCogs": "500.00",
            "warehouseId": str(uuid.uuid4()),
            "costCenterId": None,
            "sourceSoLineNumber": 1,
        }
    ]
    delivery_event = _make_delivery_event(
        company_code="DN12", lines=lines, total_cogs="500.00"
    )
    resp_post = await client.post(
        _INGEST_URL, json=delivery_event, headers={"X-Service-Secret": _VALID_SECRET}
    )
    assert resp_post.status_code == 200, resp_post.text

    cancel_event_1 = _make_cancellation_event(delivery_event)
    cancel_event_2 = _make_cancellation_event(delivery_event, event_id=str(uuid.uuid4()))

    resp_c1 = await client.post(
        _INGEST_URL, json=cancel_event_1, headers={"X-Service-Secret": _VALID_SECRET}
    )
    assert resp_c1.status_code == 200, resp_c1.text

    resp_c2 = await client.post(
        _INGEST_URL, json=cancel_event_2, headers={"X-Service-Secret": _VALID_SECRET}
    )
    # Second cancellation either returns 200 processed (recorded in outbox table
    # because the event_id is different) but creates no new reversal JE.
    # The idempotency guard in _handle_delivery_cancelled returns early.
    assert resp_c2.status_code == 200, resp_c2.text

    # Exactly one reversal JE
    reversal_count = await db_session.execute(
        select(func.count()).select_from(JournalEntry).where(
            JournalEntry.organizationId == _ORG,
            JournalEntry.companyCode == "DN12",
            JournalEntry.sourceEventType == "delivery_cancelled",
        )
    )
    assert reversal_count.scalar() == 1, "Duplicate cancellation must not create a second reversal JE"
