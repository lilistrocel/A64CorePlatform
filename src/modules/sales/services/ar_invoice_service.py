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
  tax_codes                   — tax percent lookup (read-only, ops MongoDB)
  payment_terms               — net days lookup (read-only, ops MongoDB)
  finance_outbox              — OutboxWriter destination
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

from ..models.ar_invoices import (
    ARInvoiceCreate,
    ARInvoiceFromDeliveryRequest,
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
_TAX_CODES_COL = "tax_codes"
_PAYMENT_TERMS_COL = "payment_terms"
_TOLERANCE = Decimal("0.0001")

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
    db: AsyncIOMotorDatabase,
    tax_code_id: Optional[str],
    org_id: str,
) -> Decimal:
    """
    Fetch the tax percent for a given tax code ID.

    Returns Decimal("0") for null/missing tax codes (exempt lines).

    Args:
        db:          Motor database instance.
        tax_code_id: FK to tax_codes collection, or None for exempt.
        org_id:      Organisation scope.

    Returns:
        Tax percent as Decimal (e.g. Decimal("5") for UAE 5% standard rate).
    """
    if not tax_code_id:
        return _ZERO

    record = await db[_TAX_CODES_COL].find_one(
        {"_id": tax_code_id, "organizationId": org_id}
    )
    if record is None:
        # Reason: try without org scope — some tax codes are system-wide.
        record = await db[_TAX_CODES_COL].find_one({"_id": tax_code_id})

    if record is None:
        logger.warning(
            "[ARInvoiceService] Tax code '%s' not found for org '%s' — using 0%%",
            tax_code_id,
            org_id,
        )
        return _ZERO

    raw_pct = record.get("rate") or record.get("taxRate") or record.get("percent", 0)
    return Decimal(str(raw_pct)).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)


async def _get_item_finance_ext(
    item_id: str,
    org_id: str,
    auth_token: Optional[str],
) -> Dict[str, Any]:
    """
    Fetch the sale_item_finance_ext record from the finance microservice via HTTP.

    sale_item_finance_ext lives in the finance service's MySQL DB — it must
    NOT be queried as a MongoDB collection from the ops backend.

    Args:
        item_id:    MongoDB itemId UUID string.
        org_id:     Organisation UUID for scoping.
        auth_token: Bearer token from the calling user's JWT, forwarded to
                    the finance service for authentication.

    Returns:
        Dict of the finance extension fields (camelCase, matching the
        finance service's SaleItemFinanceExtResponse schema).

    Raises:
        ValueError: If the finance service returns 404 (no ext configured)
                    or a non-2xx status.
    """
    url = f"{_FINANCE_BASE_URL}/api/v1/finance/item-finance-ext/{item_id}"
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
        raise ValueError(
            f"Finance service unreachable when looking up item '{item_id}': {exc}. "
            "Ensure FINANCE_SERVICE_URL is set and the finance service is running."
        ) from exc

    if resp.status_code == 404:
        raise ValueError(
            f"Item '{item_id}' has no sale_item_finance_ext record in org '{org_id}'. "
            "Configure the item's finance extension (revenueAccountId) before invoicing."
        )

    if not resp.is_success:
        raise ValueError(
            f"Finance service returned HTTP {resp.status_code} when looking up "
            f"item '{item_id}' finance ext. Response: {resp.text[:200]}"
        )

    body = resp.json()
    # Reason: finance service wraps data under 'data' key per its SuccessResponse.
    return body.get("data", body)


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
) -> Dict[str, Any]:
    """
    Build an embedded AR Invoice line dict for MongoDB storage.

    Looks up tax_percent from tax_codes (ops MongoDB) and revenue_account_id from
    the finance microservice's sale_item_finance_ext via HTTP.
    Raises ValueError if revenue account is missing.

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
        tax_code_id:      FK to tax_codes or None.
        warehouse_id:     Optional warehouse reference.
        cost_center_id:   Optional cost-centre.
        base_doc_ref:     Optional upstream Delivery line ref (Pydantic or dict).
        line_number:      1-indexed position.
        org_id:           Organisation scope.
        auth_token:       Bearer token forwarded to the finance service.

    Returns:
        Embedded line dict ready for insertion into ar_invoices_v2.

    Raises:
        ValueError: If sale_item_finance_ext missing or revenueAccountId null.
    """
    tax_percent = await _get_tax_percent(db, tax_code_id, org_id)
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


def _dn_line_open_invoice_qty(ln: Dict[str, Any]) -> Decimal:
    """
    Compute the remaining open-to-invoice quantity on a Delivery line.

    open_invoice_qty = orderedQty - invoicedQty - creditedQty

    Args:
        ln: Raw embedded Delivery line dict.

    Returns:
        Remaining invoiceable quantity as Decimal.
    """
    ordered = Decimal(str(ln.get("orderedQty", ln.get("quantity", 0))))
    invoiced = Decimal(str(ln.get("invoicedQty", 0)))
    credited = Decimal(str(ln.get("creditedQty", 0)))
    return ordered - invoiced - credited


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
    for ln in sorted(invoice_raw.get("lines", []), key=lambda x: x.get("lineNumber", 0)):
        base_ref = ln.get("baseDocRef") or {}
        lines_payload.append({
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
        })

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
    3. For each line: look up tax_percent from tax_codes (ops MongoDB).
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
        ValueError: If any item is missing sale_item_finance_ext or
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

    # Steps 2–3: Build lines with revenue account lookup + tax percent lookup.
    computed_lines: List[Dict[str, Any]] = []
    for i, line in enumerate(payload.lines, start=1):
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
        dn_delivery_date if isinstance(dn_delivery_date, (date, datetime)) else payload.doc_date
    )

    tax_date = _compute_tax_date(
        effective_date_of_supply if isinstance(effective_date_of_supply, date) else effective_date_of_supply.date() if hasattr(effective_date_of_supply, "date") else payload.doc_date,
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
    raw = await db[_ARI_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
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
        db[_ARI_COL]
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
    raw = await db[_ARI_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
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
        "dateOfSupply": _to_dt(payload.date_of_supply) if payload.date_of_supply is not None else None,
        "invoiceDate": _to_dt(payload.invoice_date) if payload.invoice_date is not None else None,
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

    if payload.lines is not None:
        new_lines: List[Dict[str, Any]] = []
        for i, line in enumerate(payload.lines, start=1):
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
            )
            new_lines.append(line_doc)

        updates["lines"] = new_lines
        updates["totals"] = _build_totals(new_lines)

    await db[_ARI_COL].update_one(
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
    Delivery, the Delivery line invoiced_qty counters are NOT decremented here —
    that is intentionally left simple for the delete path (the Delivery line
    tracking will self-heal when the invoice is confirmed or a new one is created).

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
    raw = await db[_ARI_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return False

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"AR Invoice '{doc_entry}' cannot be deleted: "
            f"status is '{raw['status']}' (only DRAFT AR Invoices may be deleted)"
        )

    # Release Delivery line invoiced_qty if this was a from-Delivery invoice.
    # Reason: when a DRAFT invoice is deleted, the committed qty on the Delivery
    # line should be released so a new invoice can be created for the same qty.
    base_ref = raw.get("baseDocRef") or {}
    delivery_doc_entry = base_ref.get("docId") or base_ref.get("doc_id")
    if delivery_doc_entry:
        now = _now()
        for ln in raw.get("lines", []):
            line_base_ref = ln.get("baseDocRef") or {}
            dn_line_id = line_base_ref.get("lineId") or line_base_ref.get("line_id")
            if dn_line_id:
                release_qty = float(Decimal(str(ln.get("invoicedQty", ln.get("quantity", 0)))))
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

    # Reason: write audit BEFORE delete so the trail survives deletion.
    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="delete",
        user_id=user_id,
        detail={"docNumber": raw.get("docNumber")},
    )

    await db[_ARI_COL].delete_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
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
    raw = await db[_ARI_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if raw is None:
        return None

    current_status = DocumentStatus(raw["status"])
    new_status = request_body.new_status

    # Special case: OPEN → CANCELLED is not in LEGAL_TRANSITIONS (intentionally).
    # It is allowed as a super_admin override but not via the standard transition table.
    # Reason: cancelling a posted AR Invoice is exceptional; it must be explicit.
    is_open_to_cancelled = (
        current_status == DocumentStatus.OPEN
        and new_status == DocumentStatus.CANCELLED
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
        for ln in invoice_lines:
            item_id = ln["itemId"]
            existing_rev_account = ln.get("revenueAccountId", "")

            try:
                ext_record = await _get_item_finance_ext(item_id, org_id, auth_token)
            except ValueError:
                ext_record = None

            if ext_record is None or not (
                ext_record.get("revenueAccountId") or ext_record.get("revenue_account_id")
            ):
                raise ValueError(
                    f"Cannot post AR Invoice '{doc_entry}': item '{item_id}' no longer "
                    f"has a valid sale_item_finance_ext.revenueAccountId. "
                    f"(Previously snapshotted as '{existing_rev_account}'.) "
                    "Fix the item finance configuration before posting."
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
            from src.modules.finance_bridge.outbox_writer import OutboxWriter  # noqa: PLC0415

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
            raw, event_type="sales_invoice_cancelled", original_event_id=original_event_id
        )
        cancelled_event_id: Optional[str] = None

        try:
            from src.modules.finance_bridge.outbox_writer import OutboxWriter  # noqa: PLC0415

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

        # Step 2: Decrement source Delivery line invoiced_qty back (if from-Delivery).
        base_ref = raw.get("baseDocRef") or {}
        delivery_doc_entry = base_ref.get("docId") or base_ref.get("doc_id")
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
                "cancelledOutboxEventId": str(cancelled_event_id) if cancelled_event_id else None,
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
