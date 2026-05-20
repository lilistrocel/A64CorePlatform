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
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import settings
from ...db.session import get_db
from ...models.orm.models import (
    GLAccount,
    OutboxEventResultEnum,
    OutboxEventsProcessed,
    PurchaseItemFinanceExt,
    VendorFinanceExt,
)

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
# Phase 1A master data event handlers
# ---------------------------------------------------------------------------


async def _resolve_account_id(
    db: AsyncSession, organization_id: str, account_number: str
) -> Optional[str]:
    """
    Resolve a GL account number to its accountId UUID for an organisation.

    Args:
        db: Active SQLAlchemy async session.
        organization_id: Organisation to scope the lookup.
        account_number: Account number string (e.g. '221000-001').

    Returns:
        accountId string, or None if not found.
    """
    result = await db.execute(
        select(GLAccount.accountId).where(
            GLAccount.organizationId == organization_id,
            GLAccount.accountNumber == account_number,
        )
    )
    return result.scalar_one_or_none()


async def _handle_vendor_changed(
    db: AsyncSession, event: BaseFinanceEvent
) -> None:
    """
    Handle vendor_changed outbox events.

    - If isDeleted=True: mark vendor_finance_ext.isActive=False.
    - If new vendor: create vendor_finance_ext with default reconciliation
      account (221000-001 AP Control if it exists).
    - If existing vendor: update denormalized vendorCode only.
      Finance-specific fields are NOT overwritten.

    Args:
        db: Active SQLAlchemy async session.
        event: Validated BaseFinanceEvent envelope.
    """
    payload = event.payload
    vendor_id = str(payload["vendorId"])
    org_id = str(event.organizationId)

    # Look up existing ext row
    existing = await db.execute(
        select(VendorFinanceExt).where(
            VendorFinanceExt.organizationId == org_id,
            VendorFinanceExt.vendorId == vendor_id,
        )
    )
    ext_row = existing.scalar_one_or_none()

    if payload.get("isDeleted"):
        # Soft delete: mark inactive
        if ext_row:
            ext_row.isActive = False
            logger.info(
                "[Finance/Events] marked vendor_finance_ext inactive vendorId=%s", vendor_id
            )
        return

    if ext_row is None:
        # New vendor: create ext row with default reconciliation account
        recon_account_id = await _resolve_account_id(db, org_id, "221000-001")
        ext_row = VendorFinanceExt(
            organizationId=org_id,
            vendorId=vendor_id,
            vendorCode=str(payload["vendorCode"]),
            reconciliationAccountId=recon_account_id,
            defaultExpenseAccountId=None,
            isActive=True,
        )
        db.add(ext_row)
        logger.info(
            "[Finance/Events] created vendor_finance_ext vendorId=%s recon_account=%s",
            vendor_id, recon_account_id,
        )
    else:
        # Existing: only update denormalized vendorCode
        ext_row.vendorCode = str(payload["vendorCode"])
        ext_row.isActive = True
        logger.info(
            "[Finance/Events] updated vendor_finance_ext vendorId=%s", vendor_id
        )


# ---------------------------------------------------------------------------
# Item type → default inventory account mapping
# ---------------------------------------------------------------------------
_ITEM_TYPE_ACCOUNT_MAP = {
    "raw_material": "121000-002",       # Raw Materials - Fertilisers (generic fallback)
    "consumable": "121000-004",         # Raw Materials - Packaging (generic fallback)
    "service": None,                    # Services don't go to inventory
    "fixed_asset_acquisition": "110000-005",  # Machinery & Equipment
}

# GRNI Clearing account number
_GRNI_CLEARING_ACCOUNT = "221000-099"


async def _handle_purchase_item_changed(
    db: AsyncSession, event: BaseFinanceEvent
) -> None:
    """
    Handle purchase_item_changed outbox events.

    - If isDeleted=True: mark purchase_item_finance_ext.isActive=False.
    - If new item: create ext with default inventory account based on itemType.
    - If existing: update denormalized itemCode only.

    Args:
        db: Active SQLAlchemy async session.
        event: Validated BaseFinanceEvent envelope.
    """
    payload = event.payload
    item_id = str(payload["itemId"])
    org_id = str(event.organizationId)

    existing = await db.execute(
        select(PurchaseItemFinanceExt).where(
            PurchaseItemFinanceExt.organizationId == org_id,
            PurchaseItemFinanceExt.itemId == item_id,
        )
    )
    ext_row = existing.scalar_one_or_none()

    if payload.get("isDeleted"):
        if ext_row:
            ext_row.isActive = False
            logger.info(
                "[Finance/Events] marked purchase_item_finance_ext inactive itemId=%s", item_id
            )
        return

    if ext_row is None:
        # Determine default inventory account from itemType
        item_type = str(payload.get("itemType", "raw_material"))
        inv_acct_num = _ITEM_TYPE_ACCOUNT_MAP.get(item_type)
        inv_acct_id = (
            await _resolve_account_id(db, org_id, inv_acct_num)
            if inv_acct_num
            else None
        )

        # Resolve GRNI clearing account
        grni_id = await _resolve_account_id(db, org_id, _GRNI_CLEARING_ACCOUNT)

        from ...models.orm.models import ValuationMethodEnum

        ext_row = PurchaseItemFinanceExt(
            organizationId=org_id,
            itemId=item_id,
            itemCode=str(payload["itemCode"]),
            inventoryAccountId=inv_acct_id,
            cogsAccountId=None,
            allocationAccountId=grni_id,
            valuationMethod=ValuationMethodEnum.MOVING_AVERAGE,
            isActive=True,
        )
        db.add(ext_row)
        logger.info(
            "[Finance/Events] created purchase_item_finance_ext itemId=%s inv_acct=%s",
            item_id, inv_acct_id,
        )
    else:
        # Only update denormalized itemCode
        ext_row.itemCode = str(payload["itemCode"])
        ext_row.isActive = True
        logger.info(
            "[Finance/Events] updated purchase_item_finance_ext itemId=%s", item_id
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
    # 4a. Phase 1A — Handle master data sync events
    # ------------------------------------------------------------------
    if event.eventType == "vendor_changed":
        await _handle_vendor_changed(db, event)
    elif event.eventType == "purchase_item_changed":
        await _handle_purchase_item_changed(db, event)
    elif event.eventType == "payment_terms_changed":
        # Operations holds the master; finance just logs receipt.
        logger.info(
            "[Finance/Ingest] payment_terms_changed received org=%s terms_code=%s",
            str(event.organizationId),
            event.payload.get("termsCode"),
        )
    else:
        # All other event types: posting logic is a NO-OP stub for now.
        # Week 4 will implement GL journal entries.
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
