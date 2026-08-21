"""
Farm Management Module - Authentication Middleware

Integrates with A64Core authentication system.

This module is also the identity provider several other modules re-export
from (genetics, protocols, purchasing, mushroom_manager, attachments) — see
each of those modules' own ``middleware/auth.py`` for the pattern. Only
``farm.*``/``agronomist``/``admin``/``admin.manage`` are resolved here;
``genetics.*`` and ``protocols.*`` own their own permission-to-role mappings
in their own modules.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Dict, FrozenSet, Optional
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
        organizationId: Optional[str] = None,
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
    credentials: HTTPAuthorizationCredentials = Depends(security),
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
            token, core_settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
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
            status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive"
        )

    return CurrentUser(
        userId=user_doc["userId"],
        email=user_doc["email"],
        firstName=user_doc["firstName"],
        lastName=user_doc["lastName"],
        role=user_doc["role"],
        isActive=user_doc["isActive"],
        isEmailVerified=user_doc.get("isEmailVerified", False),
        organizationId=user_doc.get("organizationId"),
    )


async def get_current_active_user(
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """
    Get current active user

    Ensures the user account is active. Does NOT check ``isEmailVerified`` —
    despite this docstring previously claiming otherwise, no verification
    check has ever been enforced here (T-927 audit, 2026-08-21). Correcting
    the claim rather than starting to enforce verification, since that would
    be a behaviour change nobody asked for.

    Args:
        current_user: User from get_current_user dependency

    Returns:
        CurrentUser

    Raises:
        HTTPException: 403 if user not active
    """
    if not current_user.isActive:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive"
        )

    return current_user


async def require_farm_access(
    farm_id: UUID, current_user: CurrentUser = Depends(get_current_active_user)
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
    assignment = await db.farm_assignments.find_one(
        {"userId": current_user.userId, "farmId": str(farm_id), "isActive": True}
    )

    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Not assigned to this farm",
        )

    return current_user


# --- Role tiers -------------------------------------------------------------

_ADMIN: FrozenSet[str] = frozenset({"admin", "super_admin"})
_MANAGE: FrozenSet[str] = _ADMIN | {"moderator"}
_OPERATE: FrozenSet[str] = _MANAGE | {"user"}


# --- Permission -> allowed roles --------------------------------------------
#
# T-927: this used to be a bare if/elif chain with no ``else`` — any string
# not equal to one of these four fell through and returned the caller
# unchecked, authorising every authenticated active user. Fixed to a
# fail-closed dict lookup, matching the pattern genetics/protocols already
# use (see those modules' ``middleware/auth.py``).
#
# Role sets below are UNCHANGED from the old if/elif chain — this is a
# structural fix only, not a policy change.
PERMISSION_ROLES: Dict[str, FrozenSet[str]] = {
    "farm.manage": _MANAGE,
    "farm.operate": _OPERATE,
    "agronomist": _MANAGE,
    "admin": _ADMIN,
    # T-927: registered because it is already in live use (three weather
    # cache-admin endpoints, src/modules/farm_manager/api/v1/weather.py)
    # despite never having been an explicit branch in the old chain — it was
    # one of the strings silently falling through to "authorise everyone."
    "admin.manage": _ADMIN,
}


def _resolve(permission: str) -> FrozenSet[str]:
    """Look up the roles allowed to exercise a permission.

    Fails closed: an unregistered permission string denies rather than
    authorising every caller. Before T-927 this module's ``require_permission``
    was an if/elif chain with no ``else`` — any unrecognised string fell
    through and returned the caller unchecked. That was not merely latent:
    ``admin.manage`` was in live use by three weather-cache-admin endpoints
    and was never one of the four branches, so those endpoints were reachable
    by any authenticated active user until this fix.

    Args:
        permission: One of the keys in :data:`PERMISSION_ROLES`.

    Returns:
        The frozenset of roles allowed to exercise this permission.

    Raises:
        HTTPException: 500 when the permission string is not registered.
    """
    roles = PERMISSION_ROLES.get(permission)
    if roles is None:
        logger.error(
            "[Farm Manager Module] Unknown permission '%s' — denying. "
            "Add it to PERMISSION_ROLES.",
            permission,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authorization misconfigured for this endpoint",
        )
    return roles


def require_permission(permission: str):
    """
    FastAPI dependency enforcing a farm_manager permission.

    Args:
        permission: One of the keys in :data:`PERMISSION_ROLES` (e.g.
            "farm.manage", "farm.operate").

    Returns:
        A dependency yielding the :class:`CurrentUser` when authorised.

    Raises:
        HTTPException: 403 when the user's role is not permitted, 500 when
        the permission string is not registered.
    """
    # Resolve once at import/route-definition time so a bad string surfaces
    # when the app boots rather than on the first request to that route.
    allowed = _resolve(permission)

    async def permission_checker(
        current_user: CurrentUser = Depends(get_current_active_user),
    ) -> CurrentUser:
        if current_user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission} requires one of "
                f"{sorted(allowed)}",
            )
        return current_user

    return permission_checker
