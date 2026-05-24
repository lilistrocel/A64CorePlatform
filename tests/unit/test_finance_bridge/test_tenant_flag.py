"""
Unit tests for the per-tenant finance flag lookup (Wave 0 — T-059.1).

Covers `src/modules/finance_bridge/tenant_flag.py`:

- Cache hit short-circuits the DB read
- Cache miss falls through to MongoDB, writes the result back
- Both True and False results are cached (so disabled tenants don't
  trigger a Mongo read per event)
- Missing org → default True (legacy safety)
- Missing `modules` field → default True
- Empty organization_id → default True (no tenant context)
- Redis read/write failures degrade silently to DB
"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from src.modules.finance_bridge.tenant_flag import (
    _KEY_TEMPLATE,
    invalidate_tenant_flag_cache,
    is_finance_enabled_for_org,
)


# ─── Helpers ─────────────────────────────────────────────────────────────


def _mock_db_with_org(doc):
    """
    Build a MagicMock that returns `doc` from
    db["organizations"].find_one(...).
    """
    collection = MagicMock()
    collection.find_one = AsyncMock(return_value=doc)
    db = MagicMock()
    db.__getitem__.return_value = collection
    return db, collection


# ─── Tests ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_returns_default_true_when_org_id_empty() -> None:
    """No tenant context → default True, no DB read."""
    db, collection = _mock_db_with_org(None)
    redis = MagicMock()

    result = await is_finance_enabled_for_org(db, redis, "")

    assert result is True
    collection.find_one.assert_not_called()


@pytest.mark.asyncio
async def test_cache_hit_returns_true_without_db_read() -> None:
    """Cache holds '1' → return True, skip Mongo."""
    db, collection = _mock_db_with_org(None)
    redis = MagicMock()
    redis.get = AsyncMock(return_value="1")
    redis.setex = AsyncMock()

    result = await is_finance_enabled_for_org(db, redis, "org-1")

    assert result is True
    collection.find_one.assert_not_called()
    redis.setex.assert_not_called()


@pytest.mark.asyncio
async def test_cache_hit_returns_false_without_db_read() -> None:
    """Cache holds '0' → return False, skip Mongo."""
    db, collection = _mock_db_with_org(None)
    redis = MagicMock()
    redis.get = AsyncMock(return_value="0")

    result = await is_finance_enabled_for_org(db, redis, "org-1")

    assert result is False
    collection.find_one.assert_not_called()


@pytest.mark.asyncio
async def test_cache_miss_falls_through_to_db_and_writes_cache() -> None:
    """Miss → Mongo read → result cached for next call."""
    db, collection = _mock_db_with_org(
        {"modules": {"financeEnabled": False}}
    )
    redis = MagicMock()
    redis.get = AsyncMock(return_value=None)
    redis.setex = AsyncMock()

    result = await is_finance_enabled_for_org(db, redis, "org-1")

    assert result is False
    collection.find_one.assert_awaited_once()
    redis.setex.assert_awaited_once_with(
        _KEY_TEMPLATE.format(org_id="org-1"), 60, "0"
    )


@pytest.mark.asyncio
async def test_caches_true_results_too() -> None:
    """True results are also cached so we don't re-read for enabled tenants."""
    db, _ = _mock_db_with_org({"modules": {"financeEnabled": True}})
    redis = MagicMock()
    redis.get = AsyncMock(return_value=None)
    redis.setex = AsyncMock()

    result = await is_finance_enabled_for_org(db, redis, "org-1")

    assert result is True
    redis.setex.assert_awaited_once_with(
        _KEY_TEMPLATE.format(org_id="org-1"), 60, "1"
    )


@pytest.mark.asyncio
async def test_missing_org_defaults_to_true() -> None:
    """Org doc not found → default True, no cache write (org may appear)."""
    db, _ = _mock_db_with_org(None)
    redis = MagicMock()
    redis.get = AsyncMock(return_value=None)
    redis.setex = AsyncMock()

    result = await is_finance_enabled_for_org(db, redis, "org-1")

    assert result is True
    # Negative cache would be wrong here — org might appear later.
    redis.setex.assert_not_called()


@pytest.mark.asyncio
async def test_missing_modules_field_defaults_to_true() -> None:
    """Org exists but has no `modules` field → default True (legacy doc)."""
    db, _ = _mock_db_with_org({"organizationId": "org-1"})
    redis = MagicMock()
    redis.get = AsyncMock(return_value=None)
    redis.setex = AsyncMock()

    result = await is_finance_enabled_for_org(db, redis, "org-1")

    assert result is True


@pytest.mark.asyncio
async def test_missing_financeenabled_in_modules_defaults_to_true() -> None:
    """`modules` exists but `financeEnabled` missing → default True."""
    db, _ = _mock_db_with_org({"modules": {}})
    redis = MagicMock()
    redis.get = AsyncMock(return_value=None)
    redis.setex = AsyncMock()

    result = await is_finance_enabled_for_org(db, redis, "org-1")

    assert result is True


@pytest.mark.asyncio
async def test_redis_read_failure_degrades_to_db() -> None:
    """Redis hiccup must not block the outbox path."""
    db, collection = _mock_db_with_org(
        {"modules": {"financeEnabled": False}}
    )
    redis = MagicMock()
    redis.get = AsyncMock(side_effect=Exception("redis down"))
    redis.setex = AsyncMock()

    result = await is_finance_enabled_for_org(db, redis, "org-1")

    assert result is False
    collection.find_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_redis_write_failure_does_not_propagate() -> None:
    """A cache write failure should not break the call."""
    db, _ = _mock_db_with_org({"modules": {"financeEnabled": True}})
    redis = MagicMock()
    redis.get = AsyncMock(return_value=None)
    redis.setex = AsyncMock(side_effect=Exception("redis down"))

    # Should not raise
    result = await is_finance_enabled_for_org(db, redis, "org-1")
    assert result is True


@pytest.mark.asyncio
async def test_works_with_redis_none() -> None:
    """When Redis client is None, fall straight through to DB."""
    db, collection = _mock_db_with_org(
        {"modules": {"financeEnabled": False}}
    )

    result = await is_finance_enabled_for_org(db, None, "org-1")

    assert result is False
    collection.find_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_invalidate_deletes_cache_key() -> None:
    redis = MagicMock()
    redis.delete = AsyncMock()

    await invalidate_tenant_flag_cache(redis, "org-1")

    redis.delete.assert_awaited_once_with(
        _KEY_TEMPLATE.format(org_id="org-1")
    )


@pytest.mark.asyncio
async def test_invalidate_no_redis_is_noop() -> None:
    # Must not raise.
    await invalidate_tenant_flag_cache(None, "org-1")


@pytest.mark.asyncio
async def test_invalidate_empty_org_id_is_noop() -> None:
    redis = MagicMock()
    redis.delete = AsyncMock()

    await invalidate_tenant_flag_cache(redis, "")

    redis.delete.assert_not_called()
