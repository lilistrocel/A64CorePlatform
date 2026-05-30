"""
Sales Module — Return Request Service Layer (T-100.11)

Business logic for the Return Request (RR) document type.

Responsibilities
----------------
- Create a Return Request (DRAFT, generates RR-YYYY-NNNN).
- Retrieve a single RR by doc_entry UUID.
- Paginated list with filters.
- Partial update (DRAFT only).
- Hard-delete a DRAFT RR.
- Status transitions:
  - DRAFT → OPEN: status flip only (no GL impact).
  - OPEN → CLOSED: auto-triggered when all lines consumed_qty == requested_qty,
                   or manually by operator.
  - OPEN/DRAFT → CANCELLED: status flip only.

No outbox events are emitted by the Return Request — it is a pure commitment
document with no GL impact, mirroring the Quote pattern.

Collections used
----------------
  return_requests_v2        — one document per RR header + embedded lines
  return_requests_v2_audit  — append-only audit trail
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

from ..models.return_requests import (
    ReturnRequestCreate,
    ReturnRequestLineCreate,
    ReturnRequestLineResponse,
    ReturnRequestListItem,
    ReturnRequestResponse,
    ReturnRequestStatusTransitionRequest,
    ReturnRequestTotals,
    ReturnRequestUpdate,
)

logger = logging.getLogger(__name__)

_RR_COL = "return_requests_v2"
_AUDIT_COL = "return_requests_v2_audit"
_TWOPLACES = Decimal("0.01")
_ZERO = Decimal("0")
_DOC_TYPE = "RR"


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


def _compute_line_amounts(
    *,
    quantity: Decimal,
    unit_price: Decimal,
    discount_percent: Decimal,
    tax_percent: Decimal,
) -> Dict[str, Decimal]:
    """
    Compute derived monetary amounts for a Return Request line.

    Args:
        quantity:         Requested return quantity.
        unit_price:       Price per unit.
        discount_percent: Line discount 0–100.
        tax_percent:      Tax rate 0–100.

    Returns:
        Dict with keys: line_net, line_tax, line_gross.
    """
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
    line: ReturnRequestLineCreate,
    *,
    line_number: int,
) -> Dict[str, Any]:
    """
    Build the embedded Return Request line dict for MongoDB storage.

    Args:
        line:        Validated ReturnRequestLineCreate input.
        line_number: 1-indexed position.

    Returns:
        Dict ready for embedding in the RR header document.
    """
    line_id = str(uuid.uuid4())
    desc = line.description if line.description is not None else line.item_name
    amounts = _compute_line_amounts(
        quantity=line.requested_qty,
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
        "requestedQty": float(line.requested_qty),
        "uom": line.uom,
        "unitPrice": float(line.unit_price),
        "discountPercent": float(line.discount_percent),
        "lineNet": float(amounts["line_net"]),
        "taxCodeId": line.tax_code_id,
        "taxPercent": float(line.tax_percent),
        "lineTax": float(amounts["line_tax"]),
        "lineGross": float(amounts["line_gross"]),
        "warehouseId": line.warehouse_id,
        "costCenterId": line.cost_center_id,
        "baseDocRef": base_ref_dict,
        "targetDocRefs": [],
        # Qty tracking
        "orderedQty": float(line.requested_qty),
        "consumedQty": 0.0,
    }


def _build_totals(lines: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Aggregate totals from embedded line documents.

    Args:
        lines: Embedded line dicts.

    Returns:
        Dict with keys: net, tax, gross.
    """
    total_net = sum(Decimal(str(ln.get("lineNet", 0))) for ln in lines)
    total_tax = sum(Decimal(str(ln.get("lineTax", 0))) for ln in lines)
    total_gross = (total_net + total_tax).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)
    return {
        "net": float(total_net.quantize(_TWOPLACES, rounding=ROUND_HALF_UP)),
        "tax": float(total_tax.quantize(_TWOPLACES, rounding=ROUND_HALF_UP)),
        "gross": float(total_gross),
    }


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


def _raw_line_to_response(ln: Dict[str, Any]) -> ReturnRequestLineResponse:
    """
    Convert a raw embedded RR line dict to ReturnRequestLineResponse.

    Args:
        ln: Raw embedded line dict from the return_requests_v2 document.

    Returns:
        ReturnRequestLineResponse instance.
    """
    return ReturnRequestLineResponse(
        line_id=ln["lineId"],
        line_number=ln["lineNumber"],
        item_id=ln["itemId"],
        item_code=ln.get("itemCode", ""),
        item_name=ln.get("itemName", ""),
        description=ln.get("description", ""),
        requested_qty=Decimal(str(ln.get("requestedQty", 0))),
        uom=ln.get("uom", ""),
        unit_price=Decimal(str(ln.get("unitPrice", 0))),
        discount_percent=Decimal(str(ln.get("discountPercent", 0))),
        line_net=Decimal(str(ln.get("lineNet", 0))),
        tax_code_id=ln.get("taxCodeId"),
        tax_percent=Decimal(str(ln.get("taxPercent", 0))),
        line_tax=Decimal(str(ln.get("lineTax", 0))),
        line_gross=Decimal(str(ln.get("lineGross", 0))),
        warehouse_id=ln.get("warehouseId"),
        cost_center_id=ln.get("costCenterId"),
        base_doc_ref=_norm_ref(ln.get("baseDocRef")),
        target_doc_refs=_norm_refs(ln.get("targetDocRefs", [])),
        ordered_qty=Decimal(str(ln.get("orderedQty", ln.get("requestedQty", 0)))),
        consumed_qty=Decimal(str(ln.get("consumedQty", 0))),
    )


def _raw_totals_to_model(raw_totals: Dict[str, Any]) -> ReturnRequestTotals:
    """Convert raw MongoDB totals dict to ReturnRequestTotals."""
    return ReturnRequestTotals(
        net=Decimal(str(raw_totals.get("net", 0))),
        tax=Decimal(str(raw_totals.get("tax", 0))),
        gross=Decimal(str(raw_totals.get("gross", 0))),
    )


def _doc_to_response(raw: Dict[str, Any]) -> ReturnRequestResponse:
    """
    Convert a raw MongoDB return_requests_v2 document to ReturnRequestResponse.

    Args:
        raw: Document from the return_requests_v2 collection.

    Returns:
        ReturnRequestResponse instance.
    """
    lines = [_raw_line_to_response(ln) for ln in raw.get("lines", [])]
    raw_totals = raw.get("totals", {})

    return ReturnRequestResponse(
        doc_entry=raw["docEntry"],
        doc_number=raw["docNumber"],
        doc_type=raw.get("docType", _DOC_TYPE),
        organization_id=raw["organizationId"],
        company_code=raw["companyCode"],
        customer_id=raw["customerId"],
        customer_name=raw["customerName"],
        doc_date=raw["docDate"],
        valid_until_date=raw["validUntilDate"],
        reason=raw["reason"],
        reason_text=raw.get("reasonText"),
        status=DocumentStatus(raw["status"]),
        totals=_raw_totals_to_model(raw_totals),
        base_doc_ref=_norm_ref(raw.get("baseDocRef")),
        target_doc_refs=_norm_refs(raw.get("targetDocRefs", [])),
        notes=raw.get("notes"),
        lines=lines,
        created_at=raw["createdAt"],
        created_by=raw["createdBy"],
        updated_at=raw["updatedAt"],
        updated_by=raw["updatedBy"],
    )


def _doc_to_list_item(raw: Dict[str, Any]) -> ReturnRequestListItem:
    """
    Convert a raw MongoDB document to slim ReturnRequestListItem.

    Args:
        raw: Partial document from a list projection query.

    Returns:
        ReturnRequestListItem instance.
    """
    raw_totals = raw.get("totals", {})
    return ReturnRequestListItem(
        doc_entry=raw["docEntry"],
        doc_number=raw["docNumber"],
        organization_id=raw["organizationId"],
        customer_id=raw["customerId"],
        customer_name=raw["customerName"],
        doc_date=raw["docDate"],
        valid_until_date=raw["validUntilDate"],
        reason=raw["reason"],
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
    """
    Append an audit entry to return_requests_v2_audit.

    Best-effort: logs warning on failure but does not re-raise.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the affected RR.
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
            "Audit write failed for ReturnRequest %s action=%s: %s",
            doc_entry,
            action,
            exc,
        )


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def create_return_request(
    db: AsyncIOMotorDatabase,
    payload: ReturnRequestCreate,
    org_id: str,
    user_id: str,
) -> ReturnRequestResponse:
    """
    Create a new Return Request in DRAFT status.

    Sequence:
    1. Build lines with computed amounts.
    2. Generate doc_number = "RR-YYYY-NNNN".
    3. Persist in DRAFT status.
    4. Audit-log.

    Args:
        db:      Motor database instance.
        payload: Validated ReturnRequestCreate payload.
        org_id:  Organisation UUID for scoping.
        user_id: Authenticated user creating the RR.

    Returns:
        ReturnRequestResponse for the newly-created DRAFT RR.
    """
    # Build lines
    computed_lines: List[Dict[str, Any]] = []
    for i, line in enumerate(payload.lines, start=1):
        line_doc = _build_line_doc(line, line_number=i)
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

    # Normalise base_doc_ref to dict
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
        "validUntilDate": _to_dt(payload.valid_until_date),
        "reason": payload.reason,
        "reasonText": payload.reason_text,
        "status": DocumentStatus.DRAFT.value,
        "totals": totals,
        "baseDocRef": base_ref_dict,
        "targetDocRefs": [],
        "notes": payload.notes,
        "lines": computed_lines,
        "createdAt": now,
        "createdBy": user_id,
        "updatedAt": now,
        "updatedBy": user_id,
    }

    await db[_RR_COL].insert_one(doc)

    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="create",
        user_id=user_id,
        detail={
            "customerId": payload.customer_id,
            "lineCount": len(computed_lines),
            "totalGross": totals["gross"],
        },
    )

    doc.pop("_id", None)
    return _doc_to_response(doc)


async def get_return_request(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    org_id: str,
) -> Optional[ReturnRequestResponse]:
    """
    Retrieve a single Return Request by its doc_entry UUID.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the RR.
        org_id:    Organisation UUID for scoping.

    Returns:
        ReturnRequestResponse if found, None otherwise.
    """
    raw = await db[_RR_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return None
    raw.pop("_id", None)
    return _doc_to_response(raw)


async def list_return_requests(
    db: AsyncIOMotorDatabase,
    org_id: str,
    *,
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    """
    Paginated list of Return Requests with optional filters.

    Results are ordered by docDate descending (most recent first).

    Args:
        db:          Motor database instance.
        org_id:      Organisation UUID — always required for isolation.
        status:      Filter by status string value.
        customer_id: Filter by customer FK.
        date_from:   Inclusive lower bound on docDate.
        date_to:     Inclusive upper bound on docDate.
        page:        1-based page number.
        page_size:   Items per page.

    Returns:
        Dict with keys: items, total, page, page_size, total_pages.
    """
    query: Dict[str, Any] = {"organizationId": org_id}

    if status:
        query["status"] = status
    if customer_id:
        query["customerId"] = customer_id

    date_range: Dict[str, Any] = {}
    if date_from:
        date_range["$gte"] = date_from
    if date_to:
        date_range["$lte"] = date_to
    if date_range:
        query["docDate"] = date_range

    projection = {"lines": 0}

    total = await db[_RR_COL].count_documents(query)
    skip = (page - 1) * page_size

    cursor = (
        db[_RR_COL]
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


async def update_return_request(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    payload: ReturnRequestUpdate,
    org_id: str,
    user_id: str,
) -> Optional[ReturnRequestResponse]:
    """
    Partially update a DRAFT Return Request.

    If payload.lines is supplied, replaces the line set wholesale.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the RR.
        payload:   Validated ReturnRequestUpdate payload.
        org_id:    Organisation UUID for scoping.
        user_id:   Authenticated user performing the update.

    Returns:
        Updated ReturnRequestResponse, or None if not found.

    Raises:
        ValueError: If the RR status is not DRAFT.
    """
    raw = await db[_RR_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return None

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"Return Request '{doc_entry}' cannot be updated: "
            f"status is '{raw['status']}' (only DRAFT RRs may be edited)"
        )

    updates: Dict[str, Any] = {"updatedAt": _now(), "updatedBy": user_id}

    field_map = {
        "docDate": _to_dt(payload.doc_date) if payload.doc_date is not None else None,
        "validUntilDate": _to_dt(payload.valid_until_date) if payload.valid_until_date is not None else None,
        "reason": payload.reason,
        "reasonText": payload.reason_text,
        "notes": payload.notes,
    }
    for db_key, value in field_map.items():
        if value is not None:
            updates[db_key] = value

    if payload.lines is not None:
        new_lines: List[Dict[str, Any]] = []
        for i, line in enumerate(payload.lines, start=1):
            new_lines.append(_build_line_doc(line, line_number=i))
        updates["lines"] = new_lines
        updates["totals"] = _build_totals(new_lines)

    await db[_RR_COL].update_one(
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

    updated_raw = await db[_RR_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if updated_raw is None:
        return None
    updated_raw.pop("_id", None)
    return _doc_to_response(updated_raw)


async def delete_return_request(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    org_id: str,
    user_id: str,
) -> bool:
    """
    Hard-delete a DRAFT Return Request.

    Only DRAFT RRs may be deleted.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the RR.
        org_id:    Organisation UUID for scoping.
        user_id:   Authenticated user performing the deletion.

    Returns:
        True if deleted, False if not found.

    Raises:
        ValueError: If the RR status is not DRAFT.
    """
    raw = await db[_RR_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return False

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"Return Request '{doc_entry}' cannot be deleted: "
            f"status is '{raw['status']}' (only DRAFT RRs may be deleted)"
        )

    # Reason: write audit BEFORE delete so the trail survives deletion.
    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="delete",
        user_id=user_id,
        detail={"docNumber": raw.get("docNumber")},
    )

    await db[_RR_COL].delete_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    return True


async def transition_status(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    request_body: ReturnRequestStatusTransitionRequest,
    org_id: str,
    user_id: str,
) -> Optional[ReturnRequestResponse]:
    """
    Transition a Return Request to a new status.

    DRAFT → OPEN: status flip only (no GL impact for RR).
    OPEN → CLOSED: status flip only (manually closed).
    OPEN/DRAFT → CANCELLED: status flip only.

    Args:
        db:           Motor database instance.
        doc_entry:    UUID of the RR.
        request_body: Transition request with new_status and optional reason.
        org_id:       Organisation UUID for scoping.
        user_id:      Authenticated user performing the transition.

    Returns:
        Updated ReturnRequestResponse, or None if not found.

    Raises:
        ValueError: If the transition is illegal.
    """
    raw = await db[_RR_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return None

    current_status = DocumentStatus(raw["status"])
    new_status = request_body.new_status

    # Reason: assert_legal_transition raises ValueError for illegal transitions.
    assert_legal_transition(_DOC_TYPE, current_status, new_status)

    now = _now()

    set_fields: Dict[str, Any] = {
        "status": new_status.value,
        "updatedAt": now,
        "updatedBy": user_id,
    }
    await db[_RR_COL].update_one(
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

    updated_raw = await db[_RR_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if updated_raw is None:
        return None
    updated_raw.pop("_id", None)
    return _doc_to_response(updated_raw)
