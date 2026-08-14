"""
Regression test for cache-key per-user / per-tenant isolation.

`_generate_cache_key_from_args` must fold the authenticated caller's userId +
organizationId into the key, so a per-user / per-org cached response is never
served to a *different* caller. Before this, the key was built from query
params only (current_user was filtered out), so the first caller's result
leaked to everyone else for the whole TTL window — a cross-user and
cross-tenant data exposure (farms list, farm/sales dashboards).
"""

from src.core.cache.decorators import _generate_cache_key_from_args as gen


class _User:
    def __init__(self, user_id, org=None):
        self.userId = user_id
        self.organizationId = org


def _args(user):
    return {"page": 1, "perPage": 20, "current_user": user}


def test_different_users_get_different_keys():
    a = gen("get_farms", _args(_User("u-admin", "org-A")))
    b = gen("get_farms", _args(_User("u-mod", "org-A")))
    assert a != b


def test_different_orgs_get_different_keys():
    a = gen("get_farms", _args(_User("u-1", "org-A")))
    b = gen("get_farms", _args(_User("u-1", "org-B")))
    assert a != b


def test_same_user_same_params_is_stable():
    a = gen("get_farms", _args(_User("u-1", "org-A")))
    b = gen("get_farms", _args(_User("u-1", "org-A")))
    assert a == b


def test_user_without_org_still_isolated_by_uid():
    a = gen("get_farms", {"current_user": _User("u-1")})
    b = gen("get_farms", {"current_user": _User("u-2")})
    assert a != b


def test_no_authenticated_user_still_caches_on_params():
    # Genuinely-global endpoints (no current_user kwarg) keep caching on params.
    a = gen("list_public", {"page": 1})
    b = gen("list_public", {"page": 1})
    assert a == b
    assert a != "list_public"  # params were hashed in
