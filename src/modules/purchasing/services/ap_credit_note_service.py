"""
Purchasing Module — AP Credit Note (ACN) Service Layer (T-200.23 / Wave 4)

Mirror of sales' ar_credit_note_service for the purchasing side.
Vendor billing corrections, vendor refunds, post-AP discounts, bad-debt write-offs.

Responsibilities
----------------
- Create an AP Credit Note in DRAFT status (direct or from-AP-Invoice).
- Retrieve a single AP Credit Note by doc_id UUID.
- Paginated list with filters (status, vendor_id, date range).
- Partial update (DRAFT only); replaces line set wholesale.
- Hard-delete a DRAFT AP Credit Note.
- Status transitions with legal-transition guard:
  - DRAFT → PENDING_APPROVAL: submit for approval.
  - PENDING_APPROVAL → OPEN (approval): the primary financial reversal event.
    1. For each ACN line that references a source AP Invoice line:
       a. $inc AP Invoice line creditedQty by the ACN line quantity.
       b. $inc AP Invoice header creditedAmount by the ACN line's lineGross.
    2. Auto-close the source AP Invoice if creditedAmount >= totalGross.
    3. Push ACN back-pointer onto AP Invoice targetDocRefs.
    4. Emit ap_credit_note_posted outbox event.
  - PENDING_APPROVAL → DRAFT (rejection / withdraw): no AP-side impact.
  - OPEN → CLOSED: terminal status flip only.

Collections used
----------------
  ap_invoices_v2             — source AP Invoice (creditedAmount / line creditedQty updates)
  ap_credit_notes_v2         — one document per ACN header + embedded lines
  ap_credit_notes_v2_audit   — append-only audit trail
  finance_outbox             — OutboxWriter destination

Lifecycle (AP_CREDIT in document_status.py)
-------------------------------------------
  DRAFT → PENDING_APPROVAL → OPEN → CLOSED
  PENDING_APPROVAL → DRAFT  (rejection / withdraw path)

Creation paths
--------------
1. Direct-create: base_invoice_doc_ref is None.
   - Used for vendor billing corrections, price adjustments, goodwill credits.
   - No AP Invoice is modified at creation time.
   - No AP-side restrictions (no isStock gate on purchasing side — all items
     are already on the cost side).

2. From-AP-Invoice: base_invoice_doc_ref is set.
   - Used for crediting a specific AP Invoice.
   - Validates: source AP exists, is OPEN or PARTLY_CLOSED, has remaining
     creditable amount.
   - Per-line cap check: requested credit qty <= (ap_line.quantity - ap_line.creditedQty).
   - Pre-fills vendor/currency/companyCode from source AP.
   - Does NOT update AP-side counters at creation — only at PENDING_APPROVAL → OPEN.

Path-discrimination in transition_status
------------------------------------------
The service checks whether ``baseInvoiceDocRef`` is present on the ACN header.
- If present (from-AP-Invoice path): counter updates and auto-close fire on approval.
- If absent (direct path): no AP-side mutations on approval; only the outbox event.

AP_TAX_RATES treatment
-----------------------
Uses the same AP_TAX_RATES hardcoded dict from models.document — same as AP Invoice.
T-200.22b will migrate both AP Invoice and ACN to the finance HTTP lookup simultaneously.
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

from ..models.document import (
    AP_TAX_RATES,
    APCreditNoteCreate,
    APCreditNoteLine,
    APCreditNoteListItem,
    APCreditNoteResponse,
    APCreditNoteStatusTransitionRequest,
    APCreditNoteTotals,
    APCreditNoteUpdate,
    DocumentLinkRef,
)
from .purchasing_chain_reconciler import (
    _AP_INVOICES_COL,
    auto_close_ap_if_fully_credited,
    auto_reopen_ap_if_not_fully_credited,
    pull_dangling_ap_credit_refs,
    reconcile_ap_line_credit_counters,
    write_purchasing_audit,
)

logger = logging.getLogger(__name__)

_ACN_COL = "ap_credit_notes_v2"
_AUDIT_COL = "ap_credit_notes_v2_audit"
_DOC_TYPE_ACN = "AP_CREDIT"
_TOLERANCE = Decimal("0.005")
_TWOPLACES = Decimal("0.01")
_ZERO = Decimal("0")

# AP Invoice statuses that can accept a credit note.
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


def _resolve_tax_rate(tax_code: Optional[str]) -> Decimal:
    """
    Look up the tax rate for a given tax code from the hardcoded AP_TAX_RATES dict.

    Falls back to 0% for unknown or missing tax codes (same as AP Invoice behaviour).

    Args:
        tax_code: Tax code string from the AP_TAX_RATES dict, e.g. "S", "Z", "E".

    Returns:
        Tax rate as a Decimal (e.g. Decimal("5") for 5%).
    """
    if tax_code is None:
        return _ZERO
    return AP_TAX_RATES.get(tax_code, _ZERO)


def _compute_line_amounts(
    *,
    quantity: Decimal,
    unit_price: Decimal,
    discount_percent: Decimal,
    tax_rate: Decimal,
) -> Dict[str, Decimal]:
    """
    Compute derived monetary amounts for a single AP Credit Note line.

    Args:
        quantity:         Credited quantity.
        unit_price:       Credit unit price per unit.
        discount_percent: Line discount 0–100.
        tax_rate:         Tax rate 0–100 (from AP_TAX_RATES).

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


def _build_line_doc(
    line: Any,
    *,
    line_number: int,
) -> Dict[str, Any]:
    """
    Build the embedded ACN line dict for MongoDB storage.

    Args:
        line:        Validated APCreditNoteLineCreate input.
        line_number: 1-indexed position.

    Returns:
        Dict ready for embedding in the ACN header document.
    """

    line_id = str(uuid.uuid4())
    desc = line.description if line.description is not None else line.item_name
    tax_rate = _resolve_tax_rate(line.tax_code)
    amounts = _compute_line_amounts(
        quantity=line.quantity,
        unit_price=line.unit_price,
        discount_percent=line.discount_percent,
        tax_rate=tax_rate,
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
        "grLineId": line.gr_line_id,
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
        "baseDocRef": base_ref_dict,
    }


def _build_totals(lines: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Aggregate totals from embedded ACN line documents.

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


def _raw_line_to_response(ln: Dict[str, Any]) -> APCreditNoteLine:
    """Convert a raw embedded ACN line dict to APCreditNoteLine."""
    base_ref_raw = ln.get("baseDocRef")
    base_ref = None
    if base_ref_raw is not None:
        norm = _norm_ref(base_ref_raw)
        if norm:
            base_ref = DocumentLinkRef(**norm)

    return APCreditNoteLine(
        line_id=ln["lineId"],
        line_number=ln["lineNumber"],
        gr_line_id=ln.get("grLineId"),
        item_id=ln["itemId"],
        item_code=ln.get("itemCode", ""),
        item_name=ln.get("itemName", ""),
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
        base_doc_ref=base_ref,
    )


def _raw_totals_to_model(raw_totals: Dict[str, Any]) -> APCreditNoteTotals:
    """Convert raw MongoDB totals dict to APCreditNoteTotals."""
    return APCreditNoteTotals(
        net=Decimal(str(raw_totals.get("net", 0))),
        tax=Decimal(str(raw_totals.get("tax", 0))),
        gross=Decimal(str(raw_totals.get("gross", 0))),
    )


def _doc_to_response(raw: Dict[str, Any]) -> APCreditNoteResponse:
    """Convert a raw MongoDB ap_credit_notes_v2 document to APCreditNoteResponse."""
    lines = [_raw_line_to_response(ln) for ln in raw.get("lines", [])]
    raw_totals = raw.get("totals", {})

    base_inv_ref_raw = raw.get("baseInvoiceDocRef")
    base_inv_ref = None
    if base_inv_ref_raw is not None:
        norm = _norm_ref(base_inv_ref_raw)
        if norm:
            base_inv_ref = DocumentLinkRef(**norm)

    target_refs_raw = _norm_refs(raw.get("targetDocRefs", []))
    target_refs = [DocumentLinkRef(**r) for r in target_refs_raw if r]

    return APCreditNoteResponse(
        doc_id=raw["docId"],
        doc_number=raw["docNumber"],
        doc_type=raw.get("docType", _DOC_TYPE_ACN),
        organization_id=raw["organizationId"],
        company_code=raw["companyCode"],
        vendor_id=raw["vendorId"],
        vendor_code=raw.get("vendorCode"),
        vendor_name=raw["vendorName"],
        bp_ref_no=raw.get("bpRefNo"),
        doc_date=raw["docDate"],
        credit_date=raw.get("creditDate"),
        due_date=raw.get("dueDate"),
        currency=raw.get("currency", "AED"),
        exchange_rate=Decimal(str(raw.get("exchangeRate", 1))),
        payment_terms_id=raw.get("paymentTermsId"),
        status=raw["status"],
        totals=_raw_totals_to_model(raw_totals),
        base_invoice_doc_ref=base_inv_ref,
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


def _doc_to_list_item(raw: Dict[str, Any]) -> APCreditNoteListItem:
    """Convert a raw MongoDB document to slim APCreditNoteListItem."""
    raw_totals = raw.get("totals", {})

    base_inv_ref_raw = raw.get("baseInvoiceDocRef")
    base_inv_ref = None
    if base_inv_ref_raw is not None:
        norm = _norm_ref(base_inv_ref_raw)
        if norm:
            base_inv_ref = DocumentLinkRef(**norm)

    return APCreditNoteListItem(
        doc_id=raw["docId"],
        doc_number=raw["docNumber"],
        organization_id=raw["organizationId"],
        vendor_id=raw["vendorId"],
        vendor_name=raw["vendorName"],
        doc_date=raw["docDate"],
        status=raw["status"],
        totals=_raw_totals_to_model(raw_totals),
        base_invoice_doc_ref=base_inv_ref,
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
    """Append an audit entry to ap_credit_notes_v2_audit."""
    await write_purchasing_audit(
        db,
        audit_collection=_AUDIT_COL,
        doc_id=doc_id,
        action=action,
        user_id=user_id,
        detail=detail,
    )


def _build_outbox_payload(
    acn_raw: Dict[str, Any],
    *,
    event_type: str,
    original_event_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build the ap_credit_note_posted or ap_credit_note_cancelled outbox payload.

    The payload structure mirrors the AP Invoice posted event shape but with
    'credit' semantics.  The finance consumer will book the reversing JE:
        DR AP Control Account (totals.gross via AP control)
        CR Purchase Account (per line.lineNet, per costCenterId)
        CR Input VAT (per line.lineTax)

    Args:
        acn_raw:           Raw ACN header document (post-update state).
        event_type:        "ap_credit_note_posted" or "ap_credit_note_cancelled".
        original_event_id: For cancellation — event_id of the original posted event.

    Returns:
        Dict matching the AP credit note event payload contract.
    """

    def _date_str(val: Any) -> str:
        if val is None:
            return ""
        if hasattr(val, "strftime"):
            return val.strftime("%Y-%m-%d")
        return str(val)[:10]

    lines_payload = []
    for ln in sorted(acn_raw.get("lines", []), key=lambda x: x.get("lineNumber", 0)):
        lines_payload.append({
            "lineNumber": ln["lineNumber"],
            "itemId": ln["itemId"],
            "itemCode": ln.get("itemCode", ""),
            "quantity": str(ln.get("quantity", 0)),
            "unitPrice": str(ln.get("unitPrice", 0)),
            "lineNet": str(ln.get("lineNet", 0)),
            "taxCode": ln.get("taxCode"),
            "taxRate": str(ln.get("taxRate", 0)),
            "lineTax": str(ln.get("lineTax", 0)),
            "lineGross": str(ln.get("lineGross", 0)),
            "costCenterId": ln.get("costCenterId"),
            "grLineId": ln.get("grLineId"),
        })

    base_invoice_ref = acn_raw.get("baseInvoiceDocRef") or {}
    totals = acn_raw.get("totals", {})

    payload: Dict[str, Any] = {
        "acnDocId": acn_raw["docId"],
        "acnDocNumber": acn_raw["docNumber"],
        "docDate": _date_str(acn_raw.get("docDate")),
        "vendorId": acn_raw.get("vendorId", ""),
        "vendorName": acn_raw.get("vendorName", ""),
        "bpRefNo": acn_raw.get("bpRefNo"),
        "currency": acn_raw.get("currency", "AED"),
        "exchangeRate": str(acn_raw.get("exchangeRate", 1)),
        "baseApInvoiceDocId": (
            base_invoice_ref.get("docId") or base_invoice_ref.get("doc_id", "")
        ),
        "baseApInvoiceDocNumber": (
            base_invoice_ref.get("docNumber") or base_invoice_ref.get("doc_number", "")
        ),
        "totals": {
            "net": str(totals.get("net", 0)),
            "tax": str(totals.get("tax", 0)),
            "gross": str(totals.get("gross", 0)),
        },
        "lines": lines_payload,
    }

    if event_type == "ap_credit_note_cancelled" and original_event_id:
        payload["originalEventId"] = original_event_id

    return payload


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def create_ap_credit_note(
    db: AsyncIOMotorDatabase,
    payload: APCreditNoteCreate,
    org_id: str,
    user_id: str,
) -> APCreditNoteResponse:
    """
    Create a new AP Credit Note in DRAFT status (direct-create path).

    Does NOT reference a source AP Invoice.  Use create_ap_credit_note_from_invoice
    when crediting a specific AP Invoice.

    No AP-side counters are updated at creation time — those commit at
    PENDING_APPROVAL → OPEN.

    Sequence:
    1. Generate docId + docNumber ("APC-YYYY-NNNN").
    2. Build embedded line docs with amounts computed from AP_TAX_RATES.
    3. Persist in DRAFT status.
    4. Audit-log.

    Args:
        db:      Motor database instance.
        payload: Validated APCreditNoteCreate payload (base_invoice_doc_ref must be None).
        org_id:  Organisation UUID for scoping.
        user_id: Authenticated user creating the Credit Note.

    Returns:
        APCreditNoteResponse for the newly-created DRAFT ACN.
    """
    # Reason: build lines first so totals are correct before inserting the header.
    computed_lines: List[Dict[str, Any]] = []
    for i, line in enumerate(payload.lines, start=1):
        computed_lines.append(_build_line_doc(line, line_number=i))

    totals = _build_totals(computed_lines)

    doc_id = str(uuid.uuid4())
    doc_number = await next_doc_number(
        db,
        doc_type=_DOC_TYPE_ACN,
        org_id=org_id,
        company_code=payload.company_code or org_id,
    )

    now = _now()
    doc_date = payload.doc_date or now
    credit_date = payload.credit_date or doc_date

    # Normalise base_invoice_doc_ref to dict for MongoDB (should be None on direct path).
    base_inv_ref_dict: Optional[Dict[str, Any]] = None
    if payload.base_invoice_doc_ref is not None:
        if hasattr(payload.base_invoice_doc_ref, "model_dump"):
            base_inv_ref_dict = payload.base_invoice_doc_ref.model_dump()
        elif isinstance(payload.base_invoice_doc_ref, dict):
            base_inv_ref_dict = payload.base_invoice_doc_ref
        else:
            base_inv_ref_dict = dict(payload.base_invoice_doc_ref)

    doc: Dict[str, Any] = {
        "docId": doc_id,
        "docNumber": doc_number,
        "docType": _DOC_TYPE_ACN,
        "organizationId": org_id,
        "companyCode": payload.company_code or "",
        "vendorId": payload.vendor_id,
        "vendorCode": payload.vendor_code,
        "vendorName": payload.vendor_name,
        "bpRefNo": payload.bp_ref_no,
        "docDate": doc_date,
        "creditDate": credit_date,
        "dueDate": payload.due_date,
        "currency": payload.currency,
        "exchangeRate": float(payload.exchange_rate),
        "paymentTermsId": payload.payment_terms_id,
        "status": DocumentStatus.DRAFT.value,
        "totals": totals,
        "baseInvoiceDocRef": base_inv_ref_dict,
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

    await db[_ACN_COL].insert_one(doc)

    await _write_audit(
        db,
        doc_id=doc_id,
        action="create",
        user_id=user_id,
        detail={
            "vendorId": payload.vendor_id,
            "lineCount": len(computed_lines),
            "totalGross": totals["gross"],
            "path": "direct",
        },
    )

    doc.pop("_id", None)
    return _doc_to_response(doc)


async def create_ap_credit_note_from_invoice(
    db: AsyncIOMotorDatabase,
    ap_doc_id: str,
    payload: APCreditNoteCreate,
    org_id: str,
    user_id: str,
) -> APCreditNoteResponse:
    """
    Create a new AP Credit Note in DRAFT status, chained to a source AP Invoice.

    Validates the source AP Invoice exists and is in a creditable state.
    Pre-fills vendor/currency/companyCode from the source AP.
    Validates per-line cap: requested qty <= (ap_line.quantity - ap_line.creditedQty).

    Does NOT update AP-side counters at creation time — those commit at
    PENDING_APPROVAL → OPEN.  This mirrors the ARC from-ARI pattern.

    Args:
        db:         Motor database instance.
        ap_doc_id:  UUID of the source AP Invoice to credit against.
        payload:    Validated APCreditNoteCreate payload.
        org_id:     Organisation UUID for scoping.
        user_id:    Authenticated user creating the Credit Note.

    Returns:
        APCreditNoteResponse for the newly-created DRAFT ACN.

    Raises:
        ValueError: If source AP not found, wrong status, or credit qty exceeds cap.
    """
    # Step 1: Load and validate the source AP Invoice.
    ap_raw = await db[_AP_INVOICES_COL].find_one(
        {"docId": ap_doc_id, "organizationId": org_id}
    )
    if ap_raw is None:
        raise ValueError(
            f"AP Invoice '{ap_doc_id}' not found in organisation '{org_id}'."
        )

    ap_status = ap_raw.get("status", "")
    if ap_status not in _CREDITABLE_STATUSES:
        raise ValueError(
            f"AP Invoice '{ap_doc_id}' is in status '{ap_status}'. "
            "Must be 'open', 'partly_closed', or 'closed' to accept a credit note."
        )

    # Compute remaining creditable amount at the header level.
    ap_total_gross = Decimal(str(ap_raw.get("totalGross", 0)))
    ap_credited = Decimal(str(ap_raw.get("creditedAmount", 0)))
    open_to_credit = max(ap_total_gross - ap_credited, _ZERO)

    acn_gross = sum(
        _compute_line_amounts(
            quantity=ln.quantity,
            unit_price=ln.unit_price,
            discount_percent=ln.discount_percent,
            tax_rate=_resolve_tax_rate(ln.tax_code),
        )["line_gross"]
        for ln in payload.lines
    )

    if acn_gross > open_to_credit + _TOLERANCE:
        raise ValueError(
            f"Requested credit amount {float(acn_gross):.2f} exceeds "
            f"remaining creditable amount on AP Invoice '{ap_doc_id}' "
            f"({float(open_to_credit):.2f}). "
            "(open_to_credit = totalGross - creditedAmount)"
        )

    # Step 2: Per-line cap check against AP Invoice embedded lines.
    ap_lines: List[Dict[str, Any]] = ap_raw.get("lines", [])
    ap_lines_map: Dict[str, Dict[str, Any]] = {
        ln["lineId"]: ln for ln in ap_lines
    }

    for line in payload.lines:
        base_ref = line.base_doc_ref
        if base_ref is not None:
            ap_line_id = base_ref.line_id
            if ap_line_id and ap_line_id in ap_lines_map:
                ap_ln = ap_lines_map[ap_line_id]
                ap_ln_qty = Decimal(str(ap_ln.get("quantity", 0)))
                ap_ln_credited = Decimal(str(ap_ln.get("creditedQty", 0)))
                open_credit_qty = ap_ln_qty - ap_ln_credited
                if line.quantity > open_credit_qty + _TOLERANCE:
                    raise ValueError(
                        f"Credit quantity {float(line.quantity):.4f} for item "
                        f"'{line.item_name}' exceeds remaining creditable qty "
                        f"{float(open_credit_qty):.4f} on AP Invoice line '{ap_line_id}'."
                    )

    # Step 3: Build the ACN using source AP's vendor/currency/companyCode.
    computed_lines: List[Dict[str, Any]] = []
    for i, line in enumerate(payload.lines, start=1):
        computed_lines.append(_build_line_doc(line, line_number=i))

    totals = _build_totals(computed_lines)

    doc_id = str(uuid.uuid4())

    # Reason: use the AP's companyCode for the doc-number counter scope if
    # the payload didn't explicitly provide one.
    effective_company_code = (
        payload.company_code
        or ap_raw.get("companyCode", "")
        or org_id
    )

    doc_number = await next_doc_number(
        db,
        doc_type=_DOC_TYPE_ACN,
        org_id=org_id,
        company_code=effective_company_code,
    )

    now = _now()
    doc_date = payload.doc_date or now
    credit_date = payload.credit_date or doc_date

    # Build the header-level baseInvoiceDocRef from the source AP.
    base_inv_ref_dict: Dict[str, Any] = {
        "docType": "AP_INVOICE",
        "docId": ap_doc_id,
        "docNumber": ap_raw.get("docNumber", ""),
        "lineId": None,
    }

    doc: Dict[str, Any] = {
        "docId": doc_id,
        "docNumber": doc_number,
        "docType": _DOC_TYPE_ACN,
        "organizationId": org_id,
        # Reason: vendor/companyCode/currency inherited from source AP for chain integrity.
        "companyCode": effective_company_code,
        "vendorId": ap_raw["vendorId"],
        "vendorCode": ap_raw.get("vendorCode"),
        "vendorName": ap_raw.get("vendorName", payload.vendor_name),
        "bpRefNo": payload.bp_ref_no,
        "docDate": doc_date,
        "creditDate": credit_date,
        "dueDate": payload.due_date,
        "currency": ap_raw.get("currencyCode", payload.currency),
        "exchangeRate": float(payload.exchange_rate),
        "paymentTermsId": payload.payment_terms_id or ap_raw.get("paymentTermsCode"),
        "status": DocumentStatus.DRAFT.value,
        "totals": totals,
        "baseInvoiceDocRef": base_inv_ref_dict,
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

    await db[_ACN_COL].insert_one(doc)

    await _write_audit(
        db,
        doc_id=doc_id,
        action="create",
        user_id=user_id,
        detail={
            "vendorId": ap_raw["vendorId"],
            "lineCount": len(computed_lines),
            "totalGross": totals["gross"],
            "path": "from_ap_invoice",
            "sourceApDocId": ap_doc_id,
            "sourceApDocNumber": ap_raw.get("docNumber", ""),
        },
    )

    doc.pop("_id", None)
    return _doc_to_response(doc)


async def get_ap_credit_note(
    db: AsyncIOMotorDatabase,
    doc_id: str,
    org_id: str,
) -> Optional[APCreditNoteResponse]:
    """
    Retrieve a single AP Credit Note by its doc_id UUID.

    Args:
        db:     Motor database instance.
        doc_id: UUID of the AP Credit Note.
        org_id: Organisation UUID for scoping.

    Returns:
        APCreditNoteResponse if found, None otherwise.
    """
    raw = await db[_ACN_COL].find_one({"docId": doc_id, "organizationId": org_id})
    if raw is None:
        return None
    raw.pop("_id", None)
    return _doc_to_response(raw)


async def list_ap_credit_notes(
    db: AsyncIOMotorDatabase,
    org_id: str,
    *,
    vendor_id: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    """
    Paginated list of AP Credit Notes for an organisation.

    Args:
        db:        Motor database instance.
        org_id:    Organisation UUID for scoping.
        vendor_id: Optional filter by vendor UUID.
        status:    Optional filter by status string.
        date_from: Optional filter by doc_date >= date_from.
        date_to:   Optional filter by doc_date <= date_to.
        page:      1-indexed page number.
        page_size: Maximum items per page.

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

    total = await db[_ACN_COL].count_documents(query)
    skip = (page - 1) * page_size

    cursor = (
        db[_ACN_COL]
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


async def update_ap_credit_note(
    db: AsyncIOMotorDatabase,
    doc_id: str,
    payload: APCreditNoteUpdate,
    org_id: str,
    user_id: str,
) -> Optional[APCreditNoteResponse]:
    """
    Partially update a DRAFT AP Credit Note.

    If payload.lines is supplied, replaces the line set wholesale.
    Only DRAFT Credit Notes may be updated.

    Note: when lines change on a from-AP-Invoice ACN, there is no immediate
    AP-side counter impact.  Counters only commit at PENDING_APPROVAL → OPEN.

    Args:
        db:      Motor database instance.
        doc_id:  UUID of the AP Credit Note.
        payload: Validated APCreditNoteUpdate payload.
        org_id:  Organisation UUID for scoping.
        user_id: Authenticated user performing the update.

    Returns:
        Updated APCreditNoteResponse, or None if not found.

    Raises:
        ValueError: If the Credit Note is not in DRAFT status.
    """
    raw = await db[_ACN_COL].find_one({"docId": doc_id, "organizationId": org_id})
    if raw is None:
        return None

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"AP Credit Note '{doc_id}' cannot be updated: "
            f"status is '{raw['status']}' (only DRAFT AP Credit Notes may be edited)"
        )

    now = _now()
    updates: Dict[str, Any] = {"updatedAt": now, "updatedBy": user_id}

    field_map: Dict[str, Any] = {
        "bpRefNo": payload.bp_ref_no,
        "docDate": payload.doc_date,
        "creditDate": payload.credit_date,
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
        updates["totals"] = _build_totals(new_lines)

    await db[_ACN_COL].update_one(
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

    updated_raw = await db[_ACN_COL].find_one({"docId": doc_id, "organizationId": org_id})
    if updated_raw is None:
        return None
    updated_raw.pop("_id", None)
    return _doc_to_response(updated_raw)


async def delete_ap_credit_note(
    db: AsyncIOMotorDatabase,
    doc_id: str,
    org_id: str,
    user_id: str,
) -> bool:
    """
    Hard-delete a DRAFT AP Credit Note.

    Only DRAFT Credit Notes may be deleted.  No AP-side counter side-effects
    are needed because DRAFT Credit Notes have not yet modified AP creditedAmount.

    If the ACN was created from an AP Invoice, any stale targetDocRef entry
    pushed onto the AP Invoice is cleaned up via $pull.

    Args:
        db:      Motor database instance.
        doc_id:  UUID of the AP Credit Note.
        org_id:  Organisation UUID for scoping.
        user_id: Authenticated user performing the deletion.

    Returns:
        True if deleted, False if not found.

    Raises:
        ValueError: If the Credit Note is not in DRAFT status.
    """
    raw = await db[_ACN_COL].find_one({"docId": doc_id, "organizationId": org_id})
    if raw is None:
        return False

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"AP Credit Note '{doc_id}' cannot be deleted: "
            f"status is '{raw['status']}' (only DRAFT AP Credit Notes may be deleted)"
        )

    # Reason: write audit BEFORE delete so the trail survives deletion.
    await _write_audit(
        db,
        doc_id=doc_id,
        action="delete",
        user_id=user_id,
        detail={"docNumber": raw.get("docNumber")},
    )

    # Clean up dangling targetDocRefs on the source AP Invoice (if from-AP path).
    base_inv_ref = raw.get("baseInvoiceDocRef")
    if base_inv_ref:
        ap_doc_id = (
            base_inv_ref.get("docId") or base_inv_ref.get("doc_id")
        )
        if ap_doc_id:
            await pull_dangling_ap_credit_refs(
                db,
                ap_doc_id=ap_doc_id,
                org_id=org_id,
                user_id=user_id,
                acn_doc_id=doc_id,
            )

    await db[_ACN_COL].delete_one({"docId": doc_id, "organizationId": org_id})
    return True


async def transition_status(
    db: AsyncIOMotorDatabase,
    doc_id: str,
    request_body: APCreditNoteStatusTransitionRequest,
    org_id: str,
    user_id: str,
) -> Optional[APCreditNoteResponse]:
    """
    Transition an AP Credit Note to a new status.

    Uses assert_legal_transition("AP_CREDIT", ...) as the state-machine gatekeeper.

    DRAFT → PENDING_APPROVAL:
      Write audit ("submit_for_approval"). No AP-side impact.

    PENDING_APPROVAL → OPEN (approval — the financial posting event):
      If from-AP-Invoice (baseInvoiceDocRef present):
        1. For each ACN line that carries a baseDocRef to an AP Invoice line:
           - $inc AP Invoice line creditedQty by acn_line.quantity.
           - Accumulate gross_delta = sum(acn_line.lineGross).
        2. $inc AP Invoice header creditedAmount by gross_delta via reconciler.
        3. Auto-close AP Invoice if creditedAmount >= totalGross.
        4. Push ACN back-pointer onto AP Invoice targetDocRefs.
      5. Emit ap_credit_note_posted outbox event.
      6. Persist new status + outbox fields.
      7. Audit-log.

    PENDING_APPROVAL → DRAFT (rejection / withdraw):
      Status flip + audit. No AP-side impact (counters were never committed).

    OPEN → CLOSED:
      Terminal status flip only.

    Path discrimination:
      ``baseInvoiceDocRef`` presence on the ACN header determines which path:
      - Present  → from-AP-Invoice path (counter updates + auto-close fire).
      - Absent   → direct path (only outbox event, no AP mutations).

    Args:
        db:           Motor database instance.
        doc_id:       UUID of the AP Credit Note.
        request_body: Transition request with target_status and optional notes.
        org_id:       Organisation UUID for scoping.
        user_id:      Authenticated user performing the transition.

    Returns:
        Updated APCreditNoteResponse, or None if not found.

    Raises:
        ValueError: If the transition is illegal or validation fails.
    """
    raw = await db[_ACN_COL].find_one({"docId": doc_id, "organizationId": org_id})
    if raw is None:
        return None

    current_status = DocumentStatus(raw["status"])
    # Reason: target_status comes in as a string; parse to enum for comparison.
    new_status = DocumentStatus(request_body.target_status)
    now = _now()

    # Reason: assert_legal_transition raises ValueError for illegal transitions.
    assert_legal_transition(_DOC_TYPE_ACN, current_status, new_status)

    # -----------------------------------------------------------------------
    # PENDING_APPROVAL → OPEN: the financial posting event
    # -----------------------------------------------------------------------
    if (
        current_status == DocumentStatus.PENDING_APPROVAL
        and new_status == DocumentStatus.OPEN
    ):
        acn_lines = raw.get("lines", [])
        base_inv_ref = raw.get("baseInvoiceDocRef")

        # Determine path: from-AP-Invoice vs direct-create.
        ap_doc_id: Optional[str] = None
        if base_inv_ref:
            ap_doc_id = base_inv_ref.get("docId") or base_inv_ref.get("doc_id")

        if ap_doc_id:
            # From-AP-Invoice path: apply credit counters + auto-close.

            # Step 1: Build per-line credit deltas from ACN lines that reference
            # an AP Invoice line via baseDocRef.
            line_deltas: Dict[str, Decimal] = {}
            gross_delta = _ZERO

            for acn_line in acn_lines:
                base_ref = acn_line.get("baseDocRef") or {}
                ap_line_id = base_ref.get("lineId") or base_ref.get("line_id")

                if ap_line_id:
                    line_qty = Decimal(str(acn_line.get("quantity", 0)))
                    line_deltas[ap_line_id] = line_deltas.get(ap_line_id, _ZERO) + line_qty

                # Accumulate gross regardless of line-level ref presence
                # (for header-level creditedAmount).
                gross_delta += Decimal(str(acn_line.get("lineGross", 0)))

            # Step 2: Apply per-line creditedQty + header creditedAmount.
            await reconcile_ap_line_credit_counters(
                db,
                ap_doc_id=ap_doc_id,
                org_id=org_id,
                user_id=user_id,
                acn_doc_id=doc_id,
                line_deltas=line_deltas,
                gross_delta=gross_delta,
                cap_check=True,
            )

            # Step 3: Auto-close the AP Invoice if fully credited.
            ap_raw_post = await db[_AP_INVOICES_COL].find_one(
                {"docId": ap_doc_id, "organizationId": org_id}
            )
            if ap_raw_post is not None:
                await auto_close_ap_if_fully_credited(
                    db,
                    ap_doc_id=ap_doc_id,
                    ap_raw=ap_raw_post,
                    org_id=org_id,
                    user_id=user_id,
                    extra_detail={
                        "triggeredByAcnDocId": doc_id,
                        "triggeredByAcnDocNumber": raw.get("docNumber", ""),
                    },
                )

            # Step 4: Push ACN back-pointer onto AP Invoice targetDocRefs.
            acn_ref = {
                "docType": _DOC_TYPE_ACN,
                "docId": doc_id,
                "docNumber": raw.get("docNumber", ""),
                "lineId": None,
            }
            await db[_AP_INVOICES_COL].update_one(
                {"docId": ap_doc_id, "organizationId": org_id},
                {"$push": {"targetDocRefs": acn_ref}},
            )

            logger.info(
                "[APCreditNoteService] OPEN-transition (from-AP): AP Invoice '%s' "
                "creditedAmount +%.2f, triggered by ACN '%s'",
                ap_doc_id,
                float(gross_delta),
                doc_id,
            )

        # Step 5: Emit ap_credit_note_posted outbox event.
        event_payload = _build_outbox_payload(raw, event_type="ap_credit_note_posted")
        emitted_event_id: Optional[str] = None

        try:
            from src.modules.finance_bridge.outbox_writer import OutboxWriter  # noqa: PLC0415

            emitted_event_id = await OutboxWriter.publish(
                db=db,
                event_type="ap_credit_note_posted",
                organization_id=org_id,
                company_code=raw.get("companyCode", "1000"),
                payload=event_payload,
                source_user_id=user_id,
                source_document_id=doc_id,
            )
        except Exception as exc:  # noqa: BLE001
            # Reason: outbox failure is logged but must not block the status update.
            # The outbox reconciler sweeper will retry.
            logger.error(
                "[APCreditNoteService] Failed to emit ap_credit_note_posted for '%s': %s",
                doc_id,
                exc,
            )

        # Step 6: Persist new status + outbox audit fields.
        set_fields: Dict[str, Any] = {
            "status": new_status.value,
            "outboxEventId": str(emitted_event_id) if emitted_event_id else None,
            "outboxEventEmittedAt": now if emitted_event_id else None,
            "updatedAt": now,
            "updatedBy": user_id,
        }
        await db[_ACN_COL].update_one(
            {"docId": doc_id, "organizationId": org_id},
            {"$set": set_fields},
        )

        # Step 7: Audit.
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
                "sourceApDocId": ap_doc_id,
            },
        )

    # -----------------------------------------------------------------------
    # All other transitions: status flip + audit only
    # (DRAFT → PENDING_APPROVAL, PENDING_APPROVAL → DRAFT, OPEN → CLOSED)
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

        set_fields = {
            "status": new_status.value,
            "updatedAt": now,
            "updatedBy": user_id,
        }
        await db[_ACN_COL].update_one(
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

    # Reload and return the updated AP Credit Note.
    updated_raw = await db[_ACN_COL].find_one({"docId": doc_id, "organizationId": org_id})
    if updated_raw is None:
        return None
    updated_raw.pop("_id", None)
    return _doc_to_response(updated_raw)
