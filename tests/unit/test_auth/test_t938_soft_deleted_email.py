"""
Unit tests for T-938 — the soft-deleted-email / duplicate-key production
incident on Cloudflare Access login.

Background: `users` carries a unique index on `email` with no partial
filter, and `delete_user` (src/api/v1/admin.py) is a SOFT delete — it sets
`deletedAt` + `isActive: False` and leaves the document in place.
`AuthService.login_via_cf_access` used to look up users with a
`deletedAt: None` filter, which made a soft-deleted user invisible to that
query and sent the request down the JIT-provisioning branch, which then
tried `db.users.insert_one()` with the SAME email as the tombstone. The
unique index rejected it with `DuplicateKeyError`, and nothing caught it,
so it propagated as an unhandled 500 on
`POST /api/v1/auth/cf-access/session` (see production log evidence in the
T-938 backlog entry: `E11000 duplicate key error ... index: email_1`).

The fix (in `src/services/auth_service.py`):
  1. `login_via_cf_access`'s lookup no longer filters `deletedAt` — it
     finds ANY user row for the email, live or soft-deleted. Since
     `delete_user` always sets `isActive: False` alongside `deletedAt`, a
     soft-deleted row now falls straight into the existing "account exists
     but isn't active" branch and returns the shared pending_activation 403
     — no resurrection, no 500, and (critically) the exact same response
     shape as an unknown email, so the endpoint still never discloses
     whether a given email is known to the system.
  2. The JIT `insert_one()` is additionally wrapped in
     `except DuplicateKeyError` as defense in depth against races (e.g. two
     concurrent CF logins for the same brand-new email) — it now returns
     the same pending_activation 403 instead of letting the exception
     escape as a 500.

No live database: `db.users` / `db.refresh_tokens` / `db.mfa_pending_tokens`
are hand-built fake collections (AsyncMock methods), following the
`_make_fake_db` / `_patch_db` precedent in
tests/unit/test_auth/test_cf_access.py.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

import src.services.deployment_settings_service as deployment_settings_service
from src.models.user import TokenResponse, UserCreate, UserRole
from src.services.auth_service import PENDING_ACTIVATION_MESSAGE, AuthService
from src.services.cf_access_service import CFAccessIdentity
from src.services.database import mongodb as mongodb_singleton

# ---------------------------------------------------------------------------
# Fakes — mirrors tests/unit/test_auth/test_cf_access.py's _make_fake_db /
# _patch_db precedent, kept local to this file rather than imported so this
# file stays self-contained (matches tests/unit/test_auth/
# test_login_pending_activation.py's precedent of not importing fixtures
# across test modules).
# ---------------------------------------------------------------------------

_DEFAULT_DEPLOYMENT_VALUES: Dict[str, Any] = {
    "CF_ACCESS_ENABLED": True,
    "CF_ACCESS_EXCLUSIVE": False,
    "CF_ACCESS_JIT_PROVISION": True,
    "CF_ACCESS_DEFAULT_ROLE": "user",
}


@pytest.fixture(autouse=True)
def _deployment_settings_stub(monkeypatch: pytest.MonkeyPatch) -> Dict[str, Any]:
    values = dict(_DEFAULT_DEPLOYMENT_VALUES)

    async def _fake_get_value(key: str) -> Any:
        return values[key]

    monkeypatch.setattr(deployment_settings_service, "get_value", _fake_get_value)
    monkeypatch.setattr(
        deployment_settings_service, "record_cf_access_login", AsyncMock()
    )
    return values


def _make_fake_db(
    user_doc: Optional[Dict[str, Any]], insert_side_effect: Any = None
) -> MagicMock:
    db = MagicMock()
    db.users = MagicMock()
    db.users.find_one = AsyncMock(return_value=user_doc)
    db.users.insert_one = AsyncMock(side_effect=insert_side_effect)
    db.users.update_one = AsyncMock()
    db.refresh_tokens = MagicMock()
    db.refresh_tokens.insert_one = AsyncMock()
    db.mfa_pending_tokens = MagicMock()
    db.mfa_pending_tokens.insert_one = AsyncMock()
    return db


def _patch_db(monkeypatch: pytest.MonkeyPatch, db: MagicMock) -> None:
    monkeypatch.setattr(mongodb_singleton, "get_database", lambda: db)


def _soft_deleted_user_doc(**overrides: Any) -> Dict[str, Any]:
    now = datetime.utcnow()
    doc: Dict[str, Any] = {
        "userId": "user-deleted-1",
        "email": "samah@agrinovame.com",
        "passwordHash": None,
        "firstName": "Samah",
        "lastName": "Deleted",
        "role": UserRole.USER.value,
        "isActive": False,
        "isEmailVerified": True,
        "mfaEnabled": False,
        "mfaSetupRequired": False,
        "authProvider": "cloudflare_access",
        "phone": None,
        "avatar": None,
        "timezone": None,
        "locale": None,
        "lastLoginAt": None,
        "createdAt": now,
        "updatedAt": now,
        "deletedAt": now,
        "organizationId": None,
        "divisionAccess": None,
        "defaultDivisionId": None,
    }
    doc.update(overrides)
    return doc


def _active_user_doc(**overrides: Any) -> Dict[str, Any]:
    now = datetime.utcnow()
    doc: Dict[str, Any] = {
        "userId": "user-active-1",
        "email": "live@example.com",
        "passwordHash": None,
        "firstName": "Live",
        "lastName": "User",
        "role": UserRole.USER.value,
        "isActive": True,
        "isEmailVerified": True,
        "mfaEnabled": False,
        "mfaSetupRequired": False,
        "authProvider": "cloudflare_access",
        "phone": None,
        "avatar": None,
        "timezone": None,
        "locale": None,
        "lastLoginAt": None,
        "createdAt": now,
        "updatedAt": now,
        "deletedAt": None,
        "organizationId": None,
        "divisionAccess": None,
        "defaultDivisionId": None,
    }
    doc.update(overrides)
    return doc


# ---------------------------------------------------------------------------
# 1. THE regression test — soft-deleted email via Cloudflare Access no
#    longer 500s and no longer attempts to resurrect the account.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cf_login_soft_deleted_email_returns_pending_not_500(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_doc = _soft_deleted_user_doc()
    db = _make_fake_db(user_doc)
    _patch_db(monkeypatch, db)

    identity = CFAccessIdentity(email=user_doc["email"], sub="cf-sub-1", exp=9999999999)

    with pytest.raises(HTTPException) as exc:
        await AuthService.login_via_cf_access(identity)

    assert exc.value.status_code == 403
    assert exc.value.detail["status"] == "pending_activation"
    assert exc.value.detail["detail"] == PENDING_ACTIVATION_MESSAGE

    # The account must not be silently resurrected: no JIT insert attempt.
    db.users.insert_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_cf_login_jit_insert_duplicate_key_collision_returns_pending_not_500(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """
    Defense-in-depth path: find_one() finds nothing (e.g. a race — see the
    Reason comment on the except DuplicateKeyError block in
    login_via_cf_access), but insert_one() collides with the unique index
    anyway. This must still surface as pending_activation, never an
    unhandled 500 — the exact failure mode from the production log evidence
    (E11000 duplicate key error on POST /api/v1/auth/cf-access/session).
    """
    db = _make_fake_db(None, insert_side_effect=DuplicateKeyError("E11000 dup key"))
    _patch_db(monkeypatch, db)

    identity = CFAccessIdentity(
        email="race@example.com", sub="cf-sub-2", exp=9999999999
    )

    with pytest.raises(HTTPException) as exc:
        await AuthService.login_via_cf_access(identity)

    assert exc.value.status_code == 403
    assert exc.value.detail["status"] == "pending_activation"
    db.users.insert_one.assert_awaited_once()


# ---------------------------------------------------------------------------
# 2. Non-disclosure: soft-deleted email and unknown email must be
#    byte-identical responses.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_soft_deleted_and_unknown_email_responses_are_identical(
    monkeypatch: pytest.MonkeyPatch,
    _deployment_settings_stub: Dict[str, Any],
) -> None:
    _deployment_settings_stub["CF_ACCESS_JIT_PROVISION"] = False

    # Soft-deleted email.
    db_deleted = _make_fake_db(_soft_deleted_user_doc(email="known@example.com"))
    _patch_db(monkeypatch, db_deleted)
    identity_known = CFAccessIdentity(
        email="known@example.com", sub="cf-sub-3", exp=9999999999
    )
    with pytest.raises(HTTPException) as exc_known:
        await AuthService.login_via_cf_access(identity_known)

    # Genuinely unknown email (JIT off, so no side-effecting insert either).
    db_unknown = _make_fake_db(None)
    _patch_db(monkeypatch, db_unknown)
    identity_unknown = CFAccessIdentity(
        email="never-heard-of@example.com", sub="cf-sub-4", exp=9999999999
    )
    with pytest.raises(HTTPException) as exc_unknown:
        await AuthService.login_via_cf_access(identity_unknown)

    assert exc_known.value.status_code == exc_unknown.value.status_code == 403
    assert (
        exc_known.value.detail
        == exc_unknown.value.detail
        == {
            "detail": PENDING_ACTIVATION_MESSAGE,
            "status": "pending_activation",
        }
    )


# ---------------------------------------------------------------------------
# 3. Live-but-inactive user still returns pending (unaffected by the
#    deletedAt filter removal).
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cf_login_live_inactive_user_still_returns_pending(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_doc = _active_user_doc(isActive=False, deletedAt=None)
    db = _make_fake_db(user_doc)
    _patch_db(monkeypatch, db)

    identity = CFAccessIdentity(email=user_doc["email"], sub="cf-sub-5", exp=9999999999)

    with pytest.raises(HTTPException) as exc:
        await AuthService.login_via_cf_access(identity)

    assert exc.value.status_code == 403
    assert exc.value.detail["status"] == "pending_activation"
    db.users.insert_one.assert_not_awaited()


# ---------------------------------------------------------------------------
# 4. Live active user still succeeds (unaffected by the deletedAt filter
#    removal).
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cf_login_live_active_user_still_succeeds(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_doc = _active_user_doc()
    db = _make_fake_db(user_doc)
    _patch_db(monkeypatch, db)

    identity = CFAccessIdentity(email=user_doc["email"], sub="cf-sub-6", exp=9999999999)

    result = await AuthService.login_via_cf_access(identity)

    assert isinstance(result, TokenResponse)
    assert result.user.userId == user_doc["userId"]
    db.refresh_tokens.insert_one.assert_awaited_once()
    db.users.insert_one.assert_not_awaited()


# ---------------------------------------------------------------------------
# 5. Password registration against a soft-deleted email: consistent with
#    the CF rule (does not resurrect, does not 500), via the registration
#    endpoint's own 409 shape.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_register_user_soft_deleted_email_returns_409_not_resurrected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tombstone = _soft_deleted_user_doc(email="gone@example.com")
    db = MagicMock()
    db.users = MagicMock()
    db.users.find_one = AsyncMock(return_value=tombstone)
    db.users.insert_one = AsyncMock()
    monkeypatch.setattr(mongodb_singleton, "get_database", lambda: db)

    user_data = UserCreate(
        email="gone@example.com",
        password="BrandNewPassw0rd!",
        firstName="New",
        lastName="Person",
    )

    with pytest.raises(HTTPException) as exc:
        await AuthService.register_user(user_data)

    assert exc.value.status_code == 409
    # Does not resurrect the tombstone or create a second document for the
    # same email.
    db.users.insert_one.assert_not_awaited()
