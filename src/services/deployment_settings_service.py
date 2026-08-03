"""
Deployment Settings Service

Makes deployment identity (``PUBLIC_BASE_URL``, ``FRONTEND_URL``) and
Cloudflare Access configuration (``CF_ACCESS_*``) configurable at runtime by
a super_admin, stored in the ``platform_settings`` singleton document,
instead of requiring ``.env`` edits + a container restart.

Why this exists: ``.env`` is not mounted into the api container, env vars
freeze at process start, and Compose interpolates ``${VAR}`` at
container-create time — none of that can be changed from the browser. The
only thing that CAN change at request time is a database read. So every
managed key resolves in this order:

    environment variable (if set and non-empty) -> database value -> unset

Env acts as a *lock* for hardened deployments: when a key is set in the
environment, the database value is ignored entirely and ``get_resolved``
reports that key ``source="env", editable=False``. This is deliberate — an
operator who pins a value in the environment has explicitly opted out of
runtime reconfiguration for that key, and the API must honour that, not
silently prefer a database override.

Security note (read before changing ``CF_ACCESS_TEAM_DOMAIN`` /
``CF_ACCESS_AUD`` handling): whoever can write these two values can point
authentication at a Cloudflare Access application they control and mint a
valid token for ANY email, including super_admin. That is why:
  - ``update()`` enforces all four guardrails below unconditionally, not
    just when convenient.
  - ``get_resolved()`` never returns these two values in full — callers get
    ``isSet`` + a masked hint only. There is deliberately no reveal
    endpoint; do not add one.

The four guardrails enforced by ``update()``:
  a. CF_ACCESS_TEAM_DOMAIN changes are validated against Cloudflare's own
     JWKS endpoint before being persisted (typos are the most likely
     lockout cause).
  b. CF_ACCESS_EXCLUSIVE cannot be enabled until at least one Cloudflare
     Access sign-in has actually succeeded on this deployment
     (``record_cf_access_login``) — otherwise a super_admin could lock
     themselves out of password login before proving CF Access even works.
  c. The acting super_admin's current password must be supplied and verified
     — a hijacked session alone must not be able to repoint authentication.
  d. Every changed key is written to ``admin_audit_log`` with masked
     before/after values.
"""

import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx
from fastapi import HTTPException, status

from ..config.settings import settings
from ..utils.security import verify_password
from .database import mongodb

logger = logging.getLogger(__name__)

# Managed keys, grouped by expected value type. The env-attr name and the
# Mongo field name are identical for every one of these — settings.py
# declares them 1:1 (see config/settings.py).
_STRING_KEYS = frozenset(
    {
        "PUBLIC_BASE_URL",
        "FRONTEND_URL",
        "CF_ACCESS_TEAM_DOMAIN",
        "CF_ACCESS_AUD",
        "CF_ACCESS_DEFAULT_ROLE",
    }
)
_BOOL_KEYS = frozenset({"CF_ACCESS_ENABLED", "CF_ACCESS_EXCLUSIVE", "CF_ACCESS_JIT_PROVISION"})
MANAGED_KEYS = _STRING_KEYS | _BOOL_KEYS

# Never returned in full — see module docstring. Masked with `_mask_value`
# wherever they would otherwise appear (API response, audit log).
_SECRET_KEYS = frozenset({"CF_ACCESS_TEAM_DOMAIN", "CF_ACCESS_AUD"})

_SINGLETON_ID = "deployment"

# Short TTL: this is read on the auth hot path (every /login, /register, and
# CF Access verification), so a request-scoped Mongo round trip per call is
# not acceptable, but a change made in Settings should still take effect
# within a human-noticeable amount of time. time.monotonic() is immune to
# wall-clock adjustments (NTP, manual changes, DST).
_CACHE_TTL_SECONDS = 30.0
_JWKS_VALIDATION_TIMEOUT_SECONDS = 5.0

_cache: Dict[str, Any] = {"data": None, "fetched_at": 0.0}


@dataclass
class ResolvedSetting:
    """One managed key's effective value plus where it came from."""

    value: Any
    source: str  # "env" | "db" | "unset"
    editable: bool


def invalidate_cache() -> None:
    """Force the next `get_resolved()` call to re-read Mongo.

    Called after every successful `update()` so a write is visible
    immediately rather than waiting out the TTL.
    """
    _cache["data"] = None
    _cache["fetched_at"] = 0.0


async def get_resolved() -> Dict[str, ResolvedSetting]:
    """
    Resolve every managed key: environment variable -> database -> unset.

    Returns:
        Dict keyed by managed key name. Each value's `.value` is already
        correctly typed (bool for the CF_ACCESS_* flags, str for the rest).
        Cached in-process for up to `_CACHE_TTL_SECONDS`.
    """
    now = time.monotonic()
    cached = _cache["data"]
    if cached is not None and (now - _cache["fetched_at"]) < _CACHE_TTL_SECONDS:
        return cached

    db = mongodb.get_database()
    doc = await db.platform_settings.find_one({"_id": _SINGLETON_ID}) or {}

    resolved: Dict[str, ResolvedSetting] = {}
    for key in MANAGED_KEYS:
        env_raw = os.environ.get(key, "")
        if env_raw != "":
            # Reason: settings.<key> is already the pydantic-parsed,
            # correctly-typed value of this same env var — no need to
            # re-parse the raw string ourselves.
            resolved[key] = ResolvedSetting(value=getattr(settings, key), source="env", editable=False)
            continue

        db_value = doc.get(key)
        if db_value not in (None, ""):
            resolved[key] = ResolvedSetting(value=db_value, source="db", editable=True)
        else:
            # Reason: no env var and no DB value -> fall back to the
            # Settings class default, exactly what settings.<key> already
            # holds when the env var was never set.
            resolved[key] = ResolvedSetting(value=getattr(settings, key), source="unset", editable=True)

    _cache["data"] = resolved
    _cache["fetched_at"] = now
    return resolved


async def get_value(key: str) -> Any:
    """
    Resolve a single managed key's effective value.

    Args:
        key: One of `MANAGED_KEYS`.

    Returns:
        The effective value per the env -> db -> unset resolution order.

    Raises:
        KeyError: If `key` is not a managed key (programmer error at the
            call site, not a runtime/user condition).
    """
    resolved = await get_resolved()
    return resolved[key].value


def mask_value(value: Any) -> Any:
    """Mask a secret string to its last 4 characters, e.g. `****ab12`.

    Fixed asterisk prefix rather than `...` — some managed values end in a
    literal `.` (e.g. `myteam.cloudflareaccess.com`), which would otherwise
    render ambiguously as `....com`. Non-string / empty values pass through
    unchanged (there is nothing to mask on an unset secret). Public — also
    used by the API layer (`api/v1/admin.py`) to build the masked GET
    response.
    """
    if not isinstance(value, str) or not value:
        return value
    if len(value) <= 4:
        return "*" * len(value)
    return f"****{value[-4:]}"


def _mask_for_audit(values: Dict[str, Any]) -> Dict[str, Any]:
    """Apply `mask_value` to `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` only.

    Used for the audit log's before/after — these two keys must never be
    written in clear anywhere, including the audit trail (see module
    docstring's security note).
    """
    return {
        key: (mask_value(value) if key in _SECRET_KEYS else value)
        for key, value in values.items()
    }


async def _validate_team_domain(team_domain: str) -> None:
    """
    Guardrail (a): reject a `CF_ACCESS_TEAM_DOMAIN` change unless Cloudflare's
    own JWKS endpoint confirms it's real.

    Typos are the most likely cause of a Cloudflare Access lockout — this
    catches them at save time instead of at the next login attempt.

    Args:
        team_domain: Host only, no scheme (e.g. "myteam.cloudflareaccess.com").

    Raises:
        HTTPException: 422 if the endpoint is unreachable, times out, returns
            non-JSON, or returns JSON without a non-empty `keys` list.
    """
    url = f"https://{team_domain}/cdn-cgi/access/certs"
    try:
        async with httpx.AsyncClient(timeout=_JWKS_VALIDATION_TIMEOUT_SECONDS) as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("CF_ACCESS_TEAM_DOMAIN validation failed for %s: %s", team_domain, exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Could not validate CF_ACCESS_TEAM_DOMAIN '{team_domain}' against "
                "Cloudflare's certs endpoint. Check for typos and that this "
                "deployment can reach the internet, then retry."
            ),
        ) from exc

    keys = data.get("keys") if isinstance(data, dict) else None
    if not isinstance(keys, list) or len(keys) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"CF_ACCESS_TEAM_DOMAIN '{team_domain}' did not return a parseable "
                "JWKS with at least one signing key. Check for typos and retry."
            ),
        )


async def record_cf_access_login() -> None:
    """
    Record that a Cloudflare Access sign-in has completed successfully.

    Called by `AuthService.login_via_cf_access` immediately after it issues
    full tokens (not on the MFA-challenge branch — that login has not yet
    completed). This is guardrail (b): enabling `CF_ACCESS_EXCLUSIVE` is
    refused unless this has been recorded at least once, so a super_admin
    cannot lock out password login before Cloudflare Access is proven to
    actually work end-to-end on this deployment.
    """
    db = mongodb.get_database()
    await db.platform_settings.update_one(
        {"_id": _SINGLETON_ID},
        {"$set": {"lastCfAccessLoginAt": datetime.now(timezone.utc)}},
        upsert=True,
    )


async def update(
    changes: Dict[str, Any],
    actor_user_id: str,
    actor_email: str,
    current_password: str,
) -> Dict[str, ResolvedSetting]:
    """
    Apply a validated set of changes to the deployment settings singleton.

    Args:
        changes: Managed key -> new value. Only keys being changed.
        actor_user_id: userId of the acting super_admin (from the JWT via
            `get_current_user`, not user-suppliable).
        actor_email: Email of the acting super_admin, for the audit trail.
        current_password: The acting super_admin's CURRENT plaintext
            password, verified against their stored hash before anything is
            written (guardrail c).

    Returns:
        The freshly re-resolved settings (equivalent to calling
        `get_resolved()` right after this returns).

    Raises:
        HTTPException:
            400 if `changes` is empty.
            422 if `changes` contains an unknown key, a value of the wrong
                type, or a `CF_ACCESS_TEAM_DOMAIN` that fails JWKS validation.
            409 if any changed key is currently pinned by an environment
                variable, or `CF_ACCESS_EXCLUSIVE` is being enabled without a
                previously recorded successful CF Access sign-in.
            401 if `current_password` does not match the actor's stored hash.
    """
    if not changes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No changes supplied.")

    unknown = sorted(set(changes) - MANAGED_KEYS)
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown setting key(s): {', '.join(unknown)}",
        )

    for key, value in changes.items():
        expected_type = bool if key in _BOOL_KEYS else str
        if not isinstance(value, expected_type):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{key} must be a {expected_type.__name__}.",
            )

    resolved_before = await get_resolved()

    pinned = sorted(key for key in changes if resolved_before[key].source == "env")
    if pinned:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{', '.join(pinned)} pinned by an environment variable on this "
                "deployment and cannot be edited here."
            ),
        )

    db = mongodb.get_database()

    # Guardrail (c): password re-authentication. A hijacked session alone
    # must not be able to repoint authentication.
    user_doc = await db.users.find_one({"userId": actor_user_id})
    if (
        not user_doc
        or not user_doc.get("passwordHash")
        or not verify_password(current_password, user_doc["passwordHash"])
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect.",
        )

    # Guardrail (a): validate the team domain against Cloudflare before
    # persisting anything.
    new_team_domain = changes.get("CF_ACCESS_TEAM_DOMAIN")
    if new_team_domain:
        await _validate_team_domain(new_team_domain)

    # Guardrail (b): exclusive mode requires a proven Access login.
    if changes.get("CF_ACCESS_EXCLUSIVE") is True:
        current_doc = await db.platform_settings.find_one({"_id": _SINGLETON_ID}) or {}
        if not current_doc.get("lastCfAccessLoginAt"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Cannot enable exclusive mode: no successful Cloudflare Access "
                    "sign-in has been recorded yet for this deployment. Sign in once "
                    "via Cloudflare Access, then retry."
                ),
            )

    before_values = {key: resolved_before[key].value for key in changes}
    now = datetime.now(timezone.utc)

    await db.platform_settings.update_one(
        {"_id": _SINGLETON_ID},
        {
            "$set": {
                **changes,
                "updatedAt": now,
                "updatedBy": {"userId": actor_user_id, "email": actor_email},
            }
        },
        upsert=True,
    )

    # Guardrail (d): audit log with masked before/after.
    audit_entry = {
        "action": "deployment_settings.updated",
        "performedBy": actor_user_id,
        "performedByEmail": actor_email,
        "timestamp": now,
        "details": {
            "before": _mask_for_audit(before_values),
            "after": _mask_for_audit(changes),
        },
    }
    await db.admin_audit_log.insert_one(audit_entry)

    invalidate_cache()
    return await get_resolved()
