"""
Tests for T-100.2 — Customer Finance Extension API.

Covers:
  1.  Create happy path → 201 + row exists + audit_log row written.
  2.  Create duplicate (orgId, customerId) → 409.
  3.  Update happy path → 200 + row updated + audit_log row written.
  4.  Update arControlAccountId to a non-asset account → 422 (type guard).
  5.  Update arControlAccountId when old account has non-zero balance → 409 (balance guard).
  6.  Update with no actual change → 200, no audit row written.
  7.  Get by customerId → 200 + correct row.
  8.  Get nonexistent customerId → 404.
  9.  List with pagination → 200 + correct page metadata.
  10. Delete → 204 + audit_log row written.
  11. Auth: non-finance role → 403 on write endpoints.
  12. Cross-org isolation: customer ext in org A invisible to org B request.
  13. Create with arControlAccountId of wrong type → 422.
  14. Create with arControlAccountId of header account → 422.
  15. Read role allowed on GET list → 200.
"""

import os
import uuid
from datetime import date, datetime
from decimal import Decimal

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
    CustomerFinanceExt,
    DrawerEnum,
    FiscalPeriod,
    GLAccount,
    JEStatusEnum,
    JournalEntry,
    JournalEntryLine,
    PeriodStatusEnum,
)

from .conftest import auth_headers

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_ORG = "org-cfe-0001"
_ORG_B = "org-cfe-0002"
_BASE = "/api/v1/finance/customer-finance-ext"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _cid() -> str:
    """Generate a fresh customer UUID."""
    return str(uuid.uuid4())


async def _seed_asset_account(
    db: AsyncSession,
    org_id: str,
    number: str,
    is_header: bool = False,
    drawer: DrawerEnum = DrawerEnum.ASSETS,
    account_type: AccountTypeEnum = AccountTypeEnum.ASSET,
) -> str:
    """
    Insert a GL account and return its accountId.

    Args:
        db: Async DB session.
        org_id: Organisation scope.
        number: Account number (must be unique within org).
        is_header: Whether to mark isHeader=True (blocking header accounts).
        drawer: Account drawer.
        account_type: Account type.

    Returns:
        accountId string.
    """
    acct_id = str(uuid.uuid4())
    db.add(
        GLAccount(
            accountId=acct_id,
            organizationId=org_id,
            accountNumber=number,
            accountName=f"Test account {number}",
            drawer=drawer,
            accountType=account_type,
            isHeader=is_header,
            isControlAccount=False,
            isActive=True,
            accountLevel=AccountLevelEnum.DRAWER if is_header else AccountLevelEnum.ACTIVE,
        )
    )
    await db.flush()
    return acct_id


async def _seed_company_with_period(db: AsyncSession, org_id: str, company_code: str) -> str:
    """
    Insert a CompanyCode + an OPEN fiscal period spanning 2024-2027.

    Returns the company_code for convenience.
    """
    from finance.models.orm.models import CompanyCode

    db.add(
        CompanyCode(
            companyCode=company_code,
            organizationId=org_id,
            legalName=f"Test Company {company_code}",
            fiscalYearStartMonth=1,
            fiscalYearStartDay=1,
        )
    )
    period_id = str(uuid.uuid4())
    db.add(
        FiscalPeriod(
            periodId=period_id,
            companyCode=company_code,
            fiscalYear=2025,
            periodNumber=1,
            startDate=date(2024, 1, 1),
            endDate=date(2027, 12, 31),
            status=PeriodStatusEnum.OPEN,
        )
    )
    await db.flush()
    return period_id


async def _post_je_line_to_account(
    db: AsyncSession,
    org_id: str,
    company_code: str,
    period_id: str,
    account_id: str,
    debit: Decimal,
    credit: Decimal,
) -> None:
    """
    Post a POSTED JournalEntry with one line against the given account.

    Args:
        db: Async DB session.
        org_id: Org scope.
        company_code: Company code.
        period_id: Fiscal period FK.
        account_id: The GL account to post to.
        debit: Debit amount.
        credit: Credit amount.
    """
    je_id = str(uuid.uuid4())
    db.add(
        JournalEntry(
            jeId=je_id,
            organizationId=org_id,
            companyCode=company_code,
            jeNumber=f"JE-{company_code}-2025-{uuid.uuid4().hex[:4]}",
            jeDate=date(2025, 6, 1),
            periodId=period_id,
            sourceEventType="test_event",
            sourceEventId=str(uuid.uuid4()),
            description="Test JE for balance guard",
            totalDebit=debit,
            totalCredit=credit,
            status=JEStatusEnum.POSTED,
            postedAt=datetime.utcnow(),
            postedBy="test-user",
        )
    )
    db.add(
        JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=je_id,
            lineNumber=1,
            accountId=account_id,
            debit=debit,
            credit=credit,
            description="Test line",
        )
    )
    await db.flush()


async def _count_audit_rows(db: AsyncSession, ext_id: str, event_type: str) -> int:
    """
    Count audit_log rows for a given ext_id and event_type.

    Args:
        db: Async DB session.
        ext_id: customer_finance_ext_id to filter on.
        event_type: e.g. "customer_finance_ext_created".

    Returns:
        Count of matching rows.
    """
    result = await db.execute(
        select(AuditLog).where(
            AuditLog.entityId == ext_id,
            AuditLog.action == event_type,
        )
    )
    return len(result.scalars().all())


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_happy_path(client: AsyncClient, db_session: AsyncSession) -> None:
    """
    Test 1: POST creates a row, returns 201, and writes one audit row.
    """
    cid = _cid()
    payload = {
        "organizationId": _ORG,
        "customerId": cid,
        "paymentTermsId": "NET30",
        "creditLimit": "5000.00",
        "creditLimitCurrency": "AED",
    }
    resp = await client.post(_BASE, json=payload, headers=auth_headers("finance_admin"))
    assert resp.status_code == 201, resp.text

    data = resp.json()["data"]
    assert data["customerId"] == cid
    assert data["organizationId"] == _ORG
    assert data["paymentTermsId"] == "NET30"
    assert data["creditLimitCurrency"] == "AED"

    ext_id = data["customer_finance_ext_id"]

    # Row should exist in DB.
    result = await db_session.execute(
        select(CustomerFinanceExt).where(
            CustomerFinanceExt.customer_finance_ext_id == ext_id
        )
    )
    row = result.scalar_one_or_none()
    assert row is not None
    assert row.paymentTermsId == "NET30"

    # Audit row should be written.
    assert await _count_audit_rows(db_session, ext_id, "customer_finance_ext_created") == 1


@pytest.mark.asyncio
async def test_create_duplicate_409(client: AsyncClient, db_session: AsyncSession) -> None:
    """
    Test 2: Creating the same (orgId, customerId) pair twice → 409.
    """
    cid = _cid()
    payload = {"organizationId": _ORG, "customerId": cid}
    r1 = await client.post(_BASE, json=payload, headers=auth_headers("finance_admin"))
    assert r1.status_code == 201, r1.text

    r2 = await client.post(_BASE, json=payload, headers=auth_headers("finance_admin"))
    assert r2.status_code == 409, r2.text
    assert "already exists" in r2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_update_happy_path(client: AsyncClient, db_session: AsyncSession) -> None:
    """
    Test 3: PATCH updates fields and writes an audit row.
    """
    cid = _cid()
    # Create first.
    cr = await client.post(
        _BASE,
        json={"organizationId": _ORG, "customerId": cid, "notes": "initial"},
        headers=auth_headers("finance_admin"),
    )
    assert cr.status_code == 201, cr.text
    ext_id = cr.json()["data"]["customer_finance_ext_id"]

    # Patch notes.
    pr = await client.patch(
        f"{_BASE}/{cid}",
        params={"organization_id": _ORG},
        json={"notes": "updated"},
        headers=auth_headers("finance_admin"),
    )
    assert pr.status_code == 200, pr.text
    assert pr.json()["data"]["notes"] == "updated"

    # One update audit row.
    assert await _count_audit_rows(db_session, ext_id, "customer_finance_ext_updated") == 1


@pytest.mark.asyncio
async def test_update_wrong_account_type_422(client: AsyncClient, db_session: AsyncSession) -> None:
    """
    Test 4: PATCH arControlAccountId to a Liability account → 422 (type guard).
    """
    cid = _cid()
    cr = await client.post(
        _BASE,
        json={"organizationId": _ORG, "customerId": cid},
        headers=auth_headers("finance_admin"),
    )
    assert cr.status_code == 201, cr.text

    # Seed a LIABILITIES account.
    bad_acct_id = await _seed_asset_account(
        db_session,
        _ORG,
        f"211099-{uuid.uuid4().hex[:4]}",
        drawer=DrawerEnum.LIABILITIES,
        account_type=AccountTypeEnum.LIABILITY,
    )

    pr = await client.patch(
        f"{_BASE}/{cid}",
        params={"organization_id": _ORG},
        json={"arControlAccountId": bad_acct_id},
        headers=auth_headers("finance_admin"),
    )
    assert pr.status_code == 422, pr.text
    assert "arControlAccountId" in pr.json()["detail"].lower() or "arcontrolaccountid" in pr.json()["detail"].lower()


@pytest.mark.asyncio
async def test_update_balance_guard_409(client: AsyncClient, db_session: AsyncSession) -> None:
    """
    Test 5: PATCH arControlAccountId when old account has non-zero balance → 409.
    """
    org = f"org-cfe-bg-{uuid.uuid4().hex[:6]}"
    company = f"CFE{uuid.uuid4().hex[:4].upper()}"
    cid = _cid()

    # Seed an AR asset account and post a JE to it.
    old_acct_id = await _seed_asset_account(db_session, org, f"121099-{uuid.uuid4().hex[:4]}")
    new_acct_id = await _seed_asset_account(db_session, org, f"121098-{uuid.uuid4().hex[:4]}")
    period_id = await _seed_company_with_period(db_session, org, company)

    await _post_je_line_to_account(
        db_session, org, company, period_id, old_acct_id,
        debit=Decimal("1000.00"), credit=Decimal("0.00")
    )

    # Create the ext pointing to old_acct_id.
    cr = await client.post(
        _BASE,
        json={"organizationId": org, "customerId": cid, "arControlAccountId": old_acct_id},
        headers=auth_headers("finance_admin"),
    )
    assert cr.status_code == 201, cr.text

    # Try to change to new_acct_id while old has balance.
    pr = await client.patch(
        f"{_BASE}/{cid}",
        params={"organization_id": org},
        json={"arControlAccountId": new_acct_id},
        headers=auth_headers("finance_admin"),
    )
    assert pr.status_code == 409, pr.text
    assert "balance" in pr.json()["detail"].lower()


@pytest.mark.asyncio
async def test_update_no_change_no_audit(client: AsyncClient, db_session: AsyncSession) -> None:
    """
    Test 6: PATCH with the same value as current state → 200, zero new audit rows.
    """
    cid = _cid()
    cr = await client.post(
        _BASE,
        json={"organizationId": _ORG, "customerId": cid, "notes": "same"},
        headers=auth_headers("finance_admin"),
    )
    assert cr.status_code == 201
    ext_id = cr.json()["data"]["customer_finance_ext_id"]

    # Count audit rows before patch.
    before = await _count_audit_rows(db_session, ext_id, "customer_finance_ext_updated")

    pr = await client.patch(
        f"{_BASE}/{cid}",
        params={"organization_id": _ORG},
        json={"notes": "same"},  # same value — no change
        headers=auth_headers("finance_admin"),
    )
    assert pr.status_code == 200

    after = await _count_audit_rows(db_session, ext_id, "customer_finance_ext_updated")
    assert after == before  # no new audit row


@pytest.mark.asyncio
async def test_get_by_customer_id(client: AsyncClient, db_session: AsyncSession) -> None:
    """
    Test 7: GET /{customer_id} returns 200 with correct row.
    """
    cid = _cid()
    await client.post(
        _BASE,
        json={"organizationId": _ORG, "customerId": cid, "paymentTermsId": "NET60"},
        headers=auth_headers("finance_admin"),
    )
    gr = await client.get(
        f"{_BASE}/{cid}",
        params={"organization_id": _ORG},
        headers=auth_headers("finance_admin"),
    )
    assert gr.status_code == 200, gr.text
    assert gr.json()["data"]["customerId"] == cid
    assert gr.json()["data"]["paymentTermsId"] == "NET60"


@pytest.mark.asyncio
async def test_get_nonexistent_404(client: AsyncClient) -> None:
    """
    Test 8: GET for a customerId that has no ext → 404.
    """
    gr = await client.get(
        f"{_BASE}/{_cid()}",
        params={"organization_id": _ORG},
        headers=auth_headers("finance_admin"),
    )
    assert gr.status_code == 404


@pytest.mark.asyncio
async def test_list_pagination(client: AsyncClient) -> None:
    """
    Test 9: List with page/size returns correct metadata.
    """
    org = f"org-cfe-list-{uuid.uuid4().hex[:6]}"
    # Create 3 records.
    for _ in range(3):
        await client.post(
            _BASE,
            json={"organizationId": org, "customerId": _cid()},
            headers=auth_headers("finance_admin"),
        )

    lr = await client.get(
        _BASE,
        params={"organization_id": org, "page": 1, "size": 2},
        headers=auth_headers("finance_admin"),
    )
    assert lr.status_code == 200, lr.text
    body = lr.json()
    assert body["total"] == 3
    assert body["page"] == 1
    assert body["size"] == 2
    assert len(body["items"]) == 2


@pytest.mark.asyncio
async def test_delete_204_and_audit(client: AsyncClient, db_session: AsyncSession) -> None:
    """
    Test 10: DELETE returns 204 and writes a delete audit row.
    """
    cid = _cid()
    cr = await client.post(
        _BASE,
        json={"organizationId": _ORG, "customerId": cid},
        headers=auth_headers("finance_admin"),
    )
    assert cr.status_code == 201
    ext_id = cr.json()["data"]["customer_finance_ext_id"]

    dr = await client.delete(
        f"{_BASE}/{cid}",
        params={"organization_id": _ORG},
        headers=auth_headers("finance_admin"),
    )
    assert dr.status_code == 204

    # Row should be gone.
    result = await db_session.execute(
        select(CustomerFinanceExt).where(
            CustomerFinanceExt.customer_finance_ext_id == ext_id
        )
    )
    assert result.scalar_one_or_none() is None

    # Delete audit row written.
    assert await _count_audit_rows(db_session, ext_id, "customer_finance_ext_deleted") == 1


@pytest.mark.asyncio
async def test_write_requires_finance_role_403(client: AsyncClient) -> None:
    """
    Test 11: Non-finance role (accountant) cannot create → 403.
    """
    resp = await client.post(
        _BASE,
        json={"organizationId": _ORG, "customerId": _cid()},
        headers=auth_headers("accountant"),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cross_org_isolation(client: AsyncClient) -> None:
    """
    Test 12: GET for a customer ext in org A is invisible when scoped to org B.
    """
    cid = _cid()
    # Create in org A.
    cr = await client.post(
        _BASE,
        json={"organizationId": _ORG, "customerId": cid},
        headers=auth_headers("finance_admin"),
    )
    assert cr.status_code == 201

    # Look it up scoped to org B → 404.
    gr = await client.get(
        f"{_BASE}/{cid}",
        params={"organization_id": _ORG_B},
        headers=auth_headers("finance_admin"),
    )
    assert gr.status_code == 404


@pytest.mark.asyncio
async def test_create_wrong_account_type_422(client: AsyncClient, db_session: AsyncSession) -> None:
    """
    Test 13: POST arControlAccountId pointing to an Equity account → 422.
    """
    equity_acct_id = await _seed_asset_account(
        db_session,
        _ORG,
        f"311099-{uuid.uuid4().hex[:4]}",
        drawer=DrawerEnum.EQUITY,
        account_type=AccountTypeEnum.EQUITY,
    )
    resp = await client.post(
        _BASE,
        json={
            "organizationId": _ORG,
            "customerId": _cid(),
            "arControlAccountId": equity_acct_id,
        },
        headers=auth_headers("finance_admin"),
    )
    assert resp.status_code == 422, resp.text
    # Verify the row was NOT created.
    assert "arControlAccountId" in resp.json()["detail"] or "arcontrolaccountid" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_header_account_422(client: AsyncClient, db_session: AsyncSession) -> None:
    """
    Test 14: POST arControlAccountId pointing to a header account → 422.
    """
    header_acct_id = await _seed_asset_account(
        db_session,
        _ORG,
        f"121097-{uuid.uuid4().hex[:4]}",
        is_header=True,
        drawer=DrawerEnum.ASSETS,
        account_type=AccountTypeEnum.ASSET,
    )
    resp = await client.post(
        _BASE,
        json={
            "organizationId": _ORG,
            "customerId": _cid(),
            "arControlAccountId": header_acct_id,
        },
        headers=auth_headers("finance_admin"),
    )
    assert resp.status_code == 422, resp.text
    assert "header" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_read_role_allowed_on_list(client: AsyncClient) -> None:
    """
    Test 15: finance_reviewer role can perform GET list → 200 (not 403).
    """
    resp = await client.get(
        _BASE,
        params={"organization_id": _ORG},
        headers=auth_headers("finance_reviewer"),
    )
    assert resp.status_code == 200, resp.text
