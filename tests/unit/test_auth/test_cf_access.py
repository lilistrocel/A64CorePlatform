"""
Unit tests for Cloudflare Access authentication (dual-mode SSO).

Design reference: ~/.claude/plans/jolly-splashing-hennessy.md. That plan is
explicit that there is deliberately NO "skip verification" flag anywhere in
`services/cf_access_service.py` — adding one would violate CLAUDE.md's "no
quick hacks, no disabling checks temporarily" rule. Every JWT-verification
test below therefore signs and verifies a REAL token against a locally
generated RSA keypair, with `cf_access_service._fetch_jwks` monkeypatched to
stand in for the httpx call to Cloudflare's `/cdn-cgi/access/certs` — nothing
inside `verify_cf_access_token` itself is bypassed or short-circuited.

Covers, in order:
  1. `verify_cf_access_token` — valid, expired, wrong aud, wrong iss,
     malformed, algorithm-confusion (HS256 signed with the RSA public key),
     unknown `kid` (exactly one forced refresh).
  2. JWKS cache — TTL hit avoids a refetch; forced refresh is rate-limited
     to at most once per 60s.
  3. `get_cf_access_token` — header, cookie fallback, neither present.
  4. `is_local_request` — the break-glass discriminator.
  5. `AuthService.login_via_cf_access` — JIT provisioning on/off, existing
     inactive user, existing active user (tokens), existing active+MFA user
     (challenge, not tokens). Pins down that `mfaSetupRequired` is NEVER set
     True on the JIT path — the property that makes app MFA optional for
     Cloudflare-provisioned accounts.
  6. Endpoints — `/cf-access/session` 404 when disabled, 401 with no token;
     the break-glass gate on `POST /login` (accept without Cloudflare edge
     headers, 403 when `Cf-Ray` is present).
  7. `Settings.validate_cf_access_settings` — the boot-time fail-fast
     validator.

No live database: `AuthService.login_via_cf_access` is exercised against a
hand-built fake `db.users` / `db.refresh_tokens` / `db.mfa_pending_tokens`
(AsyncMock collections), following the `_patch_db` /
`monkeypatch.setattr("src....mongodb.get_database", ...)` precedent in
tests/unit/test_organizations/test_modules_service.py — never mongomock,
never a real Mongo connection.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from datetime import datetime
from typing import Any, Dict, Optional
from unittest.mock import AsyncMock, MagicMock

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from jose import jwk, jwt
from pydantic import ValidationError
from starlette.requests import Request

import src.api.v1.auth as auth_module
import src.middleware.cf_access as cf_access_middleware
import src.services.cf_access_service as cf_access_service
import src.services.deployment_settings_service as deployment_settings_service
from src.config.settings import Settings
from src.models.user import MFALoginResponse, TokenResponse, UserResponse, UserRole
from src.services.auth_service import AuthService
from src.services.cf_access_service import CFAccessIdentity, verify_cf_access_token
from src.services.database import mongodb as mongodb_singleton

TEAM_DOMAIN = "test-team.cloudflareaccess.com"
AUD = "test-aud-tag"
KID = "test-kid-1"
ISSUER = f"https://{TEAM_DOMAIN}"


# ---------------------------------------------------------------------------
# RSA keypair + JWT/JWK builders
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def rsa_keys() -> Dict[str, str]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return {"private": private_pem, "public": public_pem}


def _jwk_dict(public_pem: str, kid: str = KID) -> Dict[str, Any]:
    key_obj = jwk.construct(public_pem, algorithm="RS256")
    data = key_obj.to_dict()
    data["kid"] = kid
    return data


def _make_claims(**overrides: Any) -> Dict[str, Any]:
    claims = {
        "email": "scientist@example.com",
        "sub": "cf-sub-1",
        "exp": int(time.time()) + 3600,
        "aud": AUD,
        "iss": ISSUER,
        "identity_nonce": "nonce-1",
    }
    claims.update(overrides)
    return claims


def _sign(private_pem: str, claims: Dict[str, Any], kid: str = KID) -> str:
    return jwt.encode(claims, private_pem, algorithm="RS256", headers={"kid": kid})


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _manual_hs256_token(header: Dict[str, Any], payload: Dict[str, Any], secret: bytes) -> str:
    """
    Build a JWT by hand instead of via `jose.jwt.encode(..., algorithm="HS256")`
    — jose itself refuses to sign with an asymmetric-looking key as an HMAC
    secret (`JWKError: ... should not be used as an HMAC secret`), which
    would block the very attack this test needs to construct. Simulates an
    attacker who has the Cloudflare Access JWKS public key (public by
    definition — it is served at `/cdn-cgi/access/certs`) and tries to use
    it as an HS256 shared secret against a verifier that (incorrectly) does
    not pin the allowed algorithm.
    """
    header_b64 = _b64url(json.dumps(header, separators=(",", ":")).encode())
    payload_b64 = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header_b64}.{payload_b64}".encode()
    signature = hmac.new(secret, signing_input, hashlib.sha256).digest()
    return f"{header_b64}.{payload_b64}.{_b64url(signature)}"


# ---------------------------------------------------------------------------
# Autouse fixtures — team/AUD config, and resetting cf_access_service's
# module-level JWKS cache + forced-refresh rate limiter, which are process
# globals that would otherwise leak between tests.
# ---------------------------------------------------------------------------

# Deployment-settings-service-backed config used by cf_access_service.py,
# api/v1/auth.py, and services/auth_service.py — all three now resolve
# CF_ACCESS_* through `deployment_settings_service.get_value` instead of
# reading `settings.CF_ACCESS_*` directly (T-9xx deployment-settings
# runtime-configurability work). All three hold a reference to the SAME
# `src.services.deployment_settings_service` module object, so patching
# `deployment_settings_service.get_value` once here affects every consumer.
_DEFAULT_DEPLOYMENT_VALUES: Dict[str, Any] = {
    "CF_ACCESS_ENABLED": False,
    "CF_ACCESS_EXCLUSIVE": False,
    "CF_ACCESS_TEAM_DOMAIN": TEAM_DOMAIN,
    "CF_ACCESS_AUD": AUD,
    "CF_ACCESS_JIT_PROVISION": True,
    "CF_ACCESS_DEFAULT_ROLE": "user",
}


@pytest.fixture(autouse=True)
def _deployment_settings_stub(monkeypatch: pytest.MonkeyPatch) -> Dict[str, Any]:
    """
    Stubs `deployment_settings_service.get_value` so every consumer resolves
    against this in-memory dict instead of hitting Mongo. Tests that need a
    non-default value (e.g. CF_ACCESS_EXCLUSIVE=True) mutate the returned
    dict directly. `record_cf_access_login` is stubbed to a no-op AsyncMock
    so tests exercising the full-token-issuance branch of
    `AuthService.login_via_cf_access` don't need a `db.platform_settings`
    mock on top of the existing `db.users` / `db.refresh_tokens` fakes.
    """
    values = dict(_DEFAULT_DEPLOYMENT_VALUES)

    async def _fake_get_value(key: str) -> Any:
        return values[key]

    monkeypatch.setattr(deployment_settings_service, "get_value", _fake_get_value)
    monkeypatch.setattr(deployment_settings_service, "record_cf_access_login", AsyncMock())
    return values


@pytest.fixture(autouse=True)
def _reset_jwks_cache():
    cf_access_service._jwks_cache = {"keys": [], "fetched_at": 0.0}
    cf_access_service._last_forced_refresh_at = 0.0
    yield
    cf_access_service._jwks_cache = {"keys": [], "fetched_at": 0.0}
    cf_access_service._last_forced_refresh_at = 0.0


@pytest.fixture
def jwks_mock(monkeypatch: pytest.MonkeyPatch, rsa_keys: Dict[str, str]) -> AsyncMock:
    """Stands in for the httpx call to Cloudflare's `/cdn-cgi/access/certs`,
    returning the one real JWK. Call count is asserted directly by the
    cache/rate-limit tests below."""
    mock = AsyncMock(return_value=[_jwk_dict(rsa_keys["public"])])
    monkeypatch.setattr(cf_access_service, "_fetch_jwks", mock)
    return mock


# ---------------------------------------------------------------------------
# JWT verification
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_valid_token_is_accepted(jwks_mock: AsyncMock, rsa_keys: Dict[str, str]) -> None:
    token = _sign(rsa_keys["private"], _make_claims())
    identity = await verify_cf_access_token(token)
    assert identity.email == "scientist@example.com"
    assert identity.sub == "cf-sub-1"
    assert identity.identity_nonce == "nonce-1"


@pytest.mark.asyncio
async def test_expired_token_is_rejected(jwks_mock: AsyncMock, rsa_keys: Dict[str, str]) -> None:
    token = _sign(rsa_keys["private"], _make_claims(exp=int(time.time()) - 100))
    with pytest.raises(HTTPException) as exc:
        await verify_cf_access_token(token)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_wrong_audience_is_rejected(jwks_mock: AsyncMock, rsa_keys: Dict[str, str]) -> None:
    token = _sign(rsa_keys["private"], _make_claims(aud="some-other-application"))
    with pytest.raises(HTTPException) as exc:
        await verify_cf_access_token(token)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_wrong_issuer_is_rejected(jwks_mock: AsyncMock, rsa_keys: Dict[str, str]) -> None:
    token = _sign(rsa_keys["private"], _make_claims(iss="https://not-our-team.cloudflareaccess.com"))
    with pytest.raises(HTTPException) as exc:
        await verify_cf_access_token(token)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_malformed_token_is_rejected(jwks_mock: AsyncMock) -> None:
    with pytest.raises(HTTPException) as exc:
        await verify_cf_access_token("this.is.not.a.valid.jwt")
    assert exc.value.status_code == 401
    # Header parsing fails before the JWKS is ever consulted.
    jwks_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_algorithm_confusion_hs256_with_public_key_is_rejected(
    jwks_mock: AsyncMock, rsa_keys: Dict[str, str]
) -> None:
    """RS256 -> HS256 downgrade attack: sign with alg=HS256 using the
    (public, therefore attacker-known) RSA public key PEM as the HMAC
    secret. Must be rejected because `verify_cf_access_token` pins
    `algorithms=["RS256"]` on `jwt.decode` — the token header's claimed
    `alg` is never honoured."""
    token = _manual_hs256_token(
        {"alg": "HS256", "typ": "JWT", "kid": KID}, _make_claims(), rsa_keys["public"].encode()
    )
    with pytest.raises(HTTPException) as exc:
        await verify_cf_access_token(token)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_unknown_kid_triggers_exactly_one_forced_refresh_and_is_rejected(
    jwks_mock: AsyncMock, rsa_keys: Dict[str, str]
) -> None:
    # Pre-warm the cache with the real key so the initial (non-forced) lookup
    # is served from cache rather than a fetch — isolating the assertion to
    # the ONE forced refresh the unknown kid should trigger.
    cf_access_service._jwks_cache = {
        "keys": [_jwk_dict(rsa_keys["public"])],
        "fetched_at": time.monotonic(),
    }
    token = _sign(rsa_keys["private"], _make_claims(), kid="rotated-kid-not-in-cache")

    with pytest.raises(HTTPException) as exc:
        await verify_cf_access_token(token)
    assert exc.value.status_code == 401
    jwks_mock.assert_awaited_once()


# ---------------------------------------------------------------------------
# JWKS cache
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_second_verification_within_ttl_does_not_refetch(
    jwks_mock: AsyncMock, rsa_keys: Dict[str, str]
) -> None:
    token = _sign(rsa_keys["private"], _make_claims())
    await verify_cf_access_token(token)
    await verify_cf_access_token(token)
    jwks_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_forced_refresh_is_rate_limited_to_once_per_60s(
    jwks_mock: AsyncMock, rsa_keys: Dict[str, str]
) -> None:
    cf_access_service._jwks_cache = {
        "keys": [_jwk_dict(rsa_keys["public"])],
        "fetched_at": time.monotonic(),
    }
    token = _sign(rsa_keys["private"], _make_claims(), kid="rotated-kid-not-in-cache")

    with pytest.raises(HTTPException):
        await verify_cf_access_token(token)
    with pytest.raises(HTTPException):
        await verify_cf_access_token(token)

    # Two unknown-kid lookups back-to-back: only the FIRST one's forced
    # refresh actually reaches Cloudflare; the second falls inside the 60s
    # floor and reuses the (still-unknown-kid) cache.
    jwks_mock.assert_awaited_once()


# ---------------------------------------------------------------------------
# Token extraction — src/middleware/cf_access.py::get_cf_access_token
# ---------------------------------------------------------------------------


def _make_request(
    headers: Optional[Dict[str, str]] = None, cookies: Optional[Dict[str, str]] = None
) -> Request:
    header_list = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    if cookies:
        cookie_header = "; ".join(f"{k}={v}" for k, v in cookies.items())
        header_list.append((b"cookie", cookie_header.encode()))
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "query_string": b"",
        "headers": header_list,
        "server": ("testserver", 80),
        "client": ("testclient", 123),
        "scheme": "http",
    }
    return Request(scope)


def test_get_cf_access_token_reads_the_header() -> None:
    req = _make_request(headers={"Cf-Access-Jwt-Assertion": "header-token-value"})
    assert cf_access_middleware.get_cf_access_token(req) == "header-token-value"


def test_get_cf_access_token_falls_back_to_cookie_when_header_absent() -> None:
    req = _make_request(cookies={"CF_Authorization": "cookie-token-value"})
    assert cf_access_middleware.get_cf_access_token(req) == "cookie-token-value"


def test_get_cf_access_token_returns_none_when_neither_present() -> None:
    req = _make_request()
    assert cf_access_middleware.get_cf_access_token(req) is None


# ---------------------------------------------------------------------------
# is_local_request — the break-glass discriminator
# ---------------------------------------------------------------------------


def test_is_local_request_true_with_no_cloudflare_headers() -> None:
    assert cf_access_middleware.is_local_request(_make_request()) is True


def test_is_local_request_false_with_cf_ray_present() -> None:
    req = _make_request(headers={"cf-ray": "8c3f1a2b3c4d5e6f-SIN"})
    assert cf_access_middleware.is_local_request(req) is False


def test_is_local_request_false_with_cf_connecting_ip_present() -> None:
    req = _make_request(headers={"cf-connecting-ip": "203.0.113.7"})
    assert cf_access_middleware.is_local_request(req) is False


# ---------------------------------------------------------------------------
# AuthService.login_via_cf_access — fake db.users / db.refresh_tokens /
# db.mfa_pending_tokens collections, no live Mongo.
# ---------------------------------------------------------------------------


def _make_fake_db(user_doc: Optional[Dict[str, Any]]) -> MagicMock:
    db = MagicMock()
    db.users = MagicMock()
    db.users.find_one = AsyncMock(return_value=user_doc)
    db.users.insert_one = AsyncMock()
    db.users.update_one = AsyncMock()
    db.refresh_tokens = MagicMock()
    db.refresh_tokens.insert_one = AsyncMock()
    db.mfa_pending_tokens = MagicMock()
    db.mfa_pending_tokens.insert_one = AsyncMock()
    return db


def _patch_db(monkeypatch: pytest.MonkeyPatch, db: MagicMock) -> None:
    """
    Patches `get_database` directly on the shared `mongodb` singleton
    (`src.services.database.mongodb`) rather than via a dotted string target
    (the `src.services.organization_service.mongodb...` precedent in
    tests/unit/test_organizations/test_modules_service.py) — that string form
    resolves module attributes via `getattr`, and `src/services/__init__.py`
    re-exports `auth_service` as the singleton *instance*
    (`from .auth_service import auth_service, AuthService`), which shadows
    the `auth_service` submodule name at the package level and breaks the
    dotted-path walk. Patching the singleton object directly sidesteps that
    entirely and is exactly as effective, since every module (including
    `auth_service.py`) imports and calls this same `mongodb` instance.
    """
    monkeypatch.setattr(mongodb_singleton, "get_database", lambda: db)


def _active_user_doc(**overrides: Any) -> Dict[str, Any]:
    now = datetime.utcnow()
    doc: Dict[str, Any] = {
        "userId": "user-1",
        "email": "existing@example.com",
        "passwordHash": None,
        "firstName": "Existing",
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
        "organizationId": None,
        "divisionAccess": None,
        "defaultDivisionId": None,
    }
    doc.update(overrides)
    return doc


@pytest.mark.asyncio
async def test_unknown_email_with_jit_on_creates_pending_inactive_user(
    monkeypatch: pytest.MonkeyPatch,
    _deployment_settings_stub: Dict[str, Any],
) -> None:
    db = _make_fake_db(None)
    _patch_db(monkeypatch, db)
    _deployment_settings_stub["CF_ACCESS_JIT_PROVISION"] = True
    _deployment_settings_stub["CF_ACCESS_DEFAULT_ROLE"] = "user"

    identity = CFAccessIdentity(email="New.User@Example.com", sub="sub-x", exp=int(time.time()) + 3600)

    with pytest.raises(HTTPException) as exc:
        await AuthService.login_via_cf_access(identity)
    assert exc.value.status_code == 403
    assert exc.value.detail["status"] == "pending_activation"

    db.users.insert_one.assert_awaited_once()
    inserted = db.users.insert_one.await_args.args[0]
    assert inserted["email"] == "new.user@example.com"  # case-folded
    assert inserted["authProvider"] == "cloudflare_access"
    assert inserted["isActive"] is False
    assert inserted["isEmailVerified"] is True
    assert inserted["mfaEnabled"] is False
    # The property that makes app MFA optional for CF-provisioned accounts:
    # this must NEVER be True on the JIT path.
    assert inserted["mfaSetupRequired"] is False
    assert inserted["role"] == "user"
    assert inserted["passwordHash"] is None


@pytest.mark.asyncio
async def test_unknown_email_with_jit_off_returns_pending_without_creating_anything(
    monkeypatch: pytest.MonkeyPatch,
    _deployment_settings_stub: Dict[str, Any],
) -> None:
    db = _make_fake_db(None)
    _patch_db(monkeypatch, db)
    _deployment_settings_stub["CF_ACCESS_JIT_PROVISION"] = False

    identity = CFAccessIdentity(email="ghost@example.com", sub="sub-y", exp=int(time.time()) + 3600)

    with pytest.raises(HTTPException) as exc:
        await AuthService.login_via_cf_access(identity)
    assert exc.value.status_code == 403
    assert exc.value.detail["status"] == "pending_activation"
    db.users.insert_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_existing_inactive_user_returns_pending(monkeypatch: pytest.MonkeyPatch) -> None:
    user_doc = _active_user_doc(isActive=False)
    db = _make_fake_db(user_doc)
    _patch_db(monkeypatch, db)

    identity = CFAccessIdentity(email=user_doc["email"], sub="sub-z", exp=int(time.time()) + 3600)

    with pytest.raises(HTTPException) as exc:
        await AuthService.login_via_cf_access(identity)
    assert exc.value.status_code == 403
    assert exc.value.detail["status"] == "pending_activation"
    db.users.insert_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_existing_active_user_gets_full_tokens(monkeypatch: pytest.MonkeyPatch) -> None:
    user_doc = _active_user_doc()
    db = _make_fake_db(user_doc)
    _patch_db(monkeypatch, db)

    identity = CFAccessIdentity(email=user_doc["email"], sub="sub-a", exp=int(time.time()) + 3600)
    result = await AuthService.login_via_cf_access(identity)

    assert isinstance(result, TokenResponse)
    assert result.user.userId == user_doc["userId"]
    assert result.user.authProvider == "cloudflare_access"
    db.refresh_tokens.insert_one.assert_awaited_once()
    db.users.update_one.assert_awaited_once()  # lastLoginAt bump


@pytest.mark.asyncio
async def test_existing_active_user_with_mfa_gets_challenge_not_tokens(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_doc = _active_user_doc(mfaEnabled=True)
    db = _make_fake_db(user_doc)
    _patch_db(monkeypatch, db)

    identity = CFAccessIdentity(email=user_doc["email"], sub="sub-b", exp=int(time.time()) + 3600)
    result = await AuthService.login_via_cf_access(identity)

    assert isinstance(result, MFALoginResponse)
    assert result.mfaRequired is True
    db.mfa_pending_tokens.insert_one.assert_awaited_once()
    db.refresh_tokens.insert_one.assert_not_awaited()


# ---------------------------------------------------------------------------
# Endpoints — mounting only the auth router, no live Mongo, following
# tests/unit/test_genetics/test_public_route.py's precedent of mounting a
# single router into a bare FastAPI app.
# ---------------------------------------------------------------------------


@pytest.fixture
def auth_client() -> TestClient:
    app = FastAPI()
    app.include_router(auth_module.router)
    with TestClient(app) as c:
        yield c


def test_cf_access_session_404s_when_disabled(
    auth_client: TestClient, _deployment_settings_stub: Dict[str, Any]
) -> None:
    _deployment_settings_stub["CF_ACCESS_ENABLED"] = False
    resp = auth_client.post("/cf-access/session")
    assert resp.status_code == 404


def test_cf_access_session_401s_with_no_token(
    auth_client: TestClient, _deployment_settings_stub: Dict[str, Any]
) -> None:
    _deployment_settings_stub["CF_ACCESS_ENABLED"] = True
    resp = auth_client.post("/cf-access/session")
    assert resp.status_code == 401


def _dummy_token_response() -> TokenResponse:
    now = datetime.utcnow()
    user = UserResponse(
        userId="local-user-1",
        email="local@example.com",
        firstName="Local",
        lastName="Admin",
        role=UserRole.ADMIN,
        isActive=True,
        isEmailVerified=True,
        mfaEnabled=False,
        mfaSetupRequired=False,
        lastLoginAt=now,
        createdAt=now,
        updatedAt=now,
        authProvider="password",
    )
    return TokenResponse(
        access_token="tok", refresh_token="rtok", token_type="bearer", expires_in=3600, user=user
    )


def test_login_succeeds_when_exclusive_and_no_cloudflare_headers(
    auth_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    _deployment_settings_stub: Dict[str, Any],
) -> None:
    _deployment_settings_stub["CF_ACCESS_EXCLUSIVE"] = True
    monkeypatch.setattr(
        auth_module.auth_service,
        "login_user_with_mfa_check",
        AsyncMock(return_value=_dummy_token_response()),
    )
    monkeypatch.setattr(auth_module.login_rate_limiter, "check_login_attempts", AsyncMock())
    monkeypatch.setattr(auth_module.login_rate_limiter, "clear_attempts", AsyncMock())

    resp = auth_client.post("/login", json={"email": "local@example.com", "password": "whatever"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["user"]["email"] == "local@example.com"


def test_login_rejected_when_exclusive_and_cf_ray_present(
    auth_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    _deployment_settings_stub: Dict[str, Any],
) -> None:
    _deployment_settings_stub["CF_ACCESS_EXCLUSIVE"] = True
    login_mock = AsyncMock(return_value=_dummy_token_response())
    monkeypatch.setattr(auth_module.auth_service, "login_user_with_mfa_check", login_mock)

    resp = auth_client.post(
        "/login",
        json={"email": "someone@example.com", "password": "whatever"},
        headers={"cf-ray": "8c3f1a2b3c4d5e6f-SIN"},
    )
    assert resp.status_code == 403
    login_mock.assert_not_awaited()


# ---------------------------------------------------------------------------
# Settings validator — Settings.validate_cf_access_settings
# ---------------------------------------------------------------------------


def test_settings_enabled_with_empty_aud_raises() -> None:
    with pytest.raises(ValidationError):
        Settings(
            ENVIRONMENT="development",
            DEBUG=True,
            CF_ACCESS_ENABLED=True,
            CF_ACCESS_TEAM_DOMAIN="team.cloudflareaccess.com",
            CF_ACCESS_AUD="",
        )


def test_settings_enabled_with_empty_team_domain_raises() -> None:
    with pytest.raises(ValidationError):
        Settings(
            ENVIRONMENT="development",
            DEBUG=True,
            CF_ACCESS_ENABLED=True,
            CF_ACCESS_TEAM_DOMAIN="",
            CF_ACCESS_AUD="some-aud-tag",
        )


def test_settings_disabled_with_both_empty_is_fine() -> None:
    s = Settings(
        ENVIRONMENT="development",
        DEBUG=True,
        CF_ACCESS_ENABLED=False,
        CF_ACCESS_TEAM_DOMAIN="",
        CF_ACCESS_AUD="",
    )
    assert s.CF_ACCESS_ENABLED is False
    assert s.CF_ACCESS_TEAM_DOMAIN == ""
    assert s.CF_ACCESS_AUD == ""
