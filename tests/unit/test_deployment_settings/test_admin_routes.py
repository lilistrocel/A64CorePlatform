"""
Unit tests for `GET`/`PATCH /api/v1/admin/deployment-settings`.

`deployment_settings_service` itself is exhaustively unit-tested in
test_deployment_settings_service.py — these tests instead pin the HTTP
CONTRACT the frontend agent needs: super_admin-only, the exact masking
shape for `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD`, and that guardrail
failures raised by the service (401/409/422) reach the client as the
identical status code.

Mounts only the admin router and monkeypatches
`admin_module.deployment_settings_service.{get_resolved,update}` — the same
"mock the module's own imported names" approach
`tests/unit/test_organizations/test_modules_route.py` uses.
"""

from datetime import datetime
from typing import Any, Dict
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

import src.api.v1.admin as admin_module
import src.services.deployment_settings_service as deployment_settings_service
from src.middleware.auth import get_current_user
from src.models.user import UserResponse, UserRole


def _fake_user(role: UserRole) -> UserResponse:
    return UserResponse(
        email="actor@example.com",
        firstName="Actor",
        lastName="User",
        userId="user-actor-1",
        role=role,
        isActive=True,
        isEmailVerified=True,
        lastLoginAt=None,
        createdAt=datetime(2026, 1, 1),
        updatedAt=datetime(2026, 1, 1),
    )


@pytest.fixture
def app() -> FastAPI:
    fastapi_app = FastAPI()
    fastapi_app.include_router(admin_module.router, prefix="/api/v1")
    return fastapi_app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    with TestClient(app) as c:
        yield c


def _resolved(**overrides: Any) -> Dict[str, deployment_settings_service.ResolvedSetting]:
    RS = deployment_settings_service.ResolvedSetting
    base: Dict[str, Any] = {
        "PUBLIC_BASE_URL": RS(value="https://dev.a20core.com", source="env", editable=False),
        "FRONTEND_URL": RS(value="http://localhost:3000", source="unset", editable=True),
        "CF_ACCESS_ENABLED": RS(value=False, source="unset", editable=True),
        "CF_ACCESS_TEAM_DOMAIN": RS(value="", source="unset", editable=True),
        "CF_ACCESS_AUD": RS(value="", source="unset", editable=True),
        "CF_ACCESS_EXCLUSIVE": RS(value=False, source="unset", editable=True),
        "CF_ACCESS_JIT_PROVISION": RS(value=True, source="unset", editable=True),
        "CF_ACCESS_DEFAULT_ROLE": RS(value="user", source="unset", editable=True),
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# GET
# ---------------------------------------------------------------------------


def test_get_non_super_admin_is_rejected(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    app.dependency_overrides[get_current_user] = lambda: _fake_user(UserRole.ADMIN)
    get_resolved_mock = AsyncMock()
    monkeypatch.setattr(admin_module.deployment_settings_service, "get_resolved", get_resolved_mock)

    resp = client.get("/api/v1/admin/deployment-settings")
    assert resp.status_code == 403
    get_resolved_mock.assert_not_called()


def test_get_masks_team_domain_and_aud_and_reflects_env_pinning(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    app.dependency_overrides[get_current_user] = lambda: _fake_user(UserRole.SUPER_ADMIN)
    RS = deployment_settings_service.ResolvedSetting
    resolved = _resolved(
        CF_ACCESS_TEAM_DOMAIN=RS(value="myteam.cloudflareaccess.com", source="db", editable=True),
        CF_ACCESS_AUD=RS(value="abcd1234efgh5678", source="db", editable=True),
    )
    monkeypatch.setattr(
        admin_module.deployment_settings_service, "get_resolved", AsyncMock(return_value=resolved)
    )

    resp = client.get("/api/v1/admin/deployment-settings")
    assert resp.status_code == 200, resp.text
    body = resp.json()["settings"]

    # PUBLIC_BASE_URL is env-pinned on this box: full value shown, not editable.
    assert body["PUBLIC_BASE_URL"]["value"] == "https://dev.a20core.com"
    assert body["PUBLIC_BASE_URL"]["source"] == "env"
    assert body["PUBLIC_BASE_URL"]["editable"] is False

    # Secrets: never the full value, only isSet + a last-4-char hint.
    for key, expected_hint in (
        ("CF_ACCESS_TEAM_DOMAIN", "****.com"),
        ("CF_ACCESS_AUD", "****5678"),
    ):
        item = body[key]
        assert item.get("value") is None
        assert item["isSet"] is True
        assert item["maskedHint"] == expected_hint

    full_body_text = resp.text
    assert "myteam.cloudflareaccess.com" not in full_body_text
    assert "abcd1234efgh5678" not in full_body_text


def test_get_reports_unset_secret_without_a_masked_hint(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    app.dependency_overrides[get_current_user] = lambda: _fake_user(UserRole.SUPER_ADMIN)
    monkeypatch.setattr(
        admin_module.deployment_settings_service, "get_resolved", AsyncMock(return_value=_resolved())
    )

    resp = client.get("/api/v1/admin/deployment-settings")
    body = resp.json()["settings"]
    assert body["CF_ACCESS_AUD"]["isSet"] is False
    assert body["CF_ACCESS_AUD"]["maskedHint"] is None
    assert body["CF_ACCESS_TEAM_DOMAIN"]["isSet"] is False


# ---------------------------------------------------------------------------
# PATCH
# ---------------------------------------------------------------------------


def test_patch_non_super_admin_is_rejected_before_touching_service(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    app.dependency_overrides[get_current_user] = lambda: _fake_user(UserRole.ADMIN)
    update_mock = AsyncMock()
    monkeypatch.setattr(admin_module.deployment_settings_service, "update", update_mock)

    resp = client.patch(
        "/api/v1/admin/deployment-settings",
        json={"currentPassword": "whatever", "changes": {"FRONTEND_URL": "https://x.example.com"}},
    )
    assert resp.status_code == 403
    update_mock.assert_not_called()


def test_patch_forwards_changes_and_actor_to_the_service(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    app.dependency_overrides[get_current_user] = lambda: _fake_user(UserRole.SUPER_ADMIN)
    RS = deployment_settings_service.ResolvedSetting
    update_mock = AsyncMock(
        return_value=_resolved(
            FRONTEND_URL=RS(value="https://new.example.com", source="db", editable=True)
        )
    )
    monkeypatch.setattr(admin_module.deployment_settings_service, "update", update_mock)

    resp = client.patch(
        "/api/v1/admin/deployment-settings",
        json={
            "currentPassword": "correct-password",
            "changes": {"FRONTEND_URL": "https://new.example.com"},
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["settings"]["FRONTEND_URL"]["value"] == "https://new.example.com"

    update_mock.assert_awaited_once()
    _, call_kwargs = update_mock.await_args
    assert call_kwargs["changes"] == {"FRONTEND_URL": "https://new.example.com"}
    assert call_kwargs["actor_user_id"] == "user-actor-1"
    assert call_kwargs["actor_email"] == "actor@example.com"
    assert call_kwargs["current_password"] == "correct-password"


@pytest.mark.parametrize("service_status", [401, 409, 422])
def test_patch_forwards_service_guardrail_failures_as_the_same_status(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch, service_status: int
) -> None:
    app.dependency_overrides[get_current_user] = lambda: _fake_user(UserRole.SUPER_ADMIN)
    update_mock = AsyncMock(
        side_effect=HTTPException(status_code=service_status, detail="guardrail failed")
    )
    monkeypatch.setattr(admin_module.deployment_settings_service, "update", update_mock)

    resp = client.patch(
        "/api/v1/admin/deployment-settings",
        json={"currentPassword": "whatever", "changes": {"CF_ACCESS_EXCLUSIVE": True}},
    )
    assert resp.status_code == service_status
