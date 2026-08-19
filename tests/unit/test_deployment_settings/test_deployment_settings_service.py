"""
Unit tests for `src/services/deployment_settings_service.py` — the
env -> db -> unset resolver that makes deployment identity (PUBLIC_BASE_URL,
FRONTEND_URL) and Cloudflare Access configuration runtime-configurable by a
super_admin instead of requiring a `.env` edit + container restart.

No live database: following the `_patch_db` / fake-collection precedent in
tests/unit/test_organizations/test_modules_service.py and
tests/unit/test_auth/test_cf_access.py, `db.platform_settings` /
`db.users` / `db.admin_audit_log` are hand-built MagicMock collections —
never mongomock, never a real Mongo connection. `db.platform_settings`'s
`find_one`/`update_one` are wired to a single mutable dict so a test can read
back exactly what `update()` persisted, mirroring a real single-document
Mongo collection closely enough for these tests.

Covers, in order:
  1. Resolution order — env wins over db, db used when env unset, unset
     falls back to the Settings class default.
  2. `get_resolved()` in-process cache (TTL) and `invalidate_cache()`.
  3. `update()` guardrails: env-pinned keys rejected (409), unknown key /
     wrong type rejected (422), wrong password rejected (401),
     CF_ACCESS_TEAM_DOMAIN JWKS validation (422), CF_ACCESS_EXCLUSIVE
     blocked without a proven Cloudflare Access login then allowed after
     one is recorded (409 -> 200).
  4. Audit log entry written with CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD
     masked in both before/after — never in clear.
  5. `mask_value` never returns a secret in full.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi import HTTPException

import src.services.deployment_settings_service as deployment_settings_service

ACTOR_USER_ID = "user-super-admin-1"
ACTOR_EMAIL = "super@example.com"
ACTOR_PASSWORD = "CorrectHorseBattery123!"


# ---------------------------------------------------------------------------
# Fake db — platform_settings / users / admin_audit_log
# ---------------------------------------------------------------------------


def _make_fake_db(
    platform_doc: Optional[Dict[str, Any]] = None,
    user_doc: Optional[Dict[str, Any]] = None,
) -> MagicMock:
    """
    A fake `db` whose `platform_settings` collection is backed by a single
    mutable dict (`platform_doc`), so `update_one`'s `$set` is visible to a
    subsequent `find_one` exactly like a real singleton document would be —
    important for guardrail (b), which reads `lastCfAccessLoginAt` back
    after a prior call recorded it.
    """
    doc: Dict[str, Any] = platform_doc if platform_doc is not None else {}

    async def _find_one(_filter: Dict[str, Any]) -> Dict[str, Any]:
        return doc

    async def _update_one(_filter: Dict[str, Any], update_spec: Dict[str, Any], upsert: bool = False):
        doc.update(update_spec.get("$set", {}))
        return MagicMock(modified_count=1)

    db = MagicMock()
    db.platform_settings = MagicMock()
    db.platform_settings.find_one = AsyncMock(side_effect=_find_one)
    db.platform_settings.update_one = AsyncMock(side_effect=_update_one)

    db.users = MagicMock()
    db.users.find_one = AsyncMock(return_value=user_doc)

    db.admin_audit_log = MagicMock()
    db.admin_audit_log.insert_one = AsyncMock()

    return db


def _patch_db(monkeypatch: pytest.MonkeyPatch, db: MagicMock) -> None:
    monkeypatch.setattr(deployment_settings_service.mongodb, "get_database", lambda: db)


def _default_user_doc(**overrides: Any) -> Dict[str, Any]:
    doc = {
        "userId": ACTOR_USER_ID,
        "email": ACTOR_EMAIL,
        "passwordHash": "irrelevant-hash",
    }
    doc.update(overrides)
    return doc


def _set_env(monkeypatch: pytest.MonkeyPatch, key: str, value: Any) -> None:
    """
    Simulate a key pinned via the environment: in production, Docker sets
    the env var AND the `settings` singleton picks it up at process start
    (both happen together). In tests the singleton was already built before
    monkeypatching `os.environ`, so both must be faked together.
    """
    monkeypatch.setenv(key, str(value))
    monkeypatch.setattr(deployment_settings_service.settings, key, value)


# ---------------------------------------------------------------------------
# Autouse: guarantee a known baseline regardless of the real process
# environment (this box's own container sets PUBLIC_BASE_URL for real), and
# reset the module-level cache between tests.
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _clean_env_and_cache(monkeypatch: pytest.MonkeyPatch):
    for key in deployment_settings_service.MANAGED_KEYS:
        monkeypatch.delenv(key, raising=False)
    deployment_settings_service.invalidate_cache()
    yield
    deployment_settings_service.invalidate_cache()


# ---------------------------------------------------------------------------
# Resolution order
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_env_wins_over_db(monkeypatch: pytest.MonkeyPatch) -> None:
    """When both an env var and a DB value exist, env wins and the key is
    reported non-editable."""
    _set_env(monkeypatch, "PUBLIC_BASE_URL", "https://env-wins.example.com")
    db = _make_fake_db(platform_doc={"PUBLIC_BASE_URL": "https://db-value.example.com"})
    _patch_db(monkeypatch, db)

    resolved = await deployment_settings_service.get_resolved()

    assert resolved["PUBLIC_BASE_URL"].value == "https://env-wins.example.com"
    assert resolved["PUBLIC_BASE_URL"].source == "env"
    assert resolved["PUBLIC_BASE_URL"].editable is False


@pytest.mark.asyncio
async def test_db_used_when_env_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    """No env var for this key -> the DB value is used and reported
    editable."""
    db = _make_fake_db(platform_doc={"FRONTEND_URL": "https://tenant-portal.example.com"})
    _patch_db(monkeypatch, db)

    resolved = await deployment_settings_service.get_resolved()

    assert resolved["FRONTEND_URL"].value == "https://tenant-portal.example.com"
    assert resolved["FRONTEND_URL"].source == "db"
    assert resolved["FRONTEND_URL"].editable is True


@pytest.mark.asyncio
async def test_unset_falls_back_to_settings_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """Neither env nor db has a value -> falls back to the Settings class
    default (exactly what `settings.<key>` already holds when the env var
    was never set) and is reported 'unset' + editable."""
    db = _make_fake_db(platform_doc={})
    _patch_db(monkeypatch, db)

    resolved = await deployment_settings_service.get_resolved()

    assert resolved["CF_ACCESS_JIT_PROVISION"].value == deployment_settings_service.settings.CF_ACCESS_JIT_PROVISION
    assert resolved["CF_ACCESS_JIT_PROVISION"].source == "unset"
    assert resolved["CF_ACCESS_JIT_PROVISION"].editable is True


@pytest.mark.asyncio
async def test_get_value_single_key_helper(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _make_fake_db(platform_doc={"CF_ACCESS_DEFAULT_ROLE": "moderator"})
    _patch_db(monkeypatch, db)

    assert await deployment_settings_service.get_value("CF_ACCESS_DEFAULT_ROLE") == "moderator"


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_resolved_is_cached_within_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _make_fake_db(platform_doc={"FRONTEND_URL": "https://first-read.example.com"})
    _patch_db(monkeypatch, db)

    first = await deployment_settings_service.get_resolved()
    assert first["FRONTEND_URL"].value == "https://first-read.example.com"

    # Mutate the underlying doc directly (bypassing update()) — a cached
    # get_resolved() must NOT see this until invalidated or the TTL expires.
    db.platform_settings.find_one.side_effect = None
    db.platform_settings.find_one.return_value = {"FRONTEND_URL": "https://second-read.example.com"}

    second = await deployment_settings_service.get_resolved()
    assert second["FRONTEND_URL"].value == "https://first-read.example.com"
    db.platform_settings.find_one.assert_called_once()


@pytest.mark.asyncio
async def test_invalidate_cache_forces_a_fresh_read(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _make_fake_db(platform_doc={"FRONTEND_URL": "https://first-read.example.com"})
    _patch_db(monkeypatch, db)

    await deployment_settings_service.get_resolved()

    db.platform_settings.find_one.side_effect = None
    db.platform_settings.find_one.return_value = {"FRONTEND_URL": "https://second-read.example.com"}
    deployment_settings_service.invalidate_cache()

    refreshed = await deployment_settings_service.get_resolved()
    assert refreshed["FRONTEND_URL"].value == "https://second-read.example.com"


@pytest.mark.asyncio
async def test_update_invalidates_cache_so_the_write_is_visible_immediately(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    platform_doc: Dict[str, Any] = {}
    db = _make_fake_db(platform_doc=platform_doc, user_doc=_default_user_doc())
    _patch_db(monkeypatch, db)
    monkeypatch.setattr(deployment_settings_service, "verify_password", lambda pw, h: True)

    # Warm the cache with the pre-update state.
    before = await deployment_settings_service.get_resolved()
    assert before["FRONTEND_URL"].source == "unset"

    resolved_after = await deployment_settings_service.update(
        changes={"FRONTEND_URL": "https://new-frontend.example.com"},
        actor_user_id=ACTOR_USER_ID,
        actor_email=ACTOR_EMAIL,
        current_password=ACTOR_PASSWORD,
    )

    assert resolved_after["FRONTEND_URL"].value == "https://new-frontend.example.com"
    assert resolved_after["FRONTEND_URL"].source == "db"
    # A separate call proves it's not an artifact of update()'s own return
    # value — the cache itself was actually invalidated.
    again = await deployment_settings_service.get_resolved()
    assert again["FRONTEND_URL"].value == "https://new-frontend.example.com"


# ---------------------------------------------------------------------------
# update() guardrails
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_env_pinned_key_is_rejected_as_non_editable(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_env(monkeypatch, "PUBLIC_BASE_URL", "https://pinned.example.com")
    db = _make_fake_db(platform_doc={}, user_doc=_default_user_doc())
    _patch_db(monkeypatch, db)
    monkeypatch.setattr(deployment_settings_service, "verify_password", lambda pw, h: True)

    with pytest.raises(HTTPException) as exc:
        await deployment_settings_service.update(
            changes={"PUBLIC_BASE_URL": "https://attempted-override.example.com"},
            actor_user_id=ACTOR_USER_ID,
            actor_email=ACTOR_EMAIL,
            current_password=ACTOR_PASSWORD,
        )
    assert exc.value.status_code == 409
    assert "PUBLIC_BASE_URL" in exc.value.detail
    db.platform_settings.update_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_unknown_key_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _make_fake_db(platform_doc={}, user_doc=_default_user_doc())
    _patch_db(monkeypatch, db)

    with pytest.raises(HTTPException) as exc:
        await deployment_settings_service.update(
            changes={"SECRET_KEY": "nope"},
            actor_user_id=ACTOR_USER_ID,
            actor_email=ACTOR_EMAIL,
            current_password=ACTOR_PASSWORD,
        )
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_wrong_type_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _make_fake_db(platform_doc={}, user_doc=_default_user_doc())
    _patch_db(monkeypatch, db)

    with pytest.raises(HTTPException) as exc:
        await deployment_settings_service.update(
            changes={"CF_ACCESS_ENABLED": "true"},  # str, not bool
            actor_user_id=ACTOR_USER_ID,
            actor_email=ACTOR_EMAIL,
            current_password=ACTOR_PASSWORD,
        )
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_cf_access_default_role_rejects_invalid_string(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Fix 3: CF_ACCESS_DEFAULT_ROLE previously only had its TYPE checked
    (`isinstance(value, str)`) on this runtime write path — a value like
    "super_admin" or pure garbage would pass. The UserRole enum-membership
    check in config/settings.py's startup validator only covers the env-var
    path. This must now be rejected here too, matching that validator."""
    db = _make_fake_db(platform_doc={}, user_doc=_default_user_doc())
    _patch_db(monkeypatch, db)

    with pytest.raises(HTTPException) as exc:
        await deployment_settings_service.update(
            changes={"CF_ACCESS_DEFAULT_ROLE": "not_a_real_role"},
            actor_user_id=ACTOR_USER_ID,
            actor_email=ACTOR_EMAIL,
            current_password=ACTOR_PASSWORD,
        )
    assert exc.value.status_code == 422
    db.platform_settings.update_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_cf_access_default_role_rejects_super_admin_is_still_allowed_but_must_be_a_real_role(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The fix matches the startup validator's strictness — enum membership
    only. "super_admin" IS a member of UserRole, so it is not rejected by
    this check (same as the env-var path); this pins that the guard is
    enum-membership, not a narrower allow-list, so a behavior change here
    is caught if someone tightens one path without the other."""
    db = _make_fake_db(platform_doc={}, user_doc=_default_user_doc())
    _patch_db(monkeypatch, db)
    monkeypatch.setattr(deployment_settings_service, "verify_password", lambda pw, h: True)

    resolved = await deployment_settings_service.update(
        changes={"CF_ACCESS_DEFAULT_ROLE": "super_admin"},
        actor_user_id=ACTOR_USER_ID,
        actor_email=ACTOR_EMAIL,
        current_password=ACTOR_PASSWORD,
    )
    assert resolved["CF_ACCESS_DEFAULT_ROLE"].value == "super_admin"


@pytest.mark.asyncio
async def test_cf_access_default_role_accepts_a_valid_role(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = _make_fake_db(platform_doc={}, user_doc=_default_user_doc())
    _patch_db(monkeypatch, db)
    monkeypatch.setattr(deployment_settings_service, "verify_password", lambda pw, h: True)

    resolved = await deployment_settings_service.update(
        changes={"CF_ACCESS_DEFAULT_ROLE": "moderator"},
        actor_user_id=ACTOR_USER_ID,
        actor_email=ACTOR_EMAIL,
        current_password=ACTOR_PASSWORD,
    )
    assert resolved["CF_ACCESS_DEFAULT_ROLE"].value == "moderator"


@pytest.mark.asyncio
async def test_empty_changes_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _make_fake_db(platform_doc={}, user_doc=_default_user_doc())
    _patch_db(monkeypatch, db)

    with pytest.raises(HTTPException) as exc:
        await deployment_settings_service.update(
            changes={},
            actor_user_id=ACTOR_USER_ID,
            actor_email=ACTOR_EMAIL,
            current_password=ACTOR_PASSWORD,
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_wrong_password_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _make_fake_db(platform_doc={}, user_doc=_default_user_doc())
    _patch_db(monkeypatch, db)
    monkeypatch.setattr(deployment_settings_service, "verify_password", lambda pw, h: False)

    with pytest.raises(HTTPException) as exc:
        await deployment_settings_service.update(
            changes={"FRONTEND_URL": "https://new.example.com"},
            actor_user_id=ACTOR_USER_ID,
            actor_email=ACTOR_EMAIL,
            current_password="totally-wrong",
        )
    assert exc.value.status_code == 401
    db.platform_settings.update_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_missing_actor_user_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    """No user document at all (e.g. deleted mid-session) must fail closed,
    not raise an unhandled KeyError/AttributeError."""
    db = _make_fake_db(platform_doc={}, user_doc=None)
    _patch_db(monkeypatch, db)

    with pytest.raises(HTTPException) as exc:
        await deployment_settings_service.update(
            changes={"FRONTEND_URL": "https://new.example.com"},
            actor_user_id="ghost-user",
            actor_email=ACTOR_EMAIL,
            current_password=ACTOR_PASSWORD,
        )
    assert exc.value.status_code == 401


# ---------------------------------------------------------------------------
# Guardrail (a) — CF_ACCESS_TEAM_DOMAIN JWKS validation
# ---------------------------------------------------------------------------


class _FakeResponse:
    def __init__(self, json_data: Any = None) -> None:
        self._json_data = json_data

    def raise_for_status(self) -> None:
        return None

    def json(self) -> Any:
        return self._json_data


class _FakeAsyncClient:
    def __init__(self, response: Optional[_FakeResponse] = None, get_exc: Optional[Exception] = None) -> None:
        self._response = response
        self._get_exc = get_exc

    async def __aenter__(self) -> "_FakeAsyncClient":
        return self

    async def __aexit__(self, *args: Any) -> bool:
        return False

    async def get(self, url: str) -> _FakeResponse:
        if self._get_exc:
            raise self._get_exc
        return self._response


def _patch_httpx_client(monkeypatch: pytest.MonkeyPatch, **kwargs: Any) -> None:
    monkeypatch.setattr(
        deployment_settings_service.httpx,
        "AsyncClient",
        lambda *a, **kw: _FakeAsyncClient(**kwargs),
    )


@pytest.mark.asyncio
async def test_team_domain_validation_rejects_unreachable_host(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _make_fake_db(platform_doc={}, user_doc=_default_user_doc())
    _patch_db(monkeypatch, db)
    monkeypatch.setattr(deployment_settings_service, "verify_password", lambda pw, h: True)
    _patch_httpx_client(monkeypatch, get_exc=httpx.ConnectError("name resolution failed"))

    with pytest.raises(HTTPException) as exc:
        await deployment_settings_service.update(
            changes={"CF_ACCESS_TEAM_DOMAIN": "typo-domain.cloudflareaccess.com"},
            actor_user_id=ACTOR_USER_ID,
            actor_email=ACTOR_EMAIL,
            current_password=ACTOR_PASSWORD,
        )
    assert exc.value.status_code == 422
    db.platform_settings.update_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_team_domain_validation_rejects_empty_jwks(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _make_fake_db(platform_doc={}, user_doc=_default_user_doc())
    _patch_db(monkeypatch, db)
    monkeypatch.setattr(deployment_settings_service, "verify_password", lambda pw, h: True)
    _patch_httpx_client(monkeypatch, response=_FakeResponse(json_data={"keys": []}))

    with pytest.raises(HTTPException) as exc:
        await deployment_settings_service.update(
            changes={"CF_ACCESS_TEAM_DOMAIN": "empty-jwks.cloudflareaccess.com"},
            actor_user_id=ACTOR_USER_ID,
            actor_email=ACTOR_EMAIL,
            current_password=ACTOR_PASSWORD,
        )
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_team_domain_validation_accepts_valid_jwks(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _make_fake_db(platform_doc={}, user_doc=_default_user_doc())
    _patch_db(monkeypatch, db)
    monkeypatch.setattr(deployment_settings_service, "verify_password", lambda pw, h: True)
    _patch_httpx_client(monkeypatch, response=_FakeResponse(json_data={"keys": [{"kid": "abc"}]}))

    resolved = await deployment_settings_service.update(
        changes={"CF_ACCESS_TEAM_DOMAIN": "real-team.cloudflareaccess.com"},
        actor_user_id=ACTOR_USER_ID,
        actor_email=ACTOR_EMAIL,
        current_password=ACTOR_PASSWORD,
    )
    assert resolved["CF_ACCESS_TEAM_DOMAIN"].value == "real-team.cloudflareaccess.com"
    db.platform_settings.update_one.assert_awaited_once()


# ---------------------------------------------------------------------------
# Guardrail (b) — CF_ACCESS_EXCLUSIVE requires a proven Cloudflare Access login
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_exclusive_blocked_without_proven_login_then_allowed_after(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    platform_doc: Dict[str, Any] = {}
    db = _make_fake_db(platform_doc=platform_doc, user_doc=_default_user_doc())
    _patch_db(monkeypatch, db)
    monkeypatch.setattr(deployment_settings_service, "verify_password", lambda pw, h: True)

    with pytest.raises(HTTPException) as exc:
        await deployment_settings_service.update(
            changes={"CF_ACCESS_EXCLUSIVE": True},
            actor_user_id=ACTOR_USER_ID,
            actor_email=ACTOR_EMAIL,
            current_password=ACTOR_PASSWORD,
        )
    assert exc.value.status_code == 409
    assert "sign in once" in exc.value.detail.lower()
    db.platform_settings.update_one.assert_not_awaited()

    # Simulate a successful Cloudflare Access login being recorded.
    await deployment_settings_service.record_cf_access_login()
    assert platform_doc.get("lastCfAccessLoginAt") is not None

    resolved = await deployment_settings_service.update(
        changes={"CF_ACCESS_EXCLUSIVE": True},
        actor_user_id=ACTOR_USER_ID,
        actor_email=ACTOR_EMAIL,
        current_password=ACTOR_PASSWORD,
    )
    assert resolved["CF_ACCESS_EXCLUSIVE"].value is True


@pytest.mark.asyncio
async def test_exclusive_false_never_requires_a_proven_login(monkeypatch: pytest.MonkeyPatch) -> None:
    """Disabling exclusive mode (or leaving it False) must never trip
    guardrail (b) — only enabling it does."""
    db = _make_fake_db(platform_doc={}, user_doc=_default_user_doc())
    _patch_db(monkeypatch, db)
    monkeypatch.setattr(deployment_settings_service, "verify_password", lambda pw, h: True)

    resolved = await deployment_settings_service.update(
        changes={"CF_ACCESS_EXCLUSIVE": False},
        actor_user_id=ACTOR_USER_ID,
        actor_email=ACTOR_EMAIL,
        current_password=ACTOR_PASSWORD,
    )
    assert resolved["CF_ACCESS_EXCLUSIVE"].value is False


# ---------------------------------------------------------------------------
# Audit log — masked before/after
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_audit_log_written_with_masked_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    platform_doc = {"CF_ACCESS_AUD": "old-aud-value-1234"}
    db = _make_fake_db(platform_doc=platform_doc, user_doc=_default_user_doc())
    _patch_db(monkeypatch, db)
    monkeypatch.setattr(deployment_settings_service, "verify_password", lambda pw, h: True)

    await deployment_settings_service.update(
        changes={"CF_ACCESS_AUD": "new-aud-value-5678"},
        actor_user_id=ACTOR_USER_ID,
        actor_email=ACTOR_EMAIL,
        current_password=ACTOR_PASSWORD,
    )

    db.admin_audit_log.insert_one.assert_awaited_once()
    (audit_entry,), _ = db.admin_audit_log.insert_one.await_args
    assert audit_entry["action"] == "deployment_settings.updated"
    assert audit_entry["performedBy"] == ACTOR_USER_ID
    assert audit_entry["performedByEmail"] == ACTOR_EMAIL

    before = audit_entry["details"]["before"]
    after = audit_entry["details"]["after"]
    assert before["CF_ACCESS_AUD"] == "****1234"
    assert after["CF_ACCESS_AUD"] == "****5678"
    # The full values must never appear anywhere in the audit record.
    assert "old-aud-value-1234" not in str(audit_entry)
    assert "new-aud-value-5678" not in str(audit_entry)


@pytest.mark.asyncio
async def test_audit_log_does_not_mask_non_secret_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _make_fake_db(platform_doc={}, user_doc=_default_user_doc())
    _patch_db(monkeypatch, db)
    monkeypatch.setattr(deployment_settings_service, "verify_password", lambda pw, h: True)

    await deployment_settings_service.update(
        changes={"FRONTEND_URL": "https://plain-value.example.com"},
        actor_user_id=ACTOR_USER_ID,
        actor_email=ACTOR_EMAIL,
        current_password=ACTOR_PASSWORD,
    )

    (audit_entry,), _ = db.admin_audit_log.insert_one.await_args
    assert audit_entry["details"]["after"]["FRONTEND_URL"] == "https://plain-value.example.com"


# ---------------------------------------------------------------------------
# mask_value — never returns a secret in full
# ---------------------------------------------------------------------------


def test_mask_value_never_returns_the_full_secret() -> None:
    assert deployment_settings_service.mask_value("myteam.cloudflareaccess.com") == "****.com"
    long_value = "a" * 40 + "tail"
    masked = deployment_settings_service.mask_value(long_value)
    assert masked == "****tail"
    assert long_value not in masked


def test_mask_value_short_string_is_fully_starred() -> None:
    assert deployment_settings_service.mask_value("ab") == "**"


def test_mask_value_passes_through_non_secret_types() -> None:
    assert deployment_settings_service.mask_value(True) is True
    assert deployment_settings_service.mask_value("") == ""
    assert deployment_settings_service.mask_value(None) is None
