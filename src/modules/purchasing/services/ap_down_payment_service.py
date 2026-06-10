"""
Purchasing Module — AP Down Payment Invoice (DPI) Service Layer (T-200.24 / Wave 4)

Vendor prepayment vehicle.  Booked when a vendor demands payment before
delivering goods/services (deposits on custom orders, big-ticket items, advance
retainers).  Future AP Invoices net against the DPI's outstanding balance;
consumed amount is tracked; the DPI auto-closes when fully netted.

Responsibilities
----------------
- Create an AP Down Payment Invoice in DRAFT status (direct — no source doc).
- Retrieve a single DPI by doc_id UUID.
- Paginated list with filters (status, vendor_id, date range, has_outstanding).
- Partial update (DRAFT only).
- Hard-delete a DRAFT DPI (super_admin).
- Status transitions with legal-transition guard:
  - DRAFT → PENDING_APPROVAL: submit for approval.
  - PENDING_APPROVAL → OPEN (approval): the primary financial recording event.
    Emits ap_down_payment_posted outbox event.
  - PENDING_APPROVAL → DRAFT (rejection / withdraw): no financial impact.
  - OPEN/PARTLY_CLOSED → CLOSED / PARTLY_CLOSED: auto-driven by AP Invoice
    allocation mechanics in purchasing_chain_reconciler.
  - Any OPEN/PARTLY_CLOSED → CANCELLED: voids the prepayment.

Collections used
----------------
  ap_down_payments_v2            — one document per DPI header + embedded lines
  ap_down_payments_v2_audit      — append-only audit trail
  finance_outbox                 — OutboxWriter destination

Lifecycle (AP_DPI in document_status.py)
-----------------------------------------
  DRAFT → PENDING_APPROVAL → OPEN → (PARTLY_CLOSED ↔ OPEN) → CLOSED
  PENDING_APPROVAL → DRAFT  (rejection / withdraw path)
  OPEN/PARTLY_CLOSED → CANCELLED

DPI consumption (cross-cutting with AP Invoice)
-----------------------------------------------
  consumedAmount on the DPI header is incremented by
  reconcile_dpi_consumption() in purchasing_chain_reconciler whenever an AP
  Invoice that allocated this DPI transitions to OPEN.  The reconciler also
  calls auto_close_dpi_if_fully_consumed() to handle PARTLY_CLOSED/CLOSED
  auto-transitions.

Tax resolution (T-200.22b)
--------------------------
Tax rates are resolved via the finance microservice HTTP (``get_tax_percent`` from
``src.core.finance``), matching the sales T-202 pattern.  The hardcoded ``AP_TAX_RATES``
dict has been removed.  ``auth_token`` is now a parameter on the create function and
forwarded through the call stack to the HTTP helper.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from math import ceil
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from src.core.documents.doc_number import next_doc_number
from src.core.documents.document_status import DocumentStatus, assert_legal_transition
from src.core.finance import get_tax_percent

from ..models.document import (
    APDownPaymentCreate,
    APDownPaymentLine,
    APDownPaymentListItem,
    APDownPaymentResponse,
    APDownPaymentStatusTransitionRequest,
    APDownPaymentTotals,
    APDownPaymentUpdate,
    DocumentLinkRef,
)
from .purchasing_chain_reconciler import write_purchasing_audit

logger = logging.getLogger(__name__)

_DPI_COL = "ap_down_payments_v2"
_AUDIT_COL = "ap_down_payments_v2_audit"
_DOC_TYPE_AP_DPI = "AP_DPI"
_TOLERANCE = Decimal("0.005")
_TWOPLACES = Decimal("0.01")
_ZERO = Decimal("0")

# DPI statuses that can accept AP Invoice allocations.
_ALLOCATABLE_STATUSES = {
    DocumentStatus.OPEN.value,
    DocumentStatus.PARTLY_CLOSED.value,
}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _now() -> datetime:
    """Return timezone-aware UTC now."""
    return datetime.now(tz=timezone.utc)


async def _resolve_tax_rate(
    tax_code: Optional[str],
    org_id: str,
    auth_token: Optional[str],
) -> Decimal:
    """
    Resolve a tax code to its rate via the finance microservice HTTP.

    T-200.22b migration: previously queried the hardcoded AP_TAX_RATES dict;
    now mirrors sales' get_tax_percent helper (T-202) so rates are per-tenant
    and configurable without a code release.

    Returns Decimal("0.00") for null/missing codes (exempt-line shortcut,
    no HTTP call).
    Raises ValueError if the code is unknown or finance is unreachable.

    Args:
        tax_code:   Tax code string (e.g. "S", "Z", "E"), or None for exempt lines.
        org_id:     Organisation UUID for scoping.
        auth_token: Bearer token from the calling user's JWT, forwarded to the
                    finance service for authentication.

    Returns:
        Tax rate as a Decimal (e.g. Decimal("5.00") for 5%).
    """
    return await get_tax_percent(tax_code, org_id, auth_token)


def _compute_line_amounts(
    *,
    quantity: Decimal,
    unit_price: Decimal,
    discount_percent: Decimal,
    tax_rate: Decimal,
) -> Dict[str, Decimal]:
    """
    Compute derived monetary amounts for a single DPI line.

    Args:
        quantity:         Prepayment quantity basis.
        unit_price:       Prepayment amount per unit.
        discount_percent: Line discount 0–100.
        tax_rate:         Tax rate 0–100 (resolved via finance HTTP lookup).

    Returns:
        Dict with keys: line_net, line_tax, line_gross.
    """
    # Reason: apply discount to unit price before multiplying by quantity.
    discount_factor = Decimal("1") - discount_percent / Decimal("100")
    line_net = (quantity * unit_price * discount_factor).quantize(
        _TWOPLACES, rounding=ROUND_HALF_UP
    )
    line_tax = (line_net * tax_rate / Decimal("100")).quantize(
        _TWOPLACES, rounding=ROUND_HALF_UP
    )
    line_gross = (line_net + line_tax).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)
    return {"line_net": line_net, "line_tax": line_tax, "line_gross": line_gross}


async def _build_line_doc(
    line: Any,
    *,
    line_number: int,
    org_id: str,
    auth_token: Optional[str],
) -> Dict[str, Any]:
    """
    Build the embedded DPI line dict for MongoDB storage.

    Args:
        line:        Validated APDownPaymentLineCreate input.
        line_number: 1-indexed position.
        org_id:      Organisation UUID for scoping (forwarded to finance HTTP lookup).
        auth_token:  Bearer token forwarded to the finance service for tax resolution.

    Returns:
        Dict ready for embedding in the DPI header document.
    """
    line_id = str(uuid.uuid4())
    desc = line.description if line.description is not None else line.item_name
    tax_rate = await _resolve_tax_rate(line.tax_code, org_id, auth_token)
    amounts = _compute_line_amounts(
        quantity=line.quantity,
        unit_price=line.unit_price,
        discount_percent=line.discount_percent,
        tax_rate=tax_rate,
    )
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
        "lineNet": float(amounts["line_net"]),
        "taxCode": line.tax_code,
        "taxRate": float(tax_rate),
        "lineTax": float(amounts["line_tax"]),
        "lineGross": float(amounts["line_gross"]),
        "costCenterId": line.cost_center_id,
        "notes": line.notes,
    }


def _build_totals(lines: List[Dict[str, Any]], consumed_amount: Decimal = _ZERO) -> Dict[str, Any]:
    """
    Aggregate totals from embedded DPI line documents.

    Args:
        lines:           List of embedded line dicts.
        consumed_amount: Gross already consumed by AP Invoice allocations.

    Returns:
        Dict with keys: net, tax, gross, consumedAmount, outstandingAmount.
    """
    total_net = sum(Decimal(str(ln.get("lineNet", 0))) for ln in lines)
    total_tax = sum(Decimal(str(ln.get("lineTax", 0))) for ln in lines)
    total_gross = (total_net + total_tax).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)
    outstanding = max(total_gross - consumed_amount, _ZERO).quantize(
        _TWOPLACES, rounding=ROUND_HALF_UP
    )
    return {
        "net": float(total_net.quantize(_TWOPLACES, rounding=ROUND_HALF_UP)),
        "tax": float(total_tax.quantize(_TWOPLACES, rounding=ROUND_HALF_UP)),
        "gross": float(total_gross),
        "consumedAmount": float(consumed_amount.quantize(_TWOPLACES, rounding=ROUND_HALF_UP)),
        "outstandingAmount": float(outstanding),
    }


def _norm_ref(ref: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Normalise camelCase MongoDB ref dict to snake_case for Pydantic."""
    if ref is None:
        return None
    return {
        "doc_type": ref.get("doc_type") or ref.get("docType", ""),
        "doc_id": ref.get("doc_id") or ref.get("docId", ""),
        "doc_number": ref.get("doc_number") or ref.get("docNumber", ""),
        "line_id": ref.get("line_id") or ref.get("lineId"),
    }


def _norm_refs(refs: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """Normalise a list of MongoDB ref dicts."""
    if not refs:
        return []
    return [_norm_ref(r) for r in refs if r is not None]


def _raw_line_to_response(ln: Dict[str, Any]) -> APDownPaymentLine:
    """Convert a raw embedded DPI line dict to APDownPaymentLine."""
    return APDownPaymentLine(
        line_id=ln["lineId"],
        line_number=ln["lineNumber"],
        item_id=ln.get("itemId"),
        item_code=ln.get("itemCode"),
        item_name=ln.get("itemName"),
        description=ln.get("description"),
        quantity=Decimal(str(ln.get("quantity", 0))),
        uom=ln.get("uom", ""),
        unit_price=Decimal(str(ln.get("unitPrice", 0))),
        discount_percent=Decimal(str(ln.get("discountPercent", 0))),
        line_net=Decimal(str(ln.get("lineNet", 0))),
        tax_code=ln.get("taxCode"),
        tax_rate=Decimal(str(ln.get("taxRate", 0))),
        line_tax=Decimal(str(ln.get("lineTax", 0))),
        line_gross=Decimal(str(ln.get("lineGross", 0))),
        cost_center_id=ln.get("costCenterId"),
        notes=ln.get("notes"),
    )


def _raw_totals_to_model(raw: Dict[str, Any], consumed_amount: Decimal = _ZERO) -> APDownPaymentTotals:
    """
    Convert raw MongoDB totals dict + consumedAmount to APDownPaymentTotals.

    Args:
        raw:             Raw totals dict from MongoDB (net/tax/gross keys).
        consumed_amount: Amount consumed by AP Invoice allocations.

    Returns:
        APDownPaymentTotals with outstanding_amount computed.
    """
    gross = Decimal(str(raw.get("gross", 0)))
    outstanding = max(gross - consumed_amount, _ZERO).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)
    return APDownPaymentTotals(
        net=Decimal(str(raw.get("net", 0))),
        tax=Decimal(str(raw.get("tax", 0))),
        gross=gross,
        consumed_amount=consumed_amount,
        outstanding_amount=outstanding,
    )


def _doc_to_response(raw: Dict[str, Any]) -> APDownPaymentResponse:
    """Convert a raw MongoDB ap_down_payments_v2 document to APDownPaymentResponse."""
    lines = [_raw_line_to_response(ln) for ln in raw.get("lines", [])]

    consumed = Decimal(str(raw.get("consumedAmount", 0)))
    raw_totals = raw.get("totals", {})
    totals = _raw_totals_to_model(raw_totals, consumed)

    target_refs_raw = _norm_refs(raw.get("targetDocRefs", []))
    target_refs = [DocumentLinkRef(**r) for r in target_refs_raw if r]

    return APDownPaymentResponse(
        doc_id=raw["docId"],
        doc_number=raw["docNumber"],
        doc_type=raw.get("docType", _DOC_TYPE_AP_DPI),
        organization_id=raw["organizationId"],
        company_code=raw.get("companyCode", ""),
        vendor_id=raw["vendorId"],
        vendor_code=raw.get("vendorCode"),
        vendor_name=raw["vendorName"],
        bp_ref_no=raw.get("bpRefNo"),
        doc_date=raw["docDate"],
        due_date=raw.get("dueDate"),
        currency=raw.get("currency", "AED"),
        exchange_rate=Decimal(str(raw.get("exchangeRate", 1))),
        payment_terms_id=raw.get("paymentTermsId"),
        status=raw["status"],
        totals=totals,
        target_doc_refs=target_refs,
        journal_memo=raw.get("journalMemo"),
        notes=raw.get("notes"),
        outbox_event_id=raw.get("outboxEventId"),
        outbox_event_emitted_at=raw.get("outboxEventEmittedAt"),
        lines=lines,
        created_at=raw["createdAt"],
        created_by=raw["createdBy"],
        updated_at=raw["updatedAt"],
        updated_by=raw["updatedBy"],
    )


def _doc_to_list_item(raw: Dict[str, Any]) -> APDownPaymentListItem:
    """Convert a raw MongoDB document to slim APDownPaymentListItem."""
    consumed = Decimal(str(raw.get("consumedAmount", 0)))
    raw_totals = raw.get("totals", {})
    totals = _raw_totals_to_model(raw_totals, consumed)

    return APDownPaymentListItem(
        doc_id=raw["docId"],
        doc_number=raw["docNumber"],
        organization_id=raw["organizationId"],
        vendor_id=raw["vendorId"],
        vendor_name=raw["vendorName"],
        doc_date=raw["docDate"],
        status=raw["status"],
        totals=totals,
        created_at=raw["createdAt"],
        updated_at=raw["updatedAt"],
    )


async def _write_audit(
    db: AsyncIOMotorDatabase,
    *,
    doc_id: str,
    action: str,
    user_id: str,
    detail: Optional[Dict[str, Any]] = None,
) -> None:
    """Append an audit entry to ap_down_payments_v2_audit."""
    await write_purchasing_audit(
        db,
        audit_collection=_AUDIT_COL,
        doc_id=doc_id,
        action=action,
        user_id=user_id,
        detail=detail,
    )


def _build_outbox_payload(dpi_raw: Dict[str, Any], *, event_type: str) -> Dict[str, Any]:
    """
    Build the ap_down_payment_posted outbox payload.

    The payload structure mirrors the AP Invoice posted event shape.
    The finance consumer will book the prepaid-asset / cash-out JE:
        DR Prepaid Asset / CR Cash (or AP Control Account)

    Args:
        dpi_raw:    Raw DPI header document (post-update state).
        event_type: "ap_down_payment_posted" (future: "ap_down_payment_cancelled").

    Returns:
        Dict matching the AP down payment event payload contract.
    """

    def _date_str(val: Any) -> str:
        if val is None:
            return ""
        if hasattr(val, "strftime"):
            return val.strftime("%Y-%m-%d")
        return str(val)[:10]

    lines_payload = []
    for ln in sorted(dpi_raw.get("lines", []), key=lambda x: x.get("lineNumber", 0)):
        lines_payload.append({
            "lineNumber": ln["lineNumber"],
            "itemId": ln.get("itemId"),
            "itemCode": ln.get("itemCode", ""),
            "quantity": str(ln.get("quantity", 0)),
            "unitPrice": str(ln.get("unitPrice", 0)),
            "lineNet": str(ln.get("lineNet", 0)),
            "taxCode": ln.get("taxCode"),
            "taxRate": str(ln.get("taxRate", 0)),
            "lineTax": str(ln.get("lineTax", 0)),
            "lineGross": str(ln.get("lineGross", 0)),
            "costCenterId": ln.get("costCenterId"),
        })

    totals = dpi_raw.get("totals", {})

    return {
        "dpiDocId": dpi_raw["docId"],
        "dpiDocNumber": dpi_raw["docNumber"],
        "docDate": _date_str(dpi_raw.get("docDate")),
        "vendorId": dpi_raw.get("vendorId", ""),
        "vendorName": dpi_raw.get("vendorName", ""),
        "bpRefNo": dpi_raw.get("bpRefNo"),
        "currency": dpi_raw.get("currency", "AED"),
        "exchangeRate": str(dpi_raw.get("exchangeRate", 1)),
        "totals": {
            "net": str(totals.get("net", 0)),
            "tax": str(totals.get("tax", 0)),
            "gross": str(totals.get("gross", 0)),
        },
        "lines": lines_payload,
    }


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def create_ap_down_payment(
    db: AsyncIOMotorDatabase,
    payload: APDownPaymentCreate,
    org_id: str,
    user_id: str,
    auth_token: Optional[str] = None,
) -> APDownPaymentResponse:
    """
    Create a new AP Down Payment Invoice in DRAFT status.

    Direct create only — DPI is not chained from any source document.

    Sequence:
    1. Generate docId + docNumber ("DPI-YYYY-NNNN").
    2. Build embedded line docs with amounts resolved via finance HTTP (T-200.22b).
    3. Persist in DRAFT status with consumedAmount = 0.
    4. Audit-log.

    Args:
        db:         Motor database instance.
        payload:    Validated APDownPaymentCreate payload.
        org_id:     Organisation UUID for scoping.
        user_id:    Authenticated user creating the DPI.
        auth_token: Bearer token forwarded to the finance service for tax resolution.

    Returns:
        APDownPaymentResponse for the newly-created DRAFT DPI.
    """
    # Reason: build lines first so totals are correct before inserting the header.
    computed_lines: List[Dict[str, Any]] = []
    for i, line in enumerate(payload.lines, start=1):
        computed_lines.append(
            await _build_line_doc(line, line_number=i, org_id=org_id, auth_token=auth_token)
        )

    totals = _build_totals(computed_lines, consumed_amount=_ZERO)

    doc_id = str(uuid.uuid4())
    doc_number = await next_doc_number(
        db,
        doc_type=_DOC_TYPE_AP_DPI,
        org_id=org_id,
        company_code=payload.company_code or org_id,
    )

    now = _now()
    doc_date = payload.doc_date or now

    doc: Dict[str, Any] = {
        "docId": doc_id,
        "docNumber": doc_number,
        "docType": _DOC_TYPE_AP_DPI,
        "organizationId": org_id,
        "companyCode": payload.company_code or "",
        "vendorId": payload.vendor_id,
        "vendorCode": payload.vendor_code,
        "vendorName": payload.vendor_name,
        "bpRefNo": payload.bp_ref_no,
        "docDate": doc_date,
        "dueDate": payload.due_date,
        "currency": payload.currency,
        "exchangeRate": float(payload.exchange_rate),
        "paymentTermsId": payload.payment_terms_id,
        "status": DocumentStatus.DRAFT.value,
        "totals": totals,
        # Reason: consumedAmount is the running total of AP Invoice allocations applied
        # to this DPI.  Starts at 0 and is incremented by reconcile_dpi_consumption.
        "consumedAmount": 0.0,
        "targetDocRefs": [],
        "journalMemo": payload.journal_memo,
        "notes": payload.notes,
        "outboxEventId": None,
        "outboxEventEmittedAt": None,
        "lines": computed_lines,
        "createdAt": now,
        "createdBy": user_id,
        "updatedAt": now,
        "updatedBy": user_id,
    }

    await db[_DPI_COL].insert_one(doc)

    await _write_audit(
        db,
        doc_id=doc_id,
        action="create",
        user_id=user_id,
        detail={
            "vendorId": payload.vendor_id,
            "lineCount": len(computed_lines),
            "totalGross": totals["gross"],
        },
    )

    doc.pop("_id", None)
    return _doc_to_response(doc)


async def get_ap_down_payment(
    db: AsyncIOMotorDatabase,
    doc_id: str,
    org_id: str,
) -> Optional[APDownPaymentResponse]:
    """
    Retrieve a single AP Down Payment Invoice by its doc_id UUID.

    The ``outstanding_amount`` is computed at read time as
    ``totalGross - consumedAmount``.

    Args:
        db:     Motor database instance.
        doc_id: UUID of the AP Down Payment Invoice.
        org_id: Organisation UUID for scoping.

    Returns:
        APDownPaymentResponse if found, None otherwise.
    """
    raw = await db[_DPI_COL].find_one({"docId": doc_id, "organizationId": org_id})
    if raw is None:
        return None
    raw.pop("_id", None)
    return _doc_to_response(raw)


async def list_ap_down_payments(
    db: AsyncIOMotorDatabase,
    org_id: str,
    *,
    vendor_id: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    has_outstanding: Optional[bool] = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    """
    Paginated list of AP Down Payment Invoices for an organisation.

    The ``has_outstanding`` boolean filter returns only DPIs with outstanding
    balance > 0 (useful for the AP Invoice allocation picker).

    Args:
        db:              Motor database instance.
        org_id:          Organisation UUID for scoping.
        vendor_id:       Optional filter by vendor UUID.
        status:          Optional filter by status string.
        date_from:       Optional filter by doc_date >= date_from.
        date_to:         Optional filter by doc_date <= date_to.
        has_outstanding: When True, return only DPIs where consumedAmount < totalGross.
                         When False, return only fully-consumed DPIs.
                         None = no filter.
        page:            1-indexed page number.
        page_size:       Maximum items per page.

    Returns:
        Dict with keys: items, total, page, page_size, total_pages.
    """
    query: Dict[str, Any] = {"organizationId": org_id}

    if vendor_id:
        query["vendorId"] = vendor_id
    if status:
        query["status"] = status
    if date_from or date_to:
        date_filter: Dict[str, Any] = {}
        if date_from:
            date_filter["$gte"] = date_from
        if date_to:
            date_filter["$lte"] = date_to
        query["docDate"] = date_filter

    # Reason: has_outstanding compares consumedAmount < totals.gross for "open balance"
    # filter.  We query MongoDB using $where-style expression via $expr.
    if has_outstanding is True:
        # DPIs where consumedAmount < totals.gross (i.e. outstanding > 0).
        query["$expr"] = {"$lt": ["$consumedAmount", "$totals.gross"]}
    elif has_outstanding is False:
        # DPIs where consumedAmount >= totals.gross (fully consumed).
        query["$expr"] = {"$gte": ["$consumedAmount", "$totals.gross"]}

    total = await db[_DPI_COL].count_documents(query)
    skip = (page - 1) * page_size

    cursor = (
        db[_DPI_COL]
        .find(query, {"lines": 0})
        .sort("docDate", -1)
        .skip(skip)
        .limit(page_size)
    )
    raws = await cursor.to_list(length=page_size)

    items = [_doc_to_list_item(r) for r in raws]
    total_pages = ceil(total / page_size) if page_size > 0 else 1

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


async def update_ap_down_payment(
    db: AsyncIOMotorDatabase,
    doc_id: str,
    payload: APDownPaymentUpdate,
    org_id: str,
    user_id: str,
) -> Optional[APDownPaymentResponse]:
    """
    Partially update a DRAFT AP Down Payment Invoice.

    If payload.lines is supplied, replaces the line set wholesale.
    Only DRAFT DPIs may be updated.

    Args:
        db:      Motor database instance.
        doc_id:  UUID of the AP Down Payment Invoice.
        payload: Validated APDownPaymentUpdate payload.
        org_id:  Organisation UUID for scoping.
        user_id: Authenticated user performing the update.

    Returns:
        Updated APDownPaymentResponse, or None if not found.

    Raises:
        ValueError: If the DPI is not in DRAFT status.
    """
    raw = await db[_DPI_COL].find_one({"docId": doc_id, "organizationId": org_id})
    if raw is None:
        return None

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"AP Down Payment Invoice '{doc_id}' cannot be updated: "
            f"status is '{raw['status']}' (only DRAFT DPIs may be edited)"
        )

    now = _now()
    updates: Dict[str, Any] = {"updatedAt": now, "updatedBy": user_id}

    field_map: Dict[str, Any] = {
        "bpRefNo": payload.bp_ref_no,
        "docDate": payload.doc_date,
        "dueDate": payload.due_date,
        "currency": payload.currency,
        "exchangeRate": float(payload.exchange_rate) if payload.exchange_rate is not None else None,
        "paymentTermsId": payload.payment_terms_id,
        "journalMemo": payload.journal_memo,
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
        updates["totals"] = _build_totals(new_lines, consumed_amount=_ZERO)

    await db[_DPI_COL].update_one(
        {"docId": doc_id, "organizationId": org_id},
        {"$set": updates},
    )

    await _write_audit(
        db,
        doc_id=doc_id,
        action="update",
        user_id=user_id,
        detail={"updatedFields": list(updates.keys())},
    )

    updated_raw = await db[_DPI_COL].find_one({"docId": doc_id, "organizationId": org_id})
    if updated_raw is None:
        return None
    updated_raw.pop("_id", None)
    return _doc_to_response(updated_raw)


async def delete_ap_down_payment(
    db: AsyncIOMotorDatabase,
    doc_id: str,
    org_id: str,
    user_id: str,
) -> bool:
    """
    Hard-delete a DRAFT AP Down Payment Invoice.

    Only DRAFT DPIs may be deleted.  Posted (OPEN/CLOSED) DPIs are
    immutable per accounting immutability rules.

    Args:
        db:      Motor database instance.
        doc_id:  UUID of the AP Down Payment Invoice.
        org_id:  Organisation UUID for scoping.
        user_id: Authenticated user performing the deletion.

    Returns:
        True if deleted, False if not found.

    Raises:
        ValueError: If the DPI is not in DRAFT status.
    """
    raw = await db[_DPI_COL].find_one({"docId": doc_id, "organizationId": org_id})
    if raw is None:
        return False

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"AP Down Payment Invoice '{doc_id}' cannot be deleted: "
            f"status is '{raw['status']}' (only DRAFT DPIs may be deleted)"
        )

    # Reason: write audit BEFORE delete so the trail survives deletion.
    await _write_audit(
        db,
        doc_id=doc_id,
        action="delete",
        user_id=user_id,
        detail={"docNumber": raw.get("docNumber")},
    )

    await db[_DPI_COL].delete_one({"docId": doc_id, "organizationId": org_id})
    return True


async def transition_status(
    db: AsyncIOMotorDatabase,
    doc_id: str,
    request_body: APDownPaymentStatusTransitionRequest,
    org_id: str,
    user_id: str,
) -> Optional[APDownPaymentResponse]:
    """
    Transition an AP Down Payment Invoice to a new status.

    Uses assert_legal_transition("AP_DPI", ...) as the state-machine gatekeeper.

    DRAFT → PENDING_APPROVAL:
      Write audit ("submit_for_approval"). No financial impact.

    PENDING_APPROVAL → OPEN (approval — the financial recording event):
      1. Emit ap_down_payment_posted outbox event (finance books prepaid-asset JE).
      2. Persist new status + outbox event fields.
      3. Audit-log.

    PENDING_APPROVAL → DRAFT (rejection / withdraw):
      Status flip + audit. No financial impact.

    OPEN/PARTLY_CLOSED → CANCELLED:
      Terminal cancellation.  Note: if the DPI has been partially consumed
      (consumedAmount > 0), the caller is responsible for first releasing
      any AP Invoice allocations before cancelling.  This service does not
      enforce that guard in v1 — it is a UI / workflow concern.

    OPEN/PARTLY_CLOSED → CLOSED / PARTLY_CLOSED:
      These transitions are auto-driven by the reconciler helpers in
      purchasing_chain_reconciler (called from AP Invoice service on approval
      / delete / cancel).  They can also be triggered manually here for
      admin override scenarios.

    Args:
        db:           Motor database instance.
        doc_id:       UUID of the AP Down Payment Invoice.
        request_body: Transition request with target_status and optional notes.
        org_id:       Organisation UUID for scoping.
        user_id:      Authenticated user performing the transition.

    Returns:
        Updated APDownPaymentResponse, or None if not found.

    Raises:
        ValueError: If the transition is illegal or validation fails.
    """
    raw = await db[_DPI_COL].find_one({"docId": doc_id, "organizationId": org_id})
    if raw is None:
        return None

    current_status = DocumentStatus(raw["status"])
    # Reason: target_status comes in as a string; parse to enum for comparison.
    new_status = DocumentStatus(request_body.target_status)
    now = _now()

    # Reason: assert_legal_transition raises ValueError for illegal transitions.
    assert_legal_transition(_DOC_TYPE_AP_DPI, current_status, new_status)

    # -----------------------------------------------------------------------
    # PENDING_APPROVAL → OPEN: the financial recording event
    # -----------------------------------------------------------------------
    if (
        current_status == DocumentStatus.PENDING_APPROVAL
        and new_status == DocumentStatus.OPEN
    ):
        # Build and emit the ap_down_payment_posted outbox event.
        event_payload = _build_outbox_payload(raw, event_type="ap_down_payment_posted")
        emitted_event_id: Optional[str] = None

        try:
            from src.modules.finance_bridge.outbox_writer import OutboxWriter  # noqa: PLC0415

            emitted_event_id = await OutboxWriter.publish(
                db=db,
                event_type="ap_down_payment_posted",
                organization_id=org_id,
                company_code=raw.get("companyCode", "1000"),
                payload=event_payload,
                source_user_id=user_id,
                source_document_id=doc_id,
            )
        except Exception as exc:  # noqa: BLE001
            # Reason: outbox failure is logged but must not block the status update.
            logger.error(
                "[APDownPaymentService] Failed to emit ap_down_payment_posted for '%s': %s",
                doc_id,
                exc,
            )

        # Persist new status + outbox audit fields.
        set_fields: Dict[str, Any] = {
            "status": new_status.value,
            "outboxEventId": str(emitted_event_id) if emitted_event_id else None,
            "outboxEventEmittedAt": now if emitted_event_id else None,
            "updatedAt": now,
            "updatedBy": user_id,
        }
        await db[_DPI_COL].update_one(
            {"docId": doc_id, "organizationId": org_id},
            {"$set": set_fields},
        )

        await _write_audit(
            db,
            doc_id=doc_id,
            action="transition",
            user_id=user_id,
            detail={
                "from": current_status.value,
                "to": new_status.value,
                "notes": request_body.notes,
                "outboxEventId": str(emitted_event_id) if emitted_event_id else None,
            },
        )

    # -----------------------------------------------------------------------
    # All other transitions: status flip + audit only
    # -----------------------------------------------------------------------
    else:
        action_label = "transition"
        if (
            current_status == DocumentStatus.DRAFT
            and new_status == DocumentStatus.PENDING_APPROVAL
        ):
            action_label = "submit_for_approval"
        elif (
            current_status == DocumentStatus.PENDING_APPROVAL
            and new_status == DocumentStatus.DRAFT
        ):
            action_label = "reject_or_withdraw"
        elif new_status == DocumentStatus.CANCELLED:
            action_label = "cancel"

        set_fields = {
            "status": new_status.value,
            "updatedAt": now,
            "updatedBy": user_id,
        }
        await db[_DPI_COL].update_one(
            {"docId": doc_id, "organizationId": org_id},
            {"$set": set_fields},
        )

        await _write_audit(
            db,
            doc_id=doc_id,
            action=action_label,
            user_id=user_id,
            detail={
                "from": current_status.value,
                "to": new_status.value,
                "notes": request_body.notes,
            },
        )

    # Reload and return the updated DPI.
    updated_raw = await db[_DPI_COL].find_one({"docId": doc_id, "organizationId": org_id})
    if updated_raw is None:
        return None
    updated_raw.pop("_id", None)
    return _doc_to_response(updated_raw)
