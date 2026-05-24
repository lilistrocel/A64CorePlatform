"""
Unit tests for the finance reachability check (Wave 0 — T-059.2).

Covers `src/modules/finance_bridge/reachability.py`:

- Cache hit returns cached (reachable, version) without httpx call
- Cache miss performs live ping and write-through caches the result
- Timeout / connection error → (False, None) cached
- HTTP non-200 → (False, None)
- redis=None still does a live ping
- Redis read/write errors degrade silently
- invalidate clears both keys
"""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from src.modules.finance_bridge.reachability import (
    _KEY_REACHABLE,
    _KEY_VERSION,
    get_finance_reachability,
    invalidate_reachability_cache,
)


# ─── Fixtures ────────────────────────────────────────────────────────────


def _make_response(status_code: int = 200, body: dict | None = None):
    """Build a minimal httpx.Response double."""
    response = MagicMock()
    response.status_code = status_code
    response.json = MagicMock(return_value=body or {})
    return response


def _patch_async_client(response_or_exc):
    """
    Patch httpx.AsyncClient so the context-managed instance returns
    `response_or_exc`. If response_or_exc is an exception class /
    instance, .get() raises it.
    """
    client = MagicMock()
    if isinstance(response_or_exc, Exception) or (
        isinstance(response_or_exc, type)
        and issubclass(response_or_exc, Exception)
    ):
        client.get = AsyncMock(side_effect=response_or_exc)
    else:
        client.get = AsyncMock(return_value=response_or_exc)

    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client)
    cm.__aexit__ = AsyncMock(return_value=None)
    return patch(
        "src.modules.finance_bridge.reachability.httpx.AsyncClient",
        return_value=cm,
    )


# ─── Tests ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cache_hit_returns_cached_without_ping() -> None:
    """Cache holds reachable=1 + version → skip httpx."""
    redis = MagicMock()
    redis.get = AsyncMock(side_effect=["1", "1.7.0"])

    with _patch_async_client(_make_response(200)) as mock_client:
        reachable, version = await get_finance_reachability(redis)

    assert reachable is True
    assert version == "1.7.0"
    mock_client.assert_not_called()


@pytest.mark.asyncio
async def test_cache_hit_false_returns_unreachable() -> None:
    """Cache holds reachable=0 → return (False, None) without ping."""
    redis = MagicMock()
    redis.get = AsyncMock(side_effect=["0", ""])

    with _patch_async_client(_make_response(200)) as mock_client:
        reachable, version = await get_finance_reachability(redis)

    assert reachable is False
    assert version is None
    mock_client.assert_not_called()


@pytest.mark.asyncio
async def test_cache_miss_pings_and_caches_success() -> None:
    """Miss → live ping → success → both keys written with TTL."""
    redis = MagicMock()
    redis.get = AsyncMock(return_value=None)
    redis.setex = AsyncMock()

    with _patch_async_client(
        _make_response(200, {"status": "ok", "version": "1.7.0"})
    ):
        reachable, version = await get_finance_reachability(redis)

    assert reachable is True
    assert version == "1.7.0"
    # Two write-through writes: reachable + version
    assert redis.setex.await_count == 2
    keys_written = {call.args[0] for call in redis.setex.await_args_list}
    assert _KEY_REACHABLE in keys_written
    assert _KEY_VERSION in keys_written


@pytest.mark.asyncio
async def test_timeout_returns_unreachable_and_caches() -> None:
    """httpx timeout → (False, None) + negative cached."""
    redis = MagicMock()
    redis.get = AsyncMock(return_value=None)
    redis.setex = AsyncMock()

    with _patch_async_client(httpx.TimeoutException("timed out")):
        reachable, version = await get_finance_reachability(redis)

    assert reachable is False
    assert version is None
    assert redis.setex.await_count == 2


@pytest.mark.asyncio
async def test_connection_error_returns_unreachable() -> None:
    """httpx ConnectError → (False, None)."""
    redis = MagicMock()
    redis.get = AsyncMock(return_value=None)
    redis.setex = AsyncMock()

    with _patch_async_client(httpx.ConnectError("refused")):
        reachable, version = await get_finance_reachability(redis)

    assert reachable is False
    assert version is None


@pytest.mark.asyncio
async def test_http_503_returns_unreachable() -> None:
    """Non-200 from finance health → reachable=False."""
    redis = MagicMock()
    redis.get = AsyncMock(return_value=None)
    redis.setex = AsyncMock()

    with _patch_async_client(_make_response(503)):
        reachable, version = await get_finance_reachability(redis)

    assert reachable is False
    assert version is None


@pytest.mark.asyncio
async def test_works_with_redis_none() -> None:
    """No Redis → still does a live ping, just doesn't cache."""
    with _patch_async_client(
        _make_response(200, {"status": "ok", "version": "1.0.0"})
    ):
        reachable, version = await get_finance_reachability(None)

    assert reachable is True
    assert version == "1.0.0"


@pytest.mark.asyncio
async def test_redis_read_failure_falls_through_to_ping() -> None:
    """Redis hiccup must not break reachability."""
    redis = MagicMock()
    redis.get = AsyncMock(side_effect=Exception("redis down"))
    redis.setex = AsyncMock()

    with _patch_async_client(
        _make_response(200, {"version": "1.0.0"})
    ):
        reachable, version = await get_finance_reachability(redis)

    assert reachable is True
    assert version == "1.0.0"


@pytest.mark.asyncio
async def test_redis_write_failure_does_not_propagate() -> None:
    """Failure to write the cache after a live ping should not raise."""
    redis = MagicMock()
    redis.get = AsyncMock(return_value=None)
    redis.setex = AsyncMock(side_effect=Exception("redis down"))

    with _patch_async_client(
        _make_response(200, {"version": "1.0.0"})
    ):
        reachable, version = await get_finance_reachability(redis)

    assert reachable is True
    assert version == "1.0.0"


@pytest.mark.asyncio
async def test_invalidate_deletes_both_keys() -> None:
    redis = MagicMock()
    redis.delete = AsyncMock()

    await invalidate_reachability_cache(redis)

    redis.delete.assert_awaited_once_with(_KEY_REACHABLE, _KEY_VERSION)


@pytest.mark.asyncio
async def test_invalidate_no_redis_is_noop() -> None:
    await invalidate_reachability_cache(None)
