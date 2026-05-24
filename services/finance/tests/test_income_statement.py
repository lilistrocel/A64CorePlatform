"""Tests for GET /reports/income-statement (Wave 2 / T-060.4)."""

import uuid
from datetime import date, datetime
from decimal import Decimal

import pytest
from httpx import AsyncClient

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


async def _seed_pl_coa(db_session, org_id, company_code):
    """
    Seed a company + one leaf account per P&L drawer + a Cash asset
    (so balanced JEs can be posted). Returns dict of accountIds + period.

    Accounts created:
      Revenue (REVENUE / revenue)
      COGS (COST_OF_SALES / expense)
      Salaries (OPERATING_COST / expense)
      Other Income (OTHER_INCOME / revenue)
      Interest Expense (NON_OPERATING / expense)
      Corp Tax (TAXATION / expense)
      Cash (ASSETS / asset) — for the DR/CR balancing leg
    """
    db_session.add(
        CompanyCode(
            companyCode=company_code,
            organizationId=org_id,
            legalName=f"IS Test {company_code}",
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
    leaves = [
        ("411000", "Revenue", DrawerEnum.REVENUE, AccountTypeEnum.REVENUE, "revenue"),
        ("511000", "COGS", DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "cogs"),
        ("611000", "Salaries", DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "salaries"),
        ("811000", "Other Income", DrawerEnum.OTHER_INCOME, AccountTypeEnum.REVENUE, "other_income"),
        ("711000", "Interest Expense", DrawerEnum.NON_OPERATING, AccountTypeEnum.EXPENSE, "interest"),
        ("911000", "Corp Tax", DrawerEnum.TAXATION, AccountTypeEnum.EXPENSE, "tax"),
        ("110001", "Cash", DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "cash"),
    ]
    for code, name, drawer, atype, key in leaves:
        aid = str(uuid.uuid4())
        ids[key] = aid
        db_session.add(
            GLAccount(
                accountId=aid, organizationId=org_id, accountNumber=code,
                accountName=name, drawer=drawer, accountType=atype,
                isHeader=False, isActive=True,
            )
        )
    await db_session.commit()
    return ids


async def _post_balanced_je(
    db_session, org_id, company_code, period_id, lines, je_date,
):
    """Post a JE that the caller has pre-balanced."""
    je_id = str(uuid.uuid4())
    total_dr = sum(Decimal(str(l[1])) for l in lines)
    total_cr = sum(Decimal(str(l[2])) for l in lines)
    db_session.add(JournalEntry(
        jeId=je_id, organizationId=org_id, companyCode=company_code,
        jeNumber=f"JE-{company_code}-{je_date.year}-T{uuid.uuid4().hex[:4].upper()}",
        jeDate=je_date, periodId=period_id, sourceEventType="test_seed",
        sourceEventId=je_id, totalDebit=total_dr, totalCredit=total_cr,
        status=JEStatusEnum.POSTED,
        postedAt=datetime.utcnow(), postedBy="user-test",
    ))
    for i, (account_id, debit, credit, *opts) in enumerate(lines, start=1):
        cc = opts[0] if opts else None
        db_session.add(JournalEntryLine(
            jeLineId=str(uuid.uuid4()), jeId=je_id, lineNumber=i,
            accountId=account_id, debit=Decimal(str(debit)),
            credit=Decimal(str(credit)), costCenterId=cc,
        ))
    await db_session.commit()


# ─── Tests ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_is_empty_org_returns_zero_totals(
    client: AsyncClient, db_session,
) -> None:
    """No JEs → every drawer + subtotal is zero, no comparison."""
    org_id = f"org-is-empty-{uuid.uuid4().hex[:8]}"
    company_code = f"IE{uuid.uuid4().hex[:6].upper()}"
    await _seed_pl_coa(db_session, org_id, company_code)

    resp = await client.get(
        "/api/v1/finance/reports/income-statement",
        params={"organization_id": org_id, "company_code": company_code,
                "period_start": "2026-01-01", "period_end": "2026-12-31"},
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()["data"]
    s = body["primary"]["subtotals"]
    for key in ("revenue", "costOfSales", "grossProfit", "operatingCost",
                "operatingIncome", "otherIncome", "nonOperating",
                "taxation", "netIncome"):
        assert Decimal(s[key]) == Decimal("0"), f"{key} should be 0"
    assert s["grossMarginPercent"] is None
    assert body["comparison"] is None


@pytest.mark.asyncio
async def test_is_revenue_and_cogs_compute_gross_profit_and_margin(
    client: AsyncClient, db_session,
) -> None:
    """Post 1000 revenue + 400 COGS → gross profit 600 (60% margin)."""
    org_id = f"org-is-gp-{uuid.uuid4().hex[:8]}"
    company_code = f"GP{uuid.uuid4().hex[:6].upper()}"
    ids = await _seed_pl_coa(db_session, org_id, company_code)

    await _post_balanced_je(
        db_session, org_id, company_code, ids["period_id"],
        lines=[(ids["cash"], "1000", "0"),
               (ids["revenue"], "0", "1000")],
        je_date=date(2026, 6, 1),
    )
    await _post_balanced_je(
        db_session, org_id, company_code, ids["period_id"],
        lines=[(ids["cogs"], "400", "0"),
               (ids["cash"], "0", "400")],
        je_date=date(2026, 6, 15),
    )

    resp = await client.get(
        "/api/v1/finance/reports/income-statement",
        params={"organization_id": org_id, "company_code": company_code,
                "period_start": "2026-01-01", "period_end": "2026-12-31"},
        headers=auth_headers(role="auditor"),
    )
    s = resp.json()["data"]["primary"]["subtotals"]
    assert Decimal(s["revenue"]) == Decimal("1000")
    assert Decimal(s["costOfSales"]) == Decimal("400")
    assert Decimal(s["grossProfit"]) == Decimal("600")
    assert Decimal(s["grossMarginPercent"]) == Decimal("60.00")


@pytest.mark.asyncio
async def test_is_full_net_income_chain(
    client: AsyncClient, db_session,
) -> None:
    """
    Full P&L chain: revenue 5000, COGS 2000, salaries 1000, other income
    500, interest 200, tax 300.
      gross profit = 5000 - 2000 = 3000
      EBIT = 3000 - 1000 = 2000
      net income = 2000 + 500 - 200 - 300 = 2000
    """
    org_id = f"org-is-ni-{uuid.uuid4().hex[:8]}"
    company_code = f"NI{uuid.uuid4().hex[:6].upper()}"
    ids = await _seed_pl_coa(db_session, org_id, company_code)
    p = ids["period_id"]

    # All balanced via Cash.
    for amount, acct in [
        ("5000", ids["revenue"]),
        ("500", ids["other_income"]),
    ]:
        await _post_balanced_je(
            db_session, org_id, company_code, p,
            lines=[(ids["cash"], amount, "0"), (acct, "0", amount)],
            je_date=date(2026, 3, 1),
        )
    for amount, acct in [
        ("2000", ids["cogs"]),
        ("1000", ids["salaries"]),
        ("200", ids["interest"]),
        ("300", ids["tax"]),
    ]:
        await _post_balanced_je(
            db_session, org_id, company_code, p,
            lines=[(acct, amount, "0"), (ids["cash"], "0", amount)],
            je_date=date(2026, 3, 2),
        )

    resp = await client.get(
        "/api/v1/finance/reports/income-statement",
        params={"organization_id": org_id, "company_code": company_code,
                "period_start": "2026-01-01", "period_end": "2026-12-31"},
        headers=auth_headers(role="auditor"),
    )
    s = resp.json()["data"]["primary"]["subtotals"]
    assert Decimal(s["revenue"]) == Decimal("5000")
    assert Decimal(s["costOfSales"]) == Decimal("2000")
    assert Decimal(s["grossProfit"]) == Decimal("3000")
    assert Decimal(s["operatingCost"]) == Decimal("1000")
    assert Decimal(s["operatingIncome"]) == Decimal("2000")
    assert Decimal(s["otherIncome"]) == Decimal("500")
    assert Decimal(s["nonOperating"]) == Decimal("200")
    assert Decimal(s["taxation"]) == Decimal("300")
    assert Decimal(s["netIncome"]) == Decimal("2000")


@pytest.mark.asyncio
async def test_is_period_filter_excludes_out_of_range_jes(
    client: AsyncClient, db_session,
) -> None:
    """JEs dated outside [period_start, period_end] must not contribute."""
    org_id = f"org-is-pf-{uuid.uuid4().hex[:8]}"
    company_code = f"PF{uuid.uuid4().hex[:6].upper()}"
    ids = await _seed_pl_coa(db_session, org_id, company_code)
    p = ids["period_id"]

    # In-range JE (Q1 2026)
    await _post_balanced_je(
        db_session, org_id, company_code, p,
        lines=[(ids["cash"], "100", "0"), (ids["revenue"], "0", "100")],
        je_date=date(2026, 2, 15),
    )
    # Out-of-range (Q3 2026)
    await _post_balanced_je(
        db_session, org_id, company_code, p,
        lines=[(ids["cash"], "9999", "0"), (ids["revenue"], "0", "9999")],
        je_date=date(2026, 8, 15),
    )

    resp = await client.get(
        "/api/v1/finance/reports/income-statement",
        params={"organization_id": org_id, "company_code": company_code,
                "period_start": "2026-01-01", "period_end": "2026-03-31"},
        headers=auth_headers(role="auditor"),
    )
    s = resp.json()["data"]["primary"]["subtotals"]
    assert Decimal(s["revenue"]) == Decimal("100")


@pytest.mark.asyncio
async def test_is_comparison_period_returned_independently(
    client: AsyncClient, db_session,
) -> None:
    """
    compare_period_start/end populate the `comparison` block, computed
    over the comparison's date range independently of the primary.
    """
    org_id = f"org-is-cmp-{uuid.uuid4().hex[:8]}"
    company_code = f"CM{uuid.uuid4().hex[:6].upper()}"
    ids = await _seed_pl_coa(db_session, org_id, company_code)
    p = ids["period_id"]

    # 1000 revenue in 2026
    await _post_balanced_je(
        db_session, org_id, company_code, p,
        lines=[(ids["cash"], "1000", "0"), (ids["revenue"], "0", "1000")],
        je_date=date(2026, 5, 1),
    )
    # 600 revenue in 2025 (prior year)
    await _post_balanced_je(
        db_session, org_id, company_code, p,
        lines=[(ids["cash"], "600", "0"), (ids["revenue"], "0", "600")],
        je_date=date(2025, 5, 1),
    )

    resp = await client.get(
        "/api/v1/finance/reports/income-statement",
        params={
            "organization_id": org_id, "company_code": company_code,
            "period_start": "2026-01-01", "period_end": "2026-12-31",
            "compare_period_start": "2025-01-01",
            "compare_period_end": "2025-12-31",
        },
        headers=auth_headers(role="auditor"),
    )
    body = resp.json()["data"]
    assert Decimal(body["primary"]["subtotals"]["revenue"]) == Decimal("1000")
    assert body["comparison"] is not None
    assert Decimal(body["comparison"]["subtotals"]["revenue"]) == Decimal("600")
    assert body["comparison"]["periodStart"] == "2025-01-01"
    assert body["comparison"]["periodEnd"] == "2025-12-31"


@pytest.mark.asyncio
async def test_is_partial_compare_params_returns_400(
    client: AsyncClient, db_session,
) -> None:
    """Providing only one of the two comparison params → HTTP 400."""
    org_id = f"org-is-pc-{uuid.uuid4().hex[:8]}"
    company_code = f"PC{uuid.uuid4().hex[:6].upper()}"
    await _seed_pl_coa(db_session, org_id, company_code)

    resp = await client.get(
        "/api/v1/finance/reports/income-statement",
        params={
            "organization_id": org_id, "company_code": company_code,
            "period_start": "2026-01-01", "period_end": "2026-12-31",
            "compare_period_start": "2025-01-01",
        },
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 400
    assert "compare_period" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_is_inverted_period_returns_400(
    client: AsyncClient, db_session,
) -> None:
    """period_end < period_start → 400."""
    org_id = f"org-is-bad-{uuid.uuid4().hex[:8]}"
    company_code = f"BD{uuid.uuid4().hex[:6].upper()}"
    await _seed_pl_coa(db_session, org_id, company_code)

    resp = await client.get(
        "/api/v1/finance/reports/income-statement",
        params={"organization_id": org_id, "company_code": company_code,
                "period_start": "2026-12-31", "period_end": "2026-01-01"},
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 400
    assert "period_end" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_is_cost_center_filter_narrows_to_subset(
    client: AsyncClient, db_session,
) -> None:
    """
    cost_center_id filter restricts which JE lines contribute. Sum of
    filtered net income + unfiltered "rest" should equal the unfiltered
    total (proves no double-counting / leakage).
    """
    org_id = f"org-is-cc-{uuid.uuid4().hex[:8]}"
    company_code = f"CC{uuid.uuid4().hex[:6].upper()}"
    ids = await _seed_pl_coa(db_session, org_id, company_code)
    p = ids["period_id"]

    # Revenue 200 tagged with farm-a; revenue 800 untagged.
    await _post_balanced_je(
        db_session, org_id, company_code, p,
        lines=[(ids["cash"], "200", "0", "farm-a"),
               (ids["revenue"], "0", "200", "farm-a")],
        je_date=date(2026, 4, 1),
    )
    await _post_balanced_je(
        db_session, org_id, company_code, p,
        lines=[(ids["cash"], "800", "0"),
               (ids["revenue"], "0", "800")],
        je_date=date(2026, 4, 1),
    )

    full = await client.get(
        "/api/v1/finance/reports/income-statement",
        params={"organization_id": org_id, "company_code": company_code,
                "period_start": "2026-01-01", "period_end": "2026-12-31"},
        headers=auth_headers(role="auditor"),
    )
    farm_a = await client.get(
        "/api/v1/finance/reports/income-statement",
        params={"organization_id": org_id, "company_code": company_code,
                "period_start": "2026-01-01", "period_end": "2026-12-31",
                "cost_center_id": "farm-a"},
        headers=auth_headers(role="auditor"),
    )
    assert Decimal(full.json()["data"]["primary"]["subtotals"]["revenue"]) == Decimal("1000")
    assert Decimal(farm_a.json()["data"]["primary"]["subtotals"]["revenue"]) == Decimal("200")


@pytest.mark.asyncio
async def test_is_unknown_company_returns_404(client: AsyncClient) -> None:
    """Non-existent company code → HTTP 404."""
    resp = await client.get(
        "/api/v1/finance/reports/income-statement",
        params={"organization_id": "anything", "company_code": "NONEXIST",
                "period_start": "2026-01-01", "period_end": "2026-12-31"},
        headers=auth_headers(role="auditor"),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_is_non_finance_role_forbidden(
    client: AsyncClient, db_session,
) -> None:
    """user role gets 403."""
    org_id = f"org-is-auth-{uuid.uuid4().hex[:8]}"
    company_code = f"AU{uuid.uuid4().hex[:6].upper()}"
    await _seed_pl_coa(db_session, org_id, company_code)
    resp = await client.get(
        "/api/v1/finance/reports/income-statement",
        params={"organization_id": org_id, "company_code": company_code,
                "period_start": "2026-01-01", "period_end": "2026-12-31"},
        headers=auth_headers(role="user"),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_is_drawer_sections_ordered_correctly(
    client: AsyncClient, db_session,
) -> None:
    """Drawer sections must come back in the standard P&L order."""
    org_id = f"org-is-ord-{uuid.uuid4().hex[:8]}"
    company_code = f"OR{uuid.uuid4().hex[:6].upper()}"
    await _seed_pl_coa(db_session, org_id, company_code)
    resp = await client.get(
        "/api/v1/finance/reports/income-statement",
        params={"organization_id": org_id, "company_code": company_code,
                "period_start": "2026-01-01", "period_end": "2026-12-31"},
        headers=auth_headers(role="auditor"),
    )
    drawers = [s["drawer"] for s in resp.json()["data"]["primary"]["sections"]]
    assert drawers == [
        "REVENUE", "COST_OF_SALES", "OPERATING_COST",
        "OTHER_INCOME", "NON_OPERATING", "TAXATION",
    ]
