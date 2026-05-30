"""
Sales Module — Return (RTN) Service Layer (T-100.11)

Business logic for the Return Note document type.

Responsibilities
----------------
- Create a Return from a Return Request (DRAFT, generates RTN-YYYY-NNNN).
- Create a Return directly from a Delivery (no RR shortcut flow).
- Retrieve a single Return by doc_entry UUID.
- Paginated list with filters.
- Partial update (DRAFT only).
- Hard-delete a DRAFT Return.
- Status transitions:
  - DRAFT → OPEN: the primary inventory event.
    1. Re-snapshot unit_cost from inventory_balances (moving avg cost).
       NOTE: The unit_cost choice is CURRENT MOVING AVERAGE, not the original
       Delivery's snapshotted cost. Rationale: using current avg preserves
       correct inventory balance accounting at the time of return. The COGS
       reversal amount reflects what the inventory is worth NOW. If precise
       symmetry with the original Delivery is required, the `unit_cost` from
       the source Delivery line should be used instead; we choose current avg
       for correctness of inventory valuation.
    2. Restore inventory (positive inventory_movements rows).
    3. Increment source Delivery line returnedQty.
    4. If RR is base: increment RR line consumedQty; auto-close RR if fully consumed.
    5. Emit return_posted outbox event.
    6. Audit-log.
  - OPEN → CANCELLED:
    1. Reverse inventory restoration (negative movement).
    2. Decrement source Delivery line returnedQty.
    3. Decrement RR line consumedQty (if RR was base), reopen RR if needed.
    4. Emit return_cancelled event.
  - OPEN → CLOSED: terminal close (status flip only).

Collections used
----------------
  returns_v2              — one document per Return header + embedded lines
  returns_v2_audit        — append-only audit trail
  return_requests_v2      — source RR (consumedQty updates)
  deliveries_v2           — source Delivery (returnedQty updates)
  inventory_balances      — moving-avg cost source (read-only)
  inventory_movements     — one row per line per transition (write)
  finance_outbox          — OutboxWriter destination
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

from ..models.returns import (
    ReturnCreate,
    ReturnFromRequestRequest,
    ReturnLineCreate,
    ReturnLineResponse,
    ReturnListItem,
    ReturnResponse,
    ReturnStatusTransitionRequest,
    ReturnTotals,
    ReturnUpdate,
)

logger = logging.getLogger(__name__)

_RTN_COL = "returns_v2"
_AUDIT_COL = "returns_v2_audit"
_RR_COL = "return_requests_v2"
_DN_COL = "deliveries_v2"
_INV_BAL_COL = "inventory_balances"
_INV_MOV_COL = "inventory_movements"
_TWOPLACES = Decimal("0.01")
_TOLERANCE = Decimal("0.0001")
_DOC_TYPE = "RTN"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _now() -> datetime:
    """Return timezone-aware UTC now."""
    return datetime.now(tz=timezone.utc)


def _to_dt(d: date) -> datetime:
    """
    Convert a ``datetime.date`` to a UTC-aware ``datetime.datetime``.

    PyMongo / Motor cannot encode bare ``datetime.date`` objects — only
    ``datetime.datetime``.  All date fields stored in MongoDB must pass through
    this helper.

    Args:
        d: A ``datetime.date`` (or ``datetime.datetime`` — the latter is
           returned unchanged since ``datetime`` is a subclass of ``date``).

    Returns:
        A UTC-aware ``datetime.datetime`` at midnight on the same calendar day.
    """
    if isinstance(d, datetime):
        return d
    return datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=timezone.utc)


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
    """Normalise a list of refs."""
    if not refs:
        return []
    return [_norm_ref(r) for r in refs if r is not None]


async def _get_moving_avg_cost(
    db: AsyncIOMotorDatabase,
    item_id: str,
    warehouse_id: str,
    org_id: str,
) -> Decimal:
    """
    Fetch the current moving-average unit cost for an item/warehouse combination.

    For the Return, we use the CURRENT moving average cost (not the original
    Delivery's snapshotted cost). This is technically correct for inventory
    valuation: the inventory is restored at its current value. See module
    docstring for the design rationale.

    Args:
        db:           Motor database instance.
        item_id:      FK to items collection.
        warehouse_id: Warehouse the goods come back into.
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
            "[ReturnService] No inventory_balances record for item=%s warehouse=%s org=%s "
            "— using unit_cost=0.00",
            item_id,
            warehouse_id,
            org_id,
        )
        return Decimal("0.00")

    raw_cost = record.get("avgCost") or record.get("avg_cost") or record.get("movingAvgCost", 0)
    return Decimal(str(raw_cost)).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)


def _compute_line_amounts(
    *,
    quantity: Decimal,
    unit_price: Decimal,
    discount_percent: Decimal,
    tax_percent: Decimal,
) -> Dict[str, Decimal]:
    """Compute derived monetary amounts for a Return line."""
    discount_factor = Decimal("1") - discount_percent / Decimal("100")
    line_net = (quantity * unit_price * discount_factor).quantize(
        _TWOPLACES, rounding=ROUND_HALF_UP
    )
    line_tax = (line_net * tax_percent / Decimal("100")).quantize(
        _TWOPLACES, rounding=ROUND_HALF_UP
    )
    line_gross = (line_net + line_tax).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)
    return {"line_net": line_net, "line_tax": line_tax, "line_gross": line_gross}


def _build_line_doc(
    line: ReturnLineCreate,
    *,
    line_number: int,
    unit_cost: Decimal,
) -> Dict[str, Any]:
    """
    Build the embedded Return line dict for MongoDB storage (tentative unit_cost).

    Args:
        line:        Validated ReturnLineCreate input.
        line_number: 1-indexed position.
        unit_cost:   Tentative moving-avg cost (re-snapshotted at OPEN).

    Returns:
        Dict ready for embedding in the RTN header document.
    """
    line_id = str(uuid.uuid4())
    desc = line.description if line.description is not None else line.item_name
    line_cogs = (line.returned_qty * unit_cost).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)
    amounts = _compute_line_amounts(
        quantity=line.returned_qty,
        unit_price=line.unit_price,
        discount_percent=line.discount_percent,
        tax_percent=line.tax_percent,
    )

    base_ref_dict: Optional[Dict[str, Any]] = None
    if line.base_doc_ref is not None:
        if hasattr(line.base_doc_ref, "model_dump"):
            base_ref_dict = line.base_doc_ref.model_dump()
        elif isinstance(line.base_doc_ref, dict):
            base_ref_dict = line.base_doc_ref
        else:
            base_ref_dict = dict(line.base_doc_ref)

    return {
        "lineId": line_id,
        "lineNumber": line_number,
        "itemId": line.item_id,
        "itemCode": line.item_code,
        "itemName": line.item_name,
        "description": desc,
        "returnedQty": float(line.returned_qty),
        "uom": line.uom,
        "warehouseId": line.warehouse_id,
        "unitCost": float(unit_cost),
        "lineCogs": float(line_cogs),
        "unitPrice": float(line.unit_price),
        "discountPercent": float(line.discount_percent),
        "lineNet": float(amounts["line_net"]),
        "taxCodeId": line.tax_code_id,
        "taxPercent": float(line.tax_percent),
        "lineTax": float(amounts["line_tax"]),
        "lineGross": float(amounts["line_gross"]),
        "costCenterId": line.cost_center_id,
        "baseDocRef": base_ref_dict,
        "targetDocRefs": [],
        "orderedQty": float(line.returned_qty),
        "consumedQty": 0.0,
    }


def _build_totals(lines: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Aggregate totals from embedded Return line documents."""
    total_net = sum(Decimal(str(ln.get("lineNet", 0))) for ln in lines)
    total_tax = sum(Decimal(str(ln.get("lineTax", 0))) for ln in lines)
    total_cogs = sum(Decimal(str(ln.get("lineCogs", 0))) for ln in lines)
    total_gross = (total_net + total_tax).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)
    return {
        "net": float(total_net.quantize(_TWOPLACES, rounding=ROUND_HALF_UP)),
        "tax": float(total_tax.quantize(_TWOPLACES, rounding=ROUND_HALF_UP)),
        "gross": float(total_gross),
        "totalCogs": float(total_cogs.quantize(_TWOPLACES, rounding=ROUND_HALF_UP)),
    }


def _raw_line_to_response(ln: Dict[str, Any]) -> ReturnLineResponse:
    """Convert a raw embedded Return line dict to ReturnLineResponse."""
    return ReturnLineResponse(
        line_id=ln["lineId"],
        line_number=ln["lineNumber"],
        item_id=ln["itemId"],
        item_code=ln.get("itemCode", ""),
        item_name=ln.get("itemName", ""),
        description=ln.get("description", ""),
        returned_qty=Decimal(str(ln.get("returnedQty", 0))),
        uom=ln.get("uom", ""),
        warehouse_id=ln["warehouseId"],
        unit_cost=Decimal(str(ln.get("unitCost", 0))),
        line_cogs=Decimal(str(ln.get("lineCogs", 0))),
        unit_price=Decimal(str(ln.get("unitPrice", 0))),
        discount_percent=Decimal(str(ln.get("discountPercent", 0))),
        line_net=Decimal(str(ln.get("lineNet", 0))),
        tax_code_id=ln.get("taxCodeId"),
        tax_percent=Decimal(str(ln.get("taxPercent", 0))),
        line_tax=Decimal(str(ln.get("lineTax", 0))),
        line_gross=Decimal(str(ln.get("lineGross", 0))),
        cost_center_id=ln.get("costCenterId"),
        base_doc_ref=_norm_ref(ln.get("baseDocRef")),
        target_doc_refs=_norm_refs(ln.get("targetDocRefs", [])),
        ordered_qty=Decimal(str(ln.get("orderedQty", ln.get("returnedQty", 0)))),
        consumed_qty=Decimal(str(ln.get("consumedQty", 0))),
    )


def _raw_totals_to_model(raw_totals: Dict[str, Any]) -> ReturnTotals:
    """Convert raw MongoDB totals dict to ReturnTotals."""
    return ReturnTotals(
        net=Decimal(str(raw_totals.get("net", 0))),
        tax=Decimal(str(raw_totals.get("tax", 0))),
        gross=Decimal(str(raw_totals.get("gross", 0))),
        total_cogs=Decimal(str(raw_totals.get("totalCogs", 0))),
    )


def _doc_to_response(raw: Dict[str, Any]) -> ReturnResponse:
    """Convert a raw MongoDB returns_v2 document to ReturnResponse."""
    lines = [_raw_line_to_response(ln) for ln in raw.get("lines", [])]
    raw_totals = raw.get("totals", {})

    return ReturnResponse(
        doc_entry=raw["docEntry"],
        doc_number=raw["docNumber"],
        doc_type=raw.get("docType", _DOC_TYPE),
        organization_id=raw["organizationId"],
        company_code=raw["companyCode"],
        customer_id=raw["customerId"],
        customer_name=raw["customerName"],
        doc_date=raw["docDate"],
        actual_return_date=raw["actualReturnDate"],
        status=DocumentStatus(raw["status"]),
        received_by_user_id=raw.get("receivedByUserId"),
        base_doc_ref=_norm_ref(raw.get("baseDocRef")),
        target_doc_refs=_norm_refs(raw.get("targetDocRefs", [])),
        outbox_event_id=raw.get("outboxEventId"),
        outbox_event_emitted_at=raw.get("outboxEventEmittedAt"),
        totals=_raw_totals_to_model(raw_totals),
        notes=raw.get("notes"),
        lines=lines,
        created_at=raw["createdAt"],
        created_by=raw["createdBy"],
        updated_at=raw["updatedAt"],
        updated_by=raw["updatedBy"],
    )


def _doc_to_list_item(raw: Dict[str, Any]) -> ReturnListItem:
    """Convert a raw MongoDB document to slim ReturnListItem."""
    raw_totals = raw.get("totals", {})
    return ReturnListItem(
        doc_entry=raw["docEntry"],
        doc_number=raw["docNumber"],
        organization_id=raw["organizationId"],
        customer_id=raw["customerId"],
        customer_name=raw["customerName"],
        doc_date=raw["docDate"],
        actual_return_date=raw["actualReturnDate"],
        status=DocumentStatus(raw["status"]),
        totals=_raw_totals_to_model(raw_totals),
        base_doc_ref=_norm_ref(raw.get("baseDocRef")),
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
    """Append an audit entry to returns_v2_audit."""
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
        logger.warning(
            "Audit write failed for Return %s action=%s: %s", doc_entry, action, exc
        )


def _build_outbox_payload(
    return_raw: Dict[str, Any],
    *,
    event_type: str,
    original_event_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build the return_posted or return_cancelled outbox payload dict.

    Args:
        return_raw:        Raw Return header document (post-update state).
        event_type:        "return_posted" or "return_cancelled".
        original_event_id: For cancellation — the event_id of the original
                           return_posted event being reversed.

    Returns:
        Dict matching ReturnPostedPayload or ReturnCancelledPayload contract.
    """

    def _date_str(val: Any) -> str:
        if val is None:
            return ""
        if hasattr(val, "strftime"):
            return val.strftime("%Y-%m-%d")
        return str(val)[:10]

    lines_payload = []
    for ln in sorted(return_raw.get("lines", []), key=lambda x: x.get("lineNumber", 0)):
        lines_payload.append({
            "lineNumber": ln["lineNumber"],
            "itemId": ln["itemId"],
            "itemCode": ln.get("itemCode", ""),
            "returnedQty": str(ln.get("returnedQty", 0)),
            "unitCost": str(ln.get("unitCost", 0)),
            "lineCogs": str(ln.get("lineCogs", 0)),
            "warehouseId": ln.get("warehouseId", ""),
            "costCenterId": ln.get("costCenterId"),
        })

    base_ref = return_raw.get("baseDocRef") or {}

    payload: Dict[str, Any] = {
        "returnDocEntry": return_raw["docEntry"],
        "returnDocNumber": return_raw["docNumber"],
        "returnDate": _date_str(return_raw.get("actualReturnDate")),
        "docDate": _date_str(return_raw.get("docDate")),
        "customerId": return_raw.get("customerId", ""),
        "customerName": return_raw.get("customerName", ""),
        "baseDocDocEntry": base_ref.get("docId") or base_ref.get("doc_id", ""),
        "baseDocDocNumber": base_ref.get("docNumber") or base_ref.get("doc_number", ""),
        "totalCogs": str(return_raw.get("totals", {}).get("totalCogs", 0)),
        "lines": lines_payload,
    }

    if event_type == "return_cancelled" and original_event_id:
        payload["originalEventId"] = original_event_id

    return payload


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def create_return_from_request(
    db: AsyncIOMotorDatabase,
    rr_doc_entry: str,
    payload: ReturnFromRequestRequest,
    org_id: str,
    user_id: str,
) -> ReturnResponse:
    """
    Create a new Return from a Return Request (DRAFT status).

    Sequence:
    1. Load RR; assert status OPEN.
    2. For each payload line: validate the RR line exists and has available qty.
    3. Fetch tentative moving-avg unit_cost per line.
    4. Generate doc_number = "RTN-YYYY-NNNN".
    5. Insert Return in DRAFT status.
    6. Write-back: push Return header ref onto RR header targetDocRefs.
    7. Audit-log.

    Args:
        db:           Motor database instance.
        rr_doc_entry: UUID of the source Return Request.
        payload:      ReturnFromRequestRequest with header + lines.
        org_id:       Organisation UUID for scoping.
        user_id:      Authenticated user creating the Return.

    Returns:
        ReturnResponse for the newly-created DRAFT Return.

    Raises:
        ValueError: If RR not found, wrong status, or qty constraints violated.
    """
    rr_raw = await db[_RR_COL].find_one(
        {"docEntry": rr_doc_entry, "organizationId": org_id}
    )
    if rr_raw is None:
        raise ValueError(
            f"Return Request '{rr_doc_entry}' not found in organisation '{org_id}'"
        )

    rr_status = DocumentStatus(rr_raw["status"])
    if rr_status not in {DocumentStatus.OPEN}:
        raise ValueError(
            f"Cannot create Return from Return Request '{rr_doc_entry}': "
            f"RR status is '{rr_status.value}' (must be 'open')"
        )

    rr_lines_map: Dict[str, Dict[str, Any]] = {
        ln["lineId"]: ln for ln in rr_raw.get("lines", [])
    }

    # Validate each requested Return line against the RR
    for rl in payload.lines:
        base_ref = rl.base_doc_ref
        rr_line_id = (
            base_ref.line_id
            if hasattr(base_ref, "line_id")
            else (base_ref.get("line_id") or base_ref.get("lineId"))
        ) if base_ref else None

        if rr_line_id and rr_line_id in rr_lines_map:
            rr_line = rr_lines_map[rr_line_id]
            ordered = Decimal(str(rr_line.get("orderedQty", rr_line.get("requestedQty", 0))))
            consumed = Decimal(str(rr_line.get("consumedQty", 0)))
            available = ordered - consumed
            if available <= _TOLERANCE:
                raise ValueError(
                    f"RR line '{rr_line_id}' has no available qty (consumed={consumed})"
                )
            if rl.returned_qty > available + _TOLERANCE:
                raise ValueError(
                    f"Return qty {float(rl.returned_qty)} for RR line '{rr_line_id}' "
                    f"exceeds available qty={float(available):.4f}"
                )

    # Build lines with tentative unit_cost
    computed_lines: List[Dict[str, Any]] = []
    for i, rl in enumerate(payload.lines, start=1):
        unit_cost = await _get_moving_avg_cost(
            db, item_id=rl.item_id, warehouse_id=rl.warehouse_id, org_id=org_id
        )
        line_doc = _build_line_doc(rl, line_number=i, unit_cost=unit_cost)
        computed_lines.append(line_doc)

    totals = _build_totals(computed_lines)

    doc_entry = str(uuid.uuid4())
    doc_number = await next_doc_number(
        db,
        doc_type=_DOC_TYPE,
        org_id=org_id,
        company_code=payload.company_code,
    )

    now = _now()

    # Header base_doc_ref → RR
    rr_header_ref = {
        "docType": "RR",
        "docId": rr_doc_entry,
        "docNumber": rr_raw.get("docNumber", ""),
        "lineId": None,
    }

    doc: Dict[str, Any] = {
        "docEntry": doc_entry,
        "docNumber": doc_number,
        "docType": _DOC_TYPE,
        "organizationId": org_id,
        "companyCode": payload.company_code,
        "customerId": rr_raw["customerId"],
        "customerName": rr_raw["customerName"],
        "docDate": _to_dt(payload.doc_date),
        "actualReturnDate": _to_dt(payload.actual_return_date),
        "status": DocumentStatus.DRAFT.value,
        "receivedByUserId": payload.received_by_user_id,
        "baseDocRef": rr_header_ref,
        "targetDocRefs": [],
        "outboxEventId": None,
        "outboxEventEmittedAt": None,
        "totals": totals,
        "notes": payload.notes,
        "lines": computed_lines,
        "createdAt": now,
        "createdBy": user_id,
        "updatedAt": now,
        "updatedBy": user_id,
    }

    await db[_RTN_COL].insert_one(doc)

    # Write-back: push Return header ref onto RR header targetDocRefs.
    rtn_ref = {
        "docType": "RTN",
        "docId": doc_entry,
        "docNumber": doc_number,
        "lineId": None,
    }
    await db[_RR_COL].update_one(
        {"docEntry": rr_doc_entry, "organizationId": org_id},
        {
            "$push": {"targetDocRefs": rtn_ref},
            "$set": {"updatedAt": now, "updatedBy": user_id},
        },
    )

    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="create_from_rr",
        user_id=user_id,
        detail={
            "rrDocEntry": rr_doc_entry,
            "rrDocNumber": rr_raw.get("docNumber"),
            "lineCount": len(computed_lines),
        },
    )

    doc.pop("_id", None)
    return _doc_to_response(doc)


async def create_return_direct(
    db: AsyncIOMotorDatabase,
    payload: ReturnCreate,
    org_id: str,
    user_id: str,
) -> ReturnResponse:
    """
    Create a Return directly from a Delivery (no Return Request).

    Args:
        db:      Motor database instance.
        payload: Validated ReturnCreate payload.
        org_id:  Organisation UUID for scoping.
        user_id: Authenticated user creating the Return.

    Returns:
        ReturnResponse for the newly-created DRAFT Return.
    """
    # Build lines with tentative unit_cost
    computed_lines: List[Dict[str, Any]] = []
    for i, rl in enumerate(payload.lines, start=1):
        unit_cost = await _get_moving_avg_cost(
            db, item_id=rl.item_id, warehouse_id=rl.warehouse_id, org_id=org_id
        )
        line_doc = _build_line_doc(rl, line_number=i, unit_cost=unit_cost)
        computed_lines.append(line_doc)

    totals = _build_totals(computed_lines)

    doc_entry = str(uuid.uuid4())
    doc_number = await next_doc_number(
        db,
        doc_type=_DOC_TYPE,
        org_id=org_id,
        company_code=payload.company_code,
    )

    now = _now()

    base_ref_dict: Optional[Dict[str, Any]] = None
    if payload.base_doc_ref is not None:
        if hasattr(payload.base_doc_ref, "model_dump"):
            base_ref_dict = payload.base_doc_ref.model_dump()
        elif isinstance(payload.base_doc_ref, dict):
            base_ref_dict = payload.base_doc_ref
        else:
            base_ref_dict = dict(payload.base_doc_ref)

    doc: Dict[str, Any] = {
        "docEntry": doc_entry,
        "docNumber": doc_number,
        "docType": _DOC_TYPE,
        "organizationId": org_id,
        "companyCode": payload.company_code,
        "customerId": payload.customer_id,
        "customerName": payload.customer_name,
        "docDate": _to_dt(payload.doc_date),
        "actualReturnDate": _to_dt(payload.actual_return_date),
        "status": DocumentStatus.DRAFT.value,
        "receivedByUserId": payload.received_by_user_id,
        "baseDocRef": base_ref_dict,
        "targetDocRefs": [],
        "outboxEventId": None,
        "outboxEventEmittedAt": None,
        "totals": totals,
        "notes": payload.notes,
        "lines": computed_lines,
        "createdAt": now,
        "createdBy": user_id,
        "updatedAt": now,
        "updatedBy": user_id,
    }

    await db[_RTN_COL].insert_one(doc)

    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="create_direct",
        user_id=user_id,
        detail={
            "customerId": payload.customer_id,
            "lineCount": len(computed_lines),
        },
    )

    doc.pop("_id", None)
    return _doc_to_response(doc)


async def get_return(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    org_id: str,
) -> Optional[ReturnResponse]:
    """
    Retrieve a single Return by its doc_entry UUID.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the Return.
        org_id:    Organisation UUID for scoping.

    Returns:
        ReturnResponse if found, None otherwise.
    """
    raw = await db[_RTN_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return None
    raw.pop("_id", None)
    return _doc_to_response(raw)


async def list_returns(
    db: AsyncIOMotorDatabase,
    org_id: str,
    *,
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    rr_doc_entry: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    """
    Paginated list of Returns with optional filters.

    Args:
        db:           Motor database instance.
        org_id:       Organisation UUID — always required for isolation.
        status:       Filter by status string value.
        customer_id:  Filter by customer FK.
        rr_doc_entry: Filter by source RR (baseDocRef.docId).
        date_from:    Inclusive lower bound on docDate.
        date_to:      Inclusive upper bound on docDate.
        page:         1-based page number.
        page_size:    Items per page.

    Returns:
        Dict with keys: items, total, page, page_size, total_pages.
    """
    query: Dict[str, Any] = {"organizationId": org_id}

    if status:
        query["status"] = status
    if customer_id:
        query["customerId"] = customer_id
    if rr_doc_entry:
        query["baseDocRef.docId"] = rr_doc_entry

    date_range: Dict[str, Any] = {}
    if date_from:
        date_range["$gte"] = date_from
    if date_to:
        date_range["$lte"] = date_to
    if date_range:
        query["docDate"] = date_range

    projection = {"lines": 0}

    total = await db[_RTN_COL].count_documents(query)
    skip = (page - 1) * page_size

    cursor = (
        db[_RTN_COL]
        .find(query, projection)
        .sort("docDate", -1)
        .skip(skip)
        .limit(page_size)
    )
    raw_docs = await cursor.to_list(length=page_size)
    items = [_doc_to_list_item(doc) for doc in raw_docs]

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": ceil(total / page_size) if page_size > 0 else 1,
    }


async def update_return(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    payload: ReturnUpdate,
    org_id: str,
    user_id: str,
) -> Optional[ReturnResponse]:
    """
    Partially update a DRAFT Return.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the Return.
        payload:   Validated ReturnUpdate payload.
        org_id:    Organisation UUID for scoping.
        user_id:   Authenticated user performing the update.

    Returns:
        Updated ReturnResponse, or None if not found.

    Raises:
        ValueError: If the Return status is not DRAFT.
    """
    raw = await db[_RTN_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return None

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"Return '{doc_entry}' cannot be updated: "
            f"status is '{raw['status']}' (only DRAFT Returns may be edited)"
        )

    updates: Dict[str, Any] = {"updatedAt": _now(), "updatedBy": user_id}

    field_map = {
        "docDate": _to_dt(payload.doc_date) if payload.doc_date is not None else None,
        "actualReturnDate": _to_dt(payload.actual_return_date) if payload.actual_return_date is not None else None,
        "receivedByUserId": payload.received_by_user_id,
        "notes": payload.notes,
    }
    for db_key, value in field_map.items():
        if value is not None:
            updates[db_key] = value

    if payload.lines is not None:
        new_lines: List[Dict[str, Any]] = []
        for i, rl in enumerate(payload.lines, start=1):
            unit_cost = await _get_moving_avg_cost(
                db, item_id=rl.item_id, warehouse_id=rl.warehouse_id, org_id=org_id
            )
            new_lines.append(_build_line_doc(rl, line_number=i, unit_cost=unit_cost))
        updates["lines"] = new_lines
        updates["totals"] = _build_totals(new_lines)

    await db[_RTN_COL].update_one(
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

    updated_raw = await db[_RTN_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if updated_raw is None:
        return None
    updated_raw.pop("_id", None)
    return _doc_to_response(updated_raw)


async def delete_return(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    org_id: str,
    user_id: str,
) -> bool:
    """
    Hard-delete a DRAFT Return.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the Return.
        org_id:    Organisation UUID for scoping.
        user_id:   Authenticated user performing the deletion.

    Returns:
        True if deleted, False if not found.

    Raises:
        ValueError: If the Return status is not DRAFT.
    """
    raw = await db[_RTN_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return False

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"Return '{doc_entry}' cannot be deleted: "
            f"status is '{raw['status']}' (only DRAFT Returns may be deleted)"
        )

    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="delete",
        user_id=user_id,
        detail={"docNumber": raw.get("docNumber")},
    )

    await db[_RTN_COL].delete_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    return True


async def transition_status(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    request_body: ReturnStatusTransitionRequest,
    org_id: str,
    user_id: str,
) -> Optional[ReturnResponse]:
    """
    Transition a Return to a new status.

    DRAFT → OPEN: primary inventory event.
    OPEN → CANCELLED: reverse inventory restoration.
    OPEN → CLOSED: terminal close (status flip only).

    Args:
        db:           Motor database instance.
        doc_entry:    UUID of the Return.
        request_body: Transition request with new_status and optional reason.
        org_id:       Organisation UUID for scoping.
        user_id:      Authenticated user performing the transition.

    Returns:
        Updated ReturnResponse, or None if not found.

    Raises:
        ValueError: If the transition is illegal.
    """
    raw = await db[_RTN_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return None

    current_status = DocumentStatus(raw["status"])
    new_status = request_body.new_status

    # Reason: assert_legal_transition raises ValueError for illegal transitions.
    assert_legal_transition(_DOC_TYPE, current_status, new_status)

    now = _now()

    # -----------------------------------------------------------------------
    # DRAFT → OPEN: primary inventory event
    # -----------------------------------------------------------------------
    if current_status == DocumentStatus.DRAFT and new_status == DocumentStatus.OPEN:
        return_lines = raw.get("lines", [])

        # Step 1: Re-snapshot unit_cost at OPEN-transition time (current avg cost).
        updated_lines: List[Dict[str, Any]] = []
        for ln in return_lines:
            final_cost = await _get_moving_avg_cost(
                db,
                item_id=ln["itemId"],
                warehouse_id=ln["warehouseId"],
                org_id=org_id,
            )
            final_line_cogs = (
                Decimal(str(ln.get("returnedQty", 0))) * final_cost
            ).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)
            updated_ln = dict(ln)
            updated_ln["unitCost"] = float(final_cost)
            updated_ln["lineCogs"] = float(final_line_cogs)
            updated_lines.append(updated_ln)

        # Step 2: Restore inventory — insert inventory_movements rows (qty positive).
        for ln in updated_lines:
            movement_doc = {
                "movementId": str(uuid.uuid4()),
                "organizationId": org_id,
                "itemId": ln["itemId"],
                "itemCode": ln.get("itemCode", ""),
                "warehouseId": ln["warehouseId"],
                "quantity": float(Decimal(str(ln.get("returnedQty", 0)))),   # Positive = incoming
                "unitCost": float(ln["unitCost"]),
                "totalCost": float(Decimal(str(ln.get("lineCogs", 0)))),   # Positive = value in
                "movementType": "return",
                "sourceDocType": "RTN",
                "sourceDocEntry": doc_entry,
                "sourceDocNumber": raw.get("docNumber", ""),
                "sourceLineId": ln["lineId"],
                "createdAt": now,
                "createdBy": user_id,
            }
            await db[_INV_MOV_COL].insert_one(movement_doc)

        # Step 3: Determine base doc type (RR or DELIVERY)
        base_ref = raw.get("baseDocRef") or {}
        base_doc_type = base_ref.get("docType") or base_ref.get("doc_type", "")
        base_doc_entry = base_ref.get("docId") or base_ref.get("doc_id", "")

        # Step 3a: Increment source Delivery line returnedQty.
        # Find the source delivery — could be from RR's base or this RTN's direct base.
        delivery_doc_entry: Optional[str] = None

        if base_doc_type == "DELIVERY":
            delivery_doc_entry = base_doc_entry
        elif base_doc_type == "RR" and base_doc_entry:
            # Look up the RR's base to find the Delivery
            rr_raw = await db[_RR_COL].find_one(
                {"docEntry": base_doc_entry, "organizationId": org_id}
            )
            if rr_raw:
                rr_base = rr_raw.get("baseDocRef") or {}
                if (rr_base.get("docType") or rr_base.get("doc_type", "")) == "DELIVERY":
                    delivery_doc_entry = rr_base.get("docId") or rr_base.get("doc_id")

        if delivery_doc_entry:
            for ln in updated_lines:
                ln_base_ref = ln.get("baseDocRef") or {}
                # Find the Delivery line ID — may be direct or via RR line
                dn_line_id: Optional[str] = None

                if (ln_base_ref.get("docType") or ln_base_ref.get("doc_type", "")) == "DELIVERY":
                    dn_line_id = ln_base_ref.get("lineId") or ln_base_ref.get("line_id")
                elif (ln_base_ref.get("docType") or ln_base_ref.get("doc_type", "")) == "RR":
                    # Line references an RR line — look up that RR line's base
                    rr_line_id = ln_base_ref.get("lineId") or ln_base_ref.get("line_id")
                    rr_doc_entry_ref = ln_base_ref.get("docId") or ln_base_ref.get("doc_id")
                    if rr_doc_entry_ref and rr_line_id:
                        rr_raw_ref = await db[_RR_COL].find_one(
                            {"docEntry": rr_doc_entry_ref, "organizationId": org_id}
                        )
                        if rr_raw_ref:
                            for rr_ln in rr_raw_ref.get("lines", []):
                                if rr_ln.get("lineId") == rr_line_id:
                                    rr_ln_base = rr_ln.get("baseDocRef") or {}
                                    if (rr_ln_base.get("docType") or rr_ln_base.get("doc_type", "")) == "DELIVERY":
                                        dn_line_id = rr_ln_base.get("lineId") or rr_ln_base.get("line_id")
                                    break

                if dn_line_id:
                    return_qty = float(Decimal(str(ln.get("returnedQty", 0))))
                    await db[_DN_COL].update_one(
                        {
                            "docEntry": delivery_doc_entry,
                            "organizationId": org_id,
                            "lines.lineId": dn_line_id,
                        },
                        {
                            "$inc": {"lines.$.returnedQty": return_qty},
                            "$set": {"updatedAt": now, "updatedBy": user_id},
                        },
                    )

        # Step 4: If RR is base, increment RR line consumedQty.
        if base_doc_type == "RR" and base_doc_entry:
            for ln in updated_lines:
                ln_base_ref = ln.get("baseDocRef") or {}
                rr_line_id = ln_base_ref.get("lineId") or ln_base_ref.get("line_id")
                rr_doc_id = ln_base_ref.get("docId") or ln_base_ref.get("doc_id")

                if rr_line_id and rr_doc_id:
                    consumed_qty = float(Decimal(str(ln.get("returnedQty", 0))))
                    await db[_RR_COL].update_one(
                        {
                            "docEntry": rr_doc_id,
                            "organizationId": org_id,
                            "lines.lineId": rr_line_id,
                        },
                        {
                            "$inc": {"lines.$.consumedQty": consumed_qty},
                            "$set": {"updatedAt": now, "updatedBy": user_id},
                        },
                    )

            # Check if all RR lines are fully consumed → auto-close RR.
            rr_refreshed = await db[_RR_COL].find_one(
                {"docEntry": base_doc_entry, "organizationId": org_id}
            )
            if rr_refreshed:
                all_consumed = all(
                    Decimal(str(rr_ln.get("consumedQty", 0))) >=
                    Decimal(str(rr_ln.get("orderedQty", rr_ln.get("requestedQty", 0)))) - _TOLERANCE
                    for rr_ln in rr_refreshed.get("lines", [])
                )
                if all_consumed and DocumentStatus(rr_refreshed["status"]) == DocumentStatus.OPEN:
                    await db[_RR_COL].update_one(
                        {"docEntry": base_doc_entry, "organizationId": org_id},
                        {
                            "$set": {
                                "status": DocumentStatus.CLOSED.value,
                                "updatedAt": now,
                                "updatedBy": user_id,
                            }
                        },
                    )
                    logger.info(
                        "[ReturnService] RR %s auto-closed after all lines consumed",
                        base_doc_entry,
                    )

        # Step 5: Emit return_posted outbox event.
        return_for_payload = dict(raw)
        return_for_payload["lines"] = updated_lines
        updated_totals = _build_totals(updated_lines)
        return_for_payload["totals"] = updated_totals

        event_payload = _build_outbox_payload(return_for_payload, event_type="return_posted")
        emitted_event_id: Optional[str] = None

        try:
            from src.modules.finance_bridge.outbox_writer import OutboxWriter  # noqa: PLC0415

            emitted_event_id = await OutboxWriter.publish(
                db=db,
                event_type="return_posted",
                organization_id=org_id,
                company_code=raw.get("companyCode", "1000"),
                payload=event_payload,
                source_user_id=user_id,
                source_document_id=doc_entry,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "[ReturnService] Failed to emit return_posted event for %s: %s",
                doc_entry,
                exc,
            )

        set_fields: Dict[str, Any] = {
            "status": new_status.value,
            "lines": updated_lines,
            "totals": updated_totals,
            "outboxEventId": str(emitted_event_id) if emitted_event_id else None,
            "outboxEventEmittedAt": now if emitted_event_id else None,
            "updatedAt": now,
            "updatedBy": user_id,
        }
        await db[_RTN_COL].update_one(
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
            },
        )

    # -----------------------------------------------------------------------
    # OPEN → CANCELLED: reverse inventory + decrement source counters + event
    # -----------------------------------------------------------------------
    elif new_status == DocumentStatus.CANCELLED:
        return_lines = raw.get("lines", [])

        # Step 1: Reverse inventory — insert negative movements.
        for ln in return_lines:
            reversal_doc = {
                "movementId": str(uuid.uuid4()),
                "organizationId": org_id,
                "itemId": ln["itemId"],
                "itemCode": ln.get("itemCode", ""),
                "warehouseId": ln["warehouseId"],
                "quantity": -float(Decimal(str(ln.get("returnedQty", 0)))),   # Negative = outgoing
                "unitCost": float(ln.get("unitCost", 0)),
                "totalCost": -float(Decimal(str(ln.get("lineCogs", 0)))),  # Negative = value out
                "movementType": "return_reversal",
                "sourceDocType": "RTN",
                "sourceDocEntry": doc_entry,
                "sourceDocNumber": raw.get("docNumber", ""),
                "sourceLineId": ln["lineId"],
                "createdAt": now,
                "createdBy": user_id,
            }
            await db[_INV_MOV_COL].insert_one(reversal_doc)

        # Step 2: Decrement source Delivery line returnedQty.
        base_ref = raw.get("baseDocRef") or {}
        base_doc_type = base_ref.get("docType") or base_ref.get("doc_type", "")
        base_doc_entry = base_ref.get("docId") or base_ref.get("doc_id", "")

        delivery_doc_entry = None
        if base_doc_type == "DELIVERY":
            delivery_doc_entry = base_doc_entry
        elif base_doc_type == "RR" and base_doc_entry:
            rr_raw = await db[_RR_COL].find_one(
                {"docEntry": base_doc_entry, "organizationId": org_id}
            )
            if rr_raw:
                rr_base = rr_raw.get("baseDocRef") or {}
                if (rr_base.get("docType") or rr_base.get("doc_type", "")) == "DELIVERY":
                    delivery_doc_entry = rr_base.get("docId") or rr_base.get("doc_id")

        if delivery_doc_entry:
            for ln in return_lines:
                ln_base_ref = ln.get("baseDocRef") or {}
                dn_line_id = None
                if (ln_base_ref.get("docType") or ln_base_ref.get("doc_type", "")) == "DELIVERY":
                    dn_line_id = ln_base_ref.get("lineId") or ln_base_ref.get("line_id")

                if dn_line_id:
                    restore_qty = float(Decimal(str(ln.get("returnedQty", 0))))
                    await db[_DN_COL].update_one(
                        {
                            "docEntry": delivery_doc_entry,
                            "organizationId": org_id,
                            "lines.lineId": dn_line_id,
                        },
                        {
                            "$inc": {"lines.$.returnedQty": -restore_qty},
                            "$set": {"updatedAt": now, "updatedBy": user_id},
                        },
                    )

        # Step 3: Decrement RR line consumedQty and reopen RR if it was auto-closed.
        if base_doc_type == "RR" and base_doc_entry:
            for ln in return_lines:
                ln_base_ref = ln.get("baseDocRef") or {}
                rr_line_id = ln_base_ref.get("lineId") or ln_base_ref.get("line_id")
                rr_doc_id = ln_base_ref.get("docId") or ln_base_ref.get("doc_id")

                if rr_line_id and rr_doc_id:
                    restore_qty = float(Decimal(str(ln.get("returnedQty", 0))))
                    await db[_RR_COL].update_one(
                        {
                            "docEntry": rr_doc_id,
                            "organizationId": org_id,
                            "lines.lineId": rr_line_id,
                        },
                        {
                            "$inc": {"lines.$.consumedQty": -restore_qty},
                            "$set": {"updatedAt": now, "updatedBy": user_id},
                        },
                    )

            # Reopen RR if it was auto-closed by this Return.
            rr_raw_post = await db[_RR_COL].find_one(
                {"docEntry": base_doc_entry, "organizationId": org_id}
            )
            if rr_raw_post and DocumentStatus(rr_raw_post["status"]) == DocumentStatus.CLOSED:
                rr_target_refs = rr_raw_post.get("targetDocRefs", [])
                this_rtn_ref_exists = any(
                    ref.get("docId") == doc_entry for ref in rr_target_refs
                )
                if this_rtn_ref_exists:
                    await db[_RR_COL].update_one(
                        {"docEntry": base_doc_entry, "organizationId": org_id},
                        {
                            "$set": {
                                "status": DocumentStatus.OPEN.value,
                                "updatedAt": now,
                                "updatedBy": user_id,
                            }
                        },
                    )
                    logger.info(
                        "[ReturnService] RR %s reopened due to Return %s cancellation",
                        base_doc_entry,
                        doc_entry,
                    )

        # Step 4: Emit return_cancelled outbox event.
        original_event_id = raw.get("outboxEventId")
        cancel_payload = _build_outbox_payload(
            raw, event_type="return_cancelled", original_event_id=original_event_id
        )
        cancelled_event_id: Optional[str] = None

        try:
            from src.modules.finance_bridge.outbox_writer import OutboxWriter  # noqa: PLC0415

            cancelled_event_id = await OutboxWriter.publish(
                db=db,
                event_type="return_cancelled",
                organization_id=org_id,
                company_code=raw.get("companyCode", "1000"),
                payload=cancel_payload,
                source_user_id=user_id,
                source_document_id=doc_entry,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "[ReturnService] Failed to emit return_cancelled event for %s: %s",
                doc_entry,
                exc,
            )

        set_fields = {
            "status": new_status.value,
            "updatedAt": now,
            "updatedBy": user_id,
        }
        await db[_RTN_COL].update_one(
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
    # OPEN → CLOSED: terminal close — status flip only
    # -----------------------------------------------------------------------
    else:
        set_fields = {
            "status": new_status.value,
            "updatedAt": now,
            "updatedBy": user_id,
        }
        await db[_RTN_COL].update_one(
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

    # Reload and return the updated Return.
    updated_raw = await db[_RTN_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if updated_raw is None:
        return None
    updated_raw.pop("_id", None)
    return _doc_to_response(updated_raw)
