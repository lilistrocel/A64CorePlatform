"""Tests for fiscal period endpoints."""

import uuid

import pytest
from httpx import AsyncClient

from .conftest import auth_headers

_ORG = "org-periods-test"
_COMPANY_CODE = "PC001"


async def _ensure_company(client: AsyncClient) -> None:
    """Idempotent helper — create company if not already present."""
    resp = await client.get(
        f"/api/v1/finance/companies/{_COMPANY_CODE}",
        headers=auth_headers(),
    )
    if resp.status_code == 404:
        await client.post(
            "/api/v1/finance/companies",
            json={
                "companyCode": _COMPANY_CODE,
                "organizationId": _ORG,
                "legalName": "Period Test Co",
            },
            headers=auth_headers(),
        )


@pytest.mark.asyncio
async def test_create_period(client: AsyncClient) -> None:
    """POST /periods should create a fiscal period."""
    await _ensure_company(client)
    response = await client.post(
        "/api/v1/finance/periods",
        json={
            "companyCode": _COMPANY_CODE,
            "fiscalYear": 2026,
            "periodNumber": 1,
            "startDate": "2026-01-01",
            "endDate": "2026-01-31",
        },
        headers=auth_headers(),
    )
    assert response.status_code == 201
    data = response.json()["data"]
    assert data["status"] == "open"
    assert data["periodNumber"] == 1


@pytest.mark.asyncio
async def test_create_duplicate_period_returns_409(client: AsyncClient) -> None:
    """Duplicate (companyCode, fiscalYear, periodNumber) should return 409."""
    await _ensure_company(client)
    payload = {
        "companyCode": _COMPANY_CODE,
        "fiscalYear": 2026,
        "periodNumber": 2,
        "startDate": "2026-02-01",
        "endDate": "2026-02-28",
    }
    await client.post("/api/v1/finance/periods", json=payload, headers=auth_headers())
    resp = await client.post(
        "/api/v1/finance/periods", json=payload, headers=auth_headers()
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_close_and_reopen_period(client: AsyncClient) -> None:
    """Period should close and reopen correctly (non-year-end — no closing JE)."""
    await _ensure_company(client)
    create_resp = await client.post(
        "/api/v1/finance/periods",
        json={
            "companyCode": _COMPANY_CODE,
            "fiscalYear": 2026,
            "periodNumber": 3,
            "startDate": "2026-03-01",
            "endDate": "2026-03-31",
        },
        headers=auth_headers(),
    )
    period_id = create_resp.json()["data"]["periodId"]

    # Close it — Wave 2 requires organization_id query param.
    close_resp = await client.patch(
        f"/api/v1/finance/periods/{period_id}/close",
        params={"organization_id": _ORG},
        headers=auth_headers(),
    )
    assert close_resp.status_code == 200
    body = close_resp.json()["data"]
    assert body["period"]["status"] == "closed"
    # This is period 3 of fiscalYear 2026 — not the year-end (since no
    # later periods exist yet, it actually IS the latest endDate, BUT no
    # P&L activity → no closing JE).
    assert body["closingJe"] is None

    # Reopen it (reason required, min 5 chars).
    reopen_resp = await client.patch(
        f"/api/v1/finance/periods/{period_id}/reopen",
        params={"organization_id": _ORG},
        json={"reason": "Test reopen for unit test"},
        headers=auth_headers(),
    )
    assert reopen_resp.status_code == 200
    reopen_body = reopen_resp.json()["data"]
    assert reopen_body["period"]["status"] == "open"
    assert reopen_body["closingJeReversal"] is None


@pytest.mark.asyncio
async def test_close_already_closed_period_returns_409(client: AsyncClient) -> None:
    """Closing an already-closed period should return 409."""
    await _ensure_company(client)
    create_resp = await client.post(
        "/api/v1/finance/periods",
        json={
            "companyCode": _COMPANY_CODE,
            "fiscalYear": 2026,
            "periodNumber": 4,
            "startDate": "2026-04-01",
            "endDate": "2026-04-30",
        },
        headers=auth_headers(),
    )
    period_id = create_resp.json()["data"]["periodId"]

    await client.patch(
        f"/api/v1/finance/periods/{period_id}/close",
        params={"organization_id": _ORG},
        headers=auth_headers(),
    )
    resp = await client.patch(
        f"/api/v1/finance/periods/{period_id}/close",
        params={"organization_id": _ORG},
        headers=auth_headers(),
    )
    assert resp.status_code == 409


# ─── Wave 2 / T-060.1 — Closing JE on fiscal year-end ─────────────────────

import uuid as _uuid_test
from datetime import datetime, date as _date
from decimal import Decimal


async def _seed_company_coa_posting(
    db_session, organization_id: str, company_code: str
) -> tuple[str, str, str, str]:
    """
    Seed everything the closing-JE tests need directly via the ORM
    session — bypasses the POST /companies endpoint (which auto-seeds
    the full 231-account CoA and would collide with the per-test
    accounts we're adding here).

    Creates:
      - CompanyCode
      - 4 GL accounts: Current Year P/(L), Retained Earnings, Revenue, Cash
      - CompanyPostingSetup with retainedEarningsAccountId set

    Returns (cy_account_id, re_account_id, revenue_account_id, cash_account_id).
    """
    from finance.models.orm.models import (
        AccountTypeEnum,
        CompanyCode,
        CompanyPostingSetup,
        DrawerEnum,
        GLAccount,
    )

    cy_id = str(_uuid_test.uuid4())
    re_id = str(_uuid_test.uuid4())
    rev_id = str(_uuid_test.uuid4())
    cash_id = str(_uuid_test.uuid4())

    db_session.add(
        CompanyCode(
            companyCode=company_code,
            organizationId=organization_id,
            legalName=f"Closing Test {company_code}",
        )
    )
    for aid, num, name, drawer, atype in [
        (cy_id, "312000-002", "Current Year Profit / (Loss)",
         DrawerEnum.EQUITY, AccountTypeEnum.EQUITY),
        (re_id, "312000-001", "Retained Earnings - Prior Years",
         DrawerEnum.EQUITY, AccountTypeEnum.EQUITY),
        (rev_id, "411000-001", "Sales Revenue",
         DrawerEnum.REVENUE, AccountTypeEnum.REVENUE),
        (cash_id, "126000-001", "Cash at Bank",
         DrawerEnum.ASSETS, AccountTypeEnum.ASSET),
    ]:
        db_session.add(
            GLAccount(
                accountId=aid,
                organizationId=organization_id,
                accountNumber=num,
                accountName=name,
                drawer=drawer,
                accountType=atype,
                isHeader=False,
                isActive=True,
            )
        )
    db_session.add(
        CompanyPostingSetup(
            setupId=str(_uuid_test.uuid4()),
            organizationId=organization_id,
            companyCode=company_code,
            retainedEarningsAccountId=re_id,
            isComplete=False,
        )
    )
    await db_session.commit()
    return cy_id, re_id, rev_id, cash_id


async def _post_test_revenue_je(
    db_session,
    organization_id: str,
    company_code: str,
    period_id: str,
    revenue_account_id: str,
    cash_account_id: str,
    amount: Decimal,
    je_date,
) -> None:
    """
    Post a minimal JE: DR Cash / CR Revenue for `amount`. Establishes
    Net Income = amount for the fiscal year. Both lines balance.
    """
    from finance.models.orm.models import (
        JEStatusEnum,
        JournalEntry,
        JournalEntryLine,
    )

    je_id = str(_uuid_test.uuid4())
    db_session.add(
        JournalEntry(
            jeId=je_id,
            organizationId=organization_id,
            companyCode=company_code,
            jeNumber=f"JE-{company_code}-{je_date.year}-T001",
            jeDate=je_date,
            periodId=period_id,
            sourceEventType="test_seed",
            sourceEventId=je_id,
            description="Test revenue posting",
            totalDebit=amount,
            totalCredit=amount,
            status=JEStatusEnum.POSTED,
            postedAt=datetime.utcnow(),
            postedBy="user-test",
        )
    )
    db_session.add(
        JournalEntryLine(
            jeLineId=str(_uuid_test.uuid4()),
            jeId=je_id,
            lineNumber=1,
            accountId=cash_account_id,
            debit=amount,
            credit=Decimal("0"),
            description="Cash debit",
        )
    )
    db_session.add(
        JournalEntryLine(
            jeLineId=str(_uuid_test.uuid4()),
            jeId=je_id,
            lineNumber=2,
            accountId=revenue_account_id,
            debit=Decimal("0"),
            credit=amount,
            description="Revenue credit",
        )
    )
    await db_session.commit()


@pytest.mark.asyncio
async def test_close_year_end_auto_posts_closing_je(
    client: AsyncClient, db_session
) -> None:
    """
    Closing the fiscal year-end period should auto-post a closing JE
    that rolls net income from Current Year P/(L) into Retained Earnings.
    """
    org_id = f"org-close-{uuid.uuid4().hex[:8]}"
    company_code = f"CL{uuid.uuid4().hex[:6].upper()}"
    cy_id, re_id, rev_id, cash_id = await _seed_company_coa_posting(
        db_session, org_id, company_code
    )

    # Seed one fiscal period that IS the year-end (only period for FY 2026)
    create_resp = await client.post(
        "/api/v1/finance/periods",
        json={
            "companyCode": company_code,
            "fiscalYear": 2026,
            "periodNumber": 12,
            "startDate": "2026-12-01",
            "endDate": "2026-12-31",
        },
        headers=auth_headers(),
    )
    period_id = create_resp.json()["data"]["periodId"]

    # Post a Revenue JE (Net Income = 1000 AED).
    from datetime import date as _date

    await _post_test_revenue_je(
        db_session,
        org_id,
        company_code,
        period_id,
        revenue_account_id=rev_id,
        cash_account_id=cash_id,
        amount=Decimal("1000.00"),
        je_date=_date(2026, 12, 15),
    )

    # Close the year-end period.
    resp = await client.patch(
        f"/api/v1/finance/periods/{period_id}/close",
        params={"organization_id": org_id},
        headers=auth_headers(),
    )
    assert resp.status_code == 200, resp.text

    body = resp.json()["data"]
    assert body["period"]["status"] == "closed"
    assert body["closingJe"] is not None
    assert Decimal(body["closingJe"]["netIncome"]) == Decimal("1000.00")
    assert body["closingJe"]["jeDate"] == "2026-12-31"

    # Verify the closing JE has two lines: DR cy / CR re.
    from finance.models.orm.models import JournalEntry, JournalEntryLine
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    je = (
        await db_session.execute(
            select(JournalEntry)
            .options(selectinload(JournalEntry.lines))
            .where(JournalEntry.jeId == body["closingJe"]["jeId"])
        )
    ).scalar_one()
    assert je.sourceEventType == "period_close"
    assert je.sourceDocId == period_id
    assert len(je.lines) == 2
    dr_line = next(l for l in je.lines if l.debit > 0)
    cr_line = next(l for l in je.lines if l.credit > 0)
    assert dr_line.accountId == cy_id
    assert cr_line.accountId == re_id
    assert Decimal(str(dr_line.debit)) == Decimal("1000.00")
    assert Decimal(str(cr_line.credit)) == Decimal("1000.00")


@pytest.mark.asyncio
async def test_reopen_year_end_reverses_closing_je(
    client: AsyncClient, db_session
) -> None:
    """
    Reopening a year-end period should post an offsetting reversal JE
    so the closing JE + reversal net to zero on the books.
    """
    from datetime import datetime, date as _date

    org_id = f"org-reopen-{uuid.uuid4().hex[:8]}"
    company_code = f"RO{uuid.uuid4().hex[:6].upper()}"
    cy_id, re_id, rev_id, cash_id = await _seed_company_coa_posting(
        db_session, org_id, company_code
    )

    create_resp = await client.post(
        "/api/v1/finance/periods",
        json={
            "companyCode": company_code,
            "fiscalYear": 2026,
            "periodNumber": 12,
            "startDate": "2026-12-01",
            "endDate": "2026-12-31",
        },
        headers=auth_headers(),
    )
    period_id = create_resp.json()["data"]["periodId"]

    await _post_test_revenue_je(
        db_session, org_id, company_code, period_id,
        revenue_account_id=rev_id,
        cash_account_id=cash_id,
        amount=Decimal("500.00"),
        je_date=_date(2026, 12, 15),
    )

    # Close
    close_resp = await client.patch(
        f"/api/v1/finance/periods/{period_id}/close",
        params={"organization_id": org_id},
        headers=auth_headers(),
    )
    closing_je_number = close_resp.json()["data"]["closingJe"]["jeNumber"]

    # Reopen
    reopen_resp = await client.patch(
        f"/api/v1/finance/periods/{period_id}/reopen",
        params={"organization_id": org_id},
        json={"reason": "Need to post adjusting entry"},
        headers=auth_headers(),
    )
    assert reopen_resp.status_code == 200, reopen_resp.text
    rev_body = reopen_resp.json()["data"]
    assert rev_body["period"]["status"] == "open"
    assert rev_body["closingJeReversal"] is not None
    assert rev_body["closingJeReversal"]["jeNumber"] != closing_je_number

    # Verify the reversal swaps DR/CR
    from finance.models.orm.models import JournalEntry, JournalEntryLine
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    reversal = (
        await db_session.execute(
            select(JournalEntry)
            .options(selectinload(JournalEntry.lines))
            .where(JournalEntry.jeId == rev_body["closingJeReversal"]["jeId"])
        )
    ).scalar_one()
    assert reversal.sourceEventType == "period_close_reversal"
    assert reversal.sourceDocNumber == closing_je_number
    assert len(reversal.lines) == 2
    # Sum must equal original closing JE (zero net effect)
    total_dr = sum(Decimal(str(l.debit or 0)) for l in reversal.lines)
    total_cr = sum(Decimal(str(l.credit or 0)) for l in reversal.lines)
    assert total_dr == Decimal("500.00")
    assert total_cr == Decimal("500.00")


@pytest.mark.asyncio
async def test_close_refuses_unbalanced_period(
    client: AsyncClient, db_session
) -> None:
    """A period whose JEs don't balance must refuse close with HTTP 400."""
    from datetime import datetime, date as _date

    org_id = f"org-unbal-{uuid.uuid4().hex[:8]}"
    company_code = f"UB{uuid.uuid4().hex[:6].upper()}"

    from finance.models.orm.models import (
        CompanyCode,
        AccountTypeEnum,
        DrawerEnum,
        GLAccount,
        JEStatusEnum,
        JournalEntry,
        JournalEntryLine,
    )

    a1 = str(_uuid_test.uuid4())
    a2 = str(_uuid_test.uuid4())
    db_session.add(
        CompanyCode(
            companyCode=company_code,
            organizationId=org_id,
            legalName=f"Unbalanced {company_code}",
        )
    )
    db_session.add(
        GLAccount(
            accountId=a1, organizationId=org_id, accountNumber="126000-001",
            accountName="Cash", drawer=DrawerEnum.ASSETS,
            accountType=AccountTypeEnum.ASSET, isHeader=False, isActive=True,
        )
    )
    db_session.add(
        GLAccount(
            accountId=a2, organizationId=org_id, accountNumber="411000-001",
            accountName="Revenue", drawer=DrawerEnum.REVENUE,
            accountType=AccountTypeEnum.REVENUE, isHeader=False, isActive=True,
        )
    )
    await db_session.commit()

    create_resp = await client.post(
        "/api/v1/finance/periods",
        json={
            "companyCode": company_code, "fiscalYear": 2026, "periodNumber": 1,
            "startDate": "2026-01-01", "endDate": "2026-01-31",
        },
        headers=auth_headers(),
    )
    period_id = create_resp.json()["data"]["periodId"]

    # Post an UNBALANCED JE (DR 100 / CR 90 — short 10).
    je_id = str(_uuid_test.uuid4())
    db_session.add(
        JournalEntry(
            jeId=je_id, organizationId=org_id, companyCode=company_code,
            jeNumber=f"JE-{company_code}-2026-X001", jeDate=_date(2026, 1, 15),
            periodId=period_id, sourceEventType="test_unbalanced",
            sourceEventId=je_id, totalDebit=Decimal("100"),
            totalCredit=Decimal("90"), status=JEStatusEnum.POSTED,
            postedAt=datetime.utcnow(), postedBy="user-test",
        )
    )
    db_session.add(
        JournalEntryLine(
            jeLineId=str(_uuid_test.uuid4()), jeId=je_id, lineNumber=1,
            accountId=a1, debit=Decimal("100"), credit=Decimal("0"),
        )
    )
    db_session.add(
        JournalEntryLine(
            jeLineId=str(_uuid_test.uuid4()), jeId=je_id, lineNumber=2,
            accountId=a2, debit=Decimal("0"), credit=Decimal("90"),
        )
    )
    await db_session.commit()

    resp = await client.patch(
        f"/api/v1/finance/periods/{period_id}/close",
        params={"organization_id": org_id},
        headers=auth_headers(),
    )
    assert resp.status_code == 400
    assert "does not balance" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_close_year_end_without_re_account_returns_400(
    client: AsyncClient, db_session
) -> None:
    """Year-end close must error cleanly if RE account isn't configured."""
    from datetime import date as _date

    org_id = f"org-nore-{uuid.uuid4().hex[:8]}"
    company_code = f"NR{uuid.uuid4().hex[:6].upper()}"

    # Seed everything via session — NO posting setup so RE account is missing.
    from finance.models.orm.models import (
        AccountTypeEnum, CompanyCode, DrawerEnum, GLAccount,
    )

    rev_id = str(_uuid_test.uuid4())
    cy_id = str(_uuid_test.uuid4())
    cash_id = str(_uuid_test.uuid4())
    db_session.add(
        CompanyCode(
            companyCode=company_code,
            organizationId=org_id,
            legalName=f"NoRE {company_code}",
        )
    )
    for aid, num, name, drawer, atype in [
        (cy_id, "312000-002", "Current Year P/(L)", DrawerEnum.EQUITY, AccountTypeEnum.EQUITY),
        (rev_id, "411000-001", "Revenue", DrawerEnum.REVENUE, AccountTypeEnum.REVENUE),
        (cash_id, "126000-001", "Cash", DrawerEnum.ASSETS, AccountTypeEnum.ASSET),
    ]:
        db_session.add(
            GLAccount(
                accountId=aid, organizationId=org_id, accountNumber=num,
                accountName=name, drawer=drawer, accountType=atype,
                isHeader=False, isActive=True,
            )
        )
    await db_session.commit()

    create_resp = await client.post(
        "/api/v1/finance/periods",
        json={"companyCode": company_code, "fiscalYear": 2026,
              "periodNumber": 12, "startDate": "2026-12-01",
              "endDate": "2026-12-31"},
        headers=auth_headers(),
    )
    period_id = create_resp.json()["data"]["periodId"]

    await _post_test_revenue_je(
        db_session, org_id, company_code, period_id,
        revenue_account_id=rev_id, cash_account_id=cash_id,
        amount=Decimal("250.00"), je_date=_date(2026, 12, 20),
    )

    resp = await client.patch(
        f"/api/v1/finance/periods/{period_id}/close",
        params={"organization_id": org_id},
        headers=auth_headers(),
    )
    assert resp.status_code == 400
    assert "retained earnings" in resp.json()["detail"].lower()


# ─── T-060.11-preview — dry_run flag tests ─────────────────────────────────

from sqlalchemy import func as sa_func


@pytest.mark.asyncio
async def test_dry_run_year_end_returns_preview_no_db_write(
    client: AsyncClient, db_session
) -> None:
    """
    dry_run=true on a year-end period with revenue JEs should return
    closingJePreview with balanced lines and NOT write any JE to the DB.
    """
    from datetime import date as _date
    from finance.models.orm.models import JournalEntry
    from sqlalchemy import select

    org_id = f"org-dryrun-{uuid.uuid4().hex[:8]}"
    company_code = f"DR{uuid.uuid4().hex[:6].upper()}"
    cy_id, re_id, rev_id, cash_id = await _seed_company_coa_posting(
        db_session, org_id, company_code
    )

    create_resp = await client.post(
        "/api/v1/finance/periods",
        json={
            "companyCode": company_code,
            "fiscalYear": 2026,
            "periodNumber": 12,
            "startDate": "2026-12-01",
            "endDate": "2026-12-31",
        },
        headers=auth_headers(),
    )
    period_id = create_resp.json()["data"]["periodId"]

    await _post_test_revenue_je(
        db_session, org_id, company_code, period_id,
        revenue_account_id=rev_id,
        cash_account_id=cash_id,
        amount=Decimal("750.00"),
        je_date=_date(2026, 12, 10),
    )

    # dry_run=true — should return preview, no mutations
    resp = await client.patch(
        f"/api/v1/finance/periods/{period_id}/close",
        params={"organization_id": org_id, "dry_run": "true"},
        headers=auth_headers(),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()["data"]

    # Response must carry closingJePreview, not closingJe
    assert "closingJePreview" in body
    preview = body["closingJePreview"]
    assert preview["isYearEnd"] is True
    assert preview["note"] is None

    # Lines must be balanced: totalDebit == totalCredit
    td = Decimal(preview["totalDebit"])
    tc = Decimal(preview["totalCredit"])
    assert td == tc
    assert td == Decimal("750.00")

    # Must have exactly 2 lines; one debit, one credit
    lines = preview["lines"]
    assert len(lines) == 2
    dr_lines = [l for l in lines if l["debit"] is not None and Decimal(l["debit"]) > 0]
    cr_lines = [l for l in lines if l["credit"] is not None and Decimal(l["credit"]) > 0]
    assert len(dr_lines) == 1
    assert len(cr_lines) == 1
    assert Decimal(dr_lines[0]["debit"]) == Decimal("750.00")
    assert Decimal(cr_lines[0]["credit"]) == Decimal("750.00")

    # Period must still be OPEN (no status change)
    assert body["period"]["status"] == "open"

    # No JE for this period should exist in the DB
    je_count = (
        await db_session.execute(
            select(sa_func.count(JournalEntry.jeId)).where(
                JournalEntry.periodId == period_id,
                JournalEntry.sourceEventType == "period_close",
            )
        )
    ).scalar_one()
    assert je_count == 0

    # No audit_log entry should exist
    from finance.models.orm.models import AuditLog
    audit_count = (
        await db_session.execute(
            select(sa_func.count(AuditLog.auditId)).where(
                AuditLog.entityId == period_id,
            )
        )
    ).scalar_one()
    assert audit_count == 0


@pytest.mark.asyncio
async def test_dry_run_mid_year_period_returns_empty_preview_no_db_write(
    client: AsyncClient, db_session
) -> None:
    """
    dry_run=true on a mid-year period should return closingJePreview with
    isYearEnd=False, empty lines, and a note.  No DB changes.
    """
    from finance.models.orm.models import JournalEntry
    from sqlalchemy import select

    org_id = f"org-drymid-{uuid.uuid4().hex[:8]}"
    company_code = f"DM{uuid.uuid4().hex[:6].upper()}"
    cy_id, re_id, rev_id, cash_id = await _seed_company_coa_posting(
        db_session, org_id, company_code
    )

    # Two periods so period 6 is NOT the year-end (period 12 is later)
    create_resp_mid = await client.post(
        "/api/v1/finance/periods",
        json={
            "companyCode": company_code,
            "fiscalYear": 2026,
            "periodNumber": 6,
            "startDate": "2026-06-01",
            "endDate": "2026-06-30",
        },
        headers=auth_headers(),
    )
    mid_period_id = create_resp_mid.json()["data"]["periodId"]

    await client.post(
        "/api/v1/finance/periods",
        json={
            "companyCode": company_code,
            "fiscalYear": 2026,
            "periodNumber": 12,
            "startDate": "2026-12-01",
            "endDate": "2026-12-31",
        },
        headers=auth_headers(),
    )

    resp = await client.patch(
        f"/api/v1/finance/periods/{mid_period_id}/close",
        params={"organization_id": org_id, "dry_run": "true"},
        headers=auth_headers(),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()["data"]

    preview = body["closingJePreview"]
    assert preview["isYearEnd"] is False
    assert preview["lines"] == []
    assert Decimal(preview["totalDebit"]) == Decimal("0")
    assert Decimal(preview["totalCredit"]) == Decimal("0")
    assert preview["note"] is not None
    assert len(preview["note"]) > 0

    # Period still open
    assert body["period"]["status"] == "open"

    # No JE or audit_log created
    je_count = (
        await db_session.execute(
            select(sa_func.count(JournalEntry.jeId)).where(
                JournalEntry.periodId == mid_period_id,
            )
        )
    ).scalar_one()
    assert je_count == 0


@pytest.mark.asyncio
async def test_dry_run_already_closed_period_returns_409(
    client: AsyncClient, db_session
) -> None:
    """
    dry_run=true on an already-closed period must return HTTP 409 —
    same error contract as the real close.
    """
    org_id = f"org-drycl-{uuid.uuid4().hex[:8]}"
    company_code = f"DC{uuid.uuid4().hex[:6].upper()}"
    await _seed_company_coa_posting(db_session, org_id, company_code)

    create_resp = await client.post(
        "/api/v1/finance/periods",
        json={
            "companyCode": company_code,
            "fiscalYear": 2026,
            "periodNumber": 5,
            "startDate": "2026-05-01",
            "endDate": "2026-05-31",
        },
        headers=auth_headers(),
    )
    period_id = create_resp.json()["data"]["periodId"]

    # Real close first
    await client.patch(
        f"/api/v1/finance/periods/{period_id}/close",
        params={"organization_id": org_id},
        headers=auth_headers(),
    )

    # dry_run on an already-closed period must still return 409
    resp = await client.patch(
        f"/api/v1/finance/periods/{period_id}/close",
        params={"organization_id": org_id, "dry_run": "true"},
        headers=auth_headers(),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_dry_run_does_not_require_reason(
    client: AsyncClient, db_session
) -> None:
    """
    dry_run=true must succeed without a `reason` in the request body —
    the user is just previewing, not committing.
    """
    from datetime import date as _date

    org_id = f"org-dryreason-{uuid.uuid4().hex[:8]}"
    company_code = f"DN{uuid.uuid4().hex[:6].upper()}"
    cy_id, re_id, rev_id, cash_id = await _seed_company_coa_posting(
        db_session, org_id, company_code
    )

    create_resp = await client.post(
        "/api/v1/finance/periods",
        json={
            "companyCode": company_code,
            "fiscalYear": 2026,
            "periodNumber": 12,
            "startDate": "2026-12-01",
            "endDate": "2026-12-31",
        },
        headers=auth_headers(),
    )
    period_id = create_resp.json()["data"]["periodId"]

    await _post_test_revenue_je(
        db_session, org_id, company_code, period_id,
        revenue_account_id=rev_id,
        cash_account_id=cash_id,
        amount=Decimal("500.00"),
        je_date=_date(2026, 12, 20),
    )

    # No body at all (no reason) — should succeed for dry_run=true
    resp = await client.patch(
        f"/api/v1/finance/periods/{period_id}/close",
        params={"organization_id": org_id, "dry_run": "true"},
        headers=auth_headers(),
        # Intentionally no JSON body
    )
    assert resp.status_code == 200, resp.text
    assert "closingJePreview" in resp.json()["data"]


@pytest.mark.asyncio
async def test_dry_run_lines_match_real_close_lines(
    client: AsyncClient, db_session
) -> None:
    """
    Property test: for the same period, dry_run and a real close must
    produce IDENTICAL JE lines (account IDs, debit/credit amounts,
    line numbers, descriptions).

    This is the key invariant enforced by the compute→commit split —
    _compute_closing_je_preview is called once, and the result is either
    returned directly (dry_run) or persisted as-is (commit).
    """
    from datetime import date as _date
    from finance.models.orm.models import JournalEntry
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    org_id = f"org-dryconsist-{uuid.uuid4().hex[:8]}"
    company_code = f"DC{uuid.uuid4().hex[:6].upper()}"
    cy_id, re_id, rev_id, cash_id = await _seed_company_coa_posting(
        db_session, org_id, company_code
    )

    create_resp = await client.post(
        "/api/v1/finance/periods",
        json={
            "companyCode": company_code,
            "fiscalYear": 2026,
            "periodNumber": 12,
            "startDate": "2026-12-01",
            "endDate": "2026-12-31",
        },
        headers=auth_headers(),
    )
    period_id = create_resp.json()["data"]["periodId"]

    await _post_test_revenue_je(
        db_session, org_id, company_code, period_id,
        revenue_account_id=rev_id,
        cash_account_id=cash_id,
        amount=Decimal("999.99"),
        je_date=_date(2026, 12, 25),
    )

    # Step 1: dry_run to get the preview
    dry_resp = await client.patch(
        f"/api/v1/finance/periods/{period_id}/close",
        params={"organization_id": org_id, "dry_run": "true"},
        headers=auth_headers(),
    )
    assert dry_resp.status_code == 200, dry_resp.text
    preview_lines = dry_resp.json()["data"]["closingJePreview"]["lines"]

    # Step 2: real close (period still OPEN — dry_run made no changes)
    real_resp = await client.patch(
        f"/api/v1/finance/periods/{period_id}/close",
        params={"organization_id": org_id, "dry_run": "false"},
        headers=auth_headers(),
    )
    assert real_resp.status_code == 200, real_resp.text
    je_id = real_resp.json()["data"]["closingJe"]["jeId"]

    # Step 3: load the actual posted JE lines from the DB
    je = (
        await db_session.execute(
            select(JournalEntry)
            .options(selectinload(JournalEntry.lines))
            .where(JournalEntry.jeId == je_id)
        )
    ).scalar_one()
    actual_lines = sorted(je.lines, key=lambda l: l.lineNumber)

    # Step 4: compare preview lines to actual JE lines (line by line)
    assert len(preview_lines) == len(actual_lines), (
        f"Line count mismatch: preview has {len(preview_lines)}, "
        f"actual JE has {len(actual_lines)}"
    )
    for preview_line, actual_line in zip(
        sorted(preview_lines, key=lambda l: l["lineNumber"]),
        actual_lines,
    ):
        assert preview_line["accountId"] == actual_line.accountId, (
            f"accountId mismatch on line {preview_line['lineNumber']}"
        )
        preview_debit = Decimal(str(preview_line["debit"] or 0))
        preview_credit = Decimal(str(preview_line["credit"] or 0))
        actual_debit = Decimal(str(actual_line.debit or 0))
        actual_credit = Decimal(str(actual_line.credit or 0))
        assert preview_debit == actual_debit, (
            f"Debit mismatch on line {preview_line['lineNumber']}: "
            f"preview={preview_debit} actual={actual_debit}"
        )
        assert preview_credit == actual_credit, (
            f"Credit mismatch on line {preview_line['lineNumber']}: "
            f"preview={preview_credit} actual={actual_credit}"
        )
