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


def require_role(allowed_roles: List[UserRole], current_user) -> None:
    """
    Check if user has one of the allowed roles

    Raises HTTPException if user doesn't have required role.
    Used in non-dependency contexts (e.g., inside route handlers).

    Args:
        allowed_roles: List of allowed roles
        current_user: User object (UserResponse) or dict from get_current_user

    Raises:
        HTTPException: 403 if user lacks required role
    """
    # Handle both dict and UserResponse/Pydantic model
    if isinstance(current_user, dict):
        user_role_str = current_user.get("role")
    else:
        # Pydantic model (UserResponse)
        user_role_str = current_user.role if hasattr(current_user, 'role') else None

    if not user_role_str:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User role not found"
        )

    # Handle if already a UserRole enum
    if isinstance(user_role_str, UserRole):
        user_role = user_role_str
    else:
        try:
            user_role = UserRole(user_role_str)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid user role"
            )

    if user_role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient permissions. Required roles: {[r.value for r in allowed_roles]}"
        )
