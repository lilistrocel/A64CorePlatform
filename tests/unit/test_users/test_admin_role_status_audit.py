"""
Unit tests for `PATCH /api/v1/admin/users/{id}/role` and
`PATCH /api/v1/admin/users/{id}/status` — Fix 1's audit trail on the
`api/v1/admin.py` write paths (the sibling of `UserService.change_user_role`
/ `activate_user` / `deactivate_user`, which are covered separately in
test_user_service_role_activation_audit.py).

Both endpoints previously did a bare `db.users.update_one` plus a
`logger.info` and wrote nothing to `admin_audit_log`. These tests pin that
each endpoint now writes exactly one entry recording the actor (userId +
email), the target (userId + email), and the before/after value.

No live database: `db.users` / `db.admin_audit_log` are hand-built
AsyncMock collections, following the `_make_fake_db` / `_patch_db`
precedent in tests/unit/test_deployment_settings/test_admin_routes.py
(same admin router, same "mock the module's own imported names" approach).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import src.api.v1.admin as admin_module
from src.middleware.auth import get_current_user
from src.models.user import UserResponse, UserRole

TARGET_USER_ID = "user-target-1"
TARGET_EMAIL = "target@example.com"
ACTOR_USER_ID = "user-actor-1"
ACTOR_EMAIL = "actor@example.com"


def _fake_user(role: UserRole, user_id: str = ACTOR_USER_ID, email: str = ACTOR_EMAIL) -> UserResponse:
    now = datetime(2026, 1, 1)
    return UserResponse(
        userId=user_id,
        email=email,
        firstName="Actor",
        lastName="User",
        role=role,
        isActive=True,
        isEmailVerified=True,
        lastLoginAt=None,
        createdAt=now,
        updatedAt=now,
    )


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
        "phone": None,
        "avatar": None,
        "timezone": None,
        "locale": None,
        "lastLoginAt": None,
        "createdAt": now,
        "updatedAt": now,
        "deletedAt": None,
        "authProvider": "password",
        "nameAutoDerived": False,
    }
    doc.update(overrides)
    return doc


def _make_fake_db(find_one_sequence: list) -> MagicMock:
    db = MagicMock()
    db.users = MagicMock()
    db.users.find_one = AsyncMock(side_effect=find_one_sequence)
    db.users.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
    db.admin_audit_log = MagicMock()
    db.admin_audit_log.insert_one = AsyncMock()
    return db


@pytest.fixture
def app() -> FastAPI:
    fastapi_app = FastAPI()
    fastapi_app.include_router(admin_module.router, prefix="/api/v1")
    return fastapi_app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# PATCH /admin/users/{id}/role
# ---------------------------------------------------------------------------


def test_role_update_writes_audit_entry_with_actor_and_before_after(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    actor = _fake_user(UserRole.SUPER_ADMIN)
    app.dependency_overrides[get_current_user] = lambda: actor

    before = _target_doc(role=UserRole.USER.value)
    after = _target_doc(role=UserRole.MODERATOR.value)
    db = _make_fake_db([before, after])
    monkeypatch.setattr(admin_module.mongodb, "get_database", lambda: db)

    resp = client.patch(
        f"/api/v1/admin/users/{TARGET_USER_ID}/role", json={"role": "moderator"}
    )

    assert resp.status_code == 200
    db.admin_audit_log.insert_one.assert_awaited_once()
    (entry,), _ = db.admin_audit_log.insert_one.await_args
    assert entry["action"] == "user.role.changed"
    assert entry["targetUserId"] == TARGET_USER_ID
    assert entry["targetUserEmail"] == TARGET_EMAIL
    assert entry["performedBy"] == ACTOR_USER_ID
    assert entry["performedByEmail"] == ACTOR_EMAIL
    assert entry["details"]["before"] == UserRole.USER.value
    assert entry["details"]["after"] == UserRole.MODERATOR.value


# ---------------------------------------------------------------------------
# PATCH /admin/users/{id}/status
# ---------------------------------------------------------------------------


def test_status_update_deactivate_writes_audit_entry(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    actor = _fake_user(UserRole.SUPER_ADMIN)
    app.dependency_overrides[get_current_user] = lambda: actor

    before = _target_doc(isActive=True)
    after = _target_doc(isActive=False)
    db = _make_fake_db([before, after])
    monkeypatch.setattr(admin_module.mongodb, "get_database", lambda: db)

    resp = client.patch(
        f"/api/v1/admin/users/{TARGET_USER_ID}/status", json={"isActive": False}
    )

    assert resp.status_code == 200
    db.admin_audit_log.insert_one.assert_awaited_once()
    (entry,), _ = db.admin_audit_log.insert_one.await_args
    assert entry["action"] == "user.deactivated"
    assert entry["performedBy"] == ACTOR_USER_ID
    assert entry["details"]["before"] == {"isActive": True}
    assert entry["details"]["after"] == {"isActive": False}


def test_status_update_activate_writes_audit_entry(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    actor = _fake_user(UserRole.SUPER_ADMIN)
    app.dependency_overrides[get_current_user] = lambda: actor

    before = _target_doc(isActive=False)
    after = _target_doc(isActive=True)
    db = _make_fake_db([before, after])
    monkeypatch.setattr(admin_module.mongodb, "get_database", lambda: db)

    resp = client.patch(
        f"/api/v1/admin/users/{TARGET_USER_ID}/status", json={"isActive": True}
    )

    assert resp.status_code == 200
    db.admin_audit_log.insert_one.assert_awaited_once()
    (entry,), _ = db.admin_audit_log.insert_one.await_args
    assert entry["action"] == "user.activated"


def test_status_update_still_blocks_admin_from_touching_super_admin_target(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Pre-existing guard on this endpoint (admin.py already had it) must
    still hold after adding audit logging around it — no audit entry should
    be written for a blocked attempt."""
    actor = _fake_user(UserRole.ADMIN, user_id="user-actor-2", email="admin2@example.com")
    app.dependency_overrides[get_current_user] = lambda: actor

    target = _target_doc(role=UserRole.SUPER_ADMIN.value, isActive=True)
    db = _make_fake_db([target])
    monkeypatch.setattr(admin_module.mongodb, "get_database", lambda: db)

    resp = client.patch(
        f"/api/v1/admin/users/{TARGET_USER_ID}/status", json={"isActive": False}
    )

    assert resp.status_code == 403
    db.users.update_one.assert_not_awaited()
    db.admin_audit_log.insert_one.assert_not_awaited()
