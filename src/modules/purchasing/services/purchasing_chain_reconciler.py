"""
Purchasing Module — Document Chain Reconciler Adapter (T-200.22 + T-200.23 + T-200.24)

This module is now a thin shim over ``src/core/documents/chain_reconciler.py``.
Generic primitives (TOLERANCE, line_open_qty, is_doc_fully_consumed,
write_chain_audit, auto_close_if_fully_consumed,
auto_reopen_if_not_fully_consumed, pull_dangling_chain_refs) live in core;
this module holds purchasing-specific name aliases and doc-type-specific
wrappers.

Future cross-module helpers should land in ``src/core/documents/``.

---

Implements SAP B1-style document chain mechanics for the purchasing PR -> PO ->
GR -> AP Invoice chain, mirroring what T-201.5/.6/.7 and T-201.9.0 added for
the sales DN-chain.

Architecture note
-----------------
The original ``purchasing_chain_reconciler.py`` was written as an adapter
because importing the sales ``doc_chain_reconciler`` triggered the sales
services ``__init__.py``, which loaded ``OrderService`` -> ``redis.asyncio``.
Redis was not available in the purchasing unit-test environment.

T-200.22a resolves this by moving the shared primitives to
``src/core/documents/chain_reconciler.py`` (zero side-effect imports).
This shim now imports directly from core; it is safe to import in any context
that does not have Redis available.

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
- DPI audit: ``ap_down_payments_v2_audit``

Exports
-------
- ``_PR_AUDIT_COL``                      — PR audit collection name constant
- ``_PO_AUDIT_COL``                      — PO audit collection name constant
- ``_GR_AUDIT_COL``                      — GR audit collection name constant
- ``_AP_AUDIT_COL``                      — AP audit collection name constant
- ``write_purchasing_audit``             — best-effort audit write (thin wrapper over write_chain_audit)
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
- ``load_dpi_with_lines``               — reload DPI header + lines as embedded shape (T-200.24)
- ``reconcile_dpi_consumption``         — $inc consumedAmount on DPI header (T-200.24)
- ``auto_close_dpi_if_fully_consumed``  — auto-close/partly-close DPI on consumption (T-200.24)
- ``auto_reopen_dpi_if_not_fully_consumed`` — auto-reopen DPI on consumption release (T-200.24)
- ``pull_dangling_dpi_allocation_refs`` — $pull stale AP docId from DPI targetDocRefs (T-200.24)
- ``load_bla_with_lines``               — reload BLA header + lines + computed outstanding (T-200.25)
- ``reconcile_bla_consumption``         — $inc consumedAmount + per-line consumedQty on BLA (T-200.25)
- ``auto_close_bla_if_fully_consumed``  — auto-close/partly-close BLA on PO consumption (T-200.25)
- ``auto_reopen_bla_if_not_fully_consumed`` — auto-reopen BLA when PO consumption released (T-200.25)
- ``pull_dangling_bla_consumption_refs`` — $pull stale PO docId from BLA targetDocRefs (T-200.25)

NOTE: BLA helpers (T-200.25) are present but NOT YET WIRED into any calling code path.
They will be called from PO creation / deletion once the PO->BLA integration
ships in T-200.25.1.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from ....core.documents.chain_reconciler import (
    TOLERANCE,
    auto_close_if_fully_consumed,
    auto_reopen_if_not_fully_consumed,
    is_doc_fully_consumed as _is_doc_fully_consumed,
    line_open_qty as _line_open_qty,
    pull_dangling_chain_refs as _pull_dangling_chain_refs,
    write_chain_audit,
)
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
# Module-local constants
# ---------------------------------------------------------------------------

_ZERO = Decimal("0")


def _now() -> datetime:
    """Return timezone-aware UTC now."""
    return datetime.now(tz=timezone.utc)


# ---------------------------------------------------------------------------
# Audit helper — thin wrapper over the shared write_chain_audit.
#
# Purchasing uses ``docId`` as its primary key field name (not ``docEntry``).
# write_chain_audit stores the value under ``docEntry`` regardless, so a
# shared audit reader can query both modules with one pattern.
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

    Thin wrapper over ``write_chain_audit`` that accepts purchasing's
    ``doc_id`` parameter name (instead of ``doc_entry``) and logs under the
    purchasing reconciler prefix.

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
    await write_chain_audit(
        db,
        audit_collection=audit_collection,
        doc_entry=doc_id,
        action=action,
        user_id=user_id,
        detail=detail,
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
        {
            "docId": po_doc_id,
            "organizationId": org_id,
            "docType": "PO",
            "deletedAt": None,
        }
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
        {
            "docId": gr_doc_id,
            "organizationId": org_id,
            "docType": "GR",
            "deletedAt": None,
        }
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
# Auto-close / auto-reopen — thin wrappers over the generic core helpers.
#
# Each wrapper bakes in:
#   - doc_collection / audit_collection: the purchasing collection names.
#   - doc_key: "docId" (purchasing primary key field name).
#   - action: purchasing-semantic audit label (e.g. "auto_close_on_full_receipt").
#
# This keeps the doc-type-specific domain knowledge in this shim while the
# generic IO mechanics live in core.
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

    Thin wrapper over ``auto_close_if_fully_consumed`` with PO collection
    names and purchasing ``docId`` key baked in.

    Audit action ``"auto_close_on_full_receipt"`` is the purchasing semantic
    variant of sales' ``"auto_close_on_full_invoice"``.  The different name
    makes it distinguishable in the audit trail: receiving-side close vs.
    invoicing-side close.

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
    return await auto_close_if_fully_consumed(
        db,
        doc_collection=_HEADERS_COL,
        audit_collection=_PO_AUDIT_COL,
        doc_entry=po_doc_id,
        doc_raw=po_raw,
        org_id=org_id,
        user_id=user_id,
        doc_key="docId",
        action=action,
        extra_detail=extra_detail,
    )


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

    Thin wrapper over ``auto_reopen_if_not_fully_consumed``.

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
    return await auto_reopen_if_not_fully_consumed(
        db,
        doc_collection=_HEADERS_COL,
        audit_collection=_PO_AUDIT_COL,
        doc_entry=po_doc_id,
        doc_raw=po_raw,
        org_id=org_id,
        user_id=user_id,
        doc_key="docId",
        action=action,
        extra_detail=extra_detail,
    )


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

    Thin wrapper over ``auto_close_if_fully_consumed``.

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
    return await auto_close_if_fully_consumed(
        db,
        doc_collection=_HEADERS_COL,
        audit_collection=_GR_AUDIT_COL,
        doc_entry=gr_doc_id,
        doc_raw=gr_raw,
        org_id=org_id,
        user_id=user_id,
        doc_key="docId",
        action=action,
        extra_detail=extra_detail,
    )


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

    Thin wrapper over ``auto_reopen_if_not_fully_consumed``.

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
    return await auto_reopen_if_not_fully_consumed(
        db,
        doc_collection=_HEADERS_COL,
        audit_collection=_GR_AUDIT_COL,
        doc_entry=gr_doc_id,
        doc_raw=gr_raw,
        org_id=org_id,
        user_id=user_id,
        doc_key="docId",
        action=action,
        extra_detail=extra_detail,
    )


# ---------------------------------------------------------------------------
# Counter reconciliation (purchasing-adapted)
#
# These helpers use the separate document_lines collection shape and their own
# cap-check logic against field names specific to each document type.
# They are intentionally NOT wrappers over reconcile_line_counters because:
# - PO lines use openQuantity + closedQuantity (not invoicedQty).
# - The separate lines collection requires a different MongoDB query pattern.
# The core reconcile_line_counters supports the separate-collection case via
# lines_collection, but PO needs TWO $inc fields (closedQuantity + openQuantity)
# which falls outside the single-counter-field contract.
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

    Note: this function operates on the separate ``document_lines`` collection
    (not embedded lines) and updates TWO counter fields per line
    (``closedQuantity`` and ``openQuantity``).  This dual-field update is
    specific to PO semantics and is not handled by the generic
    ``reconcile_line_counters`` in core.

    Args:
        db:          Motor database instance.
        po_doc_id:   PO ``docId`` UUID string.
        org_id:      Organisation UUID.
        user_id:     User stamped on ``updatedBy``.
        gr_doc_id:   GR ``docId`` (for error messages).
        line_deltas: Mapping of PO line ``lineId`` -> net delta to apply.
        cap_check:   When True, validate positive deltas against ``openQuantity``.

    Returns:
        None.

    Raises:
        ValueError: If ``cap_check=True`` and a delta exceeds line's openQuantity.
    """
    significant = {
        lid: delta for lid, delta in line_deltas.items() if abs(delta) > TOLERANCE
    }
    if not significant:
        return

    now = _now()

    if cap_check:
        # Reason: validate ALL positive deltas before any $inc to prevent
        # partial-batch inconsistency.
        po_lines_cursor = db[_LINES_COL].find({"docId": po_doc_id})
        po_lines = await po_lines_cursor.to_list(length=None)
        po_lines_map: Dict[str, Dict[str, Any]] = {ln["lineId"]: ln for ln in po_lines}

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

    Note: this function operates on the separate ``document_lines`` collection.

    Args:
        db:          Motor database instance.
        gr_doc_id:   GR ``docId`` UUID string.
        org_id:      Organisation UUID.
        user_id:     User stamped on ``updatedBy``.
        ap_doc_id:   AP Invoice ``docId`` (for error messages).
        line_deltas: Mapping of GR line ``lineId`` -> net delta.
        cap_check:   When True, validate positive deltas against available qty.

    Returns:
        None.

    Raises:
        ValueError: If ``cap_check=True`` and a delta exceeds available qty.
    """
    significant = {
        lid: delta for lid, delta in line_deltas.items() if abs(delta) > TOLERANCE
    }
    if not significant:
        return

    now = _now()

    if cap_check:
        gr_lines_cursor = db[_LINES_COL].find({"docId": gr_doc_id})
        gr_lines = await gr_lines_cursor.to_list(length=None)
        gr_lines_map: Dict[str, Dict[str, Any]] = {ln["lineId"]: ln for ln in gr_lines}

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
# Chain-ref cleanup — thin wrappers over the generic pull_dangling_chain_refs.
#
# Each wrapper bakes in doc_key="docId" (purchasing primary key) and the
# appropriate parameter name translation (po_doc_id -> source_doc_entry, etc.).
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

    Thin wrapper over ``pull_dangling_chain_refs`` with ``doc_key="docId"``
    and PO collection baked in.

    Args:
        db:        Motor database instance.
        po_doc_id: PO ``docId`` UUID string.
        org_id:    Organisation UUID.
        user_id:   User performing the operation (stamped on ``updatedBy``).
        gr_doc_id: ``docId`` of the GR being deleted.

    Returns:
        None.
    """
    await _pull_dangling_chain_refs(
        db,
        source_collection=_HEADERS_COL,
        source_doc_entry=po_doc_id,
        target_doc_entry=gr_doc_id,
        org_id=org_id,
        user_id=user_id,
        affected_line_ids=None,
        doc_key="docId",
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

    Thin wrapper over ``pull_dangling_chain_refs``.

    Args:
        db:        Motor database instance.
        gr_doc_id: GR ``docId`` UUID string.
        org_id:    Organisation UUID.
        user_id:   User performing the operation (stamped on ``updatedBy``).
        ap_doc_id: ``docId`` of the AP Invoice being deleted/rejected.

    Returns:
        None.
    """
    await _pull_dangling_chain_refs(
        db,
        source_collection=_HEADERS_COL,
        source_doc_entry=gr_doc_id,
        target_doc_entry=ap_doc_id,
        org_id=org_id,
        user_id=user_id,
        affected_line_ids=None,
        doc_key="docId",
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
        line_deltas:  Mapping of AP line ``lineId`` -> net qty delta to apply.
        gross_delta:  Net gross amount delta to apply to header ``creditedAmount``.
        cap_check:    When True, validate positive deltas against available creditedQty.

    Returns:
        None.

    Raises:
        ValueError: If ``cap_check=True`` and a delta exceeds line's creditable qty.
    """
    significant = {
        lid: delta for lid, delta in line_deltas.items() if abs(delta) > TOLERANCE
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
    ap_lines_map: Dict[str, Dict[str, Any]] = {ln["lineId"]: ln for ln in ap_lines}

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

    Note: this function is NOT a simple wrapper over
    ``auto_close_if_fully_consumed`` because it operates on amount fields
    (not line-level quantity fields) and uses a separate ``_AP_INVOICES_COL``
    rather than ``_HEADERS_COL``.

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

    Note: this function is NOT a wrapper over ``auto_reopen_if_not_fully_consumed``
    because it operates on amount fields and the ``ap_invoices_v2`` collection.

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

    Note: AP Invoices live in ``ap_invoices_v2`` (not document_headers), so
    this does not delegate to ``pull_dangling_chain_refs`` (which targets
    ``document_headers`` via the ``source_collection`` parameter).

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


# ---------------------------------------------------------------------------
# T-200.24 — AP Down Payment Invoice (DPI) chain helpers
# ---------------------------------------------------------------------------

_DPI_COL = "ap_down_payments_v2"
_DPI_AUDIT_COL = "ap_down_payments_v2_audit"

# Float tolerance for DPI consumption checks — same as general TOLERANCE.
_DPI_TOLERANCE = TOLERANCE


async def load_dpi_with_lines(
    db: AsyncIOMotorDatabase,
    *,
    org_id: str,
    dpi_doc_id: str,
) -> Optional[Dict[str, Any]]:
    """
    Reload a DPI header and its embedded lines, returning the raw document.

    DPI Invoices live in the ``ap_down_payments_v2`` collection with embedded
    lines (not in separate document_lines collection).  The returned dict
    includes a computed ``outstanding_amount`` field for convenience.

    Args:
        db:         Motor database instance.
        org_id:     Organisation UUID for query scoping.
        dpi_doc_id: DPI ``docId`` UUID string.

    Returns:
        Raw DPI dict with embedded ``lines`` + computed ``outstandingAmount``,
        or None if not found.
    """
    raw = await db[_DPI_COL].find_one({"docId": dpi_doc_id, "organizationId": org_id})
    if raw is None:
        return None
    # Compute outstanding_amount for caller convenience.
    total_gross = Decimal(str(raw.get("totals", {}).get("gross", 0)))
    consumed = Decimal(str(raw.get("consumedAmount", 0)))
    raw["outstandingAmount"] = float(max(total_gross - consumed, _ZERO))
    return raw


async def reconcile_dpi_consumption(
    db: AsyncIOMotorDatabase,
    *,
    dpi_doc_id: str,
    org_id: str,
    user_id: str,
    ap_doc_id: str,
    allocated_amount: Decimal,
    cap_check: bool = True,
) -> None:
    """
    Apply an allocation delta to the DPI's ``consumedAmount`` via ``$inc``.

    Positive delta = more consumed (AP Invoice approved with this DPI allocation).
    Negative delta = consumption released (AP Invoice deleted / cancelled).

    When ``cap_check=True`` and ``allocated_amount > 0``, validates that
    ``consumedAmount + allocated_amount <= totalGross + TOLERANCE``.

    Also pushes the AP Invoice back-pointer onto the DPI's ``targetDocRefs``
    (positive delta only).

    Args:
        db:               Motor database instance.
        dpi_doc_id:       DPI ``docId`` UUID string.
        org_id:           Organisation UUID.
        user_id:          User stamped on ``updatedBy``.
        ap_doc_id:        AP Invoice ``docId`` (for targetDocRefs + error messages).
        allocated_amount: Net delta to apply (+ve = consume, -ve = release).
        cap_check:        When True, validate positive deltas against outstanding.

    Returns:
        None.

    Raises:
        ValueError: If DPI not found, or cap_check=True and delta exceeds outstanding.
    """
    if abs(allocated_amount) <= _DPI_TOLERANCE:
        return

    dpi_raw = await db[_DPI_COL].find_one(
        {"docId": dpi_doc_id, "organizationId": org_id}
    )
    if dpi_raw is None:
        raise ValueError(
            f"AP Down Payment Invoice '{dpi_doc_id}' not found in organisation '{org_id}'."
        )

    if cap_check and allocated_amount > _ZERO:
        total_gross = Decimal(str(dpi_raw.get("totals", {}).get("gross", 0)))
        consumed = Decimal(str(dpi_raw.get("consumedAmount", 0)))
        outstanding = max(total_gross - consumed, _ZERO)
        if allocated_amount > outstanding + _DPI_TOLERANCE:
            raise ValueError(
                f"Cannot allocate {float(allocated_amount):.2f} against DPI '{dpi_doc_id}': "
                f"outstanding balance is {float(outstanding):.2f}. "
                "Reduce the allocated amount."
            )

    now = _now()

    update_op: Dict[str, Any] = {
        "$inc": {"consumedAmount": float(allocated_amount)},
        "$set": {"updatedAt": now, "updatedBy": user_id},
    }

    # Reason: push AP back-pointer on positive allocation only.
    # On negative (release), the caller calls pull_dangling_dpi_allocation_refs separately.
    if allocated_amount > _ZERO:
        # Fetch AP doc_number for display (best-effort; empty string if not found).
        ap_raw = await db[_AP_INVOICES_COL].find_one({"docId": ap_doc_id})
        ap_doc_number = ap_raw.get("docNumber", "") if ap_raw else ""
        ap_ref = {
            "docType": "AP_INVOICE",
            "docId": ap_doc_id,
            "docNumber": ap_doc_number,
            "lineId": None,
        }
        update_op["$push"] = {"targetDocRefs": ap_ref}

    await db[_DPI_COL].update_one(
        {"docId": dpi_doc_id, "organizationId": org_id},
        update_op,
    )

    # Write audit for the allocation event.
    await write_purchasing_audit(
        db,
        audit_collection=_DPI_AUDIT_COL,
        doc_id=dpi_doc_id,
        action=(
            "dpi_allocated" if allocated_amount > _ZERO else "dpi_allocation_released"
        ),
        user_id=user_id,
        detail={
            "allocatedAmount": float(allocated_amount),
            "apDocId": ap_doc_id,
        },
    )

    logger.info(
        "[PurchasingChainReconciler] DPI '%s' consumedAmount %+.2f by AP '%s' user '%s'",
        dpi_doc_id,
        float(allocated_amount),
        ap_doc_id,
        user_id,
    )


async def auto_close_dpi_if_fully_consumed(
    db: AsyncIOMotorDatabase,
    *,
    dpi_doc_id: str,
    dpi_raw: Dict[str, Any],
    org_id: str,
    user_id: str,
    action: str = "auto_close_on_full_consumption",
    extra_detail: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Transition a DPI to CLOSED when fully consumed, or to PARTLY_CLOSED when
    partially consumed.

    Decision logic (re-reads ``consumedAmount`` from post-increment state):
    - If ``consumedAmount >= totalGross - TOLERANCE`` -> transition to CLOSED.
    - Else if ``consumedAmount > TOLERANCE`` (partial) and status is OPEN ->
      transition to PARTLY_CLOSED.
    - Otherwise -> no-op.

    Idempotent: if already in the target state, returns False without writing.

    Note: this function is NOT a wrapper over ``auto_close_if_fully_consumed``
    because it operates on amount fields (totalGross / consumedAmount) and
    has a three-way OPEN/PARTLY_CLOSED/CLOSED decision rather than a binary one.

    Args:
        db:           Motor database instance.
        dpi_doc_id:   DPI ``docId`` UUID string.
        dpi_raw:      Current (pre-reload acceptable) DPI header doc; used only
                      for the status guard before the re-read.
        org_id:       Organisation UUID.
        user_id:      User who triggered the originating AP Invoice operation.
        action:       Audit action label.
        extra_detail: Additional audit detail keys.

    Returns:
        True if a status transition was written, False otherwise.
    """
    if dpi_raw is None:
        return False

    current_status = dpi_raw.get("status", "")
    # Reason: only act on live (non-terminal) DPI states.
    if current_status not in {
        DocumentStatus.OPEN.value,
        DocumentStatus.PARTLY_CLOSED.value,
    }:
        return False

    # Re-read for the post-increment consumedAmount.
    refreshed = await db[_DPI_COL].find_one(
        {"docId": dpi_doc_id, "organizationId": org_id}
    )
    if refreshed is None:
        return False

    total_gross = Decimal(str(refreshed.get("totals", {}).get("gross", 0)))
    consumed = Decimal(str(refreshed.get("consumedAmount", 0)))

    now = _now()

    # Fully consumed -> CLOSED.
    if consumed >= total_gross - _DPI_TOLERANCE:
        if refreshed.get("status") == DocumentStatus.CLOSED.value:
            return False  # already closed
        await db[_DPI_COL].update_one(
            {"docId": dpi_doc_id, "organizationId": org_id},
            {
                "$set": {
                    "status": DocumentStatus.CLOSED.value,
                    "updatedAt": now,
                    "updatedBy": user_id,
                }
            },
        )
        logger.info(
            "[PurchasingChainReconciler] DPI '%s' auto-closed on full consumption by user '%s'",
            dpi_doc_id,
            user_id,
        )
        await write_purchasing_audit(
            db,
            audit_collection=_DPI_AUDIT_COL,
            doc_id=dpi_doc_id,
            action=action,
            user_id=user_id,
            detail=dict(extra_detail or {}),
        )
        return True

    # Partially consumed + currently OPEN -> PARTLY_CLOSED.
    if (
        consumed > _DPI_TOLERANCE
        and refreshed.get("status") == DocumentStatus.OPEN.value
    ):
        await db[_DPI_COL].update_one(
            {"docId": dpi_doc_id, "organizationId": org_id},
            {
                "$set": {
                    "status": DocumentStatus.PARTLY_CLOSED.value,
                    "updatedAt": now,
                    "updatedBy": user_id,
                }
            },
        )
        logger.info(
            "[PurchasingChainReconciler] DPI '%s' transitioned to PARTLY_CLOSED by user '%s'",
            dpi_doc_id,
            user_id,
        )
        await write_purchasing_audit(
            db,
            audit_collection=_DPI_AUDIT_COL,
            doc_id=dpi_doc_id,
            action="auto_partly_close_on_partial_consumption",
            user_id=user_id,
            detail=dict(extra_detail or {}),
        )
        return True

    return False


async def auto_reopen_dpi_if_not_fully_consumed(
    db: AsyncIOMotorDatabase,
    *,
    dpi_doc_id: str,
    org_id: str,
    user_id: str,
    action: str = "auto_reopen_on_consumption_release",
    extra_detail: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Reverse an auto-close or auto-partly-close on a DPI when an AP Invoice
    that consumed it is deleted or cancelled.

    Decision logic (re-reads post-decrement state):
    - If DPI is CLOSED and ``consumedAmount < totalGross - TOLERANCE`` ->
      transition to PARTLY_CLOSED (still has some consumption) or OPEN (no consumption).
    - If DPI is PARTLY_CLOSED and ``consumedAmount <= TOLERANCE`` ->
      transition to OPEN.
    - Otherwise -> no-op.

    Args:
        db:           Motor database instance.
        dpi_doc_id:   DPI ``docId`` UUID string.
        org_id:       Organisation UUID.
        user_id:      User who triggered the release.
        action:       Audit action label.
        extra_detail: Additional audit detail keys.

    Returns:
        True if a status transition was written, False otherwise.
    """
    refreshed = await db[_DPI_COL].find_one(
        {"docId": dpi_doc_id, "organizationId": org_id}
    )
    if refreshed is None:
        return False

    current_status = refreshed.get("status", "")
    total_gross = Decimal(str(refreshed.get("totals", {}).get("gross", 0)))
    consumed = Decimal(str(refreshed.get("consumedAmount", 0)))

    now = _now()
    target: Optional[str] = None

    if current_status == DocumentStatus.CLOSED.value:
        if consumed >= total_gross - _DPI_TOLERANCE:
            return False  # still fully consumed
        # Partially consumed -> PARTLY_CLOSED; zero consumed -> OPEN.
        target = (
            DocumentStatus.PARTLY_CLOSED.value
            if consumed > _DPI_TOLERANCE
            else DocumentStatus.OPEN.value
        )
    elif current_status == DocumentStatus.PARTLY_CLOSED.value:
        if consumed <= _DPI_TOLERANCE:
            target = DocumentStatus.OPEN.value
        # If partially consumed but not zero, stays PARTLY_CLOSED.

    if target is None:
        return False

    await db[_DPI_COL].update_one(
        {"docId": dpi_doc_id, "organizationId": org_id},
        {"$set": {"status": target, "updatedAt": now, "updatedBy": user_id}},
    )
    logger.info(
        "[PurchasingChainReconciler] DPI '%s' reopened to '%s' after consumption release by user '%s'",
        dpi_doc_id,
        target,
        user_id,
    )
    await write_purchasing_audit(
        db,
        audit_collection=_DPI_AUDIT_COL,
        doc_id=dpi_doc_id,
        action=action,
        user_id=user_id,
        detail=dict(extra_detail or {}),
    )
    return True


async def pull_dangling_dpi_allocation_refs(
    db: AsyncIOMotorDatabase,
    *,
    dpi_doc_id: str,
    org_id: str,
    user_id: str,
    ap_doc_id: str,
) -> None:
    """
    Remove stale ``targetDocRefs`` entries from a DPI header after an AP Invoice
    that allocated it is deleted or cancelled.

    Args:
        db:         Motor database instance.
        dpi_doc_id: DPI ``docId`` UUID string.
        org_id:     Organisation UUID.
        user_id:    User performing the operation (stamped on ``updatedBy``).
        ap_doc_id:  ``docId`` of the AP Invoice being deleted/cancelled.

    Returns:
        None.
    """
    now = _now()
    await db[_DPI_COL].update_one(
        {"docId": dpi_doc_id, "organizationId": org_id},
        {
            "$pull": {"targetDocRefs": {"docId": ap_doc_id}},
            "$set": {"updatedAt": now, "updatedBy": user_id},
        },
    )


# ---------------------------------------------------------------------------
# T-200.25 — Blanket Agreement (BLA) chain helpers
#
# These helpers are PRESENT but NOT YET WIRED into any calling code path.
# They will be called from PO creation / deletion once the PO->BLA integration
# ships in T-200.25.1.
# ---------------------------------------------------------------------------

_BLA_COL = "blanket_agreements_v2"
_BLA_AUDIT_COL = "blanket_agreements_v2_audit"

# Float tolerance for BLA consumption checks — same as general TOLERANCE.
_BLA_TOLERANCE = TOLERANCE


async def load_bla_with_lines(
    db: AsyncIOMotorDatabase,
    *,
    org_id: str,
    bla_doc_id: str,
) -> Optional[Dict[str, Any]]:
    """
    Reload a BLA header and its embedded lines, returning the raw document.

    BLAs live in the ``blanket_agreements_v2`` collection with embedded lines.
    The returned dict includes a computed ``outstandingAmount`` field for
    caller convenience.

    For line_based BLAs the per-line ``outstandingQty`` is also computed:
    ``committedQuantity - consumedQty``.

    # Used by T-200.25.1 once PO->BLA integration ships.

    Args:
        db:         Motor database instance.
        org_id:     Organisation UUID for query scoping.
        bla_doc_id: BLA ``docId`` UUID string.

    Returns:
        Raw BLA dict with embedded ``lines`` + computed ``outstandingAmount``,
        or None if not found.
    """
    raw = await db[_BLA_COL].find_one({"docId": bla_doc_id, "organizationId": org_id})
    if raw is None:
        return None
    # Compute outstanding_amount for caller convenience.
    total_gross = Decimal(str(raw.get("totals", {}).get("gross", 0)))
    consumed = Decimal(str(raw.get("consumedAmount", 0)))
    raw["outstandingAmount"] = float(max(total_gross - consumed, _ZERO))
    # Compute per-line outstanding qty for line_based BLAs.
    for ln in raw.get("lines", []):
        committed = Decimal(str(ln.get("committedQuantity", 0)))
        consumed_qty = Decimal(str(ln.get("consumedQty", 0)))
        ln["outstandingQty"] = float(max(committed - consumed_qty, _ZERO))
    return raw


async def reconcile_bla_consumption(
    db: AsyncIOMotorDatabase,
    *,
    bla_doc_id: str,
    org_id: str,
    user_id: str,
    source_doc_id: str,
    source_doc_type: str,
    line_deltas: Dict[str, Decimal],
    gross_delta: Decimal,
    cap_check: bool = True,
) -> None:
    """
    Apply consumption deltas to a BLA: per-line ``consumedQty`` increments
    (for line_based BLAs) and header-level ``consumedAmount`` increment
    (for both modes).

    Positive deltas = more consumed (PO references this BLA).
    Negative deltas = consumption released (PO is deleted or amended down).

    When ``cap_check=True`` and ``gross_delta > 0``, validates that
    ``consumedAmount + gross_delta <= totalGross + TOLERANCE``.

    For line_based BLAs, also validates each ``line_deltas[lineId]`` against
    the per-line ``committedQuantity - consumedQty`` outstanding.

    Also pushes the PO back-pointer onto the BLA's ``targetDocRefs``
    (positive delta only).

    # Used by T-200.25.1 once PO->BLA integration ships.

    Args:
        db:              Motor database instance.
        bla_doc_id:      BLA ``docId`` UUID string.
        org_id:          Organisation UUID.
        user_id:         User stamped on ``updatedBy``.
        source_doc_id:   Source document ``docId`` (PO) for back-ref + error messages.
        source_doc_type: Source document type string (e.g. "PO").
        line_deltas:     Mapping of BLA line ``lineId`` -> net qty delta.
                         Used for line_based BLAs; pass empty dict for amount_based.
        gross_delta:     Net gross amount delta to apply to header ``consumedAmount``.
        cap_check:       When True, validate deltas against outstanding balance.

    Returns:
        None.

    Raises:
        ValueError: If BLA not found, or cap_check=True and delta exceeds outstanding.
    """
    if abs(gross_delta) <= _BLA_TOLERANCE and not line_deltas:
        return

    bla_raw = await db[_BLA_COL].find_one(
        {"docId": bla_doc_id, "organizationId": org_id}
    )
    if bla_raw is None:
        raise ValueError(
            f"Blanket Agreement '{bla_doc_id}' not found in organisation '{org_id}'."
        )

    if cap_check and gross_delta > _ZERO:
        total_gross = Decimal(str(bla_raw.get("totals", {}).get("gross", 0)))
        consumed = Decimal(str(bla_raw.get("consumedAmount", 0)))
        outstanding = max(total_gross - consumed, _ZERO)
        if gross_delta > outstanding + _BLA_TOLERANCE:
            raise ValueError(
                f"Cannot consume {float(gross_delta):.2f} from BLA '{bla_doc_id}': "
                f"outstanding balance is {float(outstanding):.2f}. "
                "Reduce the consumed amount."
            )

    now = _now()

    # Apply header-level consumedAmount increment.
    if abs(gross_delta) > _BLA_TOLERANCE:
        update_op: Dict[str, Any] = {
            "$inc": {"consumedAmount": float(gross_delta)},
            "$set": {"updatedAt": now, "updatedBy": user_id},
        }
        # Reason: push PO back-pointer on positive consumption only.
        if gross_delta > _ZERO:
            # Reason: fetch PO doc_number for display (best-effort; empty if not found).
            po_doc_number = ""
            po_hdr = await db["document_headers"].find_one({"docId": source_doc_id})
            if po_hdr:
                po_doc_number = po_hdr.get("docNumber", "")
            bla_ref = {
                "docType": source_doc_type,
                "docId": source_doc_id,
                "docNumber": po_doc_number,
                "lineId": None,
            }
            update_op["$push"] = {"targetDocRefs": bla_ref}

        await db[_BLA_COL].update_one(
            {"docId": bla_doc_id, "organizationId": org_id},
            update_op,
        )

    # Apply per-line consumedQty increments for line_based BLAs.
    significant_lines = {
        lid: delta for lid, delta in line_deltas.items() if abs(delta) > _BLA_TOLERANCE
    }
    for line_id, delta in significant_lines.items():
        await db[_BLA_COL].update_one(
            {"docId": bla_doc_id, "organizationId": org_id, "lines.lineId": line_id},
            {
                "$inc": {"lines.$.consumedQty": float(delta)},
                "$set": {"updatedAt": now, "updatedBy": user_id},
            },
        )

    # Write audit for the consumption event.
    await write_purchasing_audit(
        db,
        audit_collection=_BLA_AUDIT_COL,
        doc_id=bla_doc_id,
        action="bla_consumed" if gross_delta > _ZERO else "bla_consumption_released",
        user_id=user_id,
        detail={
            "grossDelta": float(gross_delta),
            "sourceDocId": source_doc_id,
            "sourceDocType": source_doc_type,
        },
    )

    logger.info(
        "[PurchasingChainReconciler] BLA '%s' consumedAmount %+.2f by %s '%s' user '%s'",
        bla_doc_id,
        float(gross_delta),
        source_doc_type,
        source_doc_id,
        user_id,
    )


async def auto_close_bla_if_fully_consumed(
    db: AsyncIOMotorDatabase,
    *,
    bla_doc_id: str,
    bla_raw: Dict[str, Any],
    org_id: str,
    user_id: str,
    action: str = "auto_close_on_full_consumption",
    extra_detail: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Transition a BLA to CLOSED when fully consumed, or to PARTLY_CLOSED when
    partially consumed.

    Decision logic (re-reads ``consumedAmount`` from post-increment state):
    - If ``consumedAmount >= totalGross - TOLERANCE`` -> transition to CLOSED.
    - Else if ``consumedAmount > TOLERANCE`` (partial) and status is OPEN ->
      transition to PARTLY_CLOSED.
    - Otherwise -> no-op.

    Idempotent: if already in the target state, returns False without writing.

    # Used by T-200.25.1 once PO->BLA integration ships.

    Args:
        db:           Motor database instance.
        bla_doc_id:   BLA ``docId`` UUID string.
        bla_raw:      Current (pre-reload acceptable) BLA header doc; used only
                      for the status guard before the re-read.
        org_id:       Organisation UUID.
        user_id:      User who triggered the originating PO operation.
        action:       Audit action label.
        extra_detail: Additional audit detail keys.

    Returns:
        True if a status transition was written, False otherwise.
    """
    if bla_raw is None:
        return False

    current_status = bla_raw.get("status", "")
    # Reason: only act on live (non-terminal) BLA states.
    if current_status not in {
        DocumentStatus.OPEN.value,
        DocumentStatus.PARTLY_CLOSED.value,
    }:
        return False

    # Re-read for the post-increment consumedAmount.
    refreshed = await db[_BLA_COL].find_one(
        {"docId": bla_doc_id, "organizationId": org_id}
    )
    if refreshed is None:
        return False

    total_gross = Decimal(str(refreshed.get("totals", {}).get("gross", 0)))
    consumed = Decimal(str(refreshed.get("consumedAmount", 0)))

    now = _now()

    # Fully consumed -> CLOSED.
    if consumed >= total_gross - _BLA_TOLERANCE:
        if refreshed.get("status") == DocumentStatus.CLOSED.value:
            return False  # already closed
        await db[_BLA_COL].update_one(
            {"docId": bla_doc_id, "organizationId": org_id},
            {
                "$set": {
                    "status": DocumentStatus.CLOSED.value,
                    "updatedAt": now,
                    "updatedBy": user_id,
                }
            },
        )
        logger.info(
            "[PurchasingChainReconciler] BLA '%s' auto-closed on full consumption by user '%s'",
            bla_doc_id,
            user_id,
        )
        await write_purchasing_audit(
            db,
            audit_collection=_BLA_AUDIT_COL,
            doc_id=bla_doc_id,
            action=action,
            user_id=user_id,
            detail=dict(extra_detail or {}),
        )
        return True

    # Partially consumed + currently OPEN -> PARTLY_CLOSED.
    if (
        consumed > _BLA_TOLERANCE
        and refreshed.get("status") == DocumentStatus.OPEN.value
    ):
        await db[_BLA_COL].update_one(
            {"docId": bla_doc_id, "organizationId": org_id},
            {
                "$set": {
                    "status": DocumentStatus.PARTLY_CLOSED.value,
                    "updatedAt": now,
                    "updatedBy": user_id,
                }
            },
        )
        logger.info(
            "[PurchasingChainReconciler] BLA '%s' transitioned to PARTLY_CLOSED by user '%s'",
            bla_doc_id,
            user_id,
        )
        await write_purchasing_audit(
            db,
            audit_collection=_BLA_AUDIT_COL,
            doc_id=bla_doc_id,
            action="auto_partly_close_on_partial_consumption",
            user_id=user_id,
            detail=dict(extra_detail or {}),
        )
        return True

    return False


async def auto_reopen_bla_if_not_fully_consumed(
    db: AsyncIOMotorDatabase,
    *,
    bla_doc_id: str,
    org_id: str,
    user_id: str,
    action: str = "auto_reopen_on_consumption_release",
    extra_detail: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Reverse an auto-close or auto-partly-close on a BLA when a PO that
    referenced it is deleted or amended down.

    Decision logic (re-reads post-decrement state):
    - If BLA is CLOSED and ``consumedAmount < totalGross - TOLERANCE`` ->
      transition to PARTLY_CLOSED (still has some consumption) or OPEN (zero consumption).
    - If BLA is PARTLY_CLOSED and ``consumedAmount <= TOLERANCE`` ->
      transition to OPEN.
    - Otherwise -> no-op.

    # Used by T-200.25.1 once PO->BLA integration ships.

    Args:
        db:           Motor database instance.
        bla_doc_id:   BLA ``docId`` UUID string.
        org_id:       Organisation UUID.
        user_id:      User who triggered the PO release.
        action:       Audit action label.
        extra_detail: Additional audit detail keys.

    Returns:
        True if a status transition was written, False otherwise.
    """
    refreshed = await db[_BLA_COL].find_one(
        {"docId": bla_doc_id, "organizationId": org_id}
    )
    if refreshed is None:
        return False

    current_status = refreshed.get("status", "")
    total_gross = Decimal(str(refreshed.get("totals", {}).get("gross", 0)))
    consumed = Decimal(str(refreshed.get("consumedAmount", 0)))

    now = _now()
    target: Optional[str] = None

    if current_status == DocumentStatus.CLOSED.value:
        if consumed >= total_gross - _BLA_TOLERANCE:
            return False  # still fully consumed
        # Partially consumed -> PARTLY_CLOSED; zero consumed -> OPEN.
        target = (
            DocumentStatus.PARTLY_CLOSED.value
            if consumed > _BLA_TOLERANCE
            else DocumentStatus.OPEN.value
        )
    elif current_status == DocumentStatus.PARTLY_CLOSED.value:
        if consumed <= _BLA_TOLERANCE:
            target = DocumentStatus.OPEN.value
        # If partially consumed but not zero, stays PARTLY_CLOSED.

    if target is None:
        return False

    await db[_BLA_COL].update_one(
        {"docId": bla_doc_id, "organizationId": org_id},
        {"$set": {"status": target, "updatedAt": now, "updatedBy": user_id}},
    )
    logger.info(
        "[PurchasingChainReconciler] BLA '%s' reopened to '%s' after consumption release by user '%s'",
        bla_doc_id,
        target,
        user_id,
    )
    await write_purchasing_audit(
        db,
        audit_collection=_BLA_AUDIT_COL,
        doc_id=bla_doc_id,
        action=action,
        user_id=user_id,
        detail=dict(extra_detail or {}),
    )
    return True


async def pull_dangling_bla_consumption_refs(
    db: AsyncIOMotorDatabase,
    *,
    bla_doc_id: str,
    org_id: str,
    user_id: str,
    source_doc_id: str,
) -> None:
    """
    Remove stale ``targetDocRefs`` entries from a BLA header after a PO that
    referenced it is deleted.

    Args:
        db:            Motor database instance.
        bla_doc_id:    BLA ``docId`` UUID string.
        org_id:        Organisation UUID.
        user_id:       User performing the operation (stamped on ``updatedBy``).
        source_doc_id: ``docId`` of the PO being deleted.

    Returns:
        None.

    # Used by T-200.25.1 once PO->BLA integration ships.
    """
    now = _now()
    await db[_BLA_COL].update_one(
        {"docId": bla_doc_id, "organizationId": org_id},
        {
            "$pull": {"targetDocRefs": {"docId": source_doc_id}},
            "$set": {"updatedAt": now, "updatedBy": user_id},
        },
    )
