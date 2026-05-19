"""
Customer Finance Extension API

Upsert endpoint that adds/updates finance metadata for a customer
whose core record lives in MongoDB (main app).

Permissions:
- GET: accountant, finance_admin, auditor
- PUT (upsert): finance_admin, accountant
"""

import logging

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.session import get_db
from ...middleware.auth import TokenPayload, require_roles
from ...models.orm.models import CustomerFinanceExt
from ...models.schemas.common import SuccessResponse
from ...models.schemas.customer_ext import (
    CustomerFinanceExtResponse,
    CustomerFinanceExtUpsert,
)
from ...utils.responses import success

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Customer Finance Extension"])

_READ_ROLES = ("accountant", "finance_admin", "auditor", "super_admin", "admin")
_WRITE_ROLES = ("accountant", "finance_admin", "super_admin", "admin")


@router.get(
    "/customers/{customer_id}/finance-ext",
    response_model=SuccessResponse[CustomerFinanceExtResponse],
    summary="Get customer finance extension",
)
async def get_customer_ext(
    customer_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[CustomerFinanceExtResponse]:
    """
    Retrieve finance extension for a customer.

    Returns 404 if the customer has no finance extension yet.
    """
    from fastapi import HTTPException

    ext = await db.get(CustomerFinanceExt, customer_id)
    if not ext:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No finance extension found for customer '{customer_id}'.",
        )
    return success(CustomerFinanceExtResponse.model_validate(ext))


@router.put(
    "/customers/{customer_id}/finance-ext",
    response_model=SuccessResponse[CustomerFinanceExtResponse],
    status_code=status.HTTP_200_OK,
    summary="Upsert customer finance extension",
)
async def upsert_customer_ext(
    customer_id: str,
    body: CustomerFinanceExtUpsert,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[CustomerFinanceExtResponse]:
    """
    Create or update the finance extension for a customer.

    Idempotent — safe to call multiple times with the same payload.

    Args:
        customer_id: Must match the MongoDB customer document's customerId.
        body: Finance fields to set.

    Returns:
        Current state of the finance extension after upsert.
    """
    ext = await db.get(CustomerFinanceExt, customer_id)

    if ext is None:
        ext = CustomerFinanceExt(customerId=customer_id, **body.model_dump())
        db.add(ext)
        message = "Customer finance extension created."
    else:
        for field, value in body.model_dump().items():
            setattr(ext, field, value)
        message = "Customer finance extension updated."

    await db.flush()
    await db.refresh(ext)
    return success(CustomerFinanceExtResponse.model_validate(ext), message=message)
