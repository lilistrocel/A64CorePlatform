"""
Purchasing Module — Document Chain Reconciler Adapter (T-200.22 + T-200.23)

Implements SAP B1-style document chain mechanics for the purchasing PR → PO →
GR → AP Invoice chain, mirroring what T-201.5/.6/.7 and T-201.9.0 added for
the sales DN-chain.

Architecture note — why not import from sales.services.doc_chain_reconciler
---------------------------------------------------------------------------
The generic ``doc_chain_reconciler`` lives in ``src/modules/sales/services/``.
Importing it from this module would execute the sales services ``__init__.py``,
which in turn imports ``OrderService``, which pulls in ``redis.asyncio``.  Redis
is not available in the unit-test environment for purchasing tests, so that
import chain would break all purchasing tests.

Resolution: the pure helpers (TOLERANCE, line_open_invoice_qty,
is_doc_fully_invoiced, write_chain_audit) are small enough to implement
directly here without copy-pasting logic — they are semantically identical but
scoped to purchasing.  If the shared helpers move to
``src/core/documents/doc_chain_helpers.py`` in a future refactor, these can
be replaced with direct imports at that time.

Purchasing PO close semantics (intentional asymmetry vs. Sales)
---------------------------------------------------------------
In Sales, an SO closes when fully *invoiced* (all line invoicedQty == orderedQty).
In Purchasing, a PO closes when fully *received* (all line openQuantity == 0),
which happens at ``post_gr`` time.  AP Invoice creation does NOT trigger an
additional PO close — the PO is already closed by the time any AP Invoice is
created.  This mirrors SAP B1 purchasing semantics: once goods arrive the PO
is operationally complete; invoicing is a separate back-office step.

Intentional asymmetry: ``create_ap_invoice_from_gr`` does NOT bubble up to
re-close the PO.  If a future requirement demands PO-close-on-full-invoice
semantics, file a new ticket (T-200.22.1).

Chain audit collections
-----------------------
- PR audit:  ``purchase_requests_audit``
- PO audit:  ``purchase_orders_audit``
- GR audit:  ``goods_receipts_audit``
- AP audit:  ``ap_invoices_audit``

Exports
-------
- ``_PR_AUDIT_COL``                      — PR audit collection name constant
- ``_PO_AUDIT_COL``                      — PO audit collection name constant
- ``_GR_AUDIT_COL``                      — GR audit collection name constant
- ``_AP_AUDIT_COL``                      — AP audit collection name constant
- ``write_purchasing_audit``             — best-effort audit write
- ``load_po_with_lines``                 — reload PO header + lines as embedded shape
- ``load_gr_with_lines``                 — reload GR header + lines as embedded shape
- ``auto_close_po_if_fully_received``    — auto-close PO on full receipt
- ``auto_reopen_po_if_not_fully_received`` — auto-reopen PO on receipt release
- ``auto_close_gr_if_fully_invoiced``    — auto-close GR on full invoice
- ``auto_reopen_gr_if_not_fully_invoiced`` — auto-reopen GR on invoice release
- ``reconcile_po_line_receipt_counters`` — $inc openQuantity / closedQuantity on PO lines
- ``reconcile_gr_line_invoice_counters`` — $inc invoicedQty on GR lines
- ``pull_dangling_po_chain_refs``        — $pull stale GR docId from PO targetDocRefs
- ``pull_dangling_gr_chain_refs``        — $pull stale AP docId from GR targetDocRefs
- ``load_ap_with_lines``                — reload AP header + lines as embedded shape (T-200.23)
- ``reconcile_ap_line_credit_counters`` — $inc creditedQty on AP lines + creditedAmount on AP header (T-200.23)
- ``auto_close_ap_if_fully_credited``   — auto-close AP on full credit (T-200.23)
- ``auto_reopen_ap_if_not_fully_credited`` — auto-reopen AP when credit released (T-200.23)
- ``pull_dangling_ap_credit_refs``      — $pull stale ACN docId from AP targetDocRefs (T-200.23)
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
# Audit collection name constants
# ---------------------------------------------------------------------------

_PR_AUDIT_COL = "purchase_requests_audit"
_PO_AUDIT_COL = "purchase_orders_audit"
_GR_AUDIT_COL = "goods_receipts_audit"
_AP_AUDIT_COL = "ap_invoices_audit"

_HEADERS_COL = "document_headers"
_LINES_COL = "document_lines"

# ---------------------------------------------------------------------------
# Float-comparison tolerance
#
# Mirrors TOLERANCE in doc_chain_reconciler.py.  Any qty within TOLERANCE of
# zero is treated as "fully consumed" so that floating-point rounding in
# compounded Decimal operations cannot create spuriously non-zero remainders.
# ---------------------------------------------------------------------------

TOLERANCE = Decimal("0.0001")

_ZERO = Decimal("0")


def _now() -> datetime:
    """Return timezone-aware UTC now."""
    return datetime.now(tz=timezone.utc)


# ---------------------------------------------------------------------------
# Pure helpers (adapted from doc_chain_reconciler.py for purchasing schema)
# ---------------------------------------------------------------------------


def _line_open_qty(line: Dict[str, Any]) -> Decimal:
    """
    Compute remaining open qty on a source document line.

    open_qty = orderedQty - invoicedQty - creditedQty

    Falls back to ``quantity`` if ``orderedQty`` is absent.

    Purchasing context:
    - For PO lines: orderedQty = quantity, invoicedQty = closedQuantity
      (normalised by load_po_with_lines).
    - For GR lines: orderedQty = quantity, invoicedQty = invoicedQty field
      (normalised by load_gr_with_lines).

    Args:
        line: Normalised line dict from load_po_with_lines / load_gr_with_lines.

    Returns:
        Remaining open qty as Decimal.
    """
    ordered = Decimal(str(line.get("orderedQty", line.get("quantity", 0))))
    invoiced = Decimal(str(line.get("invoicedQty", 0)))
    credited = Decimal(str(line.get("creditedQty", 0)))
    return ordered - invoiced - credited


def _is_doc_fully_consumed(doc_raw: Dict[str, Any]) -> bool:
    """
    Return True when every line in the document has open qty <= TOLERANCE.

    Args:
        doc_raw: Normalised document dict with embedded ``lines`` array
                 (as produced by load_po_with_lines / load_gr_with_lines).

    Returns:
        True if all lines are fully consumed, False otherwise.
    """
    for ln in doc_raw.get("lines", []):
        if _line_open_qty(ln) > TOLERANCE:
            return False
    return True


# ---------------------------------------------------------------------------
# Audit helper
# ---------------------------------------------------------------------------


async def write_purchasing_audit(
    db: AsyncIOMotorDatabase,
    *,
    audit_collection: str,
    doc_id: str,
    action: str,
    user_id: str,
    detail: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Write a best-effort chain audit entry for a purchasing document.

    Stores the entry under a ``docEntry`` key (using purchasing's ``docId``
    value) to maintain consistency with the sales audit collection shape so
    that a future shared audit reader can handle both without schema changes.

    Best-effort: logs a warning on failure but does not re-raise.  Audit
    failure must never roll back the originating operation.

    Args:
        db:               Motor database instance.
        audit_collection: Name of the purchasing audit collection.
        doc_id:           Purchasing document ``docId`` UUID.
        action:           Short action label.
        user_id:          User who triggered the originating operation.
        detail:           Optional extra metadata dict.

    Returns:
        None.
    """
    try:
        entry: Dict[str, Any] = {
            # Reason: store as ``docEntry`` (not ``docId``) so a shared audit
            # reader can handle purchasing and sales audit collections with a
            # single query pattern.  Purchasing's ``docId`` value is stored here.
            "docEntry": doc_id,
            "action": action,
            "userId": user_id,
            "detail": detail or {},
            "timestamp": _now(),
        }
        await db[audit_collection].insert_one(entry)
    except Exception as exc:  # noqa: BLE001
        # Reason: audit failure must not roll back the originating operation.
        logger.warning(
            "[PurchasingChainReconciler] audit write failed for doc '%s' "
            "collection='%s' action=%s: %s",
            doc_id,
            audit_collection,
            action,
            exc,
        )


# ---------------------------------------------------------------------------
# Document + lines loader helpers
# ---------------------------------------------------------------------------


async def load_po_with_lines(
    db: AsyncIOMotorDatabase,
    *,
    org_id: str,
    po_doc_id: str,
) -> Optional[Dict[str, Any]]:
    """
    Reload a PO header and its lines, returning a synthetic embedded-lines doc.

    The returned dict looks like the embedded-lines shape used by the pure
    helpers above.  The synthetic lines carry:
    - ``orderedQty``  = PO line ``quantity``
    - ``invoicedQty`` = PO line ``closedQuantity`` (qty already received)
    - ``creditedQty`` = 0.0 (no AP credit note concept in purchasing v1)

    This normalisation allows ``_is_doc_fully_consumed`` to check "fully
    received" semantics without knowing about the separate lines collection.

    Args:
        db:        Motor database instance.
        org_id:    Organisation UUID for query scoping.
        po_doc_id: PO ``docId`` UUID string.

    Returns:
        Dict with header fields + synthetic ``lines`` array, or None if not found.
    """
    header = await db[_HEADERS_COL].find_one(
        {"docId": po_doc_id, "organizationId": org_id, "docType": "PO", "deletedAt": None}
    )
    if not header:
        return None

    lines_cursor = db[_LINES_COL].find({"docId": po_doc_id})
    raw_lines: List[Dict[str, Any]] = await lines_cursor.to_list(length=None)

    # Reason: normalise to embedded shape that _is_doc_fully_consumed expects.
    # orderedQty = quantity (total ordered on this PO line).
    # invoicedQty = closedQuantity (qty received so far across all GRs).
    synthetic_lines: List[Dict[str, Any]] = [
        {
            "lineId": ln["lineId"],
            "orderedQty": float(ln.get("quantity", 0)),
            "invoicedQty": float(ln.get("closedQuantity", 0)),
            "creditedQty": 0.0,
            "cancelledQty": 0.0,
        }
        for ln in raw_lines
    ]

    result = dict(header)
    result["lines"] = synthetic_lines
    return result


async def load_gr_with_lines(
    db: AsyncIOMotorDatabase,
    *,
    org_id: str,
    gr_doc_id: str,
) -> Optional[Dict[str, Any]]:
    """
    Reload a GR header and its lines, returning a synthetic embedded-lines doc.

    The returned dict normalises GR lines for ``_is_doc_fully_consumed``:
    - ``orderedQty``  = GR line ``quantity`` (total received at post time)
    - ``invoicedQty`` = GR line ``invoicedQty`` (added by T-200.22; 0 if absent)
    - ``creditedQty`` = 0.0 (no AP credit note concept in purchasing v1)

    Args:
        db:        Motor database instance.
        org_id:    Organisation UUID for query scoping.
        gr_doc_id: GR ``docId`` UUID string.

    Returns:
        Dict with header fields + synthetic ``lines`` array, or None if not found.
    """
    header = await db[_HEADERS_COL].find_one(
        {"docId": gr_doc_id, "organizationId": org_id, "docType": "GR", "deletedAt": None}
    )
    if not header:
        return None

    lines_cursor = db[_LINES_COL].find({"docId": gr_doc_id})
    raw_lines: List[Dict[str, Any]] = await lines_cursor.to_list(length=None)

    synthetic_lines: List[Dict[str, Any]] = [
        {
            "lineId": ln["lineId"],
            # Reason: GR line quantity = total received at post time.
            "orderedQty": float(ln.get("quantity", 0)),
            # Reason: invoicedQty is the AP-invoice counter added by T-200.22.
            # Default to 0.0 for pre-T-200.22 GR lines.
            "invoicedQty": float(ln.get("invoicedQty", 0)),
            "creditedQty": 0.0,
            "cancelledQty": 0.0,
        }
        for ln in raw_lines
    ]

    result = dict(header)
    result["lines"] = synthetic_lines
    return result


# ---------------------------------------------------------------------------
# Auto-close / auto-reopen (purchasing-adapted)
# ---------------------------------------------------------------------------


async def auto_close_po_if_fully_received(
    db: AsyncIOMotorDatabase,
    *,
    po_doc_id: str,
    po_raw: Dict[str, Any],
    org_id: str,
    user_id: str,
    action: str = "auto_close_on_full_receipt",
    extra_detail: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Transition a PO from OPEN to CLOSED when all lines are fully received.

    Audit action ``"auto_close_on_full_receipt"`` is the purchasing semantic
    variant of sales' ``"auto_close_on_full_invoice"``.  The different name
    makes it distinguishable in the audit trail: receiving-side close vs.
    invoicing-side close.

    Uses purchasing's ``docId`` field for the DB query (not ``docEntry``).
    Idempotent: if PO is already CLOSED returns False immediately.

    Args:
        db:           Motor database instance.
        po_doc_id:    PO ``docId`` UUID string.
        po_raw:       Normalised PO dict from ``load_po_with_lines``
                      (post-increment state).
        org_id:       Organisation UUID.
        user_id:      User who triggered the originating GR operation.
        action:       Audit action label.
        extra_detail: Additional audit detail keys.

    Returns:
        True if the PO was transitioned to CLOSED, False otherwise.
    """
    if po_raw is None:
        return False
    if po_raw.get("status") != DocumentStatus.OPEN.value:
        return False
    if not _is_doc_fully_consumed(po_raw):
        return False

    now = _now()
    await db[_HEADERS_COL].update_one(
        {"docId": po_doc_id, "organizationId": org_id},
        {
            "$set": {
                "status": DocumentStatus.CLOSED.value,
                "updatedAt": now,
                "updatedBy": user_id,
            }
        },
    )
    logger.info(
        "[PurchasingChainReconciler] PO '%s' auto-closed on full receipt by user '%s'",
        po_doc_id,
        user_id,
    )
    await write_purchasing_audit(
        db,
        audit_collection=_PO_AUDIT_COL,
        doc_id=po_doc_id,
        action=action,
        user_id=user_id,
        detail=dict(extra_detail or {}),
    )
    return True


async def auto_reopen_po_if_not_fully_received(
    db: AsyncIOMotorDatabase,
    *,
    po_doc_id: str,
    po_raw: Dict[str, Any],
    org_id: str,
    user_id: str,
    action: str = "auto_reopen_on_receipt_release",
    extra_detail: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Transition a PO from CLOSED to OPEN when no longer fully received.

    Fires after a Draft GR is deleted, releasing receipt counters on PO lines.
    Idempotent: if PO is already OPEN returns False immediately.

    Args:
        db:           Motor database instance.
        po_doc_id:    PO ``docId`` UUID string.
        po_raw:       Normalised PO dict from ``load_po_with_lines``
                      (post-release state).
        org_id:       Organisation UUID.
        user_id:      User who triggered the delete.
        action:       Audit action label.
        extra_detail: Additional audit detail keys.

    Returns:
        True if the PO was transitioned to OPEN, False otherwise.
    """
    if po_raw is None:
        return False
    if po_raw.get("status") != DocumentStatus.CLOSED.value:
        return False
    if _is_doc_fully_consumed(po_raw):
        return False

    now = _now()
    await db[_HEADERS_COL].update_one(
        {"docId": po_doc_id, "organizationId": org_id},
        {
            "$set": {
                "status": DocumentStatus.OPEN.value,
                "updatedAt": now,
                "updatedBy": user_id,
            }
        },
    )
    logger.info(
        "[PurchasingChainReconciler] PO '%s' auto-reopened on receipt release by user '%s'",
        po_doc_id,
        user_id,
    )
    await write_purchasing_audit(
        db,
        audit_collection=_PO_AUDIT_COL,
        doc_id=po_doc_id,
        action=action,
        user_id=user_id,
        detail=dict(extra_detail or {}),
    )
    return True


async def auto_close_gr_if_fully_invoiced(
    db: AsyncIOMotorDatabase,
    *,
    gr_doc_id: str,
    gr_raw: Dict[str, Any],
    org_id: str,
    user_id: str,
    action: str = "auto_close_on_full_invoice",
    extra_detail: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Transition a GR from OPEN to CLOSED when all lines are fully invoiced.

    Fires after an AP Invoice is created and all GR lines have
    ``invoicedQty == quantity``.  In v1 quantities are locked to full GR qty,
    so this fires on every successful ``create_ap_from_gr``.

    Args:
        db:           Motor database instance.
        gr_doc_id:    GR ``docId`` UUID string.
        gr_raw:       Normalised GR dict from ``load_gr_with_lines``
                      (post-increment state).
        org_id:       Organisation UUID.
        user_id:      User who triggered the AP Invoice creation.
        action:       Audit action label.
        extra_detail: Additional audit detail keys.

    Returns:
        True if the GR was transitioned to CLOSED, False otherwise.
    """
    if gr_raw is None:
        return False
    if gr_raw.get("status") != DocumentStatus.OPEN.value:
        return False
    if not _is_doc_fully_consumed(gr_raw):
        return False

    now = _now()
    await db[_HEADERS_COL].update_one(
        {"docId": gr_doc_id, "organizationId": org_id},
        {
            "$set": {
                "status": DocumentStatus.CLOSED.value,
                "updatedAt": now,
                "updatedBy": user_id,
            }
        },
    )
    logger.info(
        "[PurchasingChainReconciler] GR '%s' auto-closed on full invoice by user '%s'",
        gr_doc_id,
        user_id,
    )
    await write_purchasing_audit(
        db,
        audit_collection=_GR_AUDIT_COL,
        doc_id=gr_doc_id,
        action=action,
        user_id=user_id,
        detail=dict(extra_detail or {}),
    )
    return True


async def auto_reopen_gr_if_not_fully_invoiced(
    db: AsyncIOMotorDatabase,
    *,
    gr_doc_id: str,
    gr_raw: Dict[str, Any],
    org_id: str,
    user_id: str,
    action: str = "auto_reopen_on_invoice_release",
    extra_detail: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Transition a GR from CLOSED to OPEN when no longer fully invoiced.

    Fires after a Draft AP Invoice is deleted or rejected, releasing
    previously-committed GR line ``invoicedQty``.

    Args:
        db:           Motor database instance.
        gr_doc_id:    GR ``docId`` UUID string.
        gr_raw:       Normalised GR dict from ``load_gr_with_lines``
                      (post-release state).
        org_id:       Organisation UUID.
        user_id:      User who triggered the release.
        action:       Audit action label.
        extra_detail: Additional audit detail keys.

    Returns:
        True if the GR was transitioned to OPEN, False otherwise.
    """
    if gr_raw is None:
        return False
    if gr_raw.get("status") != DocumentStatus.CLOSED.value:
        return False
    if _is_doc_fully_consumed(gr_raw):
        return False

    now = _now()
    await db[_HEADERS_COL].update_one(
        {"docId": gr_doc_id, "organizationId": org_id},
        {
            "$set": {
                "status": DocumentStatus.OPEN.value,
                "updatedAt": now,
                "updatedBy": user_id,
            }
        },
    )
    logger.info(
        "[PurchasingChainReconciler] GR '%s' auto-reopened on invoice release by user '%s'",
        gr_doc_id,
        user_id,
    )
    await write_purchasing_audit(
        db,
        audit_collection=_GR_AUDIT_COL,
        doc_id=gr_doc_id,
        action=action,
        user_id=user_id,
        detail=dict(extra_detail or {}),
    )
    return True


# ---------------------------------------------------------------------------
# Counter reconciliation (purchasing-adapted)
# ---------------------------------------------------------------------------


async def reconcile_po_line_receipt_counters(
    db: AsyncIOMotorDatabase,
    *,
    po_doc_id: str,
    org_id: str,
    user_id: str,
    gr_doc_id: str,
    line_deltas: Dict[str, Decimal],
    cap_check: bool = True,
) -> None:
    """
    Apply per-line receipt-qty deltas to PO lines via ``$inc`` on
    ``closedQuantity`` and ``-delta`` on ``openQuantity``.

    Positive deltas = more received (GR delete releases with negative delta).
    Negative deltas = qty released.

    When ``cap_check=True``, positive deltas are validated against the current
    PO line ``openQuantity`` before any ``$inc`` is applied.

    Args:
        db:          Motor database instance.
        po_doc_id:   PO ``docId`` UUID string.
        org_id:      Organisation UUID.
        user_id:     User stamped on ``updatedBy``.
        gr_doc_id:   GR ``docId`` (for error messages).
        line_deltas: Mapping of PO line ``lineId`` → net delta to apply.
        cap_check:   When True, validate positive deltas against ``openQuantity``.

    Returns:
        None.

    Raises:
        ValueError: If ``cap_check=True`` and a delta exceeds line's openQuantity.
    """
    significant = {
        lid: delta
        for lid, delta in line_deltas.items()
        if abs(delta) > TOLERANCE
    }
    if not significant:
        return

    now = _now()

    if cap_check:
        # Reason: validate ALL positive deltas before any $inc to prevent
        # partial-batch inconsistency.
        po_lines_cursor = db[_LINES_COL].find({"docId": po_doc_id})
        po_lines = await po_lines_cursor.to_list(length=None)
        po_lines_map: Dict[str, Dict[str, Any]] = {
            ln["lineId"]: ln for ln in po_lines
        }

        for line_id, delta in significant.items():
            if delta > _ZERO:
                po_ln = po_lines_map.get(line_id)
                if po_ln is not None:
                    open_qty = Decimal(
                        str(po_ln.get("openQuantity", po_ln.get("quantity", 0)))
                    )
                    if delta > open_qty + TOLERANCE:
                        raise ValueError(
                            f"Cannot create GR '{gr_doc_id}': "
                            f"received quantity for PO line '{line_id}' "
                            f"({float(delta):.4f}) exceeds available "
                            f"openQuantity={float(open_qty):.4f}. "
                            "Reduce the received quantity."
                        )

    for line_id, delta in significant.items():
        await db[_LINES_COL].update_one(
            {"docId": po_doc_id, "lineId": line_id},
            {
                "$inc": {
                    "closedQuantity": float(delta),
                    # Reason: openQuantity moves in the opposite direction to closedQuantity.
                    "openQuantity": float(-delta),
                },
                "$set": {"updatedAt": now, "updatedBy": user_id},
            },
        )


async def reconcile_gr_line_invoice_counters(
    db: AsyncIOMotorDatabase,
    *,
    gr_doc_id: str,
    org_id: str,
    user_id: str,
    ap_doc_id: str,
    line_deltas: Dict[str, Decimal],
    cap_check: bool = True,
) -> None:
    """
    Apply per-line invoice-qty deltas to GR lines via ``$inc`` on
    ``invoicedQty``.

    Positive deltas = more invoiced (AP create).
    Negative deltas = qty released (AP delete or rejection).

    When ``cap_check=True``, positive deltas are validated against the
    remaining open invoice qty on each GR line (``quantity - invoicedQty``).

    Args:
        db:          Motor database instance.
        gr_doc_id:   GR ``docId`` UUID string.
        org_id:      Organisation UUID.
        user_id:     User stamped on ``updatedBy``.
        ap_doc_id:   AP Invoice ``docId`` (for error messages).
        line_deltas: Mapping of GR line ``lineId`` → net delta.
        cap_check:   When True, validate positive deltas against available qty.

    Returns:
        None.

    Raises:
        ValueError: If ``cap_check=True`` and a delta exceeds available qty.
    """
    significant = {
        lid: delta
        for lid, delta in line_deltas.items()
        if abs(delta) > TOLERANCE
    }
    if not significant:
        return

    now = _now()

    if cap_check:
        gr_lines_cursor = db[_LINES_COL].find({"docId": gr_doc_id})
        gr_lines = await gr_lines_cursor.to_list(length=None)
        gr_lines_map: Dict[str, Dict[str, Any]] = {
            ln["lineId"]: ln for ln in gr_lines
        }

        for line_id, delta in significant.items():
            if delta > _ZERO:
                gr_ln = gr_lines_map.get(line_id)
                if gr_ln is not None:
                    total_qty = Decimal(str(gr_ln.get("quantity", 0)))
                    already_invoiced = Decimal(str(gr_ln.get("invoicedQty", 0)))
                    open_invoice_qty = total_qty - already_invoiced
                    if delta > open_invoice_qty + TOLERANCE:
                        raise ValueError(
                            f"Cannot create AP Invoice '{ap_doc_id}': "
                            f"invoice quantity for GR line '{line_id}' "
                            f"({float(delta):.4f}) exceeds available "
                            f"open_invoice_qty={float(open_invoice_qty):.4f}. "
                            "Reduce the invoice quantity."
                        )

    for line_id, delta in significant.items():
        await db[_LINES_COL].update_one(
            {"docId": gr_doc_id, "lineId": line_id},
            {
                "$inc": {"invoicedQty": float(delta)},
                "$set": {"updatedAt": now, "updatedBy": user_id},
            },
        )


# ---------------------------------------------------------------------------
# Chain-ref cleanup (purchasing-adapted)
# ---------------------------------------------------------------------------


async def pull_dangling_po_chain_refs(
    db: AsyncIOMotorDatabase,
    *,
    po_doc_id: str,
    org_id: str,
    user_id: str,
    gr_doc_id: str,
) -> None:
    """
    Remove stale ``targetDocRefs`` entries from a PO header after a Draft GR
    is deleted.

    The PO header's ``targetDocRefs`` array stores entries with a ``docId``
    key (set by ``post_gr``).  This function ``$pull``s the entry whose
    ``docId`` matches the deleted GR.

    Args:
        db:        Motor database instance.
        po_doc_id: PO ``docId`` UUID string.
        org_id:    Organisation UUID.
        user_id:   User performing the operation (stamped on ``updatedBy``).
        gr_doc_id: ``docId`` of the GR being deleted.

    Returns:
        None.
    """
    now = _now()
    await db[_HEADERS_COL].update_one(
        {"docId": po_doc_id, "organizationId": org_id},
        {
            "$pull": {"targetDocRefs": {"docId": gr_doc_id}},
            "$set": {"updatedAt": now, "updatedBy": user_id},
        },
    )


async def pull_dangling_gr_chain_refs(
    db: AsyncIOMotorDatabase,
    *,
    gr_doc_id: str,
    org_id: str,
    user_id: str,
    ap_doc_id: str,
) -> None:
    """
    Remove stale ``targetDocRefs`` entries from a GR header after a Draft AP
    Invoice is deleted or rejected.

    Args:
        db:        Motor database instance.
        gr_doc_id: GR ``docId`` UUID string.
        org_id:    Organisation UUID.
        user_id:   User performing the operation (stamped on ``updatedBy``).
        ap_doc_id: ``docId`` of the AP Invoice being deleted/rejected.

    Returns:
        None.
    """
    now = _now()
    await db[_HEADERS_COL].update_one(
        {"docId": gr_doc_id, "organizationId": org_id},
        {
            "$pull": {"targetDocRefs": {"docId": ap_doc_id}},
            "$set": {"updatedAt": now, "updatedBy": user_id},
        },
    )


# ---------------------------------------------------------------------------
# T-200.23 — AP Credit Note chain helpers
# ---------------------------------------------------------------------------

_ACN_AUDIT_COL = "ap_credit_notes_v2_audit"
_AP_INVOICES_COL = "ap_invoices_v2"


async def load_ap_with_lines(
    db: AsyncIOMotorDatabase,
    *,
    org_id: str,
    ap_doc_id: str,
) -> Optional[Dict[str, Any]]:
    """
    Reload an AP Invoice header and its lines, returning a synthetic embedded-lines doc.

    AP Invoices live in the ``ap_invoices_v2`` collection (not document_headers).
    This loader returns a synthetic dict that mirrors the shape expected by the
    AP Credit Note service for cap-check and auto-close decisions.

    The returned dict normalises AP Invoice lines for credit counter checks:
    - ``orderedQty``  = AP line ``quantity`` (total invoiced at creation)
    - ``invoicedQty`` = 0 (not applicable for credit-side counting)
    - ``creditedQty`` = AP line ``creditedQty`` (added by T-200.23; 0 if absent)

    Args:
        db:        Motor database instance.
        org_id:    Organisation UUID for query scoping.
        ap_doc_id: AP Invoice ``docId`` UUID string.

    Returns:
        Dict with header fields + synthetic ``lines`` array, or None if not found.
    """
    header = await db[_AP_INVOICES_COL].find_one(
        {"docId": ap_doc_id, "organizationId": org_id, "deletedAt": None}
    )
    if not header:
        return None

    raw_lines: List[Dict[str, Any]] = header.get("lines", [])

    synthetic_lines: List[Dict[str, Any]] = [
        {
            "lineId": ln["lineId"],
            # Reason: orderedQty = total AP line qty (locked to GR received qty in v1).
            "orderedQty": float(ln.get("quantity", 0)),
            # Reason: creditedQty tracks how much has been credited against this AP line.
            # Default to 0.0 for pre-T-200.23 AP lines.
            "creditedQty": float(ln.get("creditedQty", 0)),
            # Reason: invoicedQty not applicable for the credit counter direction.
            "invoicedQty": 0.0,
            "cancelledQty": 0.0,
        }
        for ln in raw_lines
    ]

    result = dict(header)
    result["lines"] = synthetic_lines
    return result


async def reconcile_ap_line_credit_counters(
    db: AsyncIOMotorDatabase,
    *,
    ap_doc_id: str,
    org_id: str,
    user_id: str,
    acn_doc_id: str,
    line_deltas: Dict[str, Decimal],
    gross_delta: Decimal,
    cap_check: bool = True,
) -> None:
    """
    Apply per-line credit-qty deltas to AP Invoice lines (``creditedQty`` field)
    and increment the AP Invoice header's ``creditedAmount``.

    Positive deltas = more credited (ACN posting).
    Negative deltas = qty released (ACN deletion or cancellation).

    When ``cap_check=True``, positive deltas are validated against the remaining
    creditable qty on each AP line (``quantity - creditedQty``).

    AP Invoice lines are embedded in the ``ap_invoices_v2`` header document.
    This function uses the positional ``$`` operator to update embedded lines.

    Args:
        db:           Motor database instance.
        ap_doc_id:    AP Invoice ``docId`` UUID string.
        org_id:       Organisation UUID.
        user_id:      User stamped on ``updatedBy``.
        acn_doc_id:   AP Credit Note ``docId`` (for error messages).
        line_deltas:  Mapping of AP line ``lineId`` → net qty delta to apply.
        gross_delta:  Net gross amount delta to apply to header ``creditedAmount``.
        cap_check:    When True, validate positive deltas against available creditedQty.

    Returns:
        None.

    Raises:
        ValueError: If ``cap_check=True`` and a delta exceeds line's creditable qty.
    """
    significant = {
        lid: delta
        for lid, delta in line_deltas.items()
        if abs(delta) > TOLERANCE
    }
    if not significant and abs(gross_delta) <= TOLERANCE:
        return

    now = _now()

    # Reload the AP Invoice header to get current embedded line state.
    ap_header = await db[_AP_INVOICES_COL].find_one(
        {"docId": ap_doc_id, "organizationId": org_id}
    )
    if ap_header is None:
        logger.warning(
            "[PurchasingChainReconciler] AP Invoice '%s' not found for credit counter update",
            ap_doc_id,
        )
        return

    ap_lines: List[Dict[str, Any]] = ap_header.get("lines", [])
    ap_lines_map: Dict[str, Dict[str, Any]] = {
        ln["lineId"]: ln for ln in ap_lines
    }

    if cap_check:
        # Reason: validate ALL positive deltas before any update to prevent
        # partial-batch inconsistency (all-or-nothing pre-flight).
        for line_id, delta in significant.items():
            if delta > _ZERO:
                ap_ln = ap_lines_map.get(line_id)
                if ap_ln is not None:
                    total_qty = Decimal(str(ap_ln.get("quantity", 0)))
                    already_credited = Decimal(str(ap_ln.get("creditedQty", 0)))
                    open_credit_qty = total_qty - already_credited
                    if delta > open_credit_qty + TOLERANCE:
                        raise ValueError(
                            f"Cannot post AP Credit Note '{acn_doc_id}': "
                            f"credit quantity for AP Invoice line '{line_id}' "
                            f"({float(delta):.4f}) exceeds available "
                            f"creditable qty={float(open_credit_qty):.4f}. "
                            "Reduce the credited quantity."
                        )

    # Apply per-line creditedQty increments using the positional $ operator.
    for line_id, delta in significant.items():
        await db[_AP_INVOICES_COL].update_one(
            {"docId": ap_doc_id, "organizationId": org_id, "lines.lineId": line_id},
            {
                "$inc": {"lines.$.creditedQty": float(delta)},
                "$set": {"updatedAt": now, "updatedBy": user_id},
            },
        )

    # Update header-level creditedAmount.
    if abs(gross_delta) > TOLERANCE:
        await db[_AP_INVOICES_COL].update_one(
            {"docId": ap_doc_id, "organizationId": org_id},
            {
                "$inc": {"creditedAmount": float(gross_delta)},
                "$set": {"updatedAt": now, "updatedBy": user_id},
            },
        )


async def auto_close_ap_if_fully_credited(
    db: AsyncIOMotorDatabase,
    *,
    ap_doc_id: str,
    ap_raw: Dict[str, Any],
    org_id: str,
    user_id: str,
    action: str = "auto_close_on_full_credit",
    extra_detail: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Transition an AP Invoice from OPEN (or PARTLY_CLOSED) to CLOSED when
    the entire gross amount has been credited by AP Credit Notes.

    The check compares ``creditedAmount`` (updated by reconcile_ap_line_credit_counters)
    against ``totalGross`` on the AP Invoice header.  Closes if
    ``creditedAmount >= totalGross - TOLERANCE``.

    Uses the ``ap_invoices_v2`` collection (not document_headers).

    Args:
        db:           Motor database instance.
        ap_doc_id:    AP Invoice ``docId`` UUID string.
        ap_raw:       Current AP Invoice header doc (pre-reload acceptable here;
                      the function re-reads creditedAmount from ``ap_raw``).
        org_id:       Organisation UUID.
        user_id:      User who triggered the originating ACN operation.
        action:       Audit action label.
        extra_detail: Additional audit detail keys.

    Returns:
        True if the AP Invoice was transitioned to CLOSED, False otherwise.
    """
    if ap_raw is None:
        return False

    current_status = ap_raw.get("status", "")
    # Reason: only close if AP is in a non-terminal, creditable state.
    if current_status not in {
        DocumentStatus.OPEN.value,
        DocumentStatus.PARTLY_CLOSED.value,
    }:
        return False

    # Re-read the post-increment state to get the correct creditedAmount.
    ap_refreshed = await db[_AP_INVOICES_COL].find_one(
        {"docId": ap_doc_id, "organizationId": org_id}
    )
    if ap_refreshed is None:
        return False

    total_gross = Decimal(str(ap_refreshed.get("totalGross", 0)))
    credited = Decimal(str(ap_refreshed.get("creditedAmount", 0)))

    if credited < total_gross - TOLERANCE:
        return False

    now = _now()
    await db[_AP_INVOICES_COL].update_one(
        {"docId": ap_doc_id, "organizationId": org_id},
        {
            "$set": {
                "status": DocumentStatus.CLOSED.value,
                "updatedAt": now,
                "updatedBy": user_id,
            }
        },
    )
    logger.info(
        "[PurchasingChainReconciler] AP Invoice '%s' auto-closed on full credit by user '%s'",
        ap_doc_id,
        user_id,
    )
    await write_purchasing_audit(
        db,
        audit_collection=_AP_AUDIT_COL,
        doc_id=ap_doc_id,
        action=action,
        user_id=user_id,
        detail=dict(extra_detail or {}),
    )
    return True


async def auto_reopen_ap_if_not_fully_credited(
    db: AsyncIOMotorDatabase,
    *,
    ap_doc_id: str,
    org_id: str,
    user_id: str,
    action: str = "auto_reopen_on_credit_release",
    extra_detail: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Transition an AP Invoice from CLOSED back to OPEN when a credit note
    against it is cancelled or deleted, releasing the credited amount.

    Re-reads the AP Invoice from MongoDB to get the post-decrement state.
    Only acts if the AP is currently CLOSED and the remaining credited amount
    no longer covers the full gross.

    Args:
        db:           Motor database instance.
        ap_doc_id:    AP Invoice ``docId`` UUID string.
        org_id:       Organisation UUID.
        user_id:      User who triggered the credit release.
        action:       Audit action label.
        extra_detail: Additional audit detail keys.

    Returns:
        True if the AP Invoice was reopened, False otherwise.
    """
    ap_refreshed = await db[_AP_INVOICES_COL].find_one(
        {"docId": ap_doc_id, "organizationId": org_id}
    )
    if ap_refreshed is None:
        return False

    if ap_refreshed.get("status") != DocumentStatus.CLOSED.value:
        return False

    total_gross = Decimal(str(ap_refreshed.get("totalGross", 0)))
    credited = Decimal(str(ap_refreshed.get("creditedAmount", 0)))

    if credited >= total_gross - TOLERANCE:
        # Still fully credited — don't reopen.
        return False

    now = _now()
    await db[_AP_INVOICES_COL].update_one(
        {"docId": ap_doc_id, "organizationId": org_id},
        {
            "$set": {
                "status": DocumentStatus.OPEN.value,
                "updatedAt": now,
                "updatedBy": user_id,
            }
        },
    )
    logger.info(
        "[PurchasingChainReconciler] AP Invoice '%s' auto-reopened after credit release by user '%s'",
        ap_doc_id,
        user_id,
    )
    await write_purchasing_audit(
        db,
        audit_collection=_AP_AUDIT_COL,
        doc_id=ap_doc_id,
        action=action,
        user_id=user_id,
        detail=dict(extra_detail or {}),
    )
    return True


async def pull_dangling_ap_credit_refs(
    db: AsyncIOMotorDatabase,
    *,
    ap_doc_id: str,
    org_id: str,
    user_id: str,
    acn_doc_id: str,
) -> None:
    """
    Remove stale ``targetDocRefs`` entries from an AP Invoice header after a
    Draft AP Credit Note is deleted.

    The AP Invoice header's ``targetDocRefs`` array stores ACN back-pointers.
    This function ``$pull``s the entry whose ``docId`` matches the deleted ACN.

    Args:
        db:        Motor database instance.
        ap_doc_id: AP Invoice ``docId`` UUID string.
        org_id:    Organisation UUID.
        user_id:   User performing the operation (stamped on ``updatedBy``).
        acn_doc_id: ``docId`` of the AP Credit Note being deleted.

    Returns:
        None.
    """
    now = _now()
    await db[_AP_INVOICES_COL].update_one(
        {"docId": ap_doc_id, "organizationId": org_id},
        {
            "$pull": {"targetDocRefs": {"docId": acn_doc_id}},
            "$set": {"updatedAt": now, "updatedBy": user_id},
        },
    )
