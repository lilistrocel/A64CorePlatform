"""
Finance Service Reachability Check (Wave 0 — T-059.2)

Cached health-ping against the finance microservice. Used by
`/api/v1/system/capabilities` and any consumer that wants a cheap "is
finance up?" answer without paying for a network round-trip on every call.

The check is deployment-wide (finance up/down is global), so the cache key
is NOT scoped per tenant.
"""

import logging
from typing import Optional, Tuple

import httpx
from redis.asyncio import Redis

from src.config.settings import settings

logger = logging.getLogger(__name__)

# Redis keys. Cached as JSON via RedisCache helpers; here we use the raw
# client because we want to atomically pack reachable+version together.
_KEY_REACHABLE = "system:finance:reachable"
_KEY_VERSION = "system:finance:version"


async def get_finance_reachability(
    redis: Optional[Redis],
) -> Tuple[bool, Optional[str]]:
    """
    Return (reachable, version) for the finance microservice.

    Behaviour:
    - If cached, return cached result (no network call).
    - Otherwise, ping `FINANCE_SERVICE_URL/api/v1/system/health` with a 1s
      timeout. On success, cache (True, version). On any error/timeout,
      cache (False, None). Cache TTL is `FINANCE_CAPABILITY_CACHE_TTL_S`.

    Args:
        redis: Async Redis client (e.g. the underlying client from
            `RedisCache._redis`). May be None — in which case the function
            falls back to an uncached live ping every call.

    Returns:
        Tuple of (reachable: bool, version: Optional[str]).
    """
    ttl = settings.FINANCE_CAPABILITY_CACHE_TTL_S

    # ── Try cache ─────────────────────────────────────────────────────────
    if redis is not None:
        try:
            cached_reachable = await redis.get(_KEY_REACHABLE)
            if cached_reachable is not None:
                cached_version = await redis.get(_KEY_VERSION)
                # Redis returns strings when decode_responses=True
                is_reachable = cached_reachable in ("1", "true", "True")
                # Empty string sentinel for "unknown version"
                version = cached_version if cached_version else None
                logger.debug(
                    "[FinanceReachability] cache hit: reachable=%s version=%s",
                    is_reachable,
                    version,
                )
                return is_reachable, version
        except Exception as exc:
            # Reason: Redis hiccups must not break the capability endpoint.
            # Fall through to a live ping.
            logger.warning(
                "[FinanceReachability] cache read failed, doing live ping: %s",
                exc,
            )

    # ── Live ping ─────────────────────────────────────────────────────────
    reachable, version = await _ping_finance_health()

    # ── Write-through cache ───────────────────────────────────────────────
    if redis is not None:
        try:
            await redis.setex(
                _KEY_REACHABLE,
                ttl,
                "1" if reachable else "0",
            )
            await redis.setex(
                _KEY_VERSION,
                ttl,
                version or "",
            )
        except Exception as exc:
            # Reason: write failure is non-fatal — next request will retry.
            logger.warning(
                "[FinanceReachability] cache write failed: %s", exc
            )

    return reachable, version


async def _ping_finance_health() -> Tuple[bool, Optional[str]]:
    """
    Single-shot health ping against the finance service.

    Returns (False, None) on any timeout / connection / HTTP error so the
    caller never has to wrap in try/except.
    """
    url = f"{settings.FINANCE_SERVICE_URL.rstrip('/')}/api/v1/system/health"
    try:
        async with httpx.AsyncClient(timeout=1.0) as client:
            response = await client.get(url)
        if response.status_code != 200:
            logger.info(
                "[FinanceReachability] non-200 response: %s",
                response.status_code,
            )
            return False, None
        body = response.json()
        version = body.get("version")
        return True, version
    except (httpx.TimeoutException, httpx.ConnectError) as exc:
        # Reason: expected when finance is not deployed or briefly down —
        # log at INFO not WARNING so it doesn't drown the dev console.
        logger.info(
            "[FinanceReachability] finance unreachable at %s: %s", url, exc
        )
        return False, None
    except Exception as exc:
        # Unexpected failure (DNS, bad JSON, etc.) — log louder but still
        # degrade gracefully.
        logger.warning(
            "[FinanceReachability] unexpected error pinging %s: %s",
            url,
            exc,
        )
        return False, None


async def invalidate_reachability_cache(redis: Optional[Redis]) -> None:
    """
    Clear the cached reachability result. Call after a forced refresh.
    """
    if redis is None:
        return
    try:
        await redis.delete(_KEY_REACHABLE, _KEY_VERSION)
    except Exception as exc:
        logger.warning(
            "[FinanceReachability] cache invalidation failed: %s", exc
        )
