"""
Sales Module — Document Chain Reconciler (T-201.9.0)

Generic helpers for the SAP B1 document-chain pattern used across the Sales
module.  Extracted from ar_invoice_service.py so the same logic can serve
both DN-sourced and SO-sourced AR Invoices without copy-paste.

Responsibilities
----------------
- Pure open-invoice-qty computation on a single source document line.
- Whole-document "fully invoiced" check (all lines ≤ TOLERANCE).
- Best-effort audit writes to any named audit collection.
- Auto-close / auto-reopen of source documents when invoice counters change.
- Dangling targetDocRef cleanup via $pull on header + per-line arrays.
- Counter reconciliation: apply pre-computed deltas to source lines via $inc,
  with an optional cap-check to prevent over-invoicing.

Collections touched
-------------------
The collection names are always supplied by the caller (e.g. "deliveries_v2",
"sales_orders_v2") — this module contains no hardcoded collection references.

Status vocabulary
-----------------
Uses DocumentStatus enum from src.core.documents.document_status.
Callers must ensure the source document's status field uses the same
string values (OPEN → "open", CLOSED → "closed").
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from ....core.documents.document_status import DocumentStatus

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Public constant
# ---------------------------------------------------------------------------

TOLERANCE = Decimal("0.0001")
"""
Float-comparison tolerance for open-quantity checks.

Any qty within TOLERANCE of zero is treated as "fully consumed" so that
floating-point rounding in compounded Decimal operations cannot create
spuriously non-zero remainders.
"""

_ZERO = Decimal("0")


# ---------------------------------------------------------------------------
# Time helper (module-local; not exported)
# ---------------------------------------------------------------------------


def _now() -> datetime:
    """Return timezone-aware UTC now."""
    return datetime.now(tz=timezone.utc)


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def line_open_invoice_qty(line: Dict[str, Any]) -> Decimal:
    """
    Compute the remaining open-to-invoice quantity on a source document line.

    open_invoice_qty = orderedQty - invoicedQty - creditedQty

    Falls back to ``quantity`` if ``orderedQty`` is absent, so the function
    works for documents that store the canonical quantity under either key.

    Args:
        line: Raw embedded line dict from any source document (Delivery,
              Sales Order, etc.).

    Returns:
        Remaining invoiceable quantity as Decimal.  Never negative, but the
        caller is responsible for asserting that before acting on the result.
    """
    ordered = Decimal(str(line.get("orderedQty", line.get("quantity", 0))))
    invoiced = Decimal(str(line.get("invoicedQty", 0)))
    credited = Decimal(str(line.get("creditedQty", 0)))
    return ordered - invoiced - credited


def is_doc_fully_invoiced(doc_raw: Dict[str, Any]) -> bool:
    """
    Return True when every line in the document has open_invoice_qty ≤ TOLERANCE.

    A document is "fully invoiced" when no more qty can be invoiced across
    all of its embedded lines — i.e. the per-line open_invoice_qty is within
    the float-comparison tolerance.

    Args:
        doc_raw: Raw source document dict (Delivery, Sales Order, etc.) with
                 the embedded ``lines`` array present.

    Returns:
        True if all lines are fully invoiced, False if any line still has
        open qty > TOLERANCE.
    """
    for ln in doc_raw.get("lines", []):
        if line_open_invoice_qty(ln) > TOLERANCE:
            return False
    return True


# ---------------------------------------------------------------------------
# Audit helper
# ---------------------------------------------------------------------------


async def write_chain_audit(
    db: AsyncIOMotorDatabase,
    *,
    audit_collection: str,
    doc_entry: str,
    action: str,
    user_id: str,
    detail: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Append an audit entry to the named audit collection.

    Used for auto_close / auto_reopen actions so the source document's audit
    trail records who (via AR Invoice creation / edit / delete / cancel)
    triggered the state change.

    Best-effort: logs a warning on failure but does not re-raise.  Audit
    failure must never roll back the originating operation.

    Args:
        db:               Motor database instance.
        audit_collection: Name of the audit collection to write to
                          (e.g. "deliveries_v2_audit",
                          "sales_orders_v2_audit").
        doc_entry:        UUID of the affected source document.
        action:           Short action label
                          (e.g. "auto_close_on_full_invoice").
        user_id:          User who triggered the originating AR Invoice
                          operation.
        detail:           Optional extra metadata dict.  Keys such as
                          ``triggeredByAriDocEntry`` and
                          ``triggeredByAriDocNumber`` are used by callers to
                          cross-reference the invoice that caused the event.

    Returns:
        None.

    Raises:
        Nothing — exceptions are caught and logged.
    """
    try:
        entry = {
            "docEntry": doc_entry,
            "action": action,
            "userId": user_id,
            "detail": detail or {},
            "timestamp": _now(),
        }
        await db[audit_collection].insert_one(entry)
    except Exception as exc:  # noqa: BLE001
        # Reason: audit failure must not roll back the originating operation.
        logger.warning(
            "Chain audit write failed for doc '%s' collection='%s' action=%s: %s",
            doc_entry,
            audit_collection,
            action,
            exc,
        )


# ---------------------------------------------------------------------------
# Auto-close / auto-reopen
# ---------------------------------------------------------------------------


async def auto_close_if_fully_invoiced(
    db: AsyncIOMotorDatabase,
    *,
    doc_collection: str,
    audit_collection: str,
    doc_entry: str,
    doc_raw: Dict[str, Any],
    org_id: str,
    user_id: str,
    action: str = "auto_close_on_full_invoice",
    extra_detail: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Transition a source document from OPEN to CLOSED when fully invoiced.

    Checks ``doc_raw`` (the caller-supplied reloaded document) to decide
    whether to transition.  The transition only fires when:
      - ``doc_raw.status == "open"`` (DocumentStatus.OPEN.value), AND
      - ``is_doc_fully_invoiced(doc_raw)`` returns True.

    This is a pure status flag for UI/listing purposes — no new outbox event
    is emitted here (the original delivery_posted / so_confirmed event
    already covers the finance side; CLOSED is not a new accounting event).

    Args:
        db:               Motor database instance.
        doc_collection:   Collection containing the source document
                          (e.g. "deliveries_v2").
        audit_collection: Audit collection to write the close event to
                          (e.g. "deliveries_v2_audit").
        doc_entry:        UUID of the source document.
        doc_raw:          Already-reloaded raw source document dict.  Caller
                          must pass the post-increment state so the check
                          reflects the latest invoicedQty values.
        org_id:           Organisation UUID for query scoping.
        user_id:          User who triggered the originating AR Invoice op.
        action:           Audit action label
                          (default: "auto_close_on_full_invoice").
        extra_detail:     Additional keys merged into the audit detail dict.

    Returns:
        True if the document was transitioned to CLOSED, False if it was
        already closed or is still not fully invoiced.
    """
    if doc_raw is None:
        return False
    if doc_raw.get("status") != DocumentStatus.OPEN.value:
        return False
    if not is_doc_fully_invoiced(doc_raw):
        return False

    now = _now()
    await db[doc_collection].update_one(
        {"docEntry": doc_entry, "organizationId": org_id},
        {
            "$set": {
                "status": DocumentStatus.CLOSED.value,
                "updatedAt": now,
                "updatedBy": user_id,
            }
        },
    )
    logger.info(
        "[DocChainReconciler] '%s' collection='%s' auto-closed on full invoice "
        "by user '%s'",
        doc_entry,
        doc_collection,
        user_id,
    )
    detail: Dict[str, Any] = dict(extra_detail or {})
    await write_chain_audit(
        db,
        audit_collection=audit_collection,
        doc_entry=doc_entry,
        action=action,
        user_id=user_id,
        detail=detail,
    )
    return True


async def auto_reopen_if_not_fully_invoiced(
    db: AsyncIOMotorDatabase,
    *,
    doc_collection: str,
    audit_collection: str,
    doc_entry: str,
    doc_raw: Dict[str, Any],
    org_id: str,
    user_id: str,
    action: str = "auto_reopen_on_invoice_release",
    extra_detail: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Transition a source document from CLOSED to OPEN when no longer fully invoiced.

    Checks ``doc_raw`` (the caller-supplied reloaded document) to decide
    whether to transition.  The transition only fires when:
      - ``doc_raw.status == "closed"`` (DocumentStatus.CLOSED.value), AND
      - ``is_doc_fully_invoiced(doc_raw)`` returns False.

    This covers the case where a DRAFT AR Invoice is deleted or edited
    downward (releasing previously-committed qty), or cancelled after posting.

    Args:
        db:               Motor database instance.
        doc_collection:   Collection containing the source document
                          (e.g. "deliveries_v2").
        audit_collection: Audit collection to write the reopen event to
                          (e.g. "deliveries_v2_audit").
        doc_entry:        UUID of the source document.
        doc_raw:          Already-reloaded raw source document dict.  Caller
                          must pass the post-decrement state so the check
                          reflects the latest invoicedQty values.
        org_id:           Organisation UUID for query scoping.
        user_id:          User who triggered the originating AR Invoice op.
        action:           Audit action label
                          (default: "auto_reopen_on_invoice_release").
        extra_detail:     Additional keys merged into the audit detail dict.

    Returns:
        True if the document was transitioned to OPEN, False if it was
        already open or is actually fully invoiced.
    """
    if doc_raw is None:
        return False
    if doc_raw.get("status") != DocumentStatus.CLOSED.value:
        return False
    if is_doc_fully_invoiced(doc_raw):
        return False

    now = _now()
    await db[doc_collection].update_one(
        {"docEntry": doc_entry, "organizationId": org_id},
        {
            "$set": {
                "status": DocumentStatus.OPEN.value,
                "updatedAt": now,
                "updatedBy": user_id,
            }
        },
    )
    logger.info(
        "[DocChainReconciler] '%s' collection='%s' auto-reopened on invoice "
        "release by user '%s'",
        doc_entry,
        doc_collection,
        user_id,
    )
    detail: Dict[str, Any] = dict(extra_detail or {})
    await write_chain_audit(
        db,
        audit_collection=audit_collection,
        doc_entry=doc_entry,
        action=action,
        user_id=user_id,
        detail=detail,
    )
    return True


# ---------------------------------------------------------------------------
# Chain-ref cleanup
# ---------------------------------------------------------------------------


async def pull_dangling_chain_refs(
    db: AsyncIOMotorDatabase,
    *,
    source_collection: str,
    source_doc_entry: str,
    org_id: str,
    user_id: str,
    target_doc_entry: str,
    affected_line_ids: Optional[List[str]] = None,
) -> None:
    """
    Remove stale targetDocRef entries from a source document after an AR Invoice
    is deleted or replaced.

    Performs two operations:

    1. ``$pull`` from ``source.targetDocRefs`` (header array) — removes the
       entry whose ``docId`` matches ``target_doc_entry``.  One DB call.

    2. ``$pull`` from ``source.lines[].targetDocRefs`` (per-line arrays) for
       each line in ``affected_line_ids`` — removes entries whose ``docId``
       matches ``target_doc_entry`` from every listed line.  One DB call per
       line.  If ``affected_line_ids`` is None the caller must pass the correct
       subset; this function does NOT iterate all lines automatically when None
       is passed (pass an empty list to skip per-line cleanup entirely).

    Reason: keying on ``docId`` ensures a sibling AR Invoice's ref on the same
    source line is preserved — only this invoice's ref is removed.

    Args:
        db:                 Motor database instance.
        source_collection:  Collection containing the source document
                            (e.g. "deliveries_v2", "sales_orders_v2").
        source_doc_entry:   UUID of the source document whose refs are cleaned.
        org_id:             Organisation UUID for query scoping.
        user_id:            User performing the operation (stamped on updatedBy).
        target_doc_entry:   docEntry of the AR Invoice being deleted/replaced.
                            Used as the ``docId`` key in the $pull filter.
        affected_line_ids:  Source line IDs (lineId values) whose per-line
                            targetDocRefs need cleaning.  Pass an empty list
                            or None to skip per-line cleanup.

    Returns:
        None.
    """
    now = _now()
    # Step 1: $pull from the source document header targetDocRefs.
    await db[source_collection].update_one(
        {"docEntry": source_doc_entry, "organizationId": org_id},
        {
            "$pull": {"targetDocRefs": {"docId": target_doc_entry}},
            "$set": {"updatedAt": now, "updatedBy": user_id},
        },
    )

    # Step 2: $pull per-line targetDocRefs for each affected source line.
    for line_id in (affected_line_ids or []):
        await db[source_collection].update_one(
            {
                "docEntry": source_doc_entry,
                "organizationId": org_id,
                "lines.lineId": line_id,
            },
            {
                "$pull": {"lines.$.targetDocRefs": {"docId": target_doc_entry}},
            },
        )


# ---------------------------------------------------------------------------
# Counter reconciliation
# ---------------------------------------------------------------------------


async def reconcile_line_counters(
    db: AsyncIOMotorDatabase,
    *,
    source_collection: str,
    source_doc_entry: str,
    org_id: str,
    user_id: str,
    ari_doc_entry: str,
    line_deltas: Dict[str, Decimal],
    cap_check: bool = True,
) -> None:
    """
    Apply per-line invoicedQty deltas to source document lines via ``$inc``.

    The caller computes ``line_deltas`` by comparing old and new invoice line
    quantities.  Positive delta = more invoiced; negative delta = released.

    When ``cap_check=True`` (the default), positive deltas are validated
    against the current ``open_invoice_qty`` on the source line.  If a delta
    would exceed the available open qty, a ``ValueError`` is raised before any
    ``$inc`` writes are performed.

    Reason: cap validation must happen before *any* ``$inc`` is applied so that
    a partially-valid batch does not leave the source document in an
    inconsistent state.  The caller is responsible for deciding whether to
    roll back the AR Invoice update on ValueError.

    Args:
        db:                 Motor database instance.
        source_collection:  Collection containing the source document
                            (e.g. "deliveries_v2", "sales_orders_v2").
        source_doc_entry:   UUID of the source document whose line counters
                            are being updated.
        org_id:             Organisation UUID for query scoping.
        user_id:            User performing the operation (stamped on updatedBy).
        ari_doc_entry:      The AR Invoice docEntry — used in the cap-check
                            ValueError message to identify the invoice being
                            updated (preserved verbatim from the original
                            implementation so existing test assertions pass).
        line_deltas:        Mapping of source line UUID (``lineId``) to the
                            net delta to apply to ``invoicedQty``.  Values
                            within ``TOLERANCE`` of zero are skipped.
        cap_check:          When True, validate that positive deltas do not
                            exceed the line's current open_invoice_qty.
                            Default True.

    Returns:
        None.

    Raises:
        ValueError: If ``cap_check=True`` and a positive delta exceeds the
                    available ``open_invoice_qty`` on the source line.  The
                    error message contains the AR Invoice doc_entry, the
                    source line UUID, the delta, and the open_invoice_qty —
                    preserved verbatim from the original implementation so
                    existing test assertions continue to pass.
    """
    # Filter out near-zero deltas up-front.
    significant = {
        lid: delta
        for lid, delta in line_deltas.items()
        if abs(delta) > TOLERANCE
    }
    if not significant:
        return

    now = _now()

    if cap_check:
        # Load source document once for cap validation.
        # Reason: validate ALL positive deltas before any $inc so that a
        # partially-valid batch does not leave the source in an inconsistent state.
        source_doc = await db[source_collection].find_one(
            {"docEntry": source_doc_entry, "organizationId": org_id}
        )
        source_lines_map: Dict[str, Dict[str, Any]] = {}
        if source_doc:
            source_lines_map = {
                ln["lineId"]: ln for ln in source_doc.get("lines", [])
            }

        for line_id, delta in significant.items():
            if delta > _ZERO:
                src_ln = source_lines_map.get(line_id)
                if src_ln is not None:
                    open_qty = line_open_invoice_qty(src_ln)
                    if delta > open_qty + TOLERANCE:
                        raise ValueError(
                            f"Cannot update AR Invoice '{ari_doc_entry}': "
                            f"increased quantity for Delivery line '{line_id}' "
                            f"by {float(delta):.4f} exceeds available "
                            f"open_invoice_qty={float(open_qty):.4f}. "
                            "Reduce the invoice quantity or create a new invoice."
                        )

    # Apply $inc on each source line.
    for line_id, delta in significant.items():
        await db[source_collection].update_one(
            {
                "docEntry": source_doc_entry,
                "organizationId": org_id,
                "lines.lineId": line_id,
            },
            {
                "$inc": {"lines.$.invoicedQty": float(delta)},
                "$set": {"updatedAt": now, "updatedBy": user_id},
            },
        )
