"""
Unit tests for the genetics permission mapping.

The original defect this guards against: ``manifest.json`` declared eight
``genetics.*`` permissions while every route was actually gated on
``farm.manage``. The manifest claimed a policy nothing enforced, and bench
staff (role ``user``) could read the repo but not record any work in it.

These tests pin three things:
  1. The manifest and the enforced mapping describe the same permission set —
     neither can grow a permission the other does not know about.
  2. The role tiers are what the lab agreed: bench staff record work, curation
     of the library itself is moderator-and-above, and ``guest`` cannot read.
  3. Unknown permission strings fail closed. The per-module helpers elsewhere
     are if/elif chains with no ``else``, so an unrecognised string authorises
     everyone; the genetics resolver must raise instead.

T-809 note: ``genetics.delete.cascade`` and ``genetics.maintenance`` are
deliberately *narrower* than every other permission in this module —
``super_admin`` only, not ``admin``. Test case 7 below (previously "admin and
super_admin can do everything declared") is split accordingly: super_admin
still holds everything; admin holds everything EXCEPT that pair. Widening
either of those two back to ``admin`` defeats the reason they exist — see
``middleware/auth.py``'s ``_SUPER_ADMIN_ONLY`` comment.

Test cases:
   1.  Manifest permissions == enforced permissions (both directions)
   2.  Every enforced permission maps to a non-empty role set
   3.  guest can do nothing at all, including read
   4.  Bench roles can record work
   5.  Bench roles cannot curate the library
   6.  Moderator can curate
   7.  super_admin holds every permission; admin holds every permission
       except the super_admin-only pair
   8.  Unknown permission raises 500 rather than authorising
   9.  Permission checker allows a permitted role
  10.  Permission checker rejects a forbidden role with 403
  11.  require_view is wired to genetics.view
"""

from __future__ import annotations

import json
import pathlib

import pytest
from fastapi import HTTPException

from src.modules.genetics.middleware import auth as genetics_auth
from src.modules.genetics.middleware.auth import (
    PERMISSION_ROLES,
    _resolve,
    require_permission,
)

# Resolved from the imported module rather than the working directory, so the
# test does not depend on where pytest was invoked from.
MANIFEST = (
    pathlib.Path(genetics_auth.__file__).resolve().parent.parent / "manifest.json"
)

BENCH_PERMISSIONS = {
    "genetics.create",
    "genetics.edit",
    "genetics.propagate",
    "genetics.observe",
    "genetics.media.manage",
}

CURATION_PERMISSIONS = {
    "genetics.line.manage",
    "genetics.promote",
    "genetics.delete",
}

# T-809 — strictly narrower than every other permission: super_admin only.
SUPER_ADMIN_ONLY_PERMISSIONS = {
    "genetics.delete.cascade",
    "genetics.maintenance",
}


def manifest_permissions() -> set[str]:
    return set(json.loads(MANIFEST.read_text())["permissions"])


# ---------------------------------------------------------------------------
# Manifest / enforcement agreement — the original bug
# ---------------------------------------------------------------------------

def test_manifest_and_enforced_permissions_match():
    """A permission declared but unenforced is exactly the bug this fixes."""
    declared = manifest_permissions()
    enforced = set(PERMISSION_ROLES)

    assert declared == enforced, (
        f"declared-but-unenforced: {sorted(declared - enforced)}; "
        f"enforced-but-undeclared: {sorted(enforced - declared)}"
    )


def test_every_permission_maps_to_a_non_empty_role_set():
    for permission, roles in PERMISSION_ROLES.items():
        assert roles, f"{permission} maps to no roles — nobody could ever use it"


# ---------------------------------------------------------------------------
# Role tiers
# ---------------------------------------------------------------------------

def test_guest_cannot_do_anything_including_read():
    """Lineage plus medium recipes is reproducible IP — staff only."""
    for permission, roles in PERMISSION_ROLES.items():
        assert "guest" not in roles, f"guest should not hold {permission}"


def test_bench_role_can_record_work():
    """The point of the fix: a technician can log what they did."""
    for permission in BENCH_PERMISSIONS | {"genetics.view"}:
        assert "user" in PERMISSION_ROLES[permission], permission


def test_bench_role_cannot_curate_the_library():
    for permission in CURATION_PERMISSIONS:
        assert "user" not in PERMISSION_ROLES[permission], permission


def test_moderator_can_curate():
    for permission in CURATION_PERMISSIONS:
        assert "moderator" in PERMISSION_ROLES[permission], permission


def test_super_admin_holds_every_permission():
    for permission, roles in PERMISSION_ROLES.items():
        assert "super_admin" in roles, f"super_admin should hold {permission}"


def test_admin_holds_every_permission_except_the_super_admin_only_pair():
    """T-809: cascade purge and the orphan sweep are deliberately out of
    reach for a plain admin — only super_admin. Every other permission in
    the namespace remains admin-accessible, unchanged."""
    for permission, roles in PERMISSION_ROLES.items():
        if permission in SUPER_ADMIN_ONLY_PERMISSIONS:
            assert "admin" not in roles, (
                f"{permission} must stay super_admin-only, not admin"
            )
        else:
            assert "admin" in roles, f"admin should hold {permission}"


# ---------------------------------------------------------------------------
# Fail-closed resolution
# ---------------------------------------------------------------------------

def test_unknown_permission_fails_closed():
    """Must raise, not silently authorise — the trap in the sibling modules."""
    with pytest.raises(HTTPException) as exc:
        _resolve("genetics.does_not_exist")
    assert exc.value.status_code == 500


def test_require_permission_rejects_unknown_string_at_definition_time():
    """A typo in a route should surface at boot, not on first request."""
    with pytest.raises(HTTPException):
        require_permission("genetics.typo")


# ---------------------------------------------------------------------------
# Checker behaviour
# ---------------------------------------------------------------------------

class _User:
    def __init__(self, role: str):
        self.role = role
        self.userId = "u-1"


@pytest.mark.asyncio
async def test_checker_allows_permitted_role():
    checker = require_permission("genetics.propagate")
    user = _User("user")
    assert await checker(current_user=user) is user


@pytest.mark.asyncio
async def test_checker_rejects_forbidden_role():
    checker = require_permission("genetics.promote")
    with pytest.raises(HTTPException) as exc:
        await checker(current_user=_User("user"))
    assert exc.value.status_code == 403
    assert "genetics.promote" in exc.value.detail


@pytest.mark.asyncio
async def test_checker_rejects_guest_on_read():
    from src.modules.genetics.middleware.auth import require_view

    with pytest.raises(HTTPException) as exc:
        await require_view(current_user=_User("guest"))
    assert exc.value.status_code == 403
