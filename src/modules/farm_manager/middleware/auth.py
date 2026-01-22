"""
Farm Management Module - Authentication Middleware

Integrates with A64Core authentication system.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from uuid import UUID
from jose import jwt, JWTError
import logging

from ..config.settings import settings
from ..services.database import farm_db

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
        isEmailVerified: bool,
        organizationId: Optional[str] = None
    ):
        self.userId = userId
        self.email = email
        self.firstName = firstName
        self.lastName = lastName
        self.role = role
        self.isActive = isActive
        self.isEmailVerified = isEmailVerified
        self.organizationId = organizationId


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
    db = farm_db.get_database()
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
        isEmailVerified=user_doc.get("isEmailVerified", False),
        organizationId=user_doc.get("organizationId")
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


async def require_farm_access(
    farm_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
) -> CurrentUser:
    """
    Require user to have access to a specific farm

    Checks if user is assigned to the farm.
    Admins have access to all farms.

    Args:
        farm_id: Farm ID to check access for
        current_user: Current authenticated user

    Returns:
        CurrentUser

    Raises:
        HTTPException: 403 if user doesn't have access
    """
    # Admins have access to all farms
    if current_user.role in ["super_admin", "admin"]:
        return current_user

    # Check farm assignment
    db = farm_db.get_database()
    assignment = await db.farm_assignments.find_one({
        "userId": current_user.userId,
        "farmId": str(farm_id),
        "isActive": True
    })

    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Not assigned to this farm"
        )

    return current_user


def require_permission(permission: str):
    """
    Decorator to require specific permission

    Args:
        permission: Required permission (e.g., "farm.manage", "farm.operate")

    Returns:
        Dependency function
    """
    async def permission_checker(
        current_user: CurrentUser = Depends(get_current_active_user)
    ) -> CurrentUser:
        # For now, simple role-based checks
        # TODO: Implement proper permission system

        if permission == "farm.manage":
            if current_user.role not in ["admin", "super_admin", "moderator"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission denied: Missing {permission}"
                )
        elif permission == "farm.operate":
            if current_user.role not in ["admin", "super_admin", "moderator", "user"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission denied: Missing {permission}"
                )
        elif permission == "agronomist":
            if current_user.role not in ["admin", "super_admin", "moderator"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Permission denied: Agronomist role required"
                )

        return current_user

    return permission_checker
