"""
Finance Outbox Repository

Query helpers for the `finance_outbox` MongoDB collection used by the
consumer worker.  All mutations use atomic findOneAndUpdate to prevent
double-processing under concurrent consumer instances.

Collection schema (schemaless but enforced by OutboxWriter):
    _id          : ObjectId
    eventId      : str (UUID, unique index — idempotency key)
    eventType    : str
    organizationId: str
    companyCode  : str
    occurredAt   : datetime
    sourceUserId : str
    sourceDocumentId: str | None
    payload      : dict
    status       : 'pending' | 'processing' | 'processed' | 'failed'
    attempts     : int
    lastError    : str | None
    lastAttemptAt: datetime | None
    processedAt  : datetime | None
    createdAt    : datetime
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

_COLLECTION = "finance_outbox"
_STATUS_PENDING = "pending"
_STATUS_PROCESSING = "processing"
_STATUS_PROCESSED = "processed"
_STATUS_FAILED = "failed"


class OutboxRepository:
    """
    Async repository for the finance_outbox MongoDB collection.

    All methods accept a Motor AsyncIOMotorDatabase instance so they can
    be used from both the main app and the consumer worker.
    """

    # ------------------------------------------------------------------
    # Index initialisation (called once at startup)
    # ------------------------------------------------------------------

    @staticmethod
    async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
        """
        Create the required indexes on the finance_outbox collection.

        Safe to call on every startup — MongoDB is idempotent for
        index creation when the index already exists.

        Indexes:
            (status, createdAt) — consumer polling for pending events.
            eventId (unique)    — deduplication; prevents duplicate events
                                  from misconfigured producers.

        Args:
            db: Motor async database instance.
        """
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
        logger.info("[FinanceBridge] finance_outbox indexes ensured")

    # ------------------------------------------------------------------
    # Polling / claiming
    # ------------------------------------------------------------------

    @staticmethod
    async def claim_pending_batch(
        db: AsyncIOMotorDatabase,
        batch_size: int = 50,
        stale_after_seconds: int = 300,
    ) -> List[Dict[str, Any]]:
        """
        Atomically claim a batch of pending (or stale) events for processing.

        "Stale" events are those stuck in 'processing' for longer than
        `stale_after_seconds` — typically caused by a consumer crash.

        The claim operation uses findOneAndUpdate on each document
        individually to ensure only one consumer processes each event.

        Args:
            db: Motor async database instance.
            batch_size: Maximum number of events to claim.
            stale_after_seconds: Re-claim events stuck in 'processing'
                for longer than this many seconds.

        Returns:
            List of claimed event documents (already updated to
            status='processing').
        """
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
                # No more events to claim
                break
            claimed.append(doc)

        return claimed

    # ------------------------------------------------------------------
    # Status updates (called after HTTP POST to finance service)
    # ------------------------------------------------------------------

    @staticmethod
    async def mark_processed(
        db: AsyncIOMotorDatabase,
        event_id: str,
    ) -> None:
        """
        Mark an event as successfully processed.

        Args:
            db: Motor async database instance.
            event_id: The eventId string (UUID) to update.
        """
        now = datetime.now(tz=timezone.utc)
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

    @staticmethod
    async def mark_failed(
        db: AsyncIOMotorDatabase,
        event_id: str,
        error: str,
        attempts: int,
    ) -> None:
        """
        Mark an event as permanently failed after exhausting retry attempts.

        Args:
            db: Motor async database instance.
            event_id: The eventId string (UUID) to update.
            error: Human-readable description of the last error.
            attempts: Total number of delivery attempts made.
        """
        now = datetime.now(tz=timezone.utc)
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

    @staticmethod
    async def increment_attempt(
        db: AsyncIOMotorDatabase,
        event_id: str,
        error: str,
    ) -> int:
        """
        Increment the attempt counter and reset status to 'pending' for retry.

        Called when a delivery attempt failed but max_attempts not yet reached.

        Args:
            db: Motor async database instance.
            event_id: The eventId string (UUID) to update.
            error: Human-readable description of the error.

        Returns:
            New total attempts count after increment.
        """
        now = datetime.now(tz=timezone.utc)
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

    # ------------------------------------------------------------------
    # Read helpers (diagnostics / admin)
    # ------------------------------------------------------------------

    @staticmethod
    async def count_by_status(db: AsyncIOMotorDatabase) -> Dict[str, int]:
        """
        Return a count of outbox events grouped by status.

        Args:
            db: Motor async database instance.

        Returns:
            Dict mapping status string to count.
        """
        pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
        cursor = db[_COLLECTION].aggregate(pipeline)
        result: Dict[str, int] = {}
        async for doc in cursor:
            result[doc["_id"]] = doc["count"]
        return result

    @staticmethod
    async def get_failed_events(
        db: AsyncIOMotorDatabase,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """
        Retrieve failed events for manual inspection or re-queue.

        Args:
            db: Motor async database instance.
            limit: Maximum events to return.

        Returns:
            List of failed event documents, newest first.
        """
        cursor = (
            db[_COLLECTION]
            .find({"status": _STATUS_FAILED})
            .sort("lastAttemptAt", -1)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)
