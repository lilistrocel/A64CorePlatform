"""
Unit tests for T-929 — verification/reset emails silently claimed success
even though `src/utils/email.py` never actually sent anything outside
`ENVIRONMENT == "development"`, and did not even log the link there, so the
link was unrecoverable and every caller ("Verification email sent to: ...")
logged a lie.

Design reference: the prior "honest-email-state" fix (commit 55c0dc9)
established `settings.EMAIL_DELIVERY_CONFIGURED` and made the AUTHENTICATED
`POST /send-verification-email` endpoint report `delivered: "false"` when no
provider is configured. That fix left `src/utils/email.py` untouched — it
still returned `True` unconditionally and, outside development, logged
nothing at all. This file covers the follow-up:

  1. `send_email_verification` / `send_password_reset` / `send_welcome_email`
     all return `False` (not delivered) when `EMAIL_DELIVERY_CONFIGURED` is
     False, in BOTH `ENVIRONMENT=development` and a non-development
     environment. This is the core regression: the old code returned `True`
     in both.
  2. The human-readable link/content is logged at INFO in every
     environment, so it stays recoverable from the API log even with no
     provider configured.
  3. A configured-but-unimplemented provider (`EMAIL_PROVIDER` set, but
     `email._dispatch` has no branch for it) logs at ERROR and still
     returns `False` — a misconfiguration must be visible, not silent.
  4. `AuthService`'s log lines after calling these helpers reflect the real
     returned outcome, not a hardcoded "sent" message.
  5. The anonymous `POST /request-password-reset` endpoint's response is
     byte-identical for a known vs. an unknown email, and is unaffected by
     whatever `send_password_reset` returns — the anti-enumeration property
     this endpoint exists for must survive this change untouched.

No live database: DB-touching tests use a hand-built fake `db.users` /
`db.verification_tokens` (AsyncMock methods), following the
`_make_fake_db` / `_patch_db` precedent in
tests/unit/test_auth/test_login_pending_activation.py. No real email is
sent anywhere in this file — `EMAIL_PROVIDER` is only ever set to the
fictitious value "sendgrid" to exercise the "configured but unimplemented"
branch; `_dispatch` never reaches a network call for any EMAIL_PROVIDER
value, by construction (no provider branch exists yet).
"""

from __future__ import annotations

import importlib
import logging
from datetime import datetime
from typing import Any, Dict, Optional
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import src.api.v1.auth as auth_module
from src.config.settings import settings
from src.services.auth_service import AuthService
from src.services.database import mongodb as mongodb_singleton
from src.utils import email as email_module
from src.utils.security import hash_password

# Reason: `src/services/__init__.py` does `from .auth_service import
# auth_service` — that rebinds the attribute name `auth_service` on the
# `src.services` PACKAGE object to the AuthService *singleton instance*,
# shadowing the submodule of the same name for attribute access. Both
# pytest's `monkeypatch.setattr("src.services.auth_service.X", ...)` string
# resolution AND plain `import src.services.auth_service as m` (the dotted
# `as` form walks getattr, not sys.modules) land on that same shadowed
# attribute — so either one silently resolves to the singleton instance
# (which has no `send_email_verification` attribute) instead of the
# submodule. `importlib.import_module` goes straight through `sys.modules`
# and is not fooled by the attribute shadowing, so it is used below to get
# the real submodule object to patch functions on.
auth_service_module = importlib.import_module("src.services.auth_service")

PASSWORD = "CorrectHorse123!"


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _user_doc(**overrides: Any) -> Dict[str, Any]:
    now = datetime.utcnow()
    doc: Dict[str, Any] = {
        "userId": "user-t929-1",
        "email": "t929.user@example.com",
        "passwordHash": hash_password(PASSWORD),
        "firstName": "Nine",
        "lastName": "TwoNine",
        "role": "user",
        "isActive": True,
        "isEmailVerified": False,
        "createdAt": now,
        "updatedAt": now,
    }
    doc.update(overrides)
    return doc


def _make_fake_db(user_doc: Optional[Dict[str, Any]]) -> MagicMock:
    db = MagicMock()
    db.users = MagicMock()
    db.users.find_one = AsyncMock(return_value=user_doc)
    db.users.update_one = AsyncMock()
    db.verification_tokens = MagicMock()
    db.verification_tokens.insert_one = AsyncMock()
    db.verification_tokens.update_one = AsyncMock()
    return db


def _patch_db(monkeypatch: pytest.MonkeyPatch, db: MagicMock) -> None:
    monkeypatch.setattr(mongodb_singleton, "get_database", lambda: db)


def _unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "")


def _configured_unimplemented(monkeypatch: pytest.MonkeyPatch) -> None:
    # Reason: exercises the "operator declared a provider, but email.py has
    # no branch for it" misconfiguration path. This never results in a real
    # send — _dispatch has no implemented provider branch for any value.
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "sendgrid")


# ---------------------------------------------------------------------------
# 1 + 2. The three helpers: not-delivered when unconfigured, in both
#         ENVIRONMENT=development and a non-development environment; link
#         always logged.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("environment", ["development", "production"])
async def test_send_email_verification_not_delivered_when_unconfigured(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    environment: str,
) -> None:
    _unconfigured(monkeypatch)
    monkeypatch.setattr(settings, "ENVIRONMENT", environment)

    with caplog.at_level(logging.INFO):
        result = await email_module.send_email_verification(
            email="verify.me@example.com",
            token="tok-verify-123",
            user_name="Verity",
        )

    assert result is False
    # The link must be recoverable from the log regardless of environment.
    assert "tok-verify-123" in caplog.text
    assert "verify.me@example.com" in caplog.text


@pytest.mark.asyncio
@pytest.mark.parametrize("environment", ["development", "production"])
async def test_send_password_reset_not_delivered_when_unconfigured(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    environment: str,
) -> None:
    _unconfigured(monkeypatch)
    monkeypatch.setattr(settings, "ENVIRONMENT", environment)

    with caplog.at_level(logging.INFO):
        result = await email_module.send_password_reset(
            email="reset.me@example.com",
            token="tok-reset-456",
            user_name="Reese",
        )

    assert result is False
    assert "tok-reset-456" in caplog.text
    assert "reset.me@example.com" in caplog.text


@pytest.mark.asyncio
@pytest.mark.parametrize("environment", ["development", "production"])
async def test_send_welcome_email_not_delivered_when_unconfigured(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    environment: str,
) -> None:
    _unconfigured(monkeypatch)
    monkeypatch.setattr(settings, "ENVIRONMENT", environment)

    with caplog.at_level(logging.INFO):
        result = await email_module.send_welcome_email(
            email="welcome.me@example.com",
            user_name="Wel",
        )

    assert result is False
    assert "welcome.me@example.com" in caplog.text
    assert "Welcome to A64 Core Platform" in caplog.text


@pytest.mark.asyncio
async def test_unconfigured_delivery_logs_at_info_not_error(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    # Reason: "no provider configured yet" is an expected, common state on
    # ops-only deployments — it must not read as an application error.
    _unconfigured(monkeypatch)
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")

    with caplog.at_level(logging.INFO):
        await email_module.send_email_verification(
            email="quiet@example.com", token="tok-quiet", user_name="Q"
        )

    error_records = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert error_records == []


# ---------------------------------------------------------------------------
# 3. Configured but unimplemented provider -> ERROR + not delivered
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_configured_unimplemented_provider_logs_error_and_fails(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    _configured_unimplemented(monkeypatch)
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")

    with caplog.at_level(logging.INFO):
        result = await email_module.send_password_reset(
            email="misconfigured@example.com",
            token="tok-misconfig",
            user_name="Mis",
        )

    assert result is False
    error_records = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert len(error_records) == 1
    assert "sendgrid" in error_records[0].message.lower()
    assert "misconfigured@example.com" in error_records[0].message
    # The link is still recoverable even though delivery is misconfigured.
    assert "tok-misconfig" in caplog.text


# ---------------------------------------------------------------------------
# 4. AuthService log lines reflect the real returned outcome
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_verification_email_logs_not_delivered(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    user_doc = _user_doc(isEmailVerified=False)
    db = _make_fake_db(user_doc)
    _patch_db(monkeypatch, db)
    monkeypatch.setattr(
        auth_service_module,
        "send_email_verification",
        AsyncMock(return_value=False),
    )

    with caplog.at_level(logging.INFO):
        result = await AuthService.send_verification_email(user_doc["userId"])

    # Operation itself still completes (token generated + stored) — only
    # the log line's honesty is under test here.
    assert result is True
    assert "NOT delivered" in caplog.text
    assert "Verification email sent to" not in caplog.text


@pytest.mark.asyncio
async def test_send_verification_email_logs_delivered(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    user_doc = _user_doc(isEmailVerified=False)
    db = _make_fake_db(user_doc)
    _patch_db(monkeypatch, db)
    monkeypatch.setattr(
        auth_service_module,
        "send_email_verification",
        AsyncMock(return_value=True),
    )

    with caplog.at_level(logging.INFO):
        await AuthService.send_verification_email(user_doc["userId"])

    assert f"Verification email sent to: {user_doc['email']}" in caplog.text
    assert "NOT delivered" not in caplog.text


@pytest.mark.asyncio
async def test_request_password_reset_logs_not_delivered_for_existing_user(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    user_doc = _user_doc(isActive=True)
    db = _make_fake_db(user_doc)
    _patch_db(monkeypatch, db)
    monkeypatch.setattr(
        auth_service_module,
        "send_password_reset",
        AsyncMock(return_value=False),
    )

    with caplog.at_level(logging.INFO):
        result = await AuthService.request_password_reset(user_doc["email"])

    assert result is True
    assert "NOT delivered" in caplog.text
    assert f"Password reset email sent to: {user_doc['email']}" not in caplog.text


@pytest.mark.asyncio
async def test_verify_email_logs_welcome_not_delivered(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    from src.utils.security import create_verification_token

    user_doc = _user_doc(isEmailVerified=False)
    token, token_id = create_verification_token(
        user_id=user_doc["userId"],
        email=user_doc["email"],
        token_type="email_verification",
    )
    token_doc = {
        "tokenId": token_id,
        "isUsed": False,
        "expiresAt": datetime(2999, 1, 1),
    }

    db = MagicMock()
    db.users = MagicMock()
    # First find_one: not used for token lookup; verify_email fetches user
    # again after marking verified. Both calls return the same doc here.
    db.users.find_one = AsyncMock(return_value=user_doc)
    db.users.update_one = AsyncMock(return_value=MagicMock(matched_count=1))
    db.verification_tokens = MagicMock()
    db.verification_tokens.find_one = AsyncMock(return_value=token_doc)
    db.verification_tokens.update_one = AsyncMock()
    _patch_db(monkeypatch, db)

    monkeypatch.setattr(
        auth_service_module,
        "send_welcome_email",
        AsyncMock(return_value=False),
    )

    with caplog.at_level(logging.INFO):
        await AuthService.verify_email(token)

    assert "Welcome email NOT delivered" in caplog.text


# ---------------------------------------------------------------------------
# 5. Anonymous POST /request-password-reset stays anti-enumeration-safe
# ---------------------------------------------------------------------------


@pytest.fixture()
def auth_client() -> TestClient:
    app = FastAPI()
    app.include_router(auth_module.router)
    with TestClient(app) as c:
        yield c


@pytest.mark.asyncio
async def test_request_password_reset_response_identical_known_vs_unknown(
    monkeypatch: pytest.MonkeyPatch, auth_client: TestClient
) -> None:
    known_doc = _user_doc(email="known@example.com", isActive=True)

    async def _fake_send_password_reset(*args: Any, **kwargs: Any) -> bool:
        # Delivery outcome must not leak into the response either.
        return False

    monkeypatch.setattr(
        auth_service_module, "send_password_reset", _fake_send_password_reset
    )

    # Known email -> real DB path.
    db_known = _make_fake_db(known_doc)
    monkeypatch.setattr(mongodb_singleton, "get_database", lambda: db_known)
    resp_known = auth_client.post(
        "/request-password-reset", json={"email": "known@example.com"}
    )

    # Unknown email -> no matching user.
    db_unknown = _make_fake_db(None)
    monkeypatch.setattr(mongodb_singleton, "get_database", lambda: db_unknown)
    resp_unknown = auth_client.post(
        "/request-password-reset", json={"email": "unknown@example.com"}
    )

    assert resp_known.status_code == resp_unknown.status_code == 200
    assert resp_known.json() == resp_unknown.json()
    assert resp_known.headers.get("content-length") == resp_unknown.headers.get(
        "content-length"
    )
