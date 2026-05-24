"""Tests for GET /reports/cash-flow (Wave 2 / T-060.5, indirect method)."""

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


# ─── Helpers ─────────────────────────────────────────────────────────────


async def _seed_cf_coa(db_session, org_id, company_code):
    """
    Seed a company + a CoA that covers every cashFlowCategory plus a
    revenue account for Net Income. Returns dict of accountIds + period.

    Accounts:
      Cash (ASSETS, CASH)
      AR (ASSETS, WORKING_CAPITAL)
      Inventory (ASSETS, WORKING_CAPITAL)
      PPE (ASSETS, INVESTING)
      Accum Depn (ASSETS, NON_CASH_ADJUSTMENT) — contra asset
      AP (LIABILITIES, WORKING_CAPITAL)
      EOSB Provision (LIABILITIES, NON_CASH_ADJUSTMENT)
      Long-Term Loan (LIABILITIES, FINANCING)
      Share Capital (EQUITY, FINANCING)
      Revenue (REVENUE, n/a)
      Depreciation Expense (OPERATING_COST, n/a)
    """
    db_session.add(
        CompanyCode(
            companyCode=company_code,
            organizationId=org_id,
            legalName=f"CF Test {company_code}",
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

    ids = {"period_id": period_id}
    accounts = [
        # (code, name, drawer, type, cashFlowCategory, key)
        ("110001", "Cash at Bank", DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
         CashFlowCategoryEnum.CASH, "cash"),
        ("110002", "Accounts Receivable", DrawerEnum.ASSETS,
         AccountTypeEnum.ASSET, CashFlowCategoryEnum.WORKING_CAPITAL, "ar"),
        ("110003", "Inventory", DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
         CashFlowCategoryEnum.WORKING_CAPITAL, "inventory"),
        ("110004", "PPE - Equipment", DrawerEnum.ASSETS,
         AccountTypeEnum.ASSET, CashFlowCategoryEnum.INVESTING, "ppe"),
        ("110005", "Accumulated Depreciation", DrawerEnum.ASSETS,
         AccountTypeEnum.ASSET, CashFlowCategoryEnum.NON_CASH_ADJUSTMENT,
         "accum_depn"),
        ("210001", "Accounts Payable", DrawerEnum.LIABILITIES,
         AccountTypeEnum.LIABILITY,
         CashFlowCategoryEnum.WORKING_CAPITAL, "ap"),
        ("210002", "EOSB Provision", DrawerEnum.LIABILITIES,
         AccountTypeEnum.LIABILITY,
         CashFlowCategoryEnum.NON_CASH_ADJUSTMENT, "eosb"),
        ("210003", "Long-Term Loan", DrawerEnum.LIABILITIES,
         AccountTypeEnum.LIABILITY, CashFlowCategoryEnum.FINANCING, "loan"),
        ("310001", "Share Capital", DrawerEnum.EQUITY,
         AccountTypeEnum.EQUITY, CashFlowCategoryEnum.FINANCING,
         "share_capital"),
        ("411001", "Revenue", DrawerEnum.REVENUE,
         AccountTypeEnum.REVENUE, CashFlowCategoryEnum.NONE, "revenue"),
        ("611001", "Depreciation Expense", DrawerEnum.OPERATING_COST,
         AccountTypeEnum.EXPENSE, CashFlowCategoryEnum.NONE, "depn_exp"),
    ]
    for code, name, drawer, atype, cfc, key in accounts:
        aid = str(uuid.uuid4())
        ids[key] = aid
        db_session.add(
            GLAccount(
                accountId=aid, organizationId=org_id, accountNumber=code,
                accountName=name, drawer=drawer, accountType=atype,
                cashFlowCategory=cfc, isHeader=False, isActive=True,
            )
        )
    await db_session.commit()
    return ids


async def _post(
    db_session, org_id, company_code, period_id, lines, je_date,
):
    je_id = str(uuid.uuid4())
    dr_total = sum(Decimal(str(l[1])) for l in lines)
    cr_total = sum(Decimal(str(l[2])) for l in lines)
    db_session.add(JournalEntry(
        jeId=je_id, organizationId=org_id, companyCode=company_code,
        jeNumber=f"JE-{company_code}-{je_date.year}-T{uuid.uuid4().hex[:4].upper()}",
        jeDate=je_date, periodId=period_id, sourceEventType="test_seed",
        sourceEventId=je_id, totalDebit=dr_total, totalCredit=cr_total,
        status=JEStatusEnum.POSTED,
        postedAt=datetime.utcnow(), postedBy="user-test",
    ))
    for i, (aid, dr, cr) in enumerate(lines, start=1):
        db_session.add(JournalEntryLine(
            jeLineId=str(uuid.uuid4()), jeId=je_id, lineNumber=i,
            accountId=aid, debit=Decimal(str(dr)), credit=Decimal(str(cr)),
        ))
    await db_session.commit()


# ─── Tests ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cf_empty_org_returns_zeros(
    client: AsyncClient, db_session,
) -> None:
    """No JEs → every section zero, no warning."""
    org_id = f"org-cf-empty-{uuid.uuid4().hex[:8]}"
    company_code = f"CE{uuid.uuid4().hex[:6].upper()}"
    await _seed_cf_coa(db_session, org_id, company_code)

    resp = await client.get(
        "/api/v1/finance/reports/cash-flow",
        params={"organization_id": org_id, "company_code": company_code,
                "period_start": "2026-01-01", "period_end": "2026-12-31"},
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()["data"]
    assert Decimal(body["operating"]["netIncome"]) == Decimal("0")
    assert Decimal(body["operating"]["total"]) == Decimal("0")
    assert Decimal(body["investing"]["total"]) == Decimal("0")
    assert Decimal(body["financing"]["total"]) == Decimal("0")
    assert Decimal(body["netChangeInCash"]) == Decimal("0")
    assert Decimal(body["cashAtBeginning"]) == Decimal("0")
    assert Decimal(body["cashAtEnd"]) == Decimal("0")
    assert body["warnings"] == []


@pytest.mark.asyncio
async def test_cf_pure_revenue_reconciles(
    client: AsyncClient, db_session,
) -> None:
    """
    Only activity: DR Cash 1000 / CR Revenue 1000.
      netIncome = 1000
      operating total = 1000 (no non-cash, no WC)
      cash begin = 0, cash end = 1000, delta = 1000
      reconciles: netChange (1000) == cashDelta (1000)
    """
    org_id = f"org-cf-rev-{uuid.uuid4().hex[:8]}"
    company_code = f"RV{uuid.uuid4().hex[:6].upper()}"
    ids = await _seed_cf_coa(db_session, org_id, company_code)
    await _post(
        db_session, org_id, company_code, ids["period_id"],
        lines=[(ids["cash"], "1000", "0"), (ids["revenue"], "0", "1000")],
        je_date=date(2026, 6, 1),
    )

    resp = await client.get(
        "/api/v1/finance/reports/cash-flow",
        params={"organization_id": org_id, "company_code": company_code,
                "period_start": "2026-01-01", "period_end": "2026-12-31"},
        headers=auth_headers(role="auditor"),
    )
    body = resp.json()["data"]
    assert Decimal(body["operating"]["netIncome"]) == Decimal("1000")
    assert Decimal(body["netChangeInCash"]) == Decimal("1000")
    assert Decimal(body["cashAtBeginning"]) == Decimal("0")
    assert Decimal(body["cashAtEnd"]) == Decimal("1000")
    assert Decimal(body["reconciliationDelta"]) == Decimal("0")
    assert body["warnings"] == []


@pytest.mark.asyncio
async def test_cf_depreciation_added_back_as_non_cash(
    client: AsyncClient, db_session,
) -> None:
    """
    Scenario: 1000 cash revenue + 200 depreciation.
      DR Depreciation Expense 200 / CR Accumulated Depreciation 200
      → NI = 1000 - 200 = 800
      Cash effect: only the 1000 came in; the 200 is non-cash.
      CF: NI(800) + non-cash adj(200) = operating 1000.
      Cash begin = 0, cash end = 1000 → reconciles.
    """
    org_id = f"org-cf-depn-{uuid.uuid4().hex[:8]}"
    company_code = f"DP{uuid.uuid4().hex[:6].upper()}"
    ids = await _seed_cf_coa(db_session, org_id, company_code)
    p = ids["period_id"]

    await _post(db_session, org_id, company_code, p,
                lines=[(ids["cash"], "1000", "0"),
                       (ids["revenue"], "0", "1000")],
                je_date=date(2026, 6, 1))
    await _post(db_session, org_id, company_code, p,
                lines=[(ids["depn_exp"], "200", "0"),
                       (ids["accum_depn"], "0", "200")],
                je_date=date(2026, 12, 31))

    resp = await client.get(
        "/api/v1/finance/reports/cash-flow",
        params={"organization_id": org_id, "company_code": company_code,
                "period_start": "2026-01-01", "period_end": "2026-12-31"},
        headers=auth_headers(role="auditor"),
    )
    body = resp.json()["data"]
    assert Decimal(body["operating"]["netIncome"]) == Decimal("800")
    assert Decimal(body["operating"]["nonCashAdjustmentsTotal"]) == Decimal("200")
    assert Decimal(body["operating"]["total"]) == Decimal("1000")
    # cashAtBeginning=0, cashAtEnd=1000
    assert Decimal(body["netChangeInCash"]) == Decimal("1000")
    assert Decimal(body["cashDelta"]) == Decimal("1000")
    assert Decimal(body["reconciliationDelta"]) == Decimal("0")
    # Accum Depn line surfaces in non-cash list.
    assert len(body["operating"]["nonCashAdjustments"]) == 1
    item = body["operating"]["nonCashAdjustments"][0]
    assert item["accountNumber"] == "110005"
    assert Decimal(item["contribution"]) == Decimal("200")


@pytest.mark.asyncio
async def test_cf_working_capital_changes_reconcile(
    client: AsyncClient, db_session,
) -> None:
    """
    Two WC accounts changing during the period:
      DR AR 500 / CR Revenue 500   (sale on credit — NI +500, AR +500)
      DR Inventory 300 / CR AP 300 (inventory bought on credit)
    Then DR Cash 200 / CR AR 200 (partial AR collection)
    Net cash change: 200 (the cash collected).

    NI = 500 (revenue)
    Working capital changes (sign for cash):
      AR: started 0, ended 300 → Δ=+300 (asset) → -300 cash
      Inventory: started 0, ended 300 → Δ=+300 → -300 cash
      AP: started 0, ended 300 (CR-natural) → Δ=+300 (liability) → +300 cash
    WC total = -300 -300 +300 = -300
    Operating = 500 + 0 (no non-cash) - 300 = 200 ✓
    """
    org_id = f"org-cf-wc-{uuid.uuid4().hex[:8]}"
    company_code = f"WC{uuid.uuid4().hex[:6].upper()}"
    ids = await _seed_cf_coa(db_session, org_id, company_code)
    p = ids["period_id"]

    await _post(db_session, org_id, company_code, p,
                lines=[(ids["ar"], "500", "0"),
                       (ids["revenue"], "0", "500")],
                je_date=date(2026, 2, 1))
    await _post(db_session, org_id, company_code, p,
                lines=[(ids["inventory"], "300", "0"),
                       (ids["ap"], "0", "300")],
                je_date=date(2026, 2, 10))
    await _post(db_session, org_id, company_code, p,
                lines=[(ids["cash"], "200", "0"),
                       (ids["ar"], "0", "200")],
                je_date=date(2026, 2, 15))

    resp = await client.get(
        "/api/v1/finance/reports/cash-flow",
        params={"organization_id": org_id, "company_code": company_code,
                "period_start": "2026-01-01", "period_end": "2026-12-31"},
        headers=auth_headers(role="auditor"),
    )
    body = resp.json()["data"]
    assert Decimal(body["operating"]["netIncome"]) == Decimal("500")
    assert Decimal(body["operating"]["workingCapitalChangesTotal"]) == Decimal("-300")
    assert Decimal(body["operating"]["total"]) == Decimal("200")
    assert Decimal(body["netChangeInCash"]) == Decimal("200")
    assert Decimal(body["cashDelta"]) == Decimal("200")
    assert Decimal(body["reconciliationDelta"]) == Decimal("0")


@pytest.mark.asyncio
async def test_cf_investing_activity_shows_negative_for_asset_purchase(
    client: AsyncClient, db_session,
) -> None:
    """
    Buy PPE for 5000 cash: DR PPE 5000 / CR Cash 5000.
    No NI impact (no expense booked).
    Investing total = -5000 (cash outflow).
    cashAtBeginning = 0, cashAtEnd = -5000 (negative cash for the test).
    netChange = 0 + 0 + -5000 = -5000.
    reconciles.
    """
    org_id = f"org-cf-inv-{uuid.uuid4().hex[:8]}"
    company_code = f"IV{uuid.uuid4().hex[:6].upper()}"
    ids = await _seed_cf_coa(db_session, org_id, company_code)
    p = ids["period_id"]

    await _post(db_session, org_id, company_code, p,
                lines=[(ids["ppe"], "5000", "0"),
                       (ids["cash"], "0", "5000")],
                je_date=date(2026, 4, 1))

    resp = await client.get(
        "/api/v1/finance/reports/cash-flow",
        params={"organization_id": org_id, "company_code": company_code,
                "period_start": "2026-01-01", "period_end": "2026-12-31"},
        headers=auth_headers(role="auditor"),
    )
    body = resp.json()["data"]
    assert Decimal(body["investing"]["total"]) == Decimal("-5000")
    assert len(body["investing"]["items"]) == 1
    assert Decimal(body["investing"]["items"][0]["contribution"]) == Decimal("-5000")
    assert Decimal(body["netChangeInCash"]) == Decimal("-5000")
    assert Decimal(body["cashAtEnd"]) == Decimal("-5000")
    assert Decimal(body["reconciliationDelta"]) == Decimal("0")


@pytest.mark.asyncio
async def test_cf_financing_inflow_for_loan_drawdown(
    client: AsyncClient, db_session,
) -> None:
    """
    Draw down a 10000 loan: DR Cash 10000 / CR Long-Term Loan 10000.
    Financing total = +10000.
    """
    org_id = f"org-cf-fin-{uuid.uuid4().hex[:8]}"
    company_code = f"FN{uuid.uuid4().hex[:6].upper()}"
    ids = await _seed_cf_coa(db_session, org_id, company_code)
    p = ids["period_id"]

    await _post(db_session, org_id, company_code, p,
                lines=[(ids["cash"], "10000", "0"),
                       (ids["loan"], "0", "10000")],
                je_date=date(2026, 3, 1))

    resp = await client.get(
        "/api/v1/finance/reports/cash-flow",
        params={"organization_id": org_id, "company_code": company_code,
                "period_start": "2026-01-01", "period_end": "2026-12-31"},
        headers=auth_headers(role="auditor"),
    )
    body = resp.json()["data"]
    assert Decimal(body["financing"]["total"]) == Decimal("10000")
    assert Decimal(body["netChangeInCash"]) == Decimal("10000")
    assert Decimal(body["cashAtEnd"]) == Decimal("10000")
    assert Decimal(body["reconciliationDelta"]) == Decimal("0")


@pytest.mark.asyncio
async def test_cf_full_scenario_reconciles(
    client: AsyncClient, db_session,
) -> None:
    """
    Realistic mixed scenario combining all sections — verifies reconciliation:
      Beginning cash: 0
      1. Share capital injection: DR Cash 100000 / CR Share Capital 100000
         (financing +100000)
      2. Loan: DR Cash 50000 / CR Loan 50000 (financing +50000)
      3. Buy PPE: DR PPE 30000 / CR Cash 30000 (investing -30000)
      4. Sale on credit: DR AR 8000 / CR Revenue 8000 (NI +8000, WC -8000)
      5. AR collection: DR Cash 5000 / CR AR 5000 (WC +5000 for AR collection)
      6. Depreciation: DR Depn Exp 2000 / CR Accum Depn 2000 (NI -2000, non-cash +2000)

    Expected:
      NI = 8000 - 2000 = 6000
      Non-cash adjustments = +2000 (depreciation add-back)
      WC: AR Δ = +3000 (8000 - 5000) → -3000 cash contribution
      WC total = -3000
      Operating = 6000 + 2000 - 3000 = 5000
      Investing = -30000
      Financing = +150000
      Net Change = 5000 - 30000 + 150000 = 125000
      Cash actually moved: +100000 +50000 -30000 +5000 = +125000 ✓
    """
    org_id = f"org-cf-full-{uuid.uuid4().hex[:8]}"
    company_code = f"FL{uuid.uuid4().hex[:6].upper()}"
    ids = await _seed_cf_coa(db_session, org_id, company_code)
    p = ids["period_id"]

    await _post(db_session, org_id, company_code, p,
                lines=[(ids["cash"], "100000", "0"),
                       (ids["share_capital"], "0", "100000")],
                je_date=date(2026, 1, 5))
    await _post(db_session, org_id, company_code, p,
                lines=[(ids["cash"], "50000", "0"),
                       (ids["loan"], "0", "50000")],
                je_date=date(2026, 1, 10))
    await _post(db_session, org_id, company_code, p,
                lines=[(ids["ppe"], "30000", "0"),
                       (ids["cash"], "0", "30000")],
                je_date=date(2026, 2, 1))
    await _post(db_session, org_id, company_code, p,
                lines=[(ids["ar"], "8000", "0"),
                       (ids["revenue"], "0", "8000")],
                je_date=date(2026, 3, 15))
    await _post(db_session, org_id, company_code, p,
                lines=[(ids["cash"], "5000", "0"),
                       (ids["ar"], "0", "5000")],
                je_date=date(2026, 4, 20))
    await _post(db_session, org_id, company_code, p,
                lines=[(ids["depn_exp"], "2000", "0"),
                       (ids["accum_depn"], "0", "2000")],
                je_date=date(2026, 12, 31))

    resp = await client.get(
        "/api/v1/finance/reports/cash-flow",
        params={"organization_id": org_id, "company_code": company_code,
                "period_start": "2026-01-01", "period_end": "2026-12-31"},
        headers=auth_headers(role="auditor"),
    )
    body = resp.json()["data"]
    assert Decimal(body["operating"]["netIncome"]) == Decimal("6000")
    assert Decimal(body["operating"]["nonCashAdjustmentsTotal"]) == Decimal("2000")
    assert Decimal(body["operating"]["workingCapitalChangesTotal"]) == Decimal("-3000")
    assert Decimal(body["operating"]["total"]) == Decimal("5000")
    assert Decimal(body["investing"]["total"]) == Decimal("-30000")
    assert Decimal(body["financing"]["total"]) == Decimal("150000")
    assert Decimal(body["netChangeInCash"]) == Decimal("125000")
    assert Decimal(body["cashDelta"]) == Decimal("125000")
    assert Decimal(body["reconciliationDelta"]) == Decimal("0")
    assert body["warnings"] == []


@pytest.mark.asyncio
async def test_cf_unclassified_account_triggers_reconciliation_warning(
    client: AsyncClient, db_session,
) -> None:
    """
    An asset account left at cashFlowCategory='none' (operator hasn't
    classified it yet) silently drops out of the computation,
    breaking reconciliation. The endpoint surfaces a warning.

    DR Cash 1000 / CR <Unclassified Liability 'none'> 1000.
    NI = 0 (no P&L). Operating = 0. Investing = 0. Financing = 0.
    Net Change = 0. But cash actually went up by 1000.
    → reconciliationDelta = -1000 → warning.
    """
    org_id = f"org-cf-warn-{uuid.uuid4().hex[:8]}"
    company_code = f"WR{uuid.uuid4().hex[:6].upper()}"
    ids = await _seed_cf_coa(db_session, org_id, company_code)
    p = ids["period_id"]

    # Add an unclassified liability.
    unclassified_id = str(uuid.uuid4())
    db_session.add(GLAccount(
        accountId=unclassified_id, organizationId=org_id,
        accountNumber="210099", accountName="Unclassified Liability",
        drawer=DrawerEnum.LIABILITIES, accountType=AccountTypeEnum.LIABILITY,
        cashFlowCategory=CashFlowCategoryEnum.NONE,
        isHeader=False, isActive=True,
    ))
    await db_session.commit()

    await _post(db_session, org_id, company_code, p,
                lines=[(ids["cash"], "1000", "0"),
                       (unclassified_id, "0", "1000")],
                je_date=date(2026, 5, 1))

    resp = await client.get(
        "/api/v1/finance/reports/cash-flow",
        params={"organization_id": org_id, "company_code": company_code,
                "period_start": "2026-01-01", "period_end": "2026-12-31"},
        headers=auth_headers(role="auditor"),
    )
    body = resp.json()["data"]
    assert Decimal(body["netChangeInCash"]) == Decimal("0")
    assert Decimal(body["cashDelta"]) == Decimal("1000")
    assert Decimal(body["reconciliationDelta"]) == Decimal("-1000")
    assert len(body["warnings"]) == 1
    assert "reconcile" in body["warnings"][0].lower()


@pytest.mark.asyncio
async def test_cf_period_filter_excludes_prior_year_activity(
    client: AsyncClient, db_session,
) -> None:
    """
    Period 2026-Q1: revenue posted in 2025 must be in OPENING balances
    (i.e., not contribute to period NI or to changes during 2026-Q1).
    """
    org_id = f"org-cf-pf-{uuid.uuid4().hex[:8]}"
    company_code = f"PF{uuid.uuid4().hex[:6].upper()}"
    ids = await _seed_cf_coa(db_session, org_id, company_code)
    p = ids["period_id"]

    # 2025 cash sale — establishes opening cash balance of 700.
    await _post(db_session, org_id, company_code, p,
                lines=[(ids["cash"], "700", "0"),
                       (ids["revenue"], "0", "700")],
                je_date=date(2025, 6, 1))
    # 2026 Q1 cash sale — should be the only activity counted.
    await _post(db_session, org_id, company_code, p,
                lines=[(ids["cash"], "200", "0"),
                       (ids["revenue"], "0", "200")],
                je_date=date(2026, 2, 15))

    resp = await client.get(
        "/api/v1/finance/reports/cash-flow",
        params={"organization_id": org_id, "company_code": company_code,
                "period_start": "2026-01-01", "period_end": "2026-03-31"},
        headers=auth_headers(role="auditor"),
    )
    body = resp.json()["data"]
    assert Decimal(body["operating"]["netIncome"]) == Decimal("200")
    assert Decimal(body["cashAtBeginning"]) == Decimal("700")
    assert Decimal(body["cashAtEnd"]) == Decimal("900")
    assert Decimal(body["cashDelta"]) == Decimal("200")
    assert Decimal(body["netChangeInCash"]) == Decimal("200")
    assert Decimal(body["reconciliationDelta"]) == Decimal("0")


@pytest.mark.asyncio
async def test_cf_inverted_period_returns_400(
    client: AsyncClient, db_session,
) -> None:
    org_id = f"org-cf-bad-{uuid.uuid4().hex[:8]}"
    company_code = f"BD{uuid.uuid4().hex[:6].upper()}"
    await _seed_cf_coa(db_session, org_id, company_code)
    resp = await client.get(
        "/api/v1/finance/reports/cash-flow",
        params={"organization_id": org_id, "company_code": company_code,
                "period_start": "2026-12-31", "period_end": "2026-01-01"},
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_cf_unknown_company_returns_404(client: AsyncClient) -> None:
    resp = await client.get(
        "/api/v1/finance/reports/cash-flow",
        params={"organization_id": "anything", "company_code": "NONEXIST",
                "period_start": "2026-01-01", "period_end": "2026-12-31"},
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_cf_non_finance_role_forbidden(
    client: AsyncClient, db_session,
) -> None:
    org_id = f"org-cf-auth-{uuid.uuid4().hex[:8]}"
    company_code = f"AU{uuid.uuid4().hex[:6].upper()}"
    await _seed_cf_coa(db_session, org_id, company_code)
    resp = await client.get(
        "/api/v1/finance/reports/cash-flow",
        params={"organization_id": org_id, "company_code": company_code,
                "period_start": "2026-01-01", "period_end": "2026-12-31"},
        headers=auth_headers(role="user"),
    )
    assert resp.status_code == 403
