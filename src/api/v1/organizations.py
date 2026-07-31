"""
Organizations API Endpoints

Provides CRUD operations for organizations and the ability to manage
divisions within an organization. Admin-only write operations.
"""

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from ...core.cache.redis_cache import get_redis_cache
from ...middleware.auth import get_current_user
from ...models.division import DivisionCreate, DivisionResponse
from ...models.organization import (
    OrganizationCreate,
    OrganizationModulesUpdate,
    OrganizationResponse,
    OrganizationUpdate,
)
from ...models.user import UserResponse, UserRole
from ...modules.finance_bridge.tenant_flag import invalidate_tenant_flag_cache
from ...services.database import mongodb
from ...services.division_service import division_service
from ...services.organization_service import organization_service

router = APIRouter(prefix="/organizations", tags=["Organizations"])


def _require_admin(current_user: UserResponse) -> None:
    """
    Raise HTTP 403 if the user does not hold an admin-level role.

    Args:
        current_user: Authenticated user from the JWT dependency.

    Raises:
        HTTPException 403: When the user lacks the required role.
    """
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )


def _require_super_admin(current_user: UserResponse) -> None:
    """
    Raise HTTP 403 unless the user holds the super_admin role.

    Used for organization create/update — super_admin is the sole gatekeeper
    for tenant-level operations. Regular admins operate inside an existing
    organization but cannot create new ones.
    """
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required for this operation.",
        )


@router.post(
    "/",
    response_model=OrganizationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create organization",
    description="Create a new top-level organization. Super admin only.",
)
async def create_organization(
    data: OrganizationCreate,
    current_user: UserResponse = Depends(get_current_user),
) -> OrganizationResponse:
    """
    Create a new organization.

    **Authentication:** Required (Bearer token)
    **Authorization:** SUPER_ADMIN role required

    **Request Body:**
    - name: Organization display name
    - slug: Unique URL-friendly identifier
    - industries: List of industry type strings
    - logoUrl: Optional logo image URL

    **Returns:**
    - 201: Created organization
    - 403: Insufficient permissions
    - 409: Slug already in use
    """
    _require_super_admin(current_user)
    return await organization_service.create_organization(data)


@router.get(
    "/",
    response_model=List[OrganizationResponse],
    status_code=status.HTTP_200_OK,
    summary="List organizations",
    description="List all active organizations.",
)
async def list_organizations(
    skip: int = 0,
    limit: int = 50,
    current_user: UserResponse = Depends(get_current_user),
) -> List[OrganizationResponse]:
    """
    List all active organizations with pagination.

    **Authentication:** Required (Bearer token)

    **Query Parameters:**
    - skip: Offset for pagination (default 0)
    - limit: Maximum results to return (default 50)

    **Returns:**
    - 200: List of organizations
    """
    return await organization_service.list_organizations(skip=skip, limit=limit)


@router.get(
    "/{organization_id}",
    response_model=OrganizationResponse,
    status_code=status.HTTP_200_OK,
    summary="Get organization",
    description="Retrieve a single organization by ID.",
)
async def get_organization(
    organization_id: str,
    current_user: UserResponse = Depends(get_current_user),
) -> OrganizationResponse:
    """
    Get organization by ID.

    **Authentication:** Required (Bearer token)

    **Path Parameters:**
    - organization_id: UUID of the organization

    **Returns:**
    - 200: Organization details
    - 404: Organization not found
    """
    org = await organization_service.get_organization(organization_id)
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Organization '{organization_id}' not found.",
        )
    return org


@router.patch(
    "/{organization_id}",
    response_model=OrganizationResponse,
    status_code=status.HTTP_200_OK,
    summary="Update organization",
    description="Partially update an organization. Admin only.",
)
async def update_organization(
    organization_id: str,
    data: OrganizationUpdate,
    current_user: UserResponse = Depends(get_current_user),
) -> OrganizationResponse:
    """
    Partially update an organization.

    **Authentication:** Required (Bearer token)
    **Authorization:** ADMIN or SUPER_ADMIN role required

    **Path Parameters:**
    - organization_id: UUID of the organization

    **Request Body (all optional):**
    - name, slug, industries, logoUrl, isActive

    **Returns:**
    - 200: Updated organization
    - 403: Insufficient permissions
    - 404: Organization not found
    - 409: Slug conflict
    """
    _require_admin(current_user)
    return await organization_service.update_organization(organization_id, data)


@router.patch(
    "/{organization_id}/modules",
    response_model=OrganizationResponse,
    status_code=status.HTTP_200_OK,
    summary="Update tenant module toggles",
    description=(
        "Wave 0 (T-059.4) — toggle the per-tenant module flags. Supports "
        "`financeEnabled` and `publicInfoPage` (T-804 follow-up — the "
        "master switch and per-field privacy flags for the public genetics "
        "label-info page). Super admin only. Writes an audit log entry "
        "and invalidates the Redis cache so the outbox writer + "
        "capability endpoint pick up the change within ms."
    ),
)
async def update_organization_modules(
    organization_id: str,
    data: OrganizationModulesUpdate,
    current_user: UserResponse = Depends(get_current_user),
) -> OrganizationResponse:
    """
    PATCH /api/v1/organizations/{org_id}/modules

    **Authorization:** SUPER_ADMIN role required.

    Toggling `financeEnabled=false` immediately hides finance UI for all
    users in this tenant on their next page load (capability endpoint is
    cached 60s but the cache is invalidated on this write).

    Toggling `publicInfoPage.enabled=false` immediately 404s the public
    genetics label-info page (`GET /api/v1/public/genetics/i/{token}`) for
    anonymous callers on this tenant's accessions; authenticated callers
    are unaffected by design (T-806 part 3 — `enabled` is a public-exposure
    switch, not an access-control gate). `publicInfoPage` is a **partial**
    update — only the fields sent are changed, so `{"enabled": false}`
    alone does not reset `showOperatorName` or the other privacy flags.

    **Audit log:** entry written to `admin_audit_log` with the before/
    after values of the *entire* `modules` object (so the diff — exactly
    which flags changed and from what — is reconstructable later), plus
    the raw patch, the actor's userId/email/role, and timestamp.
    """
    _require_super_admin(current_user)

    # Reason: load current value for the audit trail before mutating.
    before = await organization_service.get_organization(organization_id)
    if before is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Organization '{organization_id}' not found.",
        )

    updated = await organization_service.update_modules(
        organization_id=organization_id,
        financeEnabled=data.financeEnabled,
        publicInfoPage=data.publicInfoPage,
    )

    # Audit log
    db = mongodb.get_database()
    audit_entry = {
        "action": "organization.modules.updated",
        "targetOrganizationId": organization_id,
        "performedBy": current_user.userId,
        "performedByEmail": current_user.email,
        "performedByRole": (
            current_user.role.value
            if hasattr(current_user.role, "value")
            else current_user.role
        ),
        "timestamp": datetime.now(tz=timezone.utc),
        "details": {
            "before": before.modules.model_dump(),
            "after": updated.modules.model_dump(),
            "patch": data.model_dump(exclude_none=True),
        },
    }
    await db.admin_audit_log.insert_one(audit_entry)

    # Reason: invalidate the per-tenant cache so subsequent outbox writes
    # and capability lookups see the new value without waiting for TTL.
    redis_cache = await get_redis_cache()
    redis_client = redis_cache._redis if redis_cache.is_available else None
    await invalidate_tenant_flag_cache(redis_client, organization_id)

    return updated


@router.get(
    "/{organization_id}/divisions",
    response_model=List[DivisionResponse],
    status_code=status.HTTP_200_OK,
    summary="List divisions for organization",
    description="List all active divisions belonging to the specified organization.",
)
async def list_divisions_for_organization(
    organization_id: str,
    skip: int = 0,
    limit: int = 50,
    current_user: UserResponse = Depends(get_current_user),
) -> List[DivisionResponse]:
    """
    List divisions within an organization.

    **Authentication:** Required (Bearer token)

    **Path Parameters:**
    - organization_id: UUID of the parent organization

    **Query Parameters:**
    - skip: Offset for pagination (default 0)
    - limit: Maximum results to return (default 50)

    **Returns:**
    - 200: List of divisions
    - 404: Organization not found
    """
    # Reason: verify the organization exists before listing its divisions
    org = await organization_service.get_organization(organization_id)
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Organization '{organization_id}' not found.",
        )

    return await division_service.list_divisions(
        organization_id=organization_id, skip=skip, limit=limit
    )


@router.post(
    "/{organization_id}/divisions",
    response_model=DivisionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create division in organization",
    description="Create a new division within the specified organization. Admin only.",
)
async def create_division_in_organization(
    organization_id: str,
    data: DivisionCreate,
    current_user: UserResponse = Depends(get_current_user),
) -> DivisionResponse:
    """
    Create a division inside an organization.

    **Authentication:** Required (Bearer token)
    **Authorization:** ADMIN or SUPER_ADMIN role required

    **Path Parameters:**
    - organization_id: UUID of the parent organization

    **Request Body:**
    - name: Division display name
    - divisionCode: Short unique code (e.g., VEG-01)
    - industryType: One of the IndustryType enum values
    - description: Optional description
    - settings: Optional key-value settings dict

    **Returns:**
    - 201: Created division
    - 403: Insufficient permissions
    - 404: Organization not found
    - 409: Division code already exists in organization

    **Note:** organizationId in the request body must match the path parameter.
    """
    _require_admin(current_user)

    # Reason: ensure body organizationId is consistent with the URL path
    if data.organizationId != organization_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "organizationId in request body must match the organization_id path parameter."
            ),
        )

    return await division_service.create_division(data)
