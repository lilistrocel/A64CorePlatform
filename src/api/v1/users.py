"""
User Management API Endpoints

Handles user CRUD operations with role-based access control
Following User-Structure.md permissions matrix
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from typing import Optional, Dict, Any

from ...models.user import UserResponse, UserUpdate, UserRole
from ...services.user_service import user_service
from ...middleware.auth import get_current_user
from ...middleware.permissions import (
    require_admin,
    can_manage_user,
    can_change_role
)

router = APIRouter()


@router.get("", response_model=Dict[str, Any])
async def list_users(
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, alias="perPage", description="Items per page (max 100)"),
    role: Optional[UserRole] = Query(None, description="Filter by role"),
    search: Optional[str] = Query(None, max_length=500, description="Search by email, first name, or last name"),
    current_user: UserResponse = Depends(require_admin)
) -> Dict[str, Any]:
    """
    List all users with pagination

    **Authentication:** Required - Admin or Super Admin only

    **Query Parameters:**
    - page: Page number (default: 1)
    - perPage: Items per page (default: 20, max: 100)
    - role: Optional role filter (super_admin, admin, moderator, user, guest)
    - search: Optional search by email, first name, or last name (partial match)

    **Returns:**
    - 200: Paginated list of users
    - 401: Not authenticated
    - 403: Insufficient permissions (not admin)

    **Response:**
    ```json
    {
      "data": [...],
      "meta": {
        "total": 100,
        "page": 1,
        "perPage": 20,
        "totalPages": 5
      },
      "links": {
        "first": "...",
        "last": "...",
        "prev": null,
        "next": "..."
      }
    }
    ```
    """
    skip = (page - 1) * per_page

    result = await user_service.list_users(
        skip=skip,
        limit=per_page,
        role=role,
        search=search
    )

    return result


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    current_user: UserResponse = Depends(get_current_user)
) -> UserResponse:
    """
    Get user by ID

    **Authentication:** Required

    **Permissions:**
    - Super Admin: Can view any user
    - Admin: Can view any user (org-scoped in future)
    - Moderator: Limited access
    - User: Can only view themselves

    **Path Parameters:**
    - user_id: User's UUID

    **Returns:**
    - 200: User information
    - 401: Not authenticated
    - 403: Insufficient permissions
    - 404: User not found
    """
    # Check if user can view this profile
    if not can_manage_user(user_id, current_user) and current_user.userId != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to view this user"
        )

    user = await user_service.get_user_by_id(user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return user


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    update_data: UserUpdate,
    current_user: UserResponse = Depends(get_current_user)
) -> UserResponse:
    """
    Update user information

    **Authentication:** Required

    **Permissions:**
    - Super Admin: Can update any user
    - Admin: Can update users in their org
    - User: Can only update themselves

    **Path Parameters:**
    - user_id: User's UUID

    **Request Body:**
    - firstName: Optional first name
    - lastName: Optional last name
    - phone: Optional phone number
    - avatar: Optional avatar URL
    - timezone: Optional timezone
    - locale: Optional language code

    **Returns:**
    - 200: Updated user information
    - 401: Not authenticated
    - 403: Insufficient permissions
    - 404: User not found
    """
    # Check if user can update this profile
    if not can_manage_user(user_id, current_user) and current_user.userId != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to update this user"
        )

    updated_user = await user_service.update_user(user_id, update_data)
    return updated_user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    current_user: UserResponse = Depends(get_current_user)
) -> None:
    """
    Delete user (soft delete)

    **Authentication:** Required

    **Permissions:**
    - Super Admin: Can delete any user
    - Admin: Can delete users in their org
    - User: Can delete themselves

    **Path Parameters:**
    - user_id: User's UUID

    **Returns:**
    - 204: User deleted successfully
    - 401: Not authenticated
    - 403: Insufficient permissions
    - 404: User not found

    **Note:** Implements soft delete - user data retained for 90 days
    """
    # Check if user can delete this profile
    if not can_manage_user(user_id, current_user) and current_user.userId != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to delete this user"
        )

    await user_service.delete_user(user_id)


@router.patch("/{user_id}/role", response_model=UserResponse)
async def change_user_role(
    user_id: str,
    role: UserRole = Body(..., embed=True),
    current_user: UserResponse = Depends(require_admin)
) -> UserResponse:
    """
    Change user's role

    **Authentication:** Required - Admin or Super Admin only

    **Permissions:**
    - Super Admin: Can assign any role
    - Admin: Can assign moderator, user, guest (not admin or super_admin)

    **Path Parameters:**
    - user_id: User's UUID

    **Request Body:**
    ```json
    {
      "role": "moderator"
    }
    ```

    **Returns:**
    - 200: Updated user with new role
    - 401: Not authenticated
    - 403: Insufficient permissions
    - 404: User not found
    """
    # Check if current user can assign this role
    if not can_change_role(current_user, role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient permissions to assign role: {role.value}"
        )

    updated_user = await user_service.change_user_role(user_id, role)
    return updated_user


@router.post("/{user_id}/activate", response_model=UserResponse)
async def activate_user(
    user_id: str,
    current_user: UserResponse = Depends(require_admin)
) -> UserResponse:
    """
    Activate user account

    **Authentication:** Required - Admin or Super Admin only

    **Path Parameters:**
    - user_id: User's UUID

    **Returns:**
    - 200: Activated user
    - 401: Not authenticated
    - 403: Insufficient permissions
    - 404: User not found
    """
    user = await user_service.activate_user(user_id)
    return user


@router.post("/{user_id}/deactivate", response_model=UserResponse)
async def deactivate_user(
    user_id: str,
    current_user: UserResponse = Depends(require_admin)
) -> UserResponse:
    """
    Deactivate user account (suspend)

    **Authentication:** Required - Admin or Super Admin only

    **Path Parameters:**
    - user_id: User's UUID

    **Returns:**
    - 200: Deactivated user
    - 401: Not authenticated
    - 403: Insufficient permissions
    - 404: User not found

    **Note:** Deactivated users cannot login but data is preserved
    All refresh tokens are revoked
    """
    user = await user_service.deactivate_user(user_id)
    return user
