"""
Finance Module - Authentication Middleware

Integrates with A64Core authentication system.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import logging

from ..config.settings import settings
from ..services.database import finance_db

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
    Get current authenticated user from JWT token.

    Validates JWT token from A64Core and fetches user data.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
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

    # Fetch user from the shared database
    db = finance_db.get_database()
    user_doc = await db.users.find_one({"userId": user_id})

    if user_doc is None:
        raise credentials_exception

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
    """Get current active user."""
    if not current_user.isActive:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    return current_user


def require_permission(permission: str):
    """
    Require a specific permission.

    finance.view is granted to all authenticated roles.
    finance.manage is restricted to admin/super_admin.
    """
    async def permission_checker(
        current_user: CurrentUser = Depends(get_current_active_user)
    ) -> CurrentUser:
        if permission == "finance.view":
            # All authenticated roles can view finance data
            if current_user.role not in ["admin", "super_admin", "moderator", "user", "guest"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission denied: Missing {permission}"
                )
        elif permission == "finance.manage":
            if current_user.role not in ["admin", "super_admin"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission denied: Missing {permission}"
                )

        return current_user

    return permission_checker
