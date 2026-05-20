"""
Purchasing Module — Purchase Items API

CRUD endpoints for the purchase item master collection.

Permissions:
  - GET: any authenticated user
  - POST/PATCH/DELETE: procurement_officer, procurement_manager, admin, super_admin
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ...middleware.auth import (
    CurrentUser,
    get_current_active_user,
    require_purchasing_write,
)
from ...models.purchase_item import PurchaseItemCreate, PurchaseItemResponse, PurchaseItemUpdate
from ...services.purchase_item_service import PurchaseItemService
from src.modules.farm_manager.utils.responses import PaginatedResponse, PaginationMeta, SuccessResponse
from src.modules.farm_manager.services.database import farm_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Purchasing — Purchase Items"])


def _get_service() -> PurchaseItemService:
    """Dependency: return a PurchaseItemService bound to the farm_db connection."""
    return PurchaseItemService(farm_db.get_database())


@router.get(
    "/purchase-items",
    response_model=PaginatedResponse[PurchaseItemResponse],
    summary="List purchase items",
    description="Paginated purchase item list with optional type filter and search.",
)
async def list_purchase_items(
    organization_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=200),
    search: Optional[str] = Query(None, max_length=200),
    item_type: Optional[str] = Query(None, description="Filter by itemType"),
    is_active: Optional[bool] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: PurchaseItemService = Depends(_get_service),
) -> PaginatedResponse[PurchaseItemResponse]:
    """
    List purchase items for an organisation with pagination and optional search.

    Args:
        organization_id: Override org — defaults to current_user.organizationId.
        page: Page number (1-based).
        per_page: Items per page (max 200).
        search: Substring search on name and itemCode.
        item_type: Filter by itemType value.
        is_active: Filter by active status.
        current_user: Authenticated user.
        service: PurchaseItemService dependency.

    Returns:
        Paginated purchase item list.
    """
    org_id = organization_id or current_user.organizationId
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="organization_id is required",
        )

    result = await service.list_items(
        org_id,
        page=page,
        per_page=per_page,
        search=search,
        item_type=item_type,
        is_active=is_active,
    )

    return PaginatedResponse(
        data=result["items"],
        meta=PaginationMeta(
            total=result["total"],
            page=result["page"],
            perPage=result["perPage"],
            totalPages=result["totalPages"],
        ),
    )


@router.post(
    "/purchase-items",
    response_model=SuccessResponse[PurchaseItemResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create purchase item",
    description="Create a new purchase item. Requires procurement_officer or higher.",
)
async def create_purchase_item(
    body: PurchaseItemCreate,
    current_user: CurrentUser = Depends(get_current_active_user),
    service: PurchaseItemService = Depends(_get_service),
) -> SuccessResponse[PurchaseItemResponse]:
    """
    Create a new purchase item.

    Args:
        body: Validated purchase item creation payload.
        current_user: Authenticated user (must have procurement write role).
        service: PurchaseItemService dependency.

    Returns:
        Created purchase item wrapped in SuccessResponse.

    Raises:
        HTTPException 403: If insufficient role.
        HTTPException 409: If itemCode already exists for the org.
    """
    require_purchasing_write(current_user)

    try:
        item = await service.create_item(
            data=body,
            created_by=current_user.userId,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    return SuccessResponse(data=item, message="Purchase item created successfully")


@router.get(
    "/purchase-items/{item_id}",
    response_model=SuccessResponse[PurchaseItemResponse],
    summary="Get purchase item by ID",
)
async def get_purchase_item(
    item_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: PurchaseItemService = Depends(_get_service),
) -> SuccessResponse[PurchaseItemResponse]:
    """
    Retrieve a purchase item by its itemId.

    Args:
        item_id: UUID string of the purchase item.
        organization_id: Override org — defaults to current_user.organizationId.
        current_user: Authenticated user.
        service: PurchaseItemService dependency.

    Returns:
        Purchase item data wrapped in SuccessResponse.

    Raises:
        HTTPException 404: If item not found.
    """
    org_id = organization_id or current_user.organizationId
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="organization_id is required",
        )

    item = await service.get_item(org_id, item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Purchase item '{item_id}' not found",
        )

    return SuccessResponse(data=item)


@router.patch(
    "/purchase-items/{item_id}",
    response_model=SuccessResponse[PurchaseItemResponse],
    summary="Update purchase item",
    description="Partial update. Requires procurement_officer or higher.",
)
async def update_purchase_item(
    item_id: str,
    body: PurchaseItemUpdate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: PurchaseItemService = Depends(_get_service),
) -> SuccessResponse[PurchaseItemResponse]:
    """
    Partially update a purchase item.

    Args:
        item_id: UUID string of the item to update.
        body: Partial update data.
        organization_id: Override org — defaults to current_user.organizationId.
        current_user: Authenticated user (must have procurement write role).
        service: PurchaseItemService dependency.

    Returns:
        Updated item wrapped in SuccessResponse.

    Raises:
        HTTPException 403: If insufficient role.
        HTTPException 404: If item not found.
    """
    require_purchasing_write(current_user)

    org_id = organization_id or current_user.organizationId
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="organization_id is required",
        )

    item = await service.update_item(
        organization_id=org_id,
        item_id=item_id,
        data=body,
        updated_by=current_user.userId,
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Purchase item '{item_id}' not found",
        )

    return SuccessResponse(data=item, message="Purchase item updated successfully")


@router.delete(
    "/purchase-items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft-delete purchase item",
    description="Sets deletedAt and isActive=False. Requires procurement_officer or higher.",
)
async def delete_purchase_item(
    item_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: PurchaseItemService = Depends(_get_service),
) -> None:
    """
    Soft-delete a purchase item.

    Args:
        item_id: UUID string of the item to delete.
        organization_id: Override org — defaults to current_user.organizationId.
        current_user: Authenticated user (must have procurement write role).
        service: PurchaseItemService dependency.

    Raises:
        HTTPException 403: If insufficient role.
        HTTPException 404: If item not found.
    """
    require_purchasing_write(current_user)

    org_id = organization_id or current_user.organizationId
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="organization_id is required",
        )

    deleted = await service.soft_delete_item(
        organization_id=org_id,
        item_id=item_id,
        deleted_by=current_user.userId,
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Purchase item '{item_id}' not found",
        )
