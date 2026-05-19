"""
Tests for the consumer poller

Covers:
    - Successful delivery → event marked processed, attempts unchanged
    - HTTP 500 on first attempt, success on second → marked processed, attempts=1
      (retried on next poll cycle after increment_attempt resets to pending)
    - HTTP 500 exhausted (max_attempts reached) → marked failed
    - already_processed response → treated as success, marked processed
    - Permanent 4xx failure → marked failed immediately without retrying

All MongoDB and HTTP interactions are mocked — no live services required.
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Dict
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# We need to mock settings before import so CONSUMER_MAX_ATTEMPTS is stable
from unittest.mock import patch as _patch


def _make_event(event_id: str | None = None, attempts: int = 0) -> Dict[str, Any]:
    """Build a minimal outbox event document."""
    return {
        "eventId": event_id or str(uuid.uuid4()),
        "eventType": "sales_order_shipped",
        "organizationId": str(uuid.uuid4()),
        "companyCode": "A001",
        "occurredAt": datetime.now(tz=timezone.utc),
        "sourceUserId": str(uuid.uuid4()),
        "sourceDocumentId": "order-001",
        "payload": {
            "salesOrderId": str(uuid.uuid4()),
            "customerId": str(uuid.uuid4()),
            "farmCode": "ALAIN-01",
            "lines": [],
            "totalNetAmount": "100.00",
            "totalTaxAmount": "5.00",
            "totalGrossAmount": "105.00",
        },
        "status": "processing",
        "attempts": attempts,
    }


# ---------------------------------------------------------------------------
# Successful delivery
# ---------------------------------------------------------------------------


async def test_process_event_success() -> None:
    """Successful HTTP delivery → mark_processed called, attempt not incremented."""
    event = _make_event()
    event_id = event["eventId"]

    mock_client = MagicMock()
    mock_client.ingest_event = AsyncMock(return_value=(True, False, "processed"))

    with patch("consumer.poller.mongo") as mock_mongo:
        mock_mongo.mark_processed = AsyncMock()
        mock_mongo.mark_failed = AsyncMock()
        mock_mongo.increment_attempt = AsyncMock()

        from consumer.poller import process_event
        await process_event(event, mock_client)

    mock_client.ingest_event.assert_awaited_once()
    mock_mongo.mark_processed.assert_awaited_once_with(event_id)
    mock_mongo.mark_failed.assert_not_awaited()
    mock_mongo.increment_attempt.assert_not_awaited()


# ---------------------------------------------------------------------------
# Idempotent already_processed response
# ---------------------------------------------------------------------------


async def test_process_event_already_processed() -> None:
    """Finance service returns already_processed → treated as success."""
    event = _make_event()
    event_id = event["eventId"]

    mock_client = MagicMock()
    mock_client.ingest_event = AsyncMock(return_value=(True, False, "already_processed"))

    with patch("consumer.poller.mongo") as mock_mongo:
        mock_mongo.mark_processed = AsyncMock()
        mock_mongo.mark_failed = AsyncMock()
        mock_mongo.increment_attempt = AsyncMock()

        from consumer.poller import process_event
        await process_event(event, mock_client)

    mock_mongo.mark_processed.assert_awaited_once_with(event_id)
    mock_mongo.mark_failed.assert_not_awaited()


# ---------------------------------------------------------------------------
# Transient failure → retry
# ---------------------------------------------------------------------------


async def test_process_event_transient_retry() -> None:
    """HTTP 500 on first attempt → attempt incremented, reset to pending for retry."""
    event = _make_event(attempts=0)
    event_id = event["eventId"]

    mock_client = MagicMock()
    # Transient failure (success=False, is_permanent=False)
    mock_client.ingest_event = AsyncMock(
        return_value=(False, False, "HTTP 500: server error")
    )

    with patch("consumer.poller.mongo") as mock_mongo, \
         patch("consumer.poller.settings") as mock_settings:
        mock_settings.CONSUMER_MAX_ATTEMPTS = 5
        mock_mongo.mark_processed = AsyncMock()
        mock_mongo.mark_failed = AsyncMock()
        # increment_attempt returns 1 (first retry, below max)
        mock_mongo.increment_attempt = AsyncMock(return_value=1)

        from consumer.poller import process_event
        await process_event(event, mock_client)

    mock_mongo.increment_attempt.assert_awaited_once_with(event_id, "HTTP 500: server error")
    mock_mongo.mark_failed.assert_not_awaited()
    mock_mongo.mark_processed.assert_not_awaited()


async def test_process_event_retry_then_success() -> None:
    """
    Simulate: first poll cycle fails (increment_attempt), second poll cycle succeeds.

    This is two separate process_event calls — the second event has attempts=1
    from the first cycle.
    """
    event_id = str(uuid.uuid4())

    # --- First call: transient failure ---
    event_v1 = _make_event(event_id=event_id, attempts=0)
    mock_client = MagicMock()
    mock_client.ingest_event = AsyncMock(
        return_value=(False, False, "HTTP 500: transient")
    )

    with patch("consumer.poller.mongo") as mock_mongo, \
         patch("consumer.poller.settings") as mock_settings:
        mock_settings.CONSUMER_MAX_ATTEMPTS = 5
        mock_mongo.mark_processed = AsyncMock()
        mock_mongo.mark_failed = AsyncMock()
        mock_mongo.increment_attempt = AsyncMock(return_value=1)

        from consumer.poller import process_event
        await process_event(event_v1, mock_client)

    mock_mongo.increment_attempt.assert_awaited_once()

    # --- Second call: success ---
    event_v2 = _make_event(event_id=event_id, attempts=1)
    mock_client2 = MagicMock()
    mock_client2.ingest_event = AsyncMock(return_value=(True, False, "processed"))

    with patch("consumer.poller.mongo") as mock_mongo2, \
         patch("consumer.poller.settings") as mock_settings2:
        mock_settings2.CONSUMER_MAX_ATTEMPTS = 5
        mock_mongo2.mark_processed = AsyncMock()
        mock_mongo2.mark_failed = AsyncMock()
        mock_mongo2.increment_attempt = AsyncMock()

        await process_event(event_v2, mock_client2)

    mock_mongo2.mark_processed.assert_awaited_once_with(event_id)
    mock_mongo2.mark_failed.assert_not_awaited()
    mock_mongo2.increment_attempt.assert_not_awaited()


# ---------------------------------------------------------------------------
# Exhausted retries → mark failed
# ---------------------------------------------------------------------------


async def test_process_event_max_attempts_exhausted() -> None:
    """
    After increment_attempt returns >= max_attempts → event marked failed.
    """
    event = _make_event(attempts=4)  # already tried 4 times
    event_id = event["eventId"]

    mock_client = MagicMock()
    mock_client.ingest_event = AsyncMock(
        return_value=(False, False, "HTTP 503: still down")
    )

    with patch("consumer.poller.mongo") as mock_mongo, \
         patch("consumer.poller.settings") as mock_settings:
        mock_settings.CONSUMER_MAX_ATTEMPTS = 5
        # increment_attempt returns 5 (= max_attempts)
        mock_mongo.increment_attempt = AsyncMock(return_value=5)
        mock_mongo.mark_failed = AsyncMock()
        mock_mongo.mark_processed = AsyncMock()

        from consumer.poller import process_event
        await process_event(event, mock_client)

    mock_mongo.mark_failed.assert_awaited_once_with(event_id, "HTTP 503: still down", 5)
    mock_mongo.mark_processed.assert_not_awaited()


# ---------------------------------------------------------------------------
# Permanent 4xx failure
# ---------------------------------------------------------------------------


async def test_process_event_permanent_failure() -> None:
    """4xx response → mark_failed immediately (no retry)."""
    event = _make_event(attempts=0)
    event_id = event["eventId"]

    mock_client = MagicMock()
    mock_client.ingest_event = AsyncMock(
        return_value=(False, True, "HTTP 400: unknown eventType")
    )

    with patch("consumer.poller.mongo") as mock_mongo:
        mock_mongo.mark_processed = AsyncMock()
        mock_mongo.mark_failed = AsyncMock()
        mock_mongo.increment_attempt = AsyncMock()

        from consumer.poller import process_event
        await process_event(event, mock_client)

    mock_mongo.mark_failed.assert_awaited_once()
    args = mock_mongo.mark_failed.await_args[0]
    assert args[0] == event_id
    assert "400" in args[1]
    mock_mongo.increment_attempt.assert_not_awaited()
    mock_mongo.mark_processed.assert_not_awaited()


# ---------------------------------------------------------------------------
# Poll cycle with batch
# ---------------------------------------------------------------------------


async def test_run_poll_cycle_empty_batch() -> None:
    """No pending events → run_poll_cycle returns 0."""
    mock_client = MagicMock()

    with patch("consumer.poller.mongo") as mock_mongo, \
         patch("consumer.poller.settings") as mock_settings:
        mock_settings.CONSUMER_BATCH_SIZE = 50
        mock_settings.CONSUMER_STALE_CLAIM_SECONDS = 300
        mock_mongo.claim_pending_batch = AsyncMock(return_value=[])

        from consumer.poller import run_poll_cycle
        count = await run_poll_cycle(mock_client)

    assert count == 0


async def test_run_poll_cycle_processes_batch() -> None:
    """run_poll_cycle processes all events in a batch."""
    events = [_make_event() for _ in range(3)]
    mock_client = MagicMock()
    mock_client.ingest_event = AsyncMock(return_value=(True, False, "processed"))

    with patch("consumer.poller.mongo") as mock_mongo, \
         patch("consumer.poller.settings") as mock_settings:
        mock_settings.CONSUMER_BATCH_SIZE = 50
        mock_settings.CONSUMER_STALE_CLAIM_SECONDS = 300
        mock_settings.CONSUMER_MAX_ATTEMPTS = 5
        mock_mongo.claim_pending_batch = AsyncMock(return_value=events)
        mock_mongo.mark_processed = AsyncMock()
        mock_mongo.mark_failed = AsyncMock()
        mock_mongo.increment_attempt = AsyncMock()

        from consumer.poller import run_poll_cycle
        count = await run_poll_cycle(mock_client)

    assert count == 3
    assert mock_mongo.mark_processed.await_count == 3
