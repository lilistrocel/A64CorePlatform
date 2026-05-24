"""Tests for GET /reports/balance-sheet (Wave 2 / T-060.3)."""

import uuid
from datetime import date, datetime
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from finance.models.orm.models import (
    AccountTypeEnum,
    CompanyCode,
    DrawerEnum,
    FiscalPeriod,
    GLAccount,
    JEStatusEnum,
    JournalEntry,
    JournalEntryLine,
    PeriodStatusEnum,
)

from .conftest import auth_headers


# ─── Helpers ─────────────────────────────────────────────────────────────


async def _seed_company_and_minimal_coa(db_session, org_id, company_code):
    """
    Seed a company, a minimal CoA covering one of each BS drawer plus
    revenue, AND a wide fiscal period spanning 2025-01-01..2027-12-31 so
    test JEs can be posted with a valid periodId.

    Returns a dict with accountIds plus 'period_id'.

    Hierarchy:
      ASSETS (header)
        Cash (leaf, debit-natural)
      LIABILITIES (header)
        AP (leaf, credit-natural)
      EQUITY (header)
        Share Capital (leaf, credit-natural)
      REVENUE (leaf, credit-natural)  — for NI computation
    """
    db_session.add(
        CompanyCode(
            companyCode=company_code,
            organizationId=org_id,
            legalName=f"BS Test {company_code}",
            fiscalYearStartMonth=1,
            fiscalYearStartDay=1,
        )
    )
    # Wide-span period so tests can post JEs anywhere in 2025-2027.
    period_id = str(uuid.uuid4())
    db_session.add(
        FiscalPeriod(
            periodId=period_id,
            companyCode=company_code,
            fiscalYear=2026,
            periodNumber=99,  # synthetic; OPEN so postings accepted
            startDate=date(2025, 1, 1),
            endDate=date(2027, 12, 31),
            status=PeriodStatusEnum.OPEN,
        )
    )

    ids = {}
    # Header accounts (one per BS drawer).
    for code, name, drawer, atype, key in [
        ("100000", "Assets Header", DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "assets_header"),
        ("200000", "Liabilities Header", DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "liab_header"),
        ("300000", "Equity Header", DrawerEnum.EQUITY, AccountTypeEnum.EQUITY, "equity_header"),
    ]:
        aid = str(uuid.uuid4())
        ids[key] = aid
        db_session.add(
            GLAccount(
                accountId=aid, organizationId=org_id, accountNumber=code,
                accountName=name, drawer=drawer, accountType=atype,
                parentAccountId=None, isHeader=True, isActive=True,
            )
        )

    # Leaf accounts (one per drawer + a revenue account for NI).
    leaves = [
        ("110001", "Cash", DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
         ids["assets_header"], "cash"),
        ("210001", "Accounts Payable", DrawerEnum.LIABILITIES,
         AccountTypeEnum.LIABILITY, ids["liab_header"], "ap"),
        ("310001", "Share Capital", DrawerEnum.EQUITY,
         AccountTypeEnum.EQUITY, ids["equity_header"], "share_capital"),
        ("410001", "Revenue", DrawerEnum.REVENUE,
         AccountTypeEnum.REVENUE, None, "revenue"),
    ]
    for code, name, drawer, atype, parent, key in leaves:
        aid = str(uuid.uuid4())
        ids[key] = aid
        db_session.add(
            GLAccount(
                accountId=aid, organizationId=org_id, accountNumber=code,
                accountName=name, drawer=drawer, accountType=atype,
                parentAccountId=parent, isHeader=False, isActive=True,
            )
        )

    ids["period_id"] = period_id
    await db_session.commit()
    return ids


async def _post_je(
    db_session, org_id, company_code, lines, je_date, period_id,
    je_number=None,
):
    """
    Post a balanced JE with the given list of (accountId, debit, credit)
    tuples. Caller ensures Σ debit == Σ credit.
    """
    je_id = str(uuid.uuid4())
    total_dr = sum(Decimal(str(l[1])) for l in lines)
    total_cr = sum(Decimal(str(l[2])) for l in lines)
    db_session.add(
        JournalEntry(
            jeId=je_id, organizationId=org_id, companyCode=company_code,
            jeNumber=je_number or f"JE-{company_code}-{je_date.year}-T{uuid.uuid4().hex[:4].upper()}",
            jeDate=je_date, periodId=period_id, sourceEventType="test_seed",
            sourceEventId=je_id, totalDebit=total_dr, totalCredit=total_cr,
            status=JEStatusEnum.POSTED,
            postedAt=datetime.utcnow(), postedBy="user-test",
        )
    )
    for i, (account_id, debit, credit) in enumerate(lines, start=1):
        db_session.add(
            JournalEntryLine(
                jeLineId=str(uuid.uuid4()), jeId=je_id, lineNumber=i,
                accountId=account_id, debit=Decimal(str(debit)),
                credit=Decimal(str(credit)),
            )
        )
    await db_session.commit()
    return je_id


# ─── Tests ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_bs_empty_org_returns_zero_rows_no_warning(
    client: AsyncClient, db_session,
) -> None:
    """No JEs → all account balances zero, no warning, sections all zero."""
    org_id = f"org-bs-empty-{uuid.uuid4().hex[:8]}"
    company_code = f"BE{uuid.uuid4().hex[:6].upper()}"
    await _seed_company_and_minimal_coa(db_session, org_id, company_code)

    resp = await client.get(
        "/api/v1/finance/reports/balance-sheet",
        params={"organization_id": org_id, "company_code": company_code,
                "as_of_date": "2026-12-31"},
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()["data"]
    # 3 headers + 1 cash + 1 AP + 1 equity = 6 BS rows (revenue excluded)
    assert len(body["rows"]) == 6
    for row in body["rows"]:
        assert Decimal(row["balance"]) == Decimal("0")
    assert Decimal(body["totals"]["totalAssets"]) == Decimal("0")
    assert Decimal(body["totals"]["totalLiabilities"]) == Decimal("0")
    assert Decimal(body["totals"]["totalEquity"]) == Decimal("0")
    assert Decimal(body["currentYearProfitLoss"]) == Decimal("0")
    assert body["warnings"] == []


@pytest.mark.asyncio
async def test_bs_balances_after_share_capital_contribution(
    client: AsyncClient, db_session,
) -> None:
    """
    Founder injects 50000 cash for share capital → DR Cash / CR Share
    Capital. BS: assets = 50000, equity = 50000, balances perfectly.
    """
    org_id = f"org-bs-sc-{uuid.uuid4().hex[:8]}"
    company_code = f"SC{uuid.uuid4().hex[:6].upper()}"
    ids = await _seed_company_and_minimal_coa(db_session, org_id, company_code)

    await _post_je(
        db_session, org_id, company_code,
        lines=[
            (ids["cash"], "50000", "0"),
            (ids["share_capital"], "0", "50000"),
        ],
        je_date=date(2026, 1, 15),
        period_id=ids["period_id"],
    )

    resp = await client.get(
        "/api/v1/finance/reports/balance-sheet",
        params={"organization_id": org_id, "company_code": company_code,
                "as_of_date": "2026-12-31"},
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 200
    body = resp.json()["data"]
    totals = body["totals"]
    assert Decimal(totals["totalAssets"]) == Decimal("50000")
    assert Decimal(totals["totalLiabilities"]) == Decimal("0")
    assert Decimal(totals["totalEquity"]) == Decimal("50000")
    assert Decimal(totals["totalLiabilitiesPlusEquity"]) == Decimal("50000")
    assert Decimal(totals["balanceDelta"]) == Decimal("0")
    assert body["warnings"] == []
    # Sign convention spot-checks: cash (ASSET) shows +50000 (DR-natural);
    # share capital (EQUITY) shows +50000 (CR-natural).
    cash_row = next(r for r in body["rows"] if r["accountId"] == ids["cash"])
    sc_row = next(r for r in body["rows"] if r["accountId"] == ids["share_capital"])
    assert Decimal(cash_row["balance"]) == Decimal("50000")
    assert Decimal(sc_row["balance"]) == Decimal("50000")


@pytest.mark.asyncio
async def test_bs_header_balances_roll_up_from_leaves(
    client: AsyncClient, db_session,
) -> None:
    """
    Header accounts (isHeader=True) report the sum of their descendants'
    balances, not their own (which is always 0 for proper headers).
    """
    org_id = f"org-bs-roll-{uuid.uuid4().hex[:8]}"
    company_code = f"RL{uuid.uuid4().hex[:6].upper()}"
    ids = await _seed_company_and_minimal_coa(db_session, org_id, company_code)

    # DR Cash 1000 / CR AP 1000 (acquires inventory on credit).
    await _post_je(
        db_session, org_id, company_code,
        lines=[
            (ids["cash"], "1000", "0"),
            (ids["ap"], "0", "1000"),
        ],
        je_date=date(2026, 3, 1),
        period_id=ids["period_id"],
    )

    resp = await client.get(
        "/api/v1/finance/reports/balance-sheet",
        params={"organization_id": org_id, "company_code": company_code,
                "as_of_date": "2026-12-31"},
        headers=auth_headers(role="auditor"),
    )
    body = resp.json()["data"]
    # The ASSETS header should show 1000 (rolled from Cash leaf).
    assets_header = next(
        r for r in body["rows"] if r["accountId"] == ids["assets_header"]
    )
    liab_header = next(
        r for r in body["rows"] if r["accountId"] == ids["liab_header"]
    )
    assert Decimal(assets_header["balance"]) == Decimal("1000")
    assert assets_header["isHeader"] is True
    assert Decimal(liab_header["balance"]) == Decimal("1000")


@pytest.mark.asyncio
async def test_bs_current_year_profit_loss_lifts_equity_to_balance(
    client: AsyncClient, db_session,
) -> None:
    """
    Live current-year P/L computed from REVENUE/EXPENSE drawer activity
    must lift equity so BS balances during the open year.

    Scenario: 50000 share capital + 8000 cash revenue (DR Cash / CR Rev).
      Assets: cash = 58000
      Liabilities: 0
      Equity: share_capital (50000) + currentYearProfitLoss (8000) = 58000
    """
    org_id = f"org-bs-ni-{uuid.uuid4().hex[:8]}"
    company_code = f"NI{uuid.uuid4().hex[:6].upper()}"
    ids = await _seed_company_and_minimal_coa(db_session, org_id, company_code)

    await _post_je(
        db_session, org_id, company_code,
        lines=[(ids["cash"], "50000", "0"),
               (ids["share_capital"], "0", "50000")],
        je_date=date(2026, 1, 1),
        period_id=ids["period_id"],
    )
    await _post_je(
        db_session, org_id, company_code,
        lines=[(ids["cash"], "8000", "0"),
               (ids["revenue"], "0", "8000")],
        je_date=date(2026, 6, 15),
        period_id=ids["period_id"],
    )

    resp = await client.get(
        "/api/v1/finance/reports/balance-sheet",
        params={"organization_id": org_id, "company_code": company_code,
                "as_of_date": "2026-12-31"},
        headers=auth_headers(role="auditor"),
    )
    body = resp.json()["data"]
    totals = body["totals"]
    assert Decimal(totals["totalAssets"]) == Decimal("58000")
    assert Decimal(body["currentYearProfitLoss"]) == Decimal("8000")
    # Equity total includes the live NI.
    assert Decimal(totals["totalEquity"]) == Decimal("58000")
    assert Decimal(totals["balanceDelta"]) == Decimal("0")
    assert body["warnings"] == []


@pytest.mark.asyncio
async def test_bs_warns_when_unbalanced(
    client: AsyncClient, db_session,
) -> None:
    """
    Manually post an unbalanced JE (DR 100 / CR 90 — should never happen
    in normal posting but possible via test seeding) → BS surfaces the
    delta as a warning rather than refusing the report.
    """
    org_id = f"org-bs-unbal-{uuid.uuid4().hex[:8]}"
    company_code = f"UB{uuid.uuid4().hex[:6].upper()}"
    ids = await _seed_company_and_minimal_coa(db_session, org_id, company_code)

    # Note: this bypasses the JE service's balance validator by inserting
    # directly. Real production flows can't produce this state.
    je_id = str(uuid.uuid4())
    db_session.add(
        JournalEntry(
            jeId=je_id, organizationId=org_id, companyCode=company_code,
            jeNumber=f"JE-{company_code}-2026-X001", jeDate=date(2026, 1, 5),
            periodId=ids["period_id"],
            sourceEventType="test_unbal", sourceEventId=je_id,
            totalDebit=Decimal("100"), totalCredit=Decimal("90"),
            status=JEStatusEnum.POSTED,
            postedAt=datetime.utcnow(), postedBy="user-test",
        )
    )
    db_session.add(JournalEntryLine(
        jeLineId=str(uuid.uuid4()), jeId=je_id, lineNumber=1,
        accountId=ids["cash"], debit=Decimal("100"), credit=Decimal("0"),
    ))
    db_session.add(JournalEntryLine(
        jeLineId=str(uuid.uuid4()), jeId=je_id, lineNumber=2,
        accountId=ids["share_capital"], debit=Decimal("0"), credit=Decimal("90"),
    ))
    await db_session.commit()

    resp = await client.get(
        "/api/v1/finance/reports/balance-sheet",
        params={"organization_id": org_id, "company_code": company_code,
                "as_of_date": "2026-12-31"},
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 200
    body = resp.json()["data"]
    assert Decimal(body["totals"]["balanceDelta"]) == Decimal("10")
    assert len(body["warnings"]) == 1
    assert "does not balance" in body["warnings"][0].lower()


@pytest.mark.asyncio
async def test_bs_as_of_date_excludes_future_jes(
    client: AsyncClient, db_session,
) -> None:
    """
    Setting as_of_date=2026-06-30 must exclude a JE dated 2026-07-15.
    """
    org_id = f"org-bs-asof-{uuid.uuid4().hex[:8]}"
    company_code = f"AO{uuid.uuid4().hex[:6].upper()}"
    ids = await _seed_company_and_minimal_coa(db_session, org_id, company_code)

    # June JE — should be included.
    await _post_je(
        db_session, org_id, company_code,
        lines=[(ids["cash"], "100", "0"),
               (ids["share_capital"], "0", "100")],
        je_date=date(2026, 6, 1),
        period_id=ids["period_id"],
    )
    # July JE — should be excluded by as_of=June 30.
    await _post_je(
        db_session, org_id, company_code,
        lines=[(ids["cash"], "9999", "0"),
               (ids["share_capital"], "0", "9999")],
        je_date=date(2026, 7, 15),
        period_id=ids["period_id"],
    )

    resp = await client.get(
        "/api/v1/finance/reports/balance-sheet",
        params={"organization_id": org_id, "company_code": company_code,
                "as_of_date": "2026-06-30"},
        headers=auth_headers(role="auditor"),
    )
    body = resp.json()["data"]
    assert Decimal(body["totals"]["totalAssets"]) == Decimal("100")


@pytest.mark.asyncio
async def test_bs_unknown_company_returns_404(client: AsyncClient) -> None:
    """Non-existent company code → HTTP 404."""
    resp = await client.get(
        "/api/v1/finance/reports/balance-sheet",
        params={"organization_id": "anything", "company_code": "NONEXIST",
                "as_of_date": "2026-12-31"},
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_bs_non_finance_role_forbidden(
    client: AsyncClient, db_session,
) -> None:
    """A role outside _READ_ROLES gets 403."""
    org_id = f"org-bs-auth-{uuid.uuid4().hex[:8]}"
    company_code = f"AU{uuid.uuid4().hex[:6].upper()}"
    await _seed_company_and_minimal_coa(db_session, org_id, company_code)

    resp = await client.get(
        "/api/v1/finance/reports/balance-sheet",
        params={"organization_id": org_id, "company_code": company_code,
                "as_of_date": "2026-12-31"},
        headers=auth_headers(role="user"),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_bs_cost_center_filter_narrows_rows(
    client: AsyncClient, db_session,
) -> None:
    """
    cost_center_id filter restricts the JE lines aggregated into balances.
    Lines without the matching costCenterId are excluded.
    """
    org_id = f"org-bs-cc-{uuid.uuid4().hex[:8]}"
    company_code = f"CC{uuid.uuid4().hex[:6].upper()}"
    ids = await _seed_company_and_minimal_coa(db_session, org_id, company_code)

    # Two JEs — one tagged with cost-centre 'farm-a', one untagged.
    je1_id = str(uuid.uuid4())
    db_session.add(JournalEntry(
        jeId=je1_id, organizationId=org_id, companyCode=company_code,
        jeNumber=f"JE-{company_code}-2026-CC01", jeDate=date(2026, 2, 1),
        periodId=ids["period_id"],
        sourceEventType="test_cc", sourceEventId=je1_id,
        totalDebit=Decimal("200"), totalCredit=Decimal("200"),
        status=JEStatusEnum.POSTED,
        postedAt=datetime.utcnow(), postedBy="user-test",
    ))
    db_session.add(JournalEntryLine(
        jeLineId=str(uuid.uuid4()), jeId=je1_id, lineNumber=1,
        accountId=ids["cash"], debit=Decimal("200"), credit=Decimal("0"),
        costCenterId="farm-a",
    ))
    db_session.add(JournalEntryLine(
        jeLineId=str(uuid.uuid4()), jeId=je1_id, lineNumber=2,
        accountId=ids["share_capital"], debit=Decimal("0"),
        credit=Decimal("200"), costCenterId="farm-a",
    ))

    je2_id = str(uuid.uuid4())
    db_session.add(JournalEntry(
        jeId=je2_id, organizationId=org_id, companyCode=company_code,
        jeNumber=f"JE-{company_code}-2026-CC02", jeDate=date(2026, 2, 1),
        periodId=ids["period_id"],
        sourceEventType="test_cc", sourceEventId=je2_id,
        totalDebit=Decimal("500"), totalCredit=Decimal("500"),
        status=JEStatusEnum.POSTED,
        postedAt=datetime.utcnow(), postedBy="user-test",
    ))
    db_session.add(JournalEntryLine(
        jeLineId=str(uuid.uuid4()), jeId=je2_id, lineNumber=1,
        accountId=ids["cash"], debit=Decimal("500"), credit=Decimal("0"),
    ))  # No costCenterId
    db_session.add(JournalEntryLine(
        jeLineId=str(uuid.uuid4()), jeId=je2_id, lineNumber=2,
        accountId=ids["share_capital"], debit=Decimal("0"),
        credit=Decimal("500"),
    ))
    await db_session.commit()

    # Unfiltered — sees both: assets = 700, equity = 700.
    full = await client.get(
        "/api/v1/finance/reports/balance-sheet",
        params={"organization_id": org_id, "company_code": company_code,
                "as_of_date": "2026-12-31"},
        headers=auth_headers(role="auditor"),
    )
    assert Decimal(full.json()["data"]["totals"]["totalAssets"]) == Decimal("700")

    # Filtered to farm-a — sees only the tagged 200.
    filtered = await client.get(
        "/api/v1/finance/reports/balance-sheet",
        params={"organization_id": org_id, "company_code": company_code,
                "as_of_date": "2026-12-31", "cost_center_id": "farm-a"},
        headers=auth_headers(role="auditor"),
    )
    assert Decimal(filtered.json()["data"]["totals"]["totalAssets"]) == Decimal("200")


@pytest.mark.asyncio
async def test_bs_fiscal_year_resolution_handles_august_start(
    client: AsyncClient, db_session,
) -> None:
    """
    A company with an August fiscal year start should treat as_of_date
    2026-05-24 as falling in the fiscal year that started 2025-08-01.
    The current-year P/L computation must include revenue posted in
    Aug-Dec 2025 (same fiscal year).
    """
    org_id = f"org-bs-fy-{uuid.uuid4().hex[:8]}"
    company_code = f"FY{uuid.uuid4().hex[:6].upper()}"

    db_session.add(
        CompanyCode(
            companyCode=company_code,
            organizationId=org_id,
            legalName=f"Aug FY {company_code}",
            fiscalYearStartMonth=8,
            fiscalYearStartDay=1,
        )
    )
    rev_id = str(uuid.uuid4())
    cash_id = str(uuid.uuid4())
    sc_id = str(uuid.uuid4())
    for aid, code, name, drawer, atype in [
        (cash_id, "110001", "Cash", DrawerEnum.ASSETS, AccountTypeEnum.ASSET),
        (sc_id, "310001", "SC", DrawerEnum.EQUITY, AccountTypeEnum.EQUITY),
        (rev_id, "410001", "Rev", DrawerEnum.REVENUE, AccountTypeEnum.REVENUE),
    ]:
        db_session.add(
            GLAccount(
                accountId=aid, organizationId=org_id, accountNumber=code,
                accountName=name, drawer=drawer, accountType=atype,
                isHeader=False, isActive=True,
            )
        )
    # Wide period covering the test dates.
    period_id = str(uuid.uuid4())
    db_session.add(
        FiscalPeriod(
            periodId=period_id, companyCode=company_code, fiscalYear=2026,
            periodNumber=99, startDate=date(2025, 1, 1),
            endDate=date(2027, 12, 31), status=PeriodStatusEnum.OPEN,
        )
    )
    await db_session.commit()

    # Revenue posted Sep 2025 — falls in fiscal year that ends Jul 2026.
    await _post_je(
        db_session, org_id, company_code,
        lines=[(cash_id, "777", "0"), (rev_id, "0", "777")],
        je_date=date(2025, 9, 15), period_id=period_id,
    )
    # Revenue posted Jul 2025 — falls in the PREVIOUS fiscal year (ends
    # Jul 31 2025), so should be EXCLUDED from current-year NI as of
    # 2026-05-24.
    await _post_je(
        db_session, org_id, company_code,
        lines=[(cash_id, "111", "0"), (rev_id, "0", "111")],
        je_date=date(2025, 7, 1), period_id=period_id,
    )

    resp = await client.get(
        "/api/v1/finance/reports/balance-sheet",
        params={"organization_id": org_id, "company_code": company_code,
                "as_of_date": "2026-05-24"},
        headers=auth_headers(role="auditor"),
    )
    body = resp.json()["data"]
    # Only the 777 (Sep 2025) counts for current-year NI.
    assert Decimal(body["currentYearProfitLoss"]) == Decimal("777")
    # Both JEs counted into Cash balance (cumulative), so assets = 888.
    assert Decimal(body["totals"]["totalAssets"]) == Decimal("888")
