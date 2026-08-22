"""
Unit tests for `UserService.change_user_role` / `activate_user` /
`deactivate_user` — security audit fixes 1 and 4.

Background: role changes and activation/deactivation are the most
sensitive mutations in the system and were completely unaudited (a bare
`update_one` plus a `logger.info`, nothing written to `admin_audit_log`).
`activate_user`/`deactivate_user` also lacked the super_admin-target guard
their sibling endpoint in `api/v1/admin.py` already enforced, so a plain
`admin` could activate/deactivate a `super_admin` account.

Covers:
  1. Each method writes exactly one `admin_audit_log` entry recording the
     actor (userId + email), the target (userId + email), the before/after
     value, and an action name in the existing dotted convention.
  2. `activate_user` / `deactivate_user` raise 403 when the target holds
     `super_admin` and the actor does not, and never touch the database in
     that case.
  3. A super_admin actor CAN activate/deactivate another super_admin.

No live database: `db.users` / `db.refresh_tokens` / `db.admin_audit_log`
are hand-built AsyncMock collections, following the `_make_fake_db` /
`_patch_db` precedent in tests/unit/test_users/test_user_service_name_auto_derived.py
and tests/unit/test_deployment_settings/test_deployment_settings_service.py.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from src.models.user import UserResponse, UserRole
from src.services.database import mongodb as mongodb_singleton
from src.services.user_service import UserService

TARGET_USER_ID = "user-target-1"
TARGET_EMAIL = "target@example.com"
ACTOR_USER_ID = "user-actor-1"
ACTOR_EMAIL = "actor@example.com"


def _target_doc(**overrides: Any) -> Dict[str, Any]:
    now = datetime.utcnow()
    doc: Dict[str, Any] = {
        "userId": TARGET_USER_ID,
        "email": TARGET_EMAIL,
        "firstName": "Target",
        "lastName": "User",
        "role": UserRole.USER.value,
        "isActive": True,
        "isEmailVerified": True,
        "mfaEnabled": False,
        "mfaSetupRequired": False,
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


def _actor(role: UserRole) -> UserResponse:
    now = datetime(2026, 1, 1)
    return UserResponse(
        userId=ACTOR_USER_ID,
        email=ACTOR_EMAIL,
        firstName="Actor",
        lastName="User",
        role=role,
        isActive=True,
        isEmailVerified=True,
        lastLoginAt=None,
        createdAt=now,
        updatedAt=now,
    )


def _make_fake_db(find_one_sequence: list) -> MagicMock:
    """`find_one_sequence` supplies successive `db.users.find_one` results —
    each of these service methods reads the target once up front, then
    `UserService.get_user_by_id` reads it again at the end to build the
    response."""
    db = MagicMock()
    db.users = MagicMock()
    db.users.find_one = AsyncMock(side_effect=find_one_sequence)
    db.users.update_one = AsyncMock()
    db.refresh_tokens = MagicMock()
    db.refresh_tokens.update_many = AsyncMock()
    db.admin_audit_log = MagicMock()
    db.admin_audit_log.insert_one = AsyncMock()
    return db


def _patch_db(monkeypatch: pytest.MonkeyPatch, db: MagicMock) -> None:
    monkeypatch.setattr(mongodb_singleton, "get_database", lambda: db)


# ---------------------------------------------------------------------------
# change_user_role — audit trail (Fix 1)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_change_user_role_writes_audit_entry_with_actor_and_before_after(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    before = _target_doc(role=UserRole.USER.value)
    after = _target_doc(role=UserRole.MODERATOR.value)
    db = _make_fake_db([before, after])
    _patch_db(monkeypatch, db)

    actor = _actor(UserRole.SUPER_ADMIN)
    result = await UserService.change_user_role(TARGET_USER_ID, UserRole.MODERATOR, actor)

    assert result.role == UserRole.MODERATOR

    db.admin_audit_log.insert_one.assert_awaited_once()
    (entry,), _ = db.admin_audit_log.insert_one.await_args
    assert entry["action"] == "user.role.changed"
    assert entry["targetUserId"] == TARGET_USER_ID
    assert entry["targetUserEmail"] == TARGET_EMAIL
    # The whole point is answering "who granted this" — actor must be present.
    assert entry["performedBy"] == ACTOR_USER_ID
    assert entry["performedByEmail"] == ACTOR_EMAIL
    assert entry["details"]["before"] == UserRole.USER.value
    assert entry["details"]["after"] == UserRole.MODERATOR.value
    assert "timestamp" in entry


@pytest.mark.asyncio
async def test_change_user_role_raises_404_and_writes_no_audit_entry_when_target_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = _make_fake_db([None])
    _patch_db(monkeypatch, db)

    actor = _actor(UserRole.SUPER_ADMIN)
    with pytest.raises(HTTPException) as exc:
        await UserService.change_user_role(TARGET_USER_ID, UserRole.MODERATOR, actor)

    assert exc.value.status_code == 404
    db.admin_audit_log.insert_one.assert_not_awaited()


# ---------------------------------------------------------------------------
# activate_user / deactivate_user — super_admin-target guard (Fix 4)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_activate_user_blocks_admin_from_activating_a_super_admin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    target = _target_doc(role=UserRole.SUPER_ADMIN.value, isActive=False)
    db = _make_fake_db([target])
    _patch_db(monkeypatch, db)

    actor = _actor(UserRole.ADMIN)  # plain admin, not super_admin
    with pytest.raises(HTTPException) as exc:
        await UserService.activate_user(TARGET_USER_ID, actor)

    assert exc.value.status_code == 403
    db.users.update_one.assert_not_awaited()
    db.admin_audit_log.insert_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_deactivate_user_blocks_admin_from_deactivating_a_super_admin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    target = _target_doc(role=UserRole.SUPER_ADMIN.value, isActive=True)
    db = _make_fake_db([target])
    _patch_db(monkeypatch, db)

    actor = _actor(UserRole.ADMIN)
    with pytest.raises(HTTPException) as exc:
        await UserService.deactivate_user(TARGET_USER_ID, actor)

    assert exc.value.status_code == 403
    db.users.update_one.assert_not_awaited()
    db.refresh_tokens.update_many.assert_not_awaited()
    db.admin_audit_log.insert_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_super_admin_actor_can_activate_another_super_admin_and_it_is_audited(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    before = _target_doc(role=UserRole.SUPER_ADMIN.value, isActive=False)
    after = _target_doc(role=UserRole.SUPER_ADMIN.value, isActive=True)
    db = _make_fake_db([before, after])
    _patch_db(monkeypatch, db)

    actor = _actor(UserRole.SUPER_ADMIN)
    result = await UserService.activate_user(TARGET_USER_ID, actor)

    assert result.isActive is True
    db.users.update_one.assert_awaited_once()

    db.admin_audit_log.insert_one.assert_awaited_once()
    (entry,), _ = db.admin_audit_log.insert_one.await_args
    assert entry["action"] == "user.activated"
    assert entry["performedBy"] == ACTOR_USER_ID
    assert entry["targetUserId"] == TARGET_USER_ID
    assert entry["details"]["before"] == {"isActive": False}
    assert entry["details"]["after"] == {"isActive": True}


@pytest.mark.asyncio
async def test_admin_can_activate_a_non_super_admin_and_it_is_audited(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    before = _target_doc(role=UserRole.USER.value, isActive=False)
    after = _target_doc(role=UserRole.USER.value, isActive=True)
    db = _make_fake_db([before, after])
    _patch_db(monkeypatch, db)

    actor = _actor(UserRole.ADMIN)
    result = await UserService.activate_user(TARGET_USER_ID, actor)

    assert result.isActive is True
    db.admin_audit_log.insert_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_deactivate_user_still_revokes_refresh_tokens_when_allowed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    before = _target_doc(role=UserRole.USER.value, isActive=True)
    after = _target_doc(role=UserRole.USER.value, isActive=False)
    db = _make_fake_db([before, after])
    _patch_db(monkeypatch, db)

    actor = _actor(UserRole.ADMIN)
    result = await UserService.deactivate_user(TARGET_USER_ID, actor)

    assert result.isActive is False
    db.refresh_tokens.update_many.assert_awaited_once()
    db.admin_audit_log.insert_one.assert_awaited_once()
    (entry,), _ = db.admin_audit_log.insert_one.await_args
    assert entry["action"] == "user.deactivated"
