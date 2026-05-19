"""
Company Codes API

CRUD endpoints for company codes.
POST /companies also triggers CoA + tax code seeding.

Permissions:
- GET: accountant, finance_admin, auditor
- POST/PATCH: finance_admin only
"""

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.session import get_db
from ...middleware.auth import TokenPayload, get_current_user, require_roles
from ...models.orm.models import CompanyCode
from ...models.schemas.common import SuccessResponse
from ...models.schemas.company import (
    CompanyCodeCreate,
    CompanyCodeResponse,
    CompanyCodeUpdate,
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
)
async def list_companies(
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[List[CompanyCodeResponse]]:
    """Return all company codes visible to the caller."""
    result = await db.execute(select(CompanyCode).order_by(CompanyCode.companyCode))
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
