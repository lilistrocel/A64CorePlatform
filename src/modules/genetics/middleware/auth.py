"""
Genetics Repo Module - Authorization Middleware

Each module in this codebase owns the permission namespace it declares —
``sales.*`` is resolved in the sales middleware, ``farm.*`` in farm_manager's.
The genetics module previously borrowed farm_manager's ``require_permission``,
which meant the eight ``genetics.*`` permissions in its manifest were declared
but never enforced, and every write route was gated on ``farm.manage``
(admin/moderator only) — locking bench staff out of recording their own work.

**Identity is deliberately reused, authorization is owned here.** JWT decoding
and the user lookup come from farm_manager's middleware: forking that would
mean any future auth fix has to be applied in N places. Only the
permission-to-role mapping lives in this module.

Two tiers, per the lab's own split:

* **Bench** (``user`` and above) — recording what happened: registering
  material, propagating, splitting, observing, preparing media.
* **Curation** (``moderator`` and above) — defining the library itself:
  creating, editing or deactivating a genetic line, and promoting a trait
  into a new one.

Read access excludes ``guest``. Lineage plus medium recipes together are a
reproducible description of the lab's genetics, which is a different class of
data from the sales figures a guest is normally shown.
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

# T-809 — strictly narrower than _ADMIN: cascade-delete and org-wide
# maintenance sweeps must not be reachable by a plain `admin`, only
# `super_admin`. Matches the precedent set by
# `PATCH /organizations/{id}/modules` (src/api/v1/organizations.py,
# `_require_super_admin`), which reserves tenant-wide destructive/
# irreversible operations for the single strictest role in the system.
_SUPER_ADMIN_ONLY: FrozenSet[str] = frozenset({"super_admin"})


# --- Permission → allowed roles --------------------------------------------
#
# Every string declared in manifest.json must appear here. The mapping is the
# single source of truth; anything missing is a hard failure at request time
# rather than a silent allow (see _resolve below).

PERMISSION_ROLES: Dict[str, FrozenSet[str]] = {
    # Read. Staff only — guest is deliberately excluded.
    "genetics.view": _BENCH,

    # Bench work — recording what happened at the bench.
    "genetics.create": _BENCH,          # register founding material
    "genetics.edit": _BENCH,            # update / split an accession
    "genetics.propagate": _BENCH,       # clone or cross
    "genetics.observe": _BENCH,         # record an observation
    "genetics.media.manage": _BENCH,    # recipes and prepared batches

    # Curation — defining the library rather than recording activity.
    "genetics.line.manage": _CURATION,  # create / edit a genetic line
    "genetics.promote": _CURATION,      # promote a trait into a new line
    "genetics.delete": _CURATION,       # deactivate a line / zero-dependent purge

    # T-809 — one tier above curation. `genetics.delete` alone is only ever
    # enough to deactivate a line or hard-delete one with zero dependents
    # (LineService.purge_line's own gate refuses otherwise) — it was never
    # enough, by itself, to destroy referenced material. Cascade purge and
    # the org-wide orphan sweep both do exactly that, deliberately, so they
    # sit at the strictest tier in the namespace rather than piggybacking on
    # `genetics.delete`.
    "genetics.delete.cascade": _SUPER_ADMIN_ONLY,  # purge?cascade=true
    "genetics.maintenance": _SUPER_ADMIN_ONLY,     # orphan sweep (GET is genetics.delete, DELETE is this)
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
            "[Genetics Module] Unknown permission '%s' — denying. "
            "Add it to PERMISSION_ROLES and manifest.json.",
            permission,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authorization misconfigured for this endpoint",
        )
    return roles


def require_permission(permission: str):
    """FastAPI dependency enforcing a ``genetics.*`` permission.

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
require_view = require_permission("genetics.view")


def require_super_admin_for(permission: str, current_user: CurrentUser) -> None:
    """Enforce a stricter tier from inside a route body rather than via `Depends`.

    `DELETE /lines/{id}/purge` is one route serving two operations gated at
    two different tiers, selected by the `cascade` query parameter: the
    plain zero-dependents purge (`genetics.delete`, curation tier) and the
    cascade purge (`genetics.delete.cascade`, super_admin only). FastAPI's
    `Depends()` resolves once per request before the query parameters are
    available to make that branch, so it cannot itself vary the required
    permission by `cascade`'s value — this is called explicitly inside the
    handler instead, only on the `cascade=true` path. Raises the same 403
    shape `require_permission`'s dependency would.

    Args:
        permission: One of the keys in :data:`PERMISSION_ROLES`.
        current_user: The already-authenticated caller.

    Raises:
        HTTPException: 403 when the user's role is not permitted, 500 when
        the permission string is not registered.
    """
    allowed = _resolve(permission)
    if current_user.role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission denied: {permission} requires one of "
                   f"{sorted(allowed)}",
        )
