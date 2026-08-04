"""
Purchasing Module — Blanket Agreement (BLA) Service Layer (T-200.25 / Wave 4)

Long-term volume/price commitment between buyer and vendor.  Example:
"ACME Corp commits to purchase 10,000 units of widget-X at AED 5/unit from
VendorCo over the next 12 months."  Future POs reference the BLA and inherit
its pricing/terms.

Responsibilities
----------------
- Create a Blanket Agreement in DRAFT status (direct — no source doc).
- Retrieve a single BLA by doc_id UUID.
- Paginated list with filters (status, vendor_id, valid_from range, valid_to
  range, agreement_type, item_id, is_active).
- Partial update (DRAFT only).
- Hard-delete a DRAFT BLA (super_admin).
- Status transitions with legal-transition guard:
  - DRAFT → PENDING_APPROVAL: submit for approval.
  - DRAFT → OPEN: direct-open path for small orgs that skip approval.
  - PENDING_APPROVAL → OPEN (approval).
  - PENDING_APPROVAL → DRAFT (rejection / withdraw): no financial impact.
  - OPEN → PARTLY_CLOSED / CLOSED (auto-driven by PO consumption in T-200.25.1).
  - OPEN / PARTLY_CLOSED → CANCELLED: voids the agreement.

Collections used
----------------
  blanket_agreements_v2          — one document per BLA header + embedded lines
  blanket_agreements_v2_audit    — append-only audit trail

Lifecycle (BLA in document_status.py)
--------------------------------------
  DRAFT → PENDING_APPROVAL → OPEN → (PARTLY_CLOSED ↔ OPEN) → CLOSED
  DRAFT → OPEN  (small-org direct path — no approval gate)
  PENDING_APPROVAL → DRAFT  (rejection / withdraw path)
  OPEN / PARTLY_CLOSED → CANCELLED

PO→BLA integration
-------------------
  The reconciler helpers in purchasing_chain_reconciler.py
  (load_bla_with_lines, reconcile_bla_consumption, etc.) are wired to
  BLA consumption by T-200.25.1.  In T-200.25 (this file) those helpers
  are present but not yet called from any PO creation path.

No JE / outbox event
---------------------
  BLAs are agreements, not transactions.  No GL posting occurs when a BLA
  is approved or consumed.  Some ERPs emit a ``bla_posted`` analytics event
  on approval; out of scope here.

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
    BlanketAgreementCreate,
    BlanketAgreementLine,
    BlanketAgreementListItem,
    BlanketAgreementResponse,
    BlanketAgreementStatusTransitionRequest,
    BlanketAgreementTotals,
    BlanketAgreementUpdate,
    DocumentLinkRef,
)
from .purchasing_chain_reconciler import write_purchasing_audit

logger = logging.getLogger(__name__)

_BLA_COL = "blanket_agreements_v2"
_AUDIT_COL = "blanket_agreements_v2_audit"
_DOC_TYPE_BLA = "BLA"
_TOLERANCE = Decimal("0.005")
_TWOPLACES = Decimal("0.01")
_ZERO = Decimal("0")

# BLA statuses eligible for PO-consumption tracking (used by T-200.25.1).
_CONSUMABLE_STATUSES = {
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
    committed_quantity: Decimal,
    unit_price: Decimal,
    tax_rate: Decimal,
) -> Dict[str, Decimal]:
    """
    Compute derived monetary amounts for a single BLA line.

    BLA lines carry NO discount (unit_price IS the agreed price).

    Args:
        committed_quantity: Volume committed on this line.
        unit_price:         Agreed unit price (no discount applied here).
        tax_rate:           Tax rate 0–100 (resolved via finance HTTP lookup).

    Returns:
        Dict with keys: line_net, line_tax, line_gross.
    """
    line_net = (committed_quantity * unit_price).quantize(
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
    Build the embedded BLA line dict for MongoDB storage.

    Args:
        line:        Validated BlanketAgreementLineCreate input.
        line_number: 1-indexed position.
        org_id:      Organisation UUID for scoping (forwarded to finance HTTP lookup).
        auth_token:  Bearer token forwarded to the finance service for tax resolution.

    Returns:
        Dict ready for embedding in the BLA header document.
    """
    line_id = str(uuid.uuid4())
    desc = line.description if line.description is not None else line.item_name
    tax_rate = await _resolve_tax_rate(line.tax_code, org_id, auth_token)
    amounts = _compute_line_amounts(
        committed_quantity=line.committed_quantity,
        unit_price=line.unit_price,
        tax_rate=tax_rate,
    )
    return {
        "lineId": line_id,
        "lineNumber": line_number,
        "itemId": line.item_id,
        "itemCode": line.item_code,
        "itemName": line.item_name,
        "description": desc,
        "committedQuantity": float(line.committed_quantity),
        # Reason: consumedQty starts at 0; incremented by T-200.25.1 reconciler.
        "consumedQty": 0.0,
        "uom": line.uom,
        "unitPrice": float(line.unit_price),
        # Reason: no discount on BLA lines; the unit_price IS the agreed price.
        "lineNet": float(amounts["line_net"]),
        "taxCode": line.tax_code,
        "taxRate": float(tax_rate),
        "lineTax": float(amounts["line_tax"]),
        "lineGross": float(amounts["line_gross"]),
        "notes": line.notes,
    }


def _build_totals(
    lines: List[Dict[str, Any]],
    consumed_amount: Decimal = _ZERO,
    agreement_type: str = "line_based",
    committed_total_amount: Optional[Decimal] = None,
) -> Dict[str, Any]:
    """
    Aggregate totals from embedded BLA line documents.

    For line_based BLAs, net/tax/gross are summed from line amounts and
    outstanding is computed from consumed_amount.

    For amount_based BLAs, committed_total_amount overrides the gross field;
    line amounts remain informational.

    Args:
        lines:                  List of embedded line dicts.
        consumed_amount:        Amount consumed by referencing POs.
        agreement_type:         "line_based" or "amount_based".
        committed_total_amount: Override gross for amount_based BLAs.

    Returns:
        Dict with keys: net, tax, gross, consumedAmount, outstandingAmount.
    """
    total_net = sum(Decimal(str(ln.get("lineNet", 0))) for ln in lines)
    total_tax = sum(Decimal(str(ln.get("lineTax", 0))) for ln in lines)
    line_gross = (total_net + total_tax).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)

    # Reason: for amount_based BLAs the header-level committedTotalAmount
    # overrides the computed line gross; the commercial commitment is the
    # stated amount, not the sum of line commitments.
    if agreement_type == "amount_based" and committed_total_amount is not None:
        total_gross = committed_total_amount.quantize(
            _TWOPLACES, rounding=ROUND_HALF_UP
        )
    else:
        total_gross = line_gross

    outstanding = max(total_gross - consumed_amount, _ZERO).quantize(
        _TWOPLACES, rounding=ROUND_HALF_UP
    )
    return {
        "net": float(total_net.quantize(_TWOPLACES, rounding=ROUND_HALF_UP)),
        "tax": float(total_tax.quantize(_TWOPLACES, rounding=ROUND_HALF_UP)),
        "gross": float(total_gross),
        "consumedAmount": float(
            consumed_amount.quantize(_TWOPLACES, rounding=ROUND_HALF_UP)
        ),
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


def _raw_line_to_response(ln: Dict[str, Any]) -> BlanketAgreementLine:
    """Convert a raw embedded BLA line dict to BlanketAgreementLine."""
    committed = Decimal(str(ln.get("committedQuantity", 0)))
    consumed = Decimal(str(ln.get("consumedQty", 0)))
    outstanding = max(committed - consumed, _ZERO).quantize(
        _TWOPLACES, rounding=ROUND_HALF_UP
    )
    return BlanketAgreementLine(
        line_id=ln["lineId"],
        line_number=ln["lineNumber"],
        item_id=ln["itemId"],
        item_code=ln.get("itemCode", ""),
        item_name=ln.get("itemName", ""),
        description=ln.get("description"),
        committed_quantity=committed,
        consumed_qty=consumed,
        outstanding_qty=outstanding,
        unit_price=Decimal(str(ln.get("unitPrice", 0))),
        uom=ln.get("uom", ""),
        line_net=Decimal(str(ln.get("lineNet", 0))),
        tax_code=ln.get("taxCode"),
        tax_rate=Decimal(str(ln.get("taxRate", 0))),
        line_tax=Decimal(str(ln.get("lineTax", 0))),
        line_gross=Decimal(str(ln.get("lineGross", 0))),
        notes=ln.get("notes"),
    )


def _raw_totals_to_model(
    raw: Dict[str, Any], consumed_amount: Decimal = _ZERO
) -> BlanketAgreementTotals:
    """
    Convert raw MongoDB totals dict + consumedAmount to BlanketAgreementTotals.

    Args:
        raw:             Raw totals dict from MongoDB (net/tax/gross keys).
        consumed_amount: Amount consumed by PO allocations.

    Returns:
        BlanketAgreementTotals with outstanding_amount computed.
    """
    gross = Decimal(str(raw.get("gross", 0)))
    outstanding = max(gross - consumed_amount, _ZERO).quantize(
        _TWOPLACES, rounding=ROUND_HALF_UP
    )
    return BlanketAgreementTotals(
        net=Decimal(str(raw.get("net", 0))),
        tax=Decimal(str(raw.get("tax", 0))),
        gross=gross,
        consumed_amount=consumed_amount,
        outstanding_amount=outstanding,
    )


def _doc_to_response(raw: Dict[str, Any]) -> BlanketAgreementResponse:
    """Convert a raw MongoDB blanket_agreements_v2 document to BlanketAgreementResponse."""
    lines = [_raw_line_to_response(ln) for ln in raw.get("lines", [])]

    consumed = Decimal(str(raw.get("consumedAmount", 0)))
    raw_totals = raw.get("totals", {})
    totals = _raw_totals_to_model(raw_totals, consumed)

    target_refs_raw = _norm_refs(raw.get("targetDocRefs", []))
    target_refs = [DocumentLinkRef(**r) for r in target_refs_raw if r]

    committed_total = raw.get("committedTotalAmount")
    committed_total_decimal = (
        Decimal(str(committed_total)) if committed_total is not None else None
    )

    return BlanketAgreementResponse(
        doc_id=raw["docId"],
        doc_number=raw["docNumber"],
        doc_type=raw.get("docType", _DOC_TYPE_BLA),
        organization_id=raw["organizationId"],
        company_code=raw.get("companyCode", ""),
        vendor_id=raw["vendorId"],
        vendor_code=raw.get("vendorCode"),
        vendor_name=raw["vendorName"],
        bp_ref_no=raw.get("bpRefNo"),
        agreement_date=raw["agreementDate"],
        valid_from=raw["validFrom"],
        valid_to=raw["validTo"],
        currency=raw.get("currency", "AED"),
        exchange_rate=Decimal(str(raw.get("exchangeRate", 1))),
        payment_terms_id=raw.get("paymentTermsId"),
        status=raw["status"],
        agreement_type=raw.get("agreementType", "line_based"),
        committed_total_amount=committed_total_decimal,
        totals=totals,
        target_doc_refs=target_refs,
        journal_memo=raw.get("journalMemo"),
        notes=raw.get("notes"),
        lines=lines,
        created_at=raw["createdAt"],
        created_by=raw["createdBy"],
        updated_at=raw["updatedAt"],
        updated_by=raw["updatedBy"],
    )


def _doc_to_list_item(raw: Dict[str, Any]) -> BlanketAgreementListItem:
    """Convert a raw MongoDB document to slim BlanketAgreementListItem."""
    consumed = Decimal(str(raw.get("consumedAmount", 0)))
    raw_totals = raw.get("totals", {})
    totals = _raw_totals_to_model(raw_totals, consumed)

    return BlanketAgreementListItem(
        doc_id=raw["docId"],
        doc_number=raw["docNumber"],
        organization_id=raw["organizationId"],
        vendor_id=raw["vendorId"],
        vendor_name=raw["vendorName"],
        agreement_date=raw["agreementDate"],
        valid_from=raw["validFrom"],
        valid_to=raw["validTo"],
        status=raw["status"],
        agreement_type=raw.get("agreementType", "line_based"),
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
    """Append an audit entry to blanket_agreements_v2_audit."""
    await write_purchasing_audit(
        db,
        audit_collection=_AUDIT_COL,
        doc_id=doc_id,
        action=action,
        user_id=user_id,
        detail=detail,
    )


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def create_blanket_agreement(
    db: AsyncIOMotorDatabase,
    payload: BlanketAgreementCreate,
    org_id: str,
    user_id: str,
    auth_token: Optional[str] = None,
) -> BlanketAgreementResponse:
    """
    Create a new Blanket Agreement in DRAFT status.

    Direct create only — BLA is not chained from any source document.

    Validates:
    - valid_to > valid_from (validity window must be positive duration).

    Sequence:
    1. Validate validity dates.
    2. Generate docId + docNumber ("BLA-YYYY-NNNN").
    3. Build embedded line docs with amounts resolved via finance HTTP (T-200.22b).
    4. Compute totals (line_based: sum of lines; amount_based: committedTotalAmount).
    5. Persist in DRAFT status with consumedAmount = 0.
    6. Audit-log.

    Args:
        db:         Motor database instance.
        payload:    Validated BlanketAgreementCreate payload.
        org_id:     Organisation UUID for scoping.
        user_id:    Authenticated user creating the BLA.
        auth_token: Bearer token forwarded to the finance service for tax resolution.

    Returns:
        BlanketAgreementResponse for the newly-created DRAFT BLA.

    Raises:
        ValueError: If valid_to <= valid_from.
    """
    # Reason: validity window must span at least one day; reject degenerate windows.
    if payload.valid_to <= payload.valid_from:
        raise ValueError(
            "valid_to must be after valid_from. "
            f"Got valid_from={payload.valid_from.date()} valid_to={payload.valid_to.date()}."
        )

    # Reason: amount_based BLA should have a committed_total_amount supplied.
    if (
        payload.agreement_type == "amount_based"
        and payload.committed_total_amount is None
    ):
        raise ValueError(
            "committed_total_amount is required for amount_based Blanket Agreements."
        )

    # Reason: build lines first so totals are correct before inserting the header.
    computed_lines: List[Dict[str, Any]] = []
    for i, line in enumerate(payload.lines, start=1):
        computed_lines.append(
            await _build_line_doc(
                line, line_number=i, org_id=org_id, auth_token=auth_token
            )
        )

    totals = _build_totals(
        computed_lines,
        consumed_amount=_ZERO,
        agreement_type=payload.agreement_type,
        committed_total_amount=payload.committed_total_amount,
    )

    doc_id = str(uuid.uuid4())
    doc_number = await next_doc_number(
        db,
        doc_type=_DOC_TYPE_BLA,
        org_id=org_id,
        company_code=payload.company_code or org_id,
    )

    now = _now()
    agreement_date = payload.agreement_date or now

    committed_total_amount_stored = (
        float(payload.committed_total_amount)
        if payload.committed_total_amount is not None
        else None
    )

    doc: Dict[str, Any] = {
        "docId": doc_id,
        "docNumber": doc_number,
        "docType": _DOC_TYPE_BLA,
        "organizationId": org_id,
        "companyCode": payload.company_code or "",
        "vendorId": payload.vendor_id,
        "vendorCode": payload.vendor_code,
        "vendorName": payload.vendor_name,
        "bpRefNo": payload.bp_ref_no,
        "agreementDate": agreement_date,
        "validFrom": payload.valid_from,
        "validTo": payload.valid_to,
        "currency": payload.currency,
        "exchangeRate": float(payload.exchange_rate),
        "paymentTermsId": payload.payment_terms_id,
        "status": DocumentStatus.DRAFT.value,
        "agreementType": payload.agreement_type,
        "committedTotalAmount": committed_total_amount_stored,
        "totals": totals,
        # Reason: consumedAmount is the running total of PO consumption applied
        # to this BLA.  Starts at 0; incremented by reconcile_bla_consumption
        # in T-200.25.1.
        "consumedAmount": 0.0,
        "targetDocRefs": [],
        "journalMemo": payload.journal_memo,
        "notes": payload.notes,
        "lines": computed_lines,
        "createdAt": now,
        "createdBy": user_id,
        "updatedAt": now,
        "updatedBy": user_id,
    }

    await db[_BLA_COL].insert_one(doc)

    await _write_audit(
        db,
        doc_id=doc_id,
        action="create",
        user_id=user_id,
        detail={
            "vendorId": payload.vendor_id,
            "agreementType": payload.agreement_type,
            "lineCount": len(computed_lines),
            "totalGross": totals["gross"],
            "validFrom": str(payload.valid_from.date()),
            "validTo": str(payload.valid_to.date()),
        },
    )

    doc.pop("_id", None)
    return _doc_to_response(doc)


async def get_blanket_agreement(
    db: AsyncIOMotorDatabase,
    doc_id: str,
    org_id: str,
) -> Optional[BlanketAgreementResponse]:
    """
    Retrieve a single Blanket Agreement by its doc_id UUID.

    The ``outstanding_amount`` is computed at read time as
    ``totalGross - consumedAmount``.

    Per-line ``outstanding_qty`` is computed at read time as
    ``committedQuantity - consumedQty``.

    Args:
        db:     Motor database instance.
        doc_id: UUID of the Blanket Agreement.
        org_id: Organisation UUID for scoping.

    Returns:
        BlanketAgreementResponse if found, None otherwise.
    """
    raw = await db[_BLA_COL].find_one({"docId": doc_id, "organizationId": org_id})
    if raw is None:
        return None
    raw.pop("_id", None)
    return _doc_to_response(raw)


async def list_blanket_agreements(
    db: AsyncIOMotorDatabase,
    org_id: str,
    *,
    vendor_id: Optional[str] = None,
    status: Optional[str] = None,
    agreement_type: Optional[str] = None,
    valid_from_after: Optional[datetime] = None,
    valid_from_before: Optional[datetime] = None,
    valid_to_after: Optional[datetime] = None,
    valid_to_before: Optional[datetime] = None,
    item_id: Optional[str] = None,
    is_active: Optional[bool] = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    """
    Paginated list of Blanket Agreements for an organisation.

    Filter parameters:
    - ``vendor_id``:       Filter by vendorId.
    - ``status``:          Filter by status string.
    - ``agreement_type``:  Filter by "line_based" or "amount_based".
    - ``valid_from_after``:  Filter by validFrom >= value.
    - ``valid_from_before``: Filter by validFrom <= value.
    - ``valid_to_after``:    Filter by validTo >= value.
    - ``valid_to_before``:   Filter by validTo <= value.
    - ``item_id``:         Returns BLAs whose lines include this item UUID.
                            Useful for "find active BLAs for this item before
                            creating a PO" flow (UI surface in T-200.26).
    - ``is_active``:       When True, returns BLAs in status OPEN or
                            PARTLY_CLOSED where today falls within [validFrom,
                            validTo].  When False, returns non-active BLAs.
                            None = no filter.

    Args:
        db:                Motor database instance.
        org_id:            Organisation UUID for scoping.
        vendor_id:         Optional filter by vendor UUID.
        status:            Optional filter by status string.
        agreement_type:    Optional filter by agreement_type.
        valid_from_after:  Optional validFrom >= filter.
        valid_from_before: Optional validFrom <= filter.
        valid_to_after:    Optional validTo >= filter.
        valid_to_before:   Optional validTo <= filter.
        item_id:           Optional filter by item UUID in lines.
        is_active:         Optional active-window filter.
        page:              1-indexed page number.
        page_size:         Maximum items per page.

    Returns:
        Dict with keys: items, total, page, page_size, total_pages.
    """
    query: Dict[str, Any] = {"organizationId": org_id}

    if vendor_id:
        query["vendorId"] = vendor_id
    if status:
        query["status"] = status
    if agreement_type:
        query["agreementType"] = agreement_type

    if valid_from_after or valid_from_before:
        vf_filter: Dict[str, Any] = {}
        if valid_from_after:
            vf_filter["$gte"] = valid_from_after
        if valid_from_before:
            vf_filter["$lte"] = valid_from_before
        query["validFrom"] = vf_filter

    if valid_to_after or valid_to_before:
        vt_filter: Dict[str, Any] = {}
        if valid_to_after:
            vt_filter["$gte"] = valid_to_after
        if valid_to_before:
            vt_filter["$lte"] = valid_to_before
        query["validTo"] = vt_filter

    # Reason: item_id filter checks lines array for matching itemId.
    if item_id:
        query["lines.itemId"] = item_id

    # Reason: is_active = status OPEN or PARTLY_CLOSED AND today is within
    # the validity window [validFrom, validTo].
    if is_active is True:
        now = _now()
        query["status"] = {
            "$in": [
                DocumentStatus.OPEN.value,
                DocumentStatus.PARTLY_CLOSED.value,
            ]
        }
        query["validFrom"] = {"$lte": now}
        query["validTo"] = {"$gte": now}
    elif is_active is False:
        # Non-active = either closed/cancelled OR outside validity window.
        # Implementation: status is NOT in the active set.
        query["status"] = {
            "$nin": [
                DocumentStatus.OPEN.value,
                DocumentStatus.PARTLY_CLOSED.value,
            ]
        }

    total = await db[_BLA_COL].count_documents(query)
    skip = (page - 1) * page_size

    cursor = (
        db[_BLA_COL]
        .find(query, {"lines": 0})
        .sort("agreementDate", -1)
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


async def update_blanket_agreement(
    db: AsyncIOMotorDatabase,
    doc_id: str,
    payload: BlanketAgreementUpdate,
    org_id: str,
    user_id: str,
) -> Optional[BlanketAgreementResponse]:
    """
    Partially update a DRAFT Blanket Agreement.

    If payload.lines is supplied, replaces the line set wholesale.
    Only DRAFT BLAs may be updated.

    agreement_type and vendor are immutable after creation.

    Args:
        db:      Motor database instance.
        doc_id:  UUID of the Blanket Agreement.
        payload: Validated BlanketAgreementUpdate payload.
        org_id:  Organisation UUID for scoping.
        user_id: Authenticated user performing the update.

    Returns:
        Updated BlanketAgreementResponse, or None if not found.

    Raises:
        ValueError: If the BLA is not in DRAFT status, or date validation fails.
    """
    raw = await db[_BLA_COL].find_one({"docId": doc_id, "organizationId": org_id})
    if raw is None:
        return None

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"Blanket Agreement '{doc_id}' cannot be updated: "
            f"status is '{raw['status']}' (only DRAFT BLAs may be edited)"
        )

    now = _now()
    updates: Dict[str, Any] = {"updatedAt": now, "updatedBy": user_id}

    # Compute effective valid_from and valid_to for cross-field validation.
    effective_valid_from = payload.valid_from or raw.get("validFrom")
    effective_valid_to = payload.valid_to or raw.get("validTo")

    if effective_valid_from and effective_valid_to:
        if effective_valid_to <= effective_valid_from:
            raise ValueError("valid_to must be after valid_from.")

    field_map: Dict[str, Any] = {
        "agreementDate": payload.agreement_date,
        "validFrom": payload.valid_from,
        "validTo": payload.valid_to,
        "currency": payload.currency,
        "exchangeRate": (
            float(payload.exchange_rate) if payload.exchange_rate is not None else None
        ),
        "paymentTermsId": payload.payment_terms_id,
        "bpRefNo": payload.bp_ref_no,
        "journalMemo": payload.journal_memo,
        "notes": payload.notes,
        "committedTotalAmount": (
            float(payload.committed_total_amount)
            if payload.committed_total_amount is not None
            else None
        ),
    }
    for db_key, value in field_map.items():
        if value is not None:
            updates[db_key] = value

    if payload.lines is not None:
        agreement_type = raw.get("agreementType", "line_based")
        committed_total = (
            Decimal(str(payload.committed_total_amount))
            if payload.committed_total_amount is not None
            else (
                Decimal(str(raw.get("committedTotalAmount")))
                if raw.get("committedTotalAmount") is not None
                else None
            )
        )
        new_lines: List[Dict[str, Any]] = []
        for i, line in enumerate(payload.lines, start=1):
            new_lines.append(_build_line_doc(line, line_number=i))
        updates["lines"] = new_lines
        updates["totals"] = _build_totals(
            new_lines,
            consumed_amount=_ZERO,
            agreement_type=agreement_type,
            committed_total_amount=committed_total,
        )

    await db[_BLA_COL].update_one(
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

    updated_raw = await db[_BLA_COL].find_one(
        {"docId": doc_id, "organizationId": org_id}
    )
    if updated_raw is None:
        return None
    updated_raw.pop("_id", None)
    return _doc_to_response(updated_raw)


async def delete_blanket_agreement(
    db: AsyncIOMotorDatabase,
    doc_id: str,
    org_id: str,
    user_id: str,
) -> bool:
    """
    Hard-delete a DRAFT Blanket Agreement.

    Only DRAFT BLAs may be deleted.  Active (OPEN/CLOSED) BLAs are
    immutable per accounting immutability rules.

    Args:
        db:      Motor database instance.
        doc_id:  UUID of the Blanket Agreement.
        org_id:  Organisation UUID for scoping.
        user_id: Authenticated user performing the deletion.

    Returns:
        True if deleted, False if not found.

    Raises:
        ValueError: If the BLA is not in DRAFT status.
    """
    raw = await db[_BLA_COL].find_one({"docId": doc_id, "organizationId": org_id})
    if raw is None:
        return False

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"Blanket Agreement '{doc_id}' cannot be deleted: "
            f"status is '{raw['status']}' (only DRAFT BLAs may be deleted)"
        )

    # Reason: write audit BEFORE delete so the trail survives deletion.
    await _write_audit(
        db,
        doc_id=doc_id,
        action="delete",
        user_id=user_id,
        detail={"docNumber": raw.get("docNumber")},
    )

    await db[_BLA_COL].delete_one({"docId": doc_id, "organizationId": org_id})
    return True


async def transition_status(
    db: AsyncIOMotorDatabase,
    doc_id: str,
    request_body: BlanketAgreementStatusTransitionRequest,
    org_id: str,
    user_id: str,
) -> Optional[BlanketAgreementResponse]:
    """
    Transition a Blanket Agreement to a new status.

    Uses assert_legal_transition("BLA", ...) as the state-machine gatekeeper.

    DRAFT → PENDING_APPROVAL:
      Write audit ("submit_for_approval"). No financial impact.

    DRAFT → OPEN (small-org direct path):
      Write audit ("direct_open"). No financial impact.

    PENDING_APPROVAL → OPEN (approval):
      Write audit ("approve"). No financial impact.
      (BLAs do NOT emit outbox events — agreements, not transactions.)

    PENDING_APPROVAL → DRAFT (rejection / withdraw):
      Status flip + audit. No financial impact.

    OPEN / PARTLY_CLOSED → CANCELLED:
      Terminal cancellation. No reversal of PO consumption (T-200.25.1
      responsibility on PO delete).

    OPEN / PARTLY_CLOSED → CLOSED / PARTLY_CLOSED:
      These transitions are auto-driven by the reconciler helpers in
      purchasing_chain_reconciler (called from PO creation / deletion in
      T-200.25.1).  They can also be triggered manually here for admin
      override.

    Args:
        db:           Motor database instance.
        doc_id:       UUID of the Blanket Agreement.
        request_body: Transition request with target_status and optional notes.
        org_id:       Organisation UUID for scoping.
        user_id:      Authenticated user performing the transition.

    Returns:
        Updated BlanketAgreementResponse, or None if not found.

    Raises:
        ValueError: If the transition is illegal or validation fails.
    """
    raw = await db[_BLA_COL].find_one({"docId": doc_id, "organizationId": org_id})
    if raw is None:
        return None

    current_status = DocumentStatus(raw["status"])
    # Reason: target_status comes in as a string; parse to enum for comparison.
    new_status = DocumentStatus(request_body.target_status)
    now = _now()

    # Reason: assert_legal_transition raises ValueError for illegal transitions.
    assert_legal_transition(_DOC_TYPE_BLA, current_status, new_status)

    # Determine audit action label for clarity in the audit trail.
    action_label = "transition"
    if (
        current_status == DocumentStatus.DRAFT
        and new_status == DocumentStatus.PENDING_APPROVAL
    ):
        action_label = "submit_for_approval"
    elif current_status == DocumentStatus.DRAFT and new_status == DocumentStatus.OPEN:
        action_label = "direct_open"
    elif (
        current_status == DocumentStatus.PENDING_APPROVAL
        and new_status == DocumentStatus.OPEN
    ):
        action_label = "approve"
    elif (
        current_status == DocumentStatus.PENDING_APPROVAL
        and new_status == DocumentStatus.DRAFT
    ):
        action_label = "reject_or_withdraw"
    elif new_status == DocumentStatus.CANCELLED:
        action_label = "cancel"

    set_fields: Dict[str, Any] = {
        "status": new_status.value,
        "updatedAt": now,
        "updatedBy": user_id,
    }

    await db[_BLA_COL].update_one(
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

    # Reload and return the updated BLA.
    updated_raw = await db[_BLA_COL].find_one(
        {"docId": doc_id, "organizationId": org_id}
    )
    if updated_raw is None:
        return None
    updated_raw.pop("_id", None)
    return _doc_to_response(updated_raw)
