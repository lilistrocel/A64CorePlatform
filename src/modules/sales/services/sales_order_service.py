"""
Sales Module — Sales Order Service Layer

Business logic for the Sales Order (SO) document type.

Responsibilities
----------------
- Create a new SO from scratch (DRAFT, generates SO-YYYY-NNNN doc_number).
- Create an SO from an existing Sales Quote (atomic copy + consumed_qty update).
- Retrieve a single SO by doc_entry UUID.
- Paginated list with filters (status, customer_id, date range, has_open_lines).
- Partial update (DRAFT only); replaces line set wholesale when lines supplied.
- Dedicated status transition with legal-transition guard.
  - DRAFT → OPEN: credit-limit check against finance microservice.
  - → OPEN: set committed_qty = ordered_qty on all lines.
  - → CANCELLED: clear committed_qty; back-decrement base Quote consumed_qty.
  - → CLOSED: guard that all lines have open_qty == 0 first.
- Hard-delete a DRAFT SO (with Quote consumed_qty restoration if applicable).

Quote → SO conversion (atomic sequence)
-----------------------------------------
1. Load Quote, assert status is DRAFT or OPEN, assert all lines have open_qty > 0.
2. Copy Quote header fields + lines (with base_doc_ref pointing to Quote line).
3. Compute totals.
4. Insert new SO in DRAFT status; generate doc_number "SO-YYYY-NNNN".
5. For each Quote line: increment ``consumedQty`` by the SO line's ordered_qty
   directly on the embedded document (not via increment_consumed_qty, because
   the Quote stores its lines embedded — increment_consumed_qty targets a
   flat line-per-document collection; see note below).
6. Write back target_doc_ref (SO header ref) onto the Quote header.
7. If every Quote line is now fully consumed: auto-close the Quote.
8. Audit-log all of the above.

Note on open_quantity helpers
------------------------------
``increment_consumed_qty`` in src/core/documents/open_quantity.py targets a
flat lines collection (one document per line) using a ``lineId`` key.  The
Quote stores its lines embedded in the header document.  For Quote line
consumed_qty updates we therefore use MongoDB's embedded-document ``$inc``
operator directly (safer than a flat-collection helper that would not find
the embedded line).  This mirrors how the purchasing document service handles
embedded PO lines.

Credit-limit check
-------------------
Called on DRAFT → OPEN.  Makes an async HTTP GET to the finance microservice
at ``GET /api/v1/finance/customer-finance-ext/{customer_id}``.  If the
microservice is unreachable, the check is skipped and result is 'approved'
(fail-open policy — the SO is already a committed document, not a payment).
If creditLimit is null or the customer has no finance extension row, result
is 'approved' (no limit configured).

Collections used
----------------
  sales_orders_v2         — one document per SO header + embedded lines
  sales_orders_v2_audit   — append-only audit trail
  sales_quotes            — source Quote collection (for Quote → SO conversion)
  document_counters       — shared counter for doc_number generation (T-100.1)
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from math import ceil
from typing import Any, Dict, List, Optional

import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase

from src.core.documents.doc_number import next_doc_number
from src.core.documents.document_links import DocumentLinkRef
from src.core.documents.document_status import DocumentStatus, assert_legal_transition

from ._finance_ext_client import get_item_finance_ext as _get_item_finance_ext
from .doc_chain_reconciler import TOLERANCE

from ..models.sales_orders import (
    CreditCheckSnapshot,
    SalesOrderCreate,
    SalesOrderFromQuoteRequest,
    SalesOrderLineCreate,
    SalesOrderLineResponse,
    SalesOrderListItem,
    SalesOrderResponse,
    SalesOrderStatusTransitionRequest,
    SalesOrderTotals,
    SalesOrderUpdate,
)

logger = logging.getLogger(__name__)

_SO_COL = "sales_orders_v2"
_AUDIT_COL = "sales_orders_v2_audit"
_QUOTES_COL = "sales_quotes"
_TWOPLACES = Decimal("0.01")
_OPEN_QTY_TOLERANCE = Decimal("0.0001")
_DOC_TYPE = "SO"

# Roles allowed to override a blocked credit check.
_CREDIT_OVERRIDE_ROLES = frozenset({"super_admin", "finance_admin"})

# Finance service base URL (internal — routed through Nginx in production).
# Falls back to the Docker Compose service name on the internal network.
_FINANCE_BASE_URL = os.getenv("FINANCE_SERVICE_URL", "http://finance:8001")


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


def _compute_line(line: SalesOrderLineCreate, *, line_number: int) -> Dict[str, Any]:
    """
    Compute monetary totals for a single SO line.

    Applies:
        line_net   = quantity × unit_price × (1 − discount_percent / 100)
        line_tax   = line_net × tax_percent / 100
        line_gross = line_net + line_tax

    All results are quantised to 2 decimal places (ROUND_HALF_UP).

    Args:
        line:        SalesOrderLineCreate input from the caller.
        line_number: 1-indexed position (caller sets this).

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
        "lineNumber": line_number,
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
        # Quantity tracking
        "orderedQty": float(line.quantity),
        "consumedQty": 0.0,         # upstream Quote consumed qty — set in from-quote path
        "deliveredQty": 0.0,
        "invoicedQty": 0.0,
        "cancelledQty": 0.0,
        "committedQty": 0.0,         # set to orderedQty on DRAFT → OPEN transition
        # Links
        "baseDocRef": None,
        "targetDocRefs": [],
        "notes": line.notes,
    }


def _compute_lines(lines: List[SalesOrderLineCreate]) -> List[Dict[str, Any]]:
    """
    Build the full lines array with correct 1-indexed line_number values.

    Args:
        lines: Ordered list of SalesOrderLineCreate inputs.

    Returns:
        List of computed line dicts with lineNumber set.
    """
    return [_compute_line(line, line_number=i) for i, line in enumerate(lines, start=1)]


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


def _normalise_link_ref(ref: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Normalise a stored MongoDB link-ref dict (camelCase) to snake_case for
    Pydantic's DocumentLinkRef validation.

    MongoDB stores refs as ``{docType, docId, docNumber, lineId}``; Pydantic
    expects ``{doc_type, doc_id, doc_number, line_id}``.  Support both key
    styles so documents stored by older code also parse correctly.

    Args:
        ref: Raw dict from MongoDB, or None.

    Returns:
        Normalised snake_case dict, or None.
    """
    if ref is None:
        return None
    return {
        "doc_type": ref.get("doc_type") or ref.get("docType", ""),
        "doc_id": ref.get("doc_id") or ref.get("docId", ""),
        "doc_number": ref.get("doc_number") or ref.get("docNumber", ""),
        "line_id": ref.get("line_id") or ref.get("lineId"),
    }


def _normalise_link_refs(refs: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """
    Normalise a list of MongoDB link-ref dicts.

    Args:
        refs: List of raw dicts or None.

    Returns:
        List of normalised snake_case dicts (empty list if input is None).
    """
    if not refs:
        return []
    return [_normalise_link_ref(r) for r in refs if r is not None]


def _raw_line_to_response(ln: Dict[str, Any]) -> SalesOrderLineResponse:
    """
    Convert a raw embedded SO line dict to a SalesOrderLineResponse.

    Args:
        ln: Raw embedded line dict from the SO document.

    Returns:
        SalesOrderLineResponse instance.
    """
    return SalesOrderLineResponse(
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
        delivered_qty=Decimal(str(ln.get("deliveredQty", 0))),
        invoiced_qty=Decimal(str(ln.get("invoicedQty", 0))),
        cancelled_qty=Decimal(str(ln.get("cancelledQty", 0))),
        committed_qty=Decimal(str(ln.get("committedQty", 0))),
        # Reason: normalise camelCase stored refs to snake_case for Pydantic validation.
        base_doc_ref=_normalise_link_ref(ln.get("baseDocRef")),
        target_doc_refs=_normalise_link_refs(ln.get("targetDocRefs", [])),
        notes=ln.get("notes"),
    )


def _raw_credit_check(raw: Optional[Dict[str, Any]]) -> Optional[CreditCheckSnapshot]:
    """
    Convert a raw embedded credit_check dict to CreditCheckSnapshot.

    Args:
        raw: Raw dict from the SO document, or None.

    Returns:
        CreditCheckSnapshot or None.
    """
    if raw is None:
        return None
    return CreditCheckSnapshot(
        checked_at=raw["checkedAt"],
        customer_credit_limit=(
            Decimal(str(raw["customerCreditLimit"]))
            if raw.get("customerCreditLimit") is not None
            else None
        ),
        outstanding_ar=Decimal(str(raw.get("outstandingAr", 0))),
        this_order_total=Decimal(str(raw["thisOrderTotal"])),
        result=raw["result"],
        override_by_user_id=raw.get("overrideByUserId"),
        override_reason=raw.get("overrideReason"),
    )


def _doc_to_response(raw: Dict[str, Any]) -> SalesOrderResponse:
    """
    Convert a raw MongoDB document dict to a SalesOrderResponse.

    Args:
        raw: Document from the ``sales_orders_v2`` collection.

    Returns:
        SalesOrderResponse instance.
    """
    totals_raw = raw.get("totals", {})
    totals = SalesOrderTotals(
        net=Decimal(str(totals_raw.get("net", 0))),
        tax=Decimal(str(totals_raw.get("tax", 0))),
        gross=Decimal(str(totals_raw.get("gross", 0))),
    )

    lines = [_raw_line_to_response(ln) for ln in raw.get("lines", [])]

    return SalesOrderResponse(
        doc_entry=raw["docEntry"],
        doc_number=raw["docNumber"],
        doc_type=raw.get("docType", _DOC_TYPE),
        organization_id=raw["organizationId"],
        company_code=raw["companyCode"],
        customer_id=raw["customerId"],
        customer_name=raw["customerName"],
        doc_date=raw["docDate"],
        delivery_date=raw.get("deliveryDate"),
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
        credit_check=_raw_credit_check(raw.get("creditCheck")),
        # Reason: normalise stored camelCase refs to snake_case for Pydantic.
        base_doc_ref=_normalise_link_ref(raw.get("baseDocRef")),
        target_doc_refs=_normalise_link_refs(raw.get("targetDocRefs", [])),
        lines=lines,
        created_at=raw["createdAt"],
        created_by=raw["createdBy"],
        updated_at=raw["updatedAt"],
        updated_by=raw["updatedBy"],
    )


def _doc_to_list_item(
    raw: Dict[str, Any],
    service_open_invoice_qty: Decimal = Decimal("0"),
) -> SalesOrderListItem:
    """
    Convert a raw MongoDB document dict to a slim SalesOrderListItem.

    Args:
        raw:                       Full document from a list query (lines present).
        service_open_invoice_qty:  Pre-computed open-invoice qty across service lines
                                   (T-201.10).  Caller must compute this first via
                                   _compute_service_open_invoice_qty before calling
                                   this helper.

    Returns:
        SalesOrderListItem instance.
    """
    totals_raw = raw.get("totals", {})
    totals = SalesOrderTotals(
        net=Decimal(str(totals_raw.get("net", 0))),
        tax=Decimal(str(totals_raw.get("tax", 0))),
        gross=Decimal(str(totals_raw.get("gross", 0))),
    )
    return SalesOrderListItem(
        doc_entry=raw["docEntry"],
        doc_number=raw["docNumber"],
        organization_id=raw["organizationId"],
        customer_id=raw["customerId"],
        customer_name=raw["customerName"],
        doc_date=raw["docDate"],
        delivery_date=raw.get("deliveryDate"),
        status=DocumentStatus(raw["status"]),
        currency=raw.get("currency", "AED"),
        totals=totals,
        bp_ref_no=raw.get("bpRefNo"),
        service_open_invoice_qty=service_open_invoice_qty,
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
    Append an audit entry to ``sales_orders_v2_audit``.

    Best-effort: logs a warning on failure but does not re-raise so the
    main operation is not rolled back.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the affected SO.
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
            "Audit write failed for SO %s action=%s: %s", doc_entry, action, exc
        )


def _line_open_qty(ln: Dict[str, Any]) -> Decimal:
    """
    Compute open_qty for a single embedded SO line.

    open_qty = ordered_qty - delivered_qty - cancelled_qty

    Args:
        ln: Raw embedded SO line dict.

    Returns:
        Remaining open quantity as Decimal.
    """
    ordered = Decimal(str(ln.get("orderedQty", ln.get("quantity", 0))))
    delivered = Decimal(str(ln.get("deliveredQty", 0)))
    cancelled = Decimal(str(ln.get("cancelledQty", 0)))
    return ordered - delivered - cancelled


# ---------------------------------------------------------------------------
# Credit-limit check
# ---------------------------------------------------------------------------


async def _check_credit_limit(
    org_id: str,
    customer_id: str,
    this_order_total: Decimal,
) -> Dict[str, Any]:
    """
    Call the finance microservice to fetch the customer's credit limit.

    Returns a raw dict ready to store as ``creditCheck`` on the SO header.

    The result key is:
    - 'approved'  if (this_order_total + outstanding_ar) <= creditLimit, or
                  if no creditLimit is configured for this customer.
    - 'blocked'   if the total exceeds the credit limit.

    outstanding_ar is PLACEHOLDER ZERO — real AR ledger integration is
    deferred to T-100.9 (AR Invoice handler).  A T-100.7.1 follow-up task
    tracks this gap.

    HTTP failures (timeout, 404, service down) are caught and treated as
    'approved' (fail-open policy for a non-GL document).

    Args:
        org_id:           Organisation UUID for the query scope.
        customer_id:      Customer FK.
        this_order_total: SO gross total at transition time.

    Returns:
        Dict suitable for storage as creditCheck subdocument.
    """
    credit_limit: Optional[Decimal] = None
    outstanding_ar = Decimal("0")  # Placeholder — see docstring

    try:
        url = (
            f"{_FINANCE_BASE_URL}/api/v1/finance/customer-finance-ext/{customer_id}"
            f"?organization_id={org_id}"
        )
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url)
        if resp.status_code == 200:
            body = resp.json()
            # Reason: finance service wraps data under 'data' key per its SuccessResponse.
            data = body.get("data", body)
            raw_limit = data.get("creditLimit")
            if raw_limit is not None:
                credit_limit = Decimal(str(raw_limit))
        # 404 means no finance extension row → treat as unconfigured (approved)
    except Exception as exc:  # noqa: BLE001
        # Reason: fail-open — SO has no GL impact; unreachable finance service
        # must not block order confirmation.
        logger.warning(
            "Credit-limit check HTTP call failed for customer %s: %s — treating as approved",
            customer_id,
            exc,
        )

    if credit_limit is None:
        # Reason: no credit limit configured for this customer.
        result = "approved"
    elif (this_order_total + outstanding_ar) <= credit_limit:
        result = "approved"
    else:
        result = "blocked"

    return {
        "checkedAt": _now(),
        "customerCreditLimit": float(credit_limit) if credit_limit is not None else None,
        "outstandingAr": float(outstanding_ar),
        "thisOrderTotal": float(this_order_total),
        "result": result,
        "overrideByUserId": None,
        "overrideReason": None,
    }


# ---------------------------------------------------------------------------
# Service-open-invoice-qty aggregation (T-201.10)
# ---------------------------------------------------------------------------


async def _compute_service_open_invoice_qty(
    so_raw: Dict[str, Any],
    org_id: str,
    auth_token: Optional[str],
) -> Decimal:
    """
    Sum the open-invoice qty across SO *service* lines (isStock=False).

    For each SO line, fetches the item's isStock flag via the finance HTTP
    client.  Stock lines (isStock=True or absent) are skipped — they invoice
    via the DN chain, not from-SO.  Service lines (isStock=False) contribute
    max(0, quantity - invoicedQty - creditedQty - cancelledQty).

    Best-effort on the HTTP lookup: if the finance service is unreachable for
    a specific item, that line is conservatively treated as stock (excluded
    from the service aggregate).  This matches the existing _get_item_finance_ext
    fail-hard ValueError semantics — we catch and log here.

    Performance note: this makes one HTTP call per SO line per list-page
    request.  For 25 SOs × 3 lines = 75 HTTP calls per page.  Acceptable for
    the early use case (small tenants, default page size = 20–25).  A future
    optimisation could batch unique item IDs across all SOs on the page, but
    that is premature today.

    Args:
        so_raw:     Raw SO document from MongoDB (must include embedded lines).
        org_id:     Organisation UUID for scoping the HTTP call.
        auth_token: Bearer token forwarded to the finance microservice.
                    When None, all lines are treated as stock (skip aggregation).

    Returns:
        Total open-invoice qty across service lines as Decimal.
    """
    if auth_token is None:
        # Reason: without a token the finance HTTP call cannot authenticate;
        # treat conservatively as 0 rather than making unauthenticated calls.
        return Decimal("0")

    total = Decimal("0")
    for line in so_raw.get("lines", []):
        item_id = line.get("itemId")
        if not item_id:
            continue
        try:
            ext = await _get_item_finance_ext(item_id, org_id, auth_token)
        except ValueError:
            # Finance unreachable or item ext missing → treat as stock (skip).
            # Reason: fail-safe; a missing finance ext must not surface an error
            # in the list endpoint that callers depend on for the daily workflow.
            logger.warning(
                "[SalesOrderService] Could not fetch isStock for item '%s' "
                "during service_open_invoice_qty computation — treating as stock (skip).",
                item_id,
            )
            continue
        if ext.get("isStock", True):
            # Stock line — excluded from service aggregate.
            continue
        # Service line — compute its open-invoice qty.
        qty = Decimal(str(line.get("quantity", 0)))
        invoiced = Decimal(str(line.get("invoicedQty", 0)))
        credited = Decimal(str(line.get("creditedQty", 0)))
        cancelled = Decimal(str(line.get("cancelledQty", 0)))
        open_qty = qty - invoiced - credited - cancelled
        if open_qty > Decimal("0"):
            total += open_qty
    return total


# ---------------------------------------------------------------------------
# Quote-line open_qty helper (embedded document style)
# ---------------------------------------------------------------------------


def _quote_line_open_qty(ql: Dict[str, Any]) -> Decimal:
    """
    Compute open_qty for a Quote line from its embedded consumedQty.

    For Quote lines: open_qty = orderedQty - consumedQty.

    Args:
        ql: Raw embedded Quote line dict.

    Returns:
        Remaining open quantity as Decimal.
    """
    ordered = Decimal(str(ql.get("orderedQty", ql.get("quantity", 0))))
    consumed = Decimal(str(ql.get("consumedQty", 0)))
    return ordered - consumed


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def create_sales_order(
    db: AsyncIOMotorDatabase,
    payload: SalesOrderCreate,
    user_id: str,
) -> SalesOrderResponse:
    """
    Create a new Sales Order from scratch in DRAFT status.

    Generates a sequential document number via the T-100.1 ``next_doc_number``
    helper using doc_type "SO" → prefix "SO".

    Args:
        db:       Motor database instance (shared ops MongoDB).
        payload:  Validated SalesOrderCreate payload from the API layer.
        user_id:  UUID string of the authenticated user.

    Returns:
        SalesOrderResponse for the newly-created SO.
    """
    doc_entry = str(uuid.uuid4())

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
        "docType": _DOC_TYPE,
        "organizationId": payload.organization_id,
        "companyCode": payload.company_code,
        "customerId": payload.customer_id,
        "customerName": payload.customer_name,
        # Reason: Motor/PyMongo cannot encode datetime.date — convert to
        # timezone-aware datetime.datetime before the MongoDB write.
        "docDate": _to_dt(payload.doc_date),
        "deliveryDate": _to_dt(payload.delivery_date) if payload.delivery_date is not None else None,
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
        "creditCheck": None,
        "baseDocRef": None,
        "targetDocRefs": [],
        "lines": computed_lines,
        "createdAt": now,
        "createdBy": user_id,
        "updatedAt": now,
        "updatedBy": user_id,
    }

    await db[_SO_COL].insert_one(doc)
    await _write_audit(db, doc_entry=doc_entry, action="create", user_id=user_id)

    # Reason: remove MongoDB's _id before parsing into Pydantic.
    doc.pop("_id", None)
    return _doc_to_response(doc)


async def create_sales_order_from_quote(
    db: AsyncIOMotorDatabase,
    quote_doc_entry: str,
    payload: SalesOrderFromQuoteRequest,
    org_id: str,
    user_id: str,
) -> SalesOrderResponse:
    """
    Create a Sales Order by copying from an existing Sales Quote.

    Atomic sequence (no Motor transaction — best-effort multi-step):
    1. Load Quote; assert status in {DRAFT, OPEN}.
    2. Assert all Quote lines have open_qty > 0 (at least partially open).
    3. Copy Quote header fields and lines into a new SO in DRAFT status.
    4. For each Quote line: increment consumedQty by the copied quantity.
    5. Write back a target_doc_ref on the Quote header pointing to the new SO.
    6. If every Quote line is now fully consumed: auto-close the Quote.
    7. Audit-log the new SO and the Quote update.

    Partial-line conversion note:
    The entire open_qty of each Quote line is consumed by the SO.  If the
    Quote line has qty=100 and consumed_qty=30, the SO line will have
    ordered_qty=70 (= the remaining open qty) and the Quote line's
    consumed_qty becomes 100 (fully consumed).  This is the "consume all
    remaining" pattern.  If a caller wants to draw only 30 of 70 remaining,
    they should create the SO from scratch with a custom qty — the
    from-quote route always consumes the full remaining open quantity.

    Args:
        db:               Motor database instance.
        quote_doc_entry:  UUID of the source Quote.
        payload:          SalesOrderFromQuoteRequest with optional overrides.
        org_id:           Organisation UUID for scoping.
        user_id:          Authenticated user performing the creation.

    Returns:
        SalesOrderResponse for the newly-created SO.

    Raises:
        ValueError: If the Quote is not found, not in an open state, or all
                    Quote lines are already fully consumed.
    """
    # Step 1: Load and validate the Quote.
    quote_raw = await db[_QUOTES_COL].find_one(
        {"docEntry": quote_doc_entry, "organizationId": org_id}
    )
    if quote_raw is None:
        raise ValueError(
            f"Sales Quote '{quote_doc_entry}' not found in organisation '{org_id}'"
        )

    quote_status = DocumentStatus(quote_raw["status"])
    if quote_status not in {DocumentStatus.DRAFT, DocumentStatus.OPEN}:
        raise ValueError(
            f"Cannot create SO from Quote '{quote_doc_entry}': "
            f"Quote status is '{quote_status.value}' (must be DRAFT or OPEN)"
        )

    # Step 2: Assert all Quote lines have open_qty > 0.
    quote_lines = quote_raw.get("lines", [])
    if not quote_lines:
        raise ValueError(
            f"Quote '{quote_doc_entry}' has no lines — cannot create SO"
        )

    closed_lines = [
        ql for ql in quote_lines
        if _quote_line_open_qty(ql) <= _OPEN_QTY_TOLERANCE
    ]
    if closed_lines:
        raise ValueError(
            f"Cannot create SO from Quote '{quote_doc_entry}': "
            f"{len(closed_lines)} line(s) have open_qty == 0 (already fully consumed). "
            "Create the SO from scratch for lines with remaining quantity."
        )

    # Step 3: Build SO lines from Quote lines (consuming all remaining open_qty).
    so_lines: List[Dict[str, Any]] = []
    for i, ql in enumerate(quote_lines, start=1):
        open_qty = _quote_line_open_qty(ql)

        so_line: Dict[str, Any] = {
            "lineId": str(uuid.uuid4()),
            "lineNumber": i,
            "itemId": ql["itemId"],
            "itemCode": ql.get("itemCode", ""),
            "itemName": ql.get("itemName", ""),
            "description": ql.get("description", ""),
            "quantity": float(open_qty),
            "uom": ql.get("uom", ""),
            "unitPrice": ql.get("unitPrice", 0.0),
            "discountPercent": ql.get("discountPercent", 0.0),
            # Recompute line totals for the SO line quantity (= open_qty).
            "lineNet": 0.0,   # will be overwritten below
            "taxCodeId": ql.get("taxCodeId"),
            "taxPercent": ql.get("taxPercent", 0.0),
            "lineTax": 0.0,
            "lineGross": 0.0,
            "warehouseId": ql.get("warehouseId"),
            "costCenterId": ql.get("costCenterId"),
            # Quantity tracking
            "orderedQty": float(open_qty),
            "consumedQty": float(open_qty),   # records how much was taken from the Quote
            "deliveredQty": 0.0,
            "invoicedQty": 0.0,
            "cancelledQty": 0.0,
            "committedQty": 0.0,
            # Links
            "baseDocRef": {
                "docType": "QUOTE",
                "docId": quote_doc_entry,
                "docNumber": quote_raw.get("docNumber", ""),
                "lineId": ql["lineId"],
            },
            "targetDocRefs": [],
            "notes": ql.get("notes"),
        }

        # Recompute monetary values for the SO line quantity.
        qty = Decimal(str(open_qty))
        unit_price = Decimal(str(ql.get("unitPrice", 0)))
        discount = Decimal(str(ql.get("discountPercent", 0)))
        tax_pct = Decimal(str(ql.get("taxPercent", 0)))

        net_raw = qty * unit_price * (Decimal("1") - discount / Decimal("100"))
        line_net = net_raw.quantize(_TWOPLACES, rounding=ROUND_HALF_UP)
        line_tax = (line_net * tax_pct / Decimal("100")).quantize(
            _TWOPLACES, rounding=ROUND_HALF_UP
        )
        line_gross = line_net + line_tax

        so_line["lineNet"] = float(line_net)
        so_line["lineTax"] = float(line_tax)
        so_line["lineGross"] = float(line_gross)

        so_lines.append(so_line)

    totals = _compute_totals(so_lines)
    now = _now()
    doc_entry = str(uuid.uuid4())

    doc_number = await next_doc_number(
        db,
        doc_type=_DOC_TYPE,
        org_id=org_id,
        company_code=quote_raw.get("companyCode", org_id),
    )

    so_doc: Dict[str, Any] = {
        "docEntry": doc_entry,
        "docNumber": doc_number,
        "docType": _DOC_TYPE,
        "organizationId": org_id,
        "companyCode": quote_raw.get("companyCode", org_id),
        "customerId": quote_raw["customerId"],
        "customerName": quote_raw["customerName"],
        # Reason: Motor/PyMongo cannot encode datetime.date — convert to
        # timezone-aware datetime.datetime before the MongoDB write.
        "docDate": _to_dt(now.date()),
        "deliveryDate": _to_dt(payload.delivery_date) if payload.delivery_date is not None else None,
        "status": DocumentStatus.DRAFT.value,
        "currency": quote_raw.get("currency", "AED"),
        "exchangeRate": quote_raw.get("exchangeRate", 1.0),
        "paymentTermsId": quote_raw.get("paymentTermsId"),
        "salesEmployeeId": quote_raw.get("salesEmployeeId"),
        "ownerUserId": user_id,
        "bpRefNo": quote_raw.get("bpRefNo"),
        "journalMemo": quote_raw.get("journalMemo"),
        "notes": payload.notes or quote_raw.get("notes"),
        "totals": totals,
        "creditCheck": None,
        "baseDocRef": {
            "docType": "QUOTE",
            "docId": quote_doc_entry,
            "docNumber": quote_raw.get("docNumber", ""),
            "lineId": None,   # header-level reference
        },
        "targetDocRefs": [],
        "lines": so_lines,
        "createdAt": now,
        "createdBy": user_id,
        "updatedAt": now,
        "updatedBy": user_id,
    }

    # Step 4: Insert the SO.
    await db[_SO_COL].insert_one(so_doc)

    # Step 5: Increment consumedQty on each Quote line.
    # Reason: Quote stores lines as an embedded array; we use $inc with
    # positional operator to update each line atomically.
    for ql, so_line in zip(quote_lines, so_lines):
        consumed_delta = float(so_line["consumedQty"])
        await db[_QUOTES_COL].update_one(
            {
                "docEntry": quote_doc_entry,
                "organizationId": org_id,
                "lines.lineId": ql["lineId"],
            },
            {
                "$inc": {"lines.$.consumedQty": consumed_delta},
                "$set": {"updatedAt": now, "updatedBy": user_id},
            },
        )

    # Step 6: Write target_doc_ref on the Quote header.
    so_ref = {
        "docType": "SO",
        "docId": doc_entry,
        "docNumber": doc_number,
        "lineId": None,
    }
    await db[_QUOTES_COL].update_one(
        {"docEntry": quote_doc_entry, "organizationId": org_id},
        {
            "$push": {"targetDocRefs": so_ref},
            "$set": {"updatedAt": now, "updatedBy": user_id},
        },
    )

    # Step 7: If all Quote lines are now fully consumed, auto-close the Quote.
    refreshed_quote = await db[_QUOTES_COL].find_one(
        {"docEntry": quote_doc_entry, "organizationId": org_id}
    )
    if refreshed_quote:
        all_consumed = all(
            _quote_line_open_qty(ql) <= _OPEN_QTY_TOLERANCE
            for ql in refreshed_quote.get("lines", [])
        )
        if all_consumed and DocumentStatus(refreshed_quote["status"]) in {
            DocumentStatus.DRAFT,
            DocumentStatus.OPEN,
        }:
            await db[_QUOTES_COL].update_one(
                {"docEntry": quote_doc_entry, "organizationId": org_id},
                {
                    "$set": {
                        "status": DocumentStatus.CLOSED.value,
                        "updatedAt": now,
                        "updatedBy": user_id,
                    }
                },
            )
            await _write_audit(
                db,
                doc_entry=quote_doc_entry,
                action="auto_close",
                user_id=user_id,
                detail={
                    "reason": "All Quote lines fully consumed by SO creation",
                    "soDocEntry": doc_entry,
                    "soDocNumber": doc_number,
                },
            )

    # Step 8: Audit-log the new SO.
    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="create_from_quote",
        user_id=user_id,
        detail={
            "quoteDocEntry": quote_doc_entry,
            "quoteDocNumber": quote_raw.get("docNumber"),
        },
    )

    so_doc.pop("_id", None)
    return _doc_to_response(so_doc)


async def get_sales_order(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    org_id: str,
) -> Optional[SalesOrderResponse]:
    """
    Retrieve a single Sales Order by its doc_entry UUID.

    Scoped to org_id to prevent cross-organisation data leakage.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the SO.
        org_id:    Organisation UUID for scoping.

    Returns:
        SalesOrderResponse if found, None otherwise.
    """
    raw = await db[_SO_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return None
    raw.pop("_id", None)
    return _doc_to_response(raw)


async def list_sales_orders(
    db: AsyncIOMotorDatabase,
    org_id: str,
    *,
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    has_open_lines: Optional[bool] = None,
    has_service_open_lines: Optional[bool] = None,
    page: int = 1,
    size: int = 20,
    auth_token: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Paginated list of Sales Orders with optional filters.

    Results are ordered by docDate descending (most recent first).

    T-201.10 — service_open_invoice_qty aggregate:
    ``lines`` is kept in the MongoDB fetch so that per-SO service-line aggregation
    can run.  Lines are NOT passed through to the API response shape (SalesOrderListItem
    omits them, keeping list payloads lean).

    T-201.10 — has_service_open_lines filter:
    When active this filter CANNOT be pushed down to a MongoDB $match because the
    isStock classification requires an HTTP call to the finance microservice per item.
    The filter is therefore applied POST-aggregation (after all per-SO HTTP calls).

    Trade-off: when has_service_open_lines=True is active, ALL documents matching
    the base Mongo query are fetched and aggregated before pagination is applied.
    This means the returned page may contain fewer items than ``size``.  For the
    current use case (small tenants, ≤200 items total) this is acceptable.  A
    future optimisation would denormalise isStock onto SO lines at creation time so
    the filter can be a Mongo $match, but that is a separate ticket.

    Args:
        db:                      Motor database instance.
        org_id:                  Organisation UUID — always required for isolation.
        status:                  Filter by status string value (e.g. "draft", "open").
        customer_id:             Filter by customer FK.
        date_from:               Inclusive lower bound on docDate.
        date_to:                 Inclusive upper bound on docDate.
        has_open_lines:          When True, return only SOs with at least one open line.
                                 (Legacy param — placeholder; not yet fully implemented.)
        has_service_open_lines:  When True, return only SOs whose service_open_invoice_qty
                                 is > TOLERANCE.  Applied post-aggregation (see trade-off note).
        page:                    1-based page number.
        size:                    Items per page (max 200 enforced in route layer).
        auth_token:              Bearer token forwarded to the finance microservice for
                                 isStock lookups.  When None, service_open_invoice_qty
                                 defaults to 0 for all SOs and the filter cannot match.

    Returns:
        Dict with keys: items, total, page, perPage, totalPages.
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

    # Reason: keep lines in the projection so _compute_service_open_invoice_qty can run
    # per document (T-201.10).  Lines are stripped from the API response shape by
    # SalesOrderListItem — they never reach the wire.  This differs from the original
    # {"lines": 0} projection used before T-201.10.
    # When has_service_open_lines is active we must fetch ALL matching docs before
    # slicing, so pagination is handled manually after filtering.
    if has_service_open_lines:
        # Fetch all matching documents (no skip/limit) so the post-filter can run
        # over the full result set before re-slicing to the requested page.
        total_unfiltered = await db[_SO_COL].count_documents(query)
        cursor_all = (
            db[_SO_COL]
            .find(query)
            .sort("docDate", -1)
        )
        all_raw = await cursor_all.to_list(length=total_unfiltered or 1)

        # Compute aggregate and filter post-Mongo.
        filtered_items: List[SalesOrderListItem] = []
        for doc in all_raw:
            svc_qty = await _compute_service_open_invoice_qty(doc, org_id, auth_token)
            if svc_qty > TOLERANCE:
                filtered_items.append(_doc_to_list_item(doc, service_open_invoice_qty=svc_qty))

        total = len(filtered_items)
        skip = (page - 1) * size
        items = filtered_items[skip: skip + size]
        return {
            "items": items,
            "total": total,
            "page": page,
            "perPage": size,
            "totalPages": ceil(total / size) if total > 0 else 1,
        }

    # Normal path — paginate first, then compute aggregates on the page slice.
    total = await db[_SO_COL].count_documents(query)
    skip = (page - 1) * size

    cursor = (
        db[_SO_COL]
        .find(query)
        .sort("docDate", -1)
        .skip(skip)
        .limit(size)
    )
    raw_docs = await cursor.to_list(length=size)

    items_list: List[SalesOrderListItem] = []
    for doc in raw_docs:
        svc_qty = await _compute_service_open_invoice_qty(doc, org_id, auth_token)
        items_list.append(_doc_to_list_item(doc, service_open_invoice_qty=svc_qty))

    return {
        "items": items_list,
        "total": total,
        "page": page,
        "perPage": size,
        "totalPages": ceil(total / size) if total > 0 else 1,
    }


async def update_sales_order(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    payload: SalesOrderUpdate,
    org_id: str,
    user_id: str,
) -> Optional[SalesOrderResponse]:
    """
    Partially update a DRAFT Sales Order.

    Raises ValueError if the SO is not in DRAFT status.  When
    ``payload.lines`` is supplied, the existing line set is replaced wholesale
    and totals are recomputed.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the SO.
        payload:   Validated SalesOrderUpdate payload.
        org_id:    Organisation UUID for scoping.
        user_id:   Authenticated user performing the update.

    Returns:
        Updated SalesOrderResponse, or None if the SO was not found.

    Raises:
        ValueError: If the SO status is not DRAFT.
    """
    raw = await db[_SO_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return None

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"Sales Order '{doc_entry}' cannot be updated: "
            f"status is '{raw['status']}' (only DRAFT SOs may be edited)"
        )

    updates: Dict[str, Any] = {"updatedAt": _now(), "updatedBy": user_id}

    field_map = {
        "customerId": payload.customer_id,
        "customerName": payload.customer_name,
        # Reason: Motor/PyMongo cannot encode datetime.date — convert before write.
        "docDate": _to_dt(payload.doc_date) if payload.doc_date is not None else None,
        "deliveryDate": _to_dt(payload.delivery_date) if payload.delivery_date is not None else None,
        "currency": payload.currency,
        "exchangeRate": (
            float(payload.exchange_rate) if payload.exchange_rate is not None else None
        ),
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

    await db[_SO_COL].update_one(
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

    updated_raw = await db[_SO_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if updated_raw is None:
        return None
    updated_raw.pop("_id", None)
    return _doc_to_response(updated_raw)


async def transition_status(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    request_body: SalesOrderStatusTransitionRequest,
    org_id: str,
    user_id: str,
    user_role: str,
) -> Optional[SalesOrderResponse]:
    """
    Transition a Sales Order to a new status.

    Uses ``assert_legal_transition("SO", ...)`` from T-100.1 as the sole
    state-machine gatekeeper.

    Special handling per target status:

    DRAFT → OPEN:
      - Runs credit-limit check against finance microservice.
      - If 'blocked' and override_credit_check=False → ValueError (HTTP 409).
      - If 'blocked' and override=True + admin role + reason → result='override'.
      - Sets committed_qty = ordered_qty on every line.
      - Stores credit_check snapshot on header.

    → CANCELLED (from DRAFT, OPEN, PARTLY_CLOSED):
      - Sets committed_qty = 0 on every line.
      - If SO was created from a Quote: back-decrements each Quote line's
        consumedQty and reopens the Quote if it was auto-closed by this SO.

    → CLOSED:
      - Validates all lines have open_qty == 0 (delivered or cancelled).
        Raises ValueError if any line has remaining qty.

    → PARTLY_CLOSED:
      - Validates at least one line has delivered_qty > 0.
        (Typically set by Delivery service; direct invocation is guarded.)

    Args:
        db:           Motor database instance.
        doc_entry:    UUID of the SO.
        request_body: Transition request with new_status, reason, and override fields.
        org_id:       Organisation UUID for scoping.
        user_id:      Authenticated user performing the transition.
        user_role:    Role of the authenticated user (for credit override guard).

    Returns:
        Updated SalesOrderResponse, or None if the SO was not found.

    Raises:
        ValueError: If the transition is not legal, or credit check fails
                    without an authorized override, or CLOSED is requested
                    while lines still have open_qty.
    """
    raw = await db[_SO_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return None

    current_status = DocumentStatus(raw["status"])
    new_status = request_body.new_status

    # Reason: assert_legal_transition raises ValueError for illegal transitions.
    assert_legal_transition(_DOC_TYPE, current_status, new_status)

    now = _now()
    extra_updates: Dict[str, Any] = {}

    # ----- DRAFT → OPEN: credit-limit check + committed_qty -----
    if current_status == DocumentStatus.DRAFT and new_status == DocumentStatus.OPEN:
        gross_total = Decimal(str(raw.get("totals", {}).get("gross", 0)))
        credit_check = await _check_credit_limit(
            org_id=org_id,
            customer_id=raw["customerId"],
            this_order_total=gross_total,
        )

        if credit_check["result"] == "blocked":
            if not request_body.override_credit_check:
                raise ValueError(
                    f"Credit limit check BLOCKED: "
                    f"order total {gross_total} + outstanding AR "
                    f"{credit_check['outstandingAr']} exceeds credit limit "
                    f"{credit_check['customerCreditLimit']}. "
                    "Supply override_credit_check=true with a valid override_reason "
                    "and sufficient role (super_admin or finance_admin) to proceed."
                )

            # Validate override authorisation.
            if user_role not in _CREDIT_OVERRIDE_ROLES:
                raise PermissionError(
                    f"Credit override requires super_admin or finance_admin role; "
                    f"caller has role '{user_role}'"
                )
            if not request_body.override_reason:
                raise ValueError(
                    "override_reason must be provided when overriding a credit block"
                )

            credit_check["result"] = "override"
            credit_check["overrideByUserId"] = user_id
            credit_check["overrideReason"] = request_body.override_reason

        extra_updates["creditCheck"] = credit_check

        # Set committed_qty = orderedQty on every line (inventory placeholder).
        updated_lines = [
            {**ln, "committedQty": ln.get("orderedQty", ln.get("quantity", 0))}
            for ln in raw.get("lines", [])
        ]
        extra_updates["lines"] = updated_lines

    # ----- → CANCELLED: clear committed_qty + restore Quote consumed_qty -----
    elif new_status == DocumentStatus.CANCELLED:
        updated_lines = [
            {**ln, "committedQty": 0.0}
            for ln in raw.get("lines", [])
        ]
        extra_updates["lines"] = updated_lines

        # Back-decrement the source Quote's consumed_qty if this was from-quote.
        base_ref = raw.get("baseDocRef")
        if base_ref and base_ref.get("docId"):
            quote_doc_entry = base_ref["docId"]
            for so_line in raw.get("lines", []):
                so_base = so_line.get("baseDocRef")
                if not so_base or not so_base.get("lineId"):
                    continue
                quote_line_id = so_base["lineId"]
                # Restore the consumed quantity (negative delta = decrement).
                restore_qty = float(so_line.get("consumedQty", 0))
                if restore_qty > 0:
                    await db[_QUOTES_COL].update_one(
                        {
                            "docEntry": quote_doc_entry,
                            "organizationId": org_id,
                            "lines.lineId": quote_line_id,
                        },
                        {
                            "$inc": {"lines.$.consumedQty": -restore_qty},
                            "$set": {"updatedAt": now, "updatedBy": user_id},
                        },
                    )

            # Reopen the Quote if it was auto-closed by this SO's creation.
            refreshed_quote = await db[_QUOTES_COL].find_one(
                {"docEntry": quote_doc_entry, "organizationId": org_id}
            )
            if refreshed_quote and DocumentStatus(refreshed_quote["status"]) == DocumentStatus.CLOSED:
                # Only reopen if the auto-close was caused by this SO (check targetDocRefs).
                target_refs = refreshed_quote.get("targetDocRefs", [])
                this_so_ref_exists = any(
                    ref.get("docId") == doc_entry for ref in target_refs
                )
                if this_so_ref_exists:
                    await db[_QUOTES_COL].update_one(
                        {"docEntry": quote_doc_entry, "organizationId": org_id},
                        {
                            "$set": {
                                "status": DocumentStatus.OPEN.value,
                                "updatedAt": now,
                                "updatedBy": user_id,
                            }
                        },
                    )

    # ----- → CLOSED: guard — all lines must have open_qty == 0 -----
    elif new_status == DocumentStatus.CLOSED:
        for ln in raw.get("lines", []):
            open_qty = _line_open_qty(ln)
            if open_qty > _OPEN_QTY_TOLERANCE:
                raise ValueError(
                    f"Cannot close SO '{doc_entry}': line '{ln['lineId']}' still has "
                    f"open_qty={float(open_qty):.4f} (deliver or cancel the remaining qty first)"
                )

    # ----- → PARTLY_CLOSED: guard — at least one line must have delivered_qty > 0 -----
    elif new_status == DocumentStatus.PARTLY_CLOSED:
        has_delivered = any(
            Decimal(str(ln.get("deliveredQty", 0))) > _OPEN_QTY_TOLERANCE
            for ln in raw.get("lines", [])
        )
        if not has_delivered:
            raise ValueError(
                f"Cannot set SO '{doc_entry}' to PARTLY_CLOSED: "
                "no lines have delivered_qty > 0"
            )

    # Apply the transition.
    set_fields: Dict[str, Any] = {
        "status": new_status.value,
        "updatedAt": now,
        "updatedBy": user_id,
        **extra_updates,
    }
    await db[_SO_COL].update_one(
        {"docEntry": doc_entry, "organizationId": org_id},
        {"$set": set_fields},
    )

    audit_detail: Dict[str, Any] = {
        "from": current_status.value,
        "to": new_status.value,
        "reason": request_body.reason,
    }
    if "creditCheck" in extra_updates:
        audit_detail["creditCheck"] = extra_updates["creditCheck"]

    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="transition",
        user_id=user_id,
        detail=audit_detail,
    )

    updated_raw = await db[_SO_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if updated_raw is None:
        return None
    updated_raw.pop("_id", None)
    return _doc_to_response(updated_raw)


async def delete_sales_order(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    org_id: str,
    user_id: str,
) -> bool:
    """
    Hard-delete a DRAFT Sales Order.

    Only DRAFT SOs may be deleted.  If the SO was created from a Quote, the
    Quote's consumed_qty values for corresponding lines are back-decremented
    before deletion (restoring the Quote's open_qty).

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the SO.
        org_id:    Organisation UUID for scoping.
        user_id:   Authenticated user performing the deletion.

    Returns:
        True if the SO was deleted, False if not found.

    Raises:
        ValueError: If the SO status is not DRAFT.
    """
    raw = await db[_SO_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return False

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"Sales Order '{doc_entry}' cannot be deleted: "
            f"status is '{raw['status']}' (only DRAFT SOs may be deleted)"
        )

    # Back-decrement source Quote's consumed_qty if this SO was from a Quote.
    base_ref = raw.get("baseDocRef")
    if base_ref and base_ref.get("docId"):
        quote_doc_entry = base_ref["docId"]
        now = _now()
        for so_line in raw.get("lines", []):
            so_base = so_line.get("baseDocRef")
            if not so_base or not so_base.get("lineId"):
                continue
            restore_qty = float(so_line.get("consumedQty", 0))
            if restore_qty > 0:
                await db[_QUOTES_COL].update_one(
                    {
                        "docEntry": quote_doc_entry,
                        "organizationId": org_id,
                        "lines.lineId": so_base["lineId"],
                    },
                    {
                        "$inc": {"lines.$.consumedQty": -restore_qty},
                        "$set": {"updatedAt": now, "updatedBy": user_id},
                    },
                )

    # Reason: write audit BEFORE delete so the trail survives the deletion.
    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="delete",
        user_id=user_id,
        detail={"docNumber": raw.get("docNumber")},
    )

    await db[_SO_COL].delete_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    return True
