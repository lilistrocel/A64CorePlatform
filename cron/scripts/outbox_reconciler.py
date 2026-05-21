"""
Finance Outbox Reconciliation Sweeper

Periodic safety-net job that detects gaps between document_headers and
finance_outbox and back-fills any missing events.

Problem it solves
-----------------
In document_service.py every PR/PO state change performs two separate Mongo
writes — an update_one on document_headers followed by OutboxWriter.publish()
inserting a row in finance_outbox.  These two writes are NOT in a transaction
(Mongo runs standalone, no replica-set support yet).  The outbox write is
wrapped in a bare try/except that swallows failures (lines 473 / 524).  If
the second write fails silently, the document moves to its new terminal state
but finance never receives the event.

This sweeper runs every N minutes, finds the gaps, and re-emits the events.

Idempotency
-----------
The event_id passed to OutboxWriter.publish is derived deterministically via
uuid5(SWEEPER_NAMESPACE, f"{docId}:{currentStatus}").  OutboxWriter.publish
treats a duplicate key on eventId as a no-op (returns None, no exception).
Two sweeper runs in quick succession therefore produce at most one row.

Feature flag
-----------
If FINANCE_OUTBOX_ENABLED is not "true" / "1" / "yes" the sweeper exits
cleanly — no MongoDB scan, no writes.

Usage
-----
    python -m cron.scripts.outbox_reconciler      # from repo root
    python outbox_reconciler.py                   # from cron/scripts/

Environment variables
---------------------
    MONGODB_URL        MongoDB connection string (default: mongodb://mongodb:27017)
    MONGODB_DB_NAME    Database name           (default: a64core_db)
    FINANCE_OUTBOX_ENABLED  "true" / "1" / "yes" to activate (default: false)
"""

import asyncio
import logging
import os
import sys
import uuid
from typing import Any, Dict, List, Optional

import motor.motor_asyncio

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger("outbox_reconciler")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Finance-relevant terminal statuses that MUST have a matching outbox row.
# Draft and Pending Approval are excluded — they do not produce outbox events.
_PR_FINANCE_STATUSES: List[str] = ["Approved", "Closed"]
_PO_FINANCE_STATUSES: List[str] = ["Open", "Sent", "Cancelled"]

# Deterministic UUID namespace for sweeper-generated event IDs.
# Changing this namespace would invalidate all existing sweeper event IDs —
# so treat it as frozen once deployed.
_SWEEPER_NAMESPACE = uuid.UUID("b7e2a3f4-d1c0-4e5b-8a9f-0c1d2e3f4a5b")

_HEADERS_COL = "document_headers"
_OUTBOX_COL = "finance_outbox"


# ---------------------------------------------------------------------------
# Deterministic event ID
# ---------------------------------------------------------------------------


def make_sweeper_event_id(doc_id: str, current_status: str) -> str:
    """
    Derive a deterministic UUID for a sweeper-emitted event.

    Uses uuid5 in a sweeper-specific namespace so that two sweeper runs
    for the same (docId, status) pair always produce the same UUID.
    OutboxWriter treats a duplicate eventId as a no-op, making the sweeper
    fully idempotent.

    Args:
        doc_id: The document's docId field (string UUID from document_headers).
        current_status: The document's current status string.

    Returns:
        UUID string suitable for passing as event_id= to OutboxWriter.publish.
    """
    # Reason: deterministic so duplicate sweeper runs produce duplicate keys
    # which OutboxWriter silently ignores.
    return str(uuid.uuid5(_SWEEPER_NAMESPACE, f"{doc_id}:{current_status}:sweeper"))


# ---------------------------------------------------------------------------
# Outbox presence check
# ---------------------------------------------------------------------------


async def outbox_event_exists(
    db: motor.motor_asyncio.AsyncIOMotorDatabase,
    doc_id: str,
    current_status: str,
) -> bool:
    """
    Check whether finance_outbox already contains an event for this doc + status.

    Args:
        db: Motor async database instance.
        doc_id: The document's docId (used as sourceDocumentId in outbox rows).
        current_status: The status value that should appear in payload.state.

    Returns:
        True if a matching row exists, False if missing.
    """
    # Reason: query on both sourceDocumentId and payload.state so we don't
    # false-positive on earlier state events for the same document.
    existing = await db[_OUTBOX_COL].find_one(
        {
            "sourceDocumentId": doc_id,
            "payload.state": current_status,
        }
    )
    return existing is not None


# ---------------------------------------------------------------------------
# Payload builders (re-exported from document_service to avoid drift)
# ---------------------------------------------------------------------------


def _build_pr_payload(header: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build pr_state_changed payload from a raw header document.

    Delegates to the module-level builder in document_service so the payload
    contract is defined in exactly one place.

    Args:
        header: Raw document_headers MongoDB document.

    Returns:
        Dict matching PurchaseRequestStateChangedPayload.
    """
    # Resolve PYTHONPATH so the src/ tree is importable from the cron container.
    # The cron Dockerfile mounts the repo at /app and sets PYTHONPATH=/app/src:/app.
    from src.modules.purchasing.services.document_service import (
        build_pr_event_payload,
    )

    # Reason: sweeper has no knowledge of "previousState" — pass None.
    # Finance consumers should treat None previousState as "reconciler-emitted".
    company_code = header.get("companyCode", "1000")
    return build_pr_event_payload(header, previous_state=None, company_code=company_code)


def _build_po_payload(header: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build po_state_changed payload from a raw header document.

    Delegates to the module-level builder in document_service so the payload
    contract is defined in exactly one place.

    Args:
        header: Raw document_headers MongoDB document.

    Returns:
        Dict matching PurchaseOrderStateChangedPayload.
    """
    from src.modules.purchasing.services.document_service import (
        build_po_event_payload,
    )

    company_code = header.get("companyCode", "1000")
    return build_po_event_payload(header, previous_state=None, company_code=company_code)


# ---------------------------------------------------------------------------
# Core sweeper logic
# ---------------------------------------------------------------------------


async def run_sweep(db: motor.motor_asyncio.AsyncIOMotorDatabase) -> Dict[str, int]:
    """
    Scan document_headers for finance-relevant docs with missing outbox rows
    and back-fill them.

    Args:
        db: Connected Motor async database instance.

    Returns:
        Summary dict with keys: scanned, missing, re_emitted, errors.
    """
    from src.modules.finance_bridge.outbox_writer import OutboxWriter

    stats: Dict[str, int] = {
        "scanned": 0,
        "missing": 0,
        "re_emitted": 0,
        "errors": 0,
    }

    # Build query: all non-deleted docs in finance-relevant terminal states.
    all_terminal_statuses = _PR_FINANCE_STATUSES + _PO_FINANCE_STATUSES
    cursor = db[_HEADERS_COL].find(
        {
            "status": {"$in": all_terminal_statuses},
            "deletedAt": None,
        }
    )

    async for header in cursor:
        stats["scanned"] += 1
        doc_id: str = header["docId"]
        current_status: str = header["status"]
        doc_type: str = header.get("docType", "")

        # Determine event_type and validate the status is finance-relevant for this type.
        if doc_type == "PR" and current_status in _PR_FINANCE_STATUSES:
            event_type = "pr_state_changed"
        elif doc_type == "PO" and current_status in _PO_FINANCE_STATUSES:
            event_type = "po_state_changed"
        else:
            # Reason: status is valid globally but not finance-relevant for this docType.
            # e.g. a PR in "Cancelled" state does not get a finance event.
            continue

        try:
            already_emitted = await outbox_event_exists(db, doc_id, current_status)
            if already_emitted:
                continue

            stats["missing"] += 1
            logger.info(
                "[Sweeper] missing outbox event doc_id=%s doc_type=%s status=%s — re-emitting",
                doc_id,
                doc_type,
                current_status,
            )

            # Build the payload using the same builder as document_service.
            if doc_type == "PR":
                payload = _build_pr_payload(header)
            else:
                payload = _build_po_payload(header)

            # Derive deterministic event_id to prevent double-emission on concurrent runs.
            event_id = make_sweeper_event_id(doc_id, current_status)

            source_user_id: Optional[str] = (
                header.get("updatedBy") or header.get("createdBy")
            )
            if not source_user_id:
                # Reason: OutboxWriter requires a non-empty source_user_id.
                # Use a sentinel system UUID when the header has no user context.
                source_user_id = "00000000-0000-0000-0000-000000000000"

            result = await OutboxWriter.publish(
                db=db,
                event_type=event_type,
                organization_id=header["organizationId"],
                company_code=header.get("companyCode", "1000"),
                payload=payload,
                source_user_id=source_user_id,
                source_document_id=doc_id,
                event_id=event_id,
            )

            if result is not None:
                stats["re_emitted"] += 1
                logger.info(
                    "[Sweeper] re-emitted event_id=%s doc_id=%s status=%s",
                    event_id,
                    doc_id,
                    current_status,
                )
            else:
                # Reason: None return means duplicate key — event already existed
                # (race between two sweeper instances). Treat as success.
                logger.debug(
                    "[Sweeper] duplicate eventId=%s — already present, skipping",
                    event_id,
                )

        except Exception as exc:
            stats["errors"] += 1
            logger.error(
                "[Sweeper] error processing doc_id=%s: %s",
                doc_id,
                exc,
                exc_info=True,
            )

    return stats


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


async def main() -> None:
    """
    Entry point for the outbox reconciliation sweeper.

    Checks the feature flag, connects to MongoDB, runs one sweep, logs
    structured summary, and exits.
    """
    # Reason: import here so the feature flag module is resolved after env vars
    # are loaded (important when running in Docker where env comes from compose).
    from src.modules.finance_bridge.feature_flag import is_outbox_enabled

    if not is_outbox_enabled():
        logger.info(
            "[Sweeper] FINANCE_OUTBOX_ENABLED is not set — exiting cleanly. "
            "Set FINANCE_OUTBOX_ENABLED=true to activate reconciliation."
        )
        return

    mongodb_url: str = os.getenv("MONGODB_URL", "mongodb://mongodb:27017")
    db_name: str = os.getenv("MONGODB_DB_NAME", "a64core_db")

    logger.info(
        "[Sweeper] starting sweep db=%s url=%s",
        db_name,
        mongodb_url,
    )

    client = motor.motor_asyncio.AsyncIOMotorClient(mongodb_url)
    try:
        db = client[db_name]
        stats = await run_sweep(db)
    finally:
        client.close()

    logger.info(
        "[Sweeper] sweep complete scanned=%d missing=%d re_emitted=%d errors=%d",
        stats["scanned"],
        stats["missing"],
        stats["re_emitted"],
        stats["errors"],
    )

    # Exit non-zero if any errors occurred so cron logs can detect failures.
    if stats["errors"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
