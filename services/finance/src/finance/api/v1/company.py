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
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.session import get_db
from ...middleware.auth import TokenPayload, get_current_user, require_roles
from ...models.orm.models import AccountLevelEnum, CompanyCode, CompanyPostingSetup, GLAccount
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
