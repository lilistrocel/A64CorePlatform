"""
GL Accounts API

CRUD endpoints for the chart of accounts.

Permissions:
- GET: accountant, finance_admin, auditor
- POST/PATCH: finance_admin
- DELETE: finance_admin (409 if account has postings — placeholder for Week 3)
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.session import get_db
from ...middleware.auth import TokenPayload, require_roles
from ...models.orm.models import DrawerEnum, GLAccount
from ...models.schemas.account import (
    GLAccountCreate,
    GLAccountResponse,
    GLAccountUpdate,
)
from ...models.schemas.common import PaginatedResponse, SuccessResponse
from ...utils.responses import paginated, success

logger = logging.getLogger(__name__)
router = APIRouter(tags=["GL Accounts"])

_READ_ROLES = ("accountant", "finance_admin", "auditor", "super_admin", "admin")
_WRITE_ROLES = ("finance_admin", "super_admin", "admin")


@router.get(
    "/accounts",
    response_model=PaginatedResponse[GLAccountResponse],
    summary="List GL accounts",
)
async def list_accounts(
    organization_id: str = Query(..., description="Filter by organization"),
    drawer: Optional[DrawerEnum] = Query(None, description="Filter by drawer"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> PaginatedResponse[GLAccountResponse]:
    """
    List GL accounts with optional filtering and pagination.

    Args:
        organization_id: Required filter.
        drawer: Optional drawer filter.
        is_active: Optional active status filter.
        page: Page number (1-based).
        size: Items per page (max 500).
    """
    query = select(GLAccount).where(GLAccount.organizationId == organization_id)
    count_query = select(func.count()).where(GLAccount.organizationId == organization_id)

    if drawer is not None:
        query = query.where(GLAccount.drawer == drawer)
        count_query = count_query.where(GLAccount.drawer == drawer)
    if is_active is not None:
        query = query.where(GLAccount.isActive == is_active)
        count_query = count_query.where(GLAccount.isActive == is_active)

    total = await db.scalar(count_query) or 0
    offset = (page - 1) * size
    result = await db.execute(
        query.order_by(GLAccount.accountNumber).offset(offset).limit(size)
    )
    accounts = result.scalars().all()

    return paginated(
        items=[GLAccountResponse.model_validate(a) for a in accounts],
        total=total,
        page=page,
        size=size,
    )


@router.post(
    "/accounts",
    response_model=SuccessResponse[GLAccountResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create GL account",
)
async def create_account(
    body: GLAccountCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[GLAccountResponse]:
    """
    Create a new GL account.

    Raises:
        HTTPException 409: If accountNumber already exists for the organization.
        HTTPException 404: If parentAccountId is specified but not found.
    """
    # Check uniqueness
    existing = await db.scalar(
        select(GLAccount.accountId).where(
            GLAccount.organizationId == body.organizationId,
            GLAccount.accountNumber == body.accountNumber,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Account number '{body.accountNumber}' already exists "
                f"for organization '{body.organizationId}'."
            ),
        )

    # Validate parent exists if supplied
    if body.parentAccountId:
        parent = await db.get(GLAccount, body.parentAccountId)
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent account '{body.parentAccountId}' not found.",
            )

    account = GLAccount(**body.model_dump())
    db.add(account)
    await db.flush()

    return success(GLAccountResponse.model_validate(account))


@router.get(
    "/accounts/{account_id}",
    response_model=SuccessResponse[GLAccountResponse],
    summary="Get GL account",
)
async def get_account(
    account_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[GLAccountResponse]:
    """Retrieve a single GL account by UUID."""
    account = await db.get(GLAccount, account_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Account '{account_id}' not found.",
        )
    return success(GLAccountResponse.model_validate(account))


@router.patch(
    "/accounts/{account_id}",
    response_model=SuccessResponse[GLAccountResponse],
    summary="Update GL account",
)
async def update_account(
    account_id: str,
    body: GLAccountUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[GLAccountResponse]:
    """
    Partially update a GL account.

    Raises:
        HTTPException 404: If account not found.
        HTTPException 423: If account number is locked.
    """
    account = await db.get(GLAccount, account_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Account '{account_id}' not found.",
        )
    if account.isLockedNumber:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account number is locked and cannot be modified.",
        )

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(account, field, value)

    return success(GLAccountResponse.model_validate(account))


@router.delete(
    "/accounts/{account_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete GL account",
)
async def delete_account(
    account_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> None:
    """
    Delete a GL account.

    Returns 409 if the account has been posted to (placeholder —
    posting engine arrives in Week 3).

    Raises:
        HTTPException 404: If account not found.
    """
    account = await db.get(GLAccount, account_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Account '{account_id}' not found.",
        )
    # Reason: Week 3 will add actual posting check here.
    # For now, raise 409 if account is a control account to prevent accidental deletes.
    if account.isControlAccount:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a control account.",
        )

    await db.delete(account)
