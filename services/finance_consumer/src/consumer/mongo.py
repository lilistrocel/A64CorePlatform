"""
Consumer MongoDB Client

Provides Motor async client + outbox collection helpers.
Connection is established once at startup and reused throughout the worker's
lifetime.

Outbox query helpers here are deliberately thin — the heavy lifting lives in
the OutboxRepository from the contracts-adjacent outbox_repository module,
but the consumer re-implements the critical path inline to avoid importing
from src/ (the main app).  The consumer is a fully standalone process.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from .config import settings

logger = logging.getLogger(__name__)

_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None

_COLLECTION = "finance_outbox"
_STATUS_PENDING = "pending"
_STATUS_PROCESSING = "processing"
_STATUS_PROCESSED = "processed"
_STATUS_FAILED = "failed"


async def connect() -> None:
    """
    Initialise the Motor client and verify the connection.

    Raises:
        Exception: If the MongoDB server is unreachable.
    """
    global _client, _db
    # Reason: parse MONGODB_URL to extract the db name if encoded in the URL
    # but allow the explicit MONGODB_DB_NAME setting to override it.
    _client = AsyncIOMotorClient(settings.MONGODB_URL)
    _db = _client[settings.MONGODB_DB_NAME]
    # Verify connectivity
    await _client.admin.command("ping")
    logger.info(
        "[Consumer] MongoDB connected db=%s", settings.MONGODB_DB_NAME
    )


async def close() -> None:
    """Close the Motor client gracefully."""
    global _client, _db
    if _client is not None:
        _client.close()
        _client = None
        _db = None
    logger.info("[Consumer] MongoDB connection closed")


def get_db() -> AsyncIOMotorDatabase:
    """
    Return the active database instance.

    Raises:
        RuntimeError: If connect() has not been called.
    """
    if _db is None:
        raise RuntimeError("MongoDB not connected — call connect() first")
    return _db


# ---------------------------------------------------------------------------
# Outbox helpers (consumer-local copies — no dependency on src/)
# ---------------------------------------------------------------------------


async def ensure_indexes() -> None:
    """Create covering indexes on finance_outbox (idempotent)."""
    db = get_db()
    coll = db[_COLLECTION]
    await coll.create_index(
        [("status", 1), ("createdAt", 1)],
        name="ix_outbox_status_created",
    )
    await coll.create_index(
        "eventId",
        unique=True,
        name="ix_outbox_eventId_unique",
    )
    logger.info("[Consumer] finance_outbox indexes ensured")


async def claim_pending_batch(
    batch_size: int,
    stale_after_seconds: int,
) -> List[Dict[str, Any]]:
    """
    Atomically claim pending/stale events for processing.

    Args:
        batch_size: Maximum number of events to claim.
        stale_after_seconds: Re-claim events stuck in 'processing' longer than
                              this many seconds.

    Returns:
        List of claimed event documents (status already set to 'processing').
    """
    db = get_db()
    coll = db[_COLLECTION]
    now = datetime.now(tz=timezone.utc)
    stale_cutoff = datetime.fromtimestamp(
        now.timestamp() - stale_after_seconds, tz=timezone.utc
    )

    claimed: List[Dict[str, Any]] = []
    for _ in range(batch_size):
        doc = await coll.find_one_and_update(
            {
                "$or": [
                    {"status": _STATUS_PENDING},
                    {
                        "status": _STATUS_PROCESSING,
                        "lastAttemptAt": {"$lt": stale_cutoff},
                    },
                ]
            },
            {
                "$set": {
                    "status": _STATUS_PROCESSING,
                    "lastAttemptAt": now,
                }
            },
            sort=[("createdAt", 1)],
            return_document=True,
        )
        if doc is None:
            break
        claimed.append(doc)
    return claimed


async def mark_processed(event_id: str) -> None:
    """
    Mark event as successfully processed.

    Args:
        event_id: The eventId string.
    """
    now = datetime.now(tz=timezone.utc)
    db = get_db()
    await db[_COLLECTION].update_one(
        {"eventId": event_id},
        {
            "$set": {
                "status": _STATUS_PROCESSED,
                "processedAt": now,
                "lastAttemptAt": now,
                "lastError": None,
            }
        },
    )


async def mark_failed(event_id: str, error: str, attempts: int) -> None:
    """
    Mark event as permanently failed.

    Args:
        event_id: The eventId string.
        error: Last error message.
        attempts: Total attempts made.
    """
    now = datetime.now(tz=timezone.utc)
    db = get_db()
    await db[_COLLECTION].update_one(
        {"eventId": event_id},
        {
            "$set": {
                "status": _STATUS_FAILED,
                "lastError": error,
                "lastAttemptAt": now,
                "attempts": attempts,
            }
        },
    )


async def increment_attempt(event_id: str, error: str) -> int:
    """
    Increment attempt counter and reset to 'pending' for retry.

    Args:
        event_id: The eventId string.
        error: Error message from last attempt.

    Returns:
        New total attempts count.
    """
    now = datetime.now(tz=timezone.utc)
    db = get_db()
    result = await db[_COLLECTION].find_one_and_update(
        {"eventId": event_id},
        {
            "$inc": {"attempts": 1},
            "$set": {
                "status": _STATUS_PENDING,
                "lastError": error,
                "lastAttemptAt": now,
            },
        },
        return_document=True,
    )
    return result["attempts"] if result else 1
