"""
Tax Codes API

CRUD endpoints for UAE VAT tax codes.

Permissions:
- GET: accountant, finance_admin, auditor
- POST/PATCH: finance_admin
"""

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.session import get_db
from ...middleware.auth import TokenPayload, require_roles
from ...models.orm.models import TaxCode
from ...models.schemas.common import SuccessResponse
from ...models.schemas.tax_code import TaxCodeCreate, TaxCodeResponse, TaxCodeUpdate
from ...utils.responses import success

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Tax Codes"])

_READ_ROLES = ("accountant", "finance_admin", "auditor", "super_admin", "admin")
_WRITE_ROLES = ("finance_admin", "super_admin", "admin")


@router.get(
    "/tax-codes",
    response_model=SuccessResponse[List[TaxCodeResponse]],
    summary="List tax codes",
)
async def list_tax_codes(
    organization_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[List[TaxCodeResponse]]:
    """Return all tax codes for an organization."""
    result = await db.execute(
        select(TaxCode)
        .where(TaxCode.organizationId == organization_id)
        .order_by(TaxCode.taxCode)
    )
    codes = result.scalars().all()
    return success([TaxCodeResponse.model_validate(c) for c in codes])


@router.post(
    "/tax-codes",
    response_model=SuccessResponse[TaxCodeResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create tax code",
)
async def create_tax_code(
    body: TaxCodeCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[TaxCodeResponse]:
    """
    Create a tax code.

    Raises:
        HTTPException 409: If (organizationId, taxCode) already exists.
    """
    existing = await db.get(TaxCode, {"organizationId": body.organizationId, "taxCode": body.taxCode})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Tax code '{body.taxCode}' already exists for this organization.",
        )

    tax_code = TaxCode(**body.model_dump())
    db.add(tax_code)
    await db.flush()

    return success(TaxCodeResponse.model_validate(tax_code))


@router.patch(
    "/tax-codes/{tax_code}",
    response_model=SuccessResponse[TaxCodeResponse],
    summary="Update tax code",
)
async def update_tax_code(
    tax_code: str,
    organization_id: str = Query(...),
    body: TaxCodeUpdate = ...,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[TaxCodeResponse]:
    """
    Partially update a tax code.

    Raises:
        HTTPException 404: If tax code not found.
    """
    tc = await db.get(TaxCode, {"organizationId": organization_id, "taxCode": tax_code})
    if not tc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tax code '{tax_code}' not found for this organization.",
        )

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(tc, field, value)

    return success(TaxCodeResponse.model_validate(tc))
