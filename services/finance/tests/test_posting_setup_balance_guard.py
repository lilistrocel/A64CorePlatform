"""
Fix C tests — posting-setup clearing-account balance guard.

Changing a clearing/control account field on CompanyPostingSetup while the OLD
account still carries a non-zero posted balance strands funds (the GR/IR incident:
35,000 AED stranded between 221000-002 and 223000-004, repaired by JE-1000-2026-0006).

The guard is applied uniformly to ALL ten clearing-account fields because they all
have the same risk profile:
  apControlAccountId, arControlAccountId, bankAccountId, cashAccountId,
  grIrClearingAccountId, inputVatAccountId, outputVatAccountId,
  retainedEarningsAccountId, purchasePriceVarianceAccountId, roundingAccountId

Test cases:
  - Happy path: change a field whose old account has zero balance → 200.
  - Reject path: change a field whose old account has non-zero balance → 409.
  - No-op path: PATCH that doesn't change clearing-account fields → 200.
  - Parametrised reject test: one test per clearing-account field so all ten
    are covered without ten nearly-identical functions.
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

# ---------------------------------------------------------------------------
# Per-field correct (drawer, accountType) pairs — required after T-063.A
# added semantic type validation to the upsert endpoint.  Tests that create
# accounts for a specific field must use the correct type, otherwise the
# type guard fires before the balance guard and the test asserts the wrong
# status code.
# ---------------------------------------------------------------------------
_FIELD_CORRECT_TYPES: dict[str, tuple[DrawerEnum, AccountTypeEnum]] = {
    "apControlAccountId":             (DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY),
    "arControlAccountId":             (DrawerEnum.ASSETS,      AccountTypeEnum.ASSET),
    "bankAccountId":                  (DrawerEnum.ASSETS,      AccountTypeEnum.ASSET),
    "cashAccountId":                  (DrawerEnum.ASSETS,      AccountTypeEnum.ASSET),
    "grIrClearingAccountId":          (DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY),
    "inputVatAccountId":              (DrawerEnum.ASSETS,      AccountTypeEnum.ASSET),
    "outputVatAccountId":             (DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY),
    "retainedEarningsAccountId":      (DrawerEnum.EQUITY,      AccountTypeEnum.EQUITY),
    "purchasePriceVarianceAccountId": (DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE),
    "roundingAccountId":              (DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE),
}

from .conftest import auth_headers

# ---------------------------------------------------------------------------
# Organisation / company prefix shared by all tests in this module.
# Using a short prefix ensures account numbers don't collide across tests
# (each test generates its own org_id and company_code).
# ---------------------------------------------------------------------------
_ORG_PREFIX = "org-psbg"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _seed_company(db_session: AsyncSession, org_id: str, company_code: str) -> str:
    """
    Insert a CompanyCode + an OPEN fiscal period spanning 2025-2027.
    Returns period_id.
    """
    db_session.add(
        CompanyCode(
            companyCode=company_code,
            organizationId=org_id,
            legalName=f"PS Guard Test {company_code}",
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


async def _make_active_account(
    db_session: AsyncSession,
    org_id: str,
    account_number: str,
    account_name: str,
    drawer: DrawerEnum = DrawerEnum.ASSETS,
    account_type: AccountTypeEnum = AccountTypeEnum.ASSET,
) -> GLAccount:
    """
    Insert and return an active 'active'-level GL account.

    Default drawer/type is ASSETS/asset (safe for balancing accounts that are
    never submitted to the posting-setup endpoint directly).  Tests that set a
    field on the posting setup must pass the correct drawer/type for that field
    so the T-063.A semantic guard does not fire before the balance guard.

    Args:
        db_session: Test DB session.
        org_id: Organization scope.
        account_number: Unique account number.
        account_name: Display name.
        drawer: DrawerEnum (default ASSETS).
        account_type: AccountTypeEnum (default ASSET).

    Returns:
        Persisted GLAccount ORM object.
    """
    acct = GLAccount(
        accountId=str(uuid.uuid4()),
        organizationId=org_id,
        accountNumber=account_number,
        accountName=account_name,
        drawer=drawer,
        accountType=account_type,
        accountLevel=AccountLevelEnum.ACTIVE,
        isHeader=False,
        isActive=True,
    )
    db_session.add(acct)
    await db_session.commit()
    await db_session.refresh(acct)
    return acct


async def _post_je_to_account(
    db_session: AsyncSession,
    org_id: str,
    company_code: str,
    period_id: str,
    account_id: str,
    balancing_account_id: str,
    amount: Decimal,
    je_date: date,
) -> str:
    """
    Post a balanced JE: DR `account_id` / CR `balancing_account_id`.
    Returns je_id.
    """
    je_id = str(uuid.uuid4())
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
            totalDebit=amount,
            totalCredit=amount,
            status=JEStatusEnum.POSTED,
            postedAt=datetime.utcnow(),
            postedBy="user-test",
        )
    )
    db_session.add(
        JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=je_id,
            lineNumber=1,
            accountId=account_id,
            debit=amount,
            credit=Decimal("0"),
        )
    )
    db_session.add(
        JournalEntryLine(
            jeLineId=str(uuid.uuid4()),
            jeId=je_id,
            lineNumber=2,
            accountId=balancing_account_id,
            debit=Decimal("0"),
            credit=amount,
        )
    )
    await db_session.commit()
    return je_id


async def _put_posting_setup(
    client: AsyncClient,
    org_id: str,
    company_code: str,
    payload: dict,
) -> dict:
    """Thin wrapper around PUT /companies/{cc}/posting-setup."""
    resp = await client.put(
        f"/api/v1/finance/companies/{company_code}/posting-setup",
        params={"organization_id": org_id},
        json=payload,
        headers=auth_headers(),
    )
    return resp


# ---------------------------------------------------------------------------
# Happy path — change a clearing-account field when OLD account has zero balance
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_change_clearing_account_zero_balance_succeeds(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    When the old grIrClearingAccountId account has ZERO posted balance,
    the PUT must succeed with HTTP 200 and the new account ID stored.
    """
    org_id = f"{_ORG_PREFIX}-happy-{uuid.uuid4().hex[:6]}"
    company_code = f"HH{uuid.uuid4().hex[:6].upper()}"
    await _seed_company(db_session, org_id, company_code)

    # Reason: T-063.A requires grIrClearingAccountId accounts to be
    # LIABILITIES/liability — use the correct type so the semantic guard passes.
    grir_type = _FIELD_CORRECT_TYPES["grIrClearingAccountId"]
    old_acct = await _make_active_account(
        db_session, org_id, "221099", "GR/IR Old (zero)", *grir_type
    )
    new_acct = await _make_active_account(
        db_session, org_id, "221098", "GR/IR New", *grir_type
    )

    # Set initial posting setup pointing to old_acct.
    resp1 = await _put_posting_setup(
        client, org_id, company_code,
        {"grIrClearingAccountId": old_acct.accountId},
    )
    assert resp1.status_code == 200, resp1.text

    # No JEs posted to old_acct → balance is zero → swap must succeed.
    resp2 = await _put_posting_setup(
        client, org_id, company_code,
        {"grIrClearingAccountId": new_acct.accountId},
    )
    assert resp2.status_code == 200, resp2.text
    data = resp2.json()["data"]
    assert data["grIrClearingAccountId"] == new_acct.accountId


# ---------------------------------------------------------------------------
# Reject path — change a clearing-account field when OLD account has non-zero balance
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_change_clearing_account_nonzero_balance_rejected(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    When the old grIrClearingAccountId account has a NON-ZERO posted balance,
    the PUT must be rejected with HTTP 409.

    Error detail must name:
      - the field (grIrClearingAccountId)
      - the old account number
      - the stranded balance
    """
    org_id = f"{_ORG_PREFIX}-reject-{uuid.uuid4().hex[:6]}"
    company_code = f"RJ{uuid.uuid4().hex[:6].upper()}"
    period_id = await _seed_company(db_session, org_id, company_code)

    # Reason: T-063.A requires grIrClearingAccountId accounts to be LIABILITIES/liability.
    grir_type = _FIELD_CORRECT_TYPES["grIrClearingAccountId"]
    old_acct = await _make_active_account(
        db_session, org_id, "221097", "GR/IR Old (stranded)", *grir_type
    )
    # balancing account: ASSETS/asset is fine — it's never submitted to posting-setup.
    balancing = await _make_active_account(db_session, org_id, "221096", "Balancing Acct")
    new_acct = await _make_active_account(
        db_session, org_id, "221095", "GR/IR New", *grir_type
    )

    # Set initial posting setup pointing to old_acct.
    resp1 = await _put_posting_setup(
        client, org_id, company_code,
        {"grIrClearingAccountId": old_acct.accountId},
    )
    assert resp1.status_code == 200, resp1.text

    # Post a JE to old_acct so it carries a non-zero balance.
    await _post_je_to_account(
        db_session, org_id, company_code, period_id,
        account_id=old_acct.accountId,
        balancing_account_id=balancing.accountId,
        amount=Decimal("35000"),
        je_date=date(2026, 3, 1),
    )

    # Attempt to swap to new_acct — must be rejected.
    resp2 = await _put_posting_setup(
        client, org_id, company_code,
        {"grIrClearingAccountId": new_acct.accountId},
    )
    assert resp2.status_code == 409, resp2.text
    detail = resp2.json()["detail"]
    assert "grIrClearingAccountId" in detail, f"Expected field name in detail: {detail}"
    assert "221097" in detail, f"Expected old account number in detail: {detail}"
    assert "35000" in detail, f"Expected stranded balance in detail: {detail}"


# ---------------------------------------------------------------------------
# No-op path — PATCH does NOT change any clearing-account fields
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_patch_no_clearing_field_change_succeeds_regardless_of_balance(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    A PUT that sends the SAME account IDs (no-op change) must succeed even
    when those accounts carry a non-zero balance.  The guard only fires when
    a field VALUE actually changes.
    """
    org_id = f"{_ORG_PREFIX}-noop-{uuid.uuid4().hex[:6]}"
    company_code = f"NP{uuid.uuid4().hex[:6].upper()}"
    period_id = await _seed_company(db_session, org_id, company_code)

    # Reason: T-063.A — use correct type for grIrClearingAccountId.
    grir_type = _FIELD_CORRECT_TYPES["grIrClearingAccountId"]
    acct = await _make_active_account(
        db_session, org_id, "221094", "GR/IR Same Account", *grir_type
    )
    # balancing account: not submitted to posting-setup, default type is fine.
    balancing = await _make_active_account(db_session, org_id, "221093", "Balancing Same")

    # Initial setup.
    resp1 = await _put_posting_setup(
        client, org_id, company_code,
        {"grIrClearingAccountId": acct.accountId},
    )
    assert resp1.status_code == 200, resp1.text

    # Post balance to acct.
    await _post_je_to_account(
        db_session, org_id, company_code, period_id,
        account_id=acct.accountId,
        balancing_account_id=balancing.accountId,
        amount=Decimal("5000"),
        je_date=date(2026, 4, 1),
    )

    # PUT with the SAME account ID — no change → must succeed.
    resp2 = await _put_posting_setup(
        client, org_id, company_code,
        {"grIrClearingAccountId": acct.accountId},
    )
    assert resp2.status_code == 200, resp2.text


# ---------------------------------------------------------------------------
# Parametrised reject test — every clearing-account field is covered
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "field_name,account_number_prefix",
    [
        ("apControlAccountId",             "AP"),
        ("arControlAccountId",             "AR"),
        ("bankAccountId",                  "BK"),
        ("cashAccountId",                  "CH"),
        ("grIrClearingAccountId",          "GR"),
        ("inputVatAccountId",              "IV"),
        ("outputVatAccountId",             "OV"),
        ("retainedEarningsAccountId",      "RE"),
        ("purchasePriceVarianceAccountId", "PP"),
        ("roundingAccountId",              "RD"),
    ],
)
async def test_every_clearing_field_rejects_nonzero_balance_change(
    client: AsyncClient,
    db_session: AsyncSession,
    field_name: str,
    account_number_prefix: str,
) -> None:
    """
    For each of the ten clearing-account fields, verify that attempting to swap
    the field to a new account while the OLD account has a non-zero posted
    balance is rejected with HTTP 409 and a detail string naming the field and
    the old account number.

    Each parametrised run uses a unique org / company / account number so there
    is no cross-contamination between runs.
    """
    # Unique identifiers per parametrised run.
    suffix = uuid.uuid4().hex[:6].upper()
    org_id = f"{_ORG_PREFIX}-{field_name[:4]}-{suffix.lower()}"
    company_code = f"{account_number_prefix}{suffix[:6]}"
    # Account numbers: 7-digit with prefix to avoid collisions with seeded CoA.
    old_number = f"9{account_number_prefix}0001"[:7].ljust(7, "0")
    bal_number = f"9{account_number_prefix}0002"[:7].ljust(7, "0")
    new_number = f"9{account_number_prefix}0003"[:7].ljust(7, "0")

    period_id = await _seed_company(db_session, org_id, company_code)

    # Reason: T-063.A — use the type-correct drawer/accountType for this field
    # so the semantic guard does not fire before the balance guard.  The
    # balancing account is only used in the JE, not in the posting setup, so it
    # keeps the safe default (ASSETS/asset).
    correct_drawer, correct_type = _FIELD_CORRECT_TYPES[field_name]
    old_acct = await _make_active_account(
        db_session, org_id, old_number, f"Old {field_name}", correct_drawer, correct_type
    )
    bal_acct = await _make_active_account(db_session, org_id, bal_number, f"Balancing {field_name}")
    new_acct = await _make_active_account(
        db_session, org_id, new_number, f"New {field_name}", correct_drawer, correct_type
    )

    # Set the field to old_acct.
    resp1 = await _put_posting_setup(
        client, org_id, company_code,
        {field_name: old_acct.accountId},
    )
    assert resp1.status_code == 200, f"Initial setup failed: {resp1.text}"

    # Post a balance on old_acct.
    await _post_je_to_account(
        db_session, org_id, company_code, period_id,
        account_id=old_acct.accountId,
        balancing_account_id=bal_acct.accountId,
        amount=Decimal("1000"),
        je_date=date(2026, 5, 1),
    )

    # Attempt to change to new_acct — must be rejected.
    resp2 = await _put_posting_setup(
        client, org_id, company_code,
        {field_name: new_acct.accountId},
    )
    assert resp2.status_code == 409, (
        f"Expected 409 for {field_name} with non-zero balance, got {resp2.status_code}: {resp2.text}"
    )
    detail = resp2.json()["detail"]
    assert field_name in detail, (
        f"Expected field name '{field_name}' in error detail for {field_name}: {detail}"
    )
    assert old_number in detail, (
        f"Expected old account number '{old_number}' in error detail for {field_name}: {detail}"
    )
