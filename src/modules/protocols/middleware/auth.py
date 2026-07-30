"""
Protocols Module - Authorization Middleware

Each module in this codebase owns the permission namespace it declares —
``sales.*`` is resolved in the sales middleware, ``farm.*`` in farm_manager's,
``genetics.*`` in the genetics module. This module owns ``protocols.*``.

**Identity is deliberately reused, authorization is owned here.** JWT decoding
and the user lookup come from farm_manager's middleware: forking that would
mean any future auth fix has to be applied in N places. Only the
permission-to-role mapping lives in this module.

Three tiers:

* **Read** (``user`` and above) — anyone doing the work must be able to read
  the procedure. Restricting this would defeat the purpose.
* **Author** (``moderator`` and above) — writing and editing procedures.
* **Approve** (``admin`` and above) — signing a version off. Deliberately the
  narrowest permission: approval is what makes a procedure usable at the bench,
  so it does not sit with whoever drafted it.

Read excludes ``guest``, consistent with genetics — procedures describe how the
lab reproduces its material.
"""

import logging
from typing import Dict, FrozenSet

from fastapi import Depends, HTTPException, status

# Identity only — see module docstring. These are re-exported so genetics
# routes never need to import from farm_manager directly.
from src.modules.farm_manager.middleware.auth import (  # noqa: F401
    CurrentUser,
    get_current_active_user,
    get_current_user,
    security,
)

logger = logging.getLogger(__name__)


# --- Role tiers -------------------------------------------------------------

_ADMIN: FrozenSet[str] = frozenset({"admin", "super_admin"})
_CURATION: FrozenSet[str] = _ADMIN | {"moderator"}
_BENCH: FrozenSet[str] = _CURATION | {"user"}


# --- Permission → allowed roles --------------------------------------------
#
# Every string declared in manifest.json must appear here. The mapping is the
# single source of truth; anything missing is a hard failure at request time
# rather than a silent allow (see _resolve below).

PERMISSION_ROLES: Dict[str, FrozenSet[str]] = {
    # Read. Everyone who does the work needs to read the procedure — that is
    # the entire point of writing it down.
    "protocols.view": _BENCH,

    # Authoring. Writing and editing procedures is a curation act: an SOP is a
    # statement about how the lab operates, not a record of one shift's work.
    "protocols.author": _CURATION,

    # Approval is deliberately the narrowest permission. Signing off a
    # procedure is what makes it usable at the bench, so it sits with admins
    # rather than with whoever happened to draft it.
    "protocols.approve": _ADMIN,

    "protocols.retire": _CURATION,
}


def _resolve(permission: str) -> FrozenSet[str]:
    """Look up the roles allowed to exercise a permission.

    Fails closed. The per-module ``require_permission`` helpers elsewhere in
    this codebase are if/elif chains with no ``else``, so an unrecognised
    permission string falls through and authorises everyone. That is latent
    rather than active today — each module happens to handle all of its own
    strings — but it means a typo in a new route would silently open it up.
    Here, an unknown permission raises instead.
    """
    roles = PERMISSION_ROLES.get(permission)
    if roles is None:
        logger.error(
            "[Protocols Module] Unknown permission '%s' — denying. "
            "Add it to PERMISSION_ROLES and manifest.json.",
            permission,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authorization misconfigured for this endpoint",
        )
    return roles


def require_permission(permission: str):
    """FastAPI dependency enforcing a ``protocols.*`` permission.

    Args:
        permission: One of the keys in :data:`PERMISSION_ROLES`.

    Returns:
        A dependency yielding the :class:`CurrentUser` when authorised.

    Raises:
        HTTPException: 403 when the user's role is not permitted, 500 when the
        permission string is not registered.
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


# Read access is a permission like any other — genetics data is staff-only, so
# routes must not fall back to bare `get_current_active_user`, which would
# admit `guest`.
require_view = require_permission("protocols.view")
