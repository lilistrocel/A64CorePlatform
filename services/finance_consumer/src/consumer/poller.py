"""
Outbox Poller

Main processing loop: claims a batch of pending events from MongoDB,
delivers each to the finance service, and updates status accordingly.

Retry strategy:
    - On transient HTTP failure: increment attempt counter, reset to
      'pending', wait for next poll cycle.
    - On permanent HTTP failure (4xx): mark failed immediately.
    - On max_attempts exhausted: mark failed permanently.
    - On already_processed response: treat as success (idempotent).
"""

import asyncio
import logging
from typing import Any, Dict

from . import mongo
from .config import settings
from .finance_client import FinanceClient, _backoff

logger = logging.getLogger(__name__)


async def process_event(
    event_doc: Dict[str, Any],
    client: FinanceClient,
) -> None:
    """
    Deliver a single event to the finance service and update outbox status.

    Args:
        event_doc: The MongoDB outbox document (already claimed as 'processing').
        client: Shared finance HTTP client.
    """
    event_id = str(event_doc.get("eventId", "unknown"))
    current_attempts = event_doc.get("attempts", 0)

    success, is_permanent, message = await client.ingest_event(event_doc)

    if success:
        await mongo.mark_processed(event_id)
        logger.info(
            "[Poller] processed event_id=%s event_type=%s",
            event_id,
            event_doc.get("eventType"),
        )
        return

    if is_permanent:
        # Reason: 4xx from finance means the event is malformed — escalate immediately
        new_attempts = current_attempts + 1
        await mongo.mark_failed(event_id, message, new_attempts)
        logger.error(
            "[Poller] permanent failure event_id=%s attempts=%d error=%s",
            event_id,
            new_attempts,
            message,
        )
        return

    # Transient failure — check if max attempts reached
    new_attempts = await mongo.increment_attempt(event_id, message)
    if new_attempts >= settings.CONSUMER_MAX_ATTEMPTS:
        await mongo.mark_failed(event_id, message, new_attempts)
        logger.error(
            "[Poller] max attempts exhausted event_id=%s attempts=%d",
            event_id,
            new_attempts,
        )
    else:
        logger.warning(
            "[Poller] retry scheduled event_id=%s attempt=%d/%d backoff=%.1fs",
            event_id,
            new_attempts,
            settings.CONSUMER_MAX_ATTEMPTS,
            _backoff(new_attempts),
        )


async def run_poll_cycle(client: FinanceClient) -> int:
    """
    Execute one poll cycle: claim batch, deliver each, return events processed.

    Args:
        client: Shared finance HTTP client.

    Returns:
        Number of events attempted this cycle.
    """
    events = await mongo.claim_pending_batch(
        batch_size=settings.CONSUMER_BATCH_SIZE,
        stale_after_seconds=settings.CONSUMER_STALE_CLAIM_SECONDS,
    )

    if not events:
        return 0

    logger.info("[Poller] claimed %d events for delivery", len(events))

    for event in events:
        try:
            await process_event(event, client)
        except Exception as exc:
            event_id = str(event.get("eventId", "unknown"))
            logger.exception(
                "[Poller] unexpected error processing event_id=%s: %s",
                event_id,
                exc,
            )
            # Reason: unexpected errors are transient — don't crash the loop
            await mongo.increment_attempt(event_id, str(exc))

    return len(events)
