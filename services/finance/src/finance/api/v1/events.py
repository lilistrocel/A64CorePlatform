"""
Finance Events Ingestion Endpoint

Receives outbox events from the consumer worker and records them as
processed in the `outbox_events_processed` table.

Auth: Service-to-service shared secret via `X-Service-Secret` header.
This endpoint does NOT use JWT — it is called by the internal consumer
worker, not by browser clients.

Week 3 scope: The actual posting logic (DR/CR journal entries) is a NO-OP.
The endpoint simply validates the event, checks idempotency, inserts into
`outbox_events_processed`, and returns.  The real handlers ship in Week 4.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import settings
from ...db.session import get_db
from ...models.orm.models import OutboxEventsProcessed, OutboxEventResultEnum

# Import shared contracts — both the envelope and the registry
from contracts.finance_events import BaseFinanceEvent, EVENT_TYPE_REGISTRY

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Events — Outbox Ingest"])


# ---------------------------------------------------------------------------
# Service-to-service auth dependency
# ---------------------------------------------------------------------------


async def verify_service_secret(
    x_service_secret: str = Header(
        ...,
        alias="X-Service-Secret",
        description="Shared secret for service-to-service auth (consumer → finance)",
    ),
) -> None:
    """
    Dependency that validates the X-Service-Secret header.

    Raises:
        HTTPException 401: If the header is missing or does not match
                           the FINANCE_INGESTION_SECRET setting.
    """
    # Reason: constant-time comparison prevents timing attacks on the secret
    import hmac

    if not hmac.compare_digest(x_service_secret, settings.FINANCE_INGESTION_SECRET):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Service-Secret",
        )


# ---------------------------------------------------------------------------
# Ingest endpoint
# ---------------------------------------------------------------------------


@router.post(
    "/events/ingest",
    status_code=status.HTTP_200_OK,
    summary="Ingest an outbox event from the consumer worker",
    description=(
        "Service-to-service endpoint (X-Service-Secret auth). "
        "Validates the event, checks idempotency, records as processed. "
        "Week 3: posting logic is a stub — actual GL entries ship in Week 4."
    ),
    dependencies=[Depends(verify_service_secret)],
)
async def ingest_event(
    event: BaseFinanceEvent,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Receive, validate, and record an outbox event.

    Args:
        event: Validated BaseFinanceEvent envelope from the consumer.
        db: Async SQLAlchemy session.

    Returns:
        Dict with status ('processed' or 'already_processed'), eventId,
        and processedAt timestamp.
    """
    event_id = str(event.eventId)

    # ------------------------------------------------------------------
    # 1. Validate eventType against registry
    # ------------------------------------------------------------------
    if event.eventType not in EVENT_TYPE_REGISTRY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown eventType '{event.eventType}'. "
            f"Valid types: {list(EVENT_TYPE_REGISTRY.keys())}",
        )

    # ------------------------------------------------------------------
    # 2. Validate payload shape against the registered payload class
    # ------------------------------------------------------------------
    payload_class = EVENT_TYPE_REGISTRY[event.eventType]
    try:
        payload_class(**event.payload)
    except (ValidationError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid payload for eventType '{event.eventType}': {str(exc)[:500]}",
        )

    # ------------------------------------------------------------------
    # 3. Idempotency check — return 200 if already processed
    # ------------------------------------------------------------------
    existing = await db.execute(
        select(OutboxEventsProcessed).where(
            OutboxEventsProcessed.eventId == event_id
        )
    )
    existing_row = existing.scalar_one_or_none()

    if existing_row is not None:
        logger.info(
            "[Finance/Ingest] already_processed event_id=%s event_type=%s",
            event_id,
            event.eventType,
        )
        return {
            "status": "already_processed",
            "eventId": event_id,
            "originalProcessedAt": existing_row.processedAt.isoformat()
            if existing_row.processedAt
            else None,
        }

    # ------------------------------------------------------------------
    # 4. Week 3: posting logic is a NO-OP stub
    #    Week 4 will replace this with actual GL journal entry creation.
    # ------------------------------------------------------------------
    logger.info(
        "[Finance/Ingest] received event event_type=%s event_id=%s "
        "org=%s company=%s",
        event.eventType,
        event_id,
        str(event.organizationId),
        event.companyCode,
    )

    # ------------------------------------------------------------------
    # 5. Record in outbox_events_processed (idempotency table)
    # ------------------------------------------------------------------
    now = datetime.now(tz=timezone.utc)
    processed_row = OutboxEventsProcessed(
        eventId=event_id,
        eventType=event.eventType,
        organizationId=str(event.organizationId),
        companyCode=event.companyCode,
        occurredAt=event.occurredAt.replace(tzinfo=None)
        if event.occurredAt.tzinfo
        else event.occurredAt,
        processedAt=now.replace(tzinfo=None),
        result=OutboxEventResultEnum.SUCCESS,
        errorMessage=None,
    )
    db.add(processed_row)
    await db.commit()
    await db.refresh(processed_row)

    logger.info(
        "[Finance/Ingest] recorded event_id=%s processedAt=%s",
        event_id,
        processed_row.processedAt,
    )

    return {
        "status": "processed",
        "eventId": event_id,
        "processedAt": processed_row.processedAt.isoformat()
        if processed_row.processedAt
        else now.isoformat(),
    }
