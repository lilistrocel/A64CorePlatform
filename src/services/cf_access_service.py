"""
Cloudflare Access token verification.

Cloudflare Access authenticates at the edge — in front of nginx, over the
`cloudflared` tunnel — and stamps every request it lets through with a
signed RS256 JWT in the `Cf-Access-Jwt-Assertion` header. This module is the
ONLY place that decides whether such a token is genuine: it verifies the
signature against the team's published JSON Web Key Set (JWKS), then checks
audience, issuer and expiry. Nothing downstream re-derives trust from the
token; see auth_service.login_via_cf_access for what happens once a token is
verified (an ordinary app JWT is issued, exactly like password login).

There is deliberately no "skip verification" / dev-bypass flag anywhere in
this module. That is an explicit project rule (see CLAUDE.md — no quick
hacks, no disabling checks "temporarily"), not an oversight.
"""

import logging
import time
from typing import Any, Dict, List, Optional

import httpx
from fastapi import HTTPException, status
from jose import JWTError, jwt
from pydantic import BaseModel

from ..config.settings import settings

logger = logging.getLogger(__name__)

# How long a fetched JWKS is trusted before we refetch on the next lookup.
_JWKS_TTL_SECONDS = 3600

# Floor between forced refreshes triggered by an unrecognized `kid`. Without
# this, a stream of tokens carrying junk/rotated key IDs could force a fetch
# to Cloudflare on every single request.
_FORCED_REFRESH_MIN_INTERVAL_SECONDS = 60

# Module-level cache. `fetched_at`/`last_forced_refresh_at` use
# time.monotonic() (not wall clock) so the TTL and rate limit are immune to
# system clock adjustments (NTP corrections, manual changes, DST — none of
# which should affect cache freshness).
_jwks_cache: Dict[str, Any] = {"keys": [], "fetched_at": 0.0}
_last_forced_refresh_at: float = 0.0


class CFAccessIdentity(BaseModel):
    """Identity asserted by a verified Cloudflare Access JWT."""

    email: str
    sub: str
    exp: int
    identity_nonce: Optional[str] = None
    common_name: Optional[str] = None


async def _fetch_jwks() -> List[Dict[str, Any]]:
    """
    Fetch the team's JSON Web Key Set from Cloudflare Access.

    Returns:
        The list of JWK dicts published at
        `https://{team_domain}/cdn-cgi/access/certs`.

    Raises:
        HTTPException: 401 if the endpoint is unreachable or returns an
            unexpected shape. A verification failure must surface as "this
            token is not trusted", never as a 500 that could be mistaken for
            an unrelated outage.
    """
    url = f"https://{settings.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.error("Failed to fetch Cloudflare Access JWKS from %s: %s", url, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unable to verify Cloudflare Access identity",
        )

    keys = data.get("keys")
    if not isinstance(keys, list):
        logger.error("Unexpected JWKS response shape from %s: %r", url, data)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unable to verify Cloudflare Access identity",
        )

    return keys


async def _get_jwks(force_refresh: bool = False) -> List[Dict[str, Any]]:
    """
    Return the cached JWKS keys, refreshing when stale or explicitly forced.

    Args:
        force_refresh: True when a token's `kid` was not found in the
            current cache (possible key rotation). Rate-limited to at most
            once per `_FORCED_REFRESH_MIN_INTERVAL_SECONDS` so a stream of
            tokens with bogus/rotated key IDs cannot hammer Cloudflare.

    Returns:
        The current (possibly just-refreshed) list of JWK dicts.
    """
    global _last_forced_refresh_at

    now = time.monotonic()

    if force_refresh:
        if now - _last_forced_refresh_at < _FORCED_REFRESH_MIN_INTERVAL_SECONDS:
            # Reason: a forced refresh happened too recently — return the
            # cache as-is rather than hammering Cloudflare for every junk
            # token that shows up with an unrecognized kid.
            return _jwks_cache["keys"]
        _last_forced_refresh_at = now
    elif _jwks_cache["keys"] and (now - _jwks_cache["fetched_at"]) < _JWKS_TTL_SECONDS:
        return _jwks_cache["keys"]

    keys = await _fetch_jwks()
    _jwks_cache["keys"] = keys
    _jwks_cache["fetched_at"] = now
    return keys


async def _find_signing_key(kid: str) -> Optional[Dict[str, Any]]:
    """Locate the JWK matching `kid`, forcing one rate-limited refresh on a cache miss."""
    keys = await _get_jwks()
    for key in keys:
        if key.get("kid") == kid:
            return key

    # Reason: genuine key rotation on Cloudflare's side is the only expected
    # cause of a miss against a fresh-enough cache — worth one forced retry.
    keys = await _get_jwks(force_refresh=True)
    for key in keys:
        if key.get("kid") == kid:
            return key

    return None


async def verify_cf_access_token(token: str) -> CFAccessIdentity:
    """
    Verify a Cloudflare Access JWT and return the identity it asserts.

    Args:
        token: The raw JWT, as read from the `Cf-Access-Jwt-Assertion`
            header or the `CF_Authorization` cookie.

    Returns:
        CFAccessIdentity built from the verified token's claims.

    Raises:
        HTTPException: 401 on ANY failure — malformed token, unknown `kid`,
            bad signature, expired, wrong audience, wrong issuer, or a
            missing required claim. There is no fallback path.
    """
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Cloudflare Access token",
        )

    kid = unverified_header.get("kid")
    if not kid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Cloudflare Access token",
        )

    signing_key = await _find_signing_key(kid)
    if signing_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Cloudflare Access token",
        )

    issuer = f"https://{settings.CF_ACCESS_TEAM_DOMAIN}"

    try:
        claims = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience=settings.CF_ACCESS_AUD,
            issuer=issuer,
        )
    except JWTError as exc:
        logger.warning("Cloudflare Access token verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Cloudflare Access token",
        )

    email = claims.get("email")
    sub = claims.get("sub")
    exp = claims.get("exp")
    if not email or not sub or exp is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Cloudflare Access token",
        )

    return CFAccessIdentity(
        email=email,
        sub=sub,
        exp=exp,
        identity_nonce=claims.get("identity_nonce"),
        common_name=claims.get("common_name"),
    )
