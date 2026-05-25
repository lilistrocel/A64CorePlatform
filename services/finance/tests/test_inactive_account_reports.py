"""
Fix B regression tests — inactive accounts must appear on financial statements.

IFRS/GAAP principle: isActive governs whether NEW postings may be directed to an
account.  It does NOT suppress historical balances from appearing on the Balance
Sheet, Income Statement, or Cash Flow Statement.  These tests verify that
deactivating an account after posting to it does NOT cause its balance to vanish
from any of the three statutory reports.

Incident context: GR/IR account 221000-002 was deactivated mid-flight, causing a
35,000 AED balance to disappear from the BS report (JE-1000-2026-0006 repair).
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

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
# Shared helpers
# ---------------------------------------------------------------------------


async def _seed_company_and_period(
    db_session: AsyncSession,
    org_id: str,
    company_code: str,
) -> str:
    """Create a company and a wide-span fiscal period. Returns period_id."""
    db_session.add(
        CompanyCode(
            companyCode=company_code,
            organizationId=org_id,
            legalName=f"InactiveAcct Test {company_code}",
            fiscalYearStartMonth=1,
            fiscalYearStartDay=1,
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
    *,
    is_active: bool = True,
    is_header: bool = False,
    cash_flow_category: CashFlowCategoryEnum = CashFlowCategoryEnum.NONE,
) -> GLAccount:
    """Return an unsaved GLAccount ORM object."""
    return GLAccount(
        accountId=str(uuid.uuid4()),
        organizationId=org_id,
        accountNumber=account_number,
        accountName=account_name,
        drawer=drawer,
        accountType=account_type,
        isHeader=is_header,
        isActive=is_active,
        cashFlowCategory=cash_flow_category,
    )


async def _post_je(
    db_session: AsyncSession,
    org_id: str,
    company_code: str,
    period_id: str,
    lines: list,
    je_date: date,
) -> str:
    """
    Post a balanced JE.  `lines` is a list of (accountId, debit, credit) tuples.
    """
    je_id = str(uuid.uuid4())
    total_dr = sum(Decimal(str(l[1])) for l in lines)
    total_cr = sum(Decimal(str(l[2])) for l in lines)
    db_session.add(
        JournalEntry(
            jeId=je_id,
            organizationId=org_id,
            companyCode=company_code,
            jeNumber=f"JE-{company_code}-{je_date.year}-T{uuid.uuid4().hex[:4].upper()}",
            jeDate=je_date,
            periodId=period_id,
            sourceEventType="test_seed",
            sourceEventId=je_id,
            totalDebit=total_dr,
            totalCredit=total_cr,
            status=JEStatusEnum.POSTED,
            postedAt=datetime.utcnow(),
            postedBy="user-test",
        )
    )
    for i, (account_id, debit, credit) in enumerate(lines, start=1):
        db_session.add(
            JournalEntryLine(
                jeLineId=str(uuid.uuid4()),
                jeId=je_id,
                lineNumber=i,
                accountId=account_id,
                debit=Decimal(str(debit)),
                credit=Decimal(str(credit)),
            )
        )
    await db_session.commit()
    return je_id


# ---------------------------------------------------------------------------
# Fix B — Balance Sheet: inactive account with balance must appear
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bs_inactive_account_with_balance_appears_on_report(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    Scenario:
      1. Create a Cash account (ASSETS/asset) and an AP account (LIABILITIES/liability).
      2. Post a JE: DR Cash 35000 / CR AP 35000.
      3. Deactivate the Cash account (isActive=False).
      4. Query the Balance Sheet — Cash must still appear with balance 35000.

    This mirrors the GR/IR incident where a deactivated clearing account vanished
    from the BS after a mid-flight account change.
    """
    org_id = f"org-bs-ia-{uuid.uuid4().hex[:8]}"
    company_code = f"IA{uuid.uuid4().hex[:6].upper()}"
    period_id = await _seed_company_and_period(db_session, org_id, company_code)

    cash = _make_account(org_id, "110099", "Cash (inactive test)", DrawerEnum.ASSETS, AccountTypeEnum.ASSET)
    ap = _make_account(org_id, "210099", "AP (inactive test)", DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY)
    db_session.add(cash)
    db_session.add(ap)
    await db_session.commit()
    await db_session.refresh(cash)
    await db_session.refresh(ap)

    await _post_je(
        db_session, org_id, company_code, period_id,
        lines=[(cash.accountId, "35000", "0"), (ap.accountId, "0", "35000")],
        je_date=date(2026, 3, 1),
    )

    # Deactivate the cash account AFTER posting.
    cash.isActive = False
    await db_session.commit()

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

    account_numbers = {row["accountNumber"] for row in body["rows"]}
    assert "110099" in account_numbers, (
        "Inactive Cash account must appear on BS — it has a non-zero historical balance"
    )

    cash_row = next(r for r in body["rows"] if r["accountNumber"] == "110099")
    assert Decimal(cash_row["balance"]) == Decimal("35000"), (
        f"Cash balance should be 35000, got {cash_row['balance']}"
    )


# ---------------------------------------------------------------------------
# Fix B — Income Statement: inactive account with balance must appear
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_is_inactive_account_with_balance_appears_on_report(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    Scenario:
      1. Create a Revenue account (REVENUE/revenue) and a Cash account (ASSETS/asset).
      2. Post a JE: DR Cash 10000 / CR Revenue 10000.
      3. Deactivate the Revenue account (isActive=False).
      4. Query the Income Statement — Revenue must still appear with its balance.
    """
    org_id = f"org-is-ia-{uuid.uuid4().hex[:8]}"
    company_code = f"IR{uuid.uuid4().hex[:6].upper()}"
    period_id = await _seed_company_and_period(db_session, org_id, company_code)

    revenue = _make_account(
        org_id, "411099", "Revenue (inactive test)",
        DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
    )
    cash = _make_account(org_id, "110098", "Cash (IS inactive test)", DrawerEnum.ASSETS, AccountTypeEnum.ASSET)
    db_session.add(revenue)
    db_session.add(cash)
    await db_session.commit()
    await db_session.refresh(revenue)
    await db_session.refresh(cash)

    await _post_je(
        db_session, org_id, company_code, period_id,
        lines=[(cash.accountId, "10000", "0"), (revenue.accountId, "0", "10000")],
        je_date=date(2026, 4, 1),
    )

    # Deactivate the revenue account AFTER posting.
    revenue.isActive = False
    await db_session.commit()

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
    body = resp.json()["data"]

    # IS response shape: primary.sections[].rows[].accountNumber
    all_rows = [
        row
        for section in body["primary"].get("sections", [])
        for row in section.get("rows", [])
    ]
    account_numbers = {row["accountNumber"] for row in all_rows}
    assert "411099" in account_numbers, (
        "Inactive Revenue account must appear on IS — it has a non-zero historical balance"
    )

    revenue_row = next(r for r in all_rows if r["accountNumber"] == "411099")
    assert Decimal(revenue_row["balance"]) == Decimal("10000"), (
        f"Revenue balance should be 10000, got {revenue_row['balance']}"
    )

    # Net income must also reflect the revenue (10000 credit-natural = 10000 net income).
    net_income = Decimal(body["primary"]["subtotals"]["netIncome"])
    assert net_income == Decimal("10000"), (
        f"Net income should be 10000 (from inactive revenue account), got {net_income}"
    )


# ---------------------------------------------------------------------------
# Fix B — Cash Flow Statement: inactive account with balance must appear
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cf_inactive_account_with_balance_appears_on_report(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    Scenario:
      1. Create a Cash account (ASSETS/asset, CASH category) and a Share Capital
         account (EQUITY/equity, FINANCING category).
      2. Post a JE: DR Cash 50000 / CR Share Capital 50000.
      3. Deactivate the Share Capital account (isActive=False).
      4. Query the Cash Flow Statement — the Share Capital delta must still be
         bucketed into the Financing section, and cashAtEnd must be 50000.

    Without the fix, the inactive Share Capital account would be excluded from the
    account-metadata fetch, its delta would not be bucketed, and the CF statement
    would show an unreconciled discrepancy.
    """
    org_id = f"org-cf-ia-{uuid.uuid4().hex[:8]}"
    company_code = f"CF{uuid.uuid4().hex[:6].upper()}"
    period_id = await _seed_company_and_period(db_session, org_id, company_code)

    cash_acct = _make_account(
        org_id, "126099", "Cash at Bank (CF inactive test)",
        DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
        cash_flow_category=CashFlowCategoryEnum.CASH,
    )
    share_cap = _make_account(
        org_id, "310099", "Share Capital (inactive test)",
        DrawerEnum.EQUITY, AccountTypeEnum.EQUITY,
        cash_flow_category=CashFlowCategoryEnum.FINANCING,
    )
    # Also need a revenue account so the CF endpoint can compute net income.
    revenue = _make_account(
        org_id, "411098", "Revenue (CF inactive test)",
        DrawerEnum.REVENUE, AccountTypeEnum.REVENUE,
        cash_flow_category=CashFlowCategoryEnum.NONE,
    )
    db_session.add(cash_acct)
    db_session.add(share_cap)
    db_session.add(revenue)
    await db_session.commit()
    await db_session.refresh(cash_acct)
    await db_session.refresh(share_cap)
    await db_session.refresh(revenue)

    # DR Cash / CR Share Capital (capital injection).
    await _post_je(
        db_session, org_id, company_code, period_id,
        lines=[(cash_acct.accountId, "50000", "0"), (share_cap.accountId, "0", "50000")],
        je_date=date(2026, 1, 5),
    )

    # Deactivate the share capital account AFTER posting.
    share_cap.isActive = False
    await db_session.commit()

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

    # Cash at end of period must be 50000.
    assert Decimal(body["cashAtEnd"]) == Decimal("50000"), (
        f"cashAtEnd should be 50000, got {body['cashAtEnd']}"
    )

    # The Share Capital contribution must appear in Financing.
    # CF response shape: financing.items[].accountNumber
    financing_items = body["financing"].get("items", [])
    financing_account_numbers = {item["accountNumber"] for item in financing_items}
    assert "310099" in financing_account_numbers, (
        "Inactive Share Capital account must appear in CF Financing section — "
        "it has a non-zero historical balance"
    )

    financing_total = Decimal(body["financing"]["total"])
    assert financing_total == Decimal("50000"), (
        f"Financing total should be 50000, got {financing_total}"
    )
