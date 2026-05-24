"""
Finance Outbox Writer

Provides OutboxWriter.publish() — the single entry point for main-app code
to emit finance domain events into the MongoDB `finance_outbox` collection.

Design decisions
----------------
- Gated by FINANCE_OUTBOX_ENABLED env var (see feature_flag.py).
  If disabled the method is a no-op so the main app runs normally without
  the finance service.
- Validates the payload against the contracts registry before writing.
  Invalid payloads raise ValueError immediately (fail-fast at the producer).
- Designed to be called inside the same Mongo session/transaction as the
  business write so the outbox insert and the business mutation are atomic.
  Pass `session=session` (Motor AsyncIOMotorClientSession) to participate in
  the caller's transaction.  Default `session=None` keeps the call outside
  any transaction (backwards-compatible with pre-Phase-2 callers).
- The eventId is generated here if not supplied so callers don't need to
  import uuid.

Example usage (Phase 2 — inside a Mongo session transaction):
    from src.modules.finance_bridge.outbox_writer import OutboxWriter

    async with await db.client.start_session() as session:
        async with session.start_transaction():
            await db["document_headers"].update_one({...}, {...}, session=session)
            await OutboxWriter.publish(
                db=db,
                event_type="pr_state_changed",
                organization_id="<uuid>",
                company_code="1000",
                payload={...},
                source_user_id="<uuid>",
                source_document_id="<doc_id>",
                session=session,
            )
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase

from contracts.finance_events import EVENT_TYPE_REGISTRY

from src.core.cache.redis_cache import get_redis_cache

from .feature_flag import is_outbox_enabled
from .tenant_flag import is_finance_enabled_for_org

logger = logging.getLogger(__name__)

_COLLECTION = "finance_outbox"


class OutboxWriter:
    """
    Stateless utility class for publishing finance events to the outbox.

    All methods are class-methods / static-methods — no instance needed.
    """

    @classmethod
    async def publish(
        cls,
        db: AsyncIOMotorDatabase,
        event_type: str,
        organization_id: str,
        company_code: str,
        payload: Dict[str, Any],
        source_user_id: str,
        source_document_id: Optional[str] = None,
        event_id: Optional[str] = None,
        session: Optional[AsyncIOMotorClientSession] = None,
    ) -> Optional[str]:
        """
        Validate and publish a finance domain event to the outbox collection.

        If FINANCE_OUTBOX_ENABLED is False the method is a no-op and returns
        None immediately without touching the session.

        Args:
            db: Motor async database instance (same connection as the caller's
                business write — keeps them in the same "transaction context").
            event_type: One of the keys in EVENT_TYPE_REGISTRY
                        (e.g. 'sales_order_shipped').
            organization_id: UUID string of the owning organisation.
            company_code: Company code (SAP-style legal entity key).
            payload: Dict matching the schema for `event_type`.
                     Validated against EVENT_TYPE_REGISTRY[event_type] before
                     writing.
            source_user_id: UUID string of the user who triggered the action.
            source_document_id: Optional opaque id linking back to the MongoDB
                                 source document (e.g. order ObjectId hex str).
            event_id: Optional UUID string.  Generated automatically if omitted.
            session: Optional Motor client session.  When provided, the insert
                     participates in the caller's active transaction so the
                     outbox write and the business mutation are atomic.  Default
                     None keeps the call outside any transaction (backwards-
                     compatible with pre-Phase-2 callers).

        Returns:
            The eventId (str UUID) if the event was written, None if outbox is
            disabled or if a duplicate eventId already exists.

        Raises:
            ValueError: If event_type is not in EVENT_TYPE_REGISTRY.
            pydantic.ValidationError: If payload does not match the schema.
            Exception: Any non-duplicate MongoDB error is re-raised so the
                       caller's transaction aborts and the failure is visible.
        """
        if not is_outbox_enabled():
            # Reason: feature flag off — main app must work without finance service
            logger.debug(
                "[FinanceBridge] outbox disabled; skipping event_type=%s", event_type
            )
            return None

        # Wave 0 — per-tenant gate. Even when the deploy-wide outbox is on,
        # tenants with `modules.financeEnabled=false` should not enqueue
        # events that nobody will ever process. Cached in Redis (60s TTL)
        # so we don't pay for a Mongo read per event.
        try:
            redis_cache = await get_redis_cache()
            redis_client = redis_cache._redis if redis_cache.is_available else None
        except Exception as exc:
            # Reason: cache layer failure must not block the outbox path —
            # fall through to a direct DB lookup inside the helper.
            logger.warning(
                "[FinanceBridge] failed to obtain redis client (will degrade to DB): %s",
                exc,
            )
            redis_client = None

        if not await is_finance_enabled_for_org(db, redis_client, organization_id):
            logger.debug(
                "[FinanceBridge] tenant flag off; skipping event_type=%s org=%s",
                event_type,
                organization_id,
            )
            return None

        # Reason: fail-fast validation at the producer — bad events never enter the queue
        if event_type not in EVENT_TYPE_REGISTRY:
            raise ValueError(
                f"Unknown finance event type '{event_type}'. "
                f"Valid types: {list(EVENT_TYPE_REGISTRY.keys())}"
            )

        payload_class = EVENT_TYPE_REGISTRY[event_type]
        # Raises pydantic.ValidationError if payload shape is wrong
        payload_class(**payload)

        generated_event_id = event_id or str(uuid.uuid4())
        now = datetime.now(tz=timezone.utc)

        doc: Dict[str, Any] = {
            "eventId": generated_event_id,
            "eventType": event_type,
            "organizationId": organization_id,
            "companyCode": company_code,
            "occurredAt": now,
            "sourceUserId": source_user_id,
            "sourceDocumentId": source_document_id,
            "payload": payload,
            "status": "pending",
            "attempts": 0,
            "lastError": None,
            "lastAttemptAt": None,
            "processedAt": None,
            "createdAt": now,
        }

        try:
            # Reason: pass session so insert participates in the caller's Mongo
            # transaction when one is active; None is a no-op for Motor.
            await db[_COLLECTION].insert_one(doc, session=session)
            logger.info(
                "[FinanceBridge] published event event_type=%s event_id=%s",
                event_type,
                generated_event_id,
            )
            return generated_event_id
        except Exception as exc:
            # Reason: duplicate key on eventId means caller already published —
            # treat as idempotent success rather than a hard error.
            if "duplicate key" in str(exc).lower() or "11000" in str(exc):
                logger.warning(
                    "[FinanceBridge] duplicate eventId=%s — skipping",
                    generated_event_id,
                )
                return None
            logger.error(
                "[FinanceBridge] failed to write event event_type=%s: %s",
                event_type,
                exc,
            )
            raise
