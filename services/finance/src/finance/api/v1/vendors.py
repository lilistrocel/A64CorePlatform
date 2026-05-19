"""
Vendors API

Paginated CRUD endpoints for vendor master data.

Permissions:
- GET: accountant, finance_admin, auditor
- POST/PATCH: finance_admin
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.session import get_db
from ...middleware.auth import TokenPayload, require_roles
from ...models.orm.models import Vendor
from ...models.schemas.common import PaginatedResponse, SuccessResponse
from ...models.schemas.vendor import VendorCreate, VendorResponse, VendorUpdate
from ...utils.responses import paginated, success

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Vendors"])

_READ_ROLES = ("accountant", "finance_admin", "auditor", "super_admin", "admin")
_WRITE_ROLES = ("finance_admin", "super_admin", "admin")


@router.get(
    "/vendors",
    response_model=PaginatedResponse[VendorResponse],
    summary="List vendors",
)
async def list_vendors(
    organization_id: str = Query(...),
    is_active: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> PaginatedResponse[VendorResponse]:
    """Return paginated vendors for an organization."""
    query = select(Vendor).where(Vendor.organizationId == organization_id)
    count_q = select(func.count()).where(Vendor.organizationId == organization_id)

    if is_active is not None:
        query = query.where(Vendor.isActive == is_active)
        count_q = count_q.where(Vendor.isActive == is_active)

    total = await db.scalar(count_q) or 0
    offset = (page - 1) * size
    result = await db.execute(
        query.order_by(Vendor.vendorCode).offset(offset).limit(size)
    )
    vendors = result.scalars().all()

    return paginated(
        items=[VendorResponse.model_validate(v) for v in vendors],
        total=total,
        page=page,
        size=size,
    )


@router.post(
    "/vendors",
    response_model=SuccessResponse[VendorResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create vendor",
)
async def create_vendor(
    body: VendorCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[VendorResponse]:
    """
    Create a vendor.

    Raises:
        HTTPException 409: If vendorCode already exists for the organization.
    """
    existing = await db.scalar(
        select(Vendor.vendorId).where(
            Vendor.organizationId == body.organizationId,
            Vendor.vendorCode == body.vendorCode,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Vendor code '{body.vendorCode}' already exists.",
        )

    vendor = Vendor(**body.model_dump())
    db.add(vendor)
    await db.flush()

    return success(VendorResponse.model_validate(vendor))


@router.get(
    "/vendors/{vendor_id}",
    response_model=SuccessResponse[VendorResponse],
    summary="Get vendor",
)
async def get_vendor(
    vendor_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_READ_ROLES)),
) -> SuccessResponse[VendorResponse]:
    """Retrieve a vendor by UUID."""
    vendor = await db.get(Vendor, vendor_id)
    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vendor '{vendor_id}' not found.",
        )
    return success(VendorResponse.model_validate(vendor))


@router.patch(
    "/vendors/{vendor_id}",
    response_model=SuccessResponse[VendorResponse],
    summary="Update vendor",
)
async def update_vendor(
    vendor_id: str,
    body: VendorUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenPayload = Depends(require_roles(*_WRITE_ROLES)),
) -> SuccessResponse[VendorResponse]:
    """
    Partially update a vendor.

    Raises:
        HTTPException 404: If vendor not found.
    """
    vendor = await db.get(Vendor, vendor_id)
    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vendor '{vendor_id}' not found.",
        )

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(vendor, field, value)

    return success(VendorResponse.model_validate(vendor))
