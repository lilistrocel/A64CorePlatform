"""
Purchasing Module — Payment Terms API

CRUD endpoints for the payment_terms master collection.

Permissions:
  - GET: any authenticated user
  - POST/PATCH/DELETE: admin, super_admin, finance_admin (admin-only)
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ...middleware.auth import (
    CurrentUser,
    get_current_active_user,
    require_payment_terms_write,
)
from ...models.payment_terms import (
    PaymentTermsCreate,
    PaymentTermsResponse,
    PaymentTermsUpdate,
)
from ...services.payment_terms_service import PaymentTermsService
from src.modules.farm_manager.utils.responses import SuccessResponse
from src.modules.farm_manager.services.database import farm_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Purchasing — Payment Terms"])


def _get_service() -> PaymentTermsService:
    """Dependency: return a PaymentTermsService bound to the farm_db connection."""
    return PaymentTermsService(farm_db.get_database())


@router.get(
    "/payment-terms",
    response_model=SuccessResponse[List[PaymentTermsResponse]],
    summary="List payment terms",
    description="Return all payment terms for the org. Seeded on first access.",
)
async def list_payment_terms(
    organization_id: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: PaymentTermsService = Depends(_get_service),
) -> SuccessResponse[List[PaymentTermsResponse]]:
    """
    Return all payment terms for an organisation.

    Seeds default terms (NET15 through EOM30) on first access.

    Args:
        organization_id: Override org — defaults to current_user.organizationId.
        is_active: Filter by active status if supplied.
        current_user: Authenticated user.
        service: PaymentTermsService dependency.

    Returns:
        List of payment terms wrapped in SuccessResponse.
    """
    org_id = organization_id or current_user.organizationId
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="organization_id is required",
        )

    # Seed defaults for this org if none exist yet
    await service.ensure_seeded(org_id, current_user.userId)

    terms = await service.list_terms(org_id, is_active=is_active)
    return SuccessResponse(data=terms)


@router.post(
    "/payment-terms",
    response_model=SuccessResponse[PaymentTermsResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create payment terms",
    description="Create custom payment terms. Admin / finance_admin only.",
)
async def create_payment_terms(
    body: PaymentTermsCreate,
    current_user: CurrentUser = Depends(get_current_active_user),
    service: PaymentTermsService = Depends(_get_service),
) -> SuccessResponse[PaymentTermsResponse]:
    """
    Create a new payment terms record.

    Args:
        body: Validated payment terms creation payload.
        current_user: Authenticated user (must have admin role).
        service: PaymentTermsService dependency.

    Returns:
        Created payment terms wrapped in SuccessResponse.

    Raises:
        HTTPException 403: If insufficient role.
        HTTPException 409: If termsCode already exists for the org.
    """
    require_payment_terms_write(current_user)

    try:
        terms = await service.create_terms(
            data=body,
            created_by=current_user.userId,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    return SuccessResponse(data=terms, message="Payment terms created successfully")


@router.patch(
    "/payment-terms/{terms_id}",
    response_model=SuccessResponse[PaymentTermsResponse],
    summary="Update payment terms",
    description="Partial update. Admin / finance_admin only.",
)
async def update_payment_terms(
    terms_id: str,
    body: PaymentTermsUpdate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: PaymentTermsService = Depends(_get_service),
) -> SuccessResponse[PaymentTermsResponse]:
    """
    Partially update a payment terms record.

    Args:
        terms_id: UUID string of the terms to update.
        body: Partial update data.
        organization_id: Override org — defaults to current_user.organizationId.
        current_user: Authenticated user (must have admin role).
        service: PaymentTermsService dependency.

    Returns:
        Updated terms wrapped in SuccessResponse.

    Raises:
        HTTPException 403: If insufficient role.
        HTTPException 404: If terms not found.
    """
    require_payment_terms_write(current_user)

    org_id = organization_id or current_user.organizationId
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="organization_id is required",
        )

    terms = await service.update_terms(
        organization_id=org_id,
        terms_id=terms_id,
        data=body,
        updated_by=current_user.userId,
    )
    if not terms:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Payment terms '{terms_id}' not found",
        )

    return SuccessResponse(data=terms, message="Payment terms updated successfully")


@router.delete(
    "/payment-terms/{terms_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft-delete payment terms",
    description="Sets isActive=False. Admin / finance_admin only.",
)
async def delete_payment_terms(
    terms_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: PaymentTermsService = Depends(_get_service),
) -> None:
    """
    Soft-delete a payment terms record.

    Args:
        terms_id: UUID string of the terms to delete.
        organization_id: Override org — defaults to current_user.organizationId.
        current_user: Authenticated user (must have admin role).
        service: PaymentTermsService dependency.

    Raises:
        HTTPException 403: If insufficient role.
        HTTPException 404: If terms not found.
    """
    require_payment_terms_write(current_user)

    org_id = organization_id or current_user.organizationId
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="organization_id is required",
        )

    deleted = await service.soft_delete_terms(
        organization_id=org_id,
        terms_id=terms_id,
        deleted_by=current_user.userId,
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Payment terms '{terms_id}' not found",
        )
