"""
Tests for T-100.3 — Sale Item Finance Extension API.

Covers:
  1.  Create happy path → 201 + row exists + audit_log row written.
  2.  Create duplicate (orgId, itemId) → 409.
  3.  Update revenueAccountId to a non-revenue account → 422 (type guard).
  4.  Update cogsAccountId to a non-COGS account → 422 (type guard).
  5.  Update salesTaxCode → 200.
  6.  Update isSellable false → 200, item disappears from isSellable=true list.
  7.  Get by itemId → 200 + correct row.
  8.  Get nonexistent itemId → 404.
  9.  List with pagination → 200 + correct page metadata.
  10. Cross-org isolation → empty list for different org.
  11. Delete → 204 + audit_log row written.
  12. Auth: non-finance role → 403 on write endpoints.
  13. Create with revenueAccountId of header account → 422.
  14. Create with cogsAccountId of wrong drawer → 422.
  15. Read role (finance_reviewer) allowed on GET list → 200.
"""

import os
import uuid
from typing import Optional

# Override DB and secrets BEFORE importing any finance module.
# conftest.py (loaded first when running the full suite) already sets these;
# the setdefault calls are no-ops in that case but ensure the file also
# works correctly when run in isolation.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test_secret_key")
os.environ.setdefault("FINANCE_INGESTION_SECRET", "test-ingest-secret")

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from finance.models.orm.models import (
    AccountLevelEnum,
    AccountTypeEnum,
    AuditLog,
    DrawerEnum,
    GLAccount,
    SaleItemFinanceExt,
)

from .conftest import auth_headers

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_ORG = "org-ife-0001"
_ORG_B = "org-ife-0002"
_BASE = "/api/v1/finance/item-finance-ext"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _iid() -> str:
    """Generate a fresh item UUID."""
    return str(uuid.uuid4())


async def _seed_account(
    db: AsyncSession,
    org_id: str,
    number: str,
    drawer: DrawerEnum,
    account_type: AccountTypeEnum,
    is_header: bool = False,
    is_active: bool = True,
) -> str:
    """
    Insert a GL account and return its accountId.

    Args:
        db: Async DB session.
        org_id: Organisation scope.
        number: Account number (unique within org).
        drawer: Account drawer enum value.
        account_type: Account type enum value.
        is_header: Mark as header account (posting target forbidden).
        is_active: Mark as active/inactive.

    Returns:
        accountId string.
    """
    acct_id = str(uuid.uuid4())
    db.add(
        GLAccount(
            accountId=acct_id,
            organizationId=org_id,
            accountNumber=number,
            accountName=f"Test {number}",
            drawer=drawer,
            accountType=account_type,
            isHeader=is_header,
            isControlAccount=False,
            isActive=is_active,
            accountLevel=AccountLevelEnum.DRAWER if is_header else AccountLevelEnum.ACTIVE,
        )
    )
    await db.flush()
    return acct_id


async def _seed_revenue_account(db: AsyncSession, org_id: str, suffix: str = "001") -> str:
    """Seed a valid REVENUE/revenue leaf account."""
    return await _seed_account(
        db, org_id,
        number=f"411000-T{suffix}",
        drawer=DrawerEnum.REVENUE,
        account_type=AccountTypeEnum.REVENUE,
    )


async def _seed_cogs_account(db: AsyncSession, org_id: str, suffix: str = "001") -> str:
    """Seed a valid COST_OF_SALES/expense leaf account."""
    return await _seed_account(
        db, org_id,
        number=f"511000-T{suffix}",
        drawer=DrawerEnum.COST_OF_SALES,
        account_type=AccountTypeEnum.EXPENSE,
    )


async def _create_ext(
    client: AsyncClient,
    org_id: str = _ORG,
    item_id: Optional[str] = None,
    revenue_account_id: Optional[str] = None,
    cogs_account_id: Optional[str] = None,
    sales_tax_code: str = "S",
    is_sellable: bool = True,
) -> dict:
    """
    Helper to POST /item-finance-ext and return the JSON body.

    Raises AssertionError if the status is not 201.
    """
    body: dict = {
        "organizationId": org_id,
        "itemId": item_id or _iid(),
        "salesTaxCode": sales_tax_code,
        "isSellable": is_sellable,
    }
    if revenue_account_id is not None:
        body["revenueAccountId"] = revenue_account_id
    if cogs_account_id is not None:
        body["cogsAccountId"] = cogs_account_id

    resp = await client.post(_BASE, json=body, headers=auth_headers())
    assert resp.status_code == 201, f"Expected 201 got {resp.status_code}: {resp.text}"
    return resp.json()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_happy_path(client: AsyncClient, db_session: AsyncSession) -> None:
    """
    POST /item-finance-ext with valid data returns 201.
    Row persists in DB.  Audit log row is written with event_type=item_finance_ext_created.
    """
    rev_id = await _seed_revenue_account(db_session, _ORG, "c01")
    cogs_id = await _seed_cogs_account(db_session, _ORG, "c01")
    item_id = _iid()

    resp = await client.post(
        _BASE,
        json={
            "organizationId": _ORG,
            "itemId": item_id,
            "itemCode": "VEG-001",
            "itemName": "Fresh Vegetables",
            "revenueAccountId": rev_id,
            "cogsAccountId": cogs_id,
            "salesTaxCode": "S",
            "isSellable": True,
            "notes": "Test item",
        },
        headers=auth_headers(),
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["itemId"] == item_id
    assert data["revenueAccountId"] == rev_id
    assert data["cogsAccountId"] == cogs_id
    assert data["salesTaxCode"] == "S"
    assert data["isSellable"] is True
    assert data["itemCode"] == "VEG-001"

    # Verify row in DB
    db_row = await db_session.scalar(
        select(SaleItemFinanceExt).where(
            SaleItemFinanceExt.organizationId == _ORG,
            SaleItemFinanceExt.itemId == item_id,
        )
    )
    assert db_row is not None
    assert db_row.revenueAccountId == rev_id

    # Verify audit log row
    audit = await db_session.scalar(
        select(AuditLog).where(
            AuditLog.organizationId == _ORG,
            AuditLog.action == "item_finance_ext_created",
            AuditLog.entityId == data["sale_item_finance_ext_id"],
        )
    )
    assert audit is not None
    assert audit.beforeJson is None
    assert audit.afterJson is not None
    assert audit.entityType == "ItemFinanceExt"


@pytest.mark.asyncio
async def test_create_duplicate_returns_409(client: AsyncClient, db_session: AsyncSession) -> None:
    """POST the same (organizationId, itemId) twice returns 409."""
    item_id = _iid()
    body = {"organizationId": _ORG, "itemId": item_id}

    r1 = await client.post(_BASE, json=body, headers=auth_headers())
    assert r1.status_code == 201

    r2 = await client.post(_BASE, json=body, headers=auth_headers())
    assert r2.status_code == 409
    assert "already exists" in r2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_update_revenue_account_to_non_revenue_returns_422(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    PATCH revenueAccountId to a LIABILITIES/liability account must return 422
    with a message indicating drawer=REVENUE is required.
    """
    item_id = _iid()
    await _create_ext(client, item_id=item_id)

    # Seed a liability account (wrong drawer)
    wrong_id = await _seed_account(
        db_session, _ORG, "220000-TW1",
        drawer=DrawerEnum.LIABILITIES,
        account_type=AccountTypeEnum.LIABILITY,
    )

    resp = await client.patch(
        f"{_BASE}/{item_id}",
        json={"revenueAccountId": wrong_id},
        params={"organization_id": _ORG},
        headers=auth_headers(),
    )
    assert resp.status_code == 422, resp.text
    detail = resp.json()["detail"]
    assert "REVENUE" in detail
    assert "revenueAccountId" in detail


@pytest.mark.asyncio
async def test_update_cogs_account_to_wrong_drawer_returns_422(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    PATCH cogsAccountId to an ASSETS/asset account must return 422
    with a message indicating drawer=COST_OF_SALES is required.
    """
    item_id = _iid()
    await _create_ext(client, item_id=item_id)

    # Seed an asset account (wrong drawer)
    wrong_id = await _seed_account(
        db_session, _ORG, "121000-TW2",
        drawer=DrawerEnum.ASSETS,
        account_type=AccountTypeEnum.ASSET,
    )

    resp = await client.patch(
        f"{_BASE}/{item_id}",
        json={"cogsAccountId": wrong_id},
        params={"organization_id": _ORG},
        headers=auth_headers(),
    )
    assert resp.status_code == 422, resp.text
    detail = resp.json()["detail"]
    assert "COST_OF_SALES" in detail
    assert "cogsAccountId" in detail


@pytest.mark.asyncio
async def test_update_sales_tax_code_returns_200(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """PATCH salesTaxCode to a different value → 200, value persisted."""
    item_id = _iid()
    await _create_ext(client, item_id=item_id, sales_tax_code="S")

    resp = await client.patch(
        f"{_BASE}/{item_id}",
        json={"salesTaxCode": "Z"},
        params={"organization_id": _ORG},
        headers=auth_headers(),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["salesTaxCode"] == "Z"


@pytest.mark.asyncio
async def test_update_is_sellable_false_hides_from_filter(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    PATCH isSellable=false → 200.
    GET /item-finance-ext?isSellable=true&organization_id=... must exclude the item.
    GET /item-finance-ext?organization_id=... (no filter) still returns it.
    """
    item_id = _iid()
    await _create_ext(client, item_id=item_id, is_sellable=True)

    # Flip to not sellable
    resp = await client.patch(
        f"{_BASE}/{item_id}",
        json={"isSellable": False},
        params={"organization_id": _ORG},
        headers=auth_headers(),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["isSellable"] is False

    # Filtered list should exclude it
    list_resp = await client.get(
        _BASE,
        params={"organization_id": _ORG, "isSellable": True},
        headers=auth_headers(),
    )
    assert list_resp.status_code == 200
    ids = [r["itemId"] for r in list_resp.json()["items"]]
    assert item_id not in ids

    # Unfiltered list should still include it
    all_resp = await client.get(
        _BASE,
        params={"organization_id": _ORG},
        headers=auth_headers(),
    )
    assert all_resp.status_code == 200
    all_ids = [r["itemId"] for r in all_resp.json()["items"]]
    assert item_id in all_ids


@pytest.mark.asyncio
async def test_get_by_item_id_returns_200(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """GET /item-finance-ext/{item_id}?organization_id=... returns the correct row."""
    rev_id = await _seed_revenue_account(db_session, _ORG, "g01")
    item_id = _iid()
    await _create_ext(client, item_id=item_id, revenue_account_id=rev_id)

    resp = await client.get(
        f"{_BASE}/{item_id}",
        params={"organization_id": _ORG},
        headers=auth_headers(),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["itemId"] == item_id
    assert data["revenueAccountId"] == rev_id


@pytest.mark.asyncio
async def test_get_nonexistent_returns_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """GET /item-finance-ext/{item_id} for an unknown itemId returns 404."""
    resp = await client.get(
        f"{_BASE}/{_iid()}",
        params={"organization_id": _ORG},
        headers=auth_headers(),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_pagination(client: AsyncClient, db_session: AsyncSession) -> None:
    """
    POST three rows then GET /item-finance-ext?page=1&size=2 returns exactly 2
    items and the correct total=3.
    """
    ids = [_iid() for _ in range(3)]
    for iid in ids:
        await _create_ext(client, item_id=iid)

    resp = await client.get(
        _BASE,
        params={"organization_id": _ORG, "page": 1, "size": 2},
        headers=auth_headers(),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["items"]) == 2
    assert body["total"] >= 3


@pytest.mark.asyncio
async def test_cross_org_isolation(client: AsyncClient, db_session: AsyncSession) -> None:
    """
    An item finance ext created in org A is invisible to a list request for org B.
    """
    item_id = _iid()
    await _create_ext(client, org_id=_ORG, item_id=item_id)

    resp = await client.get(
        _BASE,
        params={"organization_id": _ORG_B},
        headers=auth_headers(),
    )
    assert resp.status_code == 200
    ids = [r["itemId"] for r in resp.json()["items"]]
    assert item_id not in ids


@pytest.mark.asyncio
async def test_delete_returns_204_and_writes_audit(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    DELETE /item-finance-ext/{item_id}?organization_id=... returns 204.
    An audit_log row with event_type=item_finance_ext_deleted is written.
    Row is removed from DB.
    """
    item_id = _iid()
    create_resp = await _create_ext(client, item_id=item_id)
    ext_id = create_resp["data"]["sale_item_finance_ext_id"]

    resp = await client.delete(
        f"{_BASE}/{item_id}",
        params={"organization_id": _ORG},
        headers=auth_headers(),
    )
    assert resp.status_code == 204, resp.text

    # Row gone from DB
    db_row = await db_session.scalar(
        select(SaleItemFinanceExt).where(
            SaleItemFinanceExt.organizationId == _ORG,
            SaleItemFinanceExt.itemId == item_id,
        )
    )
    assert db_row is None

    # Audit log row present
    audit = await db_session.scalar(
        select(AuditLog).where(
            AuditLog.action == "item_finance_ext_deleted",
            AuditLog.entityId == ext_id,
        )
    )
    assert audit is not None
    assert audit.beforeJson is not None
    assert audit.afterJson is None


@pytest.mark.asyncio
async def test_write_endpoints_require_finance_role(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    A user with role 'viewer' (not in _WRITE_ROLES) must receive 403
    on POST / PATCH / DELETE.
    """
    item_id = _iid()
    # First create as admin so PATCH / DELETE have a row to target
    await _create_ext(client, item_id=item_id)

    non_finance_headers = auth_headers(role="viewer")

    post_resp = await client.post(
        _BASE,
        json={"organizationId": _ORG, "itemId": _iid()},
        headers=non_finance_headers,
    )
    assert post_resp.status_code == 403

    patch_resp = await client.patch(
        f"{_BASE}/{item_id}",
        json={"salesTaxCode": "Z"},
        params={"organization_id": _ORG},
        headers=non_finance_headers,
    )
    assert patch_resp.status_code == 403

    delete_resp = await client.delete(
        f"{_BASE}/{item_id}",
        params={"organization_id": _ORG},
        headers=non_finance_headers,
    )
    assert delete_resp.status_code == 403


@pytest.mark.asyncio
async def test_create_revenue_header_account_returns_422(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """POST with revenueAccountId pointing to a header account must return 422."""
    header_id = await _seed_account(
        db_session, _ORG, "411000-TH1",
        drawer=DrawerEnum.REVENUE,
        account_type=AccountTypeEnum.REVENUE,
        is_header=True,
    )
    resp = await client.post(
        _BASE,
        json={
            "organizationId": _ORG,
            "itemId": _iid(),
            "revenueAccountId": header_id,
        },
        headers=auth_headers(),
    )
    assert resp.status_code == 422, resp.text
    assert "header" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_cogs_wrong_drawer_returns_422(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """POST with cogsAccountId from OPERATING_COST drawer must return 422."""
    # Reason: OPERATING_COST/expense is a valid combination but NOT allowed for
    # cogsAccountId — must be COST_OF_SALES/expense specifically.
    wrong_id = await _seed_account(
        db_session, _ORG, "620000-TW3",
        drawer=DrawerEnum.OPERATING_COST,
        account_type=AccountTypeEnum.EXPENSE,
    )
    resp = await client.post(
        _BASE,
        json={
            "organizationId": _ORG,
            "itemId": _iid(),
            "cogsAccountId": wrong_id,
        },
        headers=auth_headers(),
    )
    assert resp.status_code == 422, resp.text
    assert "COST_OF_SALES" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_finance_reviewer_can_list(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    A user with role 'finance_reviewer' (read-only role) must receive 200
    on GET /item-finance-ext.
    """
    resp = await client.get(
        _BASE,
        params={"organization_id": _ORG},
        headers=auth_headers(role="finance_reviewer"),
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_noop_patch_skips_audit(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    PATCH with no actual value changes must return 200 but NOT write an
    audit_log row (no-op guard mirrors T-100.2 behaviour).
    """
    item_id = _iid()
    create_data = await _create_ext(client, item_id=item_id, sales_tax_code="S")
    ext_id = create_data["data"]["sale_item_finance_ext_id"]

    # Count audit rows BEFORE the no-op patch
    from sqlalchemy import func as sqlfunc
    count_result = await db_session.execute(
        select(sqlfunc.count()).select_from(AuditLog).where(AuditLog.entityId == ext_id)
    )
    before_count = count_result.scalar() or 0

    # No-op patch: salesTaxCode is already "S"
    resp = await client.patch(
        f"{_BASE}/{item_id}",
        json={"salesTaxCode": "S"},
        params={"organization_id": _ORG},
        headers=auth_headers(),
    )
    assert resp.status_code == 200

    # Audit count should be unchanged (still 1 from create)
    count_result2 = await db_session.execute(
        select(sqlfunc.count()).select_from(AuditLog).where(AuditLog.entityId == ext_id)
    )
    after_count = count_result2.scalar() or 0
    # create wrote 1 row; noop should not add another
    assert after_count == before_count
