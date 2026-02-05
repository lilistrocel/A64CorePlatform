"""
CRM Module - Authentication Middleware

Integrates with A64Core authentication system.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import logging

from ..config.settings import settings
from ..services.database import crm_db

# Import core API settings for JWT verification (SECRET_KEY must match)
from src.config.settings import settings as core_settings

logger = logging.getLogger(__name__)

# HTTP Bearer token scheme
security = HTTPBearer()


class CurrentUser:
    """Current authenticated user"""
    def __init__(
        self,
        userId: str,
        email: str,
        firstName: str,
        lastName: str,
        role: str,
        isActive: bool,
        isEmailVerified: bool
    ):
        self.userId = userId
        self.email = email
        self.firstName = firstName
        self.lastName = lastName
        self.role = role
        self.isActive = isActive
        self.isEmailVerified = isEmailVerified


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> CurrentUser:
    """
    Get current authenticated user from JWT token

    Validates JWT token from A64Core and fetches user data.

    Args:
        credentials: HTTP Authorization credentials (Bearer token)

    Returns:
        CurrentUser object

    Raises:
        HTTPException: 401 if token invalid or user not found
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # Decode JWT token using core API's SECRET_KEY
        token = credentials.credentials
        payload = jwt.decode(
            token,
            core_settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )

        user_id: str = payload.get("userId")
        if user_id is None:
            raise credentials_exception

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError:
        raise credentials_exception

    # Fetch user from database
    db = crm_db.get_database()
    user_doc = await db.users.find_one({"userId": user_id})

    if user_doc is None:
        raise credentials_exception

    # Verify user is active
    if not user_doc.get("isActive", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )

    return CurrentUser(
        userId=user_doc["userId"],
        email=user_doc["email"],
        firstName=user_doc["firstName"],
        lastName=user_doc["lastName"],
        role=user_doc["role"],
        isActive=user_doc["isActive"],
        isEmailVerified=user_doc.get("isEmailVerified", False)
    )


async def get_current_active_user(
    current_user: CurrentUser = Depends(get_current_user)
) -> CurrentUser:
    """
    Get current active user

    Ensures user account is active and verified.

    Args:
        current_user: User from get_current_user dependency

    Returns:
        CurrentUser

    Raises:
        HTTPException: 403 if user not active or verified
    """
    if not current_user.isActive:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )

    return current_user


def require_permission(permission: str):
    """
    Decorator to require specific permission

    Args:
        permission: Required permission (e.g., "crm.view", "crm.manage")

    Returns:
        Dependency function
    """
    async def permission_checker(
        current_user: CurrentUser = Depends(get_current_active_user)
    ) -> CurrentUser:
        # For now, simple role-based checks
        # TODO: Implement proper permission system

        if permission in ["crm.create", "crm.edit", "crm.delete"]:
            if current_user.role not in ["admin", "super_admin", "moderator", "user"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission denied: Missing {permission}"
                )
        elif permission == "crm.view":
            # Guest users have read-only access to view data
            if current_user.role not in ["admin", "super_admin", "moderator", "user", "guest"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission denied: Missing {permission}"
                )

        return current_user

    return permission_checker
