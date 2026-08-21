"""
Unit tests for farm_manager's ``require_permission`` (T-927, SECURITY).

The original defect: ``require_permission`` resolved via a bare ``if/elif``
chain over exactly four strings ("farm.manage", "farm.operate", "agronomist",
"admin") with no ``else``. Any other permission string fell through the
whole chain and returned ``current_user`` unchecked — authorising every
authenticated active user regardless of role.

This was not merely theoretical: ``require_permission("admin.manage")``
guards three admin-only weather-cache endpoints in
``src/modules/farm_manager/api/v1/weather.py`` (``get_cache_stats``,
``trigger_cache_refresh``, ``invalidate_farm_cache``) — none of which were
ever one of the four handled branches, so all three were reachable by any
authenticated active user (e.g. a plain "user") in production.

The fix converts the if/elif chain to a fail-closed ``PERMISSION_ROLES``
dict lookup (matching the pattern already used by
``src.modules.genetics.middleware.auth`` and
``src.modules.protocols.middleware.auth``), and registers "admin.manage".

Test cases:
    1.  Each of the four pre-existing permissions admits EXACTLY its
        original role set (no widening/narrowing from the if/elif chain).
    2.  "admin.manage" is registered and admits admin/super_admin, denies
        "user" (the specific regression this task calls out as most
        important).
    3.  An unregistered permission string denies (fails closed) — this is
        the regression test that matters most: it is what the old code
        got backwards.
    4.  require_permission() itself raises immediately for an unknown
        string, at dependency-construction time (import/route-definition
        time), not on first request.
    5.  The three weather.py admin endpoints are wired to
        require_permission("admin.manage") and authorise an admin caller.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from src.modules.farm_manager.middleware import auth as farm_auth
from src.modules.farm_manager.middleware.auth import (
    PERMISSION_ROLES,
    _resolve,
    require_permission,
)


class _User:
    """Minimal stand-in for CurrentUser — only .role is read by the checker."""

    def __init__(self, role: str):
        self.role = role
        self.userId = "u-1"


# ---------------------------------------------------------------------------
# 1. Exact role-set preservation for the four pre-existing permissions
# ---------------------------------------------------------------------------

EXPECTED_ROLE_SETS = {
    "farm.manage": {"admin", "super_admin", "moderator"},
    "farm.operate": {"admin", "super_admin", "moderator", "user"},
    "agronomist": {"admin", "super_admin", "moderator"},
    "admin": {"admin", "super_admin"},
}


@pytest.mark.parametrize("permission,expected_roles", EXPECTED_ROLE_SETS.items())
def test_preexisting_permission_admits_exactly_the_original_roles(
    permission, expected_roles
):
    assert set(PERMISSION_ROLES[permission]) == expected_roles


@pytest.mark.parametrize("permission,expected_roles", EXPECTED_ROLE_SETS.items())
@pytest.mark.asyncio
async def test_preexisting_permission_checker_admits_only_expected_roles(
    permission, expected_roles
):
    checker = require_permission(permission)
    all_roles = {
        "super_admin",
        "admin",
        "moderator",
        "user",
        "guest",
        "procurement_officer",
    }
    for role in all_roles:
        user = _User(role)
        if role in expected_roles:
            assert (
                await checker(current_user=user) is user
            ), f"{permission} should admit {role}"
        else:
            with pytest.raises(HTTPException) as exc:
                await checker(current_user=user)
            assert exc.value.status_code == 403, f"{permission} should deny {role}"


# ---------------------------------------------------------------------------
# 2. admin.manage — the live bypass this task exists to close
# ---------------------------------------------------------------------------


def test_admin_manage_is_registered():
    assert "admin.manage" in PERMISSION_ROLES


def test_admin_manage_admits_admin_and_super_admin():
    assert set(PERMISSION_ROLES["admin.manage"]) == {"admin", "super_admin"}


@pytest.mark.asyncio
async def test_admin_manage_checker_admits_admin():
    checker = require_permission("admin.manage")
    user = _User("admin")
    assert await checker(current_user=user) is user


@pytest.mark.asyncio
async def test_admin_manage_checker_admits_super_admin():
    checker = require_permission("admin.manage")
    user = _User("super_admin")
    assert await checker(current_user=user) is user


@pytest.mark.asyncio
async def test_admin_manage_checker_denies_plain_user():
    """This is exactly the live bypass: before the fix, ANY authenticated
    active user (including a plain "user") could call the three weather
    cache-admin endpoints, because "admin.manage" fell through the old
    if/elif chain unchecked."""
    checker = require_permission("admin.manage")
    with pytest.raises(HTTPException) as exc:
        await checker(current_user=_User("user"))
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_admin_manage_checker_denies_moderator():
    checker = require_permission("admin.manage")
    with pytest.raises(HTTPException) as exc:
        await checker(current_user=_User("moderator"))
    assert exc.value.status_code == 403


# ---------------------------------------------------------------------------
# 3. Fail-closed on an unregistered permission string (the regression test
#    that matters most — this is what the old if/elif chain got backwards)
# ---------------------------------------------------------------------------


def test_unregistered_permission_string_fails_closed_via_resolve():
    with pytest.raises(HTTPException) as exc:
        _resolve("farm.does_not_exist")
    assert exc.value.status_code == 500


def test_unregistered_permission_string_fails_closed_via_require_permission():
    """require_permission() resolves eagerly, so a bad string raises here —
    before any request ever reaches the checker."""
    with pytest.raises(HTTPException) as exc:
        require_permission("farm.does_not_exist")
    assert exc.value.status_code == 500


def test_random_unregistered_string_never_falls_through_to_authorise():
    """Direct regression test for the original bug: the old code's bare
    if/elif with no else meant ANY string not in the four handled branches
    returned current_user unchecked, authorising every caller. Assert that
    is no longer possible for an arbitrary unregistered string."""
    for bogus in ("mushroom.manage", "farm.super_secret", "", "ADMIN", "admin "):
        with pytest.raises(HTTPException) as exc:
            _resolve(bogus)
        assert exc.value.status_code == 500, f"{bogus!r} should fail closed"


# ---------------------------------------------------------------------------
# 4. Definition-time (not request-time) failure
# ---------------------------------------------------------------------------


def test_require_permission_raises_at_construction_not_first_request():
    """A typo in a route's permission string should surface when the app
    boots (route module import time), not silently on the first request."""
    with pytest.raises(HTTPException):
        require_permission("farm.typo_that_was_never_registered")


# ---------------------------------------------------------------------------
# 5. The three live weather.py admin endpoints
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_weather_admin_endpoints_wired_to_admin_manage_and_authorise_admin():
    """get_cache_stats, trigger_cache_refresh, invalidate_farm_cache
    (src/modules/farm_manager/api/v1/weather.py:217,252,291) all declare
    Depends(require_permission("admin.manage")). Confirm the source still
    wires all three to that permission string, and that a fresh checker for
    it authorises an admin caller end-to-end."""
    import inspect

    from src.modules.farm_manager.api.v1 import weather as weather_module

    source = inspect.getsource(weather_module)
    assert source.count('require_permission("admin.manage")') == 3, (
        "expected exactly 3 call sites (cache stats, trigger refresh, "
        "invalidate cache) gated on admin.manage"
    )

    checker = require_permission("admin.manage")
    admin_user = _User("admin")
    assert await checker(current_user=admin_user) is admin_user


def test_permission_roles_is_the_canonical_source_farm_auth_exposes():
    # Sanity check the module still exposes the dict under the expected name
    # (used by _resolve / require_permission and asserted throughout).
    assert farm_auth.PERMISSION_ROLES is PERMISSION_ROLES
