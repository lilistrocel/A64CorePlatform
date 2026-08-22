"""
Unit tests for `POST /api/v1/users/{id}/activate` and `/deactivate` —
Fix 4's HTTP-layer wiring.

`UserService.activate_user` / `deactivate_user` are exhaustively unit-
tested (super_admin guard, audit log) in
test_user_service_role_activation_audit.py. These tests instead pin that
the route actually passes `current_user` through to the service — before
this fix, the route called `user_service.activate_user(user_id)` with NO
actor argument at all, so the service had no way to enforce the
super_admin-target guard or attribute an audit entry even after the
service itself gained that capability.

Mounts only the users router and monkeypatches `user_service.activate_user`
/ `deactivate_user` directly, following the "mock the module's own imported
names" approach in tests/unit/test_deployment_settings/test_admin_routes.py.
"""

from __future__ import annotations

from datetime import datetime
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

import src.api.v1.users as users_module
from src.middleware.permissions import require_admin
from src.models.user import UserResponse, UserRole


def _fake_user(role: UserRole, user_id: str = "user-actor-1") -> UserResponse:
    now = datetime(2026, 1, 1)
    return UserResponse(
        userId=user_id,
        email="actor@example.com",
        firstName="Actor",
        lastName="User",
        role=role,
        isActive=True,
        isEmailVerified=True,
        lastLoginAt=None,
        createdAt=now,
        updatedAt=now,
    )


@pytest.fixture
def app() -> FastAPI:
    fastapi_app = FastAPI()
    fastapi_app.include_router(users_module.router, prefix="/api/v1/users")
    return fastapi_app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    with TestClient(app) as c:
        yield c


def test_activate_route_passes_current_user_to_the_service(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    actor = _fake_user(UserRole.SUPER_ADMIN)
    app.dependency_overrides[require_admin] = lambda: actor

    activate_mock = AsyncMock(return_value=_fake_user(UserRole.USER, user_id="target-1"))
    monkeypatch.setattr(users_module.user_service, "activate_user", activate_mock)

    resp = client.post("/api/v1/users/target-1/activate")

    assert resp.status_code == 200
    activate_mock.assert_awaited_once_with("target-1", actor)


def test_deactivate_route_passes_current_user_to_the_service(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    actor = _fake_user(UserRole.SUPER_ADMIN)
    app.dependency_overrides[require_admin] = lambda: actor

    deactivate_mock = AsyncMock(return_value=_fake_user(UserRole.USER, user_id="target-1"))
    monkeypatch.setattr(users_module.user_service, "deactivate_user", deactivate_mock)

    resp = client.post("/api/v1/users/target-1/deactivate")

    assert resp.status_code == 200
    deactivate_mock.assert_awaited_once_with("target-1", actor)


def test_activate_route_surfaces_403_when_service_blocks_super_admin_target(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    actor = _fake_user(UserRole.ADMIN)
    app.dependency_overrides[require_admin] = lambda: actor

    activate_mock = AsyncMock(
        side_effect=HTTPException(
            status_code=403,
            detail="Only super admins can activate other super admin accounts",
        )
    )
    monkeypatch.setattr(users_module.user_service, "activate_user", activate_mock)

    resp = client.post("/api/v1/users/target-1/activate")

    assert resp.status_code == 403
    activate_mock.assert_awaited_once_with("target-1", actor)


def test_role_route_passes_current_user_to_the_service(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    actor = _fake_user(UserRole.SUPER_ADMIN)
    app.dependency_overrides[require_admin] = lambda: actor

    change_role_mock = AsyncMock(return_value=_fake_user(UserRole.MODERATOR, user_id="target-1"))
    monkeypatch.setattr(users_module.user_service, "change_user_role", change_role_mock)

    resp = client.patch("/api/v1/users/target-1/role", json={"role": "moderator"})

    assert resp.status_code == 200
    change_role_mock.assert_awaited_once_with("target-1", UserRole.MODERATOR, actor)
