"""
Sales Module — Document Chain Reconciler (T-201.9.0)

This module is now a thin shim over ``src/core/documents/chain_reconciler.py``.
Generic primitives live in core; this module holds sales-specific name aliases
and sales-specific wrapper defaults (e.g. the "invoiced" semantic in default
action labels).

Future cross-module helpers should land in ``src/core/documents/``.

---

Generic helpers for the SAP B1 document-chain pattern used across the Sales
module.  Extracted from ar_invoice_service.py so the same logic can serve
both DN-sourced and SO-sourced AR Invoices without copy-paste.

Responsibilities
----------------
- Pure open-invoice-qty computation on a single source document line.
- Whole-document "fully invoiced" check (all lines <= TOLERANCE).
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
string values (OPEN -> "open", CLOSED -> "closed").
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from ....core.documents.chain_reconciler import (
    TOLERANCE,
    auto_close_if_fully_consumed as _core_auto_close,
    auto_reopen_if_not_fully_consumed as _core_auto_reopen,
    is_doc_fully_consumed as is_doc_fully_invoiced,
    line_open_qty as line_open_invoice_qty,
    pull_dangling_chain_refs,
    write_chain_audit,
)
from ....core.documents.chain_reconciler import reconcile_line_counters as _core_reconcile_line_counters


# ---------------------------------------------------------------------------
# Sales-specific wrappers for auto_close / auto_reopen.
#
# The core functions use generic default action labels
# ("auto_close_on_full_consumption", "auto_reopen_on_consumption_release").
# Sales tests assert the sales-semantic labels
# ("auto_close_on_full_invoice", "auto_reopen_on_invoice_release").
#
# ar_invoice_service.py calls these without passing action= explicitly, so
# the defaults here must match the original doc_chain_reconciler defaults
# exactly.
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

    Thin wrapper over ``auto_close_if_fully_consumed`` from
    ``src/core/documents/chain_reconciler`` with:
    - Default action ``"auto_close_on_full_invoice"`` (sales-semantic label
      asserted by sales tests — differs from core's generic default).
    - ``doc_key="docEntry"`` (Sales primary key field name).

    The caller signature is preserved verbatim from the original
    ``doc_chain_reconciler.auto_close_if_fully_invoiced`` so no call site
    in ar_invoice_service.py needs to change.

    Args:
        db:               Motor database instance.
        doc_collection:   Collection containing the source document
                          (e.g. "deliveries_v2").
        audit_collection: Audit collection to write the close event to.
        doc_entry:        UUID of the source document.
        doc_raw:          Already-reloaded raw source document dict.
        org_id:           Organisation UUID for query scoping.
        user_id:          User who triggered the originating AR Invoice op.
        action:           Audit action label
                          (default: "auto_close_on_full_invoice").
        extra_detail:     Additional keys merged into the audit detail dict.

    Returns:
        True if the document was transitioned to CLOSED, False otherwise.
    """
    return await _core_auto_close(
        db,
        doc_collection=doc_collection,
        audit_collection=audit_collection,
        doc_entry=doc_entry,
        doc_raw=doc_raw,
        org_id=org_id,
        user_id=user_id,
        doc_key="docEntry",
        action=action,
        extra_detail=extra_detail,
    )


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

    Thin wrapper over ``auto_reopen_if_not_fully_consumed`` from
    ``src/core/documents/chain_reconciler`` with:
    - Default action ``"auto_reopen_on_invoice_release"`` (sales-semantic
      label asserted by sales tests — differs from core's generic default).
    - ``doc_key="docEntry"`` (Sales primary key field name).

    Args:
        db:               Motor database instance.
        doc_collection:   Collection containing the source document.
        audit_collection: Audit collection to write the reopen event to.
        doc_entry:        UUID of the source document.
        doc_raw:          Already-reloaded raw source document dict.
        org_id:           Organisation UUID for query scoping.
        user_id:          User who triggered the originating AR Invoice op.
        action:           Audit action label
                          (default: "auto_reopen_on_invoice_release").
        extra_detail:     Additional keys merged into the audit detail dict.

    Returns:
        True if the document was transitioned to OPEN, False otherwise.
    """
    return await _core_auto_reopen(
        db,
        doc_collection=doc_collection,
        audit_collection=audit_collection,
        doc_entry=doc_entry,
        doc_raw=doc_raw,
        org_id=org_id,
        user_id=user_id,
        doc_key="docEntry",
        action=action,
        extra_detail=extra_detail,
    )


# ---------------------------------------------------------------------------
# Sales-specific wrapper for reconcile_line_counters.
#
# ar_invoice_service.py calls this with keyword argument ``ari_doc_entry``
# (the AR Invoice UUID).  The generic core function uses ``target_doc_entry``
# as the neutral name.  This thin wrapper translates the keyword so call sites
# in ar_invoice_service.py continue to work without any change.
#
# The sales module always uses the embedded-lines shape (deliveries_v2 and
# sales_orders_v2 both embed lines), so ``lines_collection`` defaults to None
# and ``doc_key`` defaults to "docEntry" — both matching the core defaults.
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

    This is a sales-specific wrapper over
    ``src/core/documents/chain_reconciler.reconcile_line_counters`` that
    accepts the ``ari_doc_entry`` keyword argument that ar_invoice_service.py
    already uses at every call site.

    The caller computes ``line_deltas`` by comparing old and new invoice line
    quantities.  Positive delta = more invoiced; negative delta = released.

    When ``cap_check=True`` (the default), positive deltas are validated
    against the current ``open_invoice_qty`` on the source line.  If a delta
    would exceed the available open qty, a ``ValueError`` is raised before any
    ``$inc`` writes are performed.

    Reason: cap validation must happen before *any* ``$inc`` is applied so
    that a partially-valid batch does not leave the source document in an
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
                    the substring "open_invoice_qty" is always present so
                    existing test assertions continue to pass.
    """
    await _core_reconcile_line_counters(
        db,
        source_collection=source_collection,
        source_doc_entry=source_doc_entry,
        target_doc_entry=ari_doc_entry,
        org_id=org_id,
        user_id=user_id,
        line_deltas=line_deltas,
        cap_check=cap_check,
        counter_field="invoicedQty",
        lines_collection=None,
        doc_key="docEntry",
    )


# ---------------------------------------------------------------------------
# Public re-exports (names that callers may import directly from this module)
# ---------------------------------------------------------------------------

__all__ = [
    "TOLERANCE",
    "line_open_invoice_qty",
    "is_doc_fully_invoiced",
    "write_chain_audit",
    "auto_close_if_fully_invoiced",
    "auto_reopen_if_not_fully_invoiced",
    "pull_dangling_chain_refs",
    "reconcile_line_counters",
]
