"""
Cost Centers API

CRUD endpoints for cost centres.

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
from ...models.orm.models import CostCenter
from ...models.schemas.common import SuccessResponse
from ...models.schemas.cost_center import (
    CostCenterCreate,
    CostCenterResponse,
    CostCenterUpdate,
)
from ...utils.responses import success

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Cost Centers"])

_READ_ROLES = ("accountant", "finance_admin", "auditor", "super_admin", "admin")
_WRITE_ROLES = ("finance_admin", "super_admin", "admin")


@router.get(
    "/cost-centers",
    response_model=SuccessResponse[List[CostCenterResponse]],
    summary="List cost centres",
)
async def list_cost_centers(
    organization_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[List[CostCenterResponse]]:
    """Return all cost centres for an organization."""
    result = await db.execute(
        select(CostCenter)
        .where(CostCenter.organizationId == organization_id)
        .order_by(CostCenter.costCenterId)
    )
    centers = result.scalars().all()
    return success([CostCenterResponse.model_validate(c) for c in centers])


@router.post(
    "/cost-centers",
    response_model=SuccessResponse[CostCenterResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create cost centre",
)
async def create_cost_center(
    body: CostCenterCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[CostCenterResponse]:
    """
    Create a cost centre.

    Raises:
        HTTPException 409: If (organizationId, costCenterId) already exists.
    """
    existing = await db.get(
        CostCenter, {"organizationId": body.organizationId, "costCenterId": body.costCenterId}
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cost centre '{body.costCenterId}' already exists for this organization.",
        )

    center = CostCenter(**body.model_dump())
    db.add(center)
    await db.flush()
    await db.refresh(center)

    return success(CostCenterResponse.model_validate(center))


@router.patch(
    "/cost-centers/{cost_center_id}",
    response_model=SuccessResponse[CostCenterResponse],
    summary="Update cost centre",
)
async def update_cost_center(
    cost_center_id: str,
    organization_id: str = Query(...),
    body: CostCenterUpdate = ...,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[CostCenterResponse]:
    """
    Partially update a cost centre.

    Raises:
        HTTPException 404: If cost centre not found.
    """
    center = await db.get(
        CostCenter, {"organizationId": organization_id, "costCenterId": cost_center_id}
    )
    if not center:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cost centre '{cost_center_id}' not found for this organization.",
        )

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(center, field, value)

    return success(CostCenterResponse.model_validate(center))
