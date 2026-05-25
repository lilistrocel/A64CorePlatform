"""Tests for Journal Entry read-only API endpoints."""

import uuid
from datetime import date, datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from .conftest import auth_headers

_ORG = "org-je-test"
_COMPANY_CODE = "JE001"


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


async def _seed_company(client: AsyncClient, code: str = _COMPANY_CODE) -> None:
    """Create a company (seeds CoA + fiscal periods via existing endpoint)."""
    resp = await client.post(
        "/api/v1/finance/companies",
        json={
            "companyCode": code,
            "organizationId": _ORG,
            "legalName": "JE Test Company LLC",
        },
        headers=auth_headers(),
    )
    # 201 on first call; 409 on repeat (test isolation uses shared SQLite state)
    assert resp.status_code in (201, 409)


async def _get_account_id(db_session: AsyncSession, organization_id: str) -> str:
    """
    Return the accountId of the first active GL account for the given org.

    The CoA is seeded when the company is created so there will always be at
    least one account after _seed_company runs.
    """
    from sqlalchemy import select

    from finance.models.orm.models import GLAccount

    result = await db_session.execute(
        select(GLAccount.accountId)
        .where(
            GLAccount.organizationId == organization_id,
            GLAccount.isActive == True,  # noqa: E712
        )
        .limit(1)
    )
    account_id = result.scalar_one_or_none()
    assert account_id is not None, "No active GL account found — CoA seed must have run first"
    return account_id


async def _ensure_period(db_session: AsyncSession, company_code: str) -> str:
    """
    Return an existing fiscal periodId for the company, or create one if none exist.

    seed_company_defaults seeds CoA + tax codes but not fiscal periods.
    Tests that require a periodId must call this helper.
    """
    from datetime import date

    from sqlalchemy import select

    from finance.models.orm.models import FiscalPeriod, PeriodStatusEnum

    result = await db_session.execute(
        select(FiscalPeriod.periodId)
        .where(FiscalPeriod.companyCode == company_code)
        .limit(1)
    )
    period_id = result.scalar_one_or_none()
    if period_id is not None:
        return period_id

    # Create a test fiscal period directly via ORM.
    period = FiscalPeriod(
        periodId=str(uuid.uuid4()),
        companyCode=company_code,
        fiscalYear=2026,
        periodNumber=1,
        startDate=date(2026, 1, 1),
        endDate=date(2026, 1, 31),
        status=PeriodStatusEnum.OPEN,
    )
    db_session.add(period)
    await db_session.flush()
    return period.periodId


async def _create_je_via_orm(
    db_session: AsyncSession,
    organization_id: str,
    company_code: str,
    account_id: str,
    period_id: str,
    je_suffix: str = "0001",
) -> str:
    """
    Insert a JE + 2 lines directly via ORM (simulates what the Phase B
    posting handler will do).  Returns the jeId.
    """
    from finance.models.orm.models import JEStatusEnum, JournalEntry, JournalEntryLine

    je_id = str(uuid.uuid4())
    je = JournalEntry(
        jeId=je_id,
        organizationId=organization_id,
        companyCode=company_code,
        jeNumber=f"JE-{company_code}-2026-{je_suffix}",
        jeDate=date(2026, 1, 15),
        periodId=period_id,
        sourceEventType="purchase_received",
        sourceEventId=str(uuid.uuid4()),
        sourceDocId=str(uuid.uuid4()),
        sourceDocNumber="GR-2026-0001",
        description="Test JE for unit test",
        totalDebit=1000.00,
        totalCredit=1000.00,
        status=JEStatusEnum.POSTED,
        postedAt=datetime.now(timezone.utc),
        postedBy="system",
    )
    db_session.add(je)

    line1 = JournalEntryLine(
        jeLineId=str(uuid.uuid4()),
        jeId=je_id,
        lineNumber=1,
        accountId=account_id,
        debit=1000.00,
        credit=None,
        description="DR Inventory",
    )
    line2 = JournalEntryLine(
        jeLineId=str(uuid.uuid4()),
        jeId=je_id,
        lineNumber=2,
        accountId=account_id,
        debit=None,
        credit=1000.00,
        description="CR GR/IR Clearing",
    )
    db_session.add(line1)
    db_session.add(line2)
    await db_session.flush()
    return je_id


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_je_empty_when_none_exist(client: AsyncClient) -> None:
    """
    GET /journal-entries returns empty list when no JEs exist for the org.
    """
    response = await client.get(
        "/api/v1/finance/journal-entries",
        params={"organization_id": "org-that-has-no-jes"},
        headers=auth_headers(role="auditor"),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert data["items"] == []


@pytest.mark.asyncio
async def test_create_je_via_orm_and_fetch_via_api(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Insert a JE + 2 lines directly via ORM, then verify:
    - GET /journal-entries returns the entry in the list.
    - GET /journal-entries/{je_id} returns the entry with lines populated.
    """
    await _seed_company(client)
    account_id = await _get_account_id(db_session, _ORG)
    period_id = await _ensure_period(db_session, _COMPANY_CODE)

    je_id = await _create_je_via_orm(
        db_session, _ORG, _COMPANY_CODE, account_id, period_id
    )

    # --- List endpoint ---
    list_resp = await client.get(
        "/api/v1/finance/journal-entries",
        params={"organization_id": _ORG},
        headers=auth_headers(role="auditor"),
    )
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert list_data["total"] >= 1
    je_ids_in_list = [item["jeId"] for item in list_data["items"]]
    assert je_id in je_ids_in_list

    # --- Detail endpoint ---
    detail_resp = await client.get(
        f"/api/v1/finance/journal-entries/{je_id}",
        params={"organization_id": _ORG},
        headers=auth_headers(role="auditor"),
    )
    assert detail_resp.status_code == 200
    entry = detail_resp.json()["data"]

    # Shape assertions
    assert entry["jeId"] == je_id
    assert entry["organizationId"] == _ORG
    assert entry["companyCode"] == _COMPANY_CODE
    assert entry["sourceEventType"] == "purchase_received"
    assert entry["status"] == "posted"
    assert float(entry["totalDebit"]) == 1000.0
    assert float(entry["totalCredit"]) == 1000.0

    # Lines populated
    assert len(entry["lines"]) == 2
    line_numbers = sorted(line["lineNumber"] for line in entry["lines"])
    assert line_numbers == [1, 2]

    # One DR line, one CR line
    dr_lines = [l for l in entry["lines"] if l["debit"] is not None]
    cr_lines = [l for l in entry["lines"] if l["credit"] is not None]
    assert len(dr_lines) == 1
    assert len(cr_lines) == 1
    assert float(dr_lines[0]["debit"]) == 1000.0
    assert float(cr_lines[0]["credit"]) == 1000.0


@pytest.mark.asyncio
async def test_get_je_not_found(client: AsyncClient) -> None:
    """GET /journal-entries/{id} for unknown UUID returns 404."""
    resp = await client.get(
        f"/api/v1/finance/journal-entries/{uuid.uuid4()}",
        params={"organization_id": _ORG},
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_je_wrong_org_returns_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    GET /journal-entries/{id} with a different org_id returns 404
    (cross-org isolation).
    """
    await _seed_company(client)
    account_id = await _get_account_id(db_session, _ORG)
    period_id = await _ensure_period(db_session, _COMPANY_CODE)

    je_id = await _create_je_via_orm(
        db_session, _ORG, _COMPANY_CODE, account_id, period_id, je_suffix="0002"
    )

    resp = await client.get(
        f"/api/v1/finance/journal-entries/{je_id}",
        params={"organization_id": "org-different"},
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_je_filter_by_source_event_type(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    GET /journal-entries with source_event_type filter returns only matching entries.
    """
    await _seed_company(client)
    account_id = await _get_account_id(db_session, _ORG)
    period_id = await _ensure_period(db_session, _COMPANY_CODE)

    await _create_je_via_orm(
        db_session, _ORG, _COMPANY_CODE, account_id, period_id, je_suffix="0003"
    )

    resp = await client.get(
        "/api/v1/finance/journal-entries",
        params={
            "organization_id": _ORG,
            "source_event_type": "purchase_received",
        },
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    for item in items:
        assert item["sourceEventType"] == "purchase_received"

    # Non-matching type should return empty
    resp2 = await client.get(
        "/api/v1/finance/journal-entries",
        params={
            "organization_id": _ORG,
            "source_event_type": "vendor_payment",
        },
        headers=auth_headers(role="auditor"),
    )
    assert resp2.status_code == 200
    assert resp2.json()["total"] == 0
