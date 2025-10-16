"""
Role-Based Authorization Middleware

Permission checks based on user roles
Following User-Structure.md permissions matrix
"""

from fastapi import Depends, HTTPException, status
from typing import List

from ..models.user import UserRole, UserResponse
from .auth import get_current_active_user


class RoleChecker:
    """
    Dependency class for role-based authorization

    Checks if user has required role(s)
    """

    def __init__(self, allowed_roles: List[UserRole]):
        """
        Initialize role checker

        Args:
            allowed_roles: List of roles allowed to access the endpoint
        """
        self.allowed_roles = allowed_roles

    async def __call__(
        self,
        current_user: UserResponse = Depends(get_current_active_user)
    ) -> UserResponse:
        """
        Check if user has required role

        Args:
            current_user: Current authenticated user

        Returns:
            UserResponse if authorized

        Raises:
            HTTPException: 403 if user lacks required role
        """
        if current_user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required roles: {[r.value for r in self.allowed_roles]}"
            )

        return current_user


# Pre-defined role checkers for common use cases

def require_super_admin(
    current_user: UserResponse = Depends(get_current_active_user)
) -> UserResponse:
    """
    Require Super Admin role

    Usage:
        @app.get("/admin/system")
        async def system_config(user: UserResponse = Depends(require_super_admin)):
            ...
    """
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin access required"
        )
    return current_user


def require_admin(
    current_user: UserResponse = Depends(get_current_active_user)
) -> UserResponse:
    """
    Require Admin or Super Admin role

    Usage:
        @app.get("/admin/users")
        async def manage_users(user: UserResponse = Depends(require_admin)):
            ...
    """
    if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


def require_moderator(
    current_user: UserResponse = Depends(get_current_active_user)
) -> UserResponse:
    """
    Require Moderator, Admin, or Super Admin role

    Usage:
        @app.post("/content/moderate")
        async def moderate_content(user: UserResponse = Depends(require_moderator)):
            ...
    """
    if current_user.role not in [
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
        UserRole.MODERATOR
    ]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Moderator access required"
        )
    return current_user


def can_manage_user(
    target_user_id: str,
    current_user: UserResponse
) -> bool:
    """
    Check if current user can manage target user

    Rules (User-Structure.md):
    - Super Admin: Can manage all users
    - Admin: Can manage users in their org (TBD: org implementation)
    - Users: Can only manage themselves

    Args:
        target_user_id: ID of user being managed
        current_user: Current authenticated user

    Returns:
        True if current user can manage target user
    """
    # Super Admin can manage anyone
    if current_user.role == UserRole.SUPER_ADMIN:
        return True

    # Admin can manage users (org-scoped in future)
    if current_user.role == UserRole.ADMIN:
        return True  # TODO: Add org-level check

    # Users can only manage themselves
    return current_user.userId == target_user_id


def can_change_role(
    current_user: UserResponse,
    target_role: UserRole
) -> bool:
    """
    Check if current user can assign target role

    Rules (User-Structure.md):
    - Super Admin: Can assign any role
    - Admin: Can assign moderator, user, guest (not admin or super_admin)
    - Others: Cannot assign roles

    Args:
        current_user: Current authenticated user
        target_role: Role being assigned

    Returns:
        True if current user can assign target role
    """
    # Super Admin can assign any role
    if current_user.role == UserRole.SUPER_ADMIN:
        return True

    # Admin can assign limited roles
    if current_user.role == UserRole.ADMIN:
        allowed_roles = [UserRole.MODERATOR, UserRole.USER, UserRole.GUEST]
        return target_role in allowed_roles

    # Others cannot assign roles
    return False
