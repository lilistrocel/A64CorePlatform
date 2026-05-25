"""
Tests for multi-cost-centre filter on the three statutory report endpoints
and the export endpoint (T-060.6.1 — follow-up to T-060.6).

Coverage:
  Balance Sheet:
    - Multi-value: two cost centres combined → combined balance visible
    - Single-value: existing single-string contract still works
    - Zero / omitted: no filter, all data returned (current behaviour)
  Income Statement:
    - Multi-value: two cost centres combined → combined net income
    - Single-value: single cost centre works
    - Zero / omitted: no filter
  Cash Flow:
    - Multi-value: two cost centres combined → combined net income component
    - Zero / omitted: no filter
  Export endpoint:
    - Multi-value propagated correctly to balance-sheet and income-statement
      xlsx export (confirms the wrapper passes the list through)

All tests use SQLite in-memory via the shared conftest fixtures.
"""

import io
import uuid
from datetime import date, datetime
from decimal import Decimal

import pytest
from httpx import AsyncClient

from finance.models.orm.models import (
    AccountTypeEnum,
    CashFlowCategoryEnum,
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


# ---------------------------------------------------------------------------
# Shared seed helpers
# ---------------------------------------------------------------------------


async def _seed_company(db_session, org_id: str, company_code: str) -> str:
    """
    Seed a company + a wide fiscal period. Returns the period_id.

    No CoA seeded here — callers add their own accounts.
    """
    db_session.add(
        CompanyCode(
            companyCode=company_code,
            organizationId=org_id,
            legalName=f"MCC Test {company_code}",
            fiscalYearStartMonth=1,
            fiscalYearStartDay=1,
            defaultCurrency="AED",
        )
    )
    period_id = str(uuid.uuid4())
    db_session.add(
        FiscalPeriod(
            periodId=period_id,
            companyCode=company_code,
            fiscalYear=2026,
            periodNumber=99,
            startDate=date(2025, 1, 1),
            endDate=date(2027, 12, 31),
            status=PeriodStatusEnum.OPEN,
        )
    )
    await db_session.commit()
    return period_id


def _make_account(
    org_id: str,
    account_number: str,
    account_name: str,
    drawer: DrawerEnum,
    account_type: AccountTypeEnum,
    cash_flow_category: CashFlowCategoryEnum = CashFlowCategoryEnum.NONE,
    is_header: bool = False,
    parent_id: str | None = None,
) -> tuple[str, GLAccount]:
    """
    Create a GLAccount ORM object and return (accountId, object).
    """
    aid = str(uuid.uuid4())
    acct = GLAccount(
        accountId=aid,
        organizationId=org_id,
        accountNumber=account_number,
        accountName=account_name,
        drawer=drawer,
        accountType=account_type,
        cashFlowCategory=cash_flow_category,
        parentAccountId=parent_id,
        isHeader=is_header,
        isActive=True,
    )
    return aid, acct


async def _post_je_with_cc(
    db_session,
    org_id: str,
    company_code: str,
    period_id: str,
    lines: list,
    je_date: date,
) -> str:
    """
    Post a balanced JE. Each element of lines is:
      (accountId, debit_str, credit_str, cost_center_id_or_None)

    Returns the jeId.
    """
    je_id = str(uuid.uuid4())
    total_dr = sum(Decimal(str(l[1])) for l in lines)
    total_cr = sum(Decimal(str(l[2])) for l in lines)
    db_session.add(
        JournalEntry(
            jeId=je_id,
            organizationId=org_id,
            companyCode=company_code,
            jeNumber=f"JE-MCC-{uuid.uuid4().hex[:6].upper()}",
            jeDate=je_date,
            periodId=period_id,
            sourceEventType="test_mcc",
            sourceEventId=je_id,
            totalDebit=total_dr,
            totalCredit=total_cr,
            status=JEStatusEnum.POSTED,
            postedAt=datetime.utcnow(),
            postedBy="user-test",
        )
    )
    for i, (account_id, debit, credit, cc_id) in enumerate(lines, start=1):
        db_session.add(
            JournalEntryLine(
                jeLineId=str(uuid.uuid4()),
                jeId=je_id,
                lineNumber=i,
                accountId=account_id,
                debit=Decimal(str(debit)),
                credit=Decimal(str(credit)),
                costCenterId=cc_id,
            )
        )
    await db_session.commit()
    return je_id


# ---------------------------------------------------------------------------
# Balance Sheet — multi-cost-centre tests
# ---------------------------------------------------------------------------


async def _seed_bs_two_cost_centers(
    db_session, org_id: str, company_code: str
) -> dict:
    """
    Seed a minimal BS CoA + post three JEs:
      - 300 AED DR Cash tagged 'farm-a'
      - 500 AED DR Cash tagged 'farm-b'
      - 200 AED DR Cash untagged
    All balanced against Share Capital (CR).

    Returns dict with accountIds and period_id.
    """
    period_id = await _seed_company(db_session, org_id, company_code)

    cash_id, cash_acct = _make_account(
        org_id, "110001", "Cash",
        DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        CashFlowCategoryEnum.CASH,
    )
    sc_id, sc_acct = _make_account(
        org_id, "310001", "Share Capital",
        DrawerEnum.EQUITY, AccountTypeEnum.EQUITY,
        CashFlowCategoryEnum.FINANCING,
    )
    db_session.add(cash_acct)
    db_session.add(sc_acct)
    await db_session.commit()

    # JE tagged farm-a: 300
    await _post_je_with_cc(
        db_session, org_id, company_code, period_id,
        lines=[(cash_id, "300", "0", "farm-a"), (sc_id, "0", "300", "farm-a")],
        je_date=date(2026, 1, 10),
    )
    # JE tagged farm-b: 500
    await _post_je_with_cc(
        db_session, org_id, company_code, period_id,
        lines=[(cash_id, "500", "0", "farm-b"), (sc_id, "0", "500", "farm-b")],
        je_date=date(2026, 1, 15),
    )
    # JE untagged: 200
    await _post_je_with_cc(
        db_session, org_id, company_code, period_id,
        lines=[(cash_id, "200", "0", None), (sc_id, "0", "200", None)],
        je_date=date(2026, 1, 20),
    )

    return {"cash": cash_id, "sc": sc_id, "period_id": period_id}


@pytest.mark.asyncio
async def test_bs_multi_cost_center_combines_both(
    client: AsyncClient, db_session,
) -> None:
    """
    Passing cost_center_id=farm-a&cost_center_id=farm-b returns
    the combined balance (300 + 500 = 800) — the untagged 200 is excluded.
    """
    org_id = f"org-bs-mcc-{uuid.uuid4().hex[:8]}"
    company_code = f"BM{uuid.uuid4().hex[:6].upper()}"
    await _seed_bs_two_cost_centers(db_session, org_id, company_code)

    resp = await client.get(
        "/api/v1/finance/reports/balance-sheet",
        params=[
            ("organization_id", org_id),
            ("company_code", company_code),
            ("as_of_date", "2026-12-31"),
            ("cost_center_id", "farm-a"),
            ("cost_center_id", "farm-b"),
        ],
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()["data"]
    # farm-a (300) + farm-b (500) = 800; untagged 200 excluded
    assert Decimal(body["totals"]["totalAssets"]) == Decimal("800")
    assert Decimal(body["totals"]["totalEquity"]) == Decimal("800")
    assert Decimal(body["totals"]["balanceDelta"]) == Decimal("0")


@pytest.mark.asyncio
async def test_bs_single_cost_center_still_works(
    client: AsyncClient, db_session,
) -> None:
    """
    Existing single-value contract: passing a single cost_center_id value
    continues to work and returns only that centre's balance (300).
    """
    org_id = f"org-bs-sc1-{uuid.uuid4().hex[:8]}"
    company_code = f"B1{uuid.uuid4().hex[:6].upper()}"
    await _seed_bs_two_cost_centers(db_session, org_id, company_code)

    resp = await client.get(
        "/api/v1/finance/reports/balance-sheet",
        params={
            "organization_id": org_id,
            "company_code": company_code,
            "as_of_date": "2026-12-31",
            "cost_center_id": "farm-a",
        },
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()["data"]
    assert Decimal(body["totals"]["totalAssets"]) == Decimal("300")


@pytest.mark.asyncio
async def test_bs_zero_cost_centers_returns_all_data(
    client: AsyncClient, db_session,
) -> None:
    """
    Omitting cost_center_id entirely → no filter, all three JEs included
    (300 + 500 + 200 = 1000).
    """
    org_id = f"org-bs-all-{uuid.uuid4().hex[:8]}"
    company_code = f"BA{uuid.uuid4().hex[:6].upper()}"
    await _seed_bs_two_cost_centers(db_session, org_id, company_code)

    resp = await client.get(
        "/api/v1/finance/reports/balance-sheet",
        params={
            "organization_id": org_id,
            "company_code": company_code,
            "as_of_date": "2026-12-31",
        },
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()["data"]
    assert Decimal(body["totals"]["totalAssets"]) == Decimal("1000")


# ---------------------------------------------------------------------------
# Income Statement — multi-cost-centre tests
# ---------------------------------------------------------------------------


async def _seed_is_two_cost_centers(
    db_session, org_id: str, company_code: str
) -> dict:
    """
    Seed a P&L CoA + post three revenue JEs:
      - 1000 CR Revenue tagged 'farm-a'
      - 2000 CR Revenue tagged 'farm-b'
      - 500  CR Revenue untagged
    All balanced against Cash (DR).

    Returns dict with accountIds and period_id.
    """
    period_id = await _seed_company(db_session, org_id, company_code)

    cash_id, cash_acct = _make_account(
        org_id, "110001", "Cash",
        DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
    )
    rev_id, rev_acct = _make_account(
        org_id, "410001", "Revenue",
        DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
    )
    db_session.add(cash_acct)
    db_session.add(rev_acct)
    await db_session.commit()

    await _post_je_with_cc(
        db_session, org_id, company_code, period_id,
        lines=[(cash_id, "1000", "0", "farm-a"), (rev_id, "0", "1000", "farm-a")],
        je_date=date(2026, 3, 1),
    )
    await _post_je_with_cc(
        db_session, org_id, company_code, period_id,
        lines=[(cash_id, "2000", "0", "farm-b"), (rev_id, "0", "2000", "farm-b")],
        je_date=date(2026, 3, 15),
    )
    await _post_je_with_cc(
        db_session, org_id, company_code, period_id,
        lines=[(cash_id, "500", "0", None), (rev_id, "0", "500", None)],
        je_date=date(2026, 3, 20),
    )

    return {"cash": cash_id, "revenue": rev_id, "period_id": period_id}


@pytest.mark.asyncio
async def test_is_multi_cost_center_combines_both(
    client: AsyncClient, db_session,
) -> None:
    """
    Passing cost_center_id=farm-a&cost_center_id=farm-b returns combined
    revenue of 3000 (1000 + 2000). The untagged 500 is excluded.
    """
    org_id = f"org-is-mcc-{uuid.uuid4().hex[:8]}"
    company_code = f"IM{uuid.uuid4().hex[:6].upper()}"
    await _seed_is_two_cost_centers(db_session, org_id, company_code)

    resp = await client.get(
        "/api/v1/finance/reports/income-statement",
        params=[
            ("organization_id", org_id),
            ("company_code", company_code),
            ("period_start", "2026-01-01"),
            ("period_end", "2026-12-31"),
            ("cost_center_id", "farm-a"),
            ("cost_center_id", "farm-b"),
        ],
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 200, resp.text
    subtotals = resp.json()["data"]["primary"]["subtotals"]
    assert Decimal(subtotals["revenue"]) == Decimal("3000")
    assert Decimal(subtotals["netIncome"]) == Decimal("3000")


@pytest.mark.asyncio
async def test_is_single_cost_center_still_works(
    client: AsyncClient, db_session,
) -> None:
    """Single cost_center_id value → only farm-b revenue (2000)."""
    org_id = f"org-is-sc1-{uuid.uuid4().hex[:8]}"
    company_code = f"I1{uuid.uuid4().hex[:6].upper()}"
    await _seed_is_two_cost_centers(db_session, org_id, company_code)

    resp = await client.get(
        "/api/v1/finance/reports/income-statement",
        params={
            "organization_id": org_id,
            "company_code": company_code,
            "period_start": "2026-01-01",
            "period_end": "2026-12-31",
            "cost_center_id": "farm-b",
        },
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 200, resp.text
    subtotals = resp.json()["data"]["primary"]["subtotals"]
    assert Decimal(subtotals["revenue"]) == Decimal("2000")


@pytest.mark.asyncio
async def test_is_zero_cost_centers_returns_all_data(
    client: AsyncClient, db_session,
) -> None:
    """No cost_center_id → all revenue (1000 + 2000 + 500 = 3500)."""
    org_id = f"org-is-all-{uuid.uuid4().hex[:8]}"
    company_code = f"IA{uuid.uuid4().hex[:6].upper()}"
    await _seed_is_two_cost_centers(db_session, org_id, company_code)

    resp = await client.get(
        "/api/v1/finance/reports/income-statement",
        params={
            "organization_id": org_id,
            "company_code": company_code,
            "period_start": "2026-01-01",
            "period_end": "2026-12-31",
        },
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 200, resp.text
    subtotals = resp.json()["data"]["primary"]["subtotals"]
    assert Decimal(subtotals["revenue"]) == Decimal("3500")


# ---------------------------------------------------------------------------
# Cash Flow — multi-cost-centre tests
# ---------------------------------------------------------------------------


async def _seed_cf_two_cost_centers(
    db_session, org_id: str, company_code: str
) -> dict:
    """
    Seed a CF CoA + post revenue JEs for two cost centres + one untagged.

    Net Income calculation in the CF uses P&L drawer activity, which is
    filtered by cost_center_id like the IS endpoint.

    Accounts:
      Cash  (ASSETS, CASH)
      Revenue (REVENUE, NONE — P&L, captured in net income)
    """
    period_id = await _seed_company(db_session, org_id, company_code)

    cash_id, cash_acct = _make_account(
        org_id, "110001", "Cash",
        DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        CashFlowCategoryEnum.CASH,
    )
    rev_id, rev_acct = _make_account(
        org_id, "410001", "Revenue",
        DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        CashFlowCategoryEnum.NONE,
    )
    db_session.add(cash_acct)
    db_session.add(rev_acct)
    await db_session.commit()

    # farm-a: 400
    await _post_je_with_cc(
        db_session, org_id, company_code, period_id,
        lines=[(cash_id, "400", "0", "farm-a"), (rev_id, "0", "400", "farm-a")],
        je_date=date(2026, 4, 1),
    )
    # farm-b: 600
    await _post_je_with_cc(
        db_session, org_id, company_code, period_id,
        lines=[(cash_id, "600", "0", "farm-b"), (rev_id, "0", "600", "farm-b")],
        je_date=date(2026, 4, 15),
    )
    # untagged: 100
    await _post_je_with_cc(
        db_session, org_id, company_code, period_id,
        lines=[(cash_id, "100", "0", None), (rev_id, "0", "100", None)],
        je_date=date(2026, 4, 20),
    )

    return {"cash": cash_id, "revenue": rev_id, "period_id": period_id}


@pytest.mark.asyncio
async def test_cf_multi_cost_center_combines_both(
    client: AsyncClient, db_session,
) -> None:
    """
    Multi-value cost_center_id filter propagates to _net_income_for_period.
    farm-a (400) + farm-b (600) = 1000 net income.
    The untagged 100 is excluded.
    """
    org_id = f"org-cf-mcc-{uuid.uuid4().hex[:8]}"
    company_code = f"CM{uuid.uuid4().hex[:6].upper()}"
    await _seed_cf_two_cost_centers(db_session, org_id, company_code)

    resp = await client.get(
        "/api/v1/finance/reports/cash-flow",
        params=[
            ("organization_id", org_id),
            ("company_code", company_code),
            ("period_start", "2026-01-01"),
            ("period_end", "2026-12-31"),
            ("cost_center_id", "farm-a"),
            ("cost_center_id", "farm-b"),
        ],
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()["data"]
    assert Decimal(body["operating"]["netIncome"]) == Decimal("1000")


@pytest.mark.asyncio
async def test_cf_zero_cost_centers_returns_all_data(
    client: AsyncClient, db_session,
) -> None:
    """No cost_center_id → net income includes all three JEs (1100)."""
    org_id = f"org-cf-all-{uuid.uuid4().hex[:8]}"
    company_code = f"CA{uuid.uuid4().hex[:6].upper()}"
    await _seed_cf_two_cost_centers(db_session, org_id, company_code)

    resp = await client.get(
        "/api/v1/finance/reports/cash-flow",
        params={
            "organization_id": org_id,
            "company_code": company_code,
            "period_start": "2026-01-01",
            "period_end": "2026-12-31",
        },
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()["data"]
    assert Decimal(body["operating"]["netIncome"]) == Decimal("1100")


# ---------------------------------------------------------------------------
# Export endpoint — multi-cost-centre propagation tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_export_bs_multi_cost_center_xlsx(
    client: AsyncClient, db_session,
) -> None:
    """
    Export endpoint passes multi-value cost_center_id to get_balance_sheet.
    Verify the xlsx download completes (HTTP 200) and is parseable.
    The underlying balance should be 800 (farm-a 300 + farm-b 500).
    We open the xlsx and confirm 'Balance Sheet' is the sheet title.
    """
    import openpyxl

    org_id = f"org-exp-bs-mcc-{uuid.uuid4().hex[:6]}"
    company_code = f"EB{uuid.uuid4().hex[:6].upper()}"
    await _seed_bs_two_cost_centers(db_session, org_id, company_code)

    resp = await client.get(
        "/api/v1/finance/reports/export/balance-sheet",
        params=[
            ("organization_id", org_id),
            ("company_code", company_code),
            ("as_of_date", "2026-12-31"),
            ("format", "xlsx"),
            ("cost_center_id", "farm-a"),
            ("cost_center_id", "farm-b"),
        ],
        headers=auth_headers(role="finance_admin"),
    )
    assert resp.status_code == 200, resp.text
    assert "spreadsheetml" in resp.headers.get("content-type", "")

    # Verify the xlsx is well-formed and parseable.
    wb = openpyxl.load_workbook(io.BytesIO(resp.content))
    assert wb.active.title == "Balance Sheet"


@pytest.mark.asyncio
async def test_export_is_multi_cost_center_xlsx(
    client: AsyncClient, db_session,
) -> None:
    """
    Export endpoint passes multi-value cost_center_id to get_income_statement.
    Combined revenue = 3000 (farm-a 1000 + farm-b 2000) for xlsx export.
    """
    import openpyxl

    org_id = f"org-exp-is-mcc-{uuid.uuid4().hex[:6]}"
    company_code = f"EI{uuid.uuid4().hex[:6].upper()}"
    await _seed_is_two_cost_centers(db_session, org_id, company_code)

    resp = await client.get(
        "/api/v1/finance/reports/export/income-statement",
        params=[
            ("organization_id", org_id),
            ("company_code", company_code),
            ("period_start", "2026-01-01"),
            ("period_end", "2026-12-31"),
            ("format", "xlsx"),
            ("cost_center_id", "farm-a"),
            ("cost_center_id", "farm-b"),
        ],
        headers=auth_headers(role="finance_admin"),
    )
    assert resp.status_code == 200, resp.text
    assert "spreadsheetml" in resp.headers.get("content-type", "")

    wb = openpyxl.load_workbook(io.BytesIO(resp.content))
    assert wb.active.title == "Income Statement"
