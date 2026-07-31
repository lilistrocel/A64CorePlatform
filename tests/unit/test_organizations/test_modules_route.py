"""
Unit tests for `PATCH /api/v1/organizations/{org_id}/modules`, specifically
the parts added to make `PublicInfoPageConfig.enabled` operable:

- non-super_admin callers are rejected (same permission model as the
  pre-existing `financeEnabled` toggle)
- the audit log entry records the before/after `modules` state (and the
  raw patch) so a later reader can reconstruct exactly what changed —
  not merely that *something* changed

These tests mount only the `organizations` router in a bare `FastAPI` app
and monkeypatch the module-level collaborators (`organization_service`,
`mongodb`, `get_redis_cache`, `invalidate_tenant_flag_cache`) — the same
"mock the module's own imported names" approach
`tests/unit/test_genetics/test_public_route.py` uses for
`public_module.OrganizationService`.
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.api.v1 import organizations as organizations_module
from src.middleware.auth import get_current_user
from src.models.organization import (
    OrganizationModules,
    OrganizationResponse,
    PublicInfoPageConfig,
)
from src.models.user import UserResponse, UserRole

ORG_ID = "org-test-123"


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


def _org_response(modules: OrganizationModules) -> OrganizationResponse:
    return OrganizationResponse(
        organizationId=ORG_ID,
        name="Test Org",
        slug="test-org",
        industries=[],
        logoUrl=None,
        modules=modules,
        isActive=True,
        createdAt=datetime(2026, 1, 1),
        updatedAt=datetime(2026, 1, 1),
    )


@pytest.fixture
def app() -> FastAPI:
    fastapi_app = FastAPI()
    fastapi_app.include_router(organizations_module.router, prefix="/api/v1")
    return fastapi_app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    with TestClient(app) as c:
        yield c


def _patch_redis_and_audit(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Stub out the Redis cache-invalidation path and return the mock
    `db` so a test can assert on `db.admin_audit_log.insert_one`."""
    redis_cache = MagicMock()
    redis_cache.is_available = False
    monkeypatch.setattr(
        organizations_module, "get_redis_cache", AsyncMock(return_value=redis_cache)
    )
    monkeypatch.setattr(
        organizations_module, "invalidate_tenant_flag_cache", AsyncMock()
    )

    db = MagicMock()
    db.admin_audit_log.insert_one = AsyncMock()
    monkeypatch.setattr(organizations_module.mongodb, "get_database", lambda: db)
    return db


def test_non_super_admin_is_rejected(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A plain ADMIN (not SUPER_ADMIN) must get 403 — same permission
    model as the pre-existing `financeEnabled` toggle (Wave 0 precedent)."""
    app.dependency_overrides[get_current_user] = lambda: _fake_user(UserRole.ADMIN)

    # Reason: service methods must not even be reached — assert-not-called
    # below proves the 403 happens before any DB access.
    monkeypatch.setattr(
        organizations_module.organization_service, "get_organization", AsyncMock()
    )
    monkeypatch.setattr(
        organizations_module.organization_service, "update_modules", AsyncMock()
    )

    resp = client.patch(
        f"/api/v1/organizations/{ORG_ID}/modules",
        json={"publicInfoPage": {"enabled": False}},
    )

    assert resp.status_code == 403, resp.text
    organizations_module.organization_service.get_organization.assert_not_called()
    organizations_module.organization_service.update_modules.assert_not_called()


def test_super_admin_toggle_persists_and_audit_log_records_before_after(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A SUPER_ADMIN flipping `publicInfoPage.enabled` off:
    - gets 200 with the new value reflected in the response
    - writes an audit entry whose `details.before`/`details.after` show
      the master switch flipping true -> false while the untouched
      `financeEnabled` and sibling `show*` flags stay identical, so the
      diff (not just "a change happened") is reconstructable later.
    """
    app.dependency_overrides[get_current_user] = lambda: _fake_user(
        UserRole.SUPER_ADMIN
    )
    db = _patch_redis_and_audit(monkeypatch)

    before_modules = OrganizationModules(
        financeEnabled=True,
        publicInfoPage=PublicInfoPageConfig(
            enabled=True, showOperatorName=True, showMediumIngredients=False
        ),
    )
    after_modules = OrganizationModules(
        financeEnabled=True,
        publicInfoPage=PublicInfoPageConfig(
            enabled=False, showOperatorName=True, showMediumIngredients=False
        ),
    )
    before = _org_response(before_modules)
    after = _org_response(after_modules)

    monkeypatch.setattr(
        organizations_module.organization_service,
        "get_organization",
        AsyncMock(return_value=before),
    )
    update_modules_mock = AsyncMock(return_value=after)
    monkeypatch.setattr(
        organizations_module.organization_service, "update_modules", update_modules_mock
    )

    resp = client.patch(
        f"/api/v1/organizations/{ORG_ID}/modules",
        json={"publicInfoPage": {"enabled": False}},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["modules"]["publicInfoPage"]["enabled"] is False
    assert body["modules"]["publicInfoPage"]["showOperatorName"] is True
    assert body["modules"]["financeEnabled"] is True

    # The service was handed the parsed partial-update object, not a full
    # PublicInfoPageConfig — proves the route forwards `data.publicInfoPage`
    # (the partial schema) rather than constructing/replacing a full one.
    update_modules_mock.assert_awaited_once()
    _, call_kwargs = update_modules_mock.await_args
    assert call_kwargs["organization_id"] == ORG_ID
    assert call_kwargs["financeEnabled"] is None
    assert call_kwargs["publicInfoPage"].enabled is False
    assert call_kwargs["publicInfoPage"].showOperatorName is None  # untouched -> not sent

    db.admin_audit_log.insert_one.assert_awaited_once()
    (audit_entry,), _ = db.admin_audit_log.insert_one.await_args
    assert audit_entry["action"] == "organization.modules.updated"
    assert audit_entry["targetOrganizationId"] == ORG_ID
    assert audit_entry["performedBy"] == "user-actor-1"
    assert audit_entry["performedByRole"] == "super_admin"

    details = audit_entry["details"]
    assert details["before"]["publicInfoPage"]["enabled"] is True
    assert details["after"]["publicInfoPage"]["enabled"] is False
    # Sibling flags provably unchanged in the recorded before/after, not
    # just the flag that moved.
    assert (
        details["before"]["publicInfoPage"]["showOperatorName"]
        == details["after"]["publicInfoPage"]["showOperatorName"]
        is True
    )
    assert details["before"]["financeEnabled"] == details["after"]["financeEnabled"] is True
    # The raw patch narrows to exactly what the caller sent.
    assert details["patch"] == {"publicInfoPage": {"enabled": False}}


def test_organization_not_found_returns_404(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    app.dependency_overrides[get_current_user] = lambda: _fake_user(
        UserRole.SUPER_ADMIN
    )
    monkeypatch.setattr(
        organizations_module.organization_service,
        "get_organization",
        AsyncMock(return_value=None),
    )
    resp = client.patch(
        f"/api/v1/organizations/{ORG_ID}/modules",
        json={"publicInfoPage": {"enabled": False}},
    )
    assert resp.status_code == 404
