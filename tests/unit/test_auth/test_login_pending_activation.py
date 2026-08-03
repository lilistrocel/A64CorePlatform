"""
Unit tests for the inactive-account 403 shape on the password login paths.

Before this change, a password-login attempt against an inactive account
got a flat `detail="Account is inactive"` string — a completely different
(and unhelpful) experience from the Cloudflare Access path
(`login_via_cf_access`), which already returned the structured
`{"detail": "...", "status": "pending_activation"}` shape the frontend uses
to show its "awaiting administrator approval" screen.

These tests pin:
1. `AuthService.login_user` (used by the legacy /login-without-MFA-check
   flow and directly) raises 403 with the shared `pending_activation` shape
   for an inactive account.
2. `AuthService.login_user_with_mfa_check` (what `POST /login` actually
   calls) does the same.
3. Both use the IDENTICAL message text (`PENDING_ACTIVATION_MESSAGE` /
   `pending_activation_exception()`), matching what
   `login_via_cf_access` raises — see test_cf_access.py's
   `test_existing_inactive_user_returns_pending` for the CF-side pin.
4. An active account is unaffected by this change — login proceeds
   normally (no MFA) or is challenged (MFA enabled), exactly as before.

No live database: `db.users` / `db.refresh_tokens` are hand-built fake
collections (AsyncMock methods), following the `_make_fake_db` / `_patch_db`
precedent in tests/unit/test_auth/test_cf_access.py and
tests/unit/test_organizations/test_modules_service.py — never mongomock,
never a real Mongo connection.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from src.models.user import MFALoginResponse, TokenResponse, UserLogin, UserRole
from src.services.auth_service import (
    PENDING_ACTIVATION_MESSAGE,
    AuthService,
    pending_activation_exception,
)
from src.services.database import mongodb as mongodb_singleton
from src.utils.security import hash_password

PASSWORD = "CorrectHorse123!"


def _user_doc(**overrides: Any) -> Dict[str, Any]:
    now = datetime.utcnow()
    doc: Dict[str, Any] = {
        "userId": "user-pw-1",
        "email": "password.user@example.com",
        "passwordHash": hash_password(PASSWORD),
        "firstName": "Pass",
        "lastName": "Word",
        "role": UserRole.USER.value,
        "isActive": True,
        "isEmailVerified": True,
        "mfaEnabled": False,
        "mfaSetupRequired": False,
        "authProvider": "password",
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
    }
    doc.update(overrides)
    return doc


def _make_fake_db(user_doc: Optional[Dict[str, Any]]) -> MagicMock:
    db = MagicMock()
    db.users = MagicMock()
    db.users.find_one = AsyncMock(return_value=user_doc)
    db.users.update_one = AsyncMock()
    db.refresh_tokens = MagicMock()
    db.refresh_tokens.insert_one = AsyncMock()
    db.mfa_pending_tokens = MagicMock()
    db.mfa_pending_tokens.insert_one = AsyncMock()
    return db


def _patch_db(monkeypatch: pytest.MonkeyPatch, db: MagicMock) -> None:
    monkeypatch.setattr(mongodb_singleton, "get_database", lambda: db)


# ---------------------------------------------------------------------------
# pending_activation_exception() itself — the shared factory
# ---------------------------------------------------------------------------


def test_pending_activation_exception_shape() -> None:
    exc = pending_activation_exception()
    assert exc.status_code == 403
    assert exc.detail == {
        "detail": PENDING_ACTIVATION_MESSAGE,
        "status": "pending_activation",
    }


def test_pending_activation_message_does_not_claim_a_specific_reason() -> None:
    # Reason: this app doesn't distinguish "never activated" from
    # "deactivated by an admin" — the message must not imply either.
    assert "awaiting" not in PENDING_ACTIVATION_MESSAGE.lower()
    assert "approval" not in PENDING_ACTIVATION_MESSAGE.lower()


# ---------------------------------------------------------------------------
# AuthService.login_user — inactive account
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_user_inactive_account_returns_pending_activation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_doc = _user_doc(isActive=False)
    db = _make_fake_db(user_doc)
    _patch_db(monkeypatch, db)

    credentials = UserLogin(email=user_doc["email"], password=PASSWORD)

    with pytest.raises(HTTPException) as exc:
        await AuthService.login_user(credentials)

    assert exc.value.status_code == 403
    assert exc.value.detail["status"] == "pending_activation"
    assert exc.value.detail["detail"] == PENDING_ACTIVATION_MESSAGE
    # Never reaches token issuance.
    db.refresh_tokens.insert_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_login_user_with_mfa_check_inactive_account_returns_pending_activation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_doc = _user_doc(isActive=False)
    db = _make_fake_db(user_doc)
    _patch_db(monkeypatch, db)

    credentials = UserLogin(email=user_doc["email"], password=PASSWORD)

    with pytest.raises(HTTPException) as exc:
        await AuthService.login_user_with_mfa_check(credentials)

    assert exc.value.status_code == 403
    assert exc.value.detail["status"] == "pending_activation"
    assert exc.value.detail["detail"] == PENDING_ACTIVATION_MESSAGE
    db.refresh_tokens.insert_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_inactive_account_rejected_before_password_is_even_checked(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """
    An inactive account gets the pending_activation shape regardless of
    whether the submitted password is correct — the account-state check
    happens first, matching the existing (pre-change) ordering.
    """
    user_doc = _user_doc(isActive=False)
    db = _make_fake_db(user_doc)
    _patch_db(monkeypatch, db)

    credentials = UserLogin(email=user_doc["email"], password="TotallyWrongPassword!1")

    with pytest.raises(HTTPException) as exc:
        await AuthService.login_user(credentials)

    assert exc.value.status_code == 403
    assert exc.value.detail["status"] == "pending_activation"


# ---------------------------------------------------------------------------
# Active account — unaffected by this change
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_user_active_account_no_mfa_still_issues_tokens(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_doc = _user_doc(isActive=True)
    db = _make_fake_db(user_doc)
    _patch_db(monkeypatch, db)

    credentials = UserLogin(email=user_doc["email"], password=PASSWORD)

    result = await AuthService.login_user(credentials)

    assert isinstance(result, TokenResponse)
    assert result.user.userId == user_doc["userId"]
    assert result.user.isActive is True
    db.refresh_tokens.insert_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_login_user_with_mfa_check_active_no_mfa_issues_tokens(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_doc = _user_doc(isActive=True, mfaEnabled=False)
    db = _make_fake_db(user_doc)
    _patch_db(monkeypatch, db)

    credentials = UserLogin(email=user_doc["email"], password=PASSWORD)

    result = await AuthService.login_user_with_mfa_check(credentials)

    assert isinstance(result, TokenResponse)
    db.refresh_tokens.insert_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_login_user_with_mfa_check_active_with_mfa_gets_challenge_not_tokens(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_doc = _user_doc(isActive=True, mfaEnabled=True)
    db = _make_fake_db(user_doc)
    _patch_db(monkeypatch, db)

    credentials = UserLogin(email=user_doc["email"], password=PASSWORD)

    result = await AuthService.login_user_with_mfa_check(credentials)

    assert isinstance(result, MFALoginResponse)
    assert result.mfaRequired is True
    db.mfa_pending_tokens.insert_one.assert_awaited_once()
    db.refresh_tokens.insert_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_login_user_wrong_password_still_401_when_active(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Guardrail: the pending_activation refactor must not have swallowed
    # the ordinary invalid-credentials path for an ACTIVE account.
    user_doc = _user_doc(isActive=True)
    db = _make_fake_db(user_doc)
    _patch_db(monkeypatch, db)

    credentials = UserLogin(email=user_doc["email"], password="WrongPassword123!")

    with pytest.raises(HTTPException) as exc:
        await AuthService.login_user(credentials)

    assert exc.value.status_code == 401
