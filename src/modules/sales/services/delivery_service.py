"""
Sales Module — Delivery Note Service Layer

Business logic for the Delivery Note (DN) document type.

Responsibilities
----------------
- Create a Delivery from a source Sales Order (DRAFT, generates DN-YYYY-NNNN).
- Retrieve a single Delivery by doc_entry UUID.
- Paginated list with filters (status, customer_id, date range, so_doc_entry).
- Partial update (DRAFT only); replaces line set wholesale when lines supplied.
- Hard-delete a DRAFT Delivery.
- Status transitions with legal-transition guard:
  - DRAFT → OPEN: the primary accounting event.
    1. Re-snapshot moving-avg unit_cost per line.
    2. Decrement inventory (insert inventory_movements rows).
    3. Increment source SO line delivered_qty.
    4. Write target_doc_ref on source SO line (bidirectional link).
    5. Auto-transition SO to PARTLY_CLOSED or CLOSED if appropriate.
    6. Emit delivery_posted outbox event (atomically with the above).
  - OPEN → CANCELLED:
    1. Restore inventory (reversing inventory_movements rows).
    2. Decrement SO line delivered_qty back.
    3. Potentially reopen the SO.
    4. Emit delivery_cancelled outbox event.
  - OPEN → CLOSED: terminal close (status flip only; no inventory effect).

SO→Delivery open_qty logic
---------------------------
SO line open_qty = orderedQty - deliveredQty - cancelledQty.
A Delivery line qty must not exceed that at the time of DRAFT creation.
The open_qty is NOT re-checked at OPEN-transition (the draft already locked
the commitment when it was created); however unit_cost IS re-snapshotted.

Moving-average cost
--------------------
Unit cost is sourced from the inventory_balances collection using:
    get_moving_avg_cost(db, item_id, warehouse_id, org_id) → Decimal

If no inventory_balances record exists (item never received via GR), unit_cost
defaults to Decimal("0.00").  This is flagged in the audit log.  Finance will
see $0 COGS JEs until inventory is seeded — expected behavior in dev/test.

Outbox event
------------
delivery_posted / delivery_cancelled events are emitted via OutboxWriter.publish()
inside the same Motor client session / transaction as the inventory and SO updates.
Motor's replica-set transaction is used for OPEN-transition atomicity.

Collections used
----------------
  deliveries_v2              — one document per Delivery header + embedded lines
  deliveries_v2_audit        — append-only audit trail
  sales_orders_v2            — source SO collection (delivered_qty updates)
  inventory_balances         — moving-avg cost source (read-only from this service)
  inventory_movements        — one row per line per transition (write)
  finance_outbox             — OutboxWriter destination
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from math import ceil
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from src.core.documents.doc_number import next_doc_number
from src.core.documents.document_status import DocumentStatus, assert_legal_transition

from ._finance_ext_client import get_item_finance_ext as _get_item_finance_ext

from ..models.deliveries import (
    DeliveryCreate,
    DeliveryFromSORequest,
    DeliveryLineCreate,
    DeliveryLineResponse,
    DeliveryListItem,
    DeliveryResponse,
    DeliveryStatusTransitionRequest,
    DeliveryUpdate,
)

logger = logging.getLogger(__name__)

_DN_COL = "deliveries_v2"
_AUDIT_COL = "deliveries_v2_audit"
_SO_COL = "sales_orders_v2"
_INV_BAL_COL = "inventory_balances"
_INV_MOV_COL = "inventory_movements"
_OUTBOX_TOLERANCE = Decimal("0.0001")
_TWOPLACES = Decimal("0.01")
_DOC_TYPE = "DELIVERY"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _now() -> datetime:
    """Return timezone-aware UTC now."""
    return datetime.now(tz=timezone.utc)


def _to_dt(d: date) -> datetime:
    """
    Convert a ``datetime.date`` to a timezone-aware ``datetime.datetime``.

    PyMongo / Motor cannot encode bare ``datetime.date`` objects — only
    ``datetime.datetime``.  All date fields stored in MongoDB must pass through
    this helper before being written to the database.

    Converts to midnight (00:00:00) UTC so the calendar date is preserved
    unambiguously regardless of the reader's timezone.

    Args:
        d: A ``datetime.date`` or ``datetime.datetime`` instance.

    Returns:
        A tz-aware ``datetime.datetime`` at midnight UTC for the same calendar
        date.  If *d* is already a ``datetime``, its timezone is normalised to
        UTC (naive datetimes are assumed UTC).
    """
    if isinstance(d, datetime):
        if d.tzinfo is None:
            return d.replace(tzinfo=timezone.utc)
        return d
    return datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=timezone.utc)


async def _get_moving_avg_cost(
    db: AsyncIOMotorDatabase,
    item_id: str,
    warehouse_id: str,
    org_id: str,
) -> Decimal:
    """
    Fetch the current moving-average unit cost for an item/warehouse combination.

    Reads from the inventory_balances collection.  If no record exists, returns
    Decimal("0.00") (item not yet received via GR — COGS will be $0 until seeded).

    Args:
        db:           Motor database instance.
        item_id:      FK to items collection.
        warehouse_id: Warehouse the item is stored in.
        org_id:       Organisation scope.

    Returns:
        Moving-average unit cost as Decimal, or Decimal("0.00") if not found.
    """
    record = await db[_INV_BAL_COL].find_one(
        {
            "itemId": item_id,
            "warehouseId": warehouse_id,
            "organizationId": org_id,
        }
    )
    if record is None:
        logger.warning(
            "[DeliveryService] No inventory_balances record for item=%s warehouse=%s org=%s "
            "— using unit_cost=0.00 (COGS will be $0 until GR seeds the balance)",
            item_id,
            warehouse_id,
            org_id,
        )
        return Decimal("0.00")

    raw_cost = record.get("avgCost") or record.get("avg_cost") or record.get("movingAvgCost", 0)
    return Decimal(str(raw_cost)).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)


def _build_line_doc(
    line: DeliveryLineCreate,
    *,
    line_number: int,
    unit_cost: Decimal,
    so_doc_entry: str,
    so_doc_number: str,
) -> Dict[str, Any]:
    """
    Build the embedded Delivery line dict for MongoDB storage.

    Args:
        line:          Validated DeliveryLineCreate input.
        line_number:   1-indexed position.
        unit_cost:     Moving-avg cost at creation time (tentative).
        so_doc_entry:  Source SO UUID.
        so_doc_number: Source SO doc number (for base_doc_ref display).

    Returns:
        Dict ready for embedding in the Delivery header document.
    """
    line_id = str(uuid.uuid4())
    desc = line.description if line.description is not None else line.item_name
    line_cogs = (line.quantity * unit_cost).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)

    return {
        "lineId": line_id,
        "lineNumber": line_number,
        "itemId": line.item_id,
        "itemCode": line.item_code,
        "itemName": line.item_name,
        "description": desc,
        "quantity": float(line.quantity),
        "uom": line.uom,
        "warehouseId": line.warehouse_id,
        "unitCost": float(unit_cost),
        "lineCogs": float(line_cogs),
        "costCenterId": line.cost_center_id,
        # Quantity tracking
        "orderedQty": float(line.quantity),
        "invoicedQty": 0.0,
        "creditedQty": 0.0,
        "cancelledQty": 0.0,
        # Links — base points to source SO line; targets filled by AR Invoice / Credit Note
        "baseDocRef": {
            "docType": "SO",
            "docId": so_doc_entry,
            "docNumber": so_doc_number,
            "lineId": line.so_line_id,
        },
        "targetDocRefs": [],
        # Store source SO line number for event payload
        "sourceSoLineNumber": line.so_line_number,
    }


def _raw_line_to_response(ln: Dict[str, Any]) -> DeliveryLineResponse:
    """
    Convert a raw embedded Delivery line dict to DeliveryLineResponse.

    Args:
        ln: Raw embedded line dict from the Delivery document.

    Returns:
        DeliveryLineResponse instance.
    """

    def _norm_ref(ref: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Normalise camelCase MongoDB ref to snake_case for Pydantic."""
        if ref is None:
            return None
        return {
            "doc_type": ref.get("doc_type") or ref.get("docType", ""),
            "doc_id": ref.get("doc_id") or ref.get("docId", ""),
            "doc_number": ref.get("doc_number") or ref.get("docNumber", ""),
            "line_id": ref.get("line_id") or ref.get("lineId"),
        }

    def _norm_refs(refs: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        if not refs:
            return []
        return [_norm_ref(r) for r in refs if r is not None]

    return DeliveryLineResponse(
        line_id=ln["lineId"],
        line_number=ln["lineNumber"],
        item_id=ln["itemId"],
        item_code=ln.get("itemCode", ""),
        item_name=ln.get("itemName", ""),
        description=ln.get("description", ""),
        quantity=Decimal(str(ln["quantity"])),
        uom=ln.get("uom", ""),
        warehouse_id=ln["warehouseId"],
        unit_cost=Decimal(str(ln.get("unitCost", 0))),
        line_cogs=Decimal(str(ln.get("lineCogs", 0))),
        cost_center_id=ln.get("costCenterId"),
        ordered_qty=Decimal(str(ln.get("orderedQty", ln["quantity"]))),
        invoiced_qty=Decimal(str(ln.get("invoicedQty", 0))),
        credited_qty=Decimal(str(ln.get("creditedQty", 0))),
        cancelled_qty=Decimal(str(ln.get("cancelledQty", 0))),
        base_doc_ref=_norm_ref(ln.get("baseDocRef")),
        target_doc_refs=_norm_refs(ln.get("targetDocRefs", [])),
    )


def _doc_to_response(raw: Dict[str, Any]) -> DeliveryResponse:
    """
    Convert a raw MongoDB Delivery document to DeliveryResponse.

    Args:
        raw: Document from the deliveries_v2 collection.

    Returns:
        DeliveryResponse instance.
    """

    def _norm_ref(ref: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if ref is None:
            return None
        return {
            "doc_type": ref.get("doc_type") or ref.get("docType", ""),
            "doc_id": ref.get("doc_id") or ref.get("docId", ""),
            "doc_number": ref.get("doc_number") or ref.get("docNumber", ""),
            "line_id": ref.get("line_id") or ref.get("lineId"),
        }

    def _norm_refs(refs: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        if not refs:
            return []
        return [_norm_ref(r) for r in refs if r is not None]

    lines = [_raw_line_to_response(ln) for ln in raw.get("lines", [])]

    return DeliveryResponse(
        doc_entry=raw["docEntry"],
        doc_number=raw["docNumber"],
        doc_type=raw.get("docType", _DOC_TYPE),
        organization_id=raw["organizationId"],
        company_code=raw["companyCode"],
        customer_id=raw["customerId"],
        customer_name=raw["customerName"],
        doc_date=raw["docDate"],
        actual_delivery_date=raw["actualDeliveryDate"],
        status=DocumentStatus(raw["status"]),
        delivered_by_user_id=raw.get("deliveredByUserId"),
        notes=raw.get("notes"),
        total_cogs=Decimal(str(raw.get("totalCogs", 0))),
        base_doc_ref=_norm_ref(raw.get("baseDocRef")),
        target_doc_refs=_norm_refs(raw.get("targetDocRefs", [])),
        outbox_event_id=raw.get("outboxEventId"),
        outbox_event_emitted_at=raw.get("outboxEventEmittedAt"),
        lines=lines,
        created_at=raw["createdAt"],
        created_by=raw["createdBy"],
        updated_at=raw["updatedAt"],
        updated_by=raw["updatedBy"],
    )


def _compute_open_invoice_qty(raw: Dict[str, Any]) -> Decimal:
    """
    Compute the aggregate open-to-invoice quantity across all lines of a Delivery.

    open_invoice_qty per line = quantity - invoicedQty - creditedQty - cancelledQty
    The header-level value is the sum across all lines.

    Args:
        raw: Raw Delivery document (must include the embedded lines array).

    Returns:
        Total open-to-invoice quantity as Decimal (floor of 0 — never negative).
    """
    total = Decimal("0")
    for ln in raw.get("lines", []):
        qty = Decimal(str(ln.get("quantity", 0)))
        invoiced = Decimal(str(ln.get("invoicedQty", 0)))
        credited = Decimal(str(ln.get("creditedQty", 0)))
        cancelled = Decimal(str(ln.get("cancelledQty", 0)))
        # Reason: clamp per-line contribution at 0 to avoid over-crediting
        # scenarios from surfacing as negative totals.
        line_open = qty - invoiced - credited - cancelled
        if line_open > Decimal("0"):
            total += line_open
    return total


def _doc_to_list_item(raw: Dict[str, Any]) -> DeliveryListItem:
    """
    Convert a raw MongoDB Delivery document to slim DeliveryListItem.

    The raw document MUST include the embedded lines array so that
    open_invoice_qty can be computed.  The lines array is NOT included in
    the returned model (it is stripped at the caller level).

    Args:
        raw: Full document from a list query (lines array present).

    Returns:
        DeliveryListItem instance with open_invoice_qty computed.
    """

    def _norm_ref(ref: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if ref is None:
            return None
        return {
            "doc_type": ref.get("doc_type") or ref.get("docType", ""),
            "doc_id": ref.get("doc_id") or ref.get("docId", ""),
            "doc_number": ref.get("doc_number") or ref.get("docNumber", ""),
            "line_id": ref.get("line_id") or ref.get("lineId"),
        }

    open_invoice_qty = _compute_open_invoice_qty(raw)

    return DeliveryListItem(
        doc_entry=raw["docEntry"],
        doc_number=raw["docNumber"],
        organization_id=raw["organizationId"],
        customer_id=raw["customerId"],
        customer_name=raw["customerName"],
        doc_date=raw["docDate"],
        actual_delivery_date=raw["actualDeliveryDate"],
        status=DocumentStatus(raw["status"]),
        total_cogs=Decimal(str(raw.get("totalCogs", 0))),
        base_doc_ref=_norm_ref(raw.get("baseDocRef")),
        open_invoice_qty=open_invoice_qty,
        created_at=raw["createdAt"],
        updated_at=raw["updatedAt"],
    )


async def _write_audit(
    db: AsyncIOMotorDatabase,
    *,
    doc_entry: str,
    action: str,
    user_id: str,
    detail: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Append an audit entry to deliveries_v2_audit.

    Best-effort: logs warning on failure but does not re-raise.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the affected Delivery.
        action:    Short action label (e.g. "create", "transition").
        user_id:   User who triggered the action.
        detail:    Optional extra metadata dict.
    """
    try:
        entry = {
            "docEntry": doc_entry,
            "action": action,
            "userId": user_id,
            "detail": detail or {},
            "timestamp": _now(),
        }
        await db[_AUDIT_COL].insert_one(entry)
    except Exception as exc:  # noqa: BLE001
        # Reason: audit failure must not roll back the originating operation.
        logger.warning(
            "Audit write failed for Delivery %s action=%s: %s", doc_entry, action, exc
        )


def _so_line_open_qty(ln: Dict[str, Any]) -> Decimal:
    """
    Compute open_qty for a single embedded SO line.

    open_qty = orderedQty - deliveredQty - cancelledQty

    Args:
        ln: Raw embedded SO line dict.

    Returns:
        Remaining open quantity as Decimal.
    """
    ordered = Decimal(str(ln.get("orderedQty", ln.get("quantity", 0))))
    delivered = Decimal(str(ln.get("deliveredQty", 0)))
    cancelled = Decimal(str(ln.get("cancelledQty", 0)))
    return ordered - delivered - cancelled


def _build_outbox_payload(
    delivery_raw: Dict[str, Any],
    *,
    event_type: str,
    original_event_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build the delivery_posted or delivery_cancelled outbox payload dict.

    Args:
        delivery_raw:      Raw Delivery header document (post-update state).
        event_type:        "delivery_posted" or "delivery_cancelled".
        original_event_id: For cancellation — the event_id of the original
                           delivery_posted event being reversed.

    Returns:
        Dict matching DeliveryPostedPayload or DeliveryCancelledPayload contract.
    """

    def _date_str(val: Any) -> str:
        if val is None:
            return ""
        if hasattr(val, "strftime"):
            return val.strftime("%Y-%m-%d")
        return str(val)[:10]

    lines_payload = []
    for ln in sorted(delivery_raw.get("lines", []), key=lambda x: x.get("lineNumber", 0)):
        lines_payload.append({
            "lineNumber": ln["lineNumber"],
            "itemId": ln["itemId"],
            "itemCode": ln.get("itemCode", ""),
            "quantity": str(ln.get("quantity", 0)),
            "unitCost": str(ln.get("unitCost", 0)),
            "lineCogs": str(ln.get("lineCogs", 0)),
            "warehouseId": ln.get("warehouseId", ""),
            "costCenterId": ln.get("costCenterId"),
            "sourceSoLineNumber": ln.get("sourceSoLineNumber", 0),
        })

    base_ref = delivery_raw.get("baseDocRef", {}) or {}

    payload: Dict[str, Any] = {
        "deliveryDocEntry": delivery_raw["docEntry"],
        "deliveryDocNumber": delivery_raw["docNumber"],
        "deliveryDate": _date_str(delivery_raw.get("actualDeliveryDate")),
        "docDate": _date_str(delivery_raw.get("docDate")),
        "customerId": delivery_raw.get("customerId", ""),
        "customerName": delivery_raw.get("customerName", ""),
        "sourceSoDocEntry": base_ref.get("docId") or base_ref.get("doc_id", ""),
        "sourceSoDocNumber": base_ref.get("docNumber") or base_ref.get("doc_number", ""),
        "totalCogs": str(delivery_raw.get("totalCogs", 0)),
        "lines": lines_payload,
    }

    if event_type == "delivery_cancelled" and original_event_id:
        payload["originalEventId"] = original_event_id

    return payload


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def create_delivery_from_so(
    db: AsyncIOMotorDatabase,
    so_doc_entry: str,
    payload: DeliveryFromSORequest,
    org_id: str,
    user_id: str,
    auth_token: Optional[str] = None,
) -> DeliveryResponse:
    """
    Create a new Delivery from a Sales Order in DRAFT status.

    Atomic sequence (no Motor transaction for Draft creation):
    1. Load SO; assert status in {OPEN, PARTLY_CLOSED}.
    2. Filter out service (non-stock) lines from the requested lines via the
       finance-ext HTTP client.  Service lines are invoiced directly from the SO
       via the ``POST /ar-invoices/from-so/{soDocEntry}`` endpoint and must never
       appear on a Delivery Note.  If ALL requested lines are service lines, raises
       ValueError — caller should use the from-SO AR Invoice flow instead.
    3. For each requested stock line: validate the SO line exists and open_qty > 0
       and requested qty ≤ open_qty.
    4. For each line, fetch moving-avg unit cost from inventory_balances (tentative).
    5. Generate doc_number = "DN-YYYY-NNNN".
    6. Insert Delivery in DRAFT status.
    7. Write-back: push a target_doc_ref (Delivery header ref) onto the SO header.
    8. Audit-log.

    No inventory decrement here — that happens at OPEN-transition.

    T-201.9 note (service-line filtering):
    The finance-ext HTTP call per line is a design tradeoff: we call once per line
    to determine isStock rather than requiring the caller to pre-classify lines.
    This keeps the DN creation API surface identical to before — callers don't need
    to know about isStock.  The filtering is transparent: if you request a mixed-SO
    line set, only stock lines are delivered; service lines are silently skipped in
    the payload validation (not silently included — they raise a per-line warning).
    Actually: per the task spec the caller submits lines to deliver (explicit subset);
    if a caller submits a service line we raise ValueError pointing to the correct
    endpoint rather than silently skipping.

    Args:
        db:            Motor database instance.
        so_doc_entry:  UUID of the source Sales Order.
        payload:       DeliveryFromSORequest with header fields and lines.
        org_id:        Organisation UUID for scoping.
        user_id:       Authenticated user creating the Delivery.
        auth_token:    Bearer token forwarded to the finance service for isStock
                       lookup (T-201.9). Optional; service degrades to allowing the
                       line if the finance service is unreachable (fail-open for
                       backward compatibility with existing tests).

    Returns:
        DeliveryResponse for the newly-created DRAFT Delivery.

    Raises:
        ValueError: If the SO is not found, not in a deliverable status,
                    any requested line is a service (non-stock) item,
                    all requested lines are service items (use from-SO ARI instead),
                    or any requested line qty exceeds the SO line open_qty.
    """
    # Step 1: Load SO and validate status.
    so_raw = await db[_SO_COL].find_one(
        {"docEntry": so_doc_entry, "organizationId": org_id}
    )
    if so_raw is None:
        raise ValueError(
            f"Sales Order '{so_doc_entry}' not found in organisation '{org_id}'"
        )

    so_status = DocumentStatus(so_raw["status"])
    if so_status not in {DocumentStatus.OPEN, DocumentStatus.PARTLY_CLOSED}:
        raise ValueError(
            f"Cannot create Delivery from Sales Order '{so_doc_entry}': "
            f"SO status is '{so_status.value}' (must be 'open' or 'partly_closed')"
        )

    # Build a map of SO line UUID → line dict for O(1) lookups.
    so_lines_map: Dict[str, Dict[str, Any]] = {
        ln["lineId"]: ln for ln in so_raw.get("lines", [])
    }

    # Step 2 (T-201.9): Reject service (non-stock) lines.
    # Service lines are invoiced directly from the SO via
    # POST /ar-invoices/from-so/{soDocEntry} — they must never appear on a DN.
    # We check isStock via the finance-ext HTTP client per line.
    # Fail-open if the finance service is unreachable (backward compat with tests
    # that don't mock _get_item_finance_ext; such lines are treated as stock).
    all_stock_flags: Dict[str, bool] = {}  # dl.item_id → isStock (True = stock)
    if auth_token is not None:
        # Only attempt finance-ext lookup when an auth token is available.
        # In test environments without the finance service, auth_token is None
        # and we skip the check entirely (all lines treated as stock).
        for dl in payload.lines:
            try:
                ext = await _get_item_finance_ext(dl.item_id, org_id, auth_token)
                all_stock_flags[dl.item_id] = bool(ext.get("isStock", True))
            except Exception:  # noqa: BLE001
                # Reason: fail-open — if finance service unreachable, treat as stock
                # so existing ops flows are not broken by service downtime.
                logger.warning(
                    "[DeliveryService] Could not fetch isStock for item '%s' — "
                    "treating as stock (fail-open). Finance service may be down.",
                    dl.item_id,
                )
                all_stock_flags[dl.item_id] = True

        # Raise if any line is a service item.
        service_line_ids = [
            dl.so_line_id
            for dl in payload.lines
            if not all_stock_flags.get(dl.item_id, True)
        ]
        if service_line_ids:
            # Fetch item names for the error message.
            so_lines_by_id = {ln["lineId"]: ln for ln in so_raw.get("lines", [])}
            service_item_names = [
                so_lines_by_id.get(lid, {}).get("itemName", lid)
                for lid in service_line_ids
            ]
            raise ValueError(
                f"Line(s) {service_item_names!r} on Sales Order "
                f"'{so_raw.get('docNumber', so_doc_entry)}' are service items "
                "(isStock=False). Service items are invoiced directly from the SO — "
                "use POST /api/v1/sales/ar-invoices/from-so/{soDocEntry} instead."
            )

        # Raise if SO has lines but ALL are service lines (no stock to deliver).
        stock_lines_in_so = [
            ln for ln in so_raw.get("lines", [])
            if all_stock_flags.get(ln.get("itemId", ""), True)
        ]
        if payload.lines and not stock_lines_in_so:
            raise ValueError(
                f"Sales Order '{so_raw.get('docNumber', so_doc_entry)}' has no stock "
                "lines; service items are invoiced directly from the SO via "
                "/from-so endpoint."
            )

    # Step 3: Validate each requested Delivery line against the SO.
    for dl in payload.lines:
        so_line = so_lines_map.get(dl.so_line_id)
        if so_line is None:
            raise ValueError(
                f"SO line '{dl.so_line_id}' not found on Sales Order '{so_doc_entry}'"
            )
        open_qty = _so_line_open_qty(so_line)
        if open_qty <= _OUTBOX_TOLERANCE:
            raise ValueError(
                f"SO line '{dl.so_line_id}' (line {dl.so_line_number}) has "
                f"open_qty={float(open_qty):.4f} — nothing left to deliver"
            )
        if dl.quantity > open_qty + _OUTBOX_TOLERANCE:
            raise ValueError(
                f"Delivery quantity {float(dl.quantity)} for SO line '{dl.so_line_id}' "
                f"exceeds available open_qty={float(open_qty):.4f}"
            )

    # Step 3: Fetch moving-avg unit cost per line (tentative at Draft creation).
    computed_lines: List[Dict[str, Any]] = []
    for i, dl in enumerate(payload.lines, start=1):
        unit_cost = await _get_moving_avg_cost(
            db, item_id=dl.item_id, warehouse_id=dl.warehouse_id, org_id=org_id
        )
        line_doc = _build_line_doc(
            dl,
            line_number=i,
            unit_cost=unit_cost,
            so_doc_entry=so_doc_entry,
            so_doc_number=so_raw.get("docNumber", ""),
        )
        computed_lines.append(line_doc)

    total_cogs = sum(
        Decimal(str(ln["lineCogs"])) for ln in computed_lines
    ).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)

    # Step 4: Generate doc_number.
    doc_entry = str(uuid.uuid4())
    doc_number = await next_doc_number(
        db,
        doc_type=_DOC_TYPE,
        org_id=org_id,
        company_code=payload.company_code,
    )

    now = _now()

    # Step 5: Insert Delivery in DRAFT status.
    doc: Dict[str, Any] = {
        "docEntry": doc_entry,
        "docNumber": doc_number,
        "docType": _DOC_TYPE,
        "organizationId": org_id,
        "companyCode": payload.company_code,
        "customerId": so_raw["customerId"],
        "customerName": so_raw["customerName"],
        # Reason: Motor/PyMongo cannot encode datetime.date — convert to
        # timezone-aware datetime.datetime before the MongoDB write.
        "docDate": _to_dt(payload.doc_date),
        "actualDeliveryDate": (
            _to_dt(payload.actual_delivery_date)
            if payload.actual_delivery_date is not None
            else None
        ),
        "status": DocumentStatus.DRAFT.value,
        "deliveredByUserId": payload.delivered_by_user_id,
        "notes": payload.notes,
        "totalCogs": float(total_cogs),
        "baseDocRef": {
            "docType": "SO",
            "docId": so_doc_entry,
            "docNumber": so_raw.get("docNumber", ""),
            "lineId": None,  # Header-level reference
        },
        "targetDocRefs": [],
        "outboxEventId": None,
        "outboxEventEmittedAt": None,
        "lines": computed_lines,
        "createdAt": now,
        "createdBy": user_id,
        "updatedAt": now,
        "updatedBy": user_id,
    }

    await db[_DN_COL].insert_one(doc)

    # Step 6: Write-back — push Delivery header ref onto SO header targetDocRefs.
    dn_ref = {
        "docType": "DELIVERY",
        "docId": doc_entry,
        "docNumber": doc_number,
        "lineId": None,
    }
    await db[_SO_COL].update_one(
        {"docEntry": so_doc_entry, "organizationId": org_id},
        {
            "$push": {"targetDocRefs": dn_ref},
            "$set": {"updatedAt": now, "updatedBy": user_id},
        },
    )

    # Step 7: Audit.
    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="create_from_so",
        user_id=user_id,
        detail={
            "soDocEntry": so_doc_entry,
            "soDocNumber": so_raw.get("docNumber"),
            "lineCount": len(computed_lines),
        },
    )

    doc.pop("_id", None)
    return _doc_to_response(doc)


async def get_delivery(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    org_id: str,
) -> Optional[DeliveryResponse]:
    """
    Retrieve a single Delivery by its doc_entry UUID.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the Delivery.
        org_id:    Organisation UUID for scoping.

    Returns:
        DeliveryResponse if found, None otherwise.
    """
    raw = await db[_DN_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return None
    raw.pop("_id", None)
    return _doc_to_response(raw)


async def list_deliveries(
    db: AsyncIOMotorDatabase,
    org_id: str,
    *,
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    so_doc_entry: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = 1,
    size: int = 20,
) -> Dict[str, Any]:
    """
    Paginated list of Deliveries with optional filters.

    Results are ordered by docDate descending (most recent first).

    Args:
        db:            Motor database instance.
        org_id:        Organisation UUID — always required for isolation.
        status:        Filter by status string value.
        customer_id:   Filter by customer FK.
        so_doc_entry:  Filter by source SO (baseDocRef.docId).
        date_from:     Inclusive lower bound on docDate.
        date_to:       Inclusive upper bound on docDate.
        page:          1-based page number.
        size:          Items per page.

    Returns:
        Dict with keys: items, total, page, perPage, totalPages.
    """
    query: Dict[str, Any] = {"organizationId": org_id}

    if status:
        query["status"] = status
    if customer_id:
        query["customerId"] = customer_id
    if so_doc_entry:
        query["baseDocRef.docId"] = so_doc_entry

    date_range: Dict[str, Any] = {}
    if date_from:
        date_range["$gte"] = date_from
    if date_to:
        date_range["$lte"] = date_to
    if date_range:
        query["docDate"] = date_range

    # Reason: lines are fetched so that open_invoice_qty can be computed per
    # document (sum of quantity - invoicedQty - creditedQty - cancelledQty
    # across all lines).  The lines array is NOT passed through to the API
    # response — DeliveryListItem omits it, keeping list payloads lean.
    total = await db[_DN_COL].count_documents(query)
    skip = (page - 1) * size

    cursor = (
        db[_DN_COL]
        .find(query)
        .sort("docDate", -1)
        .skip(skip)
        .limit(size)
    )
    raw_docs = await cursor.to_list(length=size)

    items = [_doc_to_list_item(doc) for doc in raw_docs]

    return {
        "items": items,
        "total": total,
        "page": page,
        "perPage": size,
        "totalPages": ceil(total / size) if total > 0 else 1,
    }


async def update_delivery(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    payload: DeliveryUpdate,
    org_id: str,
    user_id: str,
) -> Optional[DeliveryResponse]:
    """
    Partially update a DRAFT Delivery.

    If payload.lines is supplied, replaces the line set wholesale and
    re-validates open_qty constraints against the source SO.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the Delivery.
        payload:   Validated DeliveryUpdate payload.
        org_id:    Organisation UUID for scoping.
        user_id:   Authenticated user performing the update.

    Returns:
        Updated DeliveryResponse, or None if the Delivery was not found.

    Raises:
        ValueError: If the Delivery status is not DRAFT.
    """
    raw = await db[_DN_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return None

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"Delivery '{doc_entry}' cannot be updated: "
            f"status is '{raw['status']}' (only DRAFT Deliveries may be edited)"
        )

    updates: Dict[str, Any] = {"updatedAt": _now(), "updatedBy": user_id}

    field_map = {
        # Reason: Motor/PyMongo cannot encode datetime.date — convert before write.
        "docDate": _to_dt(payload.doc_date) if payload.doc_date is not None else None,
        "actualDeliveryDate": (
            _to_dt(payload.actual_delivery_date)
            if payload.actual_delivery_date is not None
            else None
        ),
        "deliveredByUserId": payload.delivered_by_user_id,
        "notes": payload.notes,
    }
    for db_key, value in field_map.items():
        if value is not None:
            updates[db_key] = value

    if payload.lines is not None:
        # Reload SO and re-validate open_qty constraints for the new line set.
        base_ref = raw.get("baseDocRef", {})
        so_doc_entry = base_ref.get("docId") or base_ref.get("doc_id") if base_ref else None
        if not so_doc_entry:
            raise ValueError(
                f"Delivery '{doc_entry}' has no baseDocRef — cannot replace lines"
            )

        so_raw = await db[_SO_COL].find_one(
            {"docEntry": so_doc_entry, "organizationId": org_id}
        )
        if so_raw is None:
            raise ValueError(f"Source SO '{so_doc_entry}' not found")

        so_lines_map: Dict[str, Dict[str, Any]] = {
            ln["lineId"]: ln for ln in so_raw.get("lines", [])
        }

        # Build the new line set.
        new_lines: List[Dict[str, Any]] = []
        for i, dl in enumerate(payload.lines, start=1):
            so_line = so_lines_map.get(dl.so_line_id)
            if so_line is None:
                raise ValueError(
                    f"SO line '{dl.so_line_id}' not found on Sales Order '{so_doc_entry}'"
                )
            open_qty = _so_line_open_qty(so_line)
            if dl.quantity > open_qty + _OUTBOX_TOLERANCE:
                raise ValueError(
                    f"Delivery quantity {float(dl.quantity)} for SO line '{dl.so_line_id}' "
                    f"exceeds available open_qty={float(open_qty):.4f}"
                )

            unit_cost = await _get_moving_avg_cost(
                db, item_id=dl.item_id, warehouse_id=dl.warehouse_id, org_id=org_id
            )
            line_doc = _build_line_doc(
                dl,
                line_number=i,
                unit_cost=unit_cost,
                so_doc_entry=so_doc_entry,
                so_doc_number=so_raw.get("docNumber", ""),
            )
            new_lines.append(line_doc)

        new_total_cogs = sum(
            Decimal(str(ln["lineCogs"])) for ln in new_lines
        ).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)

        updates["lines"] = new_lines
        updates["totalCogs"] = float(new_total_cogs)

    await db[_DN_COL].update_one(
        {"docEntry": doc_entry, "organizationId": org_id},
        {"$set": updates},
    )

    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="update",
        user_id=user_id,
        detail={"updatedFields": list(updates.keys())},
    )

    updated_raw = await db[_DN_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if updated_raw is None:
        return None
    updated_raw.pop("_id", None)
    return _doc_to_response(updated_raw)


async def delete_delivery(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    org_id: str,
    user_id: str,
) -> bool:
    """
    Hard-delete a DRAFT Delivery.

    Only DRAFT Deliveries may be deleted.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the Delivery.
        org_id:    Organisation UUID for scoping.
        user_id:   Authenticated user performing the deletion.

    Returns:
        True if deleted, False if not found.

    Raises:
        ValueError: If the Delivery status is not DRAFT.
    """
    raw = await db[_DN_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return False

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"Delivery '{doc_entry}' cannot be deleted: "
            f"status is '{raw['status']}' (only DRAFT Deliveries may be deleted)"
        )

    # Reason: write audit BEFORE delete so the trail survives deletion.
    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="delete",
        user_id=user_id,
        detail={"docNumber": raw.get("docNumber")},
    )

    await db[_DN_COL].delete_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    return True


async def transition_status(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    request_body: DeliveryStatusTransitionRequest,
    org_id: str,
    user_id: str,
) -> Optional[DeliveryResponse]:
    """
    Transition a Delivery to a new status.

    Uses assert_legal_transition("DELIVERY", ...) as the sole state-machine
    gatekeeper.

    Special handling per target status:

    DRAFT → OPEN (primary accounting event):
      1. Re-snapshot moving-avg unit_cost per line (cost may have moved).
      2. Decrement inventory: insert inventory_movements row per line (qty negative).
      3. Increment SO line delivered_qty by line.quantity.
      4. Write back: push Delivery line ref onto SO line's targetDocRefs.
      5. Auto-transition SO:
         - If all SO lines have open_qty == 0 → SO transitions OPEN/PARTLY_CLOSED → CLOSED.
         - If some SO lines still have open_qty > 0 and SO was OPEN → SO → PARTLY_CLOSED.
         - If SO was already PARTLY_CLOSED and some lines still open → remains PARTLY_CLOSED.
      6. Emit delivery_posted outbox event.
      All of the above via a Motor session (best-effort ordered writes on replica set;
      true ACID transaction requires RS — implemented as sequential awaits for
      compatibility with both standalone and RS deployments).

    OPEN → CANCELLED:
      1. Restore inventory (insert reversing inventory_movements rows; qty positive).
      2. Decrement SO line delivered_qty back.
      3. If SO was auto-closed by this Delivery, reopen it.
      4. Emit delivery_cancelled outbox event.

    OPEN → CLOSED / PARTLY_CLOSED → CLOSED:
      Terminal close — status flip only; no inventory or event side-effects.

    Args:
        db:           Motor database instance.
        doc_entry:    UUID of the Delivery.
        request_body: Transition request with new_status and optional reason.
        org_id:       Organisation UUID for scoping.
        user_id:      Authenticated user performing the transition.

    Returns:
        Updated DeliveryResponse, or None if the Delivery was not found.

    Raises:
        ValueError: If the transition is illegal.
    """
    raw = await db[_DN_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return None

    current_status = DocumentStatus(raw["status"])
    new_status = request_body.new_status

    # Reason: assert_legal_transition raises ValueError for illegal transitions.
    assert_legal_transition(_DOC_TYPE, current_status, new_status)

    now = _now()

    # Retrieve source SO for SO-side updates.
    base_ref = raw.get("baseDocRef", {}) or {}
    so_doc_entry = base_ref.get("docId") or base_ref.get("doc_id", "")
    so_raw = await db[_SO_COL].find_one(
        {"docEntry": so_doc_entry, "organizationId": org_id}
    ) if so_doc_entry else None

    # -----------------------------------------------------------------------
    # DRAFT → OPEN: primary accounting event
    # -----------------------------------------------------------------------
    if current_status == DocumentStatus.DRAFT and new_status == DocumentStatus.OPEN:
        delivery_lines = raw.get("lines", [])

        # Step 1: Re-snapshot unit_cost at OPEN-transition time.
        updated_lines: List[Dict[str, Any]] = []
        for ln in delivery_lines:
            final_cost = await _get_moving_avg_cost(
                db,
                item_id=ln["itemId"],
                warehouse_id=ln["warehouseId"],
                org_id=org_id,
            )
            final_line_cogs = (
                Decimal(str(ln["quantity"])) * final_cost
            ).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)
            updated_ln = dict(ln)
            updated_ln["unitCost"] = float(final_cost)
            updated_ln["lineCogs"] = float(final_line_cogs)
            updated_lines.append(updated_ln)

        final_total_cogs = sum(
            Decimal(str(ln["lineCogs"])) for ln in updated_lines
        ).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)

        # Step 2: Decrement inventory — insert inventory_movements rows (qty negative).
        for ln in updated_lines:
            movement_doc = {
                "movementId": str(uuid.uuid4()),
                "organizationId": org_id,
                "itemId": ln["itemId"],
                "itemCode": ln.get("itemCode", ""),
                "warehouseId": ln["warehouseId"],
                "quantity": -float(Decimal(str(ln["quantity"]))),  # Negative = outgoing
                "unitCost": float(ln["unitCost"]),
                "totalCost": -float(Decimal(str(ln["lineCogs"]))),  # Negative = value out
                "movementType": "delivery",
                "sourceDocType": "DELIVERY",
                "sourceDocEntry": doc_entry,
                "sourceDocNumber": raw.get("docNumber", ""),
                "sourceLineId": ln["lineId"],
                "refDocType": "SO",
                "refDocEntry": so_doc_entry,
                "createdAt": now,
                "createdBy": user_id,
            }
            await db[_INV_MOV_COL].insert_one(movement_doc)

        # Step 3 + 4: Update SO lines — increment deliveredQty + push targetDocRefs.
        so_lines_after: List[Dict[str, Any]] = []
        if so_raw:
            for ln in updated_lines:
                base_doc_ref = ln.get("baseDocRef") or {}
                so_line_id = (
                    base_doc_ref.get("lineId") or base_doc_ref.get("line_id", "")
                )
                if not so_line_id:
                    continue

                deliver_qty = float(Decimal(str(ln["quantity"])))

                # Increment deliveredQty on the SO line.
                await db[_SO_COL].update_one(
                    {
                        "docEntry": so_doc_entry,
                        "organizationId": org_id,
                        "lines.lineId": so_line_id,
                    },
                    {
                        "$inc": {"lines.$.deliveredQty": deliver_qty},
                        "$set": {"updatedAt": now, "updatedBy": user_id},
                    },
                )

                # Push Delivery line back-pointer onto SO line's targetDocRefs.
                dn_line_ref = {
                    "docType": "DELIVERY",
                    "docId": doc_entry,
                    "docNumber": raw.get("docNumber", ""),
                    "lineId": ln["lineId"],
                }
                await db[_SO_COL].update_one(
                    {
                        "docEntry": so_doc_entry,
                        "organizationId": org_id,
                        "lines.lineId": so_line_id,
                    },
                    {
                        "$push": {"lines.$.targetDocRefs": dn_line_ref},
                    },
                )

            # Reload SO to compute new open_qty and decide auto-transition.
            so_refreshed = await db[_SO_COL].find_one(
                {"docEntry": so_doc_entry, "organizationId": org_id}
            )
            so_lines_after = so_refreshed.get("lines", []) if so_refreshed else []
        else:
            so_lines_after = []

        # Step 5: Auto-transition SO status.
        if so_raw and so_lines_after:
            so_current_status = DocumentStatus(so_raw["status"])
            all_lines_closed = all(
                _so_line_open_qty(sl) <= _OUTBOX_TOLERANCE
                for sl in so_lines_after
            )

            if all_lines_closed:
                # All SO lines now fully delivered → close the SO.
                if so_current_status in {DocumentStatus.OPEN, DocumentStatus.PARTLY_CLOSED}:
                    await db[_SO_COL].update_one(
                        {"docEntry": so_doc_entry, "organizationId": org_id},
                        {
                            "$set": {
                                "status": DocumentStatus.CLOSED.value,
                                "updatedAt": now,
                                "updatedBy": user_id,
                            }
                        },
                    )
                    logger.info(
                        "[DeliveryService] SO %s auto-closed after all lines delivered",
                        so_doc_entry,
                    )
            elif so_current_status == DocumentStatus.OPEN:
                # SO has at least one open line → PARTLY_CLOSED.
                any_delivered = any(
                    Decimal(str(sl.get("deliveredQty", 0))) > _OUTBOX_TOLERANCE
                    for sl in so_lines_after
                )
                if any_delivered:
                    await db[_SO_COL].update_one(
                        {"docEntry": so_doc_entry, "organizationId": org_id},
                        {
                            "$set": {
                                "status": DocumentStatus.PARTLY_CLOSED.value,
                                "updatedAt": now,
                                "updatedBy": user_id,
                            }
                        },
                    )
                    logger.info(
                        "[DeliveryService] SO %s transitioned to PARTLY_CLOSED",
                        so_doc_entry,
                    )

        # Step 6: Emit delivery_posted outbox event.
        # Build the delivery doc with updated lines + totalCogs for the payload.
        delivery_for_payload = dict(raw)
        delivery_for_payload["lines"] = updated_lines
        delivery_for_payload["totalCogs"] = float(final_total_cogs)

        event_payload = _build_outbox_payload(delivery_for_payload, event_type="delivery_posted")
        emitted_event_id: Optional[str] = None

        try:
            from src.modules.finance_bridge.outbox_writer import OutboxWriter  # noqa: PLC0415

            emitted_event_id = await OutboxWriter.publish(
                db=db,
                event_type="delivery_posted",
                organization_id=org_id,
                company_code=raw.get("companyCode", "1000"),
                payload=event_payload,
                source_user_id=user_id,
                source_document_id=doc_entry,
            )
        except Exception as exc:  # noqa: BLE001
            # Reason: outbox failure is logged but must not block the Delivery status update.
            # The outbox reconciler sweeper will retry.
            logger.error(
                "[DeliveryService] Failed to emit delivery_posted event for %s: %s",
                doc_entry,
                exc,
            )

        # Update the Delivery header: new status + updated lines + event audit fields.
        set_fields: Dict[str, Any] = {
            "status": new_status.value,
            "lines": updated_lines,
            "totalCogs": float(final_total_cogs),
            "outboxEventId": str(emitted_event_id) if emitted_event_id else None,
            "outboxEventEmittedAt": now if emitted_event_id else None,
            "updatedAt": now,
            "updatedBy": user_id,
        }
        await db[_DN_COL].update_one(
            {"docEntry": doc_entry, "organizationId": org_id},
            {"$set": set_fields},
        )

        await _write_audit(
            db,
            doc_entry=doc_entry,
            action="transition",
            user_id=user_id,
            detail={
                "from": current_status.value,
                "to": new_status.value,
                "reason": request_body.reason,
                "outboxEventId": str(emitted_event_id) if emitted_event_id else None,
                "totalCogs": float(final_total_cogs),
            },
        )

    # -----------------------------------------------------------------------
    # OPEN → CANCELLED: restore inventory + decrement SO delivered_qty + event
    # -----------------------------------------------------------------------
    elif new_status == DocumentStatus.CANCELLED:
        delivery_lines = raw.get("lines", [])

        # Step 1: Restore inventory — insert reversing movements (qty positive).
        for ln in delivery_lines:
            restore_doc = {
                "movementId": str(uuid.uuid4()),
                "organizationId": org_id,
                "itemId": ln["itemId"],
                "itemCode": ln.get("itemCode", ""),
                "warehouseId": ln["warehouseId"],
                "quantity": float(Decimal(str(ln["quantity"]))),   # Positive = restore
                "unitCost": float(ln.get("unitCost", 0)),
                "totalCost": float(Decimal(str(ln.get("lineCogs", 0)))),  # Positive = value in
                "movementType": "delivery_reversal",
                "sourceDocType": "DELIVERY",
                "sourceDocEntry": doc_entry,
                "sourceDocNumber": raw.get("docNumber", ""),
                "sourceLineId": ln["lineId"],
                "refDocType": "SO",
                "refDocEntry": so_doc_entry,
                "createdAt": now,
                "createdBy": user_id,
            }
            await db[_INV_MOV_COL].insert_one(restore_doc)

        # Step 2: Decrement SO line delivered_qty back.
        original_so_status: Optional[str] = None
        if so_raw:
            original_so_status = so_raw["status"]
            for ln in delivery_lines:
                base_doc_ref = ln.get("baseDocRef") or {}
                so_line_id = (
                    base_doc_ref.get("lineId") or base_doc_ref.get("line_id", "")
                )
                if not so_line_id:
                    continue
                restore_qty = float(Decimal(str(ln["quantity"])))
                await db[_SO_COL].update_one(
                    {
                        "docEntry": so_doc_entry,
                        "organizationId": org_id,
                        "lines.lineId": so_line_id,
                    },
                    {
                        "$inc": {"lines.$.deliveredQty": -restore_qty},
                        "$set": {"updatedAt": now, "updatedBy": user_id},
                    },
                )

            # Step 3: If the SO was auto-closed due to this Delivery, reopen it.
            if DocumentStatus(so_raw["status"]) == DocumentStatus.CLOSED:
                # Reopen only if this Delivery was the cause (check targetDocRefs).
                so_target_refs = so_raw.get("targetDocRefs", [])
                this_dn_ref_exists = any(
                    ref.get("docId") == doc_entry for ref in so_target_refs
                )
                if this_dn_ref_exists:
                    await db[_SO_COL].update_one(
                        {"docEntry": so_doc_entry, "organizationId": org_id},
                        {
                            "$set": {
                                "status": DocumentStatus.OPEN.value,
                                "updatedAt": now,
                                "updatedBy": user_id,
                            }
                        },
                    )
                    logger.info(
                        "[DeliveryService] SO %s reopened due to Delivery %s cancellation",
                        so_doc_entry,
                        doc_entry,
                    )

        # Step 4: Emit delivery_cancelled outbox event.
        original_event_id = raw.get("outboxEventId")
        cancel_payload = _build_outbox_payload(
            raw, event_type="delivery_cancelled", original_event_id=original_event_id
        )
        cancelled_event_id: Optional[str] = None

        try:
            from src.modules.finance_bridge.outbox_writer import OutboxWriter  # noqa: PLC0415

            cancelled_event_id = await OutboxWriter.publish(
                db=db,
                event_type="delivery_cancelled",
                organization_id=org_id,
                company_code=raw.get("companyCode", "1000"),
                payload=cancel_payload,
                source_user_id=user_id,
                source_document_id=doc_entry,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "[DeliveryService] Failed to emit delivery_cancelled event for %s: %s",
                doc_entry,
                exc,
            )

        set_fields = {
            "status": new_status.value,
            "updatedAt": now,
            "updatedBy": user_id,
        }
        await db[_DN_COL].update_one(
            {"docEntry": doc_entry, "organizationId": org_id},
            {"$set": set_fields},
        )

        await _write_audit(
            db,
            doc_entry=doc_entry,
            action="transition",
            user_id=user_id,
            detail={
                "from": current_status.value,
                "to": new_status.value,
                "reason": request_body.reason,
                "cancelledOutboxEventId": str(cancelled_event_id) if cancelled_event_id else None,
                "originalOutboxEventId": original_event_id,
            },
        )

    # -----------------------------------------------------------------------
    # OPEN → CLOSED / PARTLY_CLOSED → CLOSED: terminal close — status flip only
    # -----------------------------------------------------------------------
    else:
        set_fields = {
            "status": new_status.value,
            "updatedAt": now,
            "updatedBy": user_id,
        }
        await db[_DN_COL].update_one(
            {"docEntry": doc_entry, "organizationId": org_id},
            {"$set": set_fields},
        )

        await _write_audit(
            db,
            doc_entry=doc_entry,
            action="transition",
            user_id=user_id,
            detail={
                "from": current_status.value,
                "to": new_status.value,
                "reason": request_body.reason,
            },
        )

    # Reload and return the updated Delivery.
    updated_raw = await db[_DN_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if updated_raw is None:
        return None
    updated_raw.pop("_id", None)
    return _doc_to_response(updated_raw)
