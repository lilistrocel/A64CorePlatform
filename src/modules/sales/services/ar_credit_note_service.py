"""
Sales Module — AR Credit Note (ARC) Service Layer (T-100.11)

Business logic for the AR Credit Note document type.

Responsibilities
----------------
- Create an AR Credit Note in DRAFT status (standalone or return-driven).
- Retrieve a single Credit Note by doc_entry UUID.
- Paginated list with filters (status, customer_id, date range).
- Partial update (DRAFT only); replaces line/allocation sets wholesale.
- Hard-delete a DRAFT Credit Note.
- Status transitions with legal-transition guard:
  - DRAFT → OPEN: the primary financial reversal event.
    1. Validate sum(allocations.amount_applied) == totals.gross (within tolerance).
    2. For each allocation target AR Invoice:
       a. Validate AR Invoice: same org, same customer, status in {OPEN, PARTLY_CLOSED, CLOSED}.
       b. Validate amount does not exceed (gross - down_payment_applied - paid_amount - credited_amount).
       c. Atomically increment totals.creditedAmount on the AR Invoice.
       d. Recompute totals.openAmount = gross - down_payment_applied - paid_amount - credited_amount.
       e. Auto-transition AR Invoice: if open_amount <= 0 → CLOSED; else PARTLY_CLOSED.
       f. Push Credit Note back-pointer onto AR Invoice target_doc_refs.
    3. If return-driven (base_return_doc_ref set):
       a. Increment consumedQty on each matching Return line.
       b. Auto-close the Return if all lines are fully consumed.
    4. Emit credit_note_posted outbox event.
    5. Persist outbox_event_id on ARC header.
    6. Audit-log.
  - OPEN → CLOSED: terminal status flip only.
  - OPEN → CANCELLED (super_admin only):
    1. Reverse all AR Invoice credited_amount increments.
    2. Restore AR Invoice status (re-evaluate open_amount post-reversal).
    3. Reverse Return line consumedQty decrements (if return-driven).
    4. Reopen Return if it was auto-closed.
    5. Emit credit_note_cancelled event with original_event_id.
    6. Audit-log.
  - DRAFT → CANCELLED: status flip only; no side-effects.

UAE VAT tax-point rule
----------------------
tax_date = min(date_of_supply, invoice_date)

Two creation flows
------------------
1. Return-driven: base_return_doc_ref is set. The ARC is created after a posted Return.
   Lines reference Return lines via base_doc_ref.
2. Standalone: no base_return_doc_ref. Price adjustments, goodwill, overbilling.
   Lines reference AR Invoice lines directly.

Collections used
----------------
  ar_credit_notes_v2          — one document per ARC header + embedded lines + allocations
  ar_credit_notes_v2_audit    — append-only audit trail
  ar_invoices_v2              — target AR Invoice collection (credited_amount updates)
  returns_v2                  — source Return (consumedQty updates, auto-close)
  finance_outbox              — OutboxWriter destination
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

from ..models.ar_credit_notes import (
    ARCreditNoteCreate,
    ARCreditNoteListItem,
    ARCreditNoteResponse,
    ARCreditNoteStatusTransitionRequest,
    ARCreditNoteUpdate,
    CreditNoteAllocationCreate,
    CreditNoteAllocationResponse,
    CreditNoteLineCreate,
    CreditNoteLineResponse,
    CreditNoteTotals,
)

logger = logging.getLogger(__name__)

_ARC_COL = "ar_credit_notes_v2"
_AUDIT_COL = "ar_credit_notes_v2_audit"
_ARI_COL = "ar_invoices_v2"
_RTN_COL = "returns_v2"
_TOLERANCE = Decimal("0.005")
_TWOPLACES = Decimal("0.01")
_ZERO = Decimal("0")
_DOC_TYPE = "ARC"

# AR Invoice statuses that can accept a credit note allocation.
_CREDITABLE_STATUSES = {
    DocumentStatus.OPEN.value,
    DocumentStatus.PARTLY_CLOSED.value,
    DocumentStatus.CLOSED.value,
}


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
        d: A ``datetime.date`` (or ``datetime.datetime`` — the latter is
           returned unchanged since ``datetime`` is a subclass of ``date``).

    Returns:
        A UTC-aware ``datetime.datetime`` at midnight on the same calendar day.
    """
    if isinstance(d, datetime):
        # Reason: datetime is a subclass of date; if already datetime, return as-is
        # (ensure tz-aware).
        if d.tzinfo is None:
            return d.replace(tzinfo=timezone.utc)
        return d
    # Reason: combine with midnight time component and attach UTC timezone.
    return datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=timezone.utc)


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


def _compute_tax_date(date_of_supply: date, invoice_date: date) -> date:
    """
    Compute the UAE VAT tax-point date: min(date_of_supply, invoice_date).

    UAE VAT Article 25/26: the tax point is the earliest of the date of
    supply and the invoice date.  For Credit Notes the same rule applies —
    the credit reduces output VAT at the earlier of the two dates.

    Args:
        date_of_supply: The date goods/services were originally supplied.
        invoice_date:   The printed invoice / credit note date.

    Returns:
        Tax-point date used for VAT reporting.
    """
    # Reason: UAE VAT law requires the earlier date to be the tax point.
    return min(date_of_supply, invoice_date)


def _compute_line_amounts(
    *,
    quantity: Decimal,
    unit_price: Decimal,
    discount_percent: Decimal,
    tax_percent: Decimal,
) -> Dict[str, Decimal]:
    """
    Compute derived monetary amounts for a single Credit Note line.

    Args:
        quantity:         Credited quantity.
        unit_price:       Snapshotted selling price per unit.
        discount_percent: Line discount 0–100.
        tax_percent:      Tax rate 0–100.

    Returns:
        Dict with keys: line_net, line_tax, line_gross.
    """
    # Reason: apply discount to unit price before multiplying by quantity.
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
    line: CreditNoteLineCreate,
    *,
    line_number: int,
) -> Dict[str, Any]:
    """
    Build the embedded Credit Note line dict for MongoDB storage.

    Args:
        line:        Validated CreditNoteLineCreate input.
        line_number: 1-indexed position.

    Returns:
        Dict ready for embedding in the ARC header document.
    """
    line_id = str(uuid.uuid4())
    desc = line.description if line.description is not None else line.item_name
    amounts = _compute_line_amounts(
        quantity=line.credited_qty,
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
        "creditedQty": float(line.credited_qty),
        "uom": line.uom,
        "unitPrice": float(line.unit_price),
        "discountPercent": float(line.discount_percent),
        "lineNet": float(amounts["line_net"]),
        "taxCodeId": line.tax_code_id,
        "taxPercent": float(line.tax_percent),
        "lineTax": float(amounts["line_tax"]),
        "lineGross": float(amounts["line_gross"]),
        "revenueAccountId": line.revenue_account_id,
        "warehouseId": line.warehouse_id,
        "costCenterId": line.cost_center_id,
        "baseDocRef": base_ref_dict,
        "targetDocRefs": [],
    }


def _build_totals(lines: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Aggregate totals from embedded Credit Note line documents.

    Args:
        lines: List of embedded line dicts.

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


def _build_allocation_doc(
    alloc: CreditNoteAllocationCreate,
    *,
    allocation_line_number: int,
) -> Dict[str, Any]:
    """
    Build an embedded allocation dict for MongoDB storage.

    Args:
        alloc:                  Validated CreditNoteAllocationCreate input.
        allocation_line_number: 1-indexed position in the allocations list.

    Returns:
        Dict ready for embedding in the ARC header document.
    """
    return {
        "allocationLineNumber": allocation_line_number,
        "arInvoiceDocEntry": alloc.ar_invoice_doc_entry,
        "arInvoiceDocNumber": alloc.ar_invoice_doc_number,
        "amountApplied": float(alloc.amount_applied),
    }


def _raw_line_to_response(ln: Dict[str, Any]) -> CreditNoteLineResponse:
    """Convert a raw embedded Credit Note line dict to CreditNoteLineResponse."""
    return CreditNoteLineResponse(
        line_id=ln["lineId"],
        line_number=ln["lineNumber"],
        item_id=ln["itemId"],
        item_code=ln.get("itemCode", ""),
        item_name=ln.get("itemName", ""),
        description=ln.get("description", ""),
        credited_qty=Decimal(str(ln.get("creditedQty", 0))),
        uom=ln.get("uom", ""),
        unit_price=Decimal(str(ln.get("unitPrice", 0))),
        discount_percent=Decimal(str(ln.get("discountPercent", 0))),
        line_net=Decimal(str(ln.get("lineNet", 0))),
        tax_code_id=ln.get("taxCodeId"),
        tax_percent=Decimal(str(ln.get("taxPercent", 0))),
        line_tax=Decimal(str(ln.get("lineTax", 0))),
        line_gross=Decimal(str(ln.get("lineGross", 0))),
        revenue_account_id=ln.get("revenueAccountId", ""),
        warehouse_id=ln.get("warehouseId"),
        cost_center_id=ln.get("costCenterId"),
        base_doc_ref=_norm_ref(ln.get("baseDocRef")),
        target_doc_refs=_norm_refs(ln.get("targetDocRefs", [])),
    )


def _raw_allocation_to_response(alloc: Dict[str, Any]) -> CreditNoteAllocationResponse:
    """Convert a raw embedded allocation dict to CreditNoteAllocationResponse."""
    return CreditNoteAllocationResponse(
        allocation_line_number=alloc["allocationLineNumber"],
        ar_invoice_doc_entry=alloc["arInvoiceDocEntry"],
        ar_invoice_doc_number=alloc.get("arInvoiceDocNumber", ""),
        amount_applied=Decimal(str(alloc["amountApplied"])),
    )


def _raw_totals_to_model(raw_totals: Dict[str, Any]) -> CreditNoteTotals:
    """Convert raw MongoDB totals dict to CreditNoteTotals."""
    return CreditNoteTotals(
        net=Decimal(str(raw_totals.get("net", 0))),
        tax=Decimal(str(raw_totals.get("tax", 0))),
        gross=Decimal(str(raw_totals.get("gross", 0))),
    )


def _doc_to_response(raw: Dict[str, Any]) -> ARCreditNoteResponse:
    """Convert a raw MongoDB ar_credit_notes_v2 document to ARCreditNoteResponse."""
    lines = [_raw_line_to_response(ln) for ln in raw.get("lines", [])]
    allocations = [
        _raw_allocation_to_response(a) for a in raw.get("allocations", [])
    ]
    raw_totals = raw.get("totals", {})

    return ARCreditNoteResponse(
        doc_entry=raw["docEntry"],
        doc_number=raw["docNumber"],
        doc_type=raw.get("docType", _DOC_TYPE),
        organization_id=raw["organizationId"],
        company_code=raw["companyCode"],
        customer_id=raw["customerId"],
        customer_name=raw["customerName"],
        bp_ref_no=raw.get("bpRefNo"),
        doc_date=raw["docDate"],
        date_of_supply=raw["dateOfSupply"],
        invoice_date=raw["invoiceDate"],
        tax_date=raw["taxDate"],
        currency=raw.get("currency", "AED"),
        exchange_rate=Decimal(str(raw.get("exchangeRate", 1))),
        payment_terms_id=raw.get("paymentTermsId"),
        credit_reason=raw.get("creditReason", ""),
        credit_reason_text=raw.get("creditReasonText"),
        status=DocumentStatus(raw["status"]),
        totals=_raw_totals_to_model(raw_totals),
        base_return_doc_ref=_norm_ref(raw.get("baseReturnDocRef")),
        allocations=allocations,
        target_doc_refs=_norm_refs(raw.get("targetDocRefs", [])),
        outbox_event_id=raw.get("outboxEventId"),
        outbox_event_emitted_at=raw.get("outboxEventEmittedAt"),
        journal_memo=raw.get("journalMemo"),
        notes=raw.get("notes"),
        lines=lines,
        created_at=raw["createdAt"],
        created_by=raw["createdBy"],
        updated_at=raw["updatedAt"],
        updated_by=raw["updatedBy"],
    )


def _doc_to_list_item(raw: Dict[str, Any]) -> ARCreditNoteListItem:
    """Convert a raw MongoDB document to slim ARCreditNoteListItem."""
    raw_totals = raw.get("totals", {})
    return ARCreditNoteListItem(
        doc_entry=raw["docEntry"],
        doc_number=raw["docNumber"],
        organization_id=raw["organizationId"],
        customer_id=raw["customerId"],
        customer_name=raw["customerName"],
        doc_date=raw["docDate"],
        tax_date=raw["taxDate"],
        status=DocumentStatus(raw["status"]),
        totals=_raw_totals_to_model(raw_totals),
        base_return_doc_ref=_norm_ref(raw.get("baseReturnDocRef")),
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
    """Append an audit entry to ar_credit_notes_v2_audit."""
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
            "Audit write failed for AR Credit Note %s action=%s: %s",
            doc_entry,
            action,
            exc,
        )


async def _get_ari_open_creditable_amount(
    raw_ari: Dict[str, Any],
) -> Decimal:
    """
    Compute the amount on an AR Invoice that is still available for crediting.

    Formula: gross - down_payment_applied - paid_amount - credited_amount

    This is the ceiling for any single allocation's amount_applied.  Negative
    results are clamped to zero (shouldn't happen in normal flows but guards
    against concurrent edits).

    Args:
        raw_ari: Raw AR Invoice document from MongoDB.

    Returns:
        Available credit amount as Decimal (>= 0).
    """
    totals = raw_ari.get("totals", {})
    gross = Decimal(str(totals.get("gross", 0)))
    paid = Decimal(str(totals.get("paidAmount", 0)))
    down_payment = Decimal(str(totals.get("downPaymentApplied", 0)))
    credited = Decimal(str(totals.get("creditedAmount", 0)))
    available = gross - paid - down_payment - credited
    return max(available, _ZERO)


async def _determine_ari_status_after_credit(
    db: AsyncIOMotorDatabase,
    ari_doc_entry: str,
    org_id: str,
) -> DocumentStatus:
    """
    Determine what status an AR Invoice should have after a credit is applied.

    Reads the post-increment state from MongoDB.  If open_amount <= TOLERANCE
    the invoice is fully settled (by payments + credits); transition to CLOSED.
    Otherwise transition to PARTLY_CLOSED.

    Args:
        db:            Motor database instance.
        ari_doc_entry: UUID of the AR Invoice.
        org_id:        Organisation UUID for scoping.

    Returns:
        DocumentStatus.CLOSED or DocumentStatus.PARTLY_CLOSED.
    """
    ari_refreshed = await db[_ARI_COL].find_one(
        {"docEntry": ari_doc_entry, "organizationId": org_id}
    )
    if ari_refreshed is None:
        return DocumentStatus.PARTLY_CLOSED

    totals = ari_refreshed.get("totals", {})
    gross = Decimal(str(totals.get("gross", 0)))
    paid = Decimal(str(totals.get("paidAmount", 0)))
    down_payment = Decimal(str(totals.get("downPaymentApplied", 0)))
    credited = Decimal(str(totals.get("creditedAmount", 0)))
    open_amount = gross - paid - down_payment - credited

    if open_amount <= _TOLERANCE:
        return DocumentStatus.CLOSED
    return DocumentStatus.PARTLY_CLOSED


async def _determine_ari_status_after_credit_reversal(
    db: AsyncIOMotorDatabase,
    ari_doc_entry: str,
    org_id: str,
) -> DocumentStatus:
    """
    Determine what status an AR Invoice should revert to after Credit Note cancellation.

    After reversing the credited_amount, we re-evaluate the open_amount to
    determine whether the invoice should revert to OPEN or PARTLY_CLOSED.

    Args:
        db:            Motor database instance.
        ari_doc_entry: UUID of the AR Invoice.
        org_id:        Organisation UUID for scoping.

    Returns:
        DocumentStatus.OPEN if fully open, else DocumentStatus.PARTLY_CLOSED.
    """
    ari_refreshed = await db[_ARI_COL].find_one(
        {"docEntry": ari_doc_entry, "organizationId": org_id}
    )
    if ari_refreshed is None:
        return DocumentStatus.OPEN

    totals = ari_refreshed.get("totals", {})
    paid = Decimal(str(totals.get("paidAmount", 0)))
    credited = Decimal(str(totals.get("creditedAmount", 0)))

    # If both paid and credited are effectively zero, restore to OPEN.
    if paid <= _TOLERANCE and credited <= _TOLERANCE:
        return DocumentStatus.OPEN
    return DocumentStatus.PARTLY_CLOSED


def _build_outbox_payload(
    arc_raw: Dict[str, Any],
    *,
    event_type: str,
    original_event_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build the credit_note_posted or credit_note_cancelled outbox payload dict.

    The payload structure mirrors SalesInvoicePostedPayload but with 'credit'
    semantics — the finance handler posts the reversal JE:
        DR Revenue (per line.lineNet, per revenueAccountId)
        DR Output VAT (per line.lineTax)
        CR Accounts Receivable (totals.gross via AR control)

    Args:
        arc_raw:           Raw ARC header document (post-update state).
        event_type:        "credit_note_posted" or "credit_note_cancelled".
        original_event_id: For cancellation — event_id of the original
                           credit_note_posted event being reversed.

    Returns:
        Dict matching CreditNotePostedPayload or CreditNoteCancelledPayload contract.
    """

    def _date_str(val: Any) -> str:
        if val is None:
            return ""
        if hasattr(val, "strftime"):
            return val.strftime("%Y-%m-%d")
        return str(val)[:10]

    lines_payload = []
    for ln in sorted(arc_raw.get("lines", []), key=lambda x: x.get("lineNumber", 0)):
        lines_payload.append({
            "lineNumber": ln["lineNumber"],
            "itemId": ln["itemId"],
            "itemCode": ln.get("itemCode", ""),
            "creditedQty": str(ln.get("creditedQty", 0)),
            "unitPrice": str(ln.get("unitPrice", 0)),
            "lineNet": str(ln.get("lineNet", 0)),
            "taxCodeId": ln.get("taxCodeId"),
            "taxPercent": str(ln.get("taxPercent", 0)),
            "lineTax": str(ln.get("lineTax", 0)),
            "lineGross": str(ln.get("lineGross", 0)),
            "revenueAccountId": ln.get("revenueAccountId", ""),
            "costCenterId": ln.get("costCenterId"),
        })

    allocations_payload = []
    for alloc in sorted(
        arc_raw.get("allocations", []),
        key=lambda x: x.get("allocationLineNumber", 0),
    ):
        allocations_payload.append({
            "allocationLineNumber": alloc["allocationLineNumber"],
            "arInvoiceDocEntry": alloc["arInvoiceDocEntry"],
            "arInvoiceDocNumber": alloc.get("arInvoiceDocNumber", ""),
            "amountApplied": str(alloc.get("amountApplied", 0)),
        })

    base_return_ref = arc_raw.get("baseReturnDocRef") or {}
    totals = arc_raw.get("totals", {})

    payload: Dict[str, Any] = {
        "arcDocEntry": arc_raw["docEntry"],
        "arcDocNumber": arc_raw["docNumber"],
        "docDate": _date_str(arc_raw.get("docDate")),
        "taxDate": _date_str(arc_raw.get("taxDate")),
        "customerId": arc_raw.get("customerId", ""),
        "customerName": arc_raw.get("customerName", ""),
        "bpRefNo": arc_raw.get("bpRefNo"),
        "currency": arc_raw.get("currency", "AED"),
        "exchangeRate": str(arc_raw.get("exchangeRate", 1)),
        "creditReason": arc_raw.get("creditReason", ""),
        "baseReturnDocEntry": base_return_ref.get("docId") or base_return_ref.get("doc_id", ""),
        "baseReturnDocNumber": base_return_ref.get("docNumber") or base_return_ref.get("doc_number", ""),
        "totals": {
            "net": str(totals.get("net", 0)),
            "tax": str(totals.get("tax", 0)),
            "gross": str(totals.get("gross", 0)),
        },
        "lines": lines_payload,
        "allocations": allocations_payload,
    }

    if event_type == "credit_note_cancelled" and original_event_id:
        payload["originalEventId"] = original_event_id

    return payload


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def create_ar_credit_note(
    db: AsyncIOMotorDatabase,
    payload: ARCreditNoteCreate,
    org_id: str,
    user_id: str,
    auth_token: Optional[str] = None,
) -> ARCreditNoteResponse:
    """
    Create a new AR Credit Note in DRAFT status.

    Validates allocation targets at creation time (soft check) so operators
    know immediately if the target AR Invoice is wrong.  No AR Invoice
    credited_amount updates happen at DRAFT — those happen at DRAFT → OPEN.

    The credit note can be:
    - Return-driven: base_return_doc_ref points to an OPEN Return Note.
    - Standalone: no Return reference; price adjustment / goodwill credit.

    Sequence:
    1. Soft-validate each allocation target (existence, customer, status).
    1b. isStock gate (standalone path only): reject stock items.
    2. Build embedded line and allocation docs.
    3. Generate doc_number = "ARC-YYYY-NNNN".
    4. Compute tax_date = min(date_of_supply, invoice_date).
    5. Persist in DRAFT status.
    6. Audit-log.

    Args:
        db:         Motor database instance.
        payload:    Validated ARCreditNoteCreate payload.
        org_id:     Organisation UUID for scoping.
        user_id:    Authenticated user creating the Credit Note.
        auth_token: Bearer token forwarded to the finance microservice for
                    isStock lookups on standalone Credit Notes.

    Returns:
        ARCreditNoteResponse for the newly-created DRAFT AR Credit Note.

    Raises:
        ValueError: If any allocation target fails soft validation, or if any
                    line contains a stock item on a standalone (direct) Credit Note.
    """
    # Step 1: Soft-validate allocation targets.
    for alloc in payload.allocations:
        ari_raw = await db[_ARI_COL].find_one(
            {"docEntry": alloc.ar_invoice_doc_entry, "organizationId": org_id}
        )
        if ari_raw is None:
            raise ValueError(
                f"AR Invoice '{alloc.ar_invoice_doc_entry}' not found in "
                f"organisation '{org_id}'"
            )
        if ari_raw.get("customerId") != payload.customer_id:
            raise ValueError(
                f"AR Invoice '{alloc.ar_invoice_doc_entry}' belongs to customer "
                f"'{ari_raw.get('customerId')}', not '{payload.customer_id}'. "
                "Credit Note customer must match the target AR Invoice."
            )
        if ari_raw.get("status") not in _CREDITABLE_STATUSES:
            raise ValueError(
                f"AR Invoice '{alloc.ar_invoice_doc_entry}' is in status "
                f"'{ari_raw.get('status')}'. Must be 'open', 'partly_closed', "
                "or 'closed' to accept a credit note."
            )

    # Step 1b (direct path only): isStock gate — reject stock items on standalone
    # Credit Notes.  Return-driven Credit Notes are exempted because the source
    # Return has already validated the item through the Delivery chain.
    # Reason: crediting a stock item directly bypasses inventory and COGS reversal;
    # the correct path is Return Note → AR Credit Note (from-Return).
    if payload.base_return_doc_ref is None:
        for line in payload.lines:
            ext = await _get_item_finance_ext(line.item_id, org_id, auth_token)
            if ext.get("isStock", True):
                raise ValueError(
                    f"Item '{line.item_name}' is a stock item and cannot be credited "
                    "directly. Create a Return first, then credit from the Return."
                )

    # Step 2: Build line and allocation docs.
    computed_lines: List[Dict[str, Any]] = []
    for i, line in enumerate(payload.lines, start=1):
        line_doc = _build_line_doc(line, line_number=i)
        computed_lines.append(line_doc)

    allocation_docs: List[Dict[str, Any]] = []
    for i, alloc in enumerate(payload.allocations, start=1):
        allocation_docs.append(_build_allocation_doc(alloc, allocation_line_number=i))

    totals = _build_totals(computed_lines)

    # Step 3: Generate doc_number.
    doc_entry = str(uuid.uuid4())
    doc_number = await next_doc_number(
        db,
        doc_type=_DOC_TYPE,
        org_id=org_id,
        company_code=payload.company_code,
    )

    # Step 4: Compute tax_date.
    tax_date = _compute_tax_date(payload.date_of_supply, payload.invoice_date)

    # Reason: PyMongo cannot encode bare datetime.date — convert all date fields to
    # datetime.datetime at midnight UTC before any MongoDB write.
    doc_date_dt = _to_dt(payload.doc_date)
    date_of_supply_dt = _to_dt(payload.date_of_supply)
    invoice_date_dt = _to_dt(payload.invoice_date)
    tax_date_dt = _to_dt(tax_date)

    now = _now()

    # Normalise base_return_doc_ref to a dict for MongoDB.
    base_return_ref_dict: Optional[Dict[str, Any]] = None
    if payload.base_return_doc_ref is not None:
        if hasattr(payload.base_return_doc_ref, "model_dump"):
            base_return_ref_dict = payload.base_return_doc_ref.model_dump()
        elif isinstance(payload.base_return_doc_ref, dict):
            base_return_ref_dict = payload.base_return_doc_ref
        else:
            base_return_ref_dict = dict(payload.base_return_doc_ref)

    # Step 5: Persist in DRAFT status.
    # Reason: all date fields use _dt variants (datetime.datetime) — PyMongo cannot
    # encode bare datetime.date objects.
    doc: Dict[str, Any] = {
        "docEntry": doc_entry,
        "docNumber": doc_number,
        "docType": _DOC_TYPE,
        "organizationId": org_id,
        "companyCode": payload.company_code,
        "customerId": payload.customer_id,
        "customerName": payload.customer_name,
        "bpRefNo": payload.bp_ref_no,
        "docDate": doc_date_dt,
        "dateOfSupply": date_of_supply_dt,
        "invoiceDate": invoice_date_dt,
        "taxDate": tax_date_dt,
        "currency": payload.currency,
        "exchangeRate": float(payload.exchange_rate),
        "paymentTermsId": payload.payment_terms_id,
        "creditReason": payload.credit_reason,
        "creditReasonText": payload.credit_reason_text,
        "status": DocumentStatus.DRAFT.value,
        "totals": totals,
        "baseReturnDocRef": base_return_ref_dict,
        "allocations": allocation_docs,
        "targetDocRefs": [],
        "outboxEventId": None,
        "outboxEventEmittedAt": None,
        "journalMemo": payload.journal_memo,
        "notes": payload.notes,
        "lines": computed_lines,
        "createdAt": now,
        "createdBy": user_id,
        "updatedAt": now,
        "updatedBy": user_id,
    }

    await db[_ARC_COL].insert_one(doc)

    # Step 6: Audit.
    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="create",
        user_id=user_id,
        detail={
            "customerId": payload.customer_id,
            "creditReason": payload.credit_reason,
            "lineCount": len(computed_lines),
            "allocationCount": len(allocation_docs),
            "totalGross": totals["gross"],
        },
    )

    doc.pop("_id", None)
    return _doc_to_response(doc)


async def get_ar_credit_note(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    org_id: str,
) -> Optional[ARCreditNoteResponse]:
    """
    Retrieve a single AR Credit Note by its doc_entry UUID.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the AR Credit Note.
        org_id:    Organisation UUID for scoping.

    Returns:
        ARCreditNoteResponse if found, None otherwise.
    """
    raw = await db[_ARC_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return None
    raw.pop("_id", None)
    return _doc_to_response(raw)


async def list_ar_credit_notes(
    db: AsyncIOMotorDatabase,
    org_id: str,
    *,
    customer_id: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    """
    Paginated list of AR Credit Notes for an organisation.

    Args:
        db:          Motor database instance.
        org_id:      Organisation UUID for scoping.
        customer_id: Optional filter by customer UUID.
        status:      Optional filter by status string.
        date_from:   Optional filter by doc_date >= date_from.
        date_to:     Optional filter by doc_date <= date_to.
        page:        1-indexed page number.
        page_size:   Maximum items per page.

    Returns:
        Dict with keys: items, total, page, page_size, total_pages.
    """
    query: Dict[str, Any] = {"organizationId": org_id}

    if customer_id:
        query["customerId"] = customer_id
    if status:
        query["status"] = status
    if date_from or date_to:
        date_filter: Dict[str, Any] = {}
        if date_from:
            date_filter["$gte"] = date_from
        if date_to:
            date_filter["$lte"] = date_to
        query["docDate"] = date_filter

    total = await db[_ARC_COL].count_documents(query)
    skip = (page - 1) * page_size

    cursor = (
        db[_ARC_COL]
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


async def update_ar_credit_note(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    payload: ARCreditNoteUpdate,
    org_id: str,
    user_id: str,
    auth_token: Optional[str] = None,
) -> Optional[ARCreditNoteResponse]:
    """
    Partially update a DRAFT AR Credit Note.

    If payload.lines is supplied, replaces the line set wholesale.
    If payload.allocations is supplied, replaces the allocation set wholesale.
    Only DRAFT Credit Notes may be updated.

    Args:
        db:         Motor database instance.
        doc_entry:  UUID of the AR Credit Note.
        payload:    Validated ARCreditNoteUpdate payload.
        org_id:     Organisation UUID for scoping.
        user_id:    Authenticated user performing the update.
        auth_token: Bearer token forwarded to the finance microservice for
                    isStock lookups on standalone Credit Notes.

    Returns:
        Updated ARCreditNoteResponse, or None if not found.

    Raises:
        ValueError: If the Credit Note is not in DRAFT status, or if any new
                    line is a stock item on a standalone (direct) Credit Note.
    """
    raw = await db[_ARC_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return None

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"AR Credit Note '{doc_entry}' cannot be updated: "
            f"status is '{raw['status']}' (only DRAFT Credit Notes may be edited)"
        )

    updates: Dict[str, Any] = {"updatedAt": _now(), "updatedBy": user_id}

    field_map = {
        "bpRefNo": payload.bp_ref_no,
        # Reason: date fields are converted via _to_dt to datetime.datetime before
        # writing — PyMongo cannot encode bare datetime.date objects.
        "docDate": _to_dt(payload.doc_date) if payload.doc_date is not None else None,
        "dateOfSupply": _to_dt(payload.date_of_supply) if payload.date_of_supply is not None else None,
        "invoiceDate": _to_dt(payload.invoice_date) if payload.invoice_date is not None else None,
        "currency": payload.currency,
        "exchangeRate": float(payload.exchange_rate) if payload.exchange_rate is not None else None,
        "creditReason": payload.credit_reason,
        "creditReasonText": payload.credit_reason_text,
        "journalMemo": payload.journal_memo,
        "notes": payload.notes,
    }
    for db_key, value in field_map.items():
        if value is not None:
            updates[db_key] = value

    # Re-compute tax_date if either date changed.
    effective_date_of_supply = payload.date_of_supply or raw.get("dateOfSupply")
    effective_invoice_date = payload.invoice_date or raw.get("invoiceDate")
    if payload.date_of_supply is not None or payload.invoice_date is not None:
        # Reason: effective dates may be datetime (from Mongo) or date (from payload);
        # normalise both to date before _compute_tax_date, then convert result to datetime.
        eff_dos = effective_date_of_supply
        eff_inv = effective_invoice_date
        if isinstance(eff_dos, datetime):
            eff_dos = eff_dos.date()
        if isinstance(eff_inv, datetime):
            eff_inv = eff_inv.date()
        updates["taxDate"] = _to_dt(_compute_tax_date(eff_dos, eff_inv))

    if payload.lines is not None:
        # isStock gate for standalone (direct) Credit Notes.
        # Reason: Return-driven Credit Notes already validated items via the Return
        # chain; standalone Credit Notes must not bypass COGS reversal.
        _update_base_return_ref = raw.get("baseReturnDocRef")
        _update_is_direct = not bool(
            _update_base_return_ref
            and (
                _update_base_return_ref.get("docId")
                or _update_base_return_ref.get("doc_id")
            )
        )
        if _update_is_direct:
            for line in payload.lines:
                ext = await _get_item_finance_ext(line.item_id, org_id, auth_token)
                if ext.get("isStock", True):
                    raise ValueError(
                        f"Item '{line.item_name}' is a stock item and cannot be "
                        "credited directly. Create a Return first, then credit "
                        "from the Return."
                    )

        new_lines: List[Dict[str, Any]] = []
        for i, line in enumerate(payload.lines, start=1):
            new_lines.append(_build_line_doc(line, line_number=i))
        updates["lines"] = new_lines
        updates["totals"] = _build_totals(new_lines)

    if payload.allocations is not None:
        new_allocs: List[Dict[str, Any]] = []
        for i, alloc in enumerate(payload.allocations, start=1):
            new_allocs.append(_build_allocation_doc(alloc, allocation_line_number=i))
        updates["allocations"] = new_allocs

    await db[_ARC_COL].update_one(
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

    updated_raw = await db[_ARC_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if updated_raw is None:
        return None
    updated_raw.pop("_id", None)
    return _doc_to_response(updated_raw)


async def delete_ar_credit_note(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    org_id: str,
    user_id: str,
) -> bool:
    """
    Hard-delete a DRAFT AR Credit Note.

    Only DRAFT Credit Notes may be deleted.  No AR Invoice side-effects
    are needed because DRAFT Credit Notes have not yet modified credited_amount.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the AR Credit Note.
        org_id:    Organisation UUID for scoping.
        user_id:   Authenticated user performing the deletion.

    Returns:
        True if deleted, False if not found.

    Raises:
        ValueError: If the Credit Note is not in DRAFT status.
    """
    raw = await db[_ARC_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return False

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"AR Credit Note '{doc_entry}' cannot be deleted: "
            f"status is '{raw['status']}' (only DRAFT Credit Notes may be deleted)"
        )

    # Reason: write audit BEFORE delete so the trail survives deletion.
    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="delete",
        user_id=user_id,
        detail={"docNumber": raw.get("docNumber")},
    )

    await db[_ARC_COL].delete_one({"docEntry": doc_entry, "organizationId": org_id})
    return True


async def transition_status(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    request_body: ARCreditNoteStatusTransitionRequest,
    org_id: str,
    user_id: str,
    auth_token: Optional[str] = None,
) -> Optional[ARCreditNoteResponse]:
    """
    Transition an AR Credit Note to a new status.

    Uses assert_legal_transition("ARC", ...) as the primary state-machine
    gatekeeper, with a special case for OPEN → CANCELLED.

    DRAFT → OPEN (the financial reversal event):
      1. Validate sum(allocations.amount_applied) == totals.gross (within tolerance).
      2. For each allocation target AR Invoice:
         a. Validate: same org, same customer, creditable status.
         b. Validate: amount_applied <= available creditable amount.
         c. Atomically $inc totals.creditedAmount by amount_applied.
         d. Atomically $set totals.openAmount to the recomputed value.
         e. Auto-transition AR Invoice to CLOSED or PARTLY_CLOSED.
         f. Push Credit Note back-pointer onto AR Invoice target_doc_refs.
      3. If return-driven (baseReturnDocRef set):
         a. For each ARC line that has a Return line base_doc_ref:
            - $inc Return line consumedQty by credited_qty.
         b. Reload Return; if all lines fully consumed → transition Return to CLOSED.
      4. Emit credit_note_posted outbox event.
      5. Persist outbox_event_id on ARC header.
      6. Audit-log.

    OPEN → CLOSED:
      Terminal status flip only.

    OPEN → CANCELLED (super_admin override):
      1. Reverse AR Invoice credited_amount increments (per allocation).
      2. Restore AR Invoice status (OPEN if fully open, PARTLY_CLOSED otherwise).
      3. If return-driven: decrement Return line consumedQty; reopen Return if needed.
      4. Emit credit_note_cancelled event.
      5. Audit-log.

    DRAFT → CANCELLED:
      Status flip only; no AR Invoice side-effects.

    Args:
        db:           Motor database instance.
        doc_entry:    UUID of the AR Credit Note.
        request_body: Transition request with new_status and optional reason.
        org_id:       Organisation UUID for scoping.
        user_id:      Authenticated user performing the transition.

    Returns:
        Updated ARCreditNoteResponse, or None if not found.

    Raises:
        ValueError: If the transition is illegal or validation fails.
    """
    raw = await db[_ARC_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return None

    current_status = DocumentStatus(raw["status"])
    new_status = request_body.new_status
    now = _now()

    # Special case: OPEN → CANCELLED is not in LEGAL_TRANSITIONS (intentionally).
    # It requires super_admin and is a full financial reversal.
    is_open_to_cancelled = (
        current_status == DocumentStatus.OPEN
        and new_status == DocumentStatus.CANCELLED
    )

    if not is_open_to_cancelled:
        # Reason: assert_legal_transition raises ValueError for illegal transitions.
        assert_legal_transition(_DOC_TYPE, current_status, new_status)

    # -----------------------------------------------------------------------
    # DRAFT → OPEN: the primary financial reversal event
    # -----------------------------------------------------------------------
    if current_status == DocumentStatus.DRAFT and new_status == DocumentStatus.OPEN:
        allocations = raw.get("allocations", [])
        arc_lines = raw.get("lines", [])
        totals = raw.get("totals", {})

        # Step 0b: Re-validate isStock for standalone (direct) Credit Notes.
        # Reason: an admin may have reclassified an item from service to stock while
        # this ARC sat in DRAFT.  Re-check before posting to prevent COGS gaps.
        # Return-driven Credit Notes are exempt (validated at Return chain time).
        _transition_base_return_ref = raw.get("baseReturnDocRef")
        _transition_is_direct = not bool(
            _transition_base_return_ref
            and (
                _transition_base_return_ref.get("docId")
                or _transition_base_return_ref.get("doc_id")
            )
        )
        if _transition_is_direct:
            for arc_ln in arc_lines:
                item_id_ln = arc_ln.get("itemId", "")
                item_name_ln = arc_ln.get("itemName", item_id_ln)
                try:
                    ext_ln = await _get_item_finance_ext(item_id_ln, org_id, auth_token)
                except ValueError:
                    ext_ln = None
                # Reason: if finance ext fetch fails we skip isStock block (fail-open)
                # to avoid blocking posting due to finance service downtime.
                # The isStock check is a safeguard, not a hard accounting control here.
                if ext_ln is not None and ext_ln.get("isStock", True):
                    raise ValueError(
                        f"Cannot post AR Credit Note '{doc_entry}': item '{item_name_ln}' "
                        "is now classified as a stock item. Create a Return first, "
                        "then credit from the Return."
                    )

        # Step 1: Validate allocation sum == totals.gross.
        total_allocated = sum(
            Decimal(str(a.get("amountApplied", 0))) for a in allocations
        )
        arc_gross = Decimal(str(totals.get("gross", 0)))
        if abs(total_allocated - arc_gross) > _TOLERANCE:
            raise ValueError(
                f"Allocation sum ({total_allocated}) does not match "
                f"Credit Note gross ({arc_gross}). "
                "Every credit dirham must be allocated to an AR Invoice."
            )

        # Step 2: Validate each target AR Invoice and collect credit amounts.
        for alloc in allocations:
            ari_doc_entry = alloc["arInvoiceDocEntry"]
            amount_applied = Decimal(str(alloc.get("amountApplied", 0)))

            ari_raw = await db[_ARI_COL].find_one(
                {"docEntry": ari_doc_entry, "organizationId": org_id}
            )
            if ari_raw is None:
                raise ValueError(
                    f"AR Invoice '{ari_doc_entry}' not found in organisation '{org_id}'. "
                    "Cannot post Credit Note with invalid allocation target."
                )
            if ari_raw.get("customerId") != raw.get("customerId"):
                raise ValueError(
                    f"AR Invoice '{ari_doc_entry}' belongs to customer "
                    f"'{ari_raw.get('customerId')}', not '{raw.get('customerId')}'. "
                    "Credit Note customer must match all allocation targets."
                )
            if ari_raw.get("status") not in _CREDITABLE_STATUSES:
                raise ValueError(
                    f"AR Invoice '{ari_doc_entry}' is in status '{ari_raw.get('status')}'. "
                    "Must be 'open', 'partly_closed', or 'closed' to accept a credit."
                )

            available = await _get_ari_open_creditable_amount(ari_raw)
            if amount_applied > available + _TOLERANCE:
                raise ValueError(
                    f"Credit amount {float(amount_applied):.2f} for AR Invoice "
                    f"'{ari_doc_entry}' exceeds available creditable amount "
                    f"{float(available):.2f}. "
                    "(available = gross - down_payment - paid - credited)"
                )

        # Step 2c–f: Apply each allocation atomically.
        for alloc in allocations:
            ari_doc_entry = alloc["arInvoiceDocEntry"]
            amount_applied = float(Decimal(str(alloc.get("amountApplied", 0))))

            # Step 2c: Atomically increment creditedAmount.
            await db[_ARI_COL].update_one(
                {"docEntry": ari_doc_entry, "organizationId": org_id},
                {
                    "$inc": {"totals.creditedAmount": amount_applied},
                    "$set": {"updatedAt": now, "updatedBy": user_id},
                },
            )

            # Step 2d: Recompute openAmount = gross - down_payment - paid - credited.
            # We fetch the fresh state after the $inc to get correct values.
            ari_post_inc = await db[_ARI_COL].find_one(
                {"docEntry": ari_doc_entry, "organizationId": org_id}
            )
            if ari_post_inc is not None:
                post_totals = ari_post_inc.get("totals", {})
                post_gross = float(Decimal(str(post_totals.get("gross", 0))))
                post_paid = float(Decimal(str(post_totals.get("paidAmount", 0))))
                post_down = float(Decimal(str(post_totals.get("downPaymentApplied", 0))))
                post_credited = float(Decimal(str(post_totals.get("creditedAmount", 0))))
                new_open_amount = max(0.0, post_gross - post_paid - post_down - post_credited)
                await db[_ARI_COL].update_one(
                    {"docEntry": ari_doc_entry, "organizationId": org_id},
                    {"$set": {"totals.openAmount": new_open_amount, "updatedAt": now}},
                )

            # Step 2e: Auto-transition AR Invoice status.
            new_ari_status = await _determine_ari_status_after_credit(
                db, ari_doc_entry, org_id
            )
            await db[_ARI_COL].update_one(
                {"docEntry": ari_doc_entry, "organizationId": org_id},
                {
                    "$set": {
                        "status": new_ari_status.value,
                        "updatedAt": now,
                        "updatedBy": user_id,
                    }
                },
            )

            # Step 2f: Push Credit Note back-pointer onto AR Invoice target_doc_refs.
            arc_ref = {
                "docType": _DOC_TYPE,
                "docId": doc_entry,
                "docNumber": raw.get("docNumber", ""),
                "lineId": None,
            }
            await db[_ARI_COL].update_one(
                {"docEntry": ari_doc_entry, "organizationId": org_id},
                {"$push": {"targetDocRefs": arc_ref}},
            )

            logger.info(
                "[ARCreditNoteService] OPEN-transition: AR Invoice %s creditedAmount +%.2f → %s",
                ari_doc_entry,
                amount_applied,
                new_ari_status.value,
            )

        # Step 3: If return-driven, increment Return line consumedQty per ARC line.
        base_return_ref = raw.get("baseReturnDocRef")
        if base_return_ref:
            rtn_doc_entry = (
                base_return_ref.get("docId") or base_return_ref.get("doc_id")
            )
            if rtn_doc_entry:
                for arc_line in arc_lines:
                    arc_base = arc_line.get("baseDocRef") or {}
                    rtn_line_id = arc_base.get("lineId") or arc_base.get("line_id")
                    src_doc_type = arc_base.get("docType") or arc_base.get("doc_type", "")

                    # Only increment consumedQty on Return lines (not direct invoice refs).
                    if rtn_line_id and src_doc_type.upper() in {"RTN", "RETURN"}:
                        credited_qty_val = float(
                            Decimal(str(arc_line.get("creditedQty", 0)))
                        )
                        await db[_RTN_COL].update_one(
                            {
                                "docEntry": rtn_doc_entry,
                                "organizationId": org_id,
                                "lines.lineId": rtn_line_id,
                            },
                            {
                                "$inc": {"lines.$.consumedQty": credited_qty_val},
                                "$set": {"updatedAt": now, "updatedBy": user_id},
                            },
                        )

                # Auto-close the Return if all lines are fully consumed.
                rtn_refreshed = await db[_RTN_COL].find_one(
                    {"docEntry": rtn_doc_entry, "organizationId": org_id}
                )
                if rtn_refreshed is not None:
                    rtn_status = DocumentStatus(rtn_refreshed.get("status", "draft"))
                    if rtn_status == DocumentStatus.OPEN:
                        rtn_lines = rtn_refreshed.get("lines", [])
                        all_consumed = all(
                            Decimal(str(ln.get("consumedQty", 0)))
                            >= Decimal(str(ln.get("orderedQty", ln.get("returnedQty", 0))))
                            - _TOLERANCE
                            for ln in rtn_lines
                        )
                        if all_consumed:
                            await db[_RTN_COL].update_one(
                                {"docEntry": rtn_doc_entry, "organizationId": org_id},
                                {
                                    "$set": {
                                        "status": DocumentStatus.CLOSED.value,
                                        "updatedAt": now,
                                        "updatedBy": user_id,
                                    }
                                },
                            )
                            logger.info(
                                "[ARCreditNoteService] Return '%s' auto-closed "
                                "(all lines consumed by Credit Notes).",
                                rtn_doc_entry,
                            )

                    # Push ARC back-pointer onto Return targetDocRefs.
                    arc_rtn_ref = {
                        "docType": _DOC_TYPE,
                        "docId": doc_entry,
                        "docNumber": raw.get("docNumber", ""),
                        "lineId": None,
                    }
                    await db[_RTN_COL].update_one(
                        {"docEntry": rtn_doc_entry, "organizationId": org_id},
                        {"$push": {"targetDocRefs": arc_rtn_ref}},
                    )

        # Step 4: Emit credit_note_posted outbox event.
        event_payload = _build_outbox_payload(raw, event_type="credit_note_posted")
        emitted_event_id: Optional[str] = None

        try:
            from src.modules.finance_bridge.outbox_writer import OutboxWriter  # noqa: PLC0415

            emitted_event_id = await OutboxWriter.publish(
                db=db,
                event_type="credit_note_posted",
                organization_id=org_id,
                company_code=raw.get("companyCode", "1000"),
                payload=event_payload,
                source_user_id=user_id,
                source_document_id=doc_entry,
            )
        except Exception as exc:  # noqa: BLE001
            # Reason: outbox failure is logged but must not block the status update.
            # The outbox reconciler sweeper will retry.
            logger.error(
                "[ARCreditNoteService] Failed to emit credit_note_posted for '%s': %s",
                doc_entry,
                exc,
            )

        # Step 5: Persist new status + outbox audit fields.
        set_fields: Dict[str, Any] = {
            "status": new_status.value,
            "outboxEventId": str(emitted_event_id) if emitted_event_id else None,
            "outboxEventEmittedAt": now if emitted_event_id else None,
            "updatedAt": now,
            "updatedBy": user_id,
        }
        await db[_ARC_COL].update_one(
            {"docEntry": doc_entry, "organizationId": org_id},
            {"$set": set_fields},
        )

        # Step 6: Audit.
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
                "affectedArInvoices": [
                    a.get("arInvoiceDocEntry") for a in allocations
                ],
            },
        )

    # -----------------------------------------------------------------------
    # OPEN → CANCELLED: reverse the posted credit note
    # -----------------------------------------------------------------------
    elif is_open_to_cancelled:
        allocations = raw.get("allocations", [])
        arc_lines = raw.get("lines", [])
        original_event_id = raw.get("outboxEventId")

        # Step 1: Reverse AR Invoice credited_amount for each allocation.
        for alloc in allocations:
            ari_doc_entry = alloc["arInvoiceDocEntry"]
            amount_applied = float(Decimal(str(alloc.get("amountApplied", 0))))

            await db[_ARI_COL].update_one(
                {"docEntry": ari_doc_entry, "organizationId": org_id},
                {
                    "$inc": {"totals.creditedAmount": -amount_applied},
                    "$set": {"updatedAt": now, "updatedBy": user_id},
                },
            )

            # Recompute openAmount after reversal.
            ari_post_dec = await db[_ARI_COL].find_one(
                {"docEntry": ari_doc_entry, "organizationId": org_id}
            )
            if ari_post_dec is not None:
                post_totals = ari_post_dec.get("totals", {})
                post_gross = float(Decimal(str(post_totals.get("gross", 0))))
                post_paid = float(Decimal(str(post_totals.get("paidAmount", 0))))
                post_down = float(Decimal(str(post_totals.get("downPaymentApplied", 0))))
                post_credited = float(Decimal(str(post_totals.get("creditedAmount", 0))))
                restored_open = max(0.0, post_gross - post_paid - post_down - post_credited)
                await db[_ARI_COL].update_one(
                    {"docEntry": ari_doc_entry, "organizationId": org_id},
                    {"$set": {"totals.openAmount": restored_open, "updatedAt": now}},
                )

            # Step 2: Restore AR Invoice status.
            restored_ari_status = await _determine_ari_status_after_credit_reversal(
                db, ari_doc_entry, org_id
            )
            await db[_ARI_COL].update_one(
                {"docEntry": ari_doc_entry, "organizationId": org_id},
                {
                    "$set": {
                        "status": restored_ari_status.value,
                        "updatedAt": now,
                        "updatedBy": user_id,
                    }
                },
            )

            logger.info(
                "[ARCreditNoteService] CANCEL: AR Invoice %s creditedAmount -%.2f → %s",
                ari_doc_entry,
                amount_applied,
                restored_ari_status.value,
            )

        # Step 3: If return-driven, decrement Return line consumedQty.
        base_return_ref = raw.get("baseReturnDocRef")
        if base_return_ref:
            rtn_doc_entry = (
                base_return_ref.get("docId") or base_return_ref.get("doc_id")
            )
            if rtn_doc_entry:
                for arc_line in arc_lines:
                    arc_base = arc_line.get("baseDocRef") or {}
                    rtn_line_id = arc_base.get("lineId") or arc_base.get("line_id")
                    src_doc_type = arc_base.get("docType") or arc_base.get("doc_type", "")

                    if rtn_line_id and src_doc_type.upper() in {"RTN", "RETURN"}:
                        credited_qty_val = float(
                            Decimal(str(arc_line.get("creditedQty", 0)))
                        )
                        await db[_RTN_COL].update_one(
                            {
                                "docEntry": rtn_doc_entry,
                                "organizationId": org_id,
                                "lines.lineId": rtn_line_id,
                            },
                            {
                                "$inc": {"lines.$.consumedQty": -credited_qty_val},
                                "$set": {"updatedAt": now, "updatedBy": user_id},
                            },
                        )

                # If Return was auto-closed, reopen it.
                rtn_refreshed = await db[_RTN_COL].find_one(
                    {"docEntry": rtn_doc_entry, "organizationId": org_id}
                )
                if rtn_refreshed is not None:
                    rtn_status = DocumentStatus(rtn_refreshed.get("status", "draft"))
                    if rtn_status == DocumentStatus.CLOSED:
                        # Return was auto-closed by this Credit Note; reopen it.
                        await db[_RTN_COL].update_one(
                            {"docEntry": rtn_doc_entry, "organizationId": org_id},
                            {
                                "$set": {
                                    "status": DocumentStatus.OPEN.value,
                                    "updatedAt": now,
                                    "updatedBy": user_id,
                                }
                            },
                        )
                        logger.info(
                            "[ARCreditNoteService] Return '%s' reopened after "
                            "Credit Note cancellation.",
                            rtn_doc_entry,
                        )

        # Step 4: Emit credit_note_cancelled event.
        cancel_payload = _build_outbox_payload(
            raw,
            event_type="credit_note_cancelled",
            original_event_id=original_event_id,
        )
        cancelled_event_id: Optional[str] = None

        try:
            from src.modules.finance_bridge.outbox_writer import OutboxWriter  # noqa: PLC0415

            cancelled_event_id = await OutboxWriter.publish(
                db=db,
                event_type="credit_note_cancelled",
                organization_id=org_id,
                company_code=raw.get("companyCode", "1000"),
                payload=cancel_payload,
                source_user_id=user_id,
                source_document_id=doc_entry,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "[ARCreditNoteService] Failed to emit credit_note_cancelled for '%s': %s",
                doc_entry,
                exc,
            )

        set_fields = {
            "status": new_status.value,
            "updatedAt": now,
            "updatedBy": user_id,
        }
        await db[_ARC_COL].update_one(
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
                "cancelledOutboxEventId": (
                    str(cancelled_event_id) if cancelled_event_id else None
                ),
                "originalOutboxEventId": original_event_id,
            },
        )

    # -----------------------------------------------------------------------
    # All other transitions: status flip only (CLOSED, DRAFT → CANCELLED)
    # -----------------------------------------------------------------------
    else:
        set_fields = {
            "status": new_status.value,
            "updatedAt": now,
            "updatedBy": user_id,
        }
        await db[_ARC_COL].update_one(
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

    # Reload and return the updated AR Credit Note.
    updated_raw = await db[_ARC_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if updated_raw is None:
        return None
    updated_raw.pop("_id", None)
    return _doc_to_response(updated_raw)
