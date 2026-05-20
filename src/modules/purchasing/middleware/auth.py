"""
Purchasing Module — Authentication Middleware

Re-exports auth dependencies from the farm_manager middleware
so purchasing router code uses the same JWT verification and
role-checking patterns as the rest of the main app.

Purchasing-specific role constants are defined here to keep
the router files clean.
"""

# Re-export the farm_manager auth helpers (they share the same JWT/DB)
from src.modules.farm_manager.middleware.auth import (  # noqa: F401
    CurrentUser,
    get_current_active_user,
    get_current_user,
    require_permission,
)

# Roles allowed to write vendor / purchase item master data
PROCUREMENT_WRITE_ROLES = frozenset({
    "procurement_officer",
    "procurement_manager",
    "admin",
    "super_admin",
})

# Roles allowed to read any purchasing endpoint
PROCUREMENT_READ_ROLES = frozenset({
    "procurement_officer",
    "procurement_manager",
    "admin",
    "super_admin",
    "moderator",
    "user",
    "accountant",
    "finance_admin",
    "auditor",
})

# Roles allowed to manage payment_terms (admin-only write)
PAYMENT_TERMS_WRITE_ROLES = frozenset({
    "admin",
    "super_admin",
    "finance_admin",
})


def require_purchasing_write(current_user: "CurrentUser") -> None:
    """
    Raise HTTPException 403 if the user does not have procurement write access.

    Args:
        current_user: Authenticated user object from JWT.

    Raises:
        HTTPException: 403 if role not in PROCUREMENT_WRITE_ROLES.
    """
    from fastapi import HTTPException, status

    if current_user.role not in PROCUREMENT_WRITE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: procurement_officer or higher role required",
        )


def require_payment_terms_write(current_user: "CurrentUser") -> None:
    """
    Raise HTTPException 403 if the user does not have payment_terms write access.

    Args:
        current_user: Authenticated user object from JWT.

    Raises:
        HTTPException: 403 if role not in PAYMENT_TERMS_WRITE_ROLES.
    """
    from fastapi import HTTPException, status

    if current_user.role not in PAYMENT_TERMS_WRITE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: admin or finance_admin role required",
        )
