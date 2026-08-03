"""
Unit tests for `UserService.update_user` clearing the `nameAutoDerived` flag.

Background: a Cloudflare-Access JIT-provisioned user gets firstName/
lastName guessed from their email local-part (see
`AuthService.login_via_cf_access` in src/services/auth_service.py) because
Cloudflare's JWT only reliably supplies an email. That guess is flagged
`nameAutoDerived=True` on the user document so the frontend can prompt the
user to pick a real name. The ONLY way that flag should ever flip back to
False is the user actually editing firstName or lastName via
`PATCH /api/v1/auth/me` (-> `UserService.update_user`) — never a side
effect of editing phone/avatar/timezone/locale, and never something the
API can silently forget once set.

No live database: `db.users` is a hand-built fake collection (AsyncMock
methods), following the `_make_fake_db` / `_patch_db` precedent in
tests/unit/test_auth/test_cf_access.py.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.models.user import UserRole, UserUpdate
from src.services.database import mongodb as mongodb_singleton
from src.services.user_service import UserService

USER_ID = "user-jit-1"


def _jit_user_doc(**overrides: Any) -> Dict[str, Any]:
    now = datetime.utcnow()
    doc: Dict[str, Any] = {
        "userId": USER_ID,
        "email": "lilistrocel@example.com",
        "firstName": "Lilistrocel",
        "lastName": "Lilistrocel",
        "role": UserRole.USER.value,
        "isActive": True,
        "isEmailVerified": True,
        "mfaEnabled": False,
        "mfaSetupRequired": False,
        "authProvider": "cloudflare_access",
        "nameAutoDerived": True,
        "phone": None,
        "avatar": None,
        "timezone": None,
        "locale": None,
        "lastLoginAt": None,
        "createdAt": now,
        "updatedAt": now,
        "organizationId": None,
        "divisionAccess": None,
        "defaultDivisionId": None,
        "deletedAt": None,
    }
    doc.update(overrides)
    return doc


def _make_fake_db(sequence: list) -> MagicMock:
    """
    `update_user` calls `db.users.find_one` (existence check), then
    `db.users.update_one`, then `UserService.get_user_by_id` ->
    `db.users.find_one` again to return the post-update doc. `sequence`
    supplies the two find_one results in order.
    """
    db = MagicMock()
    db.users = MagicMock()
    db.users.find_one = AsyncMock(side_effect=sequence)
    db.users.update_one = AsyncMock()
    return db


def _patch_db(monkeypatch: pytest.MonkeyPatch, db: MagicMock) -> None:
    monkeypatch.setattr(mongodb_singleton, "get_database", lambda: db)


# ---------------------------------------------------------------------------
# get_user_by_id / get_user_by_email surface the flag as-is
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_user_by_id_surfaces_name_auto_derived_true(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    doc = _jit_user_doc()
    db = _make_fake_db([doc])
    _patch_db(monkeypatch, db)

    user = await UserService.get_user_by_id(USER_ID)

    assert user is not None
    assert user.nameAutoDerived is True


@pytest.mark.asyncio
async def test_get_user_by_id_defaults_name_auto_derived_false_when_absent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A pre-existing password-registered user document has no
    # nameAutoDerived key at all (added after this field existed) — must
    # default to False, not raise or come back None.
    doc = _jit_user_doc(authProvider="password")
    del doc["nameAutoDerived"]
    db = _make_fake_db([doc])
    _patch_db(monkeypatch, db)

    user = await UserService.get_user_by_id(USER_ID)

    assert user is not None
    assert user.nameAutoDerived is False


# ---------------------------------------------------------------------------
# update_user — clearing behaviour
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_updating_first_name_clears_the_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    existing = _jit_user_doc()
    updated = _jit_user_doc(firstName="Viet", nameAutoDerived=False)
    db = _make_fake_db([existing, updated])
    _patch_db(monkeypatch, db)

    result = await UserService.update_user(USER_ID, UserUpdate(firstName="Viet"))

    # The write itself must have set nameAutoDerived False alongside firstName.
    db.users.update_one.assert_awaited_once()
    _filter, update_doc = db.users.update_one.await_args.args
    assert update_doc["$set"]["firstName"] == "Viet"
    assert update_doc["$set"]["nameAutoDerived"] is False

    assert result.nameAutoDerived is False


@pytest.mark.asyncio
async def test_updating_last_name_clears_the_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    existing = _jit_user_doc()
    updated = _jit_user_doc(lastName="Nguyen", nameAutoDerived=False)
    db = _make_fake_db([existing, updated])
    _patch_db(monkeypatch, db)

    result = await UserService.update_user(USER_ID, UserUpdate(lastName="Nguyen"))

    db.users.update_one.assert_awaited_once()
    _filter, update_doc = db.users.update_one.await_args.args
    assert update_doc["$set"]["lastName"] == "Nguyen"
    assert update_doc["$set"]["nameAutoDerived"] is False
    assert result.nameAutoDerived is False


@pytest.mark.asyncio
async def test_updating_unrelated_field_does_not_touch_the_flag(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    existing = _jit_user_doc()
    updated = _jit_user_doc(timezone="Asia/Ho_Chi_Minh")  # nameAutoDerived still True
    db = _make_fake_db([existing, updated])
    _patch_db(monkeypatch, db)

    result = await UserService.update_user(USER_ID, UserUpdate(timezone="Asia/Ho_Chi_Minh"))

    db.users.update_one.assert_awaited_once()
    _filter, update_doc = db.users.update_one.await_args.args
    assert "nameAutoDerived" not in update_doc["$set"]
    assert result.nameAutoDerived is True
