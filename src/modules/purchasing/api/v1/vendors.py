"""
Purchasing Module — Vendors API

CRUD endpoints for the vendor master collection.

Permissions:
  - GET: any authenticated user
  - POST/PATCH/DELETE: procurement_officer, procurement_manager, admin, super_admin
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from ...middleware.auth import (
    CurrentUser,
    get_current_active_user,
    require_purchasing_write,
)
from ...models.vendor import VendorCreate, VendorResponse, VendorUpdate
from ...services.vendor_service import VendorService
from src.modules.farm_manager.utils.responses import (
    PaginatedResponse,
    PaginationMeta,
    SuccessResponse,
)
from src.modules.farm_manager.services.database import farm_db
from src.core.finance.company_resolver import resolve_company_code

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Purchasing — Vendors"])


def _extract_token(request: Request) -> Optional[str]:
    """Extract the raw Bearer token from the Authorization header."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


def _get_service() -> VendorService:
    """Dependency: return a VendorService bound to the farm_db connection."""
    return VendorService(farm_db.get_database())


@router.get(
    "/vendors",
    response_model=PaginatedResponse[VendorResponse],
    summary="List vendors",
    description="Paginated vendor list; search by name/code. All authenticated users.",
)
async def list_vendors(
    organization_id: Optional[str] = Query(
        None, description="Filter by organization ID"
    ),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=200),
    search: Optional[str] = Query(None, max_length=200),
    is_active: Optional[bool] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: VendorService = Depends(_get_service),
) -> PaginatedResponse[VendorResponse]:
    """
    List vendors for an organisation with pagination and optional search.

    Args:
        organization_id: Override org — defaults to current_user.organizationId.
        page: Page number (1-based).
        per_page: Items per page (max 200).
        search: Substring search on name and vendorCode.
        is_active: Filter by active status.
        current_user: Authenticated user.
        service: VendorService dependency.

    Returns:
        Paginated vendor list.
    """
    org_id = organization_id or current_user.organizationId
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="organization_id is required",
        )

    result = await service.list_vendors(
        org_id,
        page=page,
        per_page=per_page,
        search=search,
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
    "/vendors",
    response_model=SuccessResponse[VendorResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create vendor",
    description="Create a new vendor. Requires procurement_officer or higher.",
)
async def create_vendor(
    request: Request,
    body: VendorCreate,
    current_user: CurrentUser = Depends(get_current_active_user),
    service: VendorService = Depends(_get_service),
) -> SuccessResponse[VendorResponse]:
    """
    Create a new vendor.

    Args:
        request: FastAPI request (used to forward Bearer token to finance service).
        body: Validated vendor creation payload.
        current_user: Authenticated user (must have procurement write role).
        service: VendorService dependency.

    Returns:
        Created vendor wrapped in SuccessResponse.

    Raises:
        HTTPException 403: If insufficient role.
        HTTPException 409: If vendorCode already exists for the org.
    """
    require_purchasing_write(current_user)

    org_id = current_user.organizationId or ""
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="organization_id is required",
        )

    # Reason: resolve companyCode from finance service — no hardcoded default.
    company_code = await resolve_company_code(
        organization_id=org_id,
        auth_token=_extract_token(request),
    )

    try:
        vendor = await service.create_vendor(
            data=body,
            created_by=current_user.userId,
            company_code=company_code,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    return SuccessResponse(data=vendor, message="Vendor created successfully")


@router.get(
    "/vendors/{vendor_id}",
    response_model=SuccessResponse[VendorResponse],
    summary="Get vendor by ID",
    description="Retrieve a single vendor. All authenticated users.",
)
async def get_vendor(
    vendor_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: VendorService = Depends(_get_service),
) -> SuccessResponse[VendorResponse]:
    """
    Retrieve a vendor by its vendorId.

    Args:
        vendor_id: UUID string of the vendor.
        organization_id: Override org — defaults to current_user.organizationId.
        current_user: Authenticated user.
        service: VendorService dependency.

    Returns:
        Vendor data wrapped in SuccessResponse.

    Raises:
        HTTPException 404: If vendor not found.
    """
    org_id = organization_id or current_user.organizationId
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="organization_id is required",
        )

    vendor = await service.get_vendor(org_id, vendor_id)
    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vendor '{vendor_id}' not found",
        )

    return SuccessResponse(data=vendor)


@router.patch(
    "/vendors/{vendor_id}",
    response_model=SuccessResponse[VendorResponse],
    summary="Update vendor",
    description="Partial vendor update. Requires procurement_officer or higher.",
)
async def update_vendor(
    vendor_id: str,
    body: VendorUpdate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: VendorService = Depends(_get_service),
) -> SuccessResponse[VendorResponse]:
    """
    Partially update a vendor.

    Args:
        vendor_id: UUID string of the vendor to update.
        body: Partial update data (only supplied fields are changed).
        organization_id: Override org — defaults to current_user.organizationId.
        current_user: Authenticated user (must have procurement write role).
        service: VendorService dependency.

    Returns:
        Updated vendor wrapped in SuccessResponse.

    Raises:
        HTTPException 403: If insufficient role.
        HTTPException 404: If vendor not found.
    """
    require_purchasing_write(current_user)

    org_id = organization_id or current_user.organizationId
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="organization_id is required",
        )

    vendor = await service.update_vendor(
        organization_id=org_id,
        vendor_id=vendor_id,
        data=body,
        updated_by=current_user.userId,
    )
    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vendor '{vendor_id}' not found",
        )

    return SuccessResponse(data=vendor, message="Vendor updated successfully")


@router.delete(
    "/vendors/{vendor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft-delete vendor",
    description="Sets deletedAt and isActive=False. Requires procurement_officer or higher.",
)
async def delete_vendor(
    vendor_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: VendorService = Depends(_get_service),
) -> None:
    """
    Soft-delete a vendor.

    Args:
        vendor_id: UUID string of the vendor to delete.
        organization_id: Override org — defaults to current_user.organizationId.
        current_user: Authenticated user (must have procurement write role).
        service: VendorService dependency.

    Raises:
        HTTPException 403: If insufficient role.
        HTTPException 404: If vendor not found.
    """
    require_purchasing_write(current_user)

    org_id = organization_id or current_user.organizationId
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="organization_id is required",
        )

    deleted = await service.soft_delete_vendor(
        organization_id=org_id,
        vendor_id=vendor_id,
        deleted_by=current_user.userId,
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vendor '{vendor_id}' not found",
        )
