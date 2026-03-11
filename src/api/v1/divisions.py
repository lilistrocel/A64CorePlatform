"""
Divisions API Endpoints

Provides endpoints for users to list their accessible divisions,
switch their active division, and for admins to manage division details.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List

from ...models.division import DivisionResponse, DivisionSelectRequest, DivisionSelectResponse, DivisionUpdate
from ...models.user import UserResponse, UserRole
from ...middleware.auth import get_current_user
from ...services.division_service import division_service

router = APIRouter(prefix="/divisions", tags=["Divisions"])


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


@router.get(
    "/my-divisions",
    response_model=List[DivisionResponse],
    status_code=status.HTTP_200_OK,
    summary="Get current user's accessible divisions",
    description="Returns all divisions the authenticated user can access.",
)
async def get_my_divisions(
    current_user: UserResponse = Depends(get_current_user),
) -> List[DivisionResponse]:
    """
    Retrieve all divisions accessible to the current user.

    **Authentication:** Required (Bearer token)

    **Returns:**
    - 200: List of divisions available to the user

    **Note:** Currently returns all active divisions scoped to the user's
    organization (if set). Full ACL-based filtering is planned for a future phase.
    """
    return await division_service.list_divisions_for_user(current_user.userId)


@router.post(
    "/{division_id}/select",
    response_model=DivisionSelectResponse,
    status_code=status.HTTP_200_OK,
    summary="Set active division",
    description=(
        "Switch the authenticated user's active division. "
        "Updates user.defaultDivisionId so subsequent requests "
        "are context-switched to this division."
    ),
)
async def select_division(
    division_id: str,
    current_user: UserResponse = Depends(get_current_user),
) -> DivisionSelectResponse:
    """
    Select the active division for the current user.

    **Authentication:** Required (Bearer token)

    **Path Parameters:**
    - division_id: UUID of the division to activate

    **Returns:**
    - 200: Confirmation with division name and industry type
    - 404: Division not found or inactive
    """
    return await division_service.select_division(current_user.userId, division_id)


@router.get(
    "/{division_id}",
    response_model=DivisionResponse,
    status_code=status.HTTP_200_OK,
    summary="Get division details",
    description="Retrieve details for a specific division by ID.",
)
async def get_division(
    division_id: str,
    current_user: UserResponse = Depends(get_current_user),
) -> DivisionResponse:
    """
    Get division by ID.

    **Authentication:** Required (Bearer token)

    **Path Parameters:**
    - division_id: UUID of the division

    **Returns:**
    - 200: Division details
    - 404: Division not found
    """
    division = await division_service.get_division(division_id)
    if not division:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Division '{division_id}' not found.",
        )
    return division


@router.patch(
    "/{division_id}",
    response_model=DivisionResponse,
    status_code=status.HTTP_200_OK,
    summary="Update division",
    description="Partially update a division. Admin only.",
)
async def update_division(
    division_id: str,
    data: DivisionUpdate,
    current_user: UserResponse = Depends(get_current_user),
) -> DivisionResponse:
    """
    Partially update a division.

    **Authentication:** Required (Bearer token)
    **Authorization:** ADMIN or SUPER_ADMIN role required

    **Path Parameters:**
    - division_id: UUID of the division

    **Request Body (all optional):**
    - name, divisionCode, description, settings, isActive

    **Returns:**
    - 200: Updated division
    - 403: Insufficient permissions
    - 404: Division not found
    - 409: Division code conflict within organization
    """
    _require_admin(current_user)
    return await division_service.update_division(division_id, data)
