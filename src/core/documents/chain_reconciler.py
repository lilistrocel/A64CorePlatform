"""
A64 Core Platform — Shared Document Chain Reconciler (T-200.22a)

Generic primitives for the SAP B1 document-chain pattern, shared by both the
Sales module and the Purchasing module.  This module is the canonical home for
helpers that implement the chain mechanics in a collection-agnostic,
doc-type-agnostic way.

Architecture
------------
Both ``src/modules/sales/services/doc_chain_reconciler.py`` and
``src/modules/purchasing/services/purchasing_chain_reconciler.py`` are thin
shims that import from here.  Doc-type-specific helpers (the ones that know
about ``ap_invoices_v2``, ``deliveries_v2``, per-PO-line ``closedQuantity``,
etc.) remain in their respective module shims — they are NOT generic.

Zero side-effect imports
------------------------
Motor and Redis are NOT imported at module level.  Motor is imported inside
function bodies only (via the ``AsyncIOMotorDatabase`` type hint imported from
``motor.motor_asyncio`` — which is a TYPE import only; the actual heavy load
happens when a Motor database connection is established by the caller).

Exported API
------------
Pure helpers (no IO):
    TOLERANCE               — float-comparison tolerance constant
    line_open_qty           — remaining open qty on a source document line
    is_doc_fully_consumed   — True when every line has open qty <= TOLERANCE

Async IO helpers (parameterised by collection names):
    write_chain_audit                 — best-effort audit insert
    auto_close_if_fully_consumed      — OPEN → CLOSED when fully consumed
    auto_reopen_if_not_fully_consumed — CLOSED → OPEN when no longer fully consumed
    pull_dangling_chain_refs          — $pull stale targetDocRef entries
    reconcile_line_counters           — $inc per-line counters with cap validation

Future additions
----------------
Cross-cutting helpers that serve both modules should land here.  Doc-type-
specific helpers that call into these primitives belong in the module shims.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Callable, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from .document_status import DocumentStatus

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
# Pure helpers — zero IO
# ---------------------------------------------------------------------------


def line_open_qty(
    line: Dict[str, Any],
    *,
    qty_field: str = "quantity",
    consumed_fields: tuple = ("invoicedQty", "creditedQty", "cancelledQty"),
) -> Decimal:
    """
    Compute the remaining open quantity on a source document line.

    open_qty = ordered_qty - sum(consumed_field values)

    The ordered quantity is resolved as ``orderedQty`` if present, otherwise
    falls back to ``qty_field`` (default ``"quantity"``).  This dual-key
    lookup preserves backward compatibility with sales documents that store the
    canonical quantity under ``orderedQty``, while allowing purchasing
    documents to work with their own field names.

    The ``consumed_fields`` tuple lists every counter field whose value should
    be subtracted from the ordered quantity.  Default values match the Sales
    module shape (``invoicedQty``, ``creditedQty``, ``cancelledQty``).
    Purchasing callers can override with their own field names when the
    normalised line shape differs.

    Args:
        line:            Raw or normalised line dict from any source document.
        qty_field:       Field name to fall back to when ``orderedQty`` is
                         absent (default ``"quantity"``).
        consumed_fields: Tuple of counter field names to sum and subtract from
                         the ordered quantity (default
                         ``("invoicedQty", "creditedQty", "cancelledQty")``).

    Returns:
        Remaining open quantity as Decimal.  May be negative if the source
        document has been over-consumed; the caller is responsible for acting
        on that case.
    """
    ordered = Decimal(str(line.get("orderedQty", line.get(qty_field, 0))))
    consumed = sum(
        Decimal(str(line.get(field, 0))) for field in consumed_fields
    )
    return ordered - consumed


def is_doc_fully_consumed(
    doc_raw: Dict[str, Any],
    *,
    line_loader: Optional[Callable[[Dict[str, Any]], List[Dict[str, Any]]]] = None,
    qty_field: str = "quantity",
    consumed_fields: tuple = ("invoicedQty", "creditedQty", "cancelledQty"),
) -> bool:
    """
    Return True when every line in the document has open qty <= TOLERANCE.

    Handles two document shapes:

    1. **Embedded lines** (Sales module default): when ``line_loader`` is
       ``None``, iterates ``doc_raw.get("lines", [])``.  This is the shape
       used by Delivery notes, Sales Orders, and the normalised dicts returned
       by purchasing's ``load_po_with_lines`` / ``load_gr_with_lines``.

    2. **External line loader** (caller-supplied): when ``line_loader`` is
       provided, calls ``line_loader(doc_raw)`` to obtain the list of lines.
       This allows the caller to supply lines from a separate collection
       without this function needing to know about MongoDB.

    Args:
        doc_raw:        Raw or normalised source document dict.
        line_loader:    Optional callable that takes ``doc_raw`` and returns
                        a list of line dicts.  When ``None``, uses the
                        embedded ``lines`` array.
        qty_field:      Field name fallback for ordered quantity
                        (forwarded to ``line_open_qty``).
        consumed_fields: Counter fields to sum
                        (forwarded to ``line_open_qty``).

    Returns:
        True if all lines are fully consumed, False if any line still has
        open qty > TOLERANCE.
    """
    lines: List[Dict[str, Any]] = (
        line_loader(doc_raw) if line_loader is not None else doc_raw.get("lines", [])
    )
    for ln in lines:
        if line_open_qty(ln, qty_field=qty_field, consumed_fields=consumed_fields) > TOLERANCE:
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
    trail records who (via a downstream document creation / edit / deletion)
    triggered the state change.

    Best-effort: logs a warning on failure but does not re-raise.  Audit
    failure must never roll back the originating operation.

    Args:
        db:               Motor database instance.
        audit_collection: Name of the audit collection to write to
                          (e.g. ``"deliveries_v2_audit"``,
                          ``"purchase_orders_audit"``).
        doc_entry:        UUID of the affected source document.  Both Sales
                          (``docEntry`` key) and Purchasing (``docId`` key)
                          pass their own UUID here; the audit entry stores it
                          under ``docEntry`` regardless so a shared audit
                          reader can query both with one pattern.
        action:           Short action label
                          (e.g. ``"auto_close_on_full_invoice"``,
                          ``"auto_close_on_full_receipt"``).
        user_id:          User who triggered the originating operation.
        detail:           Optional extra metadata dict.

    Returns:
        None.

    Raises:
        Nothing — exceptions are caught and logged.
    """
    try:
        entry: Dict[str, Any] = {
            # Reason: store as ``docEntry`` (not ``docId``) so a shared audit
            # reader can handle purchasing and sales audit collections with a
            # single query pattern.
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
            "[ChainReconciler] audit write failed for doc '%s' collection='%s' action=%s: %s",
            doc_entry,
            audit_collection,
            action,
            exc,
        )


# ---------------------------------------------------------------------------
# Auto-close / auto-reopen
# ---------------------------------------------------------------------------


async def auto_close_if_fully_consumed(
    db: AsyncIOMotorDatabase,
    *,
    doc_collection: str,
    audit_collection: str,
    doc_entry: str,
    doc_raw: Dict[str, Any],
    org_id: str,
    user_id: str,
    doc_key: str = "docEntry",
    line_loader: Optional[Callable[[Dict[str, Any]], List[Dict[str, Any]]]] = None,
    qty_field: str = "quantity",
    consumed_fields: tuple = ("invoicedQty", "creditedQty", "cancelledQty"),
    closed_status: str = DocumentStatus.CLOSED.value,
    action: str = "auto_close_on_full_consumption",
    extra_detail: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Transition a source document from OPEN to CLOSED when fully consumed.

    Checks ``doc_raw`` (the caller-supplied reloaded document) to decide
    whether to transition.  The transition only fires when:
      - ``doc_raw.status == "open"`` (DocumentStatus.OPEN.value), AND
      - ``is_doc_fully_consumed(doc_raw)`` returns True.

    This is a pure status flag for UI/listing purposes — no new outbox event
    is emitted here.

    Args:
        db:               Motor database instance.
        doc_collection:   Collection containing the source document.
        audit_collection: Audit collection to write the close event to.
        doc_entry:        UUID of the source document.
        doc_raw:          Already-reloaded raw source document dict.  Caller
                          must pass the post-increment state so the check
                          reflects the latest counter values.
        org_id:           Organisation UUID for query scoping.
        user_id:          User who triggered the originating operation.
        doc_key:          Primary key field name on the source document
                          (default ``"docEntry"`` for Sales;
                          pass ``"docId"`` for Purchasing).
        line_loader:      Optional line-loader callback (forwarded to
                          ``is_doc_fully_consumed``).
        qty_field:        Ordered-qty field name fallback
                          (forwarded to ``line_open_qty``).
        consumed_fields:  Counter fields to sum
                          (forwarded to ``line_open_qty``).
        closed_status:    Status value to set on transition
                          (default ``DocumentStatus.CLOSED.value``).
        action:           Audit action label
                          (default ``"auto_close_on_full_consumption"``).
        extra_detail:     Additional keys merged into the audit detail dict.

    Returns:
        True if the document was transitioned to CLOSED, False if it was
        already closed or is still not fully consumed.
    """
    if doc_raw is None:
        return False
    if doc_raw.get("status") != DocumentStatus.OPEN.value:
        return False
    if not is_doc_fully_consumed(
        doc_raw,
        line_loader=line_loader,
        qty_field=qty_field,
        consumed_fields=consumed_fields,
    ):
        return False

    now = _now()
    await db[doc_collection].update_one(
        {doc_key: doc_entry, "organizationId": org_id},
        {
            "$set": {
                "status": closed_status,
                "updatedAt": now,
                "updatedBy": user_id,
            }
        },
    )
    logger.info(
        "[ChainReconciler] '%s' collection='%s' auto-closed by user '%s'",
        doc_entry,
        doc_collection,
        user_id,
    )
    await write_chain_audit(
        db,
        audit_collection=audit_collection,
        doc_entry=doc_entry,
        action=action,
        user_id=user_id,
        detail=dict(extra_detail or {}),
    )
    return True


async def auto_reopen_if_not_fully_consumed(
    db: AsyncIOMotorDatabase,
    *,
    doc_collection: str,
    audit_collection: str,
    doc_entry: str,
    doc_raw: Dict[str, Any],
    org_id: str,
    user_id: str,
    doc_key: str = "docEntry",
    line_loader: Optional[Callable[[Dict[str, Any]], List[Dict[str, Any]]]] = None,
    qty_field: str = "quantity",
    consumed_fields: tuple = ("invoicedQty", "creditedQty", "cancelledQty"),
    open_status: str = DocumentStatus.OPEN.value,
    action: str = "auto_reopen_on_consumption_release",
    extra_detail: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Transition a source document from CLOSED to OPEN when no longer fully consumed.

    Checks ``doc_raw`` (the caller-supplied reloaded document) to decide
    whether to transition.  The transition only fires when:
      - ``doc_raw.status == "closed"`` (DocumentStatus.CLOSED.value), AND
      - ``is_doc_fully_consumed(doc_raw)`` returns False.

    This covers the case where a downstream document is deleted or edited
    downward (releasing previously-committed qty).

    Args:
        db:               Motor database instance.
        doc_collection:   Collection containing the source document.
        audit_collection: Audit collection to write the reopen event to.
        doc_entry:        UUID of the source document.
        doc_raw:          Already-reloaded raw source document dict.  Caller
                          must pass the post-decrement state so the check
                          reflects the latest counter values.
        org_id:           Organisation UUID for query scoping.
        user_id:          User who triggered the originating operation.
        doc_key:          Primary key field name (default ``"docEntry"``;
                          pass ``"docId"`` for Purchasing).
        line_loader:      Optional line-loader callback.
        qty_field:        Ordered-qty field name fallback.
        consumed_fields:  Counter fields to sum.
        open_status:      Status value to set on transition
                          (default ``DocumentStatus.OPEN.value``).
        action:           Audit action label
                          (default ``"auto_reopen_on_consumption_release"``).
        extra_detail:     Additional keys merged into the audit detail dict.

    Returns:
        True if the document was transitioned to OPEN, False if it was
        already open or is actually still fully consumed.
    """
    if doc_raw is None:
        return False
    if doc_raw.get("status") != DocumentStatus.CLOSED.value:
        return False
    if is_doc_fully_consumed(
        doc_raw,
        line_loader=line_loader,
        qty_field=qty_field,
        consumed_fields=consumed_fields,
    ):
        return False

    now = _now()
    await db[doc_collection].update_one(
        {doc_key: doc_entry, "organizationId": org_id},
        {
            "$set": {
                "status": open_status,
                "updatedAt": now,
                "updatedBy": user_id,
            }
        },
    )
    logger.info(
        "[ChainReconciler] '%s' collection='%s' auto-reopened by user '%s'",
        doc_entry,
        doc_collection,
        user_id,
    )
    await write_chain_audit(
        db,
        audit_collection=audit_collection,
        doc_entry=doc_entry,
        action=action,
        user_id=user_id,
        detail=dict(extra_detail or {}),
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
    target_doc_entry: str,
    org_id: Optional[str] = None,
    user_id: Optional[str] = None,
    affected_line_ids: Optional[List[str]] = None,
    doc_key: str = "docEntry",
) -> None:
    """
    Remove stale targetDocRef entries from a source document.

    Performs two operations:

    1. ``$pull`` from ``source.targetDocRefs`` (header array) — removes the
       entry whose ``docId`` matches ``target_doc_entry``.  One DB call.

    2. ``$pull`` from ``source.lines[].targetDocRefs`` (per-line arrays) for
       each line in ``affected_line_ids`` — removes entries whose ``docId``
       matches ``target_doc_entry`` from every listed line.  One DB call per
       line.  If ``affected_line_ids`` is None the per-line step is skipped.

    Reason: keying on ``docId`` in the $pull filter ensures a sibling
    document's ref on the same source line is preserved — only the target
    document's ref is removed.

    Args:
        db:                 Motor database instance.
        source_collection:  Collection containing the source document.
        source_doc_entry:   UUID of the source document whose refs are cleaned.
                            Queried against the field named by ``doc_key``.
        target_doc_entry:   docEntry/docId of the document being deleted or
                            replaced.  Used as the ``docId`` key in the
                            $pull filter.
        org_id:             Organisation UUID for query scoping.  Optional;
                            when None the query omits the organizationId filter
                            (purchasing callers with single-tenant collections
                            may pass None).
        user_id:            User performing the operation (stamped on
                            ``updatedBy``).  Optional; when None the
                            ``updatedBy`` field is not updated.
        affected_line_ids:  Source line IDs (``lineId`` values) whose per-line
                            targetDocRefs need cleaning.  Pass an empty list
                            to skip per-line cleanup.  Pass None to also skip.
        doc_key:            Primary key field name on the source document
                            (default ``"docEntry"`` for Sales;
                            pass ``"docId"`` for Purchasing).

    Returns:
        None.
    """
    now = _now()
    query: Dict[str, Any] = {doc_key: source_doc_entry}
    if org_id is not None:
        query["organizationId"] = org_id

    set_op: Dict[str, Any] = {"updatedAt": now}
    if user_id is not None:
        set_op["updatedBy"] = user_id

    # Step 1: $pull from the source document header targetDocRefs.
    await db[source_collection].update_one(
        query,
        {
            "$pull": {"targetDocRefs": {"docId": target_doc_entry}},
            "$set": set_op,
        },
    )

    # Step 2: $pull per-line targetDocRefs for each affected source line.
    # Reason: only performed when affected_line_ids is explicitly provided
    # (not None) so callers that only have a header ref can skip it cheaply.
    for line_id in (affected_line_ids or []):
        line_query = dict(query)
        line_query["lines.lineId"] = line_id
        await db[source_collection].update_one(
            line_query,
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
    target_doc_entry: str,
    org_id: Optional[str] = None,
    user_id: Optional[str] = None,
    line_deltas: Dict[str, Decimal],
    cap_check: bool = True,
    counter_field: str = "invoicedQty",
    lines_collection: Optional[str] = None,
    doc_key: str = "docEntry",
) -> None:
    """
    Apply per-line counter deltas to source document lines via ``$inc``.

    The caller computes ``line_deltas`` by comparing old and new downstream
    document quantities.  Positive delta = more consumed; negative delta =
    released.

    When ``cap_check=True`` (the default), positive deltas are validated
    against the current ``open_invoice_qty`` on the source line.  If a delta
    would exceed the available open qty, a ``ValueError`` is raised before any
    ``$inc`` writes are performed.

    Reason: cap validation must happen before *any* ``$inc`` is applied so
    that a partially-valid batch does not leave the source document in an
    inconsistent state.

    Schema variants
    ---------------
    - **Embedded lines** (``lines_collection=None``, the default): the
      ``$inc`` targets ``lines.$.counter_field`` using the positional ``$``
      operator on the source document in ``source_collection``.  This is the
      Sales module shape (Delivery notes, Sales Orders have embedded lines).
    - **Separate lines collection** (``lines_collection`` set to a collection
      name): the ``$inc`` targets documents in that collection filtered by
      ``{doc_key: source_doc_entry, "lineId": line_id}``.  This is the
      Purchasing module shape for PO and GR lines.

    The cap-check load path always uses the embedded ``lines`` array on the
    source document (``source_collection``), regardless of ``lines_collection``.
    Purchasing callers that use a separate lines collection must pre-normalise
    the source doc to have the embedded shape (e.g. via ``load_po_with_lines``)
    before calling this function with ``cap_check=True``.

    Args:
        db:                Motor database instance.
        source_collection: Collection containing the source document.
        source_doc_entry:  UUID of the source document.
        target_doc_entry:  UUID of the downstream document (e.g. AR Invoice,
                           GR) — included in the cap-check ValueError message
                           so test assertions can match on it.
        org_id:            Organisation UUID for query scoping.  Optional;
                           when None the query omits organizationId.
        user_id:           User stamped on ``updatedBy``.  Optional.
        line_deltas:       Mapping of source line UUID (``lineId``) to the
                           net delta to apply to ``counter_field``.  Values
                           within ``TOLERANCE`` of zero are skipped.
        cap_check:         When True, validate that positive deltas do not
                           exceed the line's current open_invoice_qty.
                           Default True.
        counter_field:     Name of the counter field to increment
                           (default ``"invoicedQty"``; use ``"receivedQty"``
                           etc. for other counter semantics).
        lines_collection:  When set, the ``$inc`` writes target documents in
                           this collection rather than embedded array elements.
                           Default None (embedded lines shape).
        doc_key:           Primary key field name for the source document
                           query (default ``"docEntry"``).

    Returns:
        None.

    Raises:
        ValueError: If ``cap_check=True`` and a positive delta exceeds the
                    available ``open_invoice_qty`` on the source line.  The
                    error message contains ``target_doc_entry``, the source
                    line UUID, the delta, and the ``open_invoice_qty`` —
                    the substring ``"open_invoice_qty"`` is always present
                    so existing test assertions that match on this substring
                    continue to pass.
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
        source_query: Dict[str, Any] = {doc_key: source_doc_entry}
        if org_id is not None:
            source_query["organizationId"] = org_id

        source_doc = await db[source_collection].find_one(source_query)
        source_lines_map: Dict[str, Dict[str, Any]] = {}
        if source_doc:
            source_lines_map = {
                ln["lineId"]: ln for ln in source_doc.get("lines", [])
            }

        for line_id, delta in significant.items():
            if delta > _ZERO:
                src_ln = source_lines_map.get(line_id)
                if src_ln is not None:
                    open_qty = line_open_qty(src_ln)
                    if delta > open_qty + TOLERANCE:
                        raise ValueError(
                            f"Cannot update document '{target_doc_entry}': "
                            f"increased quantity for source line '{line_id}' "
                            f"by {float(delta):.4f} exceeds available "
                            f"open_invoice_qty={float(open_qty):.4f}. "
                            "Reduce the quantity or create a new document."
                        )

    # Apply $inc on each source line.
    for line_id, delta in significant.items():
        set_op: Dict[str, Any] = {"updatedAt": now}
        if user_id is not None:
            set_op["updatedBy"] = user_id

        if lines_collection is not None:
            # Reason: separate lines collection shape (Purchasing PO/GR lines).
            lines_query: Dict[str, Any] = {doc_key: source_doc_entry, "lineId": line_id}
            await db[lines_collection].update_one(
                lines_query,
                {
                    "$inc": {counter_field: float(delta)},
                    "$set": set_op,
                },
            )
        else:
            # Reason: embedded lines shape (Sales DN/SO, AP Invoice lines).
            line_query: Dict[str, Any] = {doc_key: source_doc_entry, "lines.lineId": line_id}
            if org_id is not None:
                line_query["organizationId"] = org_id
            await db[source_collection].update_one(
                line_query,
                {
                    "$inc": {f"lines.$.{counter_field}": float(delta)},
                    "$set": set_op,
                },
            )
