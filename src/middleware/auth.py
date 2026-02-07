"""
Authentication Middleware

JWT token validation and user authentication
Following User-Structure.md authentication flows
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional

from ..models.user import TokenPayload, UserRole, UserResponse
from ..utils.security import verify_access_token
from ..services.database import mongodb

# HTTP Bearer token scheme
security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> UserResponse:
    """
    Get current authenticated user from JWT token

    Args:
        credentials: HTTP Authorization credentials (Bearer token)

    Returns:
        UserResponse object

    Raises:
        HTTPException: 401 if token invalid or user not found

    Flow (User-Structure.md):
    1. Extract token from Authorization header
    2. Validate JWT token
    3. Fetch user from database
    4. Verify user is active
    5. Return user object
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Validate token
    token_data = verify_access_token(credentials.credentials)

    if token_data is None:
        raise credentials_exception

    # Fetch user from database
    db = mongodb.get_database()
    user_doc = await db.users.find_one({"userId": token_data.userId})

    if user_doc is None:
        raise credentials_exception

    # Verify user is active
    if not user_doc.get("isActive", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )

    # Convert to UserResponse model
    user = UserResponse(
        userId=user_doc["userId"],
        email=user_doc["email"],
        firstName=user_doc["firstName"],
        lastName=user_doc["lastName"],
        role=UserRole(user_doc["role"]),
        isActive=user_doc["isActive"],
        isEmailVerified=user_doc["isEmailVerified"],
        mfaEnabled=user_doc.get("mfaEnabled", False),
        mfaSetupRequired=user_doc.get("mfaSetupRequired", False),
        phone=user_doc.get("phone"),
        avatar=user_doc.get("avatar"),
        timezone=user_doc.get("timezone"),
        locale=user_doc.get("locale"),
        lastLoginAt=user_doc.get("lastLoginAt"),
        createdAt=user_doc["createdAt"],
        updatedAt=user_doc["updatedAt"]
    )

    return user


async def get_current_active_user(
    current_user: UserResponse = Depends(get_current_user)
) -> UserResponse:
    """
    Get current active user

    Ensures user account is active and verified

    Args:
        current_user: User from get_current_user dependency

    Returns:
        UserResponse object

    Raises:
        HTTPException: 403 if user inactive
    """
    if not current_user.isActive:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    return current_user


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))
) -> Optional[UserResponse]:
    """
    Get current user if authenticated, None otherwise

    Useful for endpoints that work for both authenticated and guest users

    Args:
        credentials: Optional HTTP Authorization credentials

    Returns:
        UserResponse if authenticated, None if not
    """
    if credentials is None:
        return None

    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None


async def require_mfa_setup_complete(
    current_user: UserResponse = Depends(get_current_user)
) -> UserResponse:
    """
    Require MFA setup to be complete before accessing protected resources.

    This dependency blocks access to endpoints if the user has mfaSetupRequired=True.
    Use this for all protected endpoints except:
    - MFA setup endpoints (/api/v1/auth/mfa/setup, /api/v1/auth/mfa/enable)
    - Logout endpoint (/api/v1/auth/logout)
    - User profile check (/api/v1/users/me)

    Args:
        current_user: User from get_current_user dependency

    Returns:
        UserResponse if MFA setup is complete

    Raises:
        HTTPException: 403 if MFA setup is required but not complete
    """
    if current_user.mfaSetupRequired and not current_user.mfaEnabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="MFA setup required. Please set up multi-factor authentication before accessing this resource.",
            headers={"X-MFA-Setup-Required": "true"}
        )

    return current_user


async def get_user_mfa_complete(
    current_user: UserResponse = Depends(get_current_active_user)
) -> UserResponse:
    """
    Get current active user with MFA setup enforced.

    Combines get_current_active_user and require_mfa_setup_complete.
    Use this as the default dependency for most protected endpoints.

    Args:
        current_user: User from get_current_active_user dependency

    Returns:
        UserResponse if user is active and MFA setup is complete

    Raises:
        HTTPException: 403 if user inactive or MFA setup required
    """
    if current_user.mfaSetupRequired and not current_user.mfaEnabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="MFA setup required. Please set up multi-factor authentication before accessing this resource.",
            headers={"X-MFA-Setup-Required": "true"}
        )

    return current_user
