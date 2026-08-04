"""
Sales Module — AR Invoice Service Layer (T-100.9a)

Business logic for the AR Invoice (ARI) document type.

Responsibilities
----------------
- Create a direct AR Invoice (no Delivery base): DRAFT, generates ARI-YYYY-NNNN.
- Create an AR Invoice from a Posted Delivery (OPEN status): inherits header
  defaults from Delivery, increments Delivery line invoiced_qty counters,
  writes bidirectional links.
- Retrieve a single invoice by doc_entry UUID.
- Paginated list with filters (status, customer_id, date range).
- Partial update (DRAFT only); replaces line set wholesale when lines supplied.
- Hard-delete a DRAFT invoice.
- Status transitions with legal-transition guard:
  - DRAFT → OPEN: the primary accounting event.
    1. Re-validate revenue_account_id per line (catch deactivations).
    2. Re-validate customer_finance_ext (for T-100.9b arControlAccountId resolution).
    3. Emit sales_invoice_posted outbox event.
  - OPEN → CANCELLED (super_admin override path):
    1. Emit sales_invoice_cancelled event with original_event_id.
    2. Decrement source Delivery line invoiced_qty back (if from-Delivery).
  - OPEN → PARTLY_CLOSED, PARTLY_CLOSED → CLOSED: set indirectly by Customer
    Receipt (T-100.10). Direct call allowed for super_admin manual mark-paid.

UAE VAT tax-point rule
----------------------
tax_date = min(date_of_supply, invoice_date)

Computed at create time; re-computed on update if either date changes.

Revenue-account capture strategy
----------------------------------
`sale_item_finance_ext.revenueAccountId` is looked up per line at DRAFT creation
via HTTP call to the finance microservice and snapshotted onto each line as
`revenueAccountId`.  If the field is missing or null the service raises
ValueError (fail-fast).  At OPEN-transition the service re-validates that the
snapshotted account still exists and is active; if the ext has since been removed
or deactivated, the transition is blocked until the operator corrects the
configuration.

Cross-service HTTP calls
-------------------------
sale_item_finance_ext and customer_finance_ext live in the finance microservice's
MySQL DB.  The ops backend calls the finance service via HTTP (mirroring the
pattern in sales_order_service.py) using the FINANCE_SERVICE_URL env var.
Do NOT query these as MongoDB collections from the ops database.

Collections used
----------------
  ar_invoices_v2              — one document per AR Invoice header + embedded lines
  ar_invoices_v2_audit        — append-only audit trail
  deliveries_v2               — source Delivery collection (invoiced_qty updates)
  payment_terms               — net days lookup (read-only, ops MongoDB)
  finance_outbox              — OutboxWriter destination

  NOTE: tax_codes are looked up via HTTP from the finance microservice
  (GET /api/v1/finance/tax-codes) — NOT from ops MongoDB (T-202).
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from math import ceil
from typing import Any, Dict, List, Optional

import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase

from src.core.documents.doc_number import next_doc_number
from src.core.documents.document_status import DocumentStatus, assert_legal_transition

from ._finance_ext_client import get_item_finance_ext as _get_item_finance_ext
from ._finance_ext_client import get_tax_percent
from .doc_chain_reconciler import (
    TOLERANCE as _TOLERANCE,
    auto_close_if_fully_invoiced as _auto_close_if_fully_invoiced,
    auto_reopen_if_not_fully_invoiced as _auto_reopen_if_not_fully_invoiced,
    is_doc_fully_invoiced as _dn_is_fully_invoiced,
    line_open_invoice_qty as _dn_line_open_invoice_qty,
    pull_dangling_chain_refs as _pull_dangling_chain_refs,
    reconcile_line_counters as _reconcile_line_counters,
    write_chain_audit as _write_chain_audit,
)

from ..models.ar_invoices import (
    ARInvoiceCreate,
    ARInvoiceFromDeliveryRequest,
    ARInvoiceFromSORequest,
    ARInvoiceLineResponse,
    ARInvoiceListItem,
    ARInvoiceResponse,
    ARInvoiceStatusTransitionRequest,
    ARInvoiceTotals,
    ARInvoiceUpdate,
)

logger = logging.getLogger(__name__)

_ARI_COL = "ar_invoices_v2"
_AUDIT_COL = "ar_invoices_v2_audit"
_DN_COL = "deliveries_v2"
_DN_AUDIT_COL = "deliveries_v2_audit"
_SO_COL = "sales_orders_v2"
_SO_AUDIT_COL = "sales_orders_v2_audit"
_PAYMENT_TERMS_COL = "payment_terms"
# Reason: _TOLERANCE is imported from doc_chain_reconciler as the canonical
# source of truth for float-comparison tolerance used across DN and SO chains.
# The alias preserves all existing internal usages without renaming every site.

# Finance service base URL (internal — routed through Nginx in production).
# Falls back to the Docker Compose service name on the internal network.
_FINANCE_BASE_URL = os.getenv("FINANCE_SERVICE_URL", "http://finance:8001")
_TWOPLACES = Decimal("0.01")
_ZERO = Decimal("0")
_DOC_TYPE = "AR_INVOICE"
_DEFAULT_PAYMENT_DAYS = 30


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


def _compute_tax_date(date_of_supply: date, invoice_date: date) -> date:
    """
    Compute the UAE VAT tax-point date.

    UAE VAT Article 25 / 26: the tax point is the earliest of:
      - The date of supply (when goods/services were provided).
      - The date of invoice (when the invoice was issued).
    At AR Invoice time (no payment yet received) the formula is:
        tax_date = min(date_of_supply, invoice_date)

    Args:
        date_of_supply: When goods/services were supplied.
        invoice_date:   The printed invoice date.

    Returns:
        Tax-point date used for VAT reporting.
    """
    # Reason: UAE VAT law requires the earlier date to be the tax point.
    return min(date_of_supply, invoice_date)


async def _get_tax_percent(
    tax_code_id: Optional[str],
    org_id: str,
    auth_token: Optional[str],
) -> Decimal:
    """
    Fetch the tax percent for a given tax code ID via the finance microservice HTTP API.

    Delegates to ``get_tax_percent`` in ``_finance_ext_client``.  Tax codes live in
    the finance service's MySQL DB — they must NOT be queried as a MongoDB collection
    from the ops backend (T-202 / T-100.9a.1 architectural rule).

    Returns Decimal("0.00") immediately for None/empty tax_code_id (exempt lines).

    Args:
        tax_code_id: Tax code string (e.g. "S" for UAE 5% standard rate), or None
                     for exempt lines.
        org_id:      Organisation UUID for scoping.
        auth_token:  Bearer token from the calling user's JWT, forwarded to the
                     finance service.

    Returns:
        Tax rate as Decimal (e.g. Decimal("5.00") for UAE 5% standard rate).

    Raises:
        ValueError: If the tax code is not configured in the finance service,
                    or the finance service is unreachable.
    """
    return await get_tax_percent(tax_code_id, org_id, auth_token)


async def _get_customer_finance_ext(
    customer_id: str,
    org_id: str,
    auth_token: Optional[str],
) -> Optional[Dict[str, Any]]:
    """
    Fetch the customer_finance_ext record from the finance microservice via HTTP.

    customer_finance_ext lives in the finance service's MySQL DB — it must
    NOT be queried as a MongoDB collection from the ops backend.

    Customer finance ext is optional: 404 returns None (allowed to be missing;
    the ops side logs a warning but does not block invoice creation).

    Args:
        customer_id: MongoDB customerId UUID string.
        org_id:      Organisation UUID for scoping.
        auth_token:  Bearer token from the calling user's JWT.

    Returns:
        Dict of the finance extension fields, or None if not configured.

    Raises:
        ValueError: If the finance service returns a non-404 error status.
    """
    url = f"{_FINANCE_BASE_URL}/api/v1/finance/customer-finance-ext/{customer_id}"
    headers: Dict[str, str] = {}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                url,
                params={"organization_id": org_id},
                headers=headers,
            )
    except Exception as exc:  # noqa: BLE001
        # Reason: fail-open for customer ext — it is optional on the ops side.
        # The finance service (T-100.9b) will enforce arControlAccountId.
        logger.warning(
            "[ARInvoiceService] Finance service unreachable for customer '%s' ext: %s "
            "— proceeding without customer finance ext.",
            customer_id,
            exc,
        )
        return None

    if resp.status_code == 404:
        # Reason: customer_finance_ext is optional; 404 means not configured.
        return None

    if not resp.is_success:
        raise ValueError(
            f"Finance service returned HTTP {resp.status_code} when looking up "
            f"customer '{customer_id}' finance ext. Response: {resp.text[:200]}"
        )

    body = resp.json()
    # Reason: finance service wraps data under 'data' key per its SuccessResponse.
    return body.get("data", body)


async def _get_revenue_account_id(
    item_id: str,
    org_id: str,
    auth_token: Optional[str],
) -> str:
    """
    Fetch the revenue account ID from the finance microservice's sale_item_finance_ext.

    Fail-fast: raises ValueError if the ext record is missing or
    revenueAccountId is null.  This prevents silent GL posting failures.

    Args:
        item_id:    FK to items collection.
        org_id:     Organisation scope.
        auth_token: Bearer token forwarded to the finance service.

    Returns:
        Revenue GL account ID string.

    Raises:
        ValueError: If sale_item_finance_ext missing or revenueAccountId null.
    """
    ext = await _get_item_finance_ext(item_id, org_id, auth_token)
    rev_account = ext.get("revenueAccountId") or ext.get("revenue_account_id")
    if not rev_account:
        raise ValueError(
            f"Item '{item_id}' has a sale_item_finance_ext record but revenueAccountId "
            f"is null/empty. Set a revenue GL account before invoicing."
        )
    return str(rev_account)


async def _get_payment_terms_days(
    db: AsyncIOMotorDatabase,
    payment_terms_id: Optional[str],
    org_id: str,
) -> int:
    """
    Fetch the net-days for a payment terms record.

    Returns _DEFAULT_PAYMENT_DAYS (30) if terms not found or id is null.

    Args:
        db:               Motor database instance.
        payment_terms_id: FK to payment_terms, or None.
        org_id:           Organisation scope.

    Returns:
        Net days as int.
    """
    if not payment_terms_id:
        return _DEFAULT_PAYMENT_DAYS

    record = await db[_PAYMENT_TERMS_COL].find_one(
        {"_id": payment_terms_id, "organizationId": org_id}
    )
    if record is None:
        record = await db[_PAYMENT_TERMS_COL].find_one({"_id": payment_terms_id})

    if record is None:
        logger.warning(
            "[ARInvoiceService] PaymentTerms '%s' not found — using %d days",
            payment_terms_id,
            _DEFAULT_PAYMENT_DAYS,
        )
        return _DEFAULT_PAYMENT_DAYS

    return int(record.get("netDays") or record.get("net_days", _DEFAULT_PAYMENT_DAYS))


def _compute_line_amounts(
    *,
    quantity: Decimal,
    unit_price: Decimal,
    discount_percent: Decimal,
    tax_percent: Decimal,
) -> Dict[str, Decimal]:
    """
    Compute the derived monetary amounts for a single invoice line.

    Args:
        quantity:         Invoiced quantity.
        unit_price:       Selling price per unit.
        discount_percent: Line discount 0–100.
        tax_percent:      Tax rate 0–100 (snapshotted from tax code).

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


def _build_totals(lines: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Aggregate totals from embedded line documents.

    Args:
        lines: List of embedded line dicts from the AR Invoice document.

    Returns:
        Dict with keys: net, tax, gross, down_payment_applied, paid_amount, open_amount.
    """
    total_net = sum(Decimal(str(ln.get("lineNet", 0))) for ln in lines)
    total_tax = sum(Decimal(str(ln.get("lineTax", 0))) for ln in lines)
    total_gross = (total_net + total_tax).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)
    return {
        "net": float(total_net.quantize(_TWOPLACES, rounding=ROUND_HALF_UP)),
        "tax": float(total_tax.quantize(_TWOPLACES, rounding=ROUND_HALF_UP)),
        "gross": float(total_gross),
        "downPaymentApplied": 0.0,
        "paidAmount": 0.0,
        "openAmount": float(total_gross),
    }


async def _build_line_doc(
    db: AsyncIOMotorDatabase,
    *,
    item_id: str,
    item_code: str,
    item_name: str,
    description: Optional[str],
    quantity: Decimal,
    uom: str,
    unit_price: Decimal,
    discount_percent: Decimal,
    tax_code_id: Optional[str],
    warehouse_id: Optional[str],
    cost_center_id: Optional[str],
    base_doc_ref: Optional[Any],
    line_number: int,
    org_id: str,
    auth_token: Optional[str] = None,
    _preloaded_finance_ext: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Build an embedded AR Invoice line dict for MongoDB storage.

    Looks up tax_percent via HTTP from the finance microservice's tax-codes list
    (GET /api/v1/finance/tax-codes) and revenue_account_id from
    sale_item_finance_ext via HTTP.  Raises ValueError if either lookup fails.

    Args:
        db:               Motor database instance (ops MongoDB).
        item_id:          FK to items.
        item_code:        Denormalised item code.
        item_name:        Denormalised item name.
        description:      Printable description; defaults to item_name.
        quantity:         Invoiced quantity.
        uom:              Unit of measure.
        unit_price:       Selling price per unit.
        discount_percent: Line discount 0–100.
        tax_code_id:      Tax code string (e.g. "S") or None for exempt lines.
        warehouse_id:     Optional warehouse reference.
        cost_center_id:   Optional cost-centre.
        base_doc_ref:     Optional upstream Delivery line ref (Pydantic or dict).
        line_number:      1-indexed position.
        org_id:           Organisation scope.
        auth_token:       Bearer token forwarded to the finance service.
        _preloaded_finance_ext: Pre-fetched finance ext dict to avoid a second
                    HTTP round-trip when the caller already fetched it for
                    isStock validation.  If None, falls back to fetching via HTTP.

    Returns:
        Embedded line dict ready for insertion into ar_invoices_v2.

    Raises:
        ValueError: If sale_item_finance_ext missing or revenueAccountId null.
    """
    tax_percent = await _get_tax_percent(tax_code_id, org_id, auth_token)

    if _preloaded_finance_ext is not None:
        # Reason: caller already fetched finance ext (e.g. for isStock gating);
        # extract revenueAccountId directly to avoid a second HTTP round-trip.
        rev_account = _preloaded_finance_ext.get(
            "revenueAccountId"
        ) or _preloaded_finance_ext.get("revenue_account_id")
        if not rev_account:
            raise ValueError(
                f"Item '{item_id}' has a sale_item_finance_ext record but "
                "revenueAccountId is null/empty. "
                "Set a revenue GL account before invoicing."
            )
        revenue_account_id = str(rev_account)
    else:
        revenue_account_id = await _get_revenue_account_id(item_id, org_id, auth_token)

    amounts = _compute_line_amounts(
        quantity=quantity,
        unit_price=unit_price,
        discount_percent=discount_percent,
        tax_percent=tax_percent,
    )

    line_id = str(uuid.uuid4())
    desc = description if description is not None else item_name

    # Normalise base_doc_ref to a plain dict for MongoDB storage.
    base_ref_dict: Optional[Dict[str, Any]] = None
    if base_doc_ref is not None:
        if hasattr(base_doc_ref, "model_dump"):
            base_ref_dict = base_doc_ref.model_dump()
        elif isinstance(base_doc_ref, dict):
            base_ref_dict = base_doc_ref
        else:
            base_ref_dict = dict(base_doc_ref)

    return {
        "lineId": line_id,
        "lineNumber": line_number,
        "itemId": item_id,
        "itemCode": item_code,
        "itemName": item_name,
        "description": desc,
        "quantity": float(quantity),
        "uom": uom,
        "unitPrice": float(unit_price),
        "discountPercent": float(discount_percent),
        "lineNet": float(amounts["line_net"]),
        "taxCodeId": tax_code_id,
        "taxPercent": float(tax_percent),
        "lineTax": float(amounts["line_tax"]),
        "lineGross": float(amounts["line_gross"]),
        "revenueAccountId": revenue_account_id,
        "warehouseId": warehouse_id,
        "costCenterId": cost_center_id,
        "baseDocRef": base_ref_dict,
        "targetDocRefs": [],
        # Quantity tracking
        "invoicedQty": float(quantity),
        "creditedQty": 0.0,
        "cancelledQty": 0.0,
    }


def _raw_line_to_response(ln: Dict[str, Any]) -> ARInvoiceLineResponse:
    """
    Convert a raw embedded AR Invoice line dict to ARInvoiceLineResponse.

    Args:
        ln: Raw embedded line dict from the ar_invoices_v2 document.

    Returns:
        ARInvoiceLineResponse instance.
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

    return ARInvoiceLineResponse(
        line_id=ln["lineId"],
        line_number=ln["lineNumber"],
        item_id=ln["itemId"],
        item_code=ln.get("itemCode", ""),
        item_name=ln.get("itemName", ""),
        description=ln.get("description", ""),
        quantity=Decimal(str(ln["quantity"])),
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
        invoiced_qty=Decimal(str(ln.get("invoicedQty", ln["quantity"]))),
        credited_qty=Decimal(str(ln.get("creditedQty", 0))),
        cancelled_qty=Decimal(str(ln.get("cancelledQty", 0))),
        base_doc_ref=_norm_ref(ln.get("baseDocRef")),
        target_doc_refs=_norm_refs(ln.get("targetDocRefs", [])),
    )


def _raw_totals_to_model(raw_totals: Dict[str, Any]) -> ARInvoiceTotals:
    """
    Convert raw MongoDB totals dict to ARInvoiceTotals.

    Args:
        raw_totals: Dict from ar_invoices_v2 `totals` sub-document.

    Returns:
        ARInvoiceTotals instance.
    """
    return ARInvoiceTotals(
        net=Decimal(str(raw_totals.get("net", 0))),
        tax=Decimal(str(raw_totals.get("tax", 0))),
        gross=Decimal(str(raw_totals.get("gross", 0))),
        down_payment_applied=Decimal(str(raw_totals.get("downPaymentApplied", 0))),
        paid_amount=Decimal(str(raw_totals.get("paidAmount", 0))),
        # Reason: creditedAmount is new in T-100.11; default to 0 for older documents
        # that pre-date this field (no migration needed — code defaults are sufficient).
        credited_amount=Decimal(str(raw_totals.get("creditedAmount", 0))),
        open_amount=Decimal(str(raw_totals.get("openAmount", 0))),
    )


def _doc_to_response(raw: Dict[str, Any]) -> ARInvoiceResponse:
    """
    Convert a raw MongoDB ar_invoices_v2 document to ARInvoiceResponse.

    Args:
        raw: Document from the ar_invoices_v2 collection.

    Returns:
        ARInvoiceResponse instance.
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
    raw_totals = raw.get("totals", {})

    return ARInvoiceResponse(
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
        due_date=raw["dueDate"],
        currency=raw.get("currency", "AED"),
        exchange_rate=Decimal(str(raw.get("exchangeRate", 1))),
        payment_terms_id=raw.get("paymentTermsId"),
        status=DocumentStatus(raw["status"]),
        totals=_raw_totals_to_model(raw_totals),
        is_reserve_invoice=raw.get("isReserveInvoice", False),
        is_cash_sale=raw.get("isCashSale", False),
        base_doc_ref=_norm_ref(raw.get("baseDocRef")),
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


def _doc_to_list_item(raw: Dict[str, Any]) -> ARInvoiceListItem:
    """
    Convert a raw MongoDB ar_invoices_v2 document to slim ARInvoiceListItem.

    Args:
        raw: Partial document from a list projection query.

    Returns:
        ARInvoiceListItem instance.
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

    raw_totals = raw.get("totals", {})
    return ARInvoiceListItem(
        doc_entry=raw["docEntry"],
        doc_number=raw["docNumber"],
        organization_id=raw["organizationId"],
        customer_id=raw["customerId"],
        customer_name=raw["customerName"],
        doc_date=raw["docDate"],
        due_date=raw["dueDate"],
        tax_date=raw["taxDate"],
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
    Append an audit entry to ar_invoices_v2_audit.

    Best-effort: logs warning on failure but does not re-raise.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the affected AR Invoice.
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
            "Audit write failed for AR Invoice %s action=%s: %s", doc_entry, action, exc
        )


def _build_outbox_payload(
    invoice_raw: Dict[str, Any],
    *,
    event_type: str,
    original_event_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build the sales_invoice_posted or sales_invoice_cancelled outbox payload dict.

    Args:
        invoice_raw:       Raw AR Invoice header document (post-update state).
        event_type:        "sales_invoice_posted" or "sales_invoice_cancelled".
        original_event_id: For cancellation — the event_id of the original
                           sales_invoice_posted event being reversed.

    Returns:
        Dict matching SalesInvoicePostedPayload or SalesInvoiceCancelledPayload.
    """

    def _date_str(val: Any) -> str:
        if val is None:
            return ""
        if hasattr(val, "strftime"):
            return val.strftime("%Y-%m-%d")
        return str(val)[:10]

    raw_totals = invoice_raw.get("totals", {})

    lines_payload = []
    for ln in sorted(
        invoice_raw.get("lines", []), key=lambda x: x.get("lineNumber", 0)
    ):
        base_ref = ln.get("baseDocRef") or {}
        lines_payload.append(
            {
                "lineNumber": ln["lineNumber"],
                "itemId": ln["itemId"],
                "itemCode": ln.get("itemCode", ""),
                "quantity": str(ln.get("quantity", 0)),
                "unitPrice": str(ln.get("unitPrice", 0)),
                "lineNet": str(ln.get("lineNet", 0)),
                "taxCodeId": ln.get("taxCodeId"),
                "taxPercent": str(ln.get("taxPercent", 0)),
                "lineTax": str(ln.get("lineTax", 0)),
                "lineGross": str(ln.get("lineGross", 0)),
                "revenueAccountId": ln.get("revenueAccountId", ""),
                "costCenterId": ln.get("costCenterId"),
                "sourceDeliveryLineRef": base_ref if base_ref else None,
            }
        )

    base_ref = invoice_raw.get("baseDocRef") or {}

    payload: Dict[str, Any] = {
        "arInvoiceDocEntry": invoice_raw["docEntry"],
        "arInvoiceDocNumber": invoice_raw["docNumber"],
        "docDate": _date_str(invoice_raw.get("docDate")),
        "taxDate": _date_str(invoice_raw.get("taxDate")),
        "dueDate": _date_str(invoice_raw.get("dueDate")),
        "customerId": invoice_raw.get("customerId", ""),
        "customerName": invoice_raw.get("customerName", ""),
        "bpRefNo": invoice_raw.get("bpRefNo"),
        "currency": invoice_raw.get("currency", "AED"),
        "exchangeRate": str(invoice_raw.get("exchangeRate", 1)),
        "paymentTermsId": invoice_raw.get("paymentTermsId"),
        "totals": {
            "net": str(raw_totals.get("net", 0)),
            "tax": str(raw_totals.get("tax", 0)),
            "gross": str(raw_totals.get("gross", 0)),
            "downPaymentApplied": str(raw_totals.get("downPaymentApplied", 0)),
        },
        "baseDeliveryDocRef": base_ref if base_ref else None,
        "isReserveInvoice": invoice_raw.get("isReserveInvoice", False),
        "lines": lines_payload,
    }

    if event_type == "sales_invoice_cancelled" and original_event_id:
        payload["originalEventId"] = original_event_id

    return payload


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def create_ar_invoice(
    db: AsyncIOMotorDatabase,
    payload: ARInvoiceCreate,
    org_id: str,
    user_id: str,
    auth_token: Optional[str] = None,
) -> ARInvoiceResponse:
    """
    Create a new AR Invoice in DRAFT status (direct-invoice flow, no Delivery base).

    Sequence:
    1. Validate customer exists (lightweight check; fail-fast is on revenue account).
    2. For each line: look up revenue_account_id from the finance microservice's
       sale_item_finance_ext; raise ValueError if missing or null.
    3. For each line: look up tax_percent via HTTP from the finance microservice.
    4. Compute tax_date = min(date_of_supply, invoice_date).
    5. Compute due_date = doc_date + payment_terms_days (fallback 30).
    6. Compute line amounts (line_net, line_tax, line_gross) and header totals.
    7. Generate doc_number = "ARI-YYYY-NNNN".
    8. Persist in DRAFT status.
    9. Audit-log.

    Args:
        db:         Motor database instance (ops MongoDB).
        payload:    Validated ARInvoiceCreate payload.
        org_id:     Organisation UUID for scoping.
        user_id:    Authenticated user creating the invoice.
        auth_token: Bearer token forwarded to the finance microservice for
                    sale_item_finance_ext lookups.

    Returns:
        ARInvoiceResponse for the newly-created DRAFT AR Invoice.

    Raises:
        ValueError: If any item is a stock item (must flow through Delivery),
                    if any item is missing sale_item_finance_ext, or if
                    revenueAccountId is null.
    """
    # Step 3/4: Compute dates.
    tax_date = _compute_tax_date(payload.date_of_supply, payload.invoice_date)

    # Step 5: Compute due_date.
    terms_days = await _get_payment_terms_days(db, payload.payment_terms_id, org_id)
    due_date = payload.doc_date + timedelta(days=terms_days)

    # Reason: PyMongo cannot encode bare datetime.date — convert all date fields to
    # datetime.datetime at midnight UTC before any MongoDB write.
    doc_date_dt = _to_dt(payload.doc_date)
    date_of_supply_dt = _to_dt(payload.date_of_supply)
    invoice_date_dt = _to_dt(payload.invoice_date)
    tax_date_dt = _to_dt(tax_date)
    due_date_dt = _to_dt(due_date)

    # Step 2-pre: Fetch finance ext for each line once, check isStock BEFORE any DB
    # writes.  Collecting all exts up-front also eliminates a second HTTP round-trip
    # inside _build_line_doc (_preloaded_finance_ext is forwarded below).
    # Reason: stock items must flow through a Delivery Note; direct-invoicing them
    # creates an accounting asymmetry (revenue without COGS).  Reject the entire
    # request if any line is a stock item (no partial accepts).
    line_finance_exts: List[Dict[str, Any]] = []
    for line in payload.lines:
        ext = await _get_item_finance_ext(line.item_id, org_id, auth_token)
        # Reason: isStock defaults True (conservative) if field absent — matches
        # the backfill heuristic: unknown items behave as stock until classified.
        if ext.get("isStock", True):
            raise ValueError(
                f"Item '{line.item_name}' is a stock item and cannot be invoiced "
                "directly. Create a Delivery Note first, then invoice from the Delivery."
            )
        line_finance_exts.append(ext)

    # Steps 2–3: Build lines with revenue account lookup + tax percent lookup.
    # Pass the pre-fetched ext so _build_line_doc skips the second HTTP call.
    computed_lines: List[Dict[str, Any]] = []
    for i, (line, ext) in enumerate(zip(payload.lines, line_finance_exts), start=1):
        line_doc = await _build_line_doc(
            db,
            item_id=line.item_id,
            item_code=line.item_code,
            item_name=line.item_name,
            description=line.description,
            quantity=line.quantity,
            uom=line.uom,
            unit_price=line.unit_price,
            discount_percent=line.discount_percent,
            tax_code_id=line.tax_code_id,
            warehouse_id=line.warehouse_id,
            cost_center_id=line.cost_center_id,
            base_doc_ref=line.base_doc_ref,
            line_number=i,
            org_id=org_id,
            auth_token=auth_token,
            _preloaded_finance_ext=ext,
        )
        computed_lines.append(line_doc)

    # Step 6: Compute totals.
    totals = _build_totals(computed_lines)

    # Step 7: Generate doc_number.
    doc_entry = str(uuid.uuid4())
    doc_number = await next_doc_number(
        db,
        doc_type=_DOC_TYPE,
        org_id=org_id,
        company_code=payload.company_code,
    )

    now = _now()

    # Step 8: Persist in DRAFT status.
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
        "dueDate": due_date_dt,
        "currency": payload.currency,
        "exchangeRate": float(payload.exchange_rate),
        "paymentTermsId": payload.payment_terms_id,
        "status": DocumentStatus.DRAFT.value,
        "totals": totals,
        "isReserveInvoice": False,
        "isCashSale": False,
        "baseDocRef": None,
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

    await db[_ARI_COL].insert_one(doc)

    # Step 9: Audit.
    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="create_direct",
        user_id=user_id,
        detail={
            "customerId": payload.customer_id,
            "lineCount": len(computed_lines),
            "totalGross": totals["gross"],
        },
    )

    doc.pop("_id", None)
    return _doc_to_response(doc)


async def create_ar_invoice_from_delivery(
    db: AsyncIOMotorDatabase,
    delivery_doc_entry: str,
    payload: ARInvoiceFromDeliveryRequest,
    org_id: str,
    user_id: str,
    auth_token: Optional[str] = None,
) -> ARInvoiceResponse:
    """
    Create a new AR Invoice from a Posted (OPEN) Delivery Note.

    The Delivery must be in OPEN or CLOSED status (COGS has been posted).
    DRAFT and CANCELLED Deliveries are rejected.

    Sequence:
    1. Load Delivery; assert status in {OPEN, CLOSED}.
    2. For each requested line: validate Delivery line exists and open invoice qty > 0.
    3. Build AR Invoice lines (inherit item data from Delivery, apply invoice prices).
    4. Set base_doc_ref on header to Delivery; set per-line base_doc_ref to Delivery lines.
    5. Compute tax_date (using payload.date_of_supply or Delivery.actual_delivery_date).
    6. Atomically: increment Delivery line invoiced_qty + write target_doc_ref on
       Delivery header + create AR Invoice.
    7. Audit-log.

    Difference from direct-invoice flow:
    - Customer, warehouse are inherited from Delivery when not overridden.
    - Each AR Invoice line has a base_doc_ref pointing to the source Delivery line.
    - Delivery line invoiced_qty is incremented immediately on DRAFT creation
      (unlike Delivery-to-SO where the SO delivered_qty increments at OPEN).
      Rationale: the invoice qty commitment is made at DRAFT time; if the invoice
      is deleted, the qty is released.

    Args:
        db:                   Motor database instance.
        delivery_doc_entry:   UUID of the source Delivery Note.
        payload:              ARInvoiceFromDeliveryRequest with header + lines.
        org_id:               Organisation UUID for scoping.
        user_id:              Authenticated user creating the invoice.

    Returns:
        ARInvoiceResponse for the newly-created DRAFT AR Invoice.

    Raises:
        ValueError: If the Delivery is not found, not in a valid status,
                    or any line qty exceeds the open invoice qty.
    """
    # Step 1: Load Delivery; assert status.
    dn_raw = await db[_DN_COL].find_one(
        {"docEntry": delivery_doc_entry, "organizationId": org_id}
    )
    if dn_raw is None:
        raise ValueError(
            f"Delivery '{delivery_doc_entry}' not found in organisation '{org_id}'"
        )

    dn_status = DocumentStatus(dn_raw["status"])
    if dn_status not in {DocumentStatus.OPEN, DocumentStatus.CLOSED}:
        raise ValueError(
            f"Cannot create AR Invoice from Delivery '{delivery_doc_entry}': "
            f"Delivery status is '{dn_status.value}' (must be 'open' or 'closed' — "
            f"COGS must have been posted before revenue can be recognised)"
        )

    # Build a map of Delivery line UUID → line dict for O(1) lookups.
    dn_lines_map: Dict[str, Dict[str, Any]] = {
        ln["lineId"]: ln for ln in dn_raw.get("lines", [])
    }

    # Step 2: Validate each requested line against the Delivery.
    for req_line in payload.lines:
        dn_line = dn_lines_map.get(req_line.delivery_line_id)
        if dn_line is None:
            raise ValueError(
                f"Delivery line '{req_line.delivery_line_id}' not found on "
                f"Delivery '{delivery_doc_entry}'"
            )
        open_invoice_qty = _dn_line_open_invoice_qty(dn_line)
        if open_invoice_qty <= _TOLERANCE:
            raise ValueError(
                f"Delivery line '{req_line.delivery_line_id}' has "
                f"open_invoice_qty={float(open_invoice_qty):.4f} — nothing left to invoice"
            )
        if req_line.quantity > open_invoice_qty + _TOLERANCE:
            raise ValueError(
                f"Invoice quantity {float(req_line.quantity)} for Delivery line "
                f"'{req_line.delivery_line_id}' exceeds available "
                f"open_invoice_qty={float(open_invoice_qty):.4f}"
            )

    # Step 3: Build AR Invoice lines from Delivery lines.
    computed_lines: List[Dict[str, Any]] = []
    for i, req_line in enumerate(payload.lines, start=1):
        dn_line = dn_lines_map[req_line.delivery_line_id]

        # Build base_doc_ref pointing to this Delivery line.
        dn_line_ref = {
            "doc_type": "DELIVERY",
            "doc_id": delivery_doc_entry,
            "doc_number": dn_raw.get("docNumber", ""),
            "line_id": req_line.delivery_line_id,
        }

        line_doc = await _build_line_doc(
            db,
            item_id=dn_line["itemId"],
            item_code=dn_line.get("itemCode", ""),
            item_name=dn_line.get("itemName", ""),
            description=dn_line.get("description"),
            quantity=req_line.quantity,
            uom=dn_line.get("uom", "pcs"),
            unit_price=req_line.unit_price,
            discount_percent=req_line.discount_percent,
            tax_code_id=req_line.tax_code_id,
            warehouse_id=dn_line.get("warehouseId"),
            cost_center_id=req_line.cost_center_id or dn_line.get("costCenterId"),
            base_doc_ref=dn_line_ref,
            line_number=i,
            org_id=org_id,
            auth_token=auth_token,
        )
        computed_lines.append(line_doc)

    # Step 5: Compute date fields.
    # date_of_supply defaults to Delivery actual_delivery_date if not overridden.
    dn_delivery_date = dn_raw.get("actualDeliveryDate") or dn_raw.get("docDate")
    effective_date_of_supply: date = payload.date_of_supply or (
        dn_delivery_date
        if isinstance(dn_delivery_date, (date, datetime))
        else payload.doc_date
    )

    tax_date = _compute_tax_date(
        (
            effective_date_of_supply
            if isinstance(effective_date_of_supply, date)
            else (
                effective_date_of_supply.date()
                if hasattr(effective_date_of_supply, "date")
                else payload.doc_date
            )
        ),
        payload.invoice_date,
    )
    terms_days = await _get_payment_terms_days(db, payload.payment_terms_id, org_id)
    due_date = payload.doc_date + timedelta(days=terms_days)

    # Reason: PyMongo cannot encode bare datetime.date — convert all date fields to
    # datetime.datetime at midnight UTC before any MongoDB write.
    doc_date_dt = _to_dt(payload.doc_date)
    date_of_supply_dt = _to_dt(effective_date_of_supply)
    invoice_date_dt = _to_dt(payload.invoice_date)
    tax_date_dt = _to_dt(tax_date)
    due_date_dt = _to_dt(due_date)

    totals = _build_totals(computed_lines)

    doc_entry = str(uuid.uuid4())
    doc_number = await next_doc_number(
        db,
        doc_type=_DOC_TYPE,
        org_id=org_id,
        company_code=payload.company_code,
    )

    now = _now()

    # Header-level base_doc_ref → Delivery.
    dn_header_ref = {
        "docType": "DELIVERY",
        "docId": delivery_doc_entry,
        "docNumber": dn_raw.get("docNumber", ""),
        "lineId": None,  # header-level link
    }

    # Reason: all date fields use _dt variants (datetime.datetime) — PyMongo cannot
    # encode bare datetime.date objects.
    doc: Dict[str, Any] = {
        "docEntry": doc_entry,
        "docNumber": doc_number,
        "docType": _DOC_TYPE,
        "organizationId": org_id,
        "companyCode": payload.company_code,
        "customerId": dn_raw["customerId"],
        "customerName": dn_raw["customerName"],
        "bpRefNo": payload.bp_ref_no,
        "docDate": doc_date_dt,
        "dateOfSupply": date_of_supply_dt,
        "invoiceDate": invoice_date_dt,
        "taxDate": tax_date_dt,
        "dueDate": due_date_dt,
        "currency": payload.currency,
        "exchangeRate": float(payload.exchange_rate),
        "paymentTermsId": payload.payment_terms_id,
        "status": DocumentStatus.DRAFT.value,
        "totals": totals,
        "isReserveInvoice": False,
        "isCashSale": False,
        "baseDocRef": dn_header_ref,
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

    # Step 6: Atomic sequence — increment Delivery line invoiced_qty + write
    # target_doc_ref on Delivery header + insert AR Invoice.
    await db[_ARI_COL].insert_one(doc)

    # AR Invoice header ref written back to Delivery header.
    ari_ref = {
        "docType": _DOC_TYPE,
        "docId": doc_entry,
        "docNumber": doc_number,
        "lineId": None,
    }
    await db[_DN_COL].update_one(
        {"docEntry": delivery_doc_entry, "organizationId": org_id},
        {
            "$push": {"targetDocRefs": ari_ref},
            "$set": {"updatedAt": now, "updatedBy": user_id},
        },
    )

    # Increment invoiced_qty on each Delivery line referenced by a new AR Invoice line.
    for req_line, ari_line in zip(payload.lines, computed_lines):
        invoice_qty = float(req_line.quantity)

        # Increment Delivery line invoiced_qty.
        await db[_DN_COL].update_one(
            {
                "docEntry": delivery_doc_entry,
                "organizationId": org_id,
                "lines.lineId": req_line.delivery_line_id,
            },
            {
                "$inc": {"lines.$.invoicedQty": invoice_qty},
                "$set": {"updatedAt": now, "updatedBy": user_id},
            },
        )

        # Push AR Invoice line back-pointer onto Delivery line targetDocRefs.
        ari_line_ref = {
            "docType": _DOC_TYPE,
            "docId": doc_entry,
            "docNumber": doc_number,
            "lineId": ari_line["lineId"],
        }
        await db[_DN_COL].update_one(
            {
                "docEntry": delivery_doc_entry,
                "organizationId": org_id,
                "lines.lineId": req_line.delivery_line_id,
            },
            {
                "$push": {"lines.$.targetDocRefs": ari_line_ref},
            },
        )

    # Part B-2: Auto-close Delivery when fully invoiced.
    # Reload the Delivery after all invoicedQty increments so we have the
    # current post-increment state of every line.
    # Reason: _auto_close_if_fully_invoiced checks status + fully-invoiced and
    # performs the update_one + audit write in a single best-effort call.
    dn_updated = await db[_DN_COL].find_one(
        {"docEntry": delivery_doc_entry, "organizationId": org_id}
    )
    await _auto_close_if_fully_invoiced(
        db,
        doc_collection=_DN_COL,
        audit_collection=_DN_AUDIT_COL,
        doc_entry=delivery_doc_entry,
        doc_raw=dn_updated,
        org_id=org_id,
        user_id=user_id,
        extra_detail={
            "triggeredByAriDocEntry": doc_entry,
            "triggeredByAriDocNumber": doc_number,
        },
    )

    # Part B-3: SO bubble-up — when the DN has a parent SO, propagate the
    # invoicedQty increment to the SO lines so that the SO's auto-close logic
    # can fire for mixed SOs (stock lines via DN + service lines via from-SO).
    #
    # Mapping: each DN line carries baseDocRef.lineId = the SO line UUID and
    # baseDocRef.docId = the SO doc entry (set by delivery_service._build_line_doc).
    # If the DN has no SO parent (standalone DN — not supported in current code
    # but guarded defensively), skip silently.  If the parent SO cannot be found,
    # raise ValueError (data inconsistency — real error, not a skip).
    dn_base_ref = dn_raw.get("baseDocRef") or {}
    so_doc_entry_from_dn = dn_base_ref.get("docId") or dn_base_ref.get("doc_id")

    if so_doc_entry_from_dn:
        # Build so_line_deltas: so_line_id → qty invoiced in this ARI.
        # Reason: the DN line's baseDocRef.lineId is the SO line UUID.
        so_line_deltas_create: Dict[str, Decimal] = {}
        for req_line in payload.lines:
            dn_line = dn_lines_map[req_line.delivery_line_id]
            dn_line_base = dn_line.get("baseDocRef") or {}
            so_line_id = dn_line_base.get("lineId") or dn_line_base.get("line_id")
            if so_line_id:
                qty = Decimal(str(req_line.quantity))
                so_line_deltas_create[so_line_id] = (
                    so_line_deltas_create.get(so_line_id, _ZERO) + qty
                )

        if so_line_deltas_create:
            # Verify the SO exists before writing any counters.
            so_exists = await db[_SO_COL].find_one(
                {"docEntry": so_doc_entry_from_dn, "organizationId": org_id},
                {"_id": 1},
            )
            if so_exists is None:
                raise ValueError(
                    f"Cannot bubble up invoicedQty from Delivery "
                    f"'{delivery_doc_entry}' to parent Sales Order "
                    f"'{so_doc_entry_from_dn}': SO not found in organisation "
                    f"'{org_id}'. Data inconsistency — check the DN's baseDocRef."
                )

            # Reconcile SO line invoicedQty counters via the generic reconciler.
            # cap_check=True: a stock SO line should never be over-invoiced via
            # the DN path; the cap-check guards against drift between the two counters.
            await _reconcile_line_counters(
                db,
                source_collection=_SO_COL,
                source_doc_entry=so_doc_entry_from_dn,
                org_id=org_id,
                user_id=user_id,
                ari_doc_entry=doc_entry,
                line_deltas=so_line_deltas_create,
                cap_check=True,
            )

            # Write ARI header ref onto SO header targetDocRefs.
            # Reason: mirrors the from-SO ARI pattern so the SO's Document Chain
            # card surfaces this ARI regardless of whether it came from a DN or SO.
            ari_so_header_ref = {
                "docType": _DOC_TYPE,
                "docId": doc_entry,
                "docNumber": doc_number,
                "lineId": None,
            }
            await db[_SO_COL].update_one(
                {"docEntry": so_doc_entry_from_dn, "organizationId": org_id},
                {
                    "$push": {"targetDocRefs": ari_so_header_ref},
                    "$set": {"updatedAt": now, "updatedBy": user_id},
                },
            )

            # Write ARI line refs onto SO per-line targetDocRefs.
            # Reason: per-line granularity matches what create_ar_invoice_from_so does
            # so both code paths produce identical traceability on the SO side.
            for req_line, ari_line in zip(payload.lines, computed_lines):
                dn_line = dn_lines_map[req_line.delivery_line_id]
                dn_line_base = dn_line.get("baseDocRef") or {}
                so_line_id = dn_line_base.get("lineId") or dn_line_base.get("line_id")
                if so_line_id:
                    ari_so_line_ref = {
                        "docType": _DOC_TYPE,
                        "docId": doc_entry,
                        "docNumber": doc_number,
                        "lineId": ari_line["lineId"],
                    }
                    await db[_SO_COL].update_one(
                        {
                            "docEntry": so_doc_entry_from_dn,
                            "organizationId": org_id,
                            "lines.lineId": so_line_id,
                        },
                        {
                            "$push": {"lines.$.targetDocRefs": ari_so_line_ref},
                        },
                    )

            # Reload SO and auto-close if all lines (stock + service) are fully invoiced.
            # For a mixed SO: stock lines close when all DN-based invoicing is done
            # (this call); service lines close when the from-SO ARI path is done.
            # Both audit entries fire for their respective paths — correct rollup behaviour.
            so_updated_from_dn = await db[_SO_COL].find_one(
                {"docEntry": so_doc_entry_from_dn, "organizationId": org_id}
            )
            await _auto_close_if_fully_invoiced(
                db,
                doc_collection=_SO_COL,
                audit_collection=_SO_AUDIT_COL,
                doc_entry=so_doc_entry_from_dn,
                doc_raw=so_updated_from_dn,
                org_id=org_id,
                user_id=user_id,
                extra_detail={
                    "triggeredByAriDocEntry": doc_entry,
                    "triggeredByAriDocNumber": doc_number,
                    "soLineDeltas": {
                        k: float(v) for k, v in so_line_deltas_create.items()
                    },
                },
            )

    # Step 7: Audit.
    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="create_from_delivery",
        user_id=user_id,
        detail={
            "deliveryDocEntry": delivery_doc_entry,
            "deliveryDocNumber": dn_raw.get("docNumber"),
            "lineCount": len(computed_lines),
            "totalGross": totals["gross"],
        },
    )

    doc.pop("_id", None)
    return _doc_to_response(doc)


async def create_ar_invoice_from_so(
    db: AsyncIOMotorDatabase,
    so_doc_entry: str,
    payload: ARInvoiceFromSORequest,
    org_id: str,
    user_id: str,
    auth_token: Optional[str] = None,
) -> ARInvoiceResponse:
    """
    Create a new AR Invoice from an OPEN Sales Order (service lines only).

    This is the SO-chain counterpart to ``create_ar_invoice_from_delivery``.
    It invoices service (non-stock) lines directly from the SO without requiring
    a Delivery Note.

    Design invariant — stock lines are unreachable from this endpoint:
        If a caller references an SO line whose underlying item has
        ``isStock=True``, the request is rejected with HTTP 422 and a message
        directing the caller to the Delivery Note flow.  This invariant prevents
        revenue-without-COGS postings for stock items (the COGS event is tied to
        the Delivery → finance ``delivery_posted`` handler, which must happen
        before revenue is recognised via the AR Invoice).

    Difference from from-Delivery:
        - Source document is a Sales Order (not a Delivery).
        - The SO line's ``invoicedQty`` counter is incremented (not the DN line's).
        - ``baseDocRef`` on the ARI header and per-line carry ``docType="SO"``.
        - Auto-close fires on the SO when all lines (stock + service) are fully
          invoiced.  For a mixed SO this means all stock lines were also fully
          invoiced via the DN→from-Delivery path AND all service lines are now
          fully invoiced via this path.

    Sequence:
    1. Load SO; assert status in {OPEN, PARTLY_CLOSED}.
    2. For each requested line: validate SO line exists, assert item is non-stock
       (reject with clear message if stock), validate requested qty <= open_invoice_qty.
    3. Pre-fetch all finance exts via HTTP (single call per line).
    4. Build ARI lines using ``_build_line_doc``.  Per-line ``baseDocRef`` set to
       ``{docType: "SO", docId: so_doc_entry, docNumber: so.docNumber, lineId: soLineId}``.
    5. Set ARI header ``baseDocRef`` to
       ``{docType: "SO", docId: so_doc_entry, docNumber: so.docNumber, lineId: None}``.
    6. Insert ARI in DRAFT status.
    7. Write ARI header ref back onto SO ``targetDocRefs`` (header).
    8. Write ARI line refs onto SO line ``targetDocRefs`` (per-line).
    9. Reconcile SO line ``invoicedQty`` via ``_reconcile_line_counters``.
    10. Reload SO; call ``_auto_close_if_fully_invoiced`` on the SO.
    11. Audit-log.

    Args:
        db:            Motor database instance (ops MongoDB).
        so_doc_entry:  UUID of the source Sales Order.
        payload:       ARInvoiceFromSORequest with header + lines.
        org_id:        Organisation UUID for scoping.
        user_id:       Authenticated user creating the invoice.
        auth_token:    Bearer token forwarded to the finance microservice for
                       item-ext (isStock + revenueAccountId) and tax-percent lookups.

    Returns:
        ARInvoiceResponse for the newly-created DRAFT AR Invoice.

    Raises:
        ValueError: If the SO is not found, not in {OPEN, PARTLY_CLOSED},
                    any referenced line is a stock item (use DN flow),
                    any requested qty exceeds the SO line open_invoice_qty,
                    or any item is missing a revenueAccountId.
    """
    # Step 1: Load SO; assert status.
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
            f"Cannot create AR Invoice from Sales Order '{so_doc_entry}': "
            f"SO status is '{so_status.value}' "
            "(must be 'open' or 'partly_closed' — SO must be confirmed before invoicing)"
        )

    # Build SO line map for O(1) lookups.
    so_lines_map: Dict[str, Dict[str, Any]] = {
        ln["lineId"]: ln for ln in so_raw.get("lines", [])
    }

    # Step 2: Validate each requested line + fetch finance ext for isStock check.
    # Pre-fetch all exts up-front so we can reject the entire request before any
    # DB writes if any line fails validation.
    request_line_exts: List[Dict[str, Any]] = []
    for req_line in payload.lines:
        so_line = so_lines_map.get(req_line.so_line_id)
        if so_line is None:
            raise ValueError(
                f"SO line '{req_line.so_line_id}' not found on "
                f"Sales Order '{so_doc_entry}'"
            )

        # Fetch finance ext for isStock check + revenueAccountId pre-load.
        ext = await _get_item_finance_ext(so_line["itemId"], org_id, auth_token)

        # Reason: stock lines must flow through a Delivery Note so that the
        # delivery_posted COGS JE fires before revenue is recognised.  Invoicing
        # a stock line directly from the SO would post revenue without COGS.
        if ext.get("isStock", True):
            item_code = so_line.get("itemCode", so_line["itemId"])
            raise ValueError(
                f"Line '{item_code}' on Sales Order "
                f"'{so_raw.get('docNumber', so_doc_entry)}' is a stock item; "
                "invoice via the Delivery Note flow, not from-SO."
            )

        # Validate quantity against open invoice qty.
        open_invoice_qty = _dn_line_open_invoice_qty(so_line)
        if open_invoice_qty <= _TOLERANCE:
            raise ValueError(
                f"SO line '{req_line.so_line_id}' has "
                f"open_invoice_qty={float(open_invoice_qty):.4f} — nothing left to invoice"
            )
        if req_line.quantity > open_invoice_qty + _TOLERANCE:
            raise ValueError(
                f"Invoice quantity {float(req_line.quantity)} for SO line "
                f"'{req_line.so_line_id}' exceeds available "
                f"open_invoice_qty={float(open_invoice_qty):.4f}"
            )

        request_line_exts.append(ext)

    # Step 3–4: Build ARI lines.
    # Use pre-fetched finance exts so _build_line_doc skips second HTTP round-trip.
    computed_lines: List[Dict[str, Any]] = []
    for i, (req_line, ext) in enumerate(zip(payload.lines, request_line_exts), start=1):
        so_line = so_lines_map[req_line.so_line_id]

        # Per-line baseDocRef pointing to this SO line.
        so_line_ref = {
            "doc_type": "SO",
            "doc_id": so_doc_entry,
            "doc_number": so_raw.get("docNumber", ""),
            "line_id": req_line.so_line_id,
        }

        line_doc = await _build_line_doc(
            db,
            item_id=so_line["itemId"],
            item_code=so_line.get("itemCode", ""),
            item_name=so_line.get("itemName", ""),
            description=so_line.get("description"),
            quantity=req_line.quantity,
            uom=so_line.get("uom", "pcs"),
            unit_price=req_line.unit_price,
            discount_percent=req_line.discount_percent,
            tax_code_id=req_line.tax_code_id,
            warehouse_id=so_line.get("warehouseId"),
            cost_center_id=req_line.cost_center_id or so_line.get("costCenterId"),
            base_doc_ref=so_line_ref,
            line_number=i,
            org_id=org_id,
            auth_token=auth_token,
            _preloaded_finance_ext=ext,
        )
        computed_lines.append(line_doc)

    # Step 5: Compute date fields.
    # date_of_supply defaults to SO doc_date if not overridden.
    so_doc_date = so_raw.get("docDate")
    effective_date_of_supply: date = payload.date_of_supply or (
        so_doc_date if isinstance(so_doc_date, (date, datetime)) else payload.doc_date
    )
    if isinstance(effective_date_of_supply, datetime):
        effective_date_of_supply = effective_date_of_supply.date()

    tax_date = _compute_tax_date(effective_date_of_supply, payload.invoice_date)
    terms_days = await _get_payment_terms_days(db, payload.payment_terms_id, org_id)
    due_date = payload.doc_date + timedelta(days=terms_days)

    doc_date_dt = _to_dt(payload.doc_date)
    date_of_supply_dt = _to_dt(effective_date_of_supply)
    invoice_date_dt = _to_dt(payload.invoice_date)
    tax_date_dt = _to_dt(tax_date)
    due_date_dt = _to_dt(due_date)

    totals = _build_totals(computed_lines)

    doc_entry = str(uuid.uuid4())
    doc_number = await next_doc_number(
        db,
        doc_type=_DOC_TYPE,
        org_id=org_id,
        company_code=payload.company_code,
    )

    now = _now()

    # Step 5 (continued): Build ARI header baseDocRef → SO.
    so_header_ref = {
        "docType": "SO",
        "docId": so_doc_entry,
        "docNumber": so_raw.get("docNumber", ""),
        "lineId": None,  # header-level link
    }

    # Reason: PyMongo cannot encode bare datetime.date — all date fields use _dt.
    doc: Dict[str, Any] = {
        "docEntry": doc_entry,
        "docNumber": doc_number,
        "docType": _DOC_TYPE,
        "organizationId": org_id,
        "companyCode": payload.company_code,
        "customerId": so_raw["customerId"],
        "customerName": so_raw["customerName"],
        "bpRefNo": payload.bp_ref_no,
        "docDate": doc_date_dt,
        "dateOfSupply": date_of_supply_dt,
        "invoiceDate": invoice_date_dt,
        "taxDate": tax_date_dt,
        "dueDate": due_date_dt,
        "currency": payload.currency,
        "exchangeRate": float(payload.exchange_rate),
        "paymentTermsId": payload.payment_terms_id,
        "status": DocumentStatus.DRAFT.value,
        "totals": totals,
        "isReserveInvoice": False,
        "isCashSale": False,
        "baseDocRef": so_header_ref,
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

    # Step 6: Insert ARI in DRAFT.
    await db[_ARI_COL].insert_one(doc)

    # Step 7: Write ARI header ref onto SO header targetDocRefs.
    ari_header_ref = {
        "docType": _DOC_TYPE,
        "docId": doc_entry,
        "docNumber": doc_number,
        "lineId": None,
    }
    await db[_SO_COL].update_one(
        {"docEntry": so_doc_entry, "organizationId": org_id},
        {
            "$push": {"targetDocRefs": ari_header_ref},
            "$set": {"updatedAt": now, "updatedBy": user_id},
        },
    )

    # Step 8: Write ARI line refs onto SO line targetDocRefs (per-line).
    for req_line, ari_line in zip(payload.lines, computed_lines):
        ari_line_ref = {
            "docType": _DOC_TYPE,
            "docId": doc_entry,
            "docNumber": doc_number,
            "lineId": ari_line["lineId"],
        }
        await db[_SO_COL].update_one(
            {
                "docEntry": so_doc_entry,
                "organizationId": org_id,
                "lines.lineId": req_line.so_line_id,
            },
            {
                "$push": {"lines.$.targetDocRefs": ari_line_ref},
            },
        )

    # Step 9: Reconcile SO line invoicedQty via the generic reconciler.
    # Build line_deltas: so_line_id → qty invoiced in this ARI.
    so_line_deltas: Dict[str, Decimal] = {}
    for req_line, ari_line in zip(payload.lines, computed_lines):
        qty = Decimal(str(ari_line.get("quantity", 0)))
        so_line_deltas[req_line.so_line_id] = (
            so_line_deltas.get(req_line.so_line_id, _ZERO) + qty
        )

    await _reconcile_line_counters(
        db,
        source_collection=_SO_COL,
        source_doc_entry=so_doc_entry,
        org_id=org_id,
        user_id=user_id,
        ari_doc_entry=doc_entry,
        line_deltas=so_line_deltas,
        cap_check=True,
    )

    # Step 10: Reload SO and auto-close if fully invoiced.
    # "Fully invoiced" for a mixed SO means:
    #   - All stock lines: open_invoice_qty == 0 (invoiced via DN → from-Delivery ARI).
    #   - All service lines: open_invoice_qty == 0 (invoiced via this from-SO ARI).
    # The reconciler checks orderedQty - invoicedQty - creditedQty per line,
    # so both stock and service lines participate in the check uniformly.
    so_updated = await db[_SO_COL].find_one(
        {"docEntry": so_doc_entry, "organizationId": org_id}
    )
    await _auto_close_if_fully_invoiced(
        db,
        doc_collection=_SO_COL,
        audit_collection=_SO_AUDIT_COL,
        doc_entry=so_doc_entry,
        doc_raw=so_updated,
        org_id=org_id,
        user_id=user_id,
        extra_detail={
            "triggeredByAriDocEntry": doc_entry,
            "triggeredByAriDocNumber": doc_number,
        },
    )

    # Step 11: Audit.
    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="create_from_so",
        user_id=user_id,
        detail={
            "soDocEntry": so_doc_entry,
            "soDocNumber": so_raw.get("docNumber"),
            "lineCount": len(computed_lines),
            "totalGross": totals["gross"],
            "soLineDeltas": {k: float(v) for k, v in so_line_deltas.items()},
        },
    )

    doc.pop("_id", None)
    return _doc_to_response(doc)


async def get_ar_invoice(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    org_id: str,
) -> Optional[ARInvoiceResponse]:
    """
    Retrieve a single AR Invoice by its doc_entry UUID.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the AR Invoice.
        org_id:    Organisation UUID for scoping.

    Returns:
        ARInvoiceResponse if found, None otherwise.
    """
    raw = await db[_ARI_COL].find_one({"docEntry": doc_entry, "organizationId": org_id})
    if raw is None:
        return None
    raw.pop("_id", None)
    return _doc_to_response(raw)


async def list_ar_invoices(
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
    Paginated list of AR Invoices with optional filters.

    Results are ordered by docDate descending (most recent first).

    Args:
        db:          Motor database instance.
        org_id:      Organisation UUID — always required for isolation.
        status:      Filter by status string value.
        customer_id: Filter by customer FK.
        date_from:   Inclusive lower bound on docDate.
        date_to:     Inclusive upper bound on docDate.
        page:        1-based page number.
        size:        Items per page.

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

    # Reason: project out lines for list queries to keep payloads lean.
    projection = {"lines": 0}

    total = await db[_ARI_COL].count_documents(query)
    skip = (page - 1) * size

    cursor = (
        db[_ARI_COL].find(query, projection).sort("docDate", -1).skip(skip).limit(size)
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


async def update_ar_invoice(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    payload: ARInvoiceUpdate,
    org_id: str,
    user_id: str,
    auth_token: Optional[str] = None,
) -> Optional[ARInvoiceResponse]:
    """
    Partially update a DRAFT AR Invoice.

    If payload.lines is supplied, replaces the line set wholesale and
    re-looks up revenue accounts for all new lines.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the AR Invoice.
        payload:   Validated ARInvoiceUpdate payload.
        org_id:    Organisation UUID for scoping.
        user_id:   Authenticated user performing the update.

    Returns:
        Updated ARInvoiceResponse, or None if the invoice was not found.

    Raises:
        ValueError: If the invoice status is not DRAFT.
    """
    raw = await db[_ARI_COL].find_one({"docEntry": doc_entry, "organizationId": org_id})
    if raw is None:
        return None

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"AR Invoice '{doc_entry}' cannot be updated: "
            f"status is '{raw['status']}' (only DRAFT AR Invoices may be edited)"
        )

    updates: Dict[str, Any] = {"updatedAt": _now(), "updatedBy": user_id}

    # Determine the effective date_of_supply and invoice_date for tax_date recomputation.
    effective_date_of_supply = payload.date_of_supply or raw.get("dateOfSupply")
    effective_invoice_date = payload.invoice_date or raw.get("invoiceDate")

    field_map = {
        "bpRefNo": payload.bp_ref_no,
        # Reason: date fields are converted via _to_dt to datetime.datetime before
        # writing — PyMongo cannot encode bare datetime.date objects.
        "docDate": _to_dt(payload.doc_date) if payload.doc_date is not None else None,
        "dateOfSupply": (
            _to_dt(payload.date_of_supply)
            if payload.date_of_supply is not None
            else None
        ),
        "invoiceDate": (
            _to_dt(payload.invoice_date) if payload.invoice_date is not None else None
        ),
        "paymentTermsId": payload.payment_terms_id,
        "currency": payload.currency,
        "exchangeRate": float(payload.exchange_rate) if payload.exchange_rate else None,
        "journalMemo": payload.journal_memo,
        "notes": payload.notes,
    }
    for db_key, value in field_map.items():
        if value is not None:
            updates[db_key] = value

    # Re-compute tax_date if either date changed.
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

    # Re-compute due_date if doc_date or payment_terms changed.
    if payload.doc_date is not None or payload.payment_terms_id is not None:
        terms_id = payload.payment_terms_id or raw.get("paymentTermsId")
        doc_date_for_due = payload.doc_date or raw.get("docDate")
        # Reason: doc_date_for_due may be a datetime from Mongo; extract date portion.
        if isinstance(doc_date_for_due, datetime):
            doc_date_for_due = doc_date_for_due.date()
        terms_days = await _get_payment_terms_days(db, terms_id, org_id)
        updates["dueDate"] = _to_dt(doc_date_for_due + timedelta(days=terms_days))

    # Counter reconciliation state (populated below when this is a from-Delivery or
    # from-SO invoice and payload.lines is not None).
    # Discrimination: read baseDocRef.docType to tell DN vs SO.
    # - from-Delivery ARIs: docType="DELIVERY" — reconcile deliveries_v2.
    # - from-SO ARIs:       docType="SO"       — reconcile sales_orders_v2.
    # - direct-create ARIs: baseDocRef is None  — no source counters to reconcile.
    _dn_line_deltas: Dict[str, float] = {}  # source_line_id → net delta applied
    _delivery_doc_entry_for_update: Optional[str] = None
    _so_doc_entry_for_update: Optional[str] = None
    # T-201.9 follow-up: SO doc entry derived from the DN's parent SO when this is
    # a from-Delivery ARI.  Populated in the DN update block when the DN has a parent SO.
    _so_doc_entry_from_dn_for_update: Optional[str] = None
    # T-201.9 follow-up: SO-line deltas built by mapping DN-line IDs → SO-line IDs.
    # Keyed so_line_id → net delta (Decimal).  Used to reconcile the SO after the
    # DN reconciliation runs.
    _so_line_deltas_from_dn: Dict[str, Decimal] = {}

    if payload.lines is not None:
        # Determine the creation mode of this ARI for line validation + counter routing.
        # Reason: isStock gating only applies to direct-create invoices; from-Delivery
        # and from-SO invoices were validated at create time and must not be re-gated.
        # Discrimination: baseDocRef.docType distinguishes DN from SO.
        _update_base_ref = raw.get("baseDocRef") or {}
        _update_base_doc_id = _update_base_ref.get("docId") or _update_base_ref.get(
            "doc_id"
        )
        _update_base_doc_type = (
            _update_base_ref.get("docType") or _update_base_ref.get("doc_type") or ""
        ).upper()
        _update_is_direct = not bool(_update_base_doc_id)
        _update_is_from_so = bool(_update_base_doc_id) and _update_base_doc_type == "SO"

        # Pre-fetch finance exts for isStock check on direct-create invoices.
        # Reason: reject the entire update (before any DB writes) if any new line
        # contains a stock item on a direct-create invoice.
        update_line_finance_exts: List[Optional[Dict[str, Any]]] = []
        if _update_is_direct:
            for line in payload.lines:
                ext = await _get_item_finance_ext(line.item_id, org_id, auth_token)
                if ext.get("isStock", True):
                    raise ValueError(
                        f"Item '{line.item_name}' is a stock item and cannot be "
                        "invoiced directly. Create a Delivery Note first, then "
                        "invoice from the Delivery."
                    )
                update_line_finance_exts.append(ext)
        else:
            # From-Delivery or from-SO path: no isStock re-check; pass None so
            # _build_line_doc falls back to its own HTTP lookup.
            update_line_finance_exts = [None] * len(payload.lines)

        new_lines: List[Dict[str, Any]] = []
        for i, (line, ext) in enumerate(
            zip(payload.lines, update_line_finance_exts), start=1
        ):
            line_doc = await _build_line_doc(
                db,
                item_id=line.item_id,
                item_code=line.item_code,
                item_name=line.item_name,
                description=line.description,
                quantity=line.quantity,
                uom=line.uom,
                unit_price=line.unit_price,
                discount_percent=line.discount_percent,
                tax_code_id=line.tax_code_id,
                warehouse_id=line.warehouse_id,
                cost_center_id=line.cost_center_id,
                base_doc_ref=line.base_doc_ref,
                line_number=i,
                org_id=org_id,
                auth_token=auth_token,
                _preloaded_finance_ext=ext,
            )
            new_lines.append(line_doc)

        updates["lines"] = new_lines
        updates["totals"] = _build_totals(new_lines)

        # --------------------------------------------------------------------
        # Counter reconciliation: reconcile source line invoicedQty when lines change.
        # Applies to from-Delivery (source_collection=deliveries_v2) and
        # from-SO (source_collection=sales_orders_v2) ARIs.
        # Direct-create ARIs have no source counters to reconcile.
        # --------------------------------------------------------------------
        ari_base_ref = raw.get("baseDocRef") or {}
        _base_doc_id = ari_base_ref.get("docId") or ari_base_ref.get("doc_id")
        _base_doc_type = (
            ari_base_ref.get("docType") or ari_base_ref.get("doc_type") or ""
        ).upper()
        if _base_doc_id and _base_doc_type == "DELIVERY":
            _delivery_doc_entry_for_update = _base_doc_id
        elif _base_doc_id and _base_doc_type == "SO":
            _so_doc_entry_for_update = _base_doc_id
        if _delivery_doc_entry_for_update:
            # Build old-line totals: dn_line_id → sum of old invoiced qty.
            old_totals: Dict[str, Decimal] = {}
            for old_ln in raw.get("lines", []):
                old_base = old_ln.get("baseDocRef") or {}
                dn_lid = old_base.get("lineId") or old_base.get("line_id")
                if dn_lid:
                    old_qty = Decimal(
                        str(old_ln.get("invoicedQty", old_ln.get("quantity", 0)))
                    )
                    old_totals[dn_lid] = old_totals.get(dn_lid, _ZERO) + old_qty

            # Build new-line totals: dn_line_id → sum of new qty.
            new_totals: Dict[str, Decimal] = {}
            for new_ln in new_lines:
                new_base = new_ln.get("baseDocRef") or {}
                dn_lid = new_base.get("lineId") or new_base.get("line_id")
                if dn_lid:
                    new_qty = Decimal(str(new_ln.get("quantity", 0)))
                    new_totals[dn_lid] = new_totals.get(dn_lid, _ZERO) + new_qty
                else:
                    # Reason: new line has no DN anchor — warn but don't block.
                    logger.warning(
                        "[ARInvoiceService] update_ar_invoice '%s': new line '%s' "
                        "has no baseDocRef.lineId — cannot reconcile DN counter for it.",
                        doc_entry,
                        new_ln.get("lineId", "?"),
                    )

            # Collect all DN line IDs that appear in either map.
            all_dn_line_ids = set(old_totals.keys()) | set(new_totals.keys())

            # Reason: initialise raw_deltas before the conditional block so that
            # the SO bubble-up code below can safely reference it regardless of
            # whether all_dn_line_ids was non-empty.
            raw_deltas: Dict[str, Decimal] = {}

            if all_dn_line_ids:
                # Build pre-computed deltas dict for reconciliation + audit.
                # Reason: compute deltas first so we can populate _dn_line_deltas
                # for the audit row (detail.dnLineDeltas) AND pass them to
                # _reconcile_line_counters in a single pass.
                for dn_lid in all_dn_line_ids:
                    old_qty_d = old_totals.get(dn_lid, _ZERO)
                    new_qty_d = new_totals.get(dn_lid, _ZERO)
                    delta = new_qty_d - old_qty_d
                    if abs(delta) > _TOLERANCE:
                        raw_deltas[dn_lid] = delta
                        _dn_line_deltas[dn_lid] = float(delta)

                if raw_deltas:
                    # cap_check=True: raises ValueError if any positive delta
                    # would exceed the line's available open_invoice_qty.
                    await _reconcile_line_counters(
                        db,
                        source_collection=_DN_COL,
                        source_doc_entry=_delivery_doc_entry_for_update,
                        org_id=org_id,
                        user_id=user_id,
                        ari_doc_entry=doc_entry,
                        line_deltas=raw_deltas,
                        cap_check=True,
                    )

            # T-201.7 fix: reconcile per-line targetDocRefs on the Delivery when
            # the AR Invoice's line set is replaced wholesale.
            #
            # Because update_ar_invoice replaces the entire line array, the new
            # ARI lines get fresh lineId UUIDs.  Any back-pointer that existed
            # on a Delivery line (pointing to an OLD ARI lineId) is now stale.
            #
            # Strategy:
            #   - For each OLD ARI line that referenced a DN line: $pull the ref
            #     from that DN line's targetDocRefs (keyed on docId == doc_entry,
            #     so we don't touch other ARI refs on the same DN line).
            #   - For each NEW ARI line that references a DN line: $push the new
            #     ref (with the new lineId UUID) onto the same DN line.
            #
            # Note: the header-level Delivery.targetDocRefs does NOT need to
            # change — the ARI docEntry is stable across updates.
            now_ref = updates.get("updatedAt") or _now()

            # Build old ARI lineId → DN line ID map from the raw document.
            old_ari_line_to_dn_line: Dict[str, str] = {}
            for old_ln in raw.get("lines", []):
                ari_lid = old_ln.get("lineId")
                old_base = old_ln.get("baseDocRef") or {}
                dn_lid = old_base.get("lineId") or old_base.get("line_id")
                if ari_lid and dn_lid:
                    old_ari_line_to_dn_line[ari_lid] = dn_lid

            # $pull stale per-line refs: remove any ref with docId == doc_entry
            # from every DN line that the old ARI pointed to.  We key on
            # docId so a sibling ARI's ref on the same DN line is preserved.
            for dn_lid_old in set(old_ari_line_to_dn_line.values()):
                await db[_DN_COL].update_one(
                    {
                        "docEntry": _delivery_doc_entry_for_update,
                        "organizationId": org_id,
                        "lines.lineId": dn_lid_old,
                    },
                    {
                        "$pull": {"lines.$.targetDocRefs": {"docId": doc_entry}},
                    },
                )

            # $push fresh per-line refs: add the new ARI line UUID onto the
            # corresponding DN line.
            new_doc_number = raw.get("docNumber")  # docNumber is stable on update
            for new_ln in new_lines:
                new_base = new_ln.get("baseDocRef") or {}
                dn_lid_new = new_base.get("lineId") or new_base.get("line_id")
                new_ari_line_id = new_ln.get("lineId")
                if dn_lid_new and new_ari_line_id:
                    new_ari_line_ref = {
                        "docType": _DOC_TYPE,
                        "docId": doc_entry,
                        "docNumber": new_doc_number,
                        "lineId": new_ari_line_id,
                    }
                    await db[_DN_COL].update_one(
                        {
                            "docEntry": _delivery_doc_entry_for_update,
                            "organizationId": org_id,
                            "lines.lineId": dn_lid_new,
                        },
                        {
                            "$push": {"lines.$.targetDocRefs": new_ari_line_ref},
                            "$set": {"updatedAt": now_ref, "updatedBy": user_id},
                        },
                    )

            # T-201.9 follow-up: SO bubble-up for from-Delivery ARI update.
            # When the DN has a parent SO, propagate the DN-line delta to the
            # corresponding SO line so the SO's invoicedQty stays in sync.
            #
            # Strategy: load the DN to get its baseDocRef (SO doc entry) and
            # build a DN-line-id → SO-line-id mapping from the DN lines' own
            # baseDocRef fields.  Then rekey raw_deltas from dn_lid → so_lid.
            dn_for_so_map = await db[_DN_COL].find_one(
                {"docEntry": _delivery_doc_entry_for_update, "organizationId": org_id}
            )
            if dn_for_so_map is not None:
                dn_parent_ref = dn_for_so_map.get("baseDocRef") or {}
                _so_doc_entry_from_dn_for_update = dn_parent_ref.get(
                    "docId"
                ) or dn_parent_ref.get("doc_id")
                if _so_doc_entry_from_dn_for_update and raw_deltas:
                    # Build dn_line_id → so_line_id map from the DN's embedded lines.
                    dn_line_to_so_line: Dict[str, str] = {}
                    for dn_ln in dn_for_so_map.get("lines", []):
                        dn_ln_base = dn_ln.get("baseDocRef") or {}
                        so_lid = dn_ln_base.get("lineId") or dn_ln_base.get("line_id")
                        if so_lid:
                            dn_line_to_so_line[dn_ln["lineId"]] = so_lid

                    # Rekey raw_deltas (dn_lid → delta) to so_lid → delta.
                    for dn_lid, delta in raw_deltas.items():
                        so_lid = dn_line_to_so_line.get(dn_lid)
                        if so_lid:
                            _so_line_deltas_from_dn[so_lid] = (
                                _so_line_deltas_from_dn.get(so_lid, _ZERO) + delta
                            )

                    if _so_line_deltas_from_dn:
                        await _reconcile_line_counters(
                            db,
                            source_collection=_SO_COL,
                            source_doc_entry=_so_doc_entry_from_dn_for_update,
                            org_id=org_id,
                            user_id=user_id,
                            ari_doc_entry=doc_entry,
                            line_deltas=_so_line_deltas_from_dn,
                            cap_check=True,
                        )

                        # Mirror T-201.7's $pull-stale / $push-fresh for SO lines.
                        now_ref_so_dn = updates.get("updatedAt") or _now()

                        # Build old ARI lineId → SO line ID map via the DN-line bridge.
                        old_ari_line_to_so_line_dn: Dict[str, str] = {}
                        for old_ln in raw.get("lines", []):
                            ari_lid = old_ln.get("lineId")
                            old_base_dn = old_ln.get("baseDocRef") or {}
                            dn_lid_old = old_base_dn.get("lineId") or old_base_dn.get(
                                "line_id"
                            )
                            if ari_lid and dn_lid_old:
                                so_lid_mapped = dn_line_to_so_line.get(dn_lid_old)
                                if so_lid_mapped:
                                    old_ari_line_to_so_line_dn[ari_lid] = so_lid_mapped

                        # $pull stale per-line refs from SO lines.
                        for so_lid_old in set(old_ari_line_to_so_line_dn.values()):
                            await db[_SO_COL].update_one(
                                {
                                    "docEntry": _so_doc_entry_from_dn_for_update,
                                    "organizationId": org_id,
                                    "lines.lineId": so_lid_old,
                                },
                                {
                                    "$pull": {
                                        "lines.$.targetDocRefs": {"docId": doc_entry}
                                    },
                                },
                            )

                        # $push fresh per-line refs onto SO lines.
                        new_doc_number_so_dn = raw.get("docNumber")
                        for new_ln in new_lines:
                            new_base_dn = new_ln.get("baseDocRef") or {}
                            dn_lid_for_new = new_base_dn.get(
                                "lineId"
                            ) or new_base_dn.get("line_id")
                            new_ari_line_id = new_ln.get("lineId")
                            if dn_lid_for_new and new_ari_line_id:
                                so_lid_new = dn_line_to_so_line.get(dn_lid_for_new)
                                if so_lid_new:
                                    new_ari_so_line_ref = {
                                        "docType": _DOC_TYPE,
                                        "docId": doc_entry,
                                        "docNumber": new_doc_number_so_dn,
                                        "lineId": new_ari_line_id,
                                    }
                                    await db[_SO_COL].update_one(
                                        {
                                            "docEntry": _so_doc_entry_from_dn_for_update,
                                            "organizationId": org_id,
                                            "lines.lineId": so_lid_new,
                                        },
                                        {
                                            "$push": {
                                                "lines.$.targetDocRefs": new_ari_so_line_ref
                                            },
                                            "$set": {
                                                "updatedAt": now_ref_so_dn,
                                                "updatedBy": user_id,
                                            },
                                        },
                                    )

        # ----------------------------------------------------------------
        # T-201.9: from-SO counter reconciliation (mirrors from-Delivery above).
        # Applies when this ARI is anchored to a Sales Order (baseDocRef.docType=="SO").
        # ----------------------------------------------------------------
        if _so_doc_entry_for_update:
            # Build old SO-line totals: so_line_id → sum of old invoiced qty.
            old_so_totals: Dict[str, Decimal] = {}
            for old_ln in raw.get("lines", []):
                old_base = old_ln.get("baseDocRef") or {}
                so_lid = old_base.get("lineId") or old_base.get("line_id")
                if so_lid:
                    old_qty = Decimal(
                        str(old_ln.get("invoicedQty", old_ln.get("quantity", 0)))
                    )
                    old_so_totals[so_lid] = old_so_totals.get(so_lid, _ZERO) + old_qty

            # Build new SO-line totals: so_line_id → sum of new qty.
            new_so_totals: Dict[str, Decimal] = {}
            for new_ln in new_lines:
                new_base = new_ln.get("baseDocRef") or {}
                so_lid = new_base.get("lineId") or new_base.get("line_id")
                if so_lid:
                    new_qty = Decimal(str(new_ln.get("quantity", 0)))
                    new_so_totals[so_lid] = new_so_totals.get(so_lid, _ZERO) + new_qty
                else:
                    logger.warning(
                        "[ARInvoiceService] update_ar_invoice '%s': new line '%s' "
                        "has no baseDocRef.lineId — cannot reconcile SO counter for it.",
                        doc_entry,
                        new_ln.get("lineId", "?"),
                    )

            all_so_line_ids = set(old_so_totals.keys()) | set(new_so_totals.keys())

            if all_so_line_ids:
                so_raw_deltas: Dict[str, Decimal] = {}
                for so_lid in all_so_line_ids:
                    old_qty_d = old_so_totals.get(so_lid, _ZERO)
                    new_qty_d = new_so_totals.get(so_lid, _ZERO)
                    delta = new_qty_d - old_qty_d
                    if abs(delta) > _TOLERANCE:
                        so_raw_deltas[so_lid] = delta
                        _dn_line_deltas[so_lid] = float(delta)

                if so_raw_deltas:
                    await _reconcile_line_counters(
                        db,
                        source_collection=_SO_COL,
                        source_doc_entry=_so_doc_entry_for_update,
                        org_id=org_id,
                        user_id=user_id,
                        ari_doc_entry=doc_entry,
                        line_deltas=so_raw_deltas,
                        cap_check=True,
                    )

            # T-201.9 chain-ref cleanup: mirror T-201.7's $pull-stale / $push-fresh
            # pattern but targeting SO lines instead of DN lines.
            now_ref_so = updates.get("updatedAt") or _now()

            # Build old ARI lineId → SO line ID map.
            old_ari_line_to_so_line: Dict[str, str] = {}
            for old_ln in raw.get("lines", []):
                ari_lid = old_ln.get("lineId")
                old_base = old_ln.get("baseDocRef") or {}
                so_lid = old_base.get("lineId") or old_base.get("line_id")
                if ari_lid and so_lid:
                    old_ari_line_to_so_line[ari_lid] = so_lid

            # $pull stale per-line refs from SO lines.
            for so_lid_old in set(old_ari_line_to_so_line.values()):
                await db[_SO_COL].update_one(
                    {
                        "docEntry": _so_doc_entry_for_update,
                        "organizationId": org_id,
                        "lines.lineId": so_lid_old,
                    },
                    {
                        "$pull": {"lines.$.targetDocRefs": {"docId": doc_entry}},
                    },
                )

            # $push fresh per-line refs onto SO lines.
            new_doc_number_so = raw.get("docNumber")  # docNumber is stable on update
            for new_ln in new_lines:
                new_base = new_ln.get("baseDocRef") or {}
                so_lid_new = new_base.get("lineId") or new_base.get("line_id")
                new_ari_line_id = new_ln.get("lineId")
                if so_lid_new and new_ari_line_id:
                    new_ari_line_ref_so = {
                        "docType": _DOC_TYPE,
                        "docId": doc_entry,
                        "docNumber": new_doc_number_so,
                        "lineId": new_ari_line_id,
                    }
                    await db[_SO_COL].update_one(
                        {
                            "docEntry": _so_doc_entry_for_update,
                            "organizationId": org_id,
                            "lines.lineId": so_lid_new,
                        },
                        {
                            "$push": {"lines.$.targetDocRefs": new_ari_line_ref_so},
                            "$set": {"updatedAt": now_ref_so, "updatedBy": user_id},
                        },
                    )

    await db[_ARI_COL].update_one(
        {"docEntry": doc_entry, "organizationId": org_id},
        {"$set": updates},
    )

    # --------------------------------------------------------------------
    # After all $inc operations: check if the source document (DN or SO)
    # needs auto-close / auto-reopen.
    # --------------------------------------------------------------------
    if _delivery_doc_entry_for_update and _dn_line_deltas:
        dn_reloaded = await db[_DN_COL].find_one(
            {"docEntry": _delivery_doc_entry_for_update, "organizationId": org_id}
        )
        # Reason: _auto_close_if_fully_invoiced and _auto_reopen_if_not_fully_invoiced
        # both short-circuit if the precondition is not met, so it is safe to call them
        # unconditionally — only one (or neither) will write to the DB.
        await _auto_close_if_fully_invoiced(
            db,
            doc_collection=_DN_COL,
            audit_collection=_DN_AUDIT_COL,
            doc_entry=_delivery_doc_entry_for_update,
            doc_raw=dn_reloaded,
            org_id=org_id,
            user_id=user_id,
            extra_detail={
                "triggeredByAriDocEntry": doc_entry,
                "triggeredByAriDocNumber": raw.get("docNumber"),
                "trigger": "invoice_edit",
            },
        )
        await _auto_reopen_if_not_fully_invoiced(
            db,
            doc_collection=_DN_COL,
            audit_collection=_DN_AUDIT_COL,
            doc_entry=_delivery_doc_entry_for_update,
            doc_raw=dn_reloaded,
            org_id=org_id,
            user_id=user_id,
            extra_detail={
                "triggeredByAriDocEntry": doc_entry,
                "triggeredByAriDocNumber": raw.get("docNumber"),
                "trigger": "invoice_edit",
            },
        )

    # T-201.9: from-SO auto-close / auto-reopen after reconciliation.
    if _so_doc_entry_for_update and _dn_line_deltas:
        so_reloaded_update = await db[_SO_COL].find_one(
            {"docEntry": _so_doc_entry_for_update, "organizationId": org_id}
        )
        await _auto_close_if_fully_invoiced(
            db,
            doc_collection=_SO_COL,
            audit_collection=_SO_AUDIT_COL,
            doc_entry=_so_doc_entry_for_update,
            doc_raw=so_reloaded_update,
            org_id=org_id,
            user_id=user_id,
            extra_detail={
                "triggeredByAriDocEntry": doc_entry,
                "triggeredByAriDocNumber": raw.get("docNumber"),
                "trigger": "invoice_edit",
            },
        )
        await _auto_reopen_if_not_fully_invoiced(
            db,
            doc_collection=_SO_COL,
            audit_collection=_SO_AUDIT_COL,
            doc_entry=_so_doc_entry_for_update,
            doc_raw=so_reloaded_update,
            org_id=org_id,
            user_id=user_id,
            extra_detail={
                "triggeredByAriDocEntry": doc_entry,
                "triggeredByAriDocNumber": raw.get("docNumber"),
                "trigger": "invoice_edit",
            },
        )

    # T-201.9 follow-up: from-Delivery ARI → SO auto-close / auto-reopen.
    # When the DN-derived SO bubble-up was performed, also run auto-close / auto-reopen
    # on the parent SO so that a mixed SO can auto-close when all lines are invoiced.
    if _so_doc_entry_from_dn_for_update and _so_line_deltas_from_dn:
        so_reloaded_from_dn = await db[_SO_COL].find_one(
            {"docEntry": _so_doc_entry_from_dn_for_update, "organizationId": org_id}
        )
        await _auto_close_if_fully_invoiced(
            db,
            doc_collection=_SO_COL,
            audit_collection=_SO_AUDIT_COL,
            doc_entry=_so_doc_entry_from_dn_for_update,
            doc_raw=so_reloaded_from_dn,
            org_id=org_id,
            user_id=user_id,
            extra_detail={
                "triggeredByAriDocEntry": doc_entry,
                "triggeredByAriDocNumber": raw.get("docNumber"),
                "trigger": "invoice_edit",
                "soLineDeltas": {
                    k: float(v) for k, v in _so_line_deltas_from_dn.items()
                },
            },
        )
        await _auto_reopen_if_not_fully_invoiced(
            db,
            doc_collection=_SO_COL,
            audit_collection=_SO_AUDIT_COL,
            doc_entry=_so_doc_entry_from_dn_for_update,
            doc_raw=so_reloaded_from_dn,
            org_id=org_id,
            user_id=user_id,
            extra_detail={
                "triggeredByAriDocEntry": doc_entry,
                "triggeredByAriDocNumber": raw.get("docNumber"),
                "trigger": "invoice_edit",
                "soLineDeltas": {
                    k: float(v) for k, v in _so_line_deltas_from_dn.items()
                },
            },
        )

    audit_detail: Dict[str, Any] = {"updatedFields": list(updates.keys())}
    if _dn_line_deltas:
        # Reason: key is "soLineDeltas" for from-SO ARIs, "dnLineDeltas" for from-Delivery.
        # The _dn_line_deltas dict is reused for both paths (variable name is historical).
        if _so_doc_entry_for_update:
            audit_detail["soLineDeltas"] = _dn_line_deltas
        else:
            audit_detail["dnLineDeltas"] = _dn_line_deltas
    if _so_line_deltas_from_dn:
        # Reason: from-Delivery ARI update also touched SO lines; record separately.
        audit_detail["soLineDeltas"] = {
            k: float(v) for k, v in _so_line_deltas_from_dn.items()
        }

    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="update",
        user_id=user_id,
        detail=audit_detail,
    )

    updated_raw = await db[_ARI_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if updated_raw is None:
        return None
    updated_raw.pop("_id", None)
    return _doc_to_response(updated_raw)


async def delete_ar_invoice(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    org_id: str,
    user_id: str,
) -> bool:
    """
    Hard-delete a DRAFT AR Invoice.

    Only DRAFT AR Invoices may be deleted.  If the invoice was created from a
    Delivery, both the Delivery line invoiced_qty counters AND the parent SO line
    invoiced_qty counters are decremented (DN bubble-up release).  This ensures
    mixed SOs reopen correctly when a from-Delivery ARI is deleted.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the AR Invoice.
        org_id:    Organisation UUID for scoping.
        user_id:   Authenticated user performing the deletion.

    Returns:
        True if deleted, False if not found.

    Raises:
        ValueError: If the invoice status is not DRAFT.
    """
    raw = await db[_ARI_COL].find_one({"docEntry": doc_entry, "organizationId": org_id})
    if raw is None:
        return False

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"AR Invoice '{doc_entry}' cannot be deleted: "
            f"status is '{raw['status']}' (only DRAFT AR Invoices may be deleted)"
        )

    # Release source line invoiced_qty when a DRAFT invoice is deleted.
    # Discrimination: baseDocRef.docType determines whether source is DN or SO.
    # - from-Delivery ARIs: release deliveries_v2 line invoicedQty.
    # - from-SO ARIs:       release sales_orders_v2 line invoicedQty.
    # - direct-create ARIs: no source counters to release.
    base_ref = raw.get("baseDocRef") or {}
    _delete_base_doc_id = base_ref.get("docId") or base_ref.get("doc_id")
    _delete_base_doc_type = (
        base_ref.get("docType") or base_ref.get("doc_type") or ""
    ).upper()
    delivery_doc_entry = (
        _delete_base_doc_id if _delete_base_doc_type == "DELIVERY" else None
    )
    so_doc_entry_for_delete = (
        _delete_base_doc_id if _delete_base_doc_type == "SO" else None
    )

    _decremented_any_dn_line = False
    if delivery_doc_entry:
        now = _now()
        for ln in raw.get("lines", []):
            line_base_ref = ln.get("baseDocRef") or {}
            dn_line_id = line_base_ref.get("lineId") or line_base_ref.get("line_id")
            if dn_line_id:
                release_qty = float(
                    Decimal(str(ln.get("invoicedQty", ln.get("quantity", 0))))
                )
                await db[_DN_COL].update_one(
                    {
                        "docEntry": delivery_doc_entry,
                        "organizationId": org_id,
                        "lines.lineId": dn_line_id,
                    },
                    {
                        "$inc": {"lines.$.invoicedQty": -release_qty},
                        "$set": {"updatedAt": now, "updatedBy": user_id},
                    },
                )
                _decremented_any_dn_line = True

        # If the decrement made the DN no longer fully invoiced AND the DN is
        # currently CLOSED, reopen it.
        if _decremented_any_dn_line:
            dn_reloaded = await db[_DN_COL].find_one(
                {"docEntry": delivery_doc_entry, "organizationId": org_id}
            )
            await _auto_reopen_if_not_fully_invoiced(
                db,
                doc_collection=_DN_COL,
                audit_collection=_DN_AUDIT_COL,
                doc_entry=delivery_doc_entry,
                doc_raw=dn_reloaded,
                org_id=org_id,
                user_id=user_id,
                extra_detail={
                    "triggeredByAriDocEntry": doc_entry,
                    "triggeredByAriDocNumber": raw.get("docNumber"),
                    "trigger": "invoice_delete",
                },
            )

        # T-201.7 fix: clean dangling targetDocRefs on the Delivery so the
        # Document Chain card does not surface a 404-dead link after delete.
        dn_line_ids_to_clean = [
            (ln.get("baseDocRef") or {}).get("lineId")
            or (ln.get("baseDocRef") or {}).get("line_id")
            for ln in raw.get("lines", [])
        ]
        await _pull_dangling_chain_refs(
            db,
            source_collection=_DN_COL,
            source_doc_entry=delivery_doc_entry,
            org_id=org_id,
            user_id=user_id,
            target_doc_entry=doc_entry,
            affected_line_ids=[lid for lid in dn_line_ids_to_clean if lid],
        )

        # T-201.9 follow-up: SO bubble-up release for from-Delivery ARI delete.
        # Load the DN to find its parent SO and the DN-line → SO-line mapping.
        # If the DN has no parent SO (standalone DN), skip silently.
        dn_for_delete_so = await db[_DN_COL].find_one(
            {"docEntry": delivery_doc_entry, "organizationId": org_id}
        )
        if dn_for_delete_so is not None:
            dn_del_base_ref = dn_for_delete_so.get("baseDocRef") or {}
            so_doc_entry_from_dn_delete = dn_del_base_ref.get(
                "docId"
            ) or dn_del_base_ref.get("doc_id")
            if so_doc_entry_from_dn_delete:
                # Build dn_line_id → so_line_id map from DN embedded lines.
                dn_del_line_to_so: Dict[str, str] = {}
                for dn_ln in dn_for_delete_so.get("lines", []):
                    dn_ln_base = dn_ln.get("baseDocRef") or {}
                    so_lid = dn_ln_base.get("lineId") or dn_ln_base.get("line_id")
                    if so_lid:
                        dn_del_line_to_so[dn_ln["lineId"]] = so_lid

                # Release SO-line invoicedQty using negative deltas.
                so_del_line_deltas: Dict[str, Decimal] = {}
                for ln in raw.get("lines", []):
                    line_base = ln.get("baseDocRef") or {}
                    dn_lid = line_base.get("lineId") or line_base.get("line_id")
                    if dn_lid:
                        so_lid = dn_del_line_to_so.get(dn_lid)
                        if so_lid:
                            release_qty = Decimal(
                                str(ln.get("invoicedQty", ln.get("quantity", 0)))
                            )
                            so_del_line_deltas[so_lid] = (
                                so_del_line_deltas.get(so_lid, _ZERO) - release_qty
                            )

                if so_del_line_deltas:
                    # cap_check=False: releasing qty; no cap applies.
                    await _reconcile_line_counters(
                        db,
                        source_collection=_SO_COL,
                        source_doc_entry=so_doc_entry_from_dn_delete,
                        org_id=org_id,
                        user_id=user_id,
                        ari_doc_entry=doc_entry,
                        line_deltas=so_del_line_deltas,
                        cap_check=False,
                    )

                    so_reloaded_del = await db[_SO_COL].find_one(
                        {
                            "docEntry": so_doc_entry_from_dn_delete,
                            "organizationId": org_id,
                        }
                    )
                    await _auto_reopen_if_not_fully_invoiced(
                        db,
                        doc_collection=_SO_COL,
                        audit_collection=_SO_AUDIT_COL,
                        doc_entry=so_doc_entry_from_dn_delete,
                        doc_raw=so_reloaded_del,
                        org_id=org_id,
                        user_id=user_id,
                        extra_detail={
                            "triggeredByAriDocEntry": doc_entry,
                            "triggeredByAriDocNumber": raw.get("docNumber"),
                            "trigger": "invoice_delete",
                        },
                    )

                # Clean dangling targetDocRefs on the SO (header + per-line).
                so_line_ids_to_clean_from_dn = list(so_del_line_deltas.keys())
                await _pull_dangling_chain_refs(
                    db,
                    source_collection=_SO_COL,
                    source_doc_entry=so_doc_entry_from_dn_delete,
                    org_id=org_id,
                    user_id=user_id,
                    target_doc_entry=doc_entry,
                    affected_line_ids=so_line_ids_to_clean_from_dn,
                )

    # T-201.9: release SO line invoicedQty for from-SO ARIs on delete.
    _decremented_any_so_line = False
    if so_doc_entry_for_delete:
        now = _now()
        so_line_ids_to_clean = []
        for ln in raw.get("lines", []):
            line_base_ref = ln.get("baseDocRef") or {}
            so_line_id = line_base_ref.get("lineId") or line_base_ref.get("line_id")
            if so_line_id:
                release_qty = float(
                    Decimal(str(ln.get("invoicedQty", ln.get("quantity", 0))))
                )
                await db[_SO_COL].update_one(
                    {
                        "docEntry": so_doc_entry_for_delete,
                        "organizationId": org_id,
                        "lines.lineId": so_line_id,
                    },
                    {
                        "$inc": {"lines.$.invoicedQty": -release_qty},
                        "$set": {"updatedAt": now, "updatedBy": user_id},
                    },
                )
                _decremented_any_so_line = True
                so_line_ids_to_clean.append(so_line_id)

        # If the decrement made the SO no longer fully invoiced AND the SO is
        # currently CLOSED, reopen it.
        if _decremented_any_so_line:
            so_reloaded_delete = await db[_SO_COL].find_one(
                {"docEntry": so_doc_entry_for_delete, "organizationId": org_id}
            )
            await _auto_reopen_if_not_fully_invoiced(
                db,
                doc_collection=_SO_COL,
                audit_collection=_SO_AUDIT_COL,
                doc_entry=so_doc_entry_for_delete,
                doc_raw=so_reloaded_delete,
                org_id=org_id,
                user_id=user_id,
                extra_detail={
                    "triggeredByAriDocEntry": doc_entry,
                    "triggeredByAriDocNumber": raw.get("docNumber"),
                    "trigger": "invoice_delete",
                },
            )

        # T-201.9 chain-ref cleanup: pull dangling refs from SO after delete.
        await _pull_dangling_chain_refs(
            db,
            source_collection=_SO_COL,
            source_doc_entry=so_doc_entry_for_delete,
            org_id=org_id,
            user_id=user_id,
            target_doc_entry=doc_entry,
            affected_line_ids=so_line_ids_to_clean,
        )

    # Reason: write audit BEFORE delete so the trail survives deletion.
    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="delete",
        user_id=user_id,
        detail={"docNumber": raw.get("docNumber")},
    )

    await db[_ARI_COL].delete_one({"docEntry": doc_entry, "organizationId": org_id})
    return True


async def transition_status(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    request_body: ARInvoiceStatusTransitionRequest,
    org_id: str,
    user_id: str,
    auth_token: Optional[str] = None,
) -> Optional[ARInvoiceResponse]:
    """
    Transition an AR Invoice to a new status.

    Uses assert_legal_transition("AR_INVOICE", ...) as the sole state-machine
    gatekeeper (with one exception: OPEN → CANCELLED for super_admin override,
    which is handled as a special case because it is not in LEGAL_TRANSITIONS
    to prevent accidental cancellation of posted invoices).

    Special handling per target status:

    DRAFT → OPEN (primary accounting event):
      1. Re-validate revenue_account_id per line (catch deactivations since DRAFT).
      2. Re-validate customer_finance_ext (for T-100.9b arControlAccountId).
      3. Emit sales_invoice_posted outbox event.
      4. Persist outbox_event_id on header.
      5. Audit-log with outbox_event_id.

    OPEN → CANCELLED (super_admin override; not in LEGAL_TRANSITIONS):
      1. Emit sales_invoice_cancelled event with original_event_id.
      2. Decrement source Delivery line invoiced_qty back (if from-Delivery).
      3. Audit-log.

    OPEN → PARTLY_CLOSED, PARTLY_CLOSED → CLOSED:
      These transitions are normally driven by Customer Receipt (T-100.10)
      allocations.  Direct calls via this endpoint are allowed for super_admin
      manual mark-paid workflows.  No outbox event emitted here — the Receipt
      handler emits its own event.

    Args:
        db:           Motor database instance.
        doc_entry:    UUID of the AR Invoice.
        request_body: Transition request with new_status and optional reason.
        org_id:       Organisation UUID for scoping.
        user_id:      Authenticated user performing the transition.

    Returns:
        Updated ARInvoiceResponse, or None if the invoice was not found.

    Raises:
        ValueError: If the transition is illegal or validation fails.
    """
    raw = await db[_ARI_COL].find_one({"docEntry": doc_entry, "organizationId": org_id})
    if raw is None:
        return None

    current_status = DocumentStatus(raw["status"])
    new_status = request_body.new_status

    # Special case: OPEN → CANCELLED is not in LEGAL_TRANSITIONS (intentionally).
    # It is allowed as a super_admin override but not via the standard transition table.
    # Reason: cancelling a posted AR Invoice is exceptional; it must be explicit.
    is_open_to_cancelled = (
        current_status == DocumentStatus.OPEN and new_status == DocumentStatus.CANCELLED
    )

    if not is_open_to_cancelled:
        # Reason: assert_legal_transition raises ValueError for illegal transitions.
        assert_legal_transition(_DOC_TYPE, current_status, new_status)

    now = _now()

    # -----------------------------------------------------------------------
    # DRAFT → OPEN: primary accounting event
    # -----------------------------------------------------------------------
    if current_status == DocumentStatus.DRAFT and new_status == DocumentStatus.OPEN:
        invoice_lines = raw.get("lines", [])

        # Step 1: Re-validate revenue_account_id per line (catch deactivations).
        # Reason: call finance microservice via HTTP — sale_item_finance_ext is in
        # the finance service's MySQL DB, not in the ops MongoDB.
        # Collect ext records so the isStock re-check (below) can reuse them.
        transition_ext_records: Dict[str, Any] = {}  # item_id → ext or None
        for ln in invoice_lines:
            item_id = ln["itemId"]
            existing_rev_account = ln.get("revenueAccountId", "")

            try:
                ext_record = await _get_item_finance_ext(item_id, org_id, auth_token)
            except ValueError:
                ext_record = None

            if ext_record is None or not (
                ext_record.get("revenueAccountId")
                or ext_record.get("revenue_account_id")
            ):
                raise ValueError(
                    f"Cannot post AR Invoice '{doc_entry}': item '{item_id}' no longer "
                    f"has a valid sale_item_finance_ext.revenueAccountId. "
                    f"(Previously snapshotted as '{existing_rev_account}'.) "
                    "Fix the item finance configuration before posting."
                )

            transition_ext_records[item_id] = ext_record

        # Step 1b: Re-validate isStock for direct-create ARIs.
        # Reason: an admin may have flipped an item from service to stock while this
        # ARI sat in DRAFT.  Re-check before posting to prevent revenue-without-COGS.
        # Only applies to direct-create ARIs (no header baseDocRef pointing to a DN or SO).
        # From-SO ARIs: service-only items were already validated at create time;
        # re-gating at OPEN would double-check something we already guaranteed.
        _transition_base_ref = raw.get("baseDocRef") or {}
        _transition_is_direct = not bool(
            _transition_base_ref.get("docId") or _transition_base_ref.get("doc_id")
        )
        if _transition_is_direct:
            for ln in invoice_lines:
                item_id = ln["itemId"]
                item_name = ln.get("itemName", item_id)
                ext_record = transition_ext_records.get(item_id)
                # Reason: default True (conservative) if field absent — matches backfill.
                if ext_record is not None and ext_record.get("isStock", True):
                    raise ValueError(
                        f"Cannot post AR Invoice '{doc_entry}': item '{item_name}' "
                        "is now classified as a stock item. Create a Delivery Note "
                        "first, then invoice from the Delivery."
                    )

        # Step 2: Re-validate customer_finance_ext (for T-100.9b arControlAccountId).
        # Reason: call finance microservice via HTTP — customer_finance_ext is in
        # the finance service's MySQL DB, not in the ops MongoDB.
        customer_id = raw.get("customerId", "")
        cust_ext = await _get_customer_finance_ext(customer_id, org_id, auth_token)
        if cust_ext is None:
            logger.warning(
                "[ARInvoiceService] customer_finance_ext missing for customer '%s' org '%s'. "
                "T-100.9b finance handler will need arControlAccountId. "
                "Proceed with posting — finance side handles this requirement.",
                customer_id,
                org_id,
            )
        # Reason: we log but do not block. arControlAccountId is T-100.9b's concern.
        # The ops side should not be gated on finance config. T-100.9b will validate
        # the full account resolution before posting the JE.

        # Step 3: Emit sales_invoice_posted outbox event.
        event_payload = _build_outbox_payload(raw, event_type="sales_invoice_posted")
        emitted_event_id: Optional[str] = None

        try:
            from src.modules.finance_bridge.outbox_writer import (
                OutboxWriter,
            )  # noqa: PLC0415

            emitted_event_id = await OutboxWriter.publish(
                db=db,
                event_type="sales_invoice_posted",
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
                "[ARInvoiceService] Failed to emit sales_invoice_posted for '%s': %s",
                doc_entry,
                exc,
            )

        # Step 4: Persist new status + outbox audit fields.
        set_fields: Dict[str, Any] = {
            "status": new_status.value,
            "outboxEventId": str(emitted_event_id) if emitted_event_id else None,
            "outboxEventEmittedAt": now if emitted_event_id else None,
            "updatedAt": now,
            "updatedBy": user_id,
        }
        await db[_ARI_COL].update_one(
            {"docEntry": doc_entry, "organizationId": org_id},
            {"$set": set_fields},
        )

        # Step 5: Audit.
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
    # OPEN → CANCELLED: reverse the posted invoice
    # -----------------------------------------------------------------------
    elif is_open_to_cancelled:
        # Step 1: Emit sales_invoice_cancelled event.
        original_event_id = raw.get("outboxEventId")
        cancel_payload = _build_outbox_payload(
            raw,
            event_type="sales_invoice_cancelled",
            original_event_id=original_event_id,
        )
        cancelled_event_id: Optional[str] = None

        try:
            from src.modules.finance_bridge.outbox_writer import (
                OutboxWriter,
            )  # noqa: PLC0415

            cancelled_event_id = await OutboxWriter.publish(
                db=db,
                event_type="sales_invoice_cancelled",
                organization_id=org_id,
                company_code=raw.get("companyCode", "1000"),
                payload=cancel_payload,
                source_user_id=user_id,
                source_document_id=doc_entry,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "[ARInvoiceService] Failed to emit sales_invoice_cancelled for '%s': %s",
                doc_entry,
                exc,
            )

        # Step 2: Decrement source line invoiced_qty back when cancelled.
        # Discrimination: baseDocRef.docType distinguishes DN from SO.
        base_ref = raw.get("baseDocRef") or {}
        _cancel_base_doc_id = base_ref.get("docId") or base_ref.get("doc_id")
        _cancel_base_doc_type = (
            base_ref.get("docType") or base_ref.get("doc_type") or ""
        ).upper()
        delivery_doc_entry = (
            _cancel_base_doc_id if _cancel_base_doc_type == "DELIVERY" else None
        )
        so_doc_entry_for_cancel = (
            _cancel_base_doc_id if _cancel_base_doc_type == "SO" else None
        )

        _cancel_decremented_any = False
        if delivery_doc_entry:
            for ln in raw.get("lines", []):
                line_base_ref = ln.get("baseDocRef") or {}
                dn_line_id = line_base_ref.get("lineId") or line_base_ref.get("line_id")
                if dn_line_id:
                    restore_qty = float(
                        Decimal(str(ln.get("invoicedQty", ln.get("quantity", 0))))
                    )
                    await db[_DN_COL].update_one(
                        {
                            "docEntry": delivery_doc_entry,
                            "organizationId": org_id,
                            "lines.lineId": dn_line_id,
                        },
                        {
                            "$inc": {"lines.$.invoicedQty": -restore_qty},
                            "$set": {"updatedAt": now, "updatedBy": user_id},
                        },
                    )
                    _cancel_decremented_any = True

            # If the decrement made the DN no longer fully invoiced AND the DN is
            # currently CLOSED, reopen it.
            if _cancel_decremented_any:
                dn_reloaded_cancel = await db[_DN_COL].find_one(
                    {"docEntry": delivery_doc_entry, "organizationId": org_id}
                )
                await _auto_reopen_if_not_fully_invoiced(
                    db,
                    doc_collection=_DN_COL,
                    audit_collection=_DN_AUDIT_COL,
                    doc_entry=delivery_doc_entry,
                    doc_raw=dn_reloaded_cancel,
                    org_id=org_id,
                    user_id=user_id,
                    extra_detail={
                        "triggeredByAriDocEntry": doc_entry,
                        "triggeredByAriDocNumber": raw.get("docNumber"),
                        "trigger": "invoice_cancel",
                    },
                )

            # T-201.9 follow-up: SO bubble-up release for from-Delivery ARI cancel.
            # Load the DN (already fetched as dn_reloaded_cancel if decremented,
            # else fetch now) to get the DN's parent SO and build the release deltas.
            dn_for_cancel_so = (
                dn_reloaded_cancel
                if _cancel_decremented_any
                else await db[_DN_COL].find_one(
                    {"docEntry": delivery_doc_entry, "organizationId": org_id}
                )
            )
            if dn_for_cancel_so is not None:
                dn_cancel_base = dn_for_cancel_so.get("baseDocRef") or {}
                so_doc_entry_from_dn_cancel = dn_cancel_base.get(
                    "docId"
                ) or dn_cancel_base.get("doc_id")
                if so_doc_entry_from_dn_cancel:
                    # Build dn_line_id → so_line_id map from DN embedded lines.
                    dn_cancel_line_to_so: Dict[str, str] = {}
                    for dn_ln in dn_for_cancel_so.get("lines", []):
                        dn_ln_base = dn_ln.get("baseDocRef") or {}
                        so_lid = dn_ln_base.get("lineId") or dn_ln_base.get("line_id")
                        if so_lid:
                            dn_cancel_line_to_so[dn_ln["lineId"]] = so_lid

                    # Build negative SO-line deltas (release semantics).
                    so_cancel_line_deltas: Dict[str, Decimal] = {}
                    for ln in raw.get("lines", []):
                        line_base = ln.get("baseDocRef") or {}
                        dn_lid = line_base.get("lineId") or line_base.get("line_id")
                        if dn_lid:
                            so_lid = dn_cancel_line_to_so.get(dn_lid)
                            if so_lid:
                                release_qty = Decimal(
                                    str(ln.get("invoicedQty", ln.get("quantity", 0)))
                                )
                                so_cancel_line_deltas[so_lid] = (
                                    so_cancel_line_deltas.get(so_lid, _ZERO)
                                    - release_qty
                                )

                    if so_cancel_line_deltas:
                        # cap_check=False: releasing qty; no cap applies on release.
                        await _reconcile_line_counters(
                            db,
                            source_collection=_SO_COL,
                            source_doc_entry=so_doc_entry_from_dn_cancel,
                            org_id=org_id,
                            user_id=user_id,
                            ari_doc_entry=doc_entry,
                            line_deltas=so_cancel_line_deltas,
                            cap_check=False,
                        )

                        so_reloaded_cancel_so = await db[_SO_COL].find_one(
                            {
                                "docEntry": so_doc_entry_from_dn_cancel,
                                "organizationId": org_id,
                            }
                        )
                        await _auto_reopen_if_not_fully_invoiced(
                            db,
                            doc_collection=_SO_COL,
                            audit_collection=_SO_AUDIT_COL,
                            doc_entry=so_doc_entry_from_dn_cancel,
                            doc_raw=so_reloaded_cancel_so,
                            org_id=org_id,
                            user_id=user_id,
                            extra_detail={
                                "triggeredByAriDocEntry": doc_entry,
                                "triggeredByAriDocNumber": raw.get("docNumber"),
                                "trigger": "invoice_cancel",
                            },
                        )

        # T-201.9: release SO line invoicedQty for from-SO ARIs on cancellation.
        if so_doc_entry_for_cancel:
            _cancel_decremented_so_any = False
            for ln in raw.get("lines", []):
                line_base_ref = ln.get("baseDocRef") or {}
                so_line_id = line_base_ref.get("lineId") or line_base_ref.get("line_id")
                if so_line_id:
                    restore_qty = float(
                        Decimal(str(ln.get("invoicedQty", ln.get("quantity", 0))))
                    )
                    await db[_SO_COL].update_one(
                        {
                            "docEntry": so_doc_entry_for_cancel,
                            "organizationId": org_id,
                            "lines.lineId": so_line_id,
                        },
                        {
                            "$inc": {"lines.$.invoicedQty": -restore_qty},
                            "$set": {"updatedAt": now, "updatedBy": user_id},
                        },
                    )
                    _cancel_decremented_so_any = True

            if _cancel_decremented_so_any:
                so_reloaded_cancel = await db[_SO_COL].find_one(
                    {"docEntry": so_doc_entry_for_cancel, "organizationId": org_id}
                )
                await _auto_reopen_if_not_fully_invoiced(
                    db,
                    doc_collection=_SO_COL,
                    audit_collection=_SO_AUDIT_COL,
                    doc_entry=so_doc_entry_for_cancel,
                    doc_raw=so_reloaded_cancel,
                    org_id=org_id,
                    user_id=user_id,
                    extra_detail={
                        "triggeredByAriDocEntry": doc_entry,
                        "triggeredByAriDocNumber": raw.get("docNumber"),
                        "trigger": "invoice_cancel",
                    },
                )

        set_fields = {
            "status": new_status.value,
            "updatedAt": now,
            "updatedBy": user_id,
        }
        await db[_ARI_COL].update_one(
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
    # All other transitions: status flip only (PARTLY_CLOSED, CLOSED, etc.)
    # -----------------------------------------------------------------------
    else:
        set_fields = {
            "status": new_status.value,
            "updatedAt": now,
            "updatedBy": user_id,
        }
        await db[_ARI_COL].update_one(
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

    # Reload and return the updated AR Invoice.
    updated_raw = await db[_ARI_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if updated_raw is None:
        return None
    updated_raw.pop("_id", None)
    return _doc_to_response(updated_raw)
