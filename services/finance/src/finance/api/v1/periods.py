"""
Fiscal Periods API

Endpoints to create and manage fiscal periods.

Permissions:
- GET: accountant, finance_admin, auditor
- POST: finance_admin
- PATCH /close, /reopen: finance_admin
"""

import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.session import get_db
from ...middleware.auth import TokenPayload, require_roles
from ...models.orm.models import CompanyCode, FiscalPeriod, PeriodStatusEnum
from ...models.schemas.common import SuccessResponse
from ...models.schemas.period import FiscalPeriodCreate, FiscalPeriodResponse
from ...utils.responses import success

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Fiscal Periods"])

_READ_ROLES = ("accountant", "finance_admin", "auditor", "super_admin", "admin")
_WRITE_ROLES = ("finance_admin", "super_admin", "admin")


@router.get(
    "/periods",
    response_model=SuccessResponse[List[FiscalPeriodResponse]],
    summary="List fiscal periods",
)
async def list_periods(
    company_code: str = Query(..., description="Filter by company code"),
    fiscal_year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[List[FiscalPeriodResponse]]:
    """List fiscal periods for a company, optionally filtered by year."""
    query = select(FiscalPeriod).where(FiscalPeriod.companyCode == company_code)
    if fiscal_year is not None:
        query = query.where(FiscalPeriod.fiscalYear == fiscal_year)
    query = query.order_by(FiscalPeriod.fiscalYear, FiscalPeriod.periodNumber)

    result = await db.execute(query)
    periods = result.scalars().all()
    return success([FiscalPeriodResponse.model_validate(p) for p in periods])


@router.post(
    "/periods",
    response_model=SuccessResponse[FiscalPeriodResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create fiscal period",
)
async def create_period(
    body: FiscalPeriodCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[FiscalPeriodResponse]:
    """
    Create a new fiscal period.

    Raises:
        HTTPException 404: If companyCode not found.
        HTTPException 409: If the (companyCode, fiscalYear, periodNumber) already exists.
    """
    company = await db.get(CompanyCode, body.companyCode)
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company code '{body.companyCode}' not found.",
        )

    existing = await db.scalar(
        select(FiscalPeriod.periodId).where(
            FiscalPeriod.companyCode == body.companyCode,
            FiscalPeriod.fiscalYear == body.fiscalYear,
            FiscalPeriod.periodNumber == body.periodNumber,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Period {body.fiscalYear}/{body.periodNumber} already exists "
                f"for company '{body.companyCode}'."
            ),
        )

    period = FiscalPeriod(**body.model_dump())
    db.add(period)
    await db.flush()

    return success(FiscalPeriodResponse.model_validate(period))


@router.patch(
    "/periods/{period_id}/close",
    response_model=SuccessResponse[FiscalPeriodResponse],
    summary="Close a fiscal period",
)
async def close_period(
    period_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[FiscalPeriodResponse]:
    """
    Close a fiscal period.

    Raises:
        HTTPException 404: If period not found.
        HTTPException 409: If period is already closed or locked.
    """
    period = await db.get(FiscalPeriod, period_id)
    if not period:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Period '{period_id}' not found.",
        )
    if period.status != PeriodStatusEnum.OPEN:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Period is already {period.status.value} and cannot be closed again.",
        )

    period.status = PeriodStatusEnum.CLOSED
    period.closedAt = datetime.utcnow()
    period.closedByUserId = current_user.userId

    return success(
        FiscalPeriodResponse.model_validate(period),
        message="Period closed successfully.",
    )


@router.patch(
    "/periods/{period_id}/reopen",
    response_model=SuccessResponse[FiscalPeriodResponse],
    summary="Reopen a closed fiscal period",
)
async def reopen_period(
    period_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[FiscalPeriodResponse]:
    """
    Reopen a closed fiscal period.

    Locked periods cannot be reopened.

    Raises:
        HTTPException 404: If period not found.
        HTTPException 409: If period is open or locked.
    """
    period = await db.get(FiscalPeriod, period_id)
    if not period:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Period '{period_id}' not found.",
        )
    if period.status == PeriodStatusEnum.OPEN:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Period is already open.",
        )
    if period.status == PeriodStatusEnum.LOCKED:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Locked periods cannot be reopened.",
        )

    period.status = PeriodStatusEnum.OPEN
    period.closedAt = None
    period.closedByUserId = None

    return success(
        FiscalPeriodResponse.model_validate(period),
        message="Period reopened successfully.",
    )
