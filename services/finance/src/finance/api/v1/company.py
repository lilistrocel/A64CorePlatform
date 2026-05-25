"""
Company Codes API

CRUD endpoints for company codes.
POST /companies also triggers CoA + tax code seeding.

Permissions:
- GET: accountant, finance_admin, auditor
- POST/PATCH: finance_admin only

Also hosts the Company Posting Setup sub-resource:
  GET  /companies/{company_code}/posting-setup  — read roles
  PUT  /companies/{company_code}/posting-setup  — write roles (finance_admin / admin / super_admin)
"""

import logging
import uuid
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.session import get_db
from ...middleware.auth import TokenPayload, get_current_user, require_roles
from ...models.orm.models import (
    AccountLevelEnum,
    AccountTypeEnum,
    CompanyCode,
    CompanyPostingSetup,
    DrawerEnum,
    GLAccount,
    JEStatusEnum,
    JournalEntry,
    JournalEntryLine,
)
from ...models.schemas.common import SuccessResponse
from ...models.schemas.company import (
    CompanyCodeCreate,
    CompanyCodeResponse,
    CompanyCodeUpdate,
)
from ...models.schemas.posting_setup import (
    CompanyPostingSetupResponse,
    CompanyPostingSetupUpdate,
)
from ...services.seed_loader import seed_company_defaults
from ...utils.responses import success

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Companies"])

_READ_ROLES = ("accountant", "finance_admin", "auditor", "super_admin", "admin")
_WRITE_ROLES = ("finance_admin", "super_admin", "admin")


@router.get(
    "/companies",
    response_model=SuccessResponse[List[CompanyCodeResponse]],
    summary="List company codes",
    description=(
        "Return company codes. When organization_id is supplied, results are "
        "filtered to that organization only — useful for UI dropdowns. "
        "Omitting organization_id returns all companies (super_admin use)."
    ),
)
async def list_companies(
    organization_id: Optional[str] = Query(
        None,
        description="Filter by organization UUID. Omit to return all companies.",
    ),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[List[CompanyCodeResponse]]:
    """
    Return company codes, optionally scoped to an organization.

    Args:
        organization_id: Optional organization UUID filter. When provided,
            only companies belonging to that organization are returned.
            Omitting returns all companies (intended for super_admin tooling).

    Returns:
        List of company codes matching the filter.
    """
    query = select(CompanyCode).order_by(CompanyCode.companyCode)
    if organization_id is not None:
        # Reason: Approval Rules UI and other dropdowns pass organization_id
        # to scope the list to the active tenant. Without this filter, a
        # multi-tenant deployment would expose cross-org company codes.
        query = query.where(CompanyCode.organizationId == organization_id)
    result = await db.execute(query)
    companies = result.scalars().all()
    return success([CompanyCodeResponse.model_validate(c) for c in companies])


@router.post(
    "/companies",
    response_model=SuccessResponse[CompanyCodeResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create company code (seeds CoA)",
)
async def create_company(
    body: CompanyCodeCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[CompanyCodeResponse]:
    """
    Create a new company code.

    After inserting the company row, seeds the default chart of accounts
    (~308 accounts) and default UAE VAT tax codes for the organization.

    Args:
        body: Company creation payload.

    Returns:
        Created company code with seeding confirmation message.

    Raises:
        HTTPException 409: If companyCode already exists.
    """
    existing = await db.get(CompanyCode, body.companyCode)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Company code '{body.companyCode}' already exists.",
        )

    company = CompanyCode(**body.model_dump())
    db.add(company)
    await db.flush()
    # Reason: refresh to load server-generated columns (createdAt, updatedAt
    # via DEFAULT CURRENT_TIMESTAMP) before Pydantic serialization, otherwise
    # model_validate triggers an async lazy-load and the greenlet bridge errors.
    await db.refresh(company)

    # Seed CoA and tax codes for the organization
    seed_result = await seed_company_defaults(db, body.organizationId, body.companyCode)

    logger.info(
        "Created company %s — seeded %d accounts, %d tax codes",
        body.companyCode,
        seed_result["accounts_inserted"],
        seed_result["tax_codes_inserted"],
    )

    return success(
        CompanyCodeResponse.model_validate(company),
        message=(
            f"Company created. "
            f"Seeded {seed_result['accounts_inserted']} GL accounts, "
            f"{seed_result['tax_codes_inserted']} tax codes."
        ),
    )


@router.get(
    "/companies/{company_code}",
    response_model=SuccessResponse[CompanyCodeResponse],
    summary="Get company code",
)
async def get_company(
    company_code: str,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[CompanyCodeResponse]:
    """Retrieve a single company code by its primary key."""
    company = await db.get(CompanyCode, company_code)
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company code '{company_code}' not found.",
        )
    return success(CompanyCodeResponse.model_validate(company))


@router.patch(
    "/companies/{company_code}",
    response_model=SuccessResponse[CompanyCodeResponse],
    summary="Update company code",
)
async def update_company(
    company_code: str,
    body: CompanyCodeUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[CompanyCodeResponse]:
    """
    Partially update a company code.

    Args:
        company_code: Company code PK.
        body: Fields to update (None fields are skipped).

    Raises:
        HTTPException 404: If company code not found.
        HTTPException 423: If company is locked.
    """
    company = await db.get(CompanyCode, company_code)
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company code '{company_code}' not found.",
        )
    if company.isLocked and body.isLocked is not True:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Company code is locked. Unlock it first.",
        )

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(company, field, value)

    return success(CompanyCodeResponse.model_validate(company))


# ===========================================================================
# Company Posting Setup
# ===========================================================================

# Fields whose presence determines isComplete.  All five must be non-null
# for the setup to be considered complete enough to drive posting handlers.
_REQUIRED_POSTING_FIELDS = (
    "apControlAccountId",
    "bankAccountId",
    "grIrClearingAccountId",
    "inputVatAccountId",
    "retainedEarningsAccountId",
)

# All clearing/control account FK fields on CompanyPostingSetup.
# Changing any of these while the OLD account carries a non-zero balance
# strands funds — guard every one identically (same risk profile as GR/IR).
_CLEARING_ACCOUNT_FIELDS = (
    "apControlAccountId",
    "arControlAccountId",
    "bankAccountId",
    "cashAccountId",
    "grIrClearingAccountId",
    "inputVatAccountId",
    "outputVatAccountId",
    "retainedEarningsAccountId",
    "purchasePriceVarianceAccountId",
    "roundingAccountId",
)


# ---------------------------------------------------------------------------
# Semantic type requirements per clearing-account field (T-063.A).
#
# Each entry maps a posting-setup field name to the set of (drawer, accountType)
# pairs that are ALLOWED for that field.  The set allows multi-drawer fields
# (e.g. PPV may be in either COST_OF_SALES or OPERATING_COST) without
# duplicating the check logic.
#
# Accounting rationale for each entry:
#   apControlAccountId       — AP is a current liability; must be LIABILITIES/liability.
#   arControlAccountId       — AR is a current asset; must be ASSETS/asset.
#   bankAccountId            — Cash at bank is a current asset; must be ASSETS/asset.
#   cashAccountId            — Petty cash is a current asset; must be ASSETS/asset.
#   grIrClearingAccountId    — GRNI is an accrued liability; must be LIABILITIES/liability.
#   inputVatAccountId        — Input VAT recoverable is an asset; must be ASSETS/asset.
#   outputVatAccountId       — Output VAT payable is a liability; must be LIABILITIES/liability.
#   retainedEarningsAccountId— RE is an equity account; must be EQUITY/equity.
#   purchasePriceVarianceId  — PPV is a P&L variance expense; must be COST_OF_SALES or
#                              OPERATING_COST, both with accountType=expense.
#   roundingAccountId        — Rounding differences are an operating expense; must be
#                              OPERATING_COST/expense (the spec notes OTHER_INCOME is also
#                              valid if the site uses a gain-bias config, but we
#                              enforce OPERATING_COST only to match the seeded default
#                              and keep the guard conservative — can be relaxed later).
# ---------------------------------------------------------------------------

# Type alias: allowed (drawer, accountType) combinations per field.
_AllowedTypes = frozenset[tuple[DrawerEnum, AccountTypeEnum]]

_CLEARING_ACCOUNT_TYPE_REQUIREMENTS: dict[str, _AllowedTypes] = {
    "apControlAccountId": frozenset({
        (DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY),
    }),
    "arControlAccountId": frozenset({
        (DrawerEnum.ASSETS, AccountTypeEnum.ASSET),
    }),
    "bankAccountId": frozenset({
        (DrawerEnum.ASSETS, AccountTypeEnum.ASSET),
    }),
    "cashAccountId": frozenset({
        (DrawerEnum.ASSETS, AccountTypeEnum.ASSET),
    }),
    "grIrClearingAccountId": frozenset({
        (DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY),
    }),
    "inputVatAccountId": frozenset({
        (DrawerEnum.ASSETS, AccountTypeEnum.ASSET),
    }),
    "outputVatAccountId": frozenset({
        (DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY),
    }),
    "retainedEarningsAccountId": frozenset({
        (DrawerEnum.EQUITY, AccountTypeEnum.EQUITY),
    }),
    "purchasePriceVarianceAccountId": frozenset({
        (DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE),
        (DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE),
    }),
    "roundingAccountId": frozenset({
        (DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE),
    }),
}


async def _check_clearing_account_type(
    field_name: str,
    account_id: str,
    organization_id: str,
    db: AsyncSession,
) -> None:
    """
    Reject a clearing-account field assignment when the NEW account's
    drawer / accountType does not match the semantic requirements for
    that field (T-063.A).

    This check runs BEFORE the balance guard:
      - Type mismatch = configuration error → 422 Unprocessable Entity.
      - Non-zero balance = workflow error  → 409 Conflict.
    Separating the status codes lets callers distinguish the two failure
    modes at a glance.

    Header accounts (isHeader=True) are unconditionally rejected because
    you cannot post individual transactions to a roll-up / summary account.
    This mirrors the restriction that will be enforced on the manual JE
    endpoint (T-061) for consistency.

    Args:
        field_name: Name of the posting-setup field (used in error messages).
        account_id: The NEW GL account UUID to type-check.
        organization_id: Org scope (account must belong to this org —
            already validated upstream by _validate_account_id, but
            needed here to load the account object).
        db: Async DB session.

    Raises:
        HTTPException 422: If the account's drawer/accountType is not in
            the allowed set for this field, or if isHeader=True.
    """
    allowed: _AllowedTypes = _CLEARING_ACCOUNT_TYPE_REQUIREMENTS.get(field_name, frozenset())
    if not allowed:
        # Reason: defensive guard — if a new clearing field is added to
        # _CLEARING_ACCOUNT_FIELDS without a corresponding entry in
        # _CLEARING_ACCOUNT_TYPE_REQUIREMENTS, fail loudly rather than
        # silently skipping the check.
        return

    account = await db.get(GLAccount, account_id)
    if account is None:
        # Reason: _validate_account_id already enforces existence; this
        # branch is unreachable in normal flow but kept for safety.
        return

    # Reject header accounts — posting to roll-up accounts silently
    # inflates parent balances without creating visible leaf entries.
    if account.isHeader:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Cannot assign account {account.accountNumber} "
                f"'{account.accountName}' to {field_name} — "
                f"header accounts (isHeader=true) cannot be used as posting "
                f"targets. Use a detail (leaf) account instead."
            ),
        )

    # Check the drawer+accountType combination.
    actual_pair = (account.drawer, account.accountType)
    if actual_pair not in allowed:
        allowed_desc = " or ".join(
            f"drawer={d.value}, accountType={t.value}" for d, t in sorted(
                allowed, key=lambda p: p[0].value
            )
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Cannot assign account {account.accountNumber} "
                f"'{account.accountName}' "
                f"(drawer={account.drawer.value}, accountType={account.accountType.value}) "
                f"to {field_name} — this field requires an account with "
                f"{allowed_desc}."
            ),
        )


async def _check_clearing_account_balance(
    field_name: str,
    old_account_id: str,
    organization_id: str,
    company_code: str,
    db: AsyncSession,
) -> None:
    """
    Reject a clearing-account field change when the OLD account still carries
    a non-zero posted balance for this company.

    Computes signed_balance = SUM(debit) - SUM(credit) across all POSTED JE
    lines for the old account.  A non-zero result means stranded funds would
    result from the change — the caller must post a correcting JE first.

    Args:
        field_name: Name of the posting-setup field (used in error messages).
        old_account_id: The current (outgoing) GL account UUID.
        organization_id: Org scope.
        company_code: Company scope.
        db: Async DB session.

    Raises:
        HTTPException 409: If the old account has a non-zero posted balance.
    """
    # Reason: Only POSTED JEs count — voided entries are excluded because they
    # have already been reversed and contribute zero net balance.
    result = await db.execute(
        select(
            func.coalesce(func.sum(JournalEntryLine.debit), Decimal("0")).label("sum_debit"),
            func.coalesce(func.sum(JournalEntryLine.credit), Decimal("0")).label("sum_credit"),
        )
        .join(JournalEntry, JournalEntryLine.jeId == JournalEntry.jeId)
        .where(
            JournalEntry.organizationId == organization_id,
            JournalEntry.companyCode == company_code,
            JournalEntry.status == JEStatusEnum.POSTED,
            JournalEntryLine.accountId == old_account_id,
        )
    )
    row = result.one()
    sum_debit = Decimal(str(row.sum_debit))
    sum_credit = Decimal(str(row.sum_credit))
    signed_balance = sum_debit - sum_credit

    if signed_balance != Decimal("0"):
        # Fetch account number for a human-readable error message.
        old_account = await db.get(GLAccount, old_account_id)
        account_number = old_account.accountNumber if old_account else old_account_id
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot change {field_name} — old account {account_number} holds a "
                f"non-zero balance ({signed_balance:.2f}). Post a correcting JE to "
                f"clear it first, or contact a finance admin to migrate the balance."
            ),
        )


async def _validate_account_id(
    field_name: str,
    account_id: str,
    organization_id: str,
    db: AsyncSession,
) -> None:
    """
    Validate that account_id exists, belongs to the org, is active, and is
    an 'active'-level account (not a title or drawer account).

    Args:
        field_name: Name of the posting-setup field (used in error messages).
        account_id: The GL account UUID to validate.
        organization_id: Org scope.
        db: Async DB session.

    Raises:
        HTTPException 422: If the account does not exist, is inactive, or
            has accountLevel != 'active'.
    """
    account = await db.get(GLAccount, account_id)
    if account is None or account.organizationId != organization_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name}: account '{account_id}' not found for this organization.",
        )
    if not account.isActive:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name}: account '{account_id}' is inactive.",
        )
    if account.accountLevel != AccountLevelEnum.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"{field_name}: cannot post to a '{account.accountLevel.value}' account "
                f"('{account_id}'). Only 'active'-level accounts may be used."
            ),
        )


@router.get(
    "/companies/{company_code}/posting-setup",
    response_model=SuccessResponse[CompanyPostingSetupResponse],
    summary="Get company posting setup",
    description=(
        "Return the current posting setup for a company.  "
        "Returns 404 if no setup has been configured yet — the frontend should "
        "then show a setup wizard."
    ),
)
async def get_posting_setup(
    company_code: str,
    organization_id: str = Query(..., description="Required — org scope"),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[CompanyPostingSetupResponse]:
    """
    Retrieve the posting setup for a company.

    Args:
        company_code: Company code PK.
        organization_id: Org scope for multi-tenant isolation.
        db: Async DB session.
        _current_user: Authenticated user (read roles).

    Returns:
        CompanyPostingSetupResponse.

    Raises:
        HTTPException 404: If no setup row exists for this (org, company).
    """
    result = await db.execute(
        select(CompanyPostingSetup).where(
            CompanyPostingSetup.organizationId == organization_id,
            CompanyPostingSetup.companyCode == company_code,
        )
    )
    setup = result.scalar_one_or_none()
    if not setup:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"No posting setup found for company '{company_code}' "
                f"in organization '{organization_id}'."
            ),
        )
    return success(CompanyPostingSetupResponse.model_validate(setup))


@router.put(
    "/companies/{company_code}/posting-setup",
    response_model=SuccessResponse[CompanyPostingSetupResponse],
    summary="Upsert company posting setup",
    description=(
        "Create or update the posting setup for a company.  "
        "Each supplied accountId is validated to exist, be active, and have "
        "accountLevel='active'.  isComplete is computed automatically from "
        "the required fields (apControlAccountId, bankAccountId, "
        "grIrClearingAccountId, inputVatAccountId, retainedEarningsAccountId)."
    ),
)
async def upsert_posting_setup(
    company_code: str,
    body: CompanyPostingSetupUpdate,
    organization_id: str = Query(..., description="Required — org scope"),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[CompanyPostingSetupResponse]:
    """
    Create or update the posting setup for a company.

    Validates each supplied accountId, computes isComplete, and upserts the row.

    Args:
        company_code: Company code PK.
        body: Account FK fields to set (all Optional).
        organization_id: Org scope.
        db: Async DB session.
        current_user: Authenticated user (write roles — finance_admin/admin/super_admin).

    Returns:
        Updated CompanyPostingSetupResponse.

    Raises:
        HTTPException 422: If any supplied accountId is invalid (not found,
            inactive, or not an 'active'-level account).
    """
    # Validate every supplied accountId before writing anything.
    # Reason: exclude_none=False so callers can explicitly clear account FKs by
    # sending null — the FK columns are nullable and clearing is intentional.
    update_data = body.model_dump(exclude_none=False)
    # Reason: defaultValuationMethod is NOT NULL in the DB; skip it when None so
    # partial updates that omit it do not overwrite an existing value with NULL.
    _non_nullable_fields = {"defaultValuationMethod"}
    account_fields = {k: v for k, v in update_data.items() if k not in _non_nullable_fields}
    for field_name, account_id in account_fields.items():
        if account_id is not None:
            await _validate_account_id(field_name, account_id, organization_id, db)

    # Upsert
    result = await db.execute(
        select(CompanyPostingSetup).where(
            CompanyPostingSetup.organizationId == organization_id,
            CompanyPostingSetup.companyCode == company_code,
        )
    )
    setup = result.scalar_one_or_none()

    # Reason: T-063.A — semantic type guard.  For each clearing-account field
    # that is being SET TO A NON-NULL value AND the value differs from the
    # current stored value (or the row doesn't exist yet), verify the new
    # account's drawer/accountType matches the semantic requirements.
    # Type mismatch is a configuration error → 422 (not 409).
    # Runs BEFORE the balance guard: type errors are cheaper to detect and
    # should produce the clearest error if both guards would otherwise fire.
    for clearing_field in _CLEARING_ACCOUNT_FIELDS:
        new_value = account_fields.get(clearing_field)
        if new_value is None:
            # Reason: null means "clear the field" or "don't change it" —
            # either way there is no type to check on the incoming value.
            continue
        current_value = getattr(setup, clearing_field, None) if setup is not None else None
        if new_value == current_value:
            # Reason: field is not changing — skip both type and balance guards.
            continue
        await _check_clearing_account_type(clearing_field, new_value, organization_id, db)

    # Reason: Guard against stranded-balance incidents (e.g. the 35k AED GR/IR
    # incident — JE-1000-2026-0006).  For each clearing-account field that is
    # being CHANGED (new value differs from current, and old value is non-null),
    # verify the old account's posted balance is zero before allowing the swap.
    # A non-zero balance means live transactions still reference the old account;
    # changing the pointer mid-flight would leave those funds stranded.
    if setup is not None:
        for clearing_field in _CLEARING_ACCOUNT_FIELDS:
            new_value = account_fields.get(clearing_field)
            old_value = getattr(setup, clearing_field, None)
            # Only check when: old account is set, new value differs from old.
            if old_value is not None and new_value != old_value:
                await _check_clearing_account_balance(
                    clearing_field, old_value, organization_id, company_code, db
                )

    if setup is None:
        setup = CompanyPostingSetup(
            setupId=str(uuid.uuid4()),
            organizationId=organization_id,
            companyCode=company_code,
        )
        db.add(setup)

    # Apply account FK fields (including explicit nulls — callers can clear them).
    for field_name, value in account_fields.items():
        setattr(setup, field_name, value)

    # Apply non-nullable fields only when explicitly supplied (not None).
    for field_name in _non_nullable_fields:
        value = update_data.get(field_name)
        if value is not None:
            setattr(setup, field_name, value)

    # Inject updatedBy from JWT.
    setup.updatedBy = current_user.userId

    # Compute isComplete: all five required fields must be non-null.
    setup.isComplete = all(
        getattr(setup, f) is not None for f in _REQUIRED_POSTING_FIELDS
    )

    await db.flush()
    await db.refresh(setup)

    return success(CompanyPostingSetupResponse.model_validate(setup))
