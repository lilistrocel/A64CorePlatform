"""
Per-tenant Finance Flag Lookup (Wave 0 — T-059.1)

Caches the `organizations.modules.financeEnabled` value per org so the
outbox writer and capability endpoint don't pay for a Mongo read on every
event/request.

Cache key: `org:{organization_id}:financeEnabled`
TTL: `FINANCE_CAPABILITY_CACHE_TTL_S` (default 60s)

Both True and False results are cached; missing orgs default to True
(matches the migration's default for legacy orgs).
"""

import logging
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis

from src.config.settings import settings

logger = logging.getLogger(__name__)

_KEY_TEMPLATE = "org:{org_id}:financeEnabled"


async def is_finance_enabled_for_org(
    db: AsyncIOMotorDatabase,
    redis: Optional[Redis],
    organization_id: str,
) -> bool:
    """
    Return True if the given tenant has the finance module enabled.

    Default for unknown / missing orgs is True (so a missing flag never
    silently drops events for tenants that should have it on).

    Args:
        db: Motor async database instance.
        redis: Async Redis client. May be None — falls back to direct DB.
        organization_id: UUID string of the organization.

    Returns:
        bool — True if finance is enabled for this tenant, False otherwise.
    """
    if not organization_id:
        # Reason: no tenant context → can't gate; default to enabled so
        # legacy callers without an orgId aren't silently dropped.
        return True

    key = _KEY_TEMPLATE.format(org_id=organization_id)
    ttl = settings.FINANCE_CAPABILITY_CACHE_TTL_S

    # ── Cache lookup ──────────────────────────────────────────────────────
    if redis is not None:
        try:
            cached = await redis.get(key)
            if cached is not None:
                return cached in ("1", "true", "True")
        except Exception as exc:
            # Reason: Redis must never block the outbox path. Fall through
            # to the DB read.
            logger.warning(
                "[TenantFlag] cache read failed for %s: %s",
                organization_id,
                exc,
            )

    # ── DB lookup ─────────────────────────────────────────────────────────
    doc = await db["organizations"].find_one(
        {"organizationId": organization_id},
        projection={"modules.financeEnabled": 1},
    )
    if doc is None:
        # Reason: org not found → treat as enabled (caller may have a
        # cross-tenant context with a stale id). Don't cache the negative
        # since the org might appear later.
        logger.info(
            "[TenantFlag] org '%s' not found; defaulting to enabled",
            organization_id,
        )
        return True

    modules = doc.get("modules") or {}
    # Reason: missing field is treated as True (matches the migration
    # default for legacy orgs that haven't been touched yet).
    finance_enabled = bool(modules.get("financeEnabled", True))

    # ── Write-through cache ───────────────────────────────────────────────
    if redis is not None:
        try:
            await redis.setex(key, ttl, "1" if finance_enabled else "0")
        except Exception as exc:
            logger.warning(
                "[TenantFlag] cache write failed for %s: %s",
                organization_id,
                exc,
            )

    return finance_enabled


async def invalidate_tenant_flag_cache(
    redis: Optional[Redis], organization_id: str
) -> None:
    """
    Drop the cached financeEnabled value for the given org.

    Call this after toggling `modules.financeEnabled` via the admin UI so
    the next outbox write / capability check sees the new value within ms
    instead of waiting for the TTL.
    """
    if redis is None or not organization_id:
        return
    key = _KEY_TEMPLATE.format(org_id=organization_id)
    try:
        await redis.delete(key)
    except Exception as exc:
        logger.warning(
            "[TenantFlag] cache invalidation failed for %s: %s",
            organization_id,
            exc,
        )
