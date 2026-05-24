"""
Unit tests for OutboxWriter and feature flag

Covers:
    - FINANCE_OUTBOX_ENABLED=false → OutboxWriter.publish() is a no-op
    - FINANCE_OUTBOX_ENABLED=true → event inserted into collection
    - Unknown event_type → ValueError raised
    - Malformed payload → pydantic.ValidationError raised
    - Duplicate eventId → no-op (returns None, no exception)
"""

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Feature flag tests (no MongoDB needed)
# ---------------------------------------------------------------------------


def test_feature_flag_disabled_by_default() -> None:
    """FINANCE_OUTBOX_ENABLED not set → is_outbox_enabled returns False."""
    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("FINANCE_OUTBOX_ENABLED", None)
        from src.modules.finance_bridge.feature_flag import is_outbox_enabled
        # Re-import to pick up env change
        import importlib
        import src.modules.finance_bridge.feature_flag as ff_module
        importlib.reload(ff_module)
        assert ff_module.is_outbox_enabled() is False


def test_feature_flag_enabled_with_true() -> None:
    """FINANCE_OUTBOX_ENABLED=true → is_outbox_enabled returns True."""
    with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "true"}):
        import importlib
        import src.modules.finance_bridge.feature_flag as ff_module
        importlib.reload(ff_module)
        assert ff_module.is_outbox_enabled() is True


def test_feature_flag_enabled_with_1() -> None:
    """FINANCE_OUTBOX_ENABLED=1 → is_outbox_enabled returns True."""
    with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "1"}):
        import importlib
        import src.modules.finance_bridge.feature_flag as ff_module
        importlib.reload(ff_module)
        assert ff_module.is_outbox_enabled() is True


def test_feature_flag_case_insensitive() -> None:
    """FINANCE_OUTBOX_ENABLED=TRUE → is_outbox_enabled returns True."""
    with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "TRUE"}):
        import importlib
        import src.modules.finance_bridge.feature_flag as ff_module
        importlib.reload(ff_module)
        assert ff_module.is_outbox_enabled() is True


# ---------------------------------------------------------------------------
# OutboxWriter tests (mock MongoDB)
# ---------------------------------------------------------------------------


def _valid_payload() -> Dict[str, Any]:
    """Return a valid SalesOrderShippedPayload dict."""
    return {
        "salesOrderId": str(uuid.uuid4()),
        "customerId": str(uuid.uuid4()),
        "farmCode": "ALAIN-01",
        "lines": [],
        "totalNetAmount": "100.00",
        "totalTaxAmount": "5.00",
        "totalGrossAmount": "105.00",
    }


@pytest.mark.asyncio
async def test_publish_noop_when_disabled() -> None:
    """OutboxWriter.publish() returns None without writing when flag is off."""
    mock_db = MagicMock()

    with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "false"}):
        import importlib
        import src.modules.finance_bridge.feature_flag as ff_module
        import src.modules.finance_bridge.outbox_writer as ow_module
        importlib.reload(ff_module)
        importlib.reload(ow_module)

        result = await ow_module.OutboxWriter.publish(
            db=mock_db,
            event_type="sales_order_shipped",
            organization_id=str(uuid.uuid4()),
            company_code="A001",
            payload=_valid_payload(),
            source_user_id=str(uuid.uuid4()),
        )

    assert result is None
    # Verify MongoDB was never touched
    mock_db.__getitem__.assert_not_called()


@pytest.mark.asyncio
async def test_publish_writes_when_enabled() -> None:
    """OutboxWriter.publish() inserts document when flag is on."""
    mock_collection = MagicMock()
    mock_collection.insert_one = AsyncMock(return_value=MagicMock(inserted_id="abc123"))
    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)

    with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "true"}):
        import importlib
        import src.modules.finance_bridge.feature_flag as ff_module
        import src.modules.finance_bridge.outbox_writer as ow_module
        importlib.reload(ff_module)
        importlib.reload(ow_module)

        # Reason: the Wave 0 per-tenant gate runs after the global flag.
        # Force it to allow the write so we exercise the original
        # behaviour without depending on a Mongo round-trip.
        with patch.object(
            ow_module, "is_finance_enabled_for_org", AsyncMock(return_value=True)
        ), patch.object(
            ow_module, "get_redis_cache", AsyncMock(return_value=MagicMock(is_available=False))
        ):
            event_id = await ow_module.OutboxWriter.publish(
                db=mock_db,
                event_type="sales_order_shipped",
                organization_id=str(uuid.uuid4()),
                company_code="A001",
                payload=_valid_payload(),
                source_user_id=str(uuid.uuid4()),
            )

    assert event_id is not None
    mock_collection.insert_one.assert_awaited_once()
    doc = mock_collection.insert_one.await_args[0][0]
    assert doc["eventType"] == "sales_order_shipped"
    assert doc["status"] == "pending"
    assert doc["attempts"] == 0


@pytest.mark.asyncio
async def test_publish_raises_on_unknown_event_type() -> None:
    """Unknown event_type raises ValueError immediately."""
    mock_db = MagicMock()

    with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "true"}):
        import importlib
        import src.modules.finance_bridge.feature_flag as ff_module
        import src.modules.finance_bridge.outbox_writer as ow_module
        importlib.reload(ff_module)
        importlib.reload(ow_module)

        with patch.object(
            ow_module, "is_finance_enabled_for_org", AsyncMock(return_value=True)
        ), patch.object(
            ow_module, "get_redis_cache", AsyncMock(return_value=MagicMock(is_available=False))
        ):
            with pytest.raises(ValueError, match="Unknown finance event type"):
                await ow_module.OutboxWriter.publish(
                    db=mock_db,
                    event_type="totally_unknown_event",
                    organization_id=str(uuid.uuid4()),
                    company_code="A001",
                    payload={},
                    source_user_id=str(uuid.uuid4()),
                )


@pytest.mark.asyncio
async def test_publish_raises_on_malformed_payload() -> None:
    """Malformed payload raises pydantic.ValidationError."""
    from pydantic import ValidationError

    mock_db = MagicMock()

    with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "true"}):
        import importlib
        import src.modules.finance_bridge.feature_flag as ff_module
        import src.modules.finance_bridge.outbox_writer as ow_module
        importlib.reload(ff_module)
        importlib.reload(ow_module)

        with patch.object(
            ow_module, "is_finance_enabled_for_org", AsyncMock(return_value=True)
        ), patch.object(
            ow_module, "get_redis_cache", AsyncMock(return_value=MagicMock(is_available=False))
        ):
            with pytest.raises(ValidationError):
                await ow_module.OutboxWriter.publish(
                    db=mock_db,
                    event_type="sales_order_shipped",
                    organization_id=str(uuid.uuid4()),
                    company_code="A001",
                    payload={"salesOrderId": str(uuid.uuid4())},  # missing required fields
                    source_user_id=str(uuid.uuid4()),
                )


@pytest.mark.asyncio
async def test_publish_duplicate_event_id_returns_none() -> None:
    """Duplicate key error on insert returns None (no exception propagated)."""
    mock_collection = MagicMock()
    # Simulate a duplicate key error
    mock_collection.insert_one = AsyncMock(
        side_effect=Exception("E11000 duplicate key error")
    )
    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)

    with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "true"}):
        import importlib
        import src.modules.finance_bridge.feature_flag as ff_module
        import src.modules.finance_bridge.outbox_writer as ow_module
        importlib.reload(ff_module)
        importlib.reload(ow_module)

        with patch.object(
            ow_module, "is_finance_enabled_for_org", AsyncMock(return_value=True)
        ), patch.object(
            ow_module, "get_redis_cache", AsyncMock(return_value=MagicMock(is_available=False))
        ):
            result = await ow_module.OutboxWriter.publish(
                db=mock_db,
                event_type="sales_order_shipped",
                organization_id=str(uuid.uuid4()),
                company_code="A001",
                payload=_valid_payload(),
                source_user_id=str(uuid.uuid4()),
                event_id=str(uuid.uuid4()),
            )

    assert result is None


# ---------------------------------------------------------------------------
# Wave 0 — per-tenant flag gate (T-059.1)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_publish_skipped_when_tenant_flag_off() -> None:
    """Even with global flag on, a tenant with financeEnabled=false skips."""
    mock_collection = MagicMock()
    mock_collection.insert_one = AsyncMock()
    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)

    with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "true"}):
        import importlib
        import src.modules.finance_bridge.feature_flag as ff_module
        import src.modules.finance_bridge.outbox_writer as ow_module
        importlib.reload(ff_module)
        importlib.reload(ow_module)

        with patch.object(
            ow_module, "is_finance_enabled_for_org", AsyncMock(return_value=False)
        ), patch.object(
            ow_module, "get_redis_cache", AsyncMock(return_value=MagicMock(is_available=False))
        ):
            result = await ow_module.OutboxWriter.publish(
                db=mock_db,
                event_type="sales_order_shipped",
                organization_id=str(uuid.uuid4()),
                company_code="A001",
                payload=_valid_payload(),
                source_user_id=str(uuid.uuid4()),
            )

    assert result is None
    # Critical: no insert when the tenant's finance is off
    mock_collection.insert_one.assert_not_called()


@pytest.mark.asyncio
async def test_publish_continues_when_redis_unavailable() -> None:
    """get_redis_cache failure must not block the outbox path."""
    mock_collection = MagicMock()
    mock_collection.insert_one = AsyncMock(return_value=MagicMock(inserted_id="x"))
    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)

    with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "true"}):
        import importlib
        import src.modules.finance_bridge.feature_flag as ff_module
        import src.modules.finance_bridge.outbox_writer as ow_module
        importlib.reload(ff_module)
        importlib.reload(ow_module)

        # Reason: simulate Redis being broken — the gate must still run
        # via direct DB lookup. We force is_finance_enabled_for_org True
        # so the test asserts the call survives the cache-fetch error.
        with patch.object(
            ow_module, "get_redis_cache", AsyncMock(side_effect=Exception("redis dead"))
        ), patch.object(
            ow_module, "is_finance_enabled_for_org", AsyncMock(return_value=True)
        ):
            event_id = await ow_module.OutboxWriter.publish(
                db=mock_db,
                event_type="sales_order_shipped",
                organization_id=str(uuid.uuid4()),
                company_code="A001",
                payload=_valid_payload(),
                source_user_id=str(uuid.uuid4()),
            )

    assert event_id is not None
    mock_collection.insert_one.assert_awaited_once()
