"""
Sales Module — Customer Receipt Service Layer (T-100.10)

Business logic for the Customer Receipt (IPAY) document type.

Responsibilities
----------------
- Create a Customer Receipt (DRAFT) with manual allocation list.
- Create a Receipt from a single AR Invoice (convenience shortcut).
- Retrieve a single receipt by doc_entry UUID.
- Paginated list with filters (status, customer_id, date range).
- Partial update (DRAFT only); replaces allocation set wholesale when supplied.
- Hard-delete a DRAFT receipt.
- Status transitions with legal-transition guard:
  - DRAFT → OPEN: the primary payment event.
    1. Re-validate each allocation target AR Invoice (status, open_amount,
       customer match — catches concurrent payments).
    2. For each allocation, atomically increment AR Invoice paid_amount via $inc.
    3. Transition each AR Invoice to PARTLY_CLOSED or CLOSED as appropriate.
    4. Write Receipt back-pointer onto each AR Invoice's target_doc_refs.
    5. Emit customer_payment_received outbox event.
    6. Persist outbox_event_id on receipt header.
  - OPEN → CANCELLED:
    1. Reverse all AR Invoice paid_amount increments.
    2. Restore AR Invoice status (OPEN if no remaining receipts; PARTLY_CLOSED
       if other receipts still exist for that invoice).
    3. Emit customer_payment_cancelled event with original_event_id.

Collections used
----------------
  customer_receipts_v2        — one document per Receipt header + embedded allocations
  customer_receipts_v2_audit  — append-only audit trail
  ar_invoices_v2              — target AR Invoice collection (paid_amount updates)
  finance_outbox              — OutboxWriter destination

No finance microservice changes are made in this task — the JE posting
(DR Bank / CR AR) is handled by T-100.10.1's finance consumer.
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

from ..models.customer_receipts import (
    CustomerReceiptCreate,
    CustomerReceiptFromInvoiceRequest,
    CustomerReceiptListItem,
    CustomerReceiptResponse,
    CustomerReceiptStatusTransitionRequest,
    CustomerReceiptUpdate,
    ReceiptAllocationResponse,
)

logger = logging.getLogger(__name__)

_CR_COL = "customer_receipts_v2"
_AUDIT_COL = "customer_receipts_v2_audit"
_ARI_COL = "ar_invoices_v2"
_TOLERANCE = Decimal("0.005")
_TWOPLACES = Decimal("0.01")
_ZERO = Decimal("0")
_DOC_TYPE = "IPAY"

# AR Invoice statuses that are valid targets for payment.
_PAYABLE_STATUSES = {DocumentStatus.OPEN.value, DocumentStatus.PARTLY_CLOSED.value}


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

    Mirrors the same helper in ar_invoice_service.py.

    Args:
        d: A date or datetime value.

    Returns:
        A UTC midnight datetime.
    """
    if isinstance(d, datetime):
        return d if d.tzinfo is not None else d.replace(tzinfo=timezone.utc)
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


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


def _raw_allocation_to_response(alloc: Dict[str, Any]) -> ReceiptAllocationResponse:
    """
    Convert a raw embedded allocation dict to ReceiptAllocationResponse.

    Args:
        alloc: Raw embedded allocation dict from customer_receipts_v2.

    Returns:
        ReceiptAllocationResponse instance.
    """
    return ReceiptAllocationResponse(
        allocation_line_number=alloc["allocationLineNumber"],
        ar_invoice_doc_entry=alloc["arInvoiceDocEntry"],
        ar_invoice_doc_number=alloc.get("arInvoiceDocNumber", ""),
        amount_applied=Decimal(str(alloc["amountApplied"])),
        currency_applied=alloc.get("currencyApplied", "AED"),
        notes=alloc.get("notes"),
    )


def _doc_to_response(raw: Dict[str, Any]) -> CustomerReceiptResponse:
    """
    Convert a raw MongoDB customer_receipts_v2 document to CustomerReceiptResponse.

    Args:
        raw: Document from the customer_receipts_v2 collection.

    Returns:
        CustomerReceiptResponse instance.
    """
    allocations = [
        _raw_allocation_to_response(a)
        for a in sorted(
            raw.get("allocations", []), key=lambda x: x.get("allocationLineNumber", 0)
        )
    ]

    return CustomerReceiptResponse(
        doc_entry=raw["docEntry"],
        doc_number=raw["docNumber"],
        doc_type=raw.get("docType", _DOC_TYPE),
        organization_id=raw["organizationId"],
        company_code=raw["companyCode"],
        customer_id=raw["customerId"],
        customer_name=raw["customerName"],
        bp_ref_no=raw.get("bpRefNo"),
        doc_date=raw["docDate"],
        payment_method=raw["paymentMethod"],
        payment_ref=raw.get("paymentRef"),
        bank_account_id=raw["bankAccountId"],
        currency=raw.get("currency", "AED"),
        exchange_rate=Decimal(str(raw.get("exchangeRate", 1))),
        amount_received=Decimal(str(raw["amountReceived"])),
        allocations=allocations,
        status=DocumentStatus(raw["status"]),
        unallocated_amount=Decimal(str(raw.get("unallocatedAmount", 0))),
        base_doc_refs=_norm_refs(raw.get("baseDocRefs", [])),
        target_doc_refs=_norm_refs(raw.get("targetDocRefs", [])),
        outbox_event_id=raw.get("outboxEventId"),
        outbox_event_emitted_at=raw.get("outboxEventEmittedAt"),
        journal_memo=raw.get("journalMemo"),
        notes=raw.get("notes"),
        created_at=raw["createdAt"],
        created_by=raw["createdBy"],
        updated_at=raw["updatedAt"],
        updated_by=raw["updatedBy"],
    )


def _doc_to_list_item(raw: Dict[str, Any]) -> CustomerReceiptListItem:
    """
    Convert a raw MongoDB document to slim CustomerReceiptListItem.

    Args:
        raw: Partial document from a list projection query.

    Returns:
        CustomerReceiptListItem instance.
    """
    return CustomerReceiptListItem(
        doc_entry=raw["docEntry"],
        doc_number=raw["docNumber"],
        organization_id=raw["organizationId"],
        customer_id=raw["customerId"],
        customer_name=raw["customerName"],
        doc_date=raw["docDate"],
        payment_method=raw["paymentMethod"],
        status=DocumentStatus(raw["status"]),
        amount_received=Decimal(str(raw["amountReceived"])),
        unallocated_amount=Decimal(str(raw.get("unallocatedAmount", 0))),
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
    Append an audit entry to customer_receipts_v2_audit.

    Best-effort: logs warning on failure but does not re-raise.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the affected Receipt.
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
            "Audit write failed for Customer Receipt %s action=%s: %s",
            doc_entry,
            action,
            exc,
        )


def _compute_unallocated(
    amount_received: Decimal, allocations: List[Dict[str, Any]]
) -> Decimal:
    """
    Compute the unallocated balance on a Receipt.

    In v1 this should always be 0 (enforced by schema).  The field is kept for
    forward-compatibility when overpayment/customer-credit is introduced.

    Args:
        amount_received: Total amount received from customer.
        allocations:     List of embedded allocation dicts.

    Returns:
        Unallocated balance as Decimal (should be 0 in v1).
    """
    total_applied = sum(Decimal(str(a["amountApplied"])) for a in allocations)
    return (amount_received - total_applied).quantize(
        _TWOPLACES, rounding=ROUND_HALF_UP
    )


def _build_outbox_payload(
    receipt_raw: Dict[str, Any],
    *,
    event_type: str,
    original_event_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build the customer_payment_received or customer_payment_cancelled outbox payload.

    Args:
        receipt_raw:       Raw Receipt header document (post-update state).
        event_type:        "customer_payment_received" or "customer_payment_cancelled".
        original_event_id: For cancellation — the event_id of the original
                           customer_payment_received event being reversed.

    Returns:
        Dict matching CustomerPaymentReceivedPayload or CustomerPaymentCancelledPayload.
    """

    def _date_str(val: Any) -> str:
        if val is None:
            return ""
        if hasattr(val, "strftime"):
            return val.strftime("%Y-%m-%d")
        return str(val)[:10]

    allocations_payload = [
        {
            "allocationLineNumber": a["allocationLineNumber"],
            "arInvoiceDocEntry": a["arInvoiceDocEntry"],
            "arInvoiceDocNumber": a.get("arInvoiceDocNumber", ""),
            "amountApplied": str(a["amountApplied"]),
        }
        for a in sorted(
            receipt_raw.get("allocations", []),
            key=lambda x: x.get("allocationLineNumber", 0),
        )
    ]

    payload: Dict[str, Any] = {
        "receiptDocEntry": receipt_raw["docEntry"],
        "receiptDocNumber": receipt_raw["docNumber"],
        "docDate": _date_str(receipt_raw.get("docDate")),
        "customerId": receipt_raw.get("customerId", ""),
        "customerName": receipt_raw.get("customerName", ""),
        "bpRefNo": receipt_raw.get("bpRefNo"),
        "paymentMethod": receipt_raw.get("paymentMethod", ""),
        "paymentRef": receipt_raw.get("paymentRef"),
        "bankAccountId": receipt_raw.get("bankAccountId", ""),
        "currency": receipt_raw.get("currency", "AED"),
        "exchangeRate": str(receipt_raw.get("exchangeRate", 1)),
        "amountReceived": str(receipt_raw.get("amountReceived", 0)),
        "allocations": allocations_payload,
    }

    if event_type == "customer_payment_cancelled" and original_event_id:
        payload["originalEventId"] = original_event_id

    return payload


async def _validate_allocation_targets(
    db: AsyncIOMotorDatabase,
    allocations: List[Any],
    customer_id: str,
    org_id: str,
) -> None:
    """
    Validate all allocation targets: existence, status, customer match, open_amount.

    Called at create time (pre-flight) and again at OPEN-transition (concurrent
    payment guard).

    Args:
        db:           Motor database instance.
        allocations:  List of allocation objects (Pydantic models or raw dicts).
        customer_id:  Receipt header customer_id — all invoices must match.
        org_id:       Organisation UUID for scoping.

    Raises:
        ValueError: On any validation failure with a clear message.
    """
    for alloc in allocations:
        # Support both Pydantic model attributes and raw dicts.
        if hasattr(alloc, "ar_invoice_doc_entry"):
            ari_doc_entry = alloc.ar_invoice_doc_entry
            amount_applied = Decimal(str(alloc.amount_applied))
        else:
            ari_doc_entry = alloc["arInvoiceDocEntry"]
            amount_applied = Decimal(str(alloc["amountApplied"]))

        ari_raw = await db[_ARI_COL].find_one(
            {"docEntry": ari_doc_entry, "organizationId": org_id}
        )
        if ari_raw is None:
            raise ValueError(
                f"AR Invoice '{ari_doc_entry}' not found in organisation '{org_id}'"
            )

        ari_status = ari_raw.get("status", "")
        if ari_status not in _PAYABLE_STATUSES:
            raise ValueError(
                f"AR Invoice '{ari_doc_entry}' is in status '{ari_status}'. "
                f"Can only allocate against 'open' or 'partly_closed' invoices."
            )

        ari_customer_id = ari_raw.get("customerId", "")
        if ari_customer_id != customer_id:
            raise ValueError(
                f"AR Invoice '{ari_doc_entry}' belongs to customer '{ari_customer_id}', "
                f"but the Receipt is for customer '{customer_id}'. "
                "All allocations must target the same customer."
            )

        # Compute open_amount = gross - paid_amount - down_payment_applied.
        totals = ari_raw.get("totals", {})
        gross = Decimal(str(totals.get("gross", 0)))
        paid = Decimal(str(totals.get("paidAmount", 0)))
        down_payment = Decimal(str(totals.get("downPaymentApplied", 0)))
        open_amount = gross - paid - down_payment

        if amount_applied > open_amount + _TOLERANCE:
            raise ValueError(
                f"Allocation amount {amount_applied} for AR Invoice '{ari_doc_entry}' "
                f"exceeds the invoice's open_amount ({open_amount:.2f}). "
                "Cannot overpay a single invoice in v1."
            )


def _build_allocation_docs(allocations: List[Any]) -> List[Dict[str, Any]]:
    """
    Build embedded allocation dicts for MongoDB storage from Pydantic models.

    Args:
        allocations: List of ReceiptAllocationCreate (or compatible) objects.

    Returns:
        List of embedded allocation dicts.
    """
    docs = []
    for i, alloc in enumerate(allocations, start=1):
        docs.append(
            {
                "allocationLineNumber": i,
                "arInvoiceDocEntry": alloc.ar_invoice_doc_entry,
                "arInvoiceDocNumber": alloc.ar_invoice_doc_number,
                "amountApplied": float(alloc.amount_applied),
                "currencyApplied": alloc.currency_applied,
                "notes": alloc.notes,
            }
        )
    return docs


async def _determine_invoice_status_after_payment(
    db: AsyncIOMotorDatabase,
    ari_doc_entry: str,
    org_id: str,
) -> DocumentStatus:
    """
    Determine what status an AR Invoice should have after a payment is applied.

    Reads the current (post-increment) state of the invoice.

    Args:
        db:            Motor database instance.
        ari_doc_entry: UUID of the AR Invoice.
        org_id:        Organisation UUID for scoping.

    Returns:
        DocumentStatus.CLOSED if open_amount <= TOLERANCE, else PARTLY_CLOSED.
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
    # Reason: creditedAmount (T-100.11) also reduces open_amount; default 0 for legacy docs.
    credited = Decimal(str(totals.get("creditedAmount", 0)))
    open_amount = gross - paid - down_payment - credited

    if open_amount <= _TOLERANCE:
        return DocumentStatus.CLOSED
    return DocumentStatus.PARTLY_CLOSED


async def _determine_invoice_status_after_reversal(
    db: AsyncIOMotorDatabase,
    ari_doc_entry: str,
    org_id: str,
    this_receipt_doc_entry: str,
) -> DocumentStatus:
    """
    Determine what status an AR Invoice should revert to after Receipt cancellation.

    After reversing this receipt's amount_applied, the invoice may still have other
    receipts applied.  We determine the correct restored status by checking the
    resulting paid_amount (after decrement has already been applied to the DB).

    Args:
        db:                     Motor database instance.
        ari_doc_entry:          UUID of the AR Invoice.
        org_id:                 Organisation UUID for scoping.
        this_receipt_doc_entry: The Receipt being cancelled (for reference).

    Returns:
        DocumentStatus.OPEN if paid_amount is 0, else DocumentStatus.PARTLY_CLOSED.
    """
    ari_refreshed = await db[_ARI_COL].find_one(
        {"docEntry": ari_doc_entry, "organizationId": org_id}
    )
    if ari_refreshed is None:
        return DocumentStatus.OPEN

    totals = ari_refreshed.get("totals", {})
    paid = Decimal(str(totals.get("paidAmount", 0)))

    if paid <= _TOLERANCE:
        return DocumentStatus.OPEN
    return DocumentStatus.PARTLY_CLOSED


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def create_customer_receipt(
    db: AsyncIOMotorDatabase,
    payload: CustomerReceiptCreate,
    org_id: str,
    user_id: str,
) -> CustomerReceiptResponse:
    """
    Create a new Customer Receipt in DRAFT status.

    Validates each allocation target AR Invoice (existence, status, customer match,
    open_amount) before persisting.  No AR Invoice updates happen at DRAFT creation —
    those happen at DRAFT → OPEN transition.

    Sequence:
    1. Validate all allocation targets.
    2. Validate sum(allocations) == amount_received (also enforced by Pydantic schema).
    3. Generate doc_number = "IPAY-YYYY-NNNN".
    4. Persist in DRAFT status.
    5. Audit-log.

    Args:
        db:      Motor database instance.
        payload: Validated CustomerReceiptCreate payload.
        org_id:  Organisation UUID for scoping.
        user_id: Authenticated user creating the receipt.

    Returns:
        CustomerReceiptResponse for the newly-created DRAFT Receipt.

    Raises:
        ValueError: If any allocation target fails validation.
    """
    # Step 1: Validate all allocation targets.
    await _validate_allocation_targets(
        db, payload.allocations, customer_id=payload.customer_id, org_id=org_id
    )

    # Step 2: Build embedded allocation docs.
    allocation_docs = _build_allocation_docs(payload.allocations)

    # Step 3: Generate doc_number.
    doc_entry = str(uuid.uuid4())
    doc_number = await next_doc_number(
        db,
        doc_type=_DOC_TYPE,
        org_id=org_id,
        company_code=payload.company_code,
    )

    now = _now()
    amount_received = Decimal(str(payload.amount_received))
    unallocated = _compute_unallocated(amount_received, allocation_docs)

    # Build header-level base_doc_refs — one entry per allocated AR Invoice.
    base_doc_refs = [
        {
            "docType": "AR_INVOICE",
            "docId": alloc.ar_invoice_doc_entry,
            "docNumber": alloc.ar_invoice_doc_number,
            "lineId": None,
        }
        for alloc in payload.allocations
    ]

    # Step 4: Persist in DRAFT status.
    doc: Dict[str, Any] = {
        "docEntry": doc_entry,
        "docNumber": doc_number,
        "docType": _DOC_TYPE,
        "organizationId": org_id,
        "companyCode": payload.company_code,
        "customerId": payload.customer_id,
        "customerName": payload.customer_name,
        "bpRefNo": payload.bp_ref_no,
        "docDate": _to_dt(payload.doc_date),
        "paymentMethod": payload.payment_method,
        "paymentRef": payload.payment_ref,
        "bankAccountId": payload.bank_account_id,
        "currency": payload.currency,
        "exchangeRate": float(payload.exchange_rate),
        "amountReceived": float(amount_received),
        "allocations": allocation_docs,
        "status": DocumentStatus.DRAFT.value,
        "unallocatedAmount": float(unallocated),
        "baseDocRefs": base_doc_refs,
        "targetDocRefs": [],
        "outboxEventId": None,
        "outboxEventEmittedAt": None,
        "journalMemo": payload.journal_memo,
        "notes": payload.notes,
        "createdAt": now,
        "createdBy": user_id,
        "updatedAt": now,
        "updatedBy": user_id,
    }

    await db[_CR_COL].insert_one(doc)

    # Step 5: Audit.
    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="create",
        user_id=user_id,
        detail={
            "customerId": payload.customer_id,
            "amountReceived": float(amount_received),
            "allocationCount": len(allocation_docs),
            "arInvoiceDocEntries": [
                a.ar_invoice_doc_entry for a in payload.allocations
            ],
        },
    )

    doc.pop("_id", None)
    return _doc_to_response(doc)


async def create_customer_receipt_from_invoice(
    db: AsyncIOMotorDatabase,
    ar_invoice_doc_entry: str,
    payload: CustomerReceiptFromInvoiceRequest,
    org_id: str,
    user_id: str,
) -> CustomerReceiptResponse:
    """
    Convenience: create a Receipt that fully (or partially) pays a single AR Invoice.

    Constructs a single-allocation CustomerReceiptCreate and delegates to
    create_customer_receipt.

    Args:
        db:                   Motor database instance.
        ar_invoice_doc_entry: UUID of the AR Invoice to pay.
        payload:              CustomerReceiptFromInvoiceRequest.
        org_id:               Organisation UUID for scoping.
        user_id:              Authenticated user creating the receipt.

    Returns:
        CustomerReceiptResponse for the newly-created DRAFT Receipt.

    Raises:
        ValueError: If the AR Invoice is not found or not in a payable status.
    """
    # Load the AR Invoice to get customer_id, customer_name, open_amount, doc_number.
    ari_raw = await db[_ARI_COL].find_one(
        {"docEntry": ar_invoice_doc_entry, "organizationId": org_id}
    )
    if ari_raw is None:
        raise ValueError(
            f"AR Invoice '{ar_invoice_doc_entry}' not found in organisation '{org_id}'"
        )

    ari_status = ari_raw.get("status", "")
    if ari_status not in _PAYABLE_STATUSES:
        raise ValueError(
            f"AR Invoice '{ar_invoice_doc_entry}' is in status '{ari_status}'. "
            "Can only create a Receipt against 'open' or 'partly_closed' invoices."
        )

    totals = ari_raw.get("totals", {})
    gross = Decimal(str(totals.get("gross", 0)))
    paid = Decimal(str(totals.get("paidAmount", 0)))
    down_payment = Decimal(str(totals.get("downPaymentApplied", 0)))
    open_amount = gross - paid - down_payment

    # Use the requested amount if supplied; otherwise default to full open_amount.
    amount_to_apply: Decimal = (
        Decimal(str(payload.amount)) if payload.amount is not None else open_amount
    )

    if amount_to_apply > open_amount + _TOLERANCE:
        raise ValueError(
            f"Requested amount {amount_to_apply} exceeds AR Invoice '{ar_invoice_doc_entry}' "
            f"open_amount ({open_amount:.2f}). Cannot overpay in v1."
        )

    from ..models.customer_receipts import (
        CustomerReceiptCreate,
        ReceiptAllocationCreate,
    )  # noqa: PLC0415

    receipt_payload = CustomerReceiptCreate(
        organization_id=org_id,
        company_code=payload.company_code,
        customer_id=ari_raw["customerId"],
        customer_name=ari_raw["customerName"],
        bp_ref_no=payload.bp_ref_no,
        doc_date=payload.doc_date,
        payment_method=payload.payment_method,
        payment_ref=payload.payment_ref,
        bank_account_id=payload.bank_account_id,
        currency=payload.currency,
        exchange_rate=payload.exchange_rate,
        amount_received=amount_to_apply,
        allocations=[
            ReceiptAllocationCreate(
                ar_invoice_doc_entry=ar_invoice_doc_entry,
                ar_invoice_doc_number=ari_raw.get("docNumber", ""),
                amount_applied=amount_to_apply,
                currency_applied=payload.currency,
            )
        ],
        journal_memo=payload.journal_memo,
        notes=payload.notes,
    )

    return await create_customer_receipt(
        db, receipt_payload, org_id=org_id, user_id=user_id
    )


async def get_customer_receipt(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    org_id: str,
) -> Optional[CustomerReceiptResponse]:
    """
    Retrieve a single Customer Receipt by its doc_entry UUID.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the Customer Receipt.
        org_id:    Organisation UUID for scoping.

    Returns:
        CustomerReceiptResponse if found, None otherwise.
    """
    raw = await db[_CR_COL].find_one({"docEntry": doc_entry, "organizationId": org_id})
    if raw is None:
        return None
    raw.pop("_id", None)
    return _doc_to_response(raw)


async def list_customer_receipts(
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
    Paginated list of Customer Receipts with optional filters.

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

    # Reason: project out allocations for list queries to keep payloads lean.
    projection = {"allocations": 0}

    total = await db[_CR_COL].count_documents(query)
    skip = (page - 1) * size

    cursor = (
        db[_CR_COL].find(query, projection).sort("docDate", -1).skip(skip).limit(size)
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


async def update_customer_receipt(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    payload: CustomerReceiptUpdate,
    org_id: str,
    user_id: str,
) -> Optional[CustomerReceiptResponse]:
    """
    Partially update a DRAFT Customer Receipt.

    If payload.allocations is supplied, replaces the allocation set wholesale
    and re-validates all allocation targets.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the Customer Receipt.
        payload:   Validated CustomerReceiptUpdate payload.
        org_id:    Organisation UUID for scoping.
        user_id:   Authenticated user performing the update.

    Returns:
        Updated CustomerReceiptResponse, or None if not found.

    Raises:
        ValueError: If the receipt status is not DRAFT, or allocation validation fails.
    """
    raw = await db[_CR_COL].find_one({"docEntry": doc_entry, "organizationId": org_id})
    if raw is None:
        return None

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"Customer Receipt '{doc_entry}' cannot be updated: "
            f"status is '{raw['status']}' (only DRAFT receipts may be edited)"
        )

    updates: Dict[str, Any] = {"updatedAt": _now(), "updatedBy": user_id}

    field_map = {
        "bpRefNo": payload.bp_ref_no,
        "docDate": _to_dt(payload.doc_date) if payload.doc_date is not None else None,
        "paymentMethod": payload.payment_method,
        "paymentRef": payload.payment_ref,
        "bankAccountId": payload.bank_account_id,
        "currency": payload.currency,
        "exchangeRate": float(payload.exchange_rate) if payload.exchange_rate else None,
        "amountReceived": (
            float(payload.amount_received) if payload.amount_received else None
        ),
        "journalMemo": payload.journal_memo,
        "notes": payload.notes,
    }
    for db_key, value in field_map.items():
        if value is not None:
            updates[db_key] = value

    if payload.allocations is not None:
        # Determine the effective amount_received for sum validation.
        effective_amount = (
            Decimal(str(payload.amount_received))
            if payload.amount_received is not None
            else Decimal(str(raw["amountReceived"]))
        )
        effective_customer_id = raw["customerId"]

        await _validate_allocation_targets(
            db, payload.allocations, customer_id=effective_customer_id, org_id=org_id
        )

        new_allocation_docs = _build_allocation_docs(payload.allocations)

        # Validate sum consistency.
        total_applied = sum(
            Decimal(str(a["amountApplied"])) for a in new_allocation_docs
        )
        if abs(total_applied - effective_amount) > _TOLERANCE:
            raise ValueError(
                f"Sum of allocation amounts ({total_applied}) does not equal "
                f"amount_received ({effective_amount}). "
                "In v1 every dirham received must be allocated."
            )

        updates["allocations"] = new_allocation_docs
        updates["unallocatedAmount"] = float(
            _compute_unallocated(effective_amount, new_allocation_docs)
        )
        # Rebuild base_doc_refs to match the new allocation set.
        updates["baseDocRefs"] = [
            {
                "docType": "AR_INVOICE",
                "docId": alloc.ar_invoice_doc_entry,
                "docNumber": alloc.ar_invoice_doc_number,
                "lineId": None,
            }
            for alloc in payload.allocations
        ]

    await db[_CR_COL].update_one(
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

    updated_raw = await db[_CR_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if updated_raw is None:
        return None
    updated_raw.pop("_id", None)
    return _doc_to_response(updated_raw)


async def delete_customer_receipt(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    org_id: str,
    user_id: str,
) -> bool:
    """
    Hard-delete a DRAFT Customer Receipt.

    Only DRAFT receipts may be deleted.  No AR Invoice updates are needed
    because DRAFT receipts have not yet incremented paid_amount.

    Args:
        db:        Motor database instance.
        doc_entry: UUID of the Customer Receipt.
        org_id:    Organisation UUID for scoping.
        user_id:   Authenticated user performing the deletion.

    Returns:
        True if deleted, False if not found.

    Raises:
        ValueError: If the receipt status is not DRAFT.
    """
    raw = await db[_CR_COL].find_one({"docEntry": doc_entry, "organizationId": org_id})
    if raw is None:
        return False

    if raw.get("status") != DocumentStatus.DRAFT.value:
        raise ValueError(
            f"Customer Receipt '{doc_entry}' cannot be deleted: "
            f"status is '{raw['status']}' (only DRAFT receipts may be deleted)"
        )

    # Reason: write audit BEFORE delete so the trail survives deletion.
    await _write_audit(
        db,
        doc_entry=doc_entry,
        action="delete",
        user_id=user_id,
        detail={"docNumber": raw.get("docNumber")},
    )

    await db[_CR_COL].delete_one({"docEntry": doc_entry, "organizationId": org_id})
    return True


async def transition_status(
    db: AsyncIOMotorDatabase,
    doc_entry: str,
    request_body: CustomerReceiptStatusTransitionRequest,
    org_id: str,
    user_id: str,
) -> Optional[CustomerReceiptResponse]:
    """
    Transition a Customer Receipt to a new status.

    Uses assert_legal_transition("IPAY", ...) as the primary state-machine
    gatekeeper, with a special case for OPEN → CANCELLED (analogous to
    AR Invoice's OPEN → CANCELLED override).

    Special handling per target status:

    DRAFT → OPEN (the payment event — atomic AR Invoice updates):
      1. Re-validate each allocation (concurrent payment guard).
      2. For each allocation:
         a. $inc AR Invoice totals.paidAmount by amount_applied.
         b. $inc AR Invoice totals.openAmount by -amount_applied.
         c. Reload AR Invoice and transition to PARTLY_CLOSED or CLOSED.
         d. Push Receipt back-pointer onto AR Invoice's target_doc_refs.
      3. Emit customer_payment_received outbox event.
      4. Persist outbox_event_id on Receipt.
      5. Audit-log with all affected AR Invoice doc entries.

    OPEN → CANCELLED (reversal):
      1. For each allocation:
         a. $inc AR Invoice totals.paidAmount by -amount_applied (restore).
         b. $inc AR Invoice totals.openAmount by +amount_applied (restore).
         c. Determine restored status: OPEN if paid_amount == 0, else PARTLY_CLOSED.
         d. Update AR Invoice status.
      2. Emit customer_payment_cancelled event with original_event_id.
      3. Audit-log.

    DRAFT → CANCELLED:
      Status flip only; no AR Invoice side-effects.

    Args:
        db:           Motor database instance.
        doc_entry:    UUID of the Customer Receipt.
        request_body: Transition request with new_status and optional reason.
        org_id:       Organisation UUID for scoping.
        user_id:      Authenticated user performing the transition.

    Returns:
        Updated CustomerReceiptResponse, or None if not found.

    Raises:
        ValueError: If the transition is illegal or AR Invoice validation fails.
    """
    raw = await db[_CR_COL].find_one({"docEntry": doc_entry, "organizationId": org_id})
    if raw is None:
        return None

    current_status = DocumentStatus(raw["status"])
    new_status = request_body.new_status
    now = _now()

    # Special case: OPEN → CANCELLED is a reversal; not in LEGAL_TRANSITIONS.
    is_open_to_cancelled = (
        current_status == DocumentStatus.OPEN and new_status == DocumentStatus.CANCELLED
    )

    if not is_open_to_cancelled:
        # Reason: assert_legal_transition raises ValueError for illegal transitions.
        assert_legal_transition(_DOC_TYPE, current_status, new_status)

    # -----------------------------------------------------------------------
    # DRAFT → OPEN: the payment event — atomic AR Invoice updates
    # -----------------------------------------------------------------------
    if current_status == DocumentStatus.DRAFT and new_status == DocumentStatus.OPEN:
        allocations = raw.get("allocations", [])

        # Step 1: Re-validate all targets (concurrent payment guard).
        await _validate_allocation_targets(
            db, allocations, customer_id=raw["customerId"], org_id=org_id
        )

        # Step 2: Apply each allocation atomically.
        affected_ari_entries: List[str] = []
        for alloc in allocations:
            ari_doc_entry = alloc["arInvoiceDocEntry"]
            amount_applied = float(Decimal(str(alloc["amountApplied"])))
            affected_ari_entries.append(ari_doc_entry)

            # Increment paid_amount and decrement open_amount on the AR Invoice.
            await db[_ARI_COL].update_one(
                {"docEntry": ari_doc_entry, "organizationId": org_id},
                {
                    "$inc": {
                        "totals.paidAmount": amount_applied,
                        "totals.openAmount": -amount_applied,
                    },
                    "$set": {"updatedAt": now, "updatedBy": user_id},
                },
            )

            # Determine and apply new AR Invoice status.
            new_ari_status = await _determine_invoice_status_after_payment(
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

            # Write Receipt back-pointer onto the AR Invoice target_doc_refs.
            receipt_ref = {
                "docType": _DOC_TYPE,
                "docId": doc_entry,
                "docNumber": raw.get("docNumber", ""),
                "lineId": None,
            }
            await db[_ARI_COL].update_one(
                {"docEntry": ari_doc_entry, "organizationId": org_id},
                {"$push": {"targetDocRefs": receipt_ref}},
            )

            logger.info(
                "[CustomerReceiptService] OPEN-transition: AR Invoice %s paid_amount +%.2f → %s",
                ari_doc_entry,
                amount_applied,
                new_ari_status.value,
            )

        # Step 3: Emit customer_payment_received outbox event.
        event_payload = _build_outbox_payload(
            raw, event_type="customer_payment_received"
        )
        emitted_event_id: Optional[str] = None

        try:
            from src.modules.finance_bridge.outbox_writer import (
                OutboxWriter,
            )  # noqa: PLC0415

            emitted_event_id = await OutboxWriter.publish(
                db=db,
                event_type="customer_payment_received",
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
                "[CustomerReceiptService] Failed to emit customer_payment_received for '%s': %s",
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
        await db[_CR_COL].update_one(
            {"docEntry": doc_entry, "organizationId": org_id},
            {"$set": set_fields},
        )

        # Step 5: Audit with all affected AR Invoice doc entries.
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
                "affectedArInvoices": affected_ari_entries,
            },
        )

    # -----------------------------------------------------------------------
    # OPEN → CANCELLED: reverse all AR Invoice updates
    # -----------------------------------------------------------------------
    elif is_open_to_cancelled:
        allocations = raw.get("allocations", [])
        affected_ari_entries_cancel: List[str] = []

        for alloc in allocations:
            ari_doc_entry = alloc["arInvoiceDocEntry"]
            amount_applied = float(Decimal(str(alloc["amountApplied"])))
            affected_ari_entries_cancel.append(ari_doc_entry)

            # Reverse: decrement paid_amount and increment open_amount.
            await db[_ARI_COL].update_one(
                {"docEntry": ari_doc_entry, "organizationId": org_id},
                {
                    "$inc": {
                        "totals.paidAmount": -amount_applied,
                        "totals.openAmount": amount_applied,
                    },
                    "$set": {"updatedAt": now, "updatedBy": user_id},
                },
            )

            # Determine restored status.
            restored_status = await _determine_invoice_status_after_reversal(
                db, ari_doc_entry, org_id, doc_entry
            )
            await db[_ARI_COL].update_one(
                {"docEntry": ari_doc_entry, "organizationId": org_id},
                {
                    "$set": {
                        "status": restored_status.value,
                        "updatedAt": now,
                        "updatedBy": user_id,
                    }
                },
            )

            logger.info(
                "[CustomerReceiptService] CANCEL: AR Invoice %s paid_amount -%.2f → %s",
                ari_doc_entry,
                amount_applied,
                restored_status.value,
            )

        # Step 2: Emit customer_payment_cancelled event.
        original_event_id = raw.get("outboxEventId")
        cancel_payload = _build_outbox_payload(
            raw,
            event_type="customer_payment_cancelled",
            original_event_id=original_event_id,
        )
        cancelled_event_id: Optional[str] = None

        try:
            from src.modules.finance_bridge.outbox_writer import (
                OutboxWriter,
            )  # noqa: PLC0415

            cancelled_event_id = await OutboxWriter.publish(
                db=db,
                event_type="customer_payment_cancelled",
                organization_id=org_id,
                company_code=raw.get("companyCode", "1000"),
                payload=cancel_payload,
                source_user_id=user_id,
                source_document_id=doc_entry,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "[CustomerReceiptService] Failed to emit customer_payment_cancelled for '%s': %s",
                doc_entry,
                exc,
            )

        set_fields = {
            "status": new_status.value,
            "updatedAt": now,
            "updatedBy": user_id,
        }
        await db[_CR_COL].update_one(
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
                "affectedArInvoices": affected_ari_entries_cancel,
            },
        )

    # -----------------------------------------------------------------------
    # All other transitions: status flip only (DRAFT → CANCELLED, OPEN → CLOSED)
    # -----------------------------------------------------------------------
    else:
        set_fields = {
            "status": new_status.value,
            "updatedAt": now,
            "updatedBy": user_id,
        }
        await db[_CR_COL].update_one(
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

    # Reload and return the updated Receipt.
    updated_raw = await db[_CR_COL].find_one(
        {"docEntry": doc_entry, "organizationId": org_id}
    )
    if updated_raw is None:
        return None
    updated_raw.pop("_id", None)
    return _doc_to_response(updated_raw)
