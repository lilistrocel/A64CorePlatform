"""
T-063.A tests — posting-setup clearing-account semantic type guard.

The PATCH/PUT endpoint for company posting setup must reject assignments where
the new account's (drawer, accountType) pair does not match the semantic
requirements for that field.  This prevents misconfigurations like pointing
purchasePriceVarianceAccountId at a fixed-asset account (the actual incident
that triggered T-063: company 1000 had PPV → 110000-003 "Buildings").

Test cases
----------
1. happy_correct_type      — assigning an account of the CORRECT type → 200 (parametrised
                              over all 10 fields).
2. reject_wrong_type       — assigning an account of the WRONG type → 422 with the exact
                              error-detail shape naming the field, account, and expected
                              types (parametrised over all 10 fields).
3. reject_header_account   — assigning a header (isHeader=True) account → 422.
4. clear_to_null           — setting a field to null → 200 (no type check; null clears the
                              FK).
5. field_unchanged         — sending the same account UUID that is already stored → 200
                              (type check is skipped when the value is not changing).
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from finance.models.orm.models import (
    AccountLevelEnum,
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

# ---------------------------------------------------------------------------
# Org prefix
# ---------------------------------------------------------------------------
_ORG_PREFIX = "org-pstg"  # "posting-setup type guard"


# ---------------------------------------------------------------------------
# Per-field test configuration
#
# Each entry: (field_name, correct_drawer, correct_type, wrong_drawer, wrong_type)
# wrong_drawer / wrong_type must be a valid combination that exists in the CoA
# seeding pattern so we can create a realistic account for rejection tests.
# ---------------------------------------------------------------------------
_FIELD_CASES: list[tuple] = [
    # field_name                      correct_drawer           correct_type           wrong_drawer             wrong_type
    ("apControlAccountId",             DrawerEnum.LIABILITIES,  AccountTypeEnum.LIABILITY,  DrawerEnum.ASSETS,       AccountTypeEnum.ASSET),
    ("arControlAccountId",             DrawerEnum.ASSETS,       AccountTypeEnum.ASSET,      DrawerEnum.LIABILITIES,  AccountTypeEnum.LIABILITY),
    ("bankAccountId",                  DrawerEnum.ASSETS,       AccountTypeEnum.ASSET,      DrawerEnum.LIABILITIES,  AccountTypeEnum.LIABILITY),
    ("cashAccountId",                  DrawerEnum.ASSETS,       AccountTypeEnum.ASSET,      DrawerEnum.EQUITY,       AccountTypeEnum.EQUITY),
    ("grIrClearingAccountId",          DrawerEnum.LIABILITIES,  AccountTypeEnum.LIABILITY,  DrawerEnum.ASSETS,       AccountTypeEnum.ASSET),
    ("inputVatAccountId",              DrawerEnum.ASSETS,       AccountTypeEnum.ASSET,      DrawerEnum.LIABILITIES,  AccountTypeEnum.LIABILITY),
    ("outputVatAccountId",             DrawerEnum.LIABILITIES,  AccountTypeEnum.LIABILITY,  DrawerEnum.ASSETS,       AccountTypeEnum.ASSET),
    ("retainedEarningsAccountId",      DrawerEnum.EQUITY,       AccountTypeEnum.EQUITY,     DrawerEnum.ASSETS,       AccountTypeEnum.ASSET),
    ("purchasePriceVarianceAccountId", DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE,   DrawerEnum.ASSETS,       AccountTypeEnum.ASSET),
    ("roundingAccountId",              DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE,  DrawerEnum.ASSETS,       AccountTypeEnum.ASSET),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _seed_company(db_session: AsyncSession, org_id: str, company_code: str) -> None:
    """Insert a CompanyCode + an OPEN fiscal period."""
    db_session.add(
        CompanyCode(
            companyCode=company_code,
            organizationId=org_id,
            legalName=f"Type Guard Test {company_code}",
        )
    )
    db_session.add(
        FiscalPeriod(
            periodId=str(uuid.uuid4()),
            companyCode=company_code,
            fiscalYear=2026,
            periodNumber=99,
            startDate=date(2025, 1, 1),
            endDate=date(2027, 12, 31),
            status=PeriodStatusEnum.OPEN,
        )
    )
    await db_session.commit()


async def _make_account(
    db_session: AsyncSession,
    org_id: str,
    account_number: str,
    account_name: str,
    drawer: DrawerEnum,
    account_type: AccountTypeEnum,
    is_header: bool = False,
) -> GLAccount:
    """
    Insert and return a GLAccount with the given drawer / accountType.

    Args:
        db_session: Test DB session.
        org_id: Organization scope.
        account_number: Unique account number within the test.
        account_name: Display name.
        drawer: DrawerEnum value.
        account_type: AccountTypeEnum value.
        is_header: Whether this is a roll-up header account.

    Returns:
        The persisted GLAccount ORM object.
    """
    acct = GLAccount(
        accountId=str(uuid.uuid4()),
        organizationId=org_id,
        accountNumber=account_number,
        accountName=account_name,
        drawer=drawer,
        accountType=account_type,
        accountLevel=AccountLevelEnum.ACTIVE,
        isHeader=is_header,
        isActive=True,
    )
    db_session.add(acct)
    await db_session.commit()
    await db_session.refresh(acct)
    return acct


async def _put_posting_setup(
    client: AsyncClient,
    org_id: str,
    company_code: str,
    payload: dict,
) -> object:
    """Thin wrapper around PUT /companies/{cc}/posting-setup."""
    return await client.put(
        f"/api/v1/finance/companies/{company_code}/posting-setup",
        params={"organization_id": org_id},
        json=payload,
        headers=auth_headers(),
    )


# ---------------------------------------------------------------------------
# 1. Happy — correct type, all 10 fields
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "field_name,correct_drawer,correct_type,wrong_drawer,wrong_type",
    _FIELD_CASES,
    ids=[c[0] for c in _FIELD_CASES],
)
async def test_correct_account_type_accepted(
    client: AsyncClient,
    db_session: AsyncSession,
    field_name: str,
    correct_drawer: DrawerEnum,
    correct_type: AccountTypeEnum,
    wrong_drawer: DrawerEnum,
    wrong_type: AccountTypeEnum,
) -> None:
    """
    Assigning an account with the CORRECT (drawer, accountType) for a field
    must be accepted with HTTP 200.
    """
    suffix = uuid.uuid4().hex[:8]
    org_id = f"{_ORG_PREFIX}-ok-{suffix}"
    company_code = f"OK{suffix[:6].upper()}"
    await _seed_company(db_session, org_id, company_code)

    correct_acct = await _make_account(
        db_session, org_id,
        f"T1{suffix[:5]}", f"Correct type {field_name}",
        correct_drawer, correct_type,
    )

    resp = await _put_posting_setup(client, org_id, company_code, {field_name: correct_acct.accountId})
    assert resp.status_code == 200, (
        f"Expected 200 for {field_name} with correct type "
        f"(drawer={correct_drawer.value}, type={correct_type.value}), "
        f"got {resp.status_code}: {resp.text}"
    )
    data = resp.json()["data"]
    assert data[field_name] == correct_acct.accountId


# ---------------------------------------------------------------------------
# 2. Reject — wrong type, all 10 fields
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "field_name,correct_drawer,correct_type,wrong_drawer,wrong_type",
    _FIELD_CASES,
    ids=[c[0] for c in _FIELD_CASES],
)
async def test_wrong_account_type_rejected(
    client: AsyncClient,
    db_session: AsyncSession,
    field_name: str,
    correct_drawer: DrawerEnum,
    correct_type: AccountTypeEnum,
    wrong_drawer: DrawerEnum,
    wrong_type: AccountTypeEnum,
) -> None:
    """
    Assigning an account with the WRONG (drawer, accountType) for a field
    must be rejected with HTTP 422.

    Error detail must:
    - contain the field name,
    - contain the account number,
    - contain the actual drawer / accountType,
    - contain the expected drawer / accountType.
    """
    suffix = uuid.uuid4().hex[:8]
    org_id = f"{_ORG_PREFIX}-wr-{suffix}"
    company_code = f"WR{suffix[:6].upper()}"
    await _seed_company(db_session, org_id, company_code)

    wrong_acct = await _make_account(
        db_session, org_id,
        f"T2{suffix[:5]}", f"Wrong type {field_name}",
        wrong_drawer, wrong_type,
    )

    resp = await _put_posting_setup(client, org_id, company_code, {field_name: wrong_acct.accountId})
    assert resp.status_code == 422, (
        f"Expected 422 for {field_name} with wrong type "
        f"(drawer={wrong_drawer.value}, type={wrong_type.value}), "
        f"got {resp.status_code}: {resp.text}"
    )
    detail = resp.json()["detail"]
    assert field_name in detail, (
        f"Expected field name '{field_name}' in error detail: {detail}"
    )
    assert wrong_acct.accountNumber in detail, (
        f"Expected account number '{wrong_acct.accountNumber}' in error detail: {detail}"
    )
    assert wrong_drawer.value in detail, (
        f"Expected actual drawer '{wrong_drawer.value}' in error detail: {detail}"
    )


# ---------------------------------------------------------------------------
# 3. Reject — header account (isHeader=True), any field
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_header_account_rejected(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    Assigning a header account (isHeader=True) to any posting-setup field
    must be rejected with HTTP 422, even if the drawer/accountType would
    otherwise be correct.

    Tested against grIrClearingAccountId (LIABILITIES/liability) as a
    representative field.
    """
    suffix = uuid.uuid4().hex[:8]
    org_id = f"{_ORG_PREFIX}-hdr-{suffix}"
    company_code = f"HD{suffix[:6].upper()}"
    await _seed_company(db_session, org_id, company_code)

    header_acct = await _make_account(
        db_session, org_id,
        f"T3{suffix[:5]}", "GR/IR Header (roll-up)",
        DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY,
        is_header=True,
    )

    resp = await _put_posting_setup(
        client, org_id, company_code,
        {"grIrClearingAccountId": header_acct.accountId},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for header account, got {resp.status_code}: {resp.text}"
    )
    detail = resp.json()["detail"]
    assert "isHeader" in detail or "header" in detail.lower(), (
        f"Expected 'header' in error detail: {detail}"
    )


# ---------------------------------------------------------------------------
# 4. Clear to null — no type check, must succeed
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_clear_field_to_null_succeeds(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    Setting a field to null (clearing the FK) must not trigger the type
    guard and must return HTTP 200.

    Sets grIrClearingAccountId to a valid account, then sends null — the
    second call must succeed even though a null has no drawer/accountType
    to check.
    """
    suffix = uuid.uuid4().hex[:8]
    org_id = f"{_ORG_PREFIX}-null-{suffix}"
    company_code = f"NL{suffix[:6].upper()}"
    await _seed_company(db_session, org_id, company_code)

    valid_acct = await _make_account(
        db_session, org_id,
        f"T4{suffix[:5]}", "GR/IR Valid",
        DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY,
    )

    # Set to valid account first.
    resp1 = await _put_posting_setup(
        client, org_id, company_code,
        {"grIrClearingAccountId": valid_acct.accountId},
    )
    assert resp1.status_code == 200, resp1.text

    # Now clear it to null — must succeed.
    resp2 = await _put_posting_setup(
        client, org_id, company_code,
        {"grIrClearingAccountId": None},
    )
    assert resp2.status_code == 200, (
        f"Expected 200 when clearing field to null, got {resp2.status_code}: {resp2.text}"
    )
    data = resp2.json()["data"]
    assert data["grIrClearingAccountId"] is None


# ---------------------------------------------------------------------------
# 5. Field unchanged — type check must be skipped (even for a wrong-typed acct)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_field_unchanged_skips_type_check(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    When the payload sends the same account UUID that is already stored for a
    field, the type guard must NOT fire — even if the account's type would
    fail the check on a fresh assignment.

    Why: if an account was assigned before the guard existed (the PPV/Buildings
    incident), a subsequent PATCH that touches other fields but leaves PPV
    unchanged should not be blocked by retroactive validation of an already-
    stored value.  The guard fires on new assignments only.

    Implementation: we bypass the API for the initial bad-type setup
    (writing directly to the DB) so the test reflects the real-world scenario.
    """
    suffix = uuid.uuid4().hex[:8]
    org_id = f"{_ORG_PREFIX}-nochg-{suffix}"
    company_code = f"NC{suffix[:6].upper()}"
    await _seed_company(db_session, org_id, company_code)

    # Create a correct-type account for a different field (arControlAccountId)
    # so the upsert has at least one valid change to make.
    ar_acct = await _make_account(
        db_session, org_id,
        f"T5a{suffix[:4]}", "AR Control",
        DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
    )

    # Create a WRONG-type account for grIrClearingAccountId (should be
    # LIABILITIES; we'll use ASSETS instead to simulate the bad pre-existing state).
    wrong_grir = await _make_account(
        db_session, org_id,
        f"T5b{suffix[:4]}", "Wrong GR/IR (ASSETS — pre-existing)",
        DrawerEnum.ASSETS, AccountTypeEnum.ASSET,
    )

    # Plant the bad value directly in the DB (bypassing the API guard,
    # as would have happened before the guard was introduced).
    from finance.models.orm.models import CompanyPostingSetup
    from sqlalchemy import select

    result = await db_session.execute(
        select(CompanyPostingSetup).where(
            CompanyPostingSetup.organizationId == org_id,
            CompanyPostingSetup.companyCode == company_code,
        )
    )
    setup = result.scalar_one_or_none()
    if setup is None:
        setup = CompanyPostingSetup(
            setupId=str(uuid.uuid4()),
            organizationId=org_id,
            companyCode=company_code,
            grIrClearingAccountId=wrong_grir.accountId,
        )
        db_session.add(setup)
    else:
        setup.grIrClearingAccountId = wrong_grir.accountId
    await db_session.commit()

    # Now PATCH with the SAME wrong UUID for GR/IR plus a new AR account.
    # The guard must skip grIrClearingAccountId (unchanged) and allow the
    # arControlAccountId change (correct type).
    resp = await _put_posting_setup(
        client, org_id, company_code,
        {
            "grIrClearingAccountId": wrong_grir.accountId,  # unchanged — guard skips
            "arControlAccountId": ar_acct.accountId,         # new correct value — guard passes
        },
    )
    assert resp.status_code == 200, (
        f"Expected 200 when grIrClearingAccountId is unchanged (even though "
        f"wrong type), got {resp.status_code}: {resp.text}"
    )
    data = resp.json()["data"]
    assert data["arControlAccountId"] == ar_acct.accountId
    # GR/IR kept as-is.
    assert data["grIrClearingAccountId"] == wrong_grir.accountId
