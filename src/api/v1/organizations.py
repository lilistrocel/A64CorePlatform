"""
Organizations API Endpoints

Provides CRUD operations for organizations and the ability to manage
divisions within an organization. Admin-only write operations.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List

from ...models.organization import OrganizationCreate, OrganizationResponse, OrganizationUpdate
from ...models.division import DivisionCreate, DivisionResponse
from ...models.user import UserResponse, UserRole
from ...middleware.auth import get_current_user
from ...services.organization_service import organization_service
from ...services.division_service import division_service

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


@router.post(
    "/",
    response_model=OrganizationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create organization",
    description="Create a new top-level organization. Admin only.",
)
async def create_organization(
    data: OrganizationCreate,
    current_user: UserResponse = Depends(get_current_user),
) -> OrganizationResponse:
    """
    Create a new organization.

    **Authentication:** Required (Bearer token)
    **Authorization:** ADMIN or SUPER_ADMIN role required

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
    _require_admin(current_user)
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
