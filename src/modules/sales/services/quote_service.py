"""
Sales Module — Sales Quote Service Layer

Business logic for the Sales Quote (SQ) document type.

Responsibilities
----------------
- Create a new quote (generates doc_number via T-100.1 next_doc_number helper).
- Retrieve a single quote by doc_entry UUID.
- Paginated list with filters.
- Partial update (DRAFT only); replaces line set wholesale when lines supplied.
- Dedicated status transition with legal-transition guard (T-100.1
  assert_legal_transition).
- Hard-delete a DRAFT quote (no downstream consumption has occurred).

All state-mutating operations write an audit entry to the ``sales_quotes_audit``
collection immediately after the main document write.  The audit write is
best-effort (a write failure is logged but does not roll back the document write)
because the Quote has no GL impact and no finance outbox event.  This is
intentional — the Quote is the simplest document in the chain.

When the Quote emits finance events (never — it generates no GL posting),
the writes should be placed inside a Motor transaction.  That complexity is
deferred to the SO/Invoice layers.

Collections used
----------------
  sales_quotes           — one document per Sales Quote header + embedded lines
  sales_quotes_audit     — append-only audit trail
  document_counters      — shared counter for doc_number generation (T-100.1)

MongoDB document field conventions
-----------------------------------
All fields stored in camelCase to align with the wider ops-backend convention
(e.g. ``docEntry``, ``docNumber``, ``organizationId``).  Pydantic schemas use
snake_case; the service layer translates on the way in and out.
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

from ..models.quotes import (
    QuoteCreate,
    QuoteLineCreate,
    QuoteLineResponse,
    QuoteListItem,
    QuoteResponse,
    QuoteTotals,
    QuoteUpdate,
)

logger = logging.getLogger(__name__)

_QUOTES_COL = "sales_quotes"
_AUDIT_COL = "sales_quotes_audit"
_TWOPLACES = Decimal("0.01")
_DOC_TYPE = "QUOTE"
_DOC_TYPE_CODE = "SQ"


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


def _compute_line(line: QuoteLineCreate) -> Dict[str, Any]:
    """
    Compute monetary totals for a single line.

    Applies:
        line_net   = quantity × unit_price × (1 − discount_percent / 100)
        line_tax   = line_net × tax_percent / 100
        line_gross = line_net + line_tax

    All results are quantised to 2 decimal places (ROUND_HALF_UP) to avoid
    floating-point drift when values are round-tripped through MongoDB.

    Args:
        line: QuoteLineCreate input from the caller.

    Returns:
        Dict ready for MongoDB embedding (camelCase keys).
    """
    line_id = str(uuid.uuid4())
    desc = line.description if line.description is not None else line.item_name

    net_raw = (
        line.quantity
        * line.unit_price
        * (Decimal("1") - line.discount_percent / Decimal("100"))
    )
    line_net = net_raw.quantize(_TWOPLACES, rounding=ROUND_HALF_UP)
    tax_raw = line_net * line.tax_percent / Decimal("100")
    line_tax = tax_raw.quantize(_TWOPLACES, rounding=ROUND_HALF_UP)
    line_gross = line_net + line_tax

    return {
        "lineId": line_id,
        "lineNumber": 0,       # caller patches line_number after building the list
        "itemId": line.item_id,
        "itemCode": line.item_code,
        "itemName": line.item_name,
        "description": desc,
        "quantity": float(line.quantity),
        "uom": line.uom,
        "unitPrice": float(line.unit_price),
        "discountPercent": float(line.discount_percent),
        "lineNet": float(line_net),
        "taxCodeId": line.tax_code_id,
        "taxPercent": float(line.tax_percent),
        "lineTax": float(line_tax),
        "lineGross": float(line_gross),
        "warehouseId": line.warehouse_id,
        "costCenterId": line.cost_center_id,
        "orderedQty": float(line.quantity),
        "consumedQty": 0.0,
        "baseDocRef": None,
        "targetDocRefs": [],
        "notes": line.notes,
    }


def _compute_lines(lines: List[QuoteLineCreate]) -> List[Dict[str, Any]]:
    """
    Build the full lines array with correct 1-indexed line_number values.

    Args:
        lines: Ordered list of QuoteLineCreate inputs.

    Returns:
        List of computed line dicts with lineNumber set.
    """
    result = []
    for i, line in enumerate(lines, start=1):
        computed = _compute_line(line)
        computed["lineNumber"] = i
        result.append(computed)
    return result


def _compute_totals(lines: List[Dict[str, Any]]) -> Dict[str, float]:
    """
    Sum line_net, line_tax, line_gross across all computed lines.

    Args:
        lines: List of computed line dicts.

    Returns:
        Dict with keys 'net', 'tax', 'gross'.
    """
    total_net = sum(Decimal(str(ln["lineNet"])) for ln in lines)
    total_tax = sum(Decimal(str(ln["lineTax"])) for ln in lines)
    total_gross = total_net + total_tax
    return {
        "net": float(total_net.quantize(_TWOPLACES, rounding=ROUND_HALF_UP)),
        "tax": float(total_tax.quantize(_TWOPLACES, rounding=ROUND_HALF_UP)),
        "gross": float(total_gross.quantize(_TWOPLACES, rounding=ROUND_HALF_UP)),
    }


def _doc_to_response(raw: Dict[str, Any]) -> QuoteResponse:
    """
    Convert a raw MongoDB document dict to a ``QuoteResponse`` Pydantic model.

    Args:
        raw: Document from the ``sales_quotes`` collection.

    Returns:
        QuoteResponse instance.

    Raises:
        ValueError: If required fields are absent (indicates data corruption).
    """
    totals_raw = raw.get("totals", {})
    totals = QuoteTotals(
        net=Decimal(str(totals_raw.get("net", 0))),
        tax=Decimal(str(totals_raw.get("tax", 0))),
        gross=Decimal(str(totals_raw.get("gross", 0))),
    )

    lines = [_raw_line_to_response(ln) for ln in raw.get("lines", [])]

    return QuoteResponse(
        doc_entry=raw["docEntry"],
        doc_number=raw["docNumber"],
        doc_type=raw.get("docType", _DOC_TYPE_CODE),
        organization_id=raw["organizationId"],
        company_code=raw["companyCode"],
        customer_id=raw["customerId"],
        customer_name=raw["customerName"],
        doc_date=raw["docDate"],
        valid_until_date=raw["validUntilDate"],
        status=DocumentStatus(raw["status"]),
        currency=raw.get("currency", "AED"),
        exchange_rate=Decimal(str(raw.get("exchangeRate", 1))),
        payment_terms_id=raw.get("paymentTermsId"),
        sales_employee_id=raw.get("salesEmployeeId"),
        owner_user_id=raw["ownerUserId"],
        bp_ref_no=raw.get("bpRefNo"),
        journal_memo=raw.get("journalMemo"),
        notes=raw.get("notes"),
        totals=totals,
        base_doc_ref=raw.get("baseDocRef"),
        target_doc_refs=raw.get("targetDocRefs", []),
        lines=lines,
        created_at=raw["createdAt"],
        created_by=raw["createdBy"],
        updated_at=raw["updatedAt"],
        updated_by=raw["updatedBy"],
    )


def _raw_line_to_response(ln: Dict[str, Any]) -> QuoteLineResponse:
    """
    Convert a raw embedded line dict to a QuoteLineResponse.

    Args:
        ln: Raw embedded line dict from the quote document.

    Returns:
        QuoteLineResponse instance.
    """
    return QuoteLineResponse(
        line_id=ln["lineId"],
        line_number=ln["lineNumber"],
        item_id=ln["itemId"],
        item_code=ln.get("itemCode", ""),
        item_name=ln.get("itemName", ""),
        description=ln.get("description", ""),
        quantity=Decimal(str(ln["quantity"])),
        uom=ln.get("uom", ""),
        unit_price=Decimal(str(ln["unitPrice"])),
        discount_percent=Decimal(str(ln.get("discountPercent", 0))),
        line_net=Decimal(str(ln["lineNet"])),
        tax_code_id=ln.get("taxCodeId"),
        tax_percent=Decimal(str(ln.get("taxPercent", 0))),
        line_tax=Decimal(str(ln["lineTax"])),
        line_gross=Decimal(str(ln["lineGross"])),
        warehouse_id=ln.get("warehouseId"),
        cost_center_id=ln.get("costCenterId"),
        ordered_qty=Decimal(str(ln.get("orderedQty", ln["quantity"]))),
        consumed_qty=Decimal(str(ln.get("consumedQty", 0))),
        base_doc_ref=ln.get("baseDocRef"),
        target_doc_refs=ln.get("targetDocRefs", []),
        notes=ln.get("notes"),
    )


def _doc_to_list_item(raw: Dict[str, Any]) -> QuoteListItem:
    """
    Convert a raw MongoDB document dict to a slim QuoteListItem.

    Args:
        raw: Partial document from a list projection query.

    Returns:
        QuoteListItem instance.
    """
    totals_raw = raw.get("totals", {})
    totals = QuoteTotals(
        net=Decimal(str(totals_raw.get("net", 0))),
        tax=Decimal(str(totals_raw.get("tax", 0))),
        gross=Decimal(str(totals_raw.get("gross", 0))),
    )
    return QuoteListItem(
        doc_entry=raw["docEntry"],
        doc_number=raw["docNumber"],
        organization_id=raw["organizationId"],
        customer_id=raw["customerId"],
        customer_name=raw["customerName"],
        doc_date=raw["docDate"],
        valid_until_date=raw["validUntilDate"],
        status=DocumentStatus(raw["status"]),
        currency=raw.get("currency", "AED"),
        totals=totals,
        bp_ref_no=raw.get("bpRefNo"),
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
    Append an audit entry to ``sales_quotes_audit``.

    Best-effort: logs a warning on failure but does not re-raise so the
    main operation is not rolled back.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the affected quote.
        action:    Short action label (e.g. "create", "update", "transition").
        user_id:   User who triggered the action.
        detail:    Optional extra metadata dict (e.g. old/new status).
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
        logger.warning("Audit write failed for quote %s action=%s: %s", doc_entry, action, exc)


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def create_quote(
    db: AsyncIOMotorDatabase,
    payload: QuoteCreate,
    user_id: str,
) -> QuoteResponse:
    """
    Create a new Sales Quote in DRAFT status.

    Generates a sequential document number via the T-100.1 ``next_doc_number``
    helper using prefix "QUOTE" → "SQ".  Computes all line and header totals.

    Args:
        db:       Motor database instance (shared ops MongoDB).
        payload:  Validated QuoteCreate payload from the API layer.
        user_id:  UUID string of the authenticated user creating the quote.

    Returns:
        QuoteResponse for the newly-created quote.

    Raises:
        ValueError: If doc_number generation fails (unknown doc_type — should
                    never happen with "QUOTE" registered in DOC_TYPE_PREFIXES).
    """
    doc_entry = str(uuid.uuid4())

    # Reason: "QUOTE" is the doc_type key in LEGAL_TRANSITIONS and DOC_TYPE_PREFIXES.
    # next_doc_number maps "QUOTE" → prefix "SQ" → "SQ-2026-0001".
    doc_number = await next_doc_number(
        db,
        doc_type=_DOC_TYPE,
        org_id=payload.organization_id,
        company_code=payload.company_code,
    )

    computed_lines = _compute_lines(list(payload.lines))
    totals = _compute_totals(computed_lines)
    now = _now()

    doc: Dict[str, Any] = {
        "docEntry": doc_entry,
        "docNumber": doc_number,
        "docType": _DOC_TYPE_CODE,
        "organizationId": payload.organization_id,
        "companyCode": payload.company_code,
        "customerId": payload.customer_id,
        "customerName": payload.customer_name,
        # Reason: Motor/PyMongo cannot encode datetime.date — convert to
        # timezone-aware datetime.datetime before the MongoDB write.
        "docDate": _to_dt(payload.doc_date),
        "validUntilDate": _to_dt(payload.valid_until_date),
        "status": DocumentStatus.DRAFT.value,
        "currency": payload.currency,
        "exchangeRate": float(payload.exchange_rate),
        "paymentTermsId": payload.payment_terms_id,
        "salesEmployeeId": payload.sales_employee_id,
        "ownerUserId": user_id,
        "bpRefNo": payload.bp_ref_no,
        "journalMemo": payload.journal_memo,
        "notes": payload.notes,
        "totals": totals,
        "baseDocRef": None,
        "targetDocRefs": [],
        "lines": computed_lines,
        "createdAt": now,
        "createdBy": user_id,
        "updatedAt": now,
        "updatedBy": user_id,
    }

    await db[_QUOTES_COL].insert_one(doc)
    await _write_audit(db, doc_entry=doc_entry, action="create", user_id=user_id)

    # Reason: remove MongoDB's _id before parsing into Pydantic to avoid
    # unexpected field errors (ObjectId is not JSON-serialisable and not in schema).
    doc.pop("_id", None)
    return _doc_to_response(doc)


async def get_quote(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    org_id: str,
) -> Optional[QuoteResponse]:
    """
    Retrieve a single Sales Quote by its doc_entry UUID.

    Scoped to org_id to prevent cross-organisation data leakage.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the quote.
        org_id:    Organisation UUID for scoping (must match the document).

    Returns:
        QuoteResponse if found, None otherwise.
    """
    raw = await db[_QUOTES_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return None
    raw.pop("_id", None)
    return _doc_to_response(raw)


async def list_quotes(
    db: AsyncIOMotorDatabase,
    org_id: str,
    *,
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = 1,
    size: int = 20,
) -> Dict[str, Any]:
    """
    Paginated list of Sales Quotes with optional filters.

    Results are ordered by docDate descending (most recent first).

    Args:
        db:          Motor database instance.
        org_id:      Organisation UUID — always required for isolation.
        status:      Filter by status string value (e.g. "draft", "open").
        customer_id: Filter by customer FK.
        date_from:   Inclusive lower bound on docDate.
        date_to:     Inclusive upper bound on docDate.
        page:        1-based page number.
        size:        Items per page (max 200 enforced in route layer).

    Returns:
        Dict with keys:
            items:      List[QuoteListItem]
            total:      int — total matching documents
            page:       int
            perPage:    int
            totalPages: int
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

    # Reason: project out the embedded lines array for list queries to keep
    # payloads lean and avoid sending MB of line data on paginated calls.
    projection = {"lines": 0}

    total = await db[_QUOTES_COL].count_documents(query)
    skip = (page - 1) * size

    cursor = (
        db[_QUOTES_COL]
        .find(query, projection)
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


async def update_quote(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    payload: QuoteUpdate,
    org_id: str,
    user_id: str,
) -> Optional[QuoteResponse]:
    """
    Partially update a DRAFT Sales Quote.

    Raises ValueError if the quote is not in DRAFT status (enforced before
    any write occurs).  When ``payload.lines`` is supplied, the existing line
    set is replaced wholesale and totals are recomputed.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the quote to update.
        payload:   Validated QuoteUpdate payload.
        org_id:    Organisation UUID for scoping.
        user_id:   Authenticated user performing the update.

    Returns:
        Updated QuoteResponse, or None if the quote was not found.

    Raises:
        ValueError: If the quote status is not DRAFT.
    """
    raw = await db[_QUOTES_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return None

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"Sales Quote '{doc_entry}' cannot be updated: "
            f"status is '{raw['status']}' (only DRAFT quotes may be edited)"
        )

    # Build the $set payload from non-None fields.
    updates: Dict[str, Any] = {"updatedAt": _now(), "updatedBy": user_id}

    field_map = {
        "customerId": payload.customer_id,
        "customerName": payload.customer_name,
        # Reason: Motor/PyMongo cannot encode datetime.date — convert before write.
        "docDate": _to_dt(payload.doc_date) if payload.doc_date is not None else None,
        "validUntilDate": _to_dt(payload.valid_until_date) if payload.valid_until_date is not None else None,
        "currency": payload.currency,
        "exchangeRate": float(payload.exchange_rate) if payload.exchange_rate is not None else None,
        "paymentTermsId": payload.payment_terms_id,
        "salesEmployeeId": payload.sales_employee_id,
        "bpRefNo": payload.bp_ref_no,
        "journalMemo": payload.journal_memo,
        "notes": payload.notes,
    }

    for db_key, value in field_map.items():
        if value is not None:
            updates[db_key] = value

    if payload.lines is not None:
        new_lines = _compute_lines(list(payload.lines))
        updates["lines"] = new_lines
        updates["totals"] = _compute_totals(new_lines)

    await db[_QUOTES_COL].update_one(
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

    updated_raw = await db[_QUOTES_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if updated_raw is None:
        return None
    updated_raw.pop("_id", None)
    return _doc_to_response(updated_raw)


async def transition_status(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    new_status: DocumentStatus,
    org_id: str,
    user_id: str,
    reason: Optional[str] = None,
) -> Optional[QuoteResponse]:
    """
    Transition a Sales Quote to a new status.

    Uses ``assert_legal_transition("QUOTE", ...)`` from T-100.1 as the sole
    state-machine gatekeeper.

    Args:
        db:         Motor database instance.
        doc_entry:  UUID of the quote.
        new_status: Target DocumentStatus.
        org_id:     Organisation UUID for scoping.
        user_id:    Authenticated user performing the transition.
        reason:     Optional reason (recorded in audit log).

    Returns:
        Updated QuoteResponse, or None if the quote was not found.

    Raises:
        ValueError: If the transition is not legal (propagated from
                    ``assert_legal_transition``).
    """
    raw = await db[_QUOTES_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return None

    current_status = DocumentStatus(raw["status"])

    # Reason: assert_legal_transition raises ValueError for illegal transitions;
    # the API route converts this to HTTP 422.
    assert_legal_transition(_DOC_TYPE, current_status, new_status)

    now = _now()
    await db[_QUOTES_COL].update_one(
        {"docEntry": doc_entry, "organizationId": org_id},
        {
            "$set": {
                "status": new_status.value,
                "updatedAt": now,
                "updatedBy": user_id,
            }
        },
    )

    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="transition",
        user_id=user_id,
        detail={
            "from": current_status.value,
            "to": new_status.value,
            "reason": reason,
        },
    )

    updated_raw = await db[_QUOTES_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if updated_raw is None:
        return None
    updated_raw.pop("_id", None)
    return _doc_to_response(updated_raw)


async def delete_quote(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    org_id: str,
    user_id: str,
) -> bool:
    """
    Hard-delete a DRAFT Sales Quote.

    Hard delete is acceptable here because:
    1. The Quote has no GL impact (no JE, no outbox event).
    2. No downstream document (SO) has been created from a DRAFT quote.
    3. doc_number gaps from deleted DRAFTs are acceptable in audit policy.

    Only DRAFT quotes may be deleted.  A quote in any other status must be
    CANCELLED via the transition endpoint before it can be removed (which
    provides an audit trail of the cancellation).

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the quote.
        org_id:    Organisation UUID for scoping.
        user_id:   Authenticated user performing the deletion.

    Returns:
        True if the quote was deleted, False if not found.

    Raises:
        ValueError: If the quote status is not DRAFT.
    """
    raw = await db[_QUOTES_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return False

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"Sales Quote '{doc_entry}' cannot be deleted: "
            f"status is '{raw['status']}' (only DRAFT quotes may be deleted)"
        )

    # Reason: write audit BEFORE delete so the audit trail survives even
    # though the source document is gone.
    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="delete",
        user_id=user_id,
        detail={"docNumber": raw.get("docNumber")},
    )

    await db[_QUOTES_COL].delete_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    return True
