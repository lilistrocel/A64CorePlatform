"""
Purchasing Module — Document Service (PR + PO + GR + AP Invoice)

Business logic for Purchase Request, Purchase Order, Goods Receipt, and
AP Invoice documents stored in MongoDB.  Implements:

- Document creation with auto-numbered docNumber
- Line management (create, replace on update)
- Total recalculation
- State machine enforcement via shared DocumentStatus enum + assert_legal_transition
- Approval engine integration
- Outbox event emission on every state transition, atomic with the header write

Collections:
  document_headers  — one doc per PR/PO/GR/AP header
  document_lines    — child lines, one per line item
  document_counters — atomic counters for docNumber generation
  finance_outbox    — outbox events written inside the same Mongo transaction

Status vocabulary (T-200.21 — Wave 4 foundation)
-------------------------------------------------
Stored values are now the lowercase_snake form from DocumentStatus enum.
A ``_parse_status`` helper accepts both the legacy TitleCase purchasing
vocabulary AND the new lowercase_snake enum values so the service works
during the migration window (before wave4_purchasing_status_migration.py
has been run against the database).

Legacy → enum mapping:
  "Draft"          → DocumentStatus.DRAFT          ("draft")
  "Pending Approval" → DocumentStatus.PENDING_APPROVAL ("pending_approval")
  "Approved"       → DocumentStatus.OPEN           ("open")   — semantic rename
  "Open"           → DocumentStatus.OPEN           ("open")
  "Partly Closed"  → DocumentStatus.PARTLY_CLOSED  ("partly_closed")
  "Closed"         → DocumentStatus.CLOSED         ("closed")
  "Cancelled"      → DocumentStatus.CANCELLED      ("cancelled")
  "Posted"  (GR)   → DocumentStatus.OPEN           ("open")   — GR terminal state
  "Sent"    (PO)   → kept as raw string; no shared enum equivalent yet (Wave 4)
  "Rejected" (PR/PO/AP) → kept as raw string; no shared enum equivalent yet

Finance event `state` display mapping (Wave 4 regression fix)
----------------------------------------------------------------
The migration above changed what is STORED on the header, but the finance
event contracts (contracts/finance_events.py) still declare `state` as a
Literal in the pre-migration TitleCase DISPLAY vocabulary — they were not
updated alongside the migration. ``build_pr_event_payload`` /
``build_po_event_payload`` therefore run ``header["status"]`` through
``map_pr_state_for_event`` / ``map_po_state_for_event`` before placing it on
the payload, translating the stored value back to its display form (e.g.
stored "draft" → "Draft") instead of passing it through raw, which crashed
Pydantic validation on every PO/PR create once the migration had run.

Transactional outbox (Phase 2)
-------------------------------
Every state-mutating method wraps its Mongo writes inside a single Motor
session transaction using the `_txn()` context manager.  The header update
and the outbox insert share the same session, so they commit or abort
together — finance can never miss an event because the outbox write failed
silently after the header update committed.

Sequence-counter increments (document_counters) also participate in the
transaction so the same docNumber cannot be issued twice if the transaction
aborts.

Approval-engine network call
-----------------------------
`ApprovalEngine.resolve_required_approval()` issues an HTTP request to the
finance service to determine the approver role.  This call is deliberately
performed OUTSIDE the transaction (before entering `_txn()`).  Reasons:
1. Mongo multi-document transactions have a 60-second default timeout.
   Blocking on a network call inside the transaction risks unnecessary aborts.
2. The approval decision is read-only and idempotent — if the transaction
   aborts and the method is retried, we simply call the engine again.
3. The resolved role is stored on the header inside the transaction, so the
   committed state is always consistent with the engine decision.
"""

import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, AsyncGenerator, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase

from src.core.documents.document_status import DocumentStatus, assert_legal_transition
from src.core.finance import get_tax_percent

from ..models.document import (
    APCreate,
    APDetailResponse,
    APFromGRCreate,
    APResponse,
    APUpdate,
    AppliedDPIAllocation,
    ApprovalHistoryEntry,
    ApprovalHistoryItem,
    DPIAllocation,
    DocType,
    DocumentLineCreate,
    DocumentLineResponse,
    GRCreate,
    GRDetailResponse,
    GRFromPOCreate,
    GRResponse,
    GRUpdate,
    POCreate,
    PODetailResponse,
    POFromPRCreate,
    POResponse,
    POUpdate,
    PRCreate,
    PRDetailResponse,
    PRResponse,
    PRUpdate,
    PendingApprovalItem,
)
from .approval_engine import ApprovalDecision as EngineDecision, ApprovalEngine
from .purchasing_chain_reconciler import (
    _GR_AUDIT_COL,
    _PO_AUDIT_COL,
    _PR_AUDIT_COL,
    auto_close_dpi_if_fully_consumed,
    auto_close_gr_if_fully_invoiced,
    auto_close_po_if_fully_received,
    auto_reopen_dpi_if_not_fully_consumed,
    auto_reopen_gr_if_not_fully_invoiced,
    auto_reopen_po_if_not_fully_received,
    load_gr_with_lines,
    load_po_with_lines,
    pull_dangling_dpi_allocation_refs,
    pull_dangling_gr_chain_refs,
    pull_dangling_po_chain_refs,
    reconcile_dpi_consumption,
    reconcile_gr_line_invoice_counters,
    reconcile_po_line_receipt_counters,
    write_purchasing_audit,
)

logger = logging.getLogger(__name__)

_HEADERS_COL = "document_headers"
_LINES_COL = "document_lines"
_COUNTERS_COL = "document_counters"

# ---------------------------------------------------------------------------
# Doc-type string constants — match keys in LEGAL_TRANSITIONS exactly.
# Defined here so a typo is caught at import time, not at runtime.
# ---------------------------------------------------------------------------

_DOC_TYPE_PR: str = "PR"
_DOC_TYPE_PO: str = "PO"
_DOC_TYPE_GR: str = "GR"
_DOC_TYPE_AP_INVOICE: str = "AP_INVOICE"

# ---------------------------------------------------------------------------
# Tolerant status parser (migration window helper — T-200.21)
#
# Accepts both the legacy TitleCase purchasing vocabulary that may still be
# stored in MongoDB AND the new lowercase_snake DocumentStatus enum values.
# Once wave4_purchasing_status_migration.py has been applied to all
# environments and all stored documents carry the new vocabulary, this
# function can be simplified to just: return DocumentStatus(raw).
#
# Caller MUST handle the cases where the raw value is a legacy state that
# has no DocumentStatus equivalent ("Rejected", "Sent", "Posted").  Those
# paths use the raw string directly (see comments at each call site).
# ---------------------------------------------------------------------------

_LEGACY_STATUS_MAP: Dict[str, DocumentStatus] = {
    "Draft":            DocumentStatus.DRAFT,
    "Pending Approval": DocumentStatus.PENDING_APPROVAL,
    "Approved":         DocumentStatus.OPEN,       # semantic: Approved = active/open
    "Open":             DocumentStatus.OPEN,
    "Partly Closed":    DocumentStatus.PARTLY_CLOSED,
    "Closed":           DocumentStatus.CLOSED,
    "Cancelled":        DocumentStatus.CANCELLED,
    # Reason: GR uses "Posted" to mean the document is terminal/open in the
    # shared vocabulary.  LEGAL_TRANSITIONS["GR"] maps DRAFT → OPEN.
    "Posted":           DocumentStatus.OPEN,
}

# Reason: these legacy statuses have no equivalent in DocumentStatus.
# They are purchasing-module-internal states not yet modelled in the shared
# enum.  Transition validation for paths involving these states falls back to
# the per-module check below.  T-200.22+ will decide whether to add them or
# rename them.
_LEGACY_NO_ENUM_STATES = frozenset({"Rejected", "Sent", "Partially Received", "Received"})


# ---------------------------------------------------------------------------
# Stored-status -> finance-event display-status mapping (Wave 4 regression)
#
# wave4_purchasing_status_migration.py (T-200.21) rewrote the STORED `status`
# field on document_headers from legacy TitleCase to the shared DocumentStatus
# lowercase_snake vocabulary, but purchasing-internal states with no shared
# equivalent ("Rejected", "Sent", "Partially Received", "Received") were
# deliberately left untouched (see _LEGACY_NO_ENUM_STATES above).
#
# The finance event contracts (contracts/finance_events.py) were NOT updated
# alongside the migration — PurchaseRequestStateChangedPayload.state and
# PurchaseOrderStateChangedPayload.state still declare a Literal in the
# legacy TitleCase DISPLAY vocabulary.  Passing the raw stored value straight
# through (the pre-fix behaviour) fails Pydantic validation the moment a
# document is stored with the new lowercase_snake vocabulary — e.g. creating
# a PO stores "draft" and PurchaseOrderStateChangedPayload rejects it.
#
# These two maps translate stored -> display so build_pr_event_payload /
# build_po_event_payload always emit a value the contract Literal accepts.
# Doc-type-specific because the same stored "open" means different things:
# PR "open" displays as "Approved" (approval outcome); PO "open" displays as
# "Open" (sent-ready/active order) — collapsing them into one shared map
# would be wrong for one of the two doc types.
#
# Also accepts the pre-migration legacy TitleCase inputs as identity
# mappings (they already ARE the display form the contract expects) — this
# mirrors _parse_status's own tolerance above and is required for the same
# reason: document_service.py is explicitly designed to keep working during
# the migration window, before wave4_purchasing_status_migration.py has run
# against a given database, so header["status"]/previous_state can still be
# "Open"/"Draft"/etc. rather than "open"/"draft"/etc.
# ---------------------------------------------------------------------------

_PR_STATE_EVENT_DISPLAY: Dict[str, str] = {
    "draft": "Draft",
    "pending_approval": "Pending Approval",
    "open": "Approved",
    "closed": "Closed",
    "cancelled": "Cancelled",
    "Rejected": "Rejected",
    # Reason: pre-migration legacy TitleCase — already valid display form.
    "Draft": "Draft",
    "Pending Approval": "Pending Approval",
    "Approved": "Approved",
    "Closed": "Closed",
    "Cancelled": "Cancelled",
}

_PO_STATE_EVENT_DISPLAY: Dict[str, str] = {
    "draft": "Draft",
    "pending_approval": "Pending Approval",
    "open": "Open",
    "partly_closed": "Partially Received",
    "closed": "Closed",
    "cancelled": "Cancelled",
    "Sent": "Sent",
    "Partially Received": "Partially Received",
    "Received": "Received",
    "Rejected": "Rejected",
    # Reason: pre-migration legacy TitleCase — already valid display form.
    "Draft": "Draft",
    "Pending Approval": "Pending Approval",
    "Open": "Open",
    "Closed": "Closed",
    "Cancelled": "Cancelled",
}


def map_pr_state_for_event(stored: str) -> str:
    """
    Map a stored PR status to the display vocabulary the finance event
    contract's `state` Literal expects.

    Args:
        stored: Raw status string from document_headers — either the shared
            lowercase_snake vocabulary or a PR-internal literal ("Rejected").

    Returns:
        Display-form status matching PurchaseRequestStateChangedPayload.state.

    Raises:
        ValueError: If stored has no known display mapping — raised rather
            than passed through, so an unmapped value fails loudly here
            instead of reintroducing the Pydantic validation crash this
            mapping exists to fix.
    """
    try:
        return _PR_STATE_EVENT_DISPLAY[stored]
    except KeyError:
        raise ValueError(
            f"PR: stored status '{stored}' has no finance event display mapping"
        )


def map_po_state_for_event(stored: str) -> str:
    """
    Map a stored PO status to the display vocabulary the finance event
    contract's `state` Literal expects.

    Args:
        stored: Raw status string from document_headers — either the shared
            lowercase_snake vocabulary or a PO-internal literal ("Sent",
            "Partially Received", "Received", "Rejected").

    Returns:
        Display-form status matching PurchaseOrderStateChangedPayload.state.

    Raises:
        ValueError: If stored has no known display mapping.
    """
    try:
        return _PO_STATE_EVENT_DISPLAY[stored]
    except KeyError:
        raise ValueError(
            f"PO: stored status '{stored}' has no finance event display mapping"
        )


def _parse_status(raw: Optional[str]) -> DocumentStatus:
    """
    Tolerant parser: accepts both legacy TitleCase purchasing vocabulary and
    the new lowercase_snake DocumentStatus enum values.

    Migration window only — once all stored data uses the new vocabulary,
    this reduces to ``return DocumentStatus(raw)``.

    Args:
        raw: Raw status string from MongoDB (may be TitleCase or lowercase_snake).

    Returns:
        DocumentStatus enum member.

    Raises:
        ValueError: If raw is None, empty, or an unrecognised string.
    """
    if not raw:
        raise ValueError("status is required and must not be empty")
    if raw in _LEGACY_STATUS_MAP:
        return _LEGACY_STATUS_MAP[raw]
    # Reason: may already be the new vocabulary; let DocumentStatus validate it.
    return DocumentStatus(raw)


def _validate_transition_legacy(doc_type: str, current: str, target: str) -> None:
    """
    Fallback transition validator for legacy states that have no DocumentStatus
    equivalent (Rejected, Sent, Partially Received, Received).

    Used only when the target state is one of those legacy-only values.
    For all other transitions, ``assert_legal_transition`` is used instead.

    Args:
        doc_type: 'PR', 'PO', 'GR', or 'AP'.
        current: Current status string (may be legacy or enum vocabulary).
        target: Target status string.

    Raises:
        ValueError: If the transition is not in the legacy table.
    """
    _PR_LEGACY: Dict[str, List[str]] = {
        "Pending Approval": ["Rejected"],
        "pending_approval": ["Rejected"],
    }
    _PO_LEGACY: Dict[str, List[str]] = {
        "open": ["Sent"],
        "Open": ["Sent"],
        "Sent": ["Cancelled"],
        "Pending Approval": ["Rejected"],
        "pending_approval": ["Rejected"],
    }
    _AP_LEGACY: Dict[str, List[str]] = {
        "Pending Approval": ["Rejected"],
        "pending_approval": ["Rejected"],
    }
    if doc_type == _DOC_TYPE_PR:
        table = _PR_LEGACY
    elif doc_type == _DOC_TYPE_PO:
        table = _PO_LEGACY
    else:
        table = _AP_LEGACY
    allowed = table.get(current, [])
    if target not in allowed:
        raise ValueError(
            f"Invalid {doc_type} transition: {current} → {target}. "
            f"Allowed from '{current}': {allowed}"
        )


# ---------------------------------------------------------------------------
# Module-level payload builders (also used by the outbox reconciler sweeper)
# ---------------------------------------------------------------------------


def build_pr_event_payload(
    header: Dict[str, Any],
    previous_state: Optional[str],
    company_code: Optional[str],
) -> Dict[str, Any]:
    """
    Build the pr_state_changed outbox payload dict from a raw header document.

    Extracted to module level so the outbox reconciler sweeper can reuse the
    same payload shape without importing the DocumentService class.

    Args:
        header: Raw document_headers document from MongoDB.
        previous_state: State before the current transition (may be None when
                        reconstructed by the sweeper).
        company_code: Fallback finance company code if not present on the header.

    Returns:
        Dict matching PurchaseRequestStateChangedPayload contract.
    """
    return {
        "docId": header["docId"],
        "docNumber": header["docNumber"],
        # Reason: header["status"] is the STORED lowercase_snake vocabulary
        # (or a PR-internal literal); the contract's `state` Literal expects
        # the legacy TitleCase DISPLAY vocabulary. See map_pr_state_for_event.
        "state": map_pr_state_for_event(header["status"]),
        "previousState": (
            map_pr_state_for_event(previous_state) if previous_state else previous_state
        ),
        "organizationId": header["organizationId"],
        "companyCode": header.get("companyCode", company_code),
        "requestedBy": header.get("requestedBy") or header.get("createdBy"),
        "requestedDate": header.get("requestedDate") or header["docDate"],
        "department": header.get("department"),
        "urgency": header.get("urgency", "normal"),
        "totalAmount": str(header.get("totalGross", 0)),
        "currencyCode": header.get("currencyCode", "AED"),
        "notes": header.get("notes"),
        "approvalRequestedFrom": header.get("approvalRequestedFrom"),
        "approvalDecidedBy": header.get("approvalDecidedBy"),
        "approvalComment": header.get("approvalComment"),
        # Reason: included for audit reconstruction by finance consumers (Phase F+);
        # optional in the contract so consumers that haven't read it yet are unaffected.
        "approvalHistory": header.get("approvalHistory") or [],
    }


def build_po_event_payload(
    header: Dict[str, Any],
    previous_state: Optional[str],
    company_code: Optional[str],
) -> Dict[str, Any]:
    """
    Build the po_state_changed outbox payload dict from a raw header document.

    Extracted to module level so the outbox reconciler sweeper can reuse the
    same payload shape without importing the DocumentService class.

    Args:
        header: Raw document_headers document from MongoDB.
        previous_state: State before the current transition (may be None when
                        reconstructed by the sweeper).
        company_code: Fallback finance company code if not present on the header.

    Returns:
        Dict matching PurchaseOrderStateChangedPayload contract.
    """
    return {
        "docId": header["docId"],
        "docNumber": header["docNumber"],
        # Reason: header["status"] is the STORED lowercase_snake vocabulary
        # (or a PO-internal literal); the contract's `state` Literal expects
        # the legacy TitleCase DISPLAY vocabulary. See map_po_state_for_event.
        "state": map_po_state_for_event(header["status"]),
        "previousState": (
            map_po_state_for_event(previous_state) if previous_state else previous_state
        ),
        "organizationId": header["organizationId"],
        "companyCode": header.get("companyCode", company_code),
        "vendorId": header.get("vendorId"),
        "vendorCode": header.get("vendorCode"),
        "issuedBy": header.get("issuedBy") or header.get("createdBy"),
        "issuedDate": header.get("issuedDate") or header["docDate"],
        "expectedDeliveryDate": header.get("expectedDeliveryDate"),
        "paymentTermsCode": header.get("paymentTermsCode"),
        "dueDate": header.get("dueDate"),
        "baseDocId": header.get("baseDocId"),
        "totalNet": str(header.get("subtotalNet", 0)),
        "totalTax": str(header.get("totalTax", 0)),
        "totalGross": str(header.get("totalGross", 0)),
        "currencyCode": header.get("currencyCode", "AED"),
        "notes": header.get("notes"),
        # Reason: included for audit reconstruction by finance consumers (Phase F+);
        # optional in the contract so consumers that haven't read it yet are unaffected.
        "approvalHistory": header.get("approvalHistory") or [],
    }


def build_gr_event_payload(
    header: Dict[str, Any],
    lines: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Build the purchase_received outbox payload dict from a raw GR header and
    its line documents.

    Extracted to module level so the outbox reconciler sweeper can reuse the
    same payload shape without importing the DocumentService class.

    The shape matches PurchaseReceivedPayload + GoodsReceivedLine in
    contracts/finance_events.py exactly.

    Args:
        header: Raw document_headers document for the GR (post-post state).
        lines: Raw document_lines documents for this GR (all lines).

    Returns:
        Dict matching PurchaseReceivedPayload contract.
    """
    gr_date_raw = header.get("docDate", header.get("receivedDate"))
    if hasattr(gr_date_raw, "strftime"):
        gr_date_str = gr_date_raw.strftime("%Y-%m-%d")
    else:
        gr_date_str = str(gr_date_raw)[:10]

    event_lines = []
    for ln in sorted(lines, key=lambda x: x.get("lineNumber", 0)):
        event_lines.append({
            "lineNumber": ln["lineNumber"],
            "itemId": ln["itemId"],
            "itemCode": ln.get("itemCode", ""),
            "itemName": ln.get("itemName", ""),
            "itemType": ln.get("itemType", "raw_material"),
            "quantity": str(ln.get("quantity", 0)),
            "uom": ln.get("uom", ""),
            "unitPrice": str(ln.get("unitPrice", 0)),
            "lineNet": str(ln.get("lineNet", 0)),
            "lineTax": str(ln.get("lineTax", 0)),
            "lineGross": str(ln.get("lineGross", 0)),
            "taxCode": ln.get("taxCode"),
            "costCenterId": ln.get("costCenterId"),
            "baseLineId": ln.get("baseLineId"),
        })

    return {
        "grDocId": header["docId"],
        "grDocNumber": header["docNumber"],
        "grDate": gr_date_str,
        "poDocId": header["baseDocId"],
        "poDocNumber": header.get("baseDocNumber", ""),
        "vendorId": header["vendorId"],
        "vendorCode": header.get("vendorCode"),
        "companyCode": header.get("companyCode", "A001"),
        "lines": event_lines,
        "currencyCode": header.get("currencyCode", "AED"),
        "totalNetAmount": str(header.get("subtotalNet", 0)),
        "totalTaxAmount": str(header.get("totalTax", 0)),
        "totalGrossAmount": str(header.get("totalGross", 0)),
        "warehouseId": header.get("warehouseId"),
        "notes": header.get("notes"),
        "farmCode": None,
    }


def build_ap_invoice_event_payload(
    header: Dict[str, Any],
    lines: List[Dict[str, Any]],
    date_of_supply: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build the ap_invoice_posted outbox payload dict from a raw AP header and
    its line documents.

    Extracted to module level so the outbox reconciler sweeper can reuse the
    same payload shape without importing the DocumentService class.

    The shape matches ApInvoicePostedPayload + ApInvoiceLine in
    contracts/finance_events.py exactly.

    Args:
        header: Raw document_headers document for the AP (post-approve state).
        lines: Raw document_lines documents for this AP (all lines).
        date_of_supply: Optional ISO date string for UAE VAT Article 25 tax-point
            rule. This is the GR docDate (when goods physically arrived). The
            finance handler computes tax_point_date = min(dateOfSupply, invoiceDate).
            When None or empty the finance handler uses invoiceDate as the tax point.

    Returns:
        Dict matching ApInvoicePostedPayload contract.
    """
    # Reason: apDate uses the accounting docDate (when finance learns about it)
    ap_date_raw = header.get("docDate")
    if hasattr(ap_date_raw, "strftime"):
        ap_date_str = ap_date_raw.strftime("%Y-%m-%d")
    else:
        ap_date_str = str(ap_date_raw)[:10] if ap_date_raw else ""

    invoice_date_raw = header.get("invoiceDate")
    if hasattr(invoice_date_raw, "strftime"):
        invoice_date_str = invoice_date_raw.strftime("%Y-%m-%d")
    else:
        invoice_date_str = str(invoice_date_raw)[:10] if invoice_date_raw else ""

    due_date_raw = header.get("dueDate")
    if due_date_raw is not None:
        if hasattr(due_date_raw, "strftime"):
            due_date_str = due_date_raw.strftime("%Y-%m-%d")
        else:
            due_date_str = str(due_date_raw)[:10]
    else:
        due_date_str = None

    event_lines = []
    for ln in sorted(lines, key=lambda x: x.get("lineNumber", 0)):
        event_lines.append({
            "lineNumber": ln["lineNumber"],
            "itemId": ln["itemId"],
            "itemCode": ln.get("itemCode", ""),
            "itemName": ln.get("itemName", ""),
            "itemType": ln.get("itemType", "raw_material"),
            "quantity": str(ln.get("quantity", 0)),
            "uom": ln.get("uom", ""),
            "poUnitPrice": str(ln.get("poUnitPrice", 0)),
            "invoiceUnitPrice": str(ln.get("unitPrice", 0)),
            "priceVarianceAmount": str(ln.get("priceVarianceAmount", 0)),
            "lineNet": str(ln.get("lineNet", 0)),
            "lineTax": str(ln.get("lineTax", 0)),
            "lineGross": str(ln.get("lineGross", 0)),
            "taxCode": ln.get("taxCode"),
            "costCenterId": ln.get("costCenterId"),
            "grLineId": ln.get("grLineId"),
            "baseLineId": ln.get("baseLineId"),
        })

    total_variance = sum(
        Decimal(str(ln.get("priceVarianceAmount", 0))) for ln in lines
    )

    return {
        "apDocId": header["docId"],
        "apDocNumber": header["docNumber"],
        "apDate": ap_date_str,
        "invoiceNumber": header.get("invoiceNumber", ""),
        "invoiceDate": invoice_date_str,
        "dueDate": due_date_str,
        # Reason: UAE VAT Article 25 — tax point is min(dateOfSupply, invoiceDate).
        # dateOfSupply = GR docDate (when goods physically arrived). Populated by
        # _emit_ap_invoice_posted_event which looks up the source GR header.
        # Empty string is a safe default; finance handler falls back to invoiceDate.
        "dateOfSupply": date_of_supply or "",
        "grDocId": header["baseDocId"],
        "grDocNumber": header.get("baseDocNumber", ""),
        "poDocId": header.get("poDocId", ""),
        "poDocNumber": header.get("poDocNumber", ""),
        "vendorId": header["vendorId"],
        "vendorCode": header.get("vendorCode"),
        "companyCode": header.get("companyCode", "A001"),
        "paymentTermsCode": header.get("paymentTermsCode"),
        "lines": event_lines,
        "currencyCode": header.get("currencyCode", "AED"),
        "totalNetAmount": str(header.get("subtotalNet", 0)),
        "totalTaxAmount": str(header.get("totalTax", 0)),
        "totalGrossAmount": str(header.get("totalGross", 0)),
        "totalPriceVariance": str(total_variance),
        "notes": header.get("notes"),
    }


# ---------------------------------------------------------------------------
# Helper: doc → response
# ---------------------------------------------------------------------------


def _header_to_pr_response(doc: Dict[str, Any]) -> PRResponse:
    """Convert a raw header document to PRResponse."""
    return PRResponse(
        docId=doc["docId"],
        organizationId=doc["organizationId"],
        companyCode=doc["companyCode"],
        docType=doc["docType"],
        docNumber=doc["docNumber"],
        docDate=doc["docDate"],
        status=doc["status"],
        requestedBy=doc.get("requestedBy") or doc.get("createdBy"),
        requestedDate=doc.get("requestedDate") or doc["docDate"],
        department=doc.get("department"),
        urgency=doc.get("urgency", "normal"),
        subtotalNet=Decimal(str(doc.get("subtotalNet", 0))),
        totalTax=Decimal(str(doc.get("totalTax", 0))),
        totalGross=Decimal(str(doc.get("totalGross", 0))),
        currencyCode=doc.get("currencyCode", "AED"),
        notes=doc.get("notes"),
        baseDocId=doc.get("baseDocId"),
        approvalState=doc.get("approvalState", "NotRequired"),
        approvalRequestedFrom=doc.get("approvalRequestedFrom"),
        approvalRequestedAt=doc.get("approvalRequestedAt"),
        approvalDecidedBy=doc.get("approvalDecidedBy"),
        approvalDecidedAt=doc.get("approvalDecidedAt"),
        approvalComment=doc.get("approvalComment"),
        approvalHistory=[
            ApprovalHistoryEntry(**e) for e in doc.get("approvalHistory", [])
        ],
        createdAt=doc["createdAt"],
        updatedAt=doc["updatedAt"],
        deletedAt=doc.get("deletedAt"),
    )


def _header_to_po_response(doc: Dict[str, Any]) -> POResponse:
    """Convert a raw header document to POResponse."""
    return POResponse(
        docId=doc["docId"],
        organizationId=doc["organizationId"],
        companyCode=doc["companyCode"],
        docType=doc["docType"],
        docNumber=doc["docNumber"],
        docDate=doc["docDate"],
        postingDate=doc.get("postingDate"),
        dueDate=doc.get("dueDate"),
        expectedDeliveryDate=doc.get("expectedDeliveryDate"),
        status=doc["status"],
        vendorId=doc.get("vendorId"),
        vendorCode=doc.get("vendorCode"),
        vendorName=doc.get("vendorName"),
        paymentTermsCode=doc.get("paymentTermsCode"),
        issuedBy=doc.get("issuedBy") or doc.get("createdBy"),
        issuedDate=doc.get("issuedDate"),
        baseDocId=doc.get("baseDocId"),
        subtotalNet=Decimal(str(doc.get("subtotalNet", 0))),
        totalTax=Decimal(str(doc.get("totalTax", 0))),
        totalGross=Decimal(str(doc.get("totalGross", 0))),
        currencyCode=doc.get("currencyCode", "AED"),
        notes=doc.get("notes"),
        approvalState=doc.get("approvalState", "NotRequired"),
        approvalRequestedFrom=doc.get("approvalRequestedFrom"),
        approvalRequestedAt=doc.get("approvalRequestedAt"),
        approvalDecidedBy=doc.get("approvalDecidedBy"),
        approvalDecidedAt=doc.get("approvalDecidedAt"),
        approvalComment=doc.get("approvalComment"),
        approvalHistory=[
            ApprovalHistoryEntry(**e) for e in doc.get("approvalHistory", [])
        ],
        createdAt=doc["createdAt"],
        updatedAt=doc["updatedAt"],
        deletedAt=doc.get("deletedAt"),
    )


def _header_to_gr_response(doc: Dict[str, Any]) -> "GRResponse":
    """Convert a raw GR header document to GRResponse."""
    from ..models.document import GRResponse  # local import avoids circular at module level
    return GRResponse(
        docId=doc["docId"],
        organizationId=doc["organizationId"],
        companyCode=doc["companyCode"],
        docType=doc["docType"],
        docNumber=doc["docNumber"],
        docDate=doc["docDate"],
        status=doc["status"],
        baseDocId=doc["baseDocId"],
        baseDocNumber=doc.get("baseDocNumber", ""),
        vendorId=doc["vendorId"],
        vendorCode=doc.get("vendorCode"),
        vendorName=doc.get("vendorName"),
        currencyCode=doc.get("currencyCode", "AED"),
        receivedBy=doc.get("receivedBy") or doc.get("createdBy", ""),
        receivedDate=doc.get("receivedDate"),
        warehouseId=doc.get("warehouseId"),
        notes=doc.get("notes"),
        subtotalNet=Decimal(str(doc.get("subtotalNet", 0))),
        totalTax=Decimal(str(doc.get("totalTax", 0))),
        totalGross=Decimal(str(doc.get("totalGross", 0))),
        postedAt=doc.get("postedAt"),
        postedBy=doc.get("postedBy"),
        postedEventId=doc.get("postedEventId"),
        # Reason: GR has no approval gate; field present for shape consistency with PR/PO.
        approvalHistory=[],
        createdAt=doc["createdAt"],
        updatedAt=doc["updatedAt"],
        deletedAt=doc.get("deletedAt"),
    )


def _line_to_response(doc: Dict[str, Any]) -> DocumentLineResponse:
    """Convert a raw line document to DocumentLineResponse."""
    return DocumentLineResponse(
        lineId=doc["lineId"],
        docId=doc["docId"],
        organizationId=doc["organizationId"],
        lineNumber=doc["lineNumber"],
        itemId=doc["itemId"],
        itemCode=doc.get("itemCode", ""),
        itemName=doc.get("itemName", ""),
        itemType=doc.get("itemType"),
        description=doc.get("description"),
        uom=doc["uom"],
        quantity=Decimal(str(doc["quantity"])),
        openQuantity=Decimal(str(doc.get("openQuantity", doc["quantity"]))),
        closedQuantity=Decimal(str(doc.get("closedQuantity", 0))),
        unitPrice=Decimal(str(doc.get("unitPrice", 0))),
        discountPercent=Decimal(str(doc.get("discountPercent", 0))),
        lineNet=Decimal(str(doc.get("lineNet", 0))),
        taxCode=doc.get("taxCode"),
        taxRate=Decimal(str(doc.get("taxRate", 0))),
        lineTax=Decimal(str(doc.get("lineTax", 0))),
        lineGross=Decimal(str(doc.get("lineGross", 0))),
        costCenterId=doc.get("costCenterId"),
        warehouseId=doc.get("warehouseId"),
        requestedVendorId=doc.get("requestedVendorId"),
        baseLineId=doc.get("baseLineId"),
        notes=doc.get("notes"),
        # AP-specific fields (null for PR/PO/GR lines)
        grLineId=doc.get("grLineId"),
        poUnitPrice=Decimal(str(doc["poUnitPrice"])) if doc.get("poUnitPrice") is not None else None,
        # Reason: AP lines carry the invoiced price as `unitPrice` in storage.
        # Surface the same value as `invoiceUnitPrice` for AP lines so frontend
        # consumers reading the semantic field name see the stored value.
        # Only populate when this is an AP line (presence of poUnitPrice is
        # the existing AP-line marker on stored docs).
        invoiceUnitPrice=Decimal(str(doc.get("unitPrice", 0))) if doc.get("poUnitPrice") is not None else None,
        priceVarianceAmount=Decimal(str(doc["priceVarianceAmount"])) if doc.get("priceVarianceAmount") is not None else None,
        createdAt=doc["createdAt"],
        updatedAt=doc["updatedAt"],
    )


def _header_to_ap_response(doc: Dict[str, Any]) -> "APResponse":
    """Convert a raw AP header document to APResponse."""
    from ..models.document import APResponse  # local import avoids circular at module level
    return APResponse(
        docId=doc["docId"],
        organizationId=doc["organizationId"],
        companyCode=doc["companyCode"],
        docType=doc["docType"],
        docNumber=doc["docNumber"],
        docDate=doc["docDate"],
        status=doc["status"],
        baseDocId=doc["baseDocId"],
        baseDocNumber=doc.get("baseDocNumber", ""),
        vendorId=doc["vendorId"],
        vendorCode=doc.get("vendorCode"),
        vendorName=doc.get("vendorName"),
        currencyCode=doc.get("currencyCode", "AED"),
        invoiceNumber=doc.get("invoiceNumber", ""),
        invoiceDate=doc["invoiceDate"],
        dueDate=doc.get("dueDate"),
        paymentTermsCode=doc.get("paymentTermsCode"),
        notes=doc.get("notes"),
        subtotalNet=Decimal(str(doc.get("subtotalNet", 0))),
        totalTax=Decimal(str(doc.get("totalTax", 0))),
        totalGross=Decimal(str(doc.get("totalGross", 0))),
        totalPriceVariance=Decimal(str(doc.get("totalPriceVariance", 0))),
        approvalState=doc.get("approvalState", "NotRequired"),
        approvalRequestedFrom=doc.get("approvalRequestedFrom"),
        approvalRequestedAt=doc.get("approvalRequestedAt"),
        approvalDecidedBy=doc.get("approvalDecidedBy"),
        approvalDecidedAt=doc.get("approvalDecidedAt"),
        approvalComment=doc.get("approvalComment"),
        approvalHistory=[
            ApprovalHistoryEntry(**e) for e in doc.get("approvalHistory", [])
        ],
        postedAt=doc.get("postedAt"),
        postedBy=doc.get("postedBy"),
        postedEventId=doc.get("postedEventId"),
        createdAt=doc["createdAt"],
        updatedAt=doc["updatedAt"],
        deletedAt=doc.get("deletedAt"),
        # T-200.24: surface DPI allocations that were linked at AP creation time
        dpiAllocations=[
            AppliedDPIAllocation(**alloc) if isinstance(alloc, dict) else alloc
            for alloc in doc.get("dpiAllocations", [])
        ],
    )


# ---------------------------------------------------------------------------
# Document numbering
# ---------------------------------------------------------------------------


async def _next_doc_number(
    db: AsyncIOMotorDatabase,
    company_code: str,
    doc_type: DocType,
    session: Optional[AsyncIOMotorClientSession] = None,
) -> str:
    """
    Atomically increment and return the next document number.

    Format: <docType>-<YYYY>-<NNNN>  e.g.  PR-2026-0001

    Passing `session` ensures the counter increment participates in the
    caller's transaction.  If the transaction aborts, the counter increment
    is also rolled back so the same number cannot be issued twice.

    Args:
        db: Motor database.
        company_code: Finance company code.
        doc_type: 'PR' or 'PO'.
        session: Optional Motor session for transaction participation.

    Returns:
        Formatted document number string.
    """
    year = datetime.now(tz=timezone.utc).year
    counter_id = f"{company_code}:{doc_type}:{year}"

    result = await db[_COUNTERS_COL].find_one_and_update(
        {"_id": counter_id},
        {"$inc": {"counter": 1}},
        upsert=True,
        return_document=True,
        session=session,
    )
    n = result["counter"]
    return f"{doc_type}-{year}-{n:04d}"


# ---------------------------------------------------------------------------
# Line computation helpers
# ---------------------------------------------------------------------------


def _compute_line_totals(
    line_in: DocumentLineCreate,
    item_code: str,
    item_name: str,
) -> Dict[str, Any]:
    """
    Compute line-level totals given input data and resolved item info.

    Args:
        line_in: Line creation data.
        item_code: Denormalised item code.
        item_name: Denormalised item name.

    Returns:
        Dict suitable for inserting into document_lines.
    """
    qty = Decimal(str(line_in.quantity))
    price = Decimal(str(line_in.unitPrice))
    disc_pct = Decimal(str(getattr(line_in, "discountPercent", Decimal("0")) or Decimal("0")))
    # Reason: discount factor multiplies the gross line into the net after discount.
    # discountPercent is clamped 0..100 at the schema layer.
    discount_factor = (Decimal("100") - disc_pct) / Decimal("100")
    # Reason: tax rate lookup not available in Phase 1B — default to 5% VAT if taxCode is set
    tax_rate = Decimal("5") if line_in.taxCode else Decimal("0")
    line_net = (qty * price * discount_factor).quantize(Decimal("0.01"))
    line_tax = (line_net * tax_rate / Decimal("100")).quantize(Decimal("0.01"))
    line_gross = line_net + line_tax

    return {
        "lineId": str(uuid.uuid4()),
        "itemId": line_in.itemId,
        "itemCode": item_code,
        "itemName": item_name,
        "description": line_in.description,
        "uom": line_in.uom,
        "quantity": float(qty),
        "openQuantity": float(qty),
        "closedQuantity": 0.0,
        "unitPrice": float(price),
        "discountPercent": float(disc_pct),
        "lineNet": float(line_net),
        "taxCode": line_in.taxCode,
        "taxRate": float(tax_rate),
        "lineTax": float(line_tax),
        "lineGross": float(line_gross),
        "costCenterId": getattr(line_in, "costCenterId", None),
        "warehouseId": line_in.warehouseId,
        "requestedVendorId": line_in.requestedVendorId,
        "notes": line_in.notes,
        "baseLineId": None,
    }


def _sum_lines(lines: List[Dict[str, Any]]) -> Dict[str, float]:
    """
    Sum all line totals to compute header-level totals.

    Args:
        lines: List of computed line dicts.

    Returns:
        Dict with subtotalNet, totalTax, totalGross.
    """
    subtotal = sum(Decimal(str(ln["lineNet"])) for ln in lines)
    tax = sum(Decimal(str(ln["lineTax"])) for ln in lines)
    gross = subtotal + tax
    return {
        "subtotalNet": float(subtotal),
        "totalTax": float(tax),
        "totalGross": float(gross),
    }


# ---------------------------------------------------------------------------
# DocumentService
# ---------------------------------------------------------------------------


class DocumentService:
    """
    Service class for PR and PO document CRUD + approval operations.

    Every state-mutating method wraps its Mongo writes in a Motor session
    transaction via the `_txn()` context manager.  The header write, line
    writes, sequence-counter increment, and outbox insert all share the same
    session and commit atomically.  If any write fails the whole transaction
    aborts and the caller receives the exception — there is no silent
    best-effort fallback.
    """

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        """
        Initialise with a Motor database instance.

        Args:
            db: Async Motor database from the farm_db connection pool.
        """
        self._db = db
        self._headers = db[_HEADERS_COL]
        self._lines = db[_LINES_COL]
        self._engine = ApprovalEngine()

    # ------------------------------------------------------------------
    # Private: transaction context manager
    # ------------------------------------------------------------------

    @asynccontextmanager
    async def _txn(self) -> AsyncGenerator[AsyncIOMotorClientSession, None]:
        """
        Async context manager that yields a Motor session inside an active
        Mongo multi-document transaction.

        Usage:
            async with self._txn() as session:
                await self._headers.update_one({...}, {...}, session=session)
                await OutboxWriter.publish(..., session=session)
                # Exit without exception → commits automatically.
                # Exit with exception   → aborts automatically.

        Yields:
            AsyncIOMotorClientSession with an active transaction.
        """
        async with await self._db.client.start_session() as session:
            async with session.start_transaction():
                yield session

    # ------------------------------------------------------------------
    # Private: resolve item details
    # ------------------------------------------------------------------

    async def _resolve_item(self, item_id: str, org_id: str) -> Dict[str, str]:
        """
        Look up item code and name from purchase_items collection.

        Args:
            item_id: UUID string of the purchase item.
            org_id: Organisation scope.

        Returns:
            Dict with itemCode, itemName, and itemType.

        Raises:
            ValueError: If item not found.
        """
        item = await self._db["purchase_items"].find_one(
            {"itemId": item_id, "organizationId": org_id, "deletedAt": None}
        )
        if not item:
            raise ValueError(f"Purchase item '{item_id}' not found in organisation")
        return {
            "itemCode": item["itemCode"],
            "itemName": item["name"],
            "itemType": item.get("itemType", "raw_material"),
        }

    # ------------------------------------------------------------------
    # Private: build and insert lines
    # ------------------------------------------------------------------

    async def _build_and_insert_lines(
        self,
        doc_id: str,
        org_id: str,
        line_inputs: List[DocumentLineCreate],
        now: datetime,
        base_lines: Optional[Dict[str, str]] = None,
        session: Optional[AsyncIOMotorClientSession] = None,
    ) -> List[Dict[str, Any]]:
        """
        Build line documents, compute totals, and insert into document_lines.

        Args:
            doc_id: Parent document ID.
            org_id: Organisation scope.
            line_inputs: List of line creation inputs.
            now: Timestamp for createdAt/updatedAt.
            base_lines: Optional mapping of itemId → baseLineId for PO-from-PR.
            session: Optional Motor session to participate in a transaction.

        Returns:
            List of inserted line dicts (including all computed fields).
        """
        line_docs: List[Dict[str, Any]] = []
        for idx, line_in in enumerate(line_inputs, start=1):
            item_info = await self._resolve_item(line_in.itemId, org_id)
            computed = _compute_line_totals(line_in, item_info["itemCode"], item_info["itemName"])
            doc: Dict[str, Any] = {
                **computed,
                "docId": doc_id,
                "organizationId": org_id,
                "lineNumber": idx,
                "baseLineId": base_lines.get(line_in.itemId) if base_lines else None,
                "createdAt": now,
                "updatedAt": now,
            }
            line_docs.append(doc)

        if line_docs:
            await self._lines.insert_many(line_docs, session=session)
        return line_docs

    # ------------------------------------------------------------------
    # Private: get lines for a document
    # ------------------------------------------------------------------

    async def _get_lines(self, doc_id: str) -> List[DocumentLineResponse]:
        """
        Fetch all lines for a document, ordered by lineNumber.

        Args:
            doc_id: Document UUID string.

        Returns:
            List of DocumentLineResponse.
        """
        cursor = self._lines.find({"docId": doc_id}).sort("lineNumber", 1)
        docs = await cursor.to_list(length=None)
        return [_line_to_response(d) for d in docs]

    # ------------------------------------------------------------------
    # Private: outbox emission
    # ------------------------------------------------------------------

    async def _emit_pr_event(
        self,
        header: Dict[str, Any],
        previous_state: Optional[str],
        company_code: Optional[str],
        session: Optional[AsyncIOMotorClientSession] = None,
    ) -> None:
        """
        Emit pr_state_changed outbox event for a PR inside the active session.

        This method must be called from within `_txn()` with the same session
        used for the header write.  If the OutboxWriter raises, the exception
        propagates to the caller and the transaction aborts — no silent drop.

        Args:
            header: Current header document (post-update, read inside session).
            previous_state: State before this transition.
            company_code: Finance company code (falls back to header.companyCode).
            session: Motor session participating in the active transaction.
        """
        from src.modules.finance_bridge.outbox_writer import OutboxWriter

        # Reason: delegate payload construction to module-level builder so the
        # outbox reconciler sweeper can reuse the same schema without duplicating.
        payload = build_pr_event_payload(header, previous_state, company_code)

        await OutboxWriter.publish(
            db=self._db,
            event_type="pr_state_changed",
            organization_id=header["organizationId"],
            company_code=header.get("companyCode", company_code),
            payload=payload,
            source_user_id=header.get("updatedBy") or header.get("createdBy"),
            source_document_id=header["docId"],
            session=session,
        )

    async def _emit_po_event(
        self,
        header: Dict[str, Any],
        previous_state: Optional[str],
        company_code: Optional[str],
        session: Optional[AsyncIOMotorClientSession] = None,
    ) -> None:
        """
        Emit po_state_changed outbox event for a PO inside the active session.

        This method must be called from within `_txn()` with the same session
        used for the header write.  If the OutboxWriter raises, the exception
        propagates to the caller and the transaction aborts — no silent drop.

        Args:
            header: Current header document (post-update, read inside session).
            previous_state: State before this transition.
            company_code: Finance company code (falls back to header.companyCode).
            session: Motor session participating in the active transaction.
        """
        from src.modules.finance_bridge.outbox_writer import OutboxWriter

        # Reason: delegate payload construction to module-level builder so the
        # outbox reconciler sweeper can reuse the same schema without duplicating.
        payload = build_po_event_payload(header, previous_state, company_code)

        await OutboxWriter.publish(
            db=self._db,
            event_type="po_state_changed",
            organization_id=header["organizationId"],
            company_code=header.get("companyCode", company_code),
            payload=payload,
            source_user_id=header.get("updatedBy") or header.get("createdBy"),
            source_document_id=header["docId"],
            session=session,
        )

    # ==================================================================
    # Purchase Request CRUD
    # ==================================================================

    async def create_pr(
        self,
        org_id: str,
        data: PRCreate,
        created_by: str,
        company_code: Optional[str] = None,
    ) -> PRDetailResponse:
        """
        Create a new Purchase Request in Draft status.

        Args:
            org_id: Organisation UUID string.
            data: PR creation payload.
            created_by: UUID of the creating user.
            company_code: Finance company code resolved by the API layer via
                ``resolve_company_code()``. Must not be None when called.

        Returns:
            Created PRDetailResponse.

        Raises:
            ValueError: If company_code is not provided (caller must resolve it).
        """
        if not company_code:
            raise ValueError(
                "company_code is required to create a PR. "
                "The API layer must resolve it via resolve_company_code()."
            )
        now = datetime.now(tz=timezone.utc)
        doc_id = str(uuid.uuid4())

        # Reason: resolve item info before opening the transaction to keep
        # the transaction window as short as possible (no I/O inside except
        # the writes that must be atomic).
        line_docs_pre: List[Dict[str, Any]] = []
        for idx, line_in in enumerate(data.lines, start=1):
            item_info = await self._resolve_item(line_in.itemId, org_id)
            computed = _compute_line_totals(line_in, item_info["itemCode"], item_info["itemName"])
            doc: Dict[str, Any] = {
                **computed,
                "docId": doc_id,
                "organizationId": org_id,
                "lineNumber": idx,
                "baseLineId": None,
                "createdAt": now,
                "updatedAt": now,
            }
            line_docs_pre.append(doc)
        totals = _sum_lines(line_docs_pre)

        async with self._txn() as session:
            doc_number = await _next_doc_number(self._db, company_code, "PR", session=session)

            header: Dict[str, Any] = {
                "docId": doc_id,
                "organizationId": org_id,
                "companyCode": company_code,
                "docType": "PR",
                "docNumber": doc_number,
                "docDate": now,
                "postingDate": None,
                "dueDate": None,
                "expectedDeliveryDate": data.expectedDeliveryDate,
                "vendorId": None,
                "vendorCode": None,
                "vendorName": None,
                "paymentTermsCode": None,
                "currencyCode": "AED",
                "requestedBy": created_by,
                "requestedDate": now,
                "department": data.department,
                "urgency": data.urgency,
                "issuedBy": None,
                "issuedDate": None,
                "baseDocId": None,
                "status": DocumentStatus.DRAFT.value,
                **totals,
                "notes": data.notes,
                "approvalState": "NotRequired",
                "approvalRequestedFrom": None,
                "approvalRequestedAt": None,
                "approvalDecidedBy": None,
                "approvalDecidedAt": None,
                "approvalComment": None,
                "createdAt": now,
                "createdBy": created_by,
                "updatedAt": now,
                "updatedBy": created_by,
                "deletedAt": None,
            }

            if line_docs_pre:
                await self._lines.insert_many(line_docs_pre, session=session)
            await self._headers.insert_one(header, session=session)
            await self._emit_pr_event(header, None, company_code, session=session)

        logger.info("[DocumentService] created PR docNumber=%s org=%s", doc_number, org_id)
        lines = [_line_to_response(l) for l in line_docs_pre]
        return PRDetailResponse(**_header_to_pr_response(header).model_dump(), lines=lines)

    async def list_prs(
        self,
        org_id: str,
        *,
        page: int = 1,
        per_page: int = 20,
        status_filter: Optional[str] = None,
        search: Optional[str] = None,
        requester_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Paginated list of PRs for an organisation.

        Args:
            org_id: Organisation scope.
            page: Page number (1-based).
            per_page: Items per page.
            status_filter: Filter by status string.
            search: Substring search on docNumber.
            requester_id: Filter by requestedBy user ID.

        Returns:
            Dict with items, total, page, perPage, totalPages.
        """
        query: Dict[str, Any] = {
            "organizationId": org_id,
            "docType": "PR",
            "deletedAt": None,
        }
        if status_filter:
            query["status"] = status_filter
        if requester_id:
            query["requestedBy"] = requester_id
        if search:
            query["docNumber"] = {"$regex": search, "$options": "i"}

        total = await self._headers.count_documents(query)
        offset = (page - 1) * per_page
        cursor = self._headers.find(query).sort("docDate", -1).skip(offset).limit(per_page)
        docs = await cursor.to_list(length=per_page)

        return {
            "items": [_header_to_pr_response(d) for d in docs],
            "total": total,
            "page": page,
            "perPage": per_page,
            "totalPages": max(1, -(-total // per_page)),
        }

    async def get_pr(self, org_id: str, doc_id: str) -> Optional[PRDetailResponse]:
        """
        Fetch a single PR with its lines.

        Args:
            org_id: Organisation scope.
            doc_id: Document UUID string.

        Returns:
            PRDetailResponse or None if not found.
        """
        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "PR", "deletedAt": None}
        )
        if not header:
            return None
        lines = await self._get_lines(doc_id)
        return PRDetailResponse(**_header_to_pr_response(header).model_dump(), lines=lines)

    async def update_pr(
        self,
        org_id: str,
        doc_id: str,
        data: PRUpdate,
        updated_by: str,
    ) -> Optional[PRDetailResponse]:
        """
        Partial update a Draft PR.

        Args:
            org_id: Organisation scope.
            doc_id: Document UUID string.
            data: Partial update payload.
            updated_by: User UUID string.

        Returns:
            Updated PRDetailResponse or None if not found.

        Raises:
            ValueError: If PR is not in Draft status.
        """
        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "PR", "deletedAt": None}
        )
        if not header:
            return None
        if _parse_status(header["status"]) != DocumentStatus.DRAFT:
            raise ValueError("Only Draft PRs can be updated")

        now = datetime.now(tz=timezone.utc)
        updates: Dict[str, Any] = {"updatedAt": now, "updatedBy": updated_by}

        if data.department is not None:
            updates["department"] = data.department
        if data.urgency is not None:
            updates["urgency"] = data.urgency
        if data.notes is not None:
            updates["notes"] = data.notes
        if data.expectedDeliveryDate is not None:
            updates["expectedDeliveryDate"] = data.expectedDeliveryDate

        # Reason: pre-resolve item info outside the transaction to avoid extra
        # network I/O inside the transaction window.
        new_line_docs: Optional[List[Dict[str, Any]]] = None
        if data.lines is not None:
            new_line_docs = []
            for idx, line_in in enumerate(data.lines, start=1):
                item_info = await self._resolve_item(line_in.itemId, org_id)
                computed = _compute_line_totals(line_in, item_info["itemCode"], item_info["itemName"])
                new_line_docs.append({
                    **computed,
                    "docId": doc_id,
                    "organizationId": org_id,
                    "lineNumber": idx,
                    "baseLineId": None,
                    "createdAt": now,
                    "updatedAt": now,
                })
            totals = _sum_lines(new_line_docs)
            updates.update(totals)

        async with self._txn() as session:
            if new_line_docs is not None:
                # Reason: replace lines wholesale — delete old, insert new
                await self._lines.delete_many({"docId": doc_id}, session=session)
                if new_line_docs:
                    await self._lines.insert_many(new_line_docs, session=session)

            await self._headers.update_one({"docId": doc_id}, {"$set": updates}, session=session)
            updated = await self._headers.find_one({"docId": doc_id}, session=session)
            assert updated is not None

        lines = await self._get_lines(doc_id)
        return PRDetailResponse(**_header_to_pr_response(updated).model_dump(), lines=lines)

    async def soft_delete_pr(self, org_id: str, doc_id: str, deleted_by: str) -> bool:
        """
        Soft-delete a Draft PR.

        Args:
            org_id: Organisation scope.
            doc_id: Document UUID string.
            deleted_by: User UUID string.

        Returns:
            True if deleted, False if not found.

        Raises:
            ValueError: If PR is not in Draft status.
        """
        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "PR", "deletedAt": None}
        )
        if not header:
            return False
        if _parse_status(header["status"]) != DocumentStatus.DRAFT:
            raise ValueError("Only Draft PRs can be deleted")

        now = datetime.now(tz=timezone.utc)
        await self._headers.update_one(
            {"docId": doc_id},
            {"$set": {"deletedAt": now, "updatedAt": now, "updatedBy": deleted_by}},
        )
        logger.info("[DocumentService] soft-deleted PR docId=%s", doc_id)
        return True

    async def submit_pr(
        self,
        org_id: str,
        doc_id: str,
        submitted_by: str,
        company_code: Optional[str] = None,
    ) -> PRDetailResponse:
        """
        Submit a PR for approval (Draft → Pending Approval or Approved).

        Queries the approval engine to determine if approval is required.
        If not required, moves directly to Approved.

        The approval-engine HTTP call is made OUTSIDE the transaction.
        See module docstring for rationale.

        Args:
            org_id: Organisation scope.
            doc_id: Document UUID string.
            submitted_by: User UUID string.
            company_code: Finance company code.

        Returns:
            Updated PRDetailResponse.

        Raises:
            ValueError: If PR not found or invalid transition.
        """
        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "PR", "deletedAt": None}
        )
        if not header:
            raise ValueError(f"PR '{doc_id}' not found")

        current_status = _parse_status(header["status"])
        # Reason: submit always targets PENDING_APPROVAL first; the engine may
        # then auto-approve to OPEN.  Validate the first hop (DRAFT → PENDING_APPROVAL).
        assert_legal_transition(_DOC_TYPE_PR, current_status, DocumentStatus.PENDING_APPROVAL)

        # Reason: resolve approval decision before opening the transaction so
        # the network call cannot hold the Mongo transaction open.
        total_gross = Decimal(str(header.get("totalGross", 0)))
        decision: EngineDecision = await self._engine.resolve_required_approval(
            org_id=org_id,
            company_code=company_code,
            doc_type="PR",
            amount=total_gross,
        )

        now = datetime.now(tz=timezone.utc)
        previous_status = header["status"]

        if decision.required:
            new_status = DocumentStatus.PENDING_APPROVAL.value
            updates: Dict[str, Any] = {
                "status": new_status,
                "approvalState": "Pending",
                "approvalRequestedFrom": decision.approver_role,
                "approvalRequestedAt": now,
                "updatedAt": now,
                "updatedBy": submitted_by,
            }
        else:
            # Reason: no approval gate → direct DRAFT → OPEN (the "auto-approve" path).
            # LEGAL_TRANSITIONS["PR"] allows DRAFT → OPEN directly.
            assert_legal_transition(_DOC_TYPE_PR, current_status, DocumentStatus.OPEN)
            new_status = DocumentStatus.OPEN.value
            updates = {
                "status": new_status,
                "approvalState": "NotRequired",
                "updatedAt": now,
                "updatedBy": submitted_by,
            }

        async with self._txn() as session:
            # Reason: initialize approvalHistory on first submit so the array always exists;
            # $push in approve/reject will append to it.  $setOnInsert would not work here
            # because we're updating, not inserting — use conditional set instead.
            await self._headers.update_one(
                {"docId": doc_id, "approvalHistory": {"$exists": False}},
                {"$set": {"approvalHistory": []}},
                session=session,
            )
            await self._headers.update_one({"docId": doc_id}, {"$set": updates}, session=session)
            updated = await self._headers.find_one({"docId": doc_id}, session=session)
            assert updated is not None
            await self._emit_pr_event(updated, previous_status, company_code, session=session)

        logger.info(
            "[DocumentService] submitted PR docId=%s newStatus=%s", doc_id, new_status
        )
        lines = await self._get_lines(doc_id)
        return PRDetailResponse(**_header_to_pr_response(updated).model_dump(), lines=lines)

    async def approve_pr(
        self,
        org_id: str,
        doc_id: str,
        approver_id: str,
        approver_role: str,
        comment: Optional[str],
        company_code: Optional[str] = None,
    ) -> PRDetailResponse:
        """
        Approve a PR in Pending Approval state.

        Validates:
        - PR is Pending Approval
        - Approver has the correct role
        - Approver is not the requester

        Args:
            org_id: Organisation scope.
            doc_id: Document UUID string.
            approver_id: UUID of the approving user.
            approver_role: Role of the approver.
            comment: Optional approval comment.
            company_code: Finance company code.

        Returns:
            Updated PRDetailResponse.

        Raises:
            ValueError: On invalid state, wrong role, or self-approval.
        """
        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "PR", "deletedAt": None}
        )
        if not header:
            raise ValueError(f"PR '{doc_id}' not found")

        current_status = _parse_status(header["status"])
        assert_legal_transition(_DOC_TYPE_PR, current_status, DocumentStatus.OPEN)

        # Reason: approver must hold the role specified in the approval request
        required_role = header.get("approvalRequestedFrom")
        # Reason: admin and super_admin always have approval authority over any
        # role; otherwise the approver must hold the exact required role.
        _APPROVAL_OVERRIDE_ROLES = {"admin", "super_admin"}
        if required_role and approver_role != required_role and approver_role not in _APPROVAL_OVERRIDE_ROLES:
            raise ValueError(
                f"Approval requires role '{required_role}'; your role is '{approver_role}'"
            )

        # Reason: prevent self-approval (separation of duties). admin and
        # super_admin can override — production deployments should consider
        # this a development convenience, NOT a controls bypass. Real SoD in
        # production is enforced through procedure (don't have super_admins
        # create operational documents in their own name) rather than code.
        if (
            header.get("requestedBy") == approver_id
            and approver_role not in _APPROVAL_OVERRIDE_ROLES
        ):
            raise ValueError("You cannot approve your own Purchase Request")

        now = datetime.now(tz=timezone.utc)
        previous_status = header["status"]

        history_entry = {
            "stepNumber": 1,
            "approverId": approver_id,
            "approverRole": approver_role,
            "decision": "Approved",
            "decidedAt": now,
            "comment": comment,
            "workflowId": None,
        }

        async with self._txn() as session:
            await self._headers.update_one(
                {"docId": doc_id},
                {
                    "$set": {
                        "status": DocumentStatus.OPEN.value,
                        "approvalState": "Approved",
                        "approvalDecidedBy": approver_id,
                        "approvalDecidedAt": now,
                        "approvalComment": comment,
                        "updatedAt": now,
                        "updatedBy": approver_id,
                    },
                    "$push": {"approvalHistory": history_entry},
                },
                session=session,
            )
            updated = await self._headers.find_one({"docId": doc_id}, session=session)
            assert updated is not None
            await self._emit_pr_event(updated, previous_status, company_code, session=session)

        logger.info("[DocumentService] approved PR docId=%s by user=%s", doc_id, approver_id)
        lines = await self._get_lines(doc_id)
        return PRDetailResponse(**_header_to_pr_response(updated).model_dump(), lines=lines)

    async def reject_pr(
        self,
        org_id: str,
        doc_id: str,
        approver_id: str,
        approver_role: str,
        comment: str,
        company_code: Optional[str] = None,
    ) -> PRDetailResponse:
        """
        Reject a PR in Pending Approval state.

        Args:
            org_id: Organisation scope.
            doc_id: Document UUID string.
            approver_id: UUID of the rejecting user.
            approver_role: Role of the approver.
            comment: Rejection reason (required).
            company_code: Finance company code.

        Returns:
            Updated PRDetailResponse.

        Raises:
            ValueError: On invalid state or wrong role.
        """
        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "PR", "deletedAt": None}
        )
        if not header:
            raise ValueError(f"PR '{doc_id}' not found")

        # Reason: "Rejected" has no DocumentStatus equivalent (Wave 4 gap).
        # Use the legacy fallback validator for this path.
        _validate_transition_legacy(_DOC_TYPE_PR, header["status"], "Rejected")

        required_role = header.get("approvalRequestedFrom")
        # Reason: admin and super_admin always have approval authority over any
        # role; otherwise the approver must hold the exact required role.
        _APPROVAL_OVERRIDE_ROLES = {"admin", "super_admin"}
        if required_role and approver_role != required_role and approver_role not in _APPROVAL_OVERRIDE_ROLES:
            raise ValueError(
                f"Approval requires role '{required_role}'; your role is '{approver_role}'"
            )

        now = datetime.now(tz=timezone.utc)
        previous_status = header["status"]

        history_entry = {
            "stepNumber": 1,
            "approverId": approver_id,
            "approverRole": approver_role,
            "decision": "Rejected",
            "decidedAt": now,
            "comment": comment,
            "workflowId": None,
        }

        async with self._txn() as session:
            await self._headers.update_one(
                {"docId": doc_id},
                {
                    "$set": {
                        # Reason: "Rejected" has no shared enum equivalent;
                        # stored as-is until the enum is extended in a future task.
                        "status": "Rejected",
                        "approvalState": "Rejected",
                        "approvalDecidedBy": approver_id,
                        "approvalDecidedAt": now,
                        "approvalComment": comment,
                        "updatedAt": now,
                        "updatedBy": approver_id,
                    },
                    "$push": {"approvalHistory": history_entry},
                },
                session=session,
            )
            updated = await self._headers.find_one({"docId": doc_id}, session=session)
            assert updated is not None
            await self._emit_pr_event(updated, previous_status, company_code, session=session)

        logger.info("[DocumentService] rejected PR docId=%s by user=%s", doc_id, approver_id)
        lines = await self._get_lines(doc_id)
        return PRDetailResponse(**_header_to_pr_response(updated).model_dump(), lines=lines)

    async def cancel_pr(
        self,
        org_id: str,
        doc_id: str,
        cancelled_by: str,
        company_code: Optional[str] = None,
    ) -> PRDetailResponse:
        """
        Cancel a PR in Draft or Pending Approval state.

        Args:
            org_id: Organisation scope.
            doc_id: Document UUID string.
            cancelled_by: User UUID string.
            company_code: Finance company code.

        Returns:
            Updated PRDetailResponse.

        Raises:
            ValueError: On invalid transition.
        """
        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "PR", "deletedAt": None}
        )
        if not header:
            raise ValueError(f"PR '{doc_id}' not found")

        current_status = _parse_status(header["status"])
        assert_legal_transition(_DOC_TYPE_PR, current_status, DocumentStatus.CANCELLED)

        now = datetime.now(tz=timezone.utc)
        previous_status = header["status"]

        async with self._txn() as session:
            await self._headers.update_one(
                {"docId": doc_id},
                {"$set": {
                    "status": DocumentStatus.CANCELLED.value,
                    "approvalState": header.get("approvalState", "NotRequired"),
                    "updatedAt": now,
                    "updatedBy": cancelled_by,
                }},
                session=session,
            )
            updated = await self._headers.find_one({"docId": doc_id}, session=session)
            assert updated is not None
            await self._emit_pr_event(updated, previous_status, company_code, session=session)

        logger.info("[DocumentService] cancelled PR docId=%s", doc_id)
        lines = await self._get_lines(doc_id)
        return PRDetailResponse(**_header_to_pr_response(updated).model_dump(), lines=lines)

    # ==================================================================
    # Purchase Order CRUD
    # ==================================================================

    async def _resolve_vendor(self, vendor_id: str, org_id: str) -> Dict[str, str]:
        """
        Look up vendor code and name from vendors collection.

        Args:
            vendor_id: Vendor UUID string.
            org_id: Organisation scope.

        Returns:
            Dict with vendorCode and vendorName.

        Raises:
            ValueError: If vendor not found.
        """
        vendor = await self._db["vendors"].find_one(
            {"vendorId": vendor_id, "organizationId": org_id, "deletedAt": None}
        )
        if not vendor:
            raise ValueError(f"Vendor '{vendor_id}' not found in organisation")
        return {"vendorCode": vendor["vendorCode"], "vendorName": vendor["name"]}

    async def create_po(
        self,
        org_id: str,
        data: POCreate,
        created_by: str,
        company_code: Optional[str] = None,
    ) -> PODetailResponse:
        """
        Create a new Purchase Order in Draft status.

        Args:
            org_id: Organisation UUID string.
            data: PO creation payload.
            created_by: UUID of the creating user.
            company_code: Finance company code resolved by the API layer via
                ``resolve_company_code()``. Must not be None when called.

        Returns:
            Created PODetailResponse.

        Raises:
            ValueError: If vendor or any item not found, or company_code not provided.
        """
        if not company_code:
            raise ValueError(
                "company_code is required to create a PO. "
                "The API layer must resolve it via resolve_company_code()."
            )
        now = datetime.now(tz=timezone.utc)
        doc_id = str(uuid.uuid4())

        # Reason: resolve vendor and items before opening the transaction to
        # keep the transaction window as short as possible.
        vendor_info = await self._resolve_vendor(data.vendorId, org_id)
        line_docs_pre: List[Dict[str, Any]] = []
        for idx, line_in in enumerate(data.lines, start=1):
            item_info = await self._resolve_item(line_in.itemId, org_id)
            computed = _compute_line_totals(line_in, item_info["itemCode"], item_info["itemName"])
            line_docs_pre.append({
                **computed,
                "docId": doc_id,
                "organizationId": org_id,
                "lineNumber": idx,
                "baseLineId": None,
                "createdAt": now,
                "updatedAt": now,
            })
        totals = _sum_lines(line_docs_pre)

        async with self._txn() as session:
            doc_number = await _next_doc_number(self._db, company_code, "PO", session=session)

            header: Dict[str, Any] = {
                "docId": doc_id,
                "organizationId": org_id,
                "companyCode": company_code,
                "docType": "PO",
                "docNumber": doc_number,
                "docDate": now,
                "postingDate": None,
                "dueDate": None,
                "expectedDeliveryDate": data.expectedDeliveryDate,
                "vendorId": data.vendorId,
                "vendorCode": vendor_info["vendorCode"],
                "vendorName": vendor_info["vendorName"],
                "paymentTermsCode": data.paymentTermsCode,
                "currencyCode": "AED",
                "requestedBy": None,
                "requestedDate": None,
                "department": None,
                "urgency": "normal",
                "issuedBy": created_by,
                "issuedDate": None,
                "baseDocId": None,
                "status": DocumentStatus.DRAFT.value,
                **totals,
                "notes": data.notes,
                "approvalState": "NotRequired",
                "approvalRequestedFrom": None,
                "approvalRequestedAt": None,
                "approvalDecidedBy": None,
                "approvalDecidedAt": None,
                "approvalComment": None,
                "createdAt": now,
                "createdBy": created_by,
                "updatedAt": now,
                "updatedBy": created_by,
                "deletedAt": None,
            }

            if line_docs_pre:
                await self._lines.insert_many(line_docs_pre, session=session)
            await self._headers.insert_one(header, session=session)
            await self._emit_po_event(header, None, company_code, session=session)

        logger.info("[DocumentService] created PO docNumber=%s org=%s", doc_number, org_id)
        lines = [_line_to_response(l) for l in line_docs_pre]
        return PODetailResponse(**_header_to_po_response(header).model_dump(), lines=lines)

    async def create_po_from_pr(
        self,
        org_id: str,
        pr_doc_id: str,
        data: POFromPRCreate,
        created_by: str,
        company_code: Optional[str] = None,
    ) -> PODetailResponse:
        """
        Create a PO from an Approved PR.

        Copies all lines from the PR and links them via baseLineId.
        Sets PR.status = Closed after creating the PO.

        ALL writes (PR header close, PO header insert, PO lines insert, PR
        outbox event, PO outbox event) happen inside a single transaction so
        they are atomic.

        Args:
            org_id: Organisation scope.
            pr_doc_id: Approved PR docId.
            data: PO creation options (vendor, payment terms, etc.).
            created_by: User UUID string.
            company_code: Finance company code resolved by the API layer via
                ``resolve_company_code()``. Must not be None when called.

        Returns:
            Created PODetailResponse.

        Raises:
            ValueError: If PR not found, not Approved, vendor not found, or
                company_code not provided.
        """
        if not company_code:
            raise ValueError(
                "company_code is required to create a PO from PR. "
                "The API layer must resolve it via resolve_company_code()."
            )
        pr_header = await self._headers.find_one(
            {"organizationId": org_id, "docId": pr_doc_id, "docType": "PR", "deletedAt": None}
        )
        if not pr_header:
            raise ValueError(f"PR '{pr_doc_id}' not found")
        if _parse_status(pr_header["status"]) != DocumentStatus.OPEN:
            raise ValueError("Only Approved PRs can be converted to a PO")

        # Reason: resolve vendor before opening the transaction to avoid network
        # I/O inside the transaction window.
        vendor_info = await self._resolve_vendor(data.vendorId, org_id)

        # Fetch PR lines outside the transaction (read-only, no consistency risk).
        pr_lines_cursor = self._lines.find({"docId": pr_doc_id}).sort("lineNumber", 1)
        pr_lines = await pr_lines_cursor.to_list(length=None)

        if not pr_lines:
            raise ValueError("PR has no lines to copy")

        now = datetime.now(tz=timezone.utc)
        doc_id = str(uuid.uuid4())

        # Build PO line dicts from PR lines (pure computation, no DB I/O).
        po_line_docs: List[Dict[str, Any]] = []
        for idx, pr_line in enumerate(pr_lines, start=1):
            qty = Decimal(str(pr_line["quantity"]))
            price = Decimal(str(pr_line.get("unitPrice", 0)))
            tax_rate = Decimal(str(pr_line.get("taxRate", 0)))
            # Reason: discountPercent + costCenterId inherited from the PR line —
            # both fields carry through PR → PO → GR → AP unchanged.
            disc_pct = Decimal(str(pr_line.get("discountPercent", 0) or 0))
            discount_factor = (Decimal("100") - disc_pct) / Decimal("100")
            line_net = (qty * price * discount_factor).quantize(Decimal("0.01"))
            line_tax = (line_net * tax_rate / Decimal("100")).quantize(Decimal("0.01"))
            line_gross = line_net + line_tax

            po_line_docs.append({
                "lineId": str(uuid.uuid4()),
                "docId": doc_id,
                "organizationId": org_id,
                "lineNumber": idx,
                "itemId": pr_line["itemId"],
                "itemCode": pr_line.get("itemCode", ""),
                "itemName": pr_line.get("itemName", ""),
                "description": pr_line.get("description"),
                "uom": pr_line["uom"],
                "quantity": float(qty),
                "openQuantity": float(qty),
                "closedQuantity": 0.0,
                "unitPrice": float(price),
                "discountPercent": float(disc_pct),
                "lineNet": float(line_net),
                "taxCode": pr_line.get("taxCode"),
                "taxRate": float(tax_rate),
                "lineTax": float(line_tax),
                "lineGross": float(line_gross),
                "costCenterId": pr_line.get("costCenterId"),
                "warehouseId": pr_line.get("warehouseId"),
                "requestedVendorId": None,
                "baseLineId": pr_line["lineId"],
                "notes": pr_line.get("notes"),
                "createdAt": now,
                "updatedAt": now,
            })

        totals = _sum_lines(po_line_docs)

        async with self._txn() as session:
            doc_number = await _next_doc_number(self._db, company_code, "PO", session=session)

            header: Dict[str, Any] = {
                "docId": doc_id,
                "organizationId": org_id,
                "companyCode": company_code,
                "docType": "PO",
                "docNumber": doc_number,
                "docDate": now,
                "postingDate": None,
                "dueDate": None,
                "expectedDeliveryDate": data.expectedDeliveryDate,
                "vendorId": data.vendorId,
                "vendorCode": vendor_info["vendorCode"],
                "vendorName": vendor_info["vendorName"],
                "paymentTermsCode": data.paymentTermsCode,
                "currencyCode": "AED",
                "requestedBy": pr_header.get("requestedBy"),
                "requestedDate": pr_header.get("requestedDate"),
                "department": pr_header.get("department"),
                "urgency": pr_header.get("urgency", "normal"),
                "issuedBy": created_by,
                "issuedDate": None,
                "baseDocId": pr_doc_id,
                "status": DocumentStatus.DRAFT.value,
                **totals,
                "notes": data.notes,
                "approvalState": "NotRequired",
                "approvalRequestedFrom": None,
                "approvalRequestedAt": None,
                "approvalDecidedBy": None,
                "approvalDecidedAt": None,
                "approvalComment": None,
                "createdAt": now,
                "createdBy": created_by,
                "updatedAt": now,
                "updatedBy": created_by,
                "deletedAt": None,
            }

            if po_line_docs:
                await self._lines.insert_many(po_line_docs, session=session)
            await self._headers.insert_one(header, session=session)

            # Reason: auto-close the PR once a PO is created from it (Part 1 —
            # T-200.22).  The close is unconditional here because create_po_from_pr
            # always takes all open PR lines in one shot; the PR is fully ordered
            # after this call.  Both the PR header update and the PO header insert
            # must be in the same transaction so neither can commit without the other.
            # Audit action "auto_close_on_full_order" is the purchasing semantic
            # variant of sales' "auto_close_on_full_invoice"; the different name
            # makes it distinguishable in the audit trail.
            await self._headers.update_one(
                {"docId": pr_doc_id},
                {"$set": {"status": DocumentStatus.CLOSED.value, "updatedAt": now, "updatedBy": created_by}},
                session=session,
            )
            pr_updated = await self._headers.find_one({"docId": pr_doc_id}, session=session)
            assert pr_updated is not None

            # Emit both events inside the same transaction.
            await self._emit_pr_event(pr_updated, DocumentStatus.OPEN.value, company_code, session=session)
            await self._emit_po_event(header, None, company_code, session=session)

        # Reason: best-effort audit write OUTSIDE the transaction — audit failure
        # must never roll back the PR/PO creation.  The PR is already closed by
        # this point; we are just recording the chain event.
        await write_purchasing_audit(
            self._db,
            audit_collection=_PR_AUDIT_COL,
            doc_id=pr_doc_id,
            action="auto_close_on_full_order",
            user_id=created_by,
            detail={
                "triggeredByPoDocId": doc_id,
                "triggeredByPoDocNumber": doc_number,
            },
        )

        logger.info(
            "[DocumentService] created PO %s from PR %s", doc_number, pr_header["docNumber"]
        )
        lines = [_line_to_response(l) for l in po_line_docs]
        return PODetailResponse(**_header_to_po_response(header).model_dump(), lines=lines)

    async def list_pos(
        self,
        org_id: str,
        *,
        page: int = 1,
        per_page: int = 20,
        status_filter: Optional[str] = None,
        search: Optional[str] = None,
        vendor_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Paginated list of POs for an organisation.

        Args:
            org_id: Organisation scope.
            page: Page number.
            per_page: Items per page.
            status_filter: Filter by status string.
            search: Substring search on docNumber.
            vendor_id: Filter by vendorId.

        Returns:
            Dict with items, total, page, perPage, totalPages.
        """
        query: Dict[str, Any] = {
            "organizationId": org_id,
            "docType": "PO",
            "deletedAt": None,
        }
        if status_filter:
            query["status"] = status_filter
        if vendor_id:
            query["vendorId"] = vendor_id
        if search:
            query["docNumber"] = {"$regex": search, "$options": "i"}

        total = await self._headers.count_documents(query)
        offset = (page - 1) * per_page
        cursor = self._headers.find(query).sort("docDate", -1).skip(offset).limit(per_page)
        docs = await cursor.to_list(length=per_page)

        return {
            "items": [_header_to_po_response(d) for d in docs],
            "total": total,
            "page": page,
            "perPage": per_page,
            "totalPages": max(1, -(-total // per_page)),
        }

    async def get_po(self, org_id: str, doc_id: str) -> Optional[PODetailResponse]:
        """
        Fetch a single PO with its lines.

        Args:
            org_id: Organisation scope.
            doc_id: Document UUID string.

        Returns:
            PODetailResponse or None if not found.
        """
        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "PO", "deletedAt": None}
        )
        if not header:
            return None
        lines = await self._get_lines(doc_id)
        return PODetailResponse(**_header_to_po_response(header).model_dump(), lines=lines)

    async def update_po(
        self,
        org_id: str,
        doc_id: str,
        data: POUpdate,
        updated_by: str,
    ) -> Optional[PODetailResponse]:
        """
        Partial update a Draft PO.

        Args:
            org_id: Organisation scope.
            doc_id: Document UUID string.
            data: Partial update payload.
            updated_by: User UUID string.

        Returns:
            Updated PODetailResponse or None if not found.

        Raises:
            ValueError: If PO is not in Draft status.
        """
        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "PO", "deletedAt": None}
        )
        if not header:
            return None
        if _parse_status(header["status"]) != DocumentStatus.DRAFT:
            raise ValueError("Only Draft POs can be updated")

        now = datetime.now(tz=timezone.utc)
        updates: Dict[str, Any] = {"updatedAt": now, "updatedBy": updated_by}

        if data.vendorId is not None:
            vendor_info = await self._resolve_vendor(data.vendorId, org_id)
            updates["vendorId"] = data.vendorId
            updates["vendorCode"] = vendor_info["vendorCode"]
            updates["vendorName"] = vendor_info["vendorName"]
        if data.paymentTermsCode is not None:
            updates["paymentTermsCode"] = data.paymentTermsCode
        if data.expectedDeliveryDate is not None:
            updates["expectedDeliveryDate"] = data.expectedDeliveryDate
        if data.notes is not None:
            updates["notes"] = data.notes
        # Reason: pre-resolve item info outside the transaction to avoid extra
        # network I/O inside the transaction window.
        new_po_line_docs: Optional[List[Dict[str, Any]]] = None
        if data.lines is not None:
            new_po_line_docs = []
            for idx, line_in in enumerate(data.lines, start=1):
                item_info = await self._resolve_item(line_in.itemId, org_id)
                computed = _compute_line_totals(line_in, item_info["itemCode"], item_info["itemName"])
                new_po_line_docs.append({
                    **computed,
                    "docId": doc_id,
                    "organizationId": org_id,
                    "lineNumber": idx,
                    "baseLineId": None,
                    "createdAt": now,
                    "updatedAt": now,
                })
            totals = _sum_lines(new_po_line_docs)
            updates.update(totals)

        async with self._txn() as session:
            if new_po_line_docs is not None:
                # Reason: replace lines wholesale — delete old, insert new
                await self._lines.delete_many({"docId": doc_id}, session=session)
                if new_po_line_docs:
                    await self._lines.insert_many(new_po_line_docs, session=session)

            await self._headers.update_one({"docId": doc_id}, {"$set": updates}, session=session)
            updated = await self._headers.find_one({"docId": doc_id}, session=session)
            assert updated is not None

        lines = await self._get_lines(doc_id)
        return PODetailResponse(**_header_to_po_response(updated).model_dump(), lines=lines)

    async def soft_delete_po(self, org_id: str, doc_id: str, deleted_by: str) -> bool:
        """
        Soft-delete a Draft PO.

        Args:
            org_id: Organisation scope.
            doc_id: Document UUID string.
            deleted_by: User UUID string.

        Returns:
            True if deleted, False if not found.

        Raises:
            ValueError: If PO is not in Draft status.
        """
        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "PO", "deletedAt": None}
        )
        if not header:
            return False
        if _parse_status(header["status"]) != DocumentStatus.DRAFT:
            raise ValueError("Only Draft POs can be deleted")

        now = datetime.now(tz=timezone.utc)
        await self._headers.update_one(
            {"docId": doc_id},
            {"$set": {"deletedAt": now, "updatedAt": now, "updatedBy": deleted_by}},
        )
        logger.info("[DocumentService] soft-deleted PO docId=%s", doc_id)
        return True

    async def submit_po(
        self,
        org_id: str,
        doc_id: str,
        submitted_by: str,
        company_code: Optional[str] = None,
    ) -> PODetailResponse:
        """
        Submit a PO (Draft → Pending Approval or Open).

        The approval-engine HTTP call is made OUTSIDE the transaction.
        See module docstring for rationale.

        Args:
            org_id: Organisation scope.
            doc_id: Document UUID string.
            submitted_by: User UUID string.
            company_code: Finance company code.

        Returns:
            Updated PODetailResponse.

        Raises:
            ValueError: If PO not found or invalid transition.
        """
        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "PO", "deletedAt": None}
        )
        if not header:
            raise ValueError(f"PO '{doc_id}' not found")

        current_status = _parse_status(header["status"])
        assert_legal_transition(_DOC_TYPE_PO, current_status, DocumentStatus.PENDING_APPROVAL)

        # Reason: resolve approval decision before opening the transaction so
        # the network call cannot hold the Mongo transaction open.
        total_gross = Decimal(str(header.get("totalGross", 0)))
        decision: EngineDecision = await self._engine.resolve_required_approval(
            org_id=org_id,
            company_code=company_code,
            doc_type="PO",
            amount=total_gross,
        )

        now = datetime.now(tz=timezone.utc)
        previous_status = header["status"]

        if decision.required:
            new_status = DocumentStatus.PENDING_APPROVAL.value
            updates: Dict[str, Any] = {
                "status": new_status,
                "approvalState": "Pending",
                "approvalRequestedFrom": decision.approver_role,
                "approvalRequestedAt": now,
                "postingDate": now,
                "updatedAt": now,
                "updatedBy": submitted_by,
            }
        else:
            # Reason: no approval gate → direct DRAFT → OPEN.
            assert_legal_transition(_DOC_TYPE_PO, current_status, DocumentStatus.OPEN)
            new_status = DocumentStatus.OPEN.value
            updates = {
                "status": new_status,
                "approvalState": "NotRequired",
                "postingDate": now,
                "issuedDate": now,
                "updatedAt": now,
                "updatedBy": submitted_by,
            }

        async with self._txn() as session:
            # Reason: initialize approvalHistory on first submit so the array always exists;
            # $push in approve/reject will append to it.
            await self._headers.update_one(
                {"docId": doc_id, "approvalHistory": {"$exists": False}},
                {"$set": {"approvalHistory": []}},
                session=session,
            )
            await self._headers.update_one({"docId": doc_id}, {"$set": updates}, session=session)
            updated = await self._headers.find_one({"docId": doc_id}, session=session)
            assert updated is not None
            await self._emit_po_event(updated, previous_status, company_code, session=session)

        logger.info(
            "[DocumentService] submitted PO docId=%s newStatus=%s", doc_id, new_status
        )
        lines = await self._get_lines(doc_id)
        return PODetailResponse(**_header_to_po_response(updated).model_dump(), lines=lines)

    async def approve_po(
        self,
        org_id: str,
        doc_id: str,
        approver_id: str,
        approver_role: str,
        comment: Optional[str],
        company_code: Optional[str] = None,
    ) -> PODetailResponse:
        """
        Approve a PO in Pending Approval state → Open.

        Args:
            org_id: Organisation scope.
            doc_id: Document UUID string.
            approver_id: UUID of the approving user.
            approver_role: Role of the approver.
            comment: Optional approval comment.
            company_code: Finance company code.

        Returns:
            Updated PODetailResponse.

        Raises:
            ValueError: On invalid state, wrong role, or self-approval.
        """
        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "PO", "deletedAt": None}
        )
        if not header:
            raise ValueError(f"PO '{doc_id}' not found")

        current_status = _parse_status(header["status"])
        assert_legal_transition(_DOC_TYPE_PO, current_status, DocumentStatus.OPEN)

        required_role = header.get("approvalRequestedFrom")
        # Reason: admin and super_admin always have approval authority over any
        # role; otherwise the approver must hold the exact required role.
        _APPROVAL_OVERRIDE_ROLES = {"admin", "super_admin"}
        if required_role and approver_role != required_role and approver_role not in _APPROVAL_OVERRIDE_ROLES:
            raise ValueError(
                f"Approval requires role '{required_role}'; your role is '{approver_role}'"
            )

        # Reason: prevent self-approval (separation of duties). admin and
        # super_admin can override — see the matching comment in approve_pr.
        if (
            header.get("issuedBy") == approver_id
            and approver_role not in _APPROVAL_OVERRIDE_ROLES
        ):
            raise ValueError("You cannot approve your own Purchase Order")

        now = datetime.now(tz=timezone.utc)
        previous_status = header["status"]

        history_entry = {
            "stepNumber": 1,
            "approverId": approver_id,
            "approverRole": approver_role,
            "decision": "Approved",
            "decidedAt": now,
            "comment": comment,
            "workflowId": None,
        }

        async with self._txn() as session:
            await self._headers.update_one(
                {"docId": doc_id},
                {
                    "$set": {
                        "status": DocumentStatus.OPEN.value,
                        "approvalState": "Approved",
                        "issuedDate": now,
                        "approvalDecidedBy": approver_id,
                        "approvalDecidedAt": now,
                        "approvalComment": comment,
                        "updatedAt": now,
                        "updatedBy": approver_id,
                    },
                    "$push": {"approvalHistory": history_entry},
                },
                session=session,
            )
            updated = await self._headers.find_one({"docId": doc_id}, session=session)
            assert updated is not None
            await self._emit_po_event(updated, previous_status, company_code, session=session)

        logger.info("[DocumentService] approved PO docId=%s by user=%s", doc_id, approver_id)
        lines = await self._get_lines(doc_id)
        return PODetailResponse(**_header_to_po_response(updated).model_dump(), lines=lines)

    async def reject_po(
        self,
        org_id: str,
        doc_id: str,
        approver_id: str,
        approver_role: str,
        comment: str,
        company_code: Optional[str] = None,
    ) -> PODetailResponse:
        """
        Reject a PO in Pending Approval state.

        Args:
            org_id: Organisation scope.
            doc_id: Document UUID string.
            approver_id: UUID of the rejecting user.
            approver_role: Role of the approver.
            comment: Rejection reason (required).
            company_code: Finance company code.

        Returns:
            Updated PODetailResponse.

        Raises:
            ValueError: On invalid state or wrong role.
        """
        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "PO", "deletedAt": None}
        )
        if not header:
            raise ValueError(f"PO '{doc_id}' not found")

        # Reason: "Rejected" has no DocumentStatus equivalent (Wave 4 gap).
        _validate_transition_legacy(_DOC_TYPE_PO, header["status"], "Rejected")

        required_role = header.get("approvalRequestedFrom")
        # Reason: admin and super_admin always have approval authority over any
        # role; otherwise the approver must hold the exact required role.
        _APPROVAL_OVERRIDE_ROLES = {"admin", "super_admin"}
        if required_role and approver_role != required_role and approver_role not in _APPROVAL_OVERRIDE_ROLES:
            raise ValueError(
                f"Approval requires role '{required_role}'; your role is '{approver_role}'"
            )

        now = datetime.now(tz=timezone.utc)
        previous_status = header["status"]

        history_entry = {
            "stepNumber": 1,
            "approverId": approver_id,
            "approverRole": approver_role,
            "decision": "Rejected",
            "decidedAt": now,
            "comment": comment,
            "workflowId": None,
        }

        async with self._txn() as session:
            await self._headers.update_one(
                {"docId": doc_id},
                {
                    "$set": {
                        # Reason: "Rejected" stored as-is; no shared enum equivalent yet.
                        "status": "Rejected",
                        "approvalState": "Rejected",
                        "approvalDecidedBy": approver_id,
                        "approvalDecidedAt": now,
                        "approvalComment": comment,
                        "updatedAt": now,
                        "updatedBy": approver_id,
                    },
                    "$push": {"approvalHistory": history_entry},
                },
                session=session,
            )
            updated = await self._headers.find_one({"docId": doc_id}, session=session)
            assert updated is not None
            await self._emit_po_event(updated, previous_status, company_code, session=session)

        logger.info("[DocumentService] rejected PO docId=%s by user=%s", doc_id, approver_id)
        lines = await self._get_lines(doc_id)
        return PODetailResponse(**_header_to_po_response(updated).model_dump(), lines=lines)

    async def cancel_po(
        self,
        org_id: str,
        doc_id: str,
        cancelled_by: str,
        company_code: Optional[str] = None,
    ) -> PODetailResponse:
        """
        Cancel a PO (Draft, Pending Approval, Open, or Sent).

        For Open/Sent POs: only allowed if no downstream GRPO exists (Phase 2 check
        is a no-op in Phase 1B since GRPO doesn't exist yet).

        Args:
            org_id: Organisation scope.
            doc_id: Document UUID string.
            cancelled_by: User UUID string.
            company_code: Finance company code.

        Returns:
            Updated PODetailResponse.

        Raises:
            ValueError: On invalid transition.
        """
        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "PO", "deletedAt": None}
        )
        if not header:
            raise ValueError(f"PO '{doc_id}' not found")

        current_status = _parse_status(header["status"])
        assert_legal_transition(_DOC_TYPE_PO, current_status, DocumentStatus.CANCELLED)

        now = datetime.now(tz=timezone.utc)
        previous_status = header["status"]

        async with self._txn() as session:
            await self._headers.update_one(
                {"docId": doc_id},
                {"$set": {
                    "status": DocumentStatus.CANCELLED.value,
                    "updatedAt": now,
                    "updatedBy": cancelled_by,
                }},
                session=session,
            )
            updated = await self._headers.find_one({"docId": doc_id}, session=session)
            assert updated is not None
            await self._emit_po_event(updated, previous_status, company_code, session=session)

        logger.info("[DocumentService] cancelled PO docId=%s", doc_id)
        lines = await self._get_lines(doc_id)
        return PODetailResponse(**_header_to_po_response(updated).model_dump(), lines=lines)

    async def send_po(
        self,
        org_id: str,
        doc_id: str,
        sent_by: str,
        company_code: Optional[str] = None,
    ) -> PODetailResponse:
        """
        Mark a PO as Sent (Open → Sent).

        Args:
            org_id: Organisation scope.
            doc_id: Document UUID string.
            sent_by: User UUID string.
            company_code: Finance company code.

        Returns:
            Updated PODetailResponse.

        Raises:
            ValueError: On invalid transition.
        """
        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "PO", "deletedAt": None}
        )
        if not header:
            raise ValueError(f"PO '{doc_id}' not found")

        # Reason: "Sent" has no DocumentStatus equivalent (Wave 4 gap).
        # Use legacy fallback validator; the PO must be OPEN to be sent.
        _validate_transition_legacy(_DOC_TYPE_PO, header["status"], "Sent")

        now = datetime.now(tz=timezone.utc)
        previous_status = header["status"]

        async with self._txn() as session:
            await self._headers.update_one(
                {"docId": doc_id},
                {"$set": {
                    # Reason: "Sent" stored as-is; no shared enum equivalent yet.
                    "status": "Sent",
                    "updatedAt": now,
                    "updatedBy": sent_by,
                }},
                session=session,
            )
            updated = await self._headers.find_one({"docId": doc_id}, session=session)
            assert updated is not None
            await self._emit_po_event(updated, previous_status, company_code, session=session)

        logger.info("[DocumentService] sent PO docId=%s", doc_id)
        lines = await self._get_lines(doc_id)
        return PODetailResponse(**_header_to_po_response(updated).model_dump(), lines=lines)

    async def get_po_open_lines(self, org_id: str, doc_id: str) -> List[DocumentLineResponse]:
        """
        Return PO lines with openQuantity > 0 (for GR creation use).

        Args:
            org_id: Organisation scope.
            doc_id: PO document UUID string.

        Returns:
            List of DocumentLineResponse with openQuantity > 0.
        """
        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "PO", "deletedAt": None}
        )
        if not header:
            raise ValueError(f"PO '{doc_id}' not found")

        cursor = self._lines.find(
            {"docId": doc_id, "openQuantity": {"$gt": 0}}
        ).sort("lineNumber", 1)
        docs = await cursor.to_list(length=None)
        return [_line_to_response(d) for d in docs]

    # ==================================================================
    # Goods Receipt private helpers
    # ==================================================================

    async def _emit_purchase_received_event(
        self,
        header: Dict[str, Any],
        lines: List[Dict[str, Any]],
        session: Optional[AsyncIOMotorClientSession] = None,
    ) -> str:
        """
        Emit purchase_received outbox event for a GR inside the active session.

        Called from within post_gr() after the GR header is updated to Posted.
        Both the header update and this outbox insert share the same session so
        they are atomic — if the outbox write fails the transaction aborts and
        the header update rolls back.

        Args:
            header: Current GR header document (post-update, read inside session).
            lines: Raw GR line documents.
            session: Motor session participating in the active transaction.

        Returns:
            event_id (str UUID) of the emitted outbox event.
        """
        from src.modules.finance_bridge.outbox_writer import OutboxWriter

        payload = build_gr_event_payload(header, lines)

        event_id = await OutboxWriter.publish(
            db=self._db,
            event_type="purchase_received",
            organization_id=header["organizationId"],
            company_code=header.get("companyCode", "A001"),
            payload=payload,
            source_user_id=header.get("postedBy") or header.get("createdBy"),
            source_document_id=header["docId"],
            session=session,
        )
        return str(event_id) if event_id else str(uuid.uuid4())

    # ==================================================================
    # Goods Receipt CRUD
    # ==================================================================

    async def _create_gr_from_po_header(
        self,
        po_header: Dict[str, Any],
        org_id: str,
        created_by: str,
        data_doc_date: Optional[datetime],
        data_warehouse_id: Optional[str],
        data_notes: Optional[str],
        gr_line_docs: List[Dict[str, Any]],
        company_code: str,
    ) -> "GRDetailResponse":
        """
        Internal: create the GR header + lines in a single transaction.

        Args:
            po_header: Raw PO header document (already validated).
            org_id: Organisation scope.
            created_by: User UUID string.
            data_doc_date: Optional receipt date.
            data_warehouse_id: Optional warehouse.
            data_notes: Optional notes.
            gr_line_docs: Pre-built line documents (computation done outside txn).
            company_code: Finance company code.

        Returns:
            GRDetailResponse for the created GR.
        """
        from ..models.document import GRDetailResponse  # local import

        now = datetime.now(tz=timezone.utc)
        doc_id = str(uuid.uuid4())
        doc_date = data_doc_date or now
        totals = _sum_lines(gr_line_docs)

        # Stamp all lines with the GR docId and org
        for idx, ld in enumerate(gr_line_docs, start=1):
            ld["docId"] = doc_id
            ld["organizationId"] = org_id
            ld["lineNumber"] = idx
            ld["createdAt"] = now
            ld["updatedAt"] = now

        async with self._txn() as session:
            doc_number = await _next_doc_number(self._db, company_code, "GR", session=session)

            header: Dict[str, Any] = {
                "docId": doc_id,
                "organizationId": org_id,
                "companyCode": company_code,
                "docType": "GR",
                "docNumber": doc_number,
                "docDate": doc_date,
                "status": DocumentStatus.DRAFT.value,
                "baseDocId": po_header["docId"],
                "baseDocNumber": po_header.get("docNumber", ""),
                "vendorId": po_header["vendorId"],
                "vendorCode": po_header.get("vendorCode"),
                "vendorName": po_header.get("vendorName"),
                "currencyCode": po_header.get("currencyCode", "AED"),
                "receivedBy": created_by,
                "receivedDate": None,
                "warehouseId": data_warehouse_id,
                "notes": data_notes,
                **totals,
                "postedAt": None,
                "postedBy": None,
                "postedEventId": None,
                "createdAt": now,
                "createdBy": created_by,
                "updatedAt": now,
                "updatedBy": created_by,
                "deletedAt": None,
            }

            if gr_line_docs:
                await self._lines.insert_many(gr_line_docs, session=session)
            await self._headers.insert_one(header, session=session)

        logger.info(
            "[DocumentService] created GR docNumber=%s from PO=%s org=%s",
            doc_number,
            po_header["docNumber"],
            org_id,
        )
        lines_resp = [_line_to_response(l) for l in gr_line_docs]
        return GRDetailResponse(
            **_header_to_gr_response(header).model_dump(),
            lines=lines_resp,
        )

    async def _build_gr_lines_from_po(
        self,
        po_doc_id: str,
        org_id: str,
        line_inputs: List[Any],  # List[GRLineInput]
        now: datetime,
    ) -> List[Dict[str, Any]]:
        """
        Resolve PO lines, validate received quantities, and compute GR line dicts.

        Args:
            po_doc_id: PO document UUID string.
            org_id: Organisation scope.
            line_inputs: GRLineInput objects from the request.
            now: Timestamp for createdAt/updatedAt.

        Returns:
            List of line dicts ready for insert_many (without docId yet).

        Raises:
            ValueError: If a PO line is not found or received quantity exceeds openQuantity.
        """
        # Reason: build a dict keyed by lineId for fast O(1) lookup
        po_lines_cursor = self._lines.find({"docId": po_doc_id})
        po_lines = await po_lines_cursor.to_list(length=None)
        po_line_map: Dict[str, Dict[str, Any]] = {ln["lineId"]: ln for ln in po_lines}

        gr_line_docs: List[Dict[str, Any]] = []
        for line_in in line_inputs:
            base_line_id = line_in.baseLineId
            po_line = po_line_map.get(base_line_id)
            if not po_line:
                raise ValueError(
                    f"PO line '{base_line_id}' not found on PO '{po_doc_id}'"
                )

            open_qty = Decimal(str(po_line.get("openQuantity", po_line["quantity"])))
            recv_qty = Decimal(str(line_in.quantity))
            if recv_qty > open_qty:
                raise ValueError(
                    f"PO line '{base_line_id}': received quantity {recv_qty} "
                    f"exceeds open quantity {open_qty}"
                )
            if recv_qty <= Decimal("0"):
                raise ValueError(
                    f"PO line '{base_line_id}': received quantity must be > 0"
                )

            # Resolve itemType from purchase_items (already cached from PO creation)
            item_doc = await self._db["purchase_items"].find_one(
                {"itemId": po_line["itemId"], "organizationId": org_id}
            )
            item_type = item_doc.get("itemType", "raw_material") if item_doc else "raw_material"

            price = Decimal(str(po_line.get("unitPrice", 0)))
            tax_rate = Decimal(str(po_line.get("taxRate", 0)))
            # Reason: discount inherited from the PO line — GR cannot override it.
            disc_pct = Decimal(str(po_line.get("discountPercent", 0) or 0))
            discount_factor = (Decimal("100") - disc_pct) / Decimal("100")
            line_net = (recv_qty * price * discount_factor).quantize(Decimal("0.01"))
            line_tax = (line_net * tax_rate / Decimal("100")).quantize(Decimal("0.01"))
            line_gross = line_net + line_tax

            gr_line_docs.append({
                "lineId": str(uuid.uuid4()),
                # docId / organizationId / lineNumber / createdAt / updatedAt set by caller
                "itemId": po_line["itemId"],
                "itemCode": po_line.get("itemCode", ""),
                "itemName": po_line.get("itemName", ""),
                "itemType": item_type,
                "description": line_in.description or po_line.get("description"),
                "uom": po_line["uom"],
                "quantity": float(recv_qty),
                "openQuantity": float(recv_qty),
                "closedQuantity": 0.0,
                "unitPrice": float(price),
                "discountPercent": float(disc_pct),
                "lineNet": float(line_net),
                "taxCode": po_line.get("taxCode"),
                "taxRate": float(tax_rate),
                "lineTax": float(line_tax),
                "lineGross": float(line_gross),
                "costCenterId": po_line.get("costCenterId"),
                "warehouseId": None,
                "requestedVendorId": None,
                "baseLineId": base_line_id,
                "notes": None,
            })

        return gr_line_docs

    async def create_gr_from_po(
        self,
        org_id: str,
        po_doc_id: str,
        data: "GRFromPOCreate",
        created_by: str,
        company_code: Optional[str] = None,
    ) -> "GRDetailResponse":
        """
        Create a Draft GR by receiving goods against an Open or Sent PO.

        The PO must be in Open or Sent status. Each line input references a PO
        line and specifies a received quantity ≤ openQuantity for that line.
        If lines is empty in data, defaults to full remaining openQuantity on
        every PO line with openQuantity > 0.

        Args:
            org_id: Organisation scope.
            po_doc_id: UUID of the source PO.
            data: GRFromPOCreate payload.
            created_by: User UUID string.
            company_code: Finance company code resolved by the API layer via
                ``resolve_company_code()``. Must not be None when called.

        Returns:
            Created GRDetailResponse (status: Draft).

        Raises:
            ValueError: If PO not found, wrong status, quantity violations, or
                company_code not provided.
        """
        if not company_code:
            raise ValueError(
                "company_code is required to create a GR. "
                "The API layer must resolve it via resolve_company_code()."
            )
        po_header = await self._headers.find_one(
            {"organizationId": org_id, "docId": po_doc_id, "docType": "PO", "deletedAt": None}
        )
        if not po_header:
            raise ValueError(f"PO '{po_doc_id}' not found")
        # Reason: "Sent" has no enum equivalent; compare raw string for that case.
        # OPEN maps to both enum "open" and legacy "Approved"/"Open".
        _po_status_raw = po_header["status"]
        _po_status_enum: Optional[DocumentStatus] = None
        try:
            _po_status_enum = _parse_status(_po_status_raw)
        except (ValueError, KeyError):
            pass
        if _po_status_enum != DocumentStatus.OPEN and _po_status_raw != "Sent":
            raise ValueError(
                f"GR can only be created from an Open or Sent PO "
                f"(current status: {_po_status_raw})"
            )

        now = datetime.now(tz=timezone.utc)

        # Reason: if caller omits lines, default to full remaining openQuantity
        line_inputs = data.lines
        if not line_inputs:
            open_lines_cursor = self._lines.find(
                {"docId": po_doc_id, "openQuantity": {"$gt": 0}}
            ).sort("lineNumber", 1)
            open_lines = await open_lines_cursor.to_list(length=None)
            from ..models.document import GRLineInput
            line_inputs = [
                GRLineInput(
                    baseLineId=ln["lineId"],
                    quantity=Decimal(str(ln.get("openQuantity", ln["quantity"]))),
                )
                for ln in open_lines
            ]
            if not line_inputs:
                raise ValueError("PO has no open lines to receive")

        gr_line_docs = await self._build_gr_lines_from_po(po_doc_id, org_id, line_inputs, now)

        return await self._create_gr_from_po_header(
            po_header=po_header,
            org_id=org_id,
            created_by=created_by,
            data_doc_date=data.docDate,
            data_warehouse_id=data.warehouseId,
            data_notes=data.notes,
            gr_line_docs=gr_line_docs,
            company_code=company_code,
        )

    async def create_gr(
        self,
        org_id: str,
        data: "GRCreate",
        created_by: str,
        company_code: Optional[str] = None,
    ) -> "GRDetailResponse":
        """
        Create a Draft GR with an explicit baseDocId in the body.

        Functionally equivalent to create_gr_from_po; accepts the PO docId in
        the request body rather than the URL path.

        Args:
            org_id: Organisation scope.
            data: GRCreate payload with baseDocId.
            created_by: User UUID string.
            company_code: Finance company code.

        Returns:
            Created GRDetailResponse (status: Draft).

        Raises:
            ValueError: If PO not found, wrong status, or quantity violations.
        """
        from ..models.document import GRFromPOCreate

        # Reason: reuse create_gr_from_po — only difference is the baseDocId source
        gr_from_po_data = GRFromPOCreate(
            docDate=data.docDate,
            warehouseId=data.warehouseId,
            notes=data.notes,
            lines=data.lines,
        )
        return await self.create_gr_from_po(
            org_id=org_id,
            po_doc_id=data.baseDocId,
            data=gr_from_po_data,
            created_by=created_by,
            company_code=company_code,
        )

    async def list_grs(
        self,
        org_id: str,
        *,
        page: int = 1,
        per_page: int = 20,
        status_filter: Optional[str] = None,
        search: Optional[str] = None,
        vendor_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Paginated list of GRs for an organisation.

        Args:
            org_id: Organisation scope.
            page: Page number (1-based).
            per_page: Items per page.
            status_filter: Filter by GR status string.
            search: Substring search on docNumber.
            vendor_id: Filter by vendorId.

        Returns:
            Dict with items, total, page, perPage, totalPages.
        """
        query: Dict[str, Any] = {
            "organizationId": org_id,
            "docType": "GR",
            "deletedAt": None,
        }
        if status_filter:
            query["status"] = status_filter
        if vendor_id:
            query["vendorId"] = vendor_id
        if search:
            query["docNumber"] = {"$regex": search, "$options": "i"}

        total = await self._headers.count_documents(query)
        offset = (page - 1) * per_page
        cursor = self._headers.find(query).sort("docDate", -1).skip(offset).limit(per_page)
        docs = await cursor.to_list(length=per_page)

        return {
            "items": [_header_to_gr_response(d) for d in docs],
            "total": total,
            "page": page,
            "perPage": per_page,
            "totalPages": max(1, -(-total // per_page)),
        }

    async def get_gr(self, org_id: str, doc_id: str) -> Optional["GRDetailResponse"]:
        """
        Fetch a single GR with its lines.

        Args:
            org_id: Organisation scope.
            doc_id: GR document UUID string.

        Returns:
            GRDetailResponse or None if not found.
        """
        from ..models.document import GRDetailResponse

        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "GR", "deletedAt": None}
        )
        if not header:
            return None
        lines = await self._get_lines(doc_id)
        return GRDetailResponse(**_header_to_gr_response(header).model_dump(), lines=lines)

    async def update_gr(
        self,
        org_id: str,
        doc_id: str,
        data: "GRUpdate",
        updated_by: str,
    ) -> Optional["GRDetailResponse"]:
        """
        Partial update a Draft GR.

        Only warehouseId, notes, and lines (received quantities) may be changed.
        baseDocId, vendor, and companyCode are immutable.

        T-200.22 note (Part 5): No PO counter reconciliation is performed on
        DRAFT GR update because DRAFT GRs have not yet committed any PO line
        counters (openQuantity / closedQuantity on PO lines only change at
        ``post_gr`` time, not at create or update time).  The line quantity
        validation in ``_build_gr_lines_from_po`` prevents over-receiving
        against the PO's current openQuantity, which is the correct guardrail
        at draft-edit time.

        This is an intentional asymmetry vs. sales where DN DRAFT creation
        immediately increments SO line ``invoicedQty`` (reservation semantics).
        Purchasing v1 does not implement reservation semantics for Draft GRs.

        Args:
            org_id: Organisation scope.
            doc_id: GR document UUID string.
            data: Partial update payload.
            updated_by: User UUID string.

        Returns:
            Updated GRDetailResponse or None if not found.

        Raises:
            ValueError: If GR is not in Draft status or quantity validation fails.
        """
        from ..models.document import GRDetailResponse

        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "GR", "deletedAt": None}
        )
        if not header:
            return None
        if _parse_status(header["status"]) != DocumentStatus.DRAFT:
            raise ValueError("Only Draft GRs can be updated")

        now = datetime.now(tz=timezone.utc)
        updates: Dict[str, Any] = {"updatedAt": now, "updatedBy": updated_by}

        if data.warehouseId is not None:
            updates["warehouseId"] = data.warehouseId
        if data.notes is not None:
            updates["notes"] = data.notes

        new_line_docs: Optional[List[Dict[str, Any]]] = None
        if data.lines is not None:
            # Reason: re-validate all quantities against current PO line openQuantity
            new_line_docs = await self._build_gr_lines_from_po(
                header["baseDocId"], org_id, data.lines, now
            )
            for idx, ld in enumerate(new_line_docs, start=1):
                ld["docId"] = doc_id
                ld["organizationId"] = org_id
                ld["lineNumber"] = idx
                ld["createdAt"] = now
                ld["updatedAt"] = now
            totals = _sum_lines(new_line_docs)
            updates.update(totals)

        async with self._txn() as session:
            if new_line_docs is not None:
                # Reason: replace lines wholesale — delete old, insert new
                await self._lines.delete_many({"docId": doc_id}, session=session)
                if new_line_docs:
                    await self._lines.insert_many(new_line_docs, session=session)
            await self._headers.update_one({"docId": doc_id}, {"$set": updates}, session=session)
            updated = await self._headers.find_one({"docId": doc_id}, session=session)
            assert updated is not None

        lines = await self._get_lines(doc_id)
        return GRDetailResponse(**_header_to_gr_response(updated).model_dump(), lines=lines)

    async def post_gr(
        self,
        org_id: str,
        doc_id: str,
        posted_by: str,
        company_code: Optional[str] = None,
    ) -> "GRDetailResponse":
        """
        Post a GR (Draft → Posted).

        This is the primary accounting event for Phase B.  All steps are atomic:
          1. Decrement openQuantity on each linked PO line by the received qty.
          2. Update GR header status to Posted (set postedAt, postedBy).
          3. If all PO lines reach openQuantity == 0, transition PO → Closed
             and emit po_state_changed for the PO.
          4. Emit purchase_received outbox event (stores postedEventId on header).

        Args:
            org_id: Organisation scope.
            doc_id: GR document UUID string.
            posted_by: User UUID string.
            company_code: Finance company code.

        Returns:
            Updated GRDetailResponse (status: Posted).

        Raises:
            ValueError: If GR not found or already Posted.
        """
        from ..models.document import GRDetailResponse

        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "GR", "deletedAt": None}
        )
        if not header:
            raise ValueError(f"GR '{doc_id}' not found")

        current_status = _parse_status(header["status"])
        # Reason: "Posted" maps to DocumentStatus.OPEN in the shared GR transition table.
        # LEGAL_TRANSITIONS["GR"] defines DRAFT → OPEN as the "post" transition.
        assert_legal_transition(_DOC_TYPE_GR, current_status, DocumentStatus.OPEN)

        po_doc_id = header["baseDocId"]

        # Reason: read PO header and GR lines OUTSIDE the transaction to keep
        # the transaction window as short as possible.
        po_header = await self._headers.find_one(
            {"docId": po_doc_id, "organizationId": org_id, "docType": "PO"}
        )
        if not po_header:
            raise ValueError(f"Source PO '{po_doc_id}' not found")

        gr_lines_cursor = self._lines.find({"docId": doc_id})
        gr_lines: List[Dict[str, Any]] = await gr_lines_cursor.to_list(length=None)
        if not gr_lines:
            raise ValueError("Cannot post a GR with no lines")

        # Reason: build a map of baseLineId → received quantity for batch updates
        line_qty_map: Dict[str, Decimal] = {
            ln["baseLineId"]: Decimal(str(ln["quantity"]))
            for ln in gr_lines
            if ln.get("baseLineId")
        }

        # Fetch all PO lines to check if they will be fully received after this post
        po_all_lines_cursor = self._lines.find({"docId": po_doc_id})
        po_all_lines: List[Dict[str, Any]] = await po_all_lines_cursor.to_list(length=None)
        po_line_map: Dict[str, Dict[str, Any]] = {ln["lineId"]: ln for ln in po_all_lines}

        # Compute projected openQuantity for each PO line after this GR posts
        def projected_open_qty(po_line: Dict[str, Any]) -> Decimal:
            """Return the PO line's openQuantity after decrementing by this GR's quantity."""
            open_qty = Decimal(str(po_line.get("openQuantity", po_line["quantity"])))
            received = line_qty_map.get(po_line["lineId"], Decimal("0"))
            return max(Decimal("0"), open_qty - received)

        all_fully_received = all(
            projected_open_qty(pl) == Decimal("0")
            for pl in po_all_lines
        )

        # Build po_line_deltas for chain-reconciler audit trail (T-200.22).
        # Maps PO lineId → quantity received by this GR post.
        po_line_deltas: Dict[str, Decimal] = {
            po_line["lineId"]: line_qty_map.get(po_line["lineId"], Decimal("0"))
            for po_line in po_all_lines
            if line_qty_map.get(po_line["lineId"], Decimal("0")) > Decimal("0")
        }

        now = datetime.now(tz=timezone.utc)
        previous_po_status = po_header["status"]
        posted_event_id: Optional[str] = None

        async with self._txn() as session:
            # Step 1: decrement openQuantity on each PO line and increment closedQuantity
            # Reason: these counter updates are kept inside the transaction for
            # atomicity with the GR status change and outbox event.
            for po_line in po_all_lines:
                recv_qty = line_qty_map.get(po_line["lineId"], Decimal("0"))
                if recv_qty == Decimal("0"):
                    continue
                new_open = max(Decimal("0"), projected_open_qty(po_line))
                new_closed = Decimal(str(po_line.get("closedQuantity", 0))) + recv_qty
                await self._lines.update_one(
                    {"lineId": po_line["lineId"]},
                    {"$set": {
                        "openQuantity": float(new_open),
                        "closedQuantity": float(new_closed),
                        "updatedAt": now,
                    }},
                    session=session,
                )

            # Step 2: update GR header to Open/Posted (without postedEventId yet)
            # Reason: GR "Posted" = DocumentStatus.OPEN in the shared vocabulary.
            gr_updates: Dict[str, Any] = {
                "status": DocumentStatus.OPEN.value,
                "receivedDate": now,
                "postedAt": now,
                "postedBy": posted_by,
                "updatedAt": now,
                "updatedBy": posted_by,
            }
            await self._headers.update_one(
                {"docId": doc_id}, {"$set": gr_updates}, session=session
            )
            updated_gr = await self._headers.find_one({"docId": doc_id}, session=session)
            assert updated_gr is not None

            # Step 3: if fully received, close the PO and emit po_state_changed
            # Reason: PO close kept inside transaction to maintain outbox atomicity
            # (the po_state_changed event and the PO header update commit together).
            if all_fully_received:
                await self._headers.update_one(
                    {"docId": po_doc_id},
                    {"$set": {
                        "status": DocumentStatus.CLOSED.value,
                        "updatedAt": now,
                        "updatedBy": posted_by,
                    }},
                    session=session,
                )
                po_updated = await self._headers.find_one({"docId": po_doc_id}, session=session)
                assert po_updated is not None
                await self._emit_po_event(
                    po_updated, previous_po_status, company_code, session=session
                )
                logger.info(
                    "[DocumentService] PO %s auto-closed after GR %s fully received all lines",
                    po_doc_id,
                    doc_id,
                )

            # Step 4: Append targetDocRefs on PO header so the PO detail card
            # can link to this GR (T-200.22 chain-ref tracking).
            await self._headers.update_one(
                {"docId": po_doc_id},
                {
                    "$push": {
                        "targetDocRefs": {
                            "docType": "GR",
                            "docId": doc_id,
                            "docNumber": header.get("docNumber", ""),
                        }
                    }
                },
                session=session,
            )

            # Step 5: emit purchase_received event (outbox)
            posted_event_id = await self._emit_purchase_received_event(
                updated_gr, gr_lines, session=session
            )

            # Step 6: stamp the postedEventId on the GR header for idempotency
            await self._headers.update_one(
                {"docId": doc_id},
                {"$set": {"postedEventId": posted_event_id}},
                session=session,
            )
            # Refresh header with postedEventId
            updated_gr = await self._headers.find_one({"docId": doc_id}, session=session)
            assert updated_gr is not None

        # Reason: best-effort audit write OUTSIDE the transaction — mirrors T-201.5
        # pattern.  If the PO was auto-closed above, record the chain event.
        # auto_close_po_if_fully_received is idempotent: if the PO is already CLOSED
        # (closed inside the txn above) it checks status == OPEN → returns False
        # without firing again.  We call it here only for its audit write side-effect
        # when the PO is fully received; for the audit, reload the PO first.
        if all_fully_received:
            await write_purchasing_audit(
                self._db,
                audit_collection=_PO_AUDIT_COL,
                doc_id=po_doc_id,
                action="auto_close_on_full_receipt",
                user_id=posted_by,
                detail={
                    "triggeredByGrDocId": doc_id,
                    "triggeredByGrDocNumber": header.get("docNumber", ""),
                    "poLineDeltas": {
                        lid: float(qty) for lid, qty in po_line_deltas.items()
                    },
                },
            )

        logger.info(
            "[DocumentService] posted GR docId=%s eventId=%s poCloses=%s",
            doc_id,
            posted_event_id,
            all_fully_received,
        )
        lines_resp = await self._get_lines(doc_id)
        return GRDetailResponse(**_header_to_gr_response(updated_gr).model_dump(), lines=lines_resp)

    async def soft_delete_gr(self, org_id: str, doc_id: str, deleted_by: str) -> bool:
        """
        Soft-delete a Draft GR.

        Posted GRs are immutable per the INTEGRATION_MODEL.md immutability
        rules and can never be deleted.

        On deletion (T-200.22 chain mechanics):
          1. Soft-deletes the GR header.
          2. Releases the PO line counters that this GR had locked
             (decrements closedQuantity, increments openQuantity).
          3. Auto-reopens the PO if it was CLOSED and is no longer fully received.
          4. Pulls stale GR targetDocRef from the PO header.

        Args:
            org_id: Organisation scope.
            doc_id: GR document UUID string.
            deleted_by: User UUID string.

        Returns:
            True if deleted, False if not found.

        Raises:
            ValueError: If GR is not in Draft status.
        """
        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "GR", "deletedAt": None}
        )
        if not header:
            return False
        if _parse_status(header["status"]) != DocumentStatus.DRAFT:
            raise ValueError(
                "Only Draft GRs can be deleted. "
                "Posted GRs are immutable — create a reversal GR to correct errors."
            )

        # Reason: read GR lines BEFORE the soft-delete so we know what counters to release.
        gr_lines_cursor = self._lines.find({"docId": doc_id})
        gr_lines: List[Dict[str, Any]] = await gr_lines_cursor.to_list(length=None)

        # Build release deltas: negative because we are returning qty to the PO.
        # GR lines carry baseLineId = PO lineId.
        release_deltas: Dict[str, Decimal] = {
            ln["baseLineId"]: -Decimal(str(ln["quantity"]))
            for ln in gr_lines
            if ln.get("baseLineId")
        }

        po_doc_id: Optional[str] = header.get("baseDocId")

        now = datetime.now(tz=timezone.utc)
        await self._headers.update_one(
            {"docId": doc_id},
            {"$set": {"deletedAt": now, "updatedAt": now, "updatedBy": deleted_by}},
        )
        logger.info("[DocumentService] soft-deleted GR docId=%s", doc_id)

        # Reason: release PO line counters only when the GR had a source PO and
        # had registered receipt quantities (DRAFT GRs created via create_gr_from_po
        # do NOT yet have counters on PO lines — counters are committed at post_gr
        # time, not at create time).  For DRAFT GRs the release_deltas are all 0
        # and reconcile_po_line_receipt_counters will be a no-op.
        if po_doc_id and release_deltas:
            await reconcile_po_line_receipt_counters(
                self._db,
                po_doc_id=po_doc_id,
                org_id=org_id,
                user_id=deleted_by,
                gr_doc_id=doc_id,
                # Reason: cap_check=False — release deltas are negative; they
                # cannot exceed any cap.
                line_deltas=release_deltas,
                cap_check=False,
            )

            # Reload PO with lines (post-release state) and auto-reopen if needed.
            po_raw = await load_po_with_lines(self._db, org_id=org_id, po_doc_id=po_doc_id)
            if po_raw is not None:
                await auto_reopen_po_if_not_fully_received(
                    self._db,
                    po_doc_id=po_doc_id,
                    po_raw=po_raw,
                    org_id=org_id,
                    user_id=deleted_by,
                    action="auto_reopen_on_receipt_release",
                    extra_detail={
                        "releasedByGrDocId": doc_id,
                        "releasedDeltas": {
                            lid: float(qty) for lid, qty in release_deltas.items()
                        },
                    },
                )

            # Reason: $pull the stale GR targetDocRef from the PO header so the
            # PO detail chain card does not show a deleted GR.
            await pull_dangling_po_chain_refs(
                self._db,
                po_doc_id=po_doc_id,
                org_id=org_id,
                user_id=deleted_by,
                gr_doc_id=doc_id,
            )

        return True

    # ==================================================================
    # AP Invoice private helpers
    # ==================================================================

    async def _emit_ap_invoice_posted_event(
        self,
        header: Dict[str, Any],
        lines: List[Dict[str, Any]],
        session: Optional[AsyncIOMotorClientSession] = None,
    ) -> str:
        """
        Emit ap_invoice_posted outbox event for an AP Invoice inside the active session.

        Called from within approve_ap() after the AP header transitions to Approved.
        Both the header update and this outbox insert share the same session so they
        are atomic — if the outbox write fails the transaction aborts and the header
        update rolls back.

        Args:
            header: Current AP header document (post-approve state, read inside session).
            lines: Raw AP line documents.
            session: Motor session participating in the active transaction.

        Returns:
            event_id (str UUID) of the emitted outbox event.
        """
        from src.modules.finance_bridge.outbox_writer import OutboxWriter

        # Reason: UAE VAT Article 25 — resolve the GR docDate (date of supply)
        # before building the payload. The AP header's baseDocId points to the
        # source GR. We look it up here (inside the transaction) so we capture
        # the authoritative GR date. If the lookup fails we log a warning and
        # leave dateOfSupply empty — the finance handler then falls back to using
        # invoiceDate as the tax point, which is conservative and always valid.
        gr_doc_id = header.get("baseDocId")
        date_of_supply: Optional[str] = None
        if gr_doc_id:
            try:
                gr_header = await self._headers.find_one(
                    {"docId": gr_doc_id},
                    session=session,
                )
                if gr_header:
                    gr_doc_date = gr_header.get("docDate")
                    if gr_doc_date is not None:
                        if hasattr(gr_doc_date, "strftime"):
                            date_of_supply = gr_doc_date.strftime("%Y-%m-%d")
                        else:
                            date_of_supply = str(gr_doc_date)[:10]
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "[DocumentService] could not resolve GR docDate for dateOfSupply "
                    "ap=%s gr=%s: %s",
                    header.get("docId"),
                    gr_doc_id,
                    exc,
                )

        payload = build_ap_invoice_event_payload(header, lines, date_of_supply=date_of_supply)

        event_id = await OutboxWriter.publish(
            db=self._db,
            event_type="ap_invoice_posted",
            organization_id=header["organizationId"],
            company_code=header.get("companyCode", "A001"),
            payload=payload,
            source_user_id=header.get("approvalDecidedBy") or header.get("createdBy"),
            source_document_id=header["docId"],
            session=session,
        )
        return str(event_id) if event_id else str(uuid.uuid4())

    # ==================================================================
    # AP Invoice CRUD
    # ==================================================================

    async def _build_ap_lines_from_gr(
        self,
        gr_doc_id: str,
        org_id: str,
        line_inputs: List[Any],  # List[APLineInput]
        now: datetime,
        auth_token: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Resolve GR lines, validate grLineId references, and compute AP line dicts.

        Quantity is LOCKED to the GR line quantity (no partial invoicing in v1).
        The user's invoiceUnitPrice replaces the GR's PO unit price for variance.

        T-200.22b: tax rate is now resolved via the finance microservice HTTP
        (``get_tax_percent``) instead of the hardcoded AP_TAX_RATES dict.

        Args:
            gr_doc_id:  GR document UUID string.
            org_id:     Organisation scope.
            line_inputs: APLineInput objects from the request.
            now:        Timestamp for createdAt/updatedAt.
            auth_token: Bearer token forwarded to the finance service for tax resolution.

        Returns:
            List of line dicts ready for insert_many (without docId yet).

        Raises:
            ValueError: If a GR line is not found or a grLineId is duplicated.
        """
        # Reason: build a dict keyed by lineId for fast O(1) lookup
        gr_lines_cursor = self._lines.find({"docId": gr_doc_id})
        gr_lines = await gr_lines_cursor.to_list(length=None)
        gr_line_map: Dict[str, Dict[str, Any]] = {ln["lineId"]: ln for ln in gr_lines}

        seen_gr_line_ids: set = set()
        ap_line_docs: List[Dict[str, Any]] = []

        for line_in in line_inputs:
            gr_line_id = line_in.grLineId
            if gr_line_id in seen_gr_line_ids:
                raise ValueError(
                    f"GR line '{gr_line_id}' referenced more than once in request"
                )
            seen_gr_line_ids.add(gr_line_id)

            gr_line = gr_line_map.get(gr_line_id)
            if not gr_line:
                raise ValueError(
                    f"GR line '{gr_line_id}' not found on GR '{gr_doc_id}'"
                )

            # Reason: quantity locked to GR received quantity in v1
            qty = Decimal(str(gr_line["quantity"]))
            invoice_price = Decimal(str(line_in.invoiceUnitPrice))
            po_price = Decimal(str(gr_line.get("unitPrice", 0)))  # GR copied PO price

            # Reason: T-200.22b — resolve tax rate via finance microservice HTTP.
            tax_code = gr_line.get("taxCode")
            tax_rate = await get_tax_percent(tax_code, org_id, auth_token)

            # Reason: discount inherited from GR (which inherited from PO). AP cannot
            # override it. Variance must also be discounted so the JE balances:
            # at GR time DR Inventory was qty * po_price * (1 - disc); here AP must
            # credit AP for qty * invoice_price * (1 - disc) and route the difference
            # through PPV — that difference equals discounted_variance.
            disc_pct = Decimal(str(gr_line.get("discountPercent", 0) or 0))
            discount_factor = (Decimal("100") - disc_pct) / Decimal("100")

            price_variance = ((invoice_price - po_price) * qty * discount_factor).quantize(Decimal("0.01"))
            line_net = (qty * invoice_price * discount_factor).quantize(Decimal("0.01"))
            line_tax = (line_net * tax_rate / Decimal("100")).quantize(Decimal("0.01"))
            line_gross = line_net + line_tax

            ap_line_docs.append({
                "lineId": str(uuid.uuid4()),
                # docId / organizationId / lineNumber / createdAt / updatedAt set by caller
                "itemId": gr_line["itemId"],
                "itemCode": gr_line.get("itemCode", ""),
                "itemName": gr_line.get("itemName", ""),
                "itemType": gr_line.get("itemType", "raw_material"),
                "description": line_in.description or gr_line.get("description"),
                "uom": gr_line["uom"],
                "quantity": float(qty),
                "openQuantity": float(qty),
                "closedQuantity": 0.0,
                "unitPrice": float(invoice_price),   # = invoiceUnitPrice
                "discountPercent": float(disc_pct),
                "poUnitPrice": float(po_price),
                "priceVarianceAmount": float(price_variance),
                "lineNet": float(line_net),
                "taxCode": tax_code,
                "taxRate": float(tax_rate),
                "lineTax": float(line_tax),
                "lineGross": float(line_gross),
                "costCenterId": gr_line.get("costCenterId"),
                "grLineId": gr_line_id,
                "baseLineId": gr_line.get("baseLineId"),  # PO line traceability
                "warehouseId": None,
                "requestedVendorId": None,
                "notes": None,
            })

        return ap_line_docs

    def _sum_ap_lines(self, lines: List[Dict[str, Any]]) -> Dict[str, float]:
        """
        Sum AP line totals to compute header-level totals including price variance.

        Args:
            lines: List of computed AP line dicts.

        Returns:
            Dict with subtotalNet, totalTax, totalGross, totalPriceVariance.
        """
        subtotal = sum(Decimal(str(ln["lineNet"])) for ln in lines)
        tax = sum(Decimal(str(ln["lineTax"])) for ln in lines)
        gross = subtotal + tax
        variance = sum(Decimal(str(ln["priceVarianceAmount"])) for ln in lines)
        return {
            "subtotalNet": float(subtotal),
            "totalTax": float(tax),
            "totalGross": float(gross),
            "totalPriceVariance": float(variance),
        }

    async def create_ap_from_gr(
        self,
        org_id: str,
        gr_doc_id: str,
        data: "APFromGRCreate",
        created_by: str,
        company_code: Optional[str] = None,
        auth_token: Optional[str] = None,
    ) -> "APDetailResponse":
        """
        Create a Draft AP Invoice from a Posted GR (primary UX path).

        Enforces:
          - GR must be in Posted status (not Draft or Cancelled).
          - A GR can have only one AP Invoice in v1 — raises if a non-rejected AP
            already exists for this GR.

        Quantity per line is locked to the GR receipt quantity (v1 — no partial invoicing).
        The user's invoiceUnitPrice per line may differ from the PO unit price; the system
        records the price variance.

        T-200.22 chain mechanics (Part 6):
          - After creating the AP, increments GR line ``invoicedQty`` for each
            referenced GR line (via reconcile_gr_line_invoice_counters).
          - Appends the AP as a ``targetDocRef`` on the GR header.
          - Auto-closes the GR when all lines are fully invoiced (auto_close_gr_if_fully_invoiced).
          - In v1 quantities are always full (locked to GR qty), so auto-close
            fires on every successful AP creation.

        Intentional asymmetry vs. Sales (Part 8 decision):
          - AP Invoice creation does NOT bubble up to re-close the PO.  The PO
            closes at receipt time (post_gr), not at invoice time.  This mirrors
            SAP B1 purchasing semantics: goods arrival closes the PO; invoicing is
            a separate back-office step.  If PO-close-on-full-invoice is needed in
            future, file T-200.22.1.

        Args:
            org_id:       Organisation scope.
            gr_doc_id:    UUID of the source Posted GR.
            data:         APFromGRCreate payload.
            created_by:   User UUID string.
            company_code: Finance company code resolved by the API layer via
                ``resolve_company_code()``. Must not be None when called.
            auth_token:   Bearer token forwarded to the finance service for tax
                resolution (T-200.22b).

        Returns:
            Created APDetailResponse (status: Draft).

        Raises:
            ValueError: If GR not found, not Posted, AP already exists, or
                company_code not provided.
        """
        if not company_code:
            raise ValueError(
                "company_code is required to create an AP Invoice. "
                "The API layer must resolve it via resolve_company_code()."
            )
        from ..models.document import APDetailResponse  # local import

        # Reason: read the GR header outside the transaction to keep txn window short
        gr_header = await self._headers.find_one(
            {"organizationId": org_id, "docId": gr_doc_id, "docType": "GR", "deletedAt": None}
        )
        if not gr_header:
            raise ValueError(f"GR '{gr_doc_id}' not found")
        # Reason: "Posted" maps to DocumentStatus.OPEN; accept both forms.
        if _parse_status(gr_header["status"]) != DocumentStatus.OPEN:
            raise ValueError(
                f"AP Invoice can only be created from a Posted GR "
                f"(current status: {gr_header['status']})"
            )

        # Reason: enforce one-AP-per-GR in v1 — reject if any non-Rejected AP exists.
        # "Rejected" stored as raw string (no enum equivalent); $ne on both forms.
        existing_ap = await self._headers.find_one({
            "organizationId": org_id,
            "docType": "AP",
            "baseDocId": gr_doc_id,
            "status": {"$nin": ["Rejected", "rejected"]},
            "deletedAt": None,
        })
        if existing_ap:
            raise ValueError(
                f"A non-rejected AP Invoice already exists for GR '{gr_doc_id}' "
                f"(docNumber: {existing_ap.get('docNumber', 'unknown')}). "
                "Only one AP Invoice per GR is allowed in v1."
            )

        # Reason: fetch the source PO header for the poDocId / poDocNumber fields
        po_doc_id = gr_header["baseDocId"]
        po_header = await self._headers.find_one(
            {"docId": po_doc_id, "docType": "PO"}
        )
        po_doc_number = po_header.get("docNumber", "") if po_header else ""

        now = datetime.now(tz=timezone.utc)
        ap_line_docs = await self._build_ap_lines_from_gr(
            gr_doc_id, org_id, data.lines, now, auth_token=auth_token
        )

        totals = self._sum_ap_lines(ap_line_docs)
        doc_id = str(uuid.uuid4())
        doc_date = data.docDate or now
        invoice_date = data.invoiceDate

        # Reason: default dueDate to invoiceDate + 30 days if not provided
        from datetime import timedelta
        due_date = data.dueDate or (invoice_date + timedelta(days=30))

        # -----------------------------------------------------------------------
        # T-200.24 — DPI allocation pre-flight validation
        # -----------------------------------------------------------------------
        # Validate each requested DPI allocation BEFORE entering the transaction.
        # Rules:
        #   1. DPI must exist + be OPEN or PARTLY_CLOSED.
        #   2. DPI must belong to the same vendor as the GR/AP.
        #   3. DPI must be in the same currency as the GR.
        #   4. allocated_amount <= DPI outstanding_amount (gross - consumedAmount).
        #   5. Sum of all allocations <= AP totalGross.
        # Stores validated allocations as a list of dicts on the AP header.
        # The actual $inc consumedAmount on DPIs fires at AP DRAFT→OPEN (approve_ap).

        _DPI_COL = "ap_down_payments_v2"
        _DPI_ALLOCATABLE_STATUSES = {"open", "partly_closed"}

        vendor_id_from_gr = gr_header["vendorId"]
        currency_from_gr = gr_header.get("currencyCode", "AED")
        ap_total_gross = Decimal(str(totals.get("totalGross", 0)))

        validated_dpi_allocations: List[Dict[str, Any]] = []
        total_allocated = Decimal("0")

        for alloc in (data.dpi_allocations or []):
            alloc_amount = Decimal(str(alloc.allocated_amount))
            dpi_raw = await self._db[_DPI_COL].find_one(
                {"docId": alloc.dpi_doc_id, "organizationId": org_id}
            )
            if dpi_raw is None:
                raise ValueError(
                    f"DPI allocation error: AP Down Payment Invoice '{alloc.dpi_doc_id}' "
                    f"not found in organisation '{org_id}'."
                )

            dpi_status = dpi_raw.get("status", "")
            if dpi_status not in _DPI_ALLOCATABLE_STATUSES:
                raise ValueError(
                    f"DPI allocation error: AP Down Payment Invoice '{alloc.dpi_doc_id}' "
                    f"is in status '{dpi_status}'. "
                    "Must be 'open' or 'partly_closed' to accept an allocation."
                )

            if dpi_raw.get("vendorId") != vendor_id_from_gr:
                raise ValueError(
                    f"DPI allocation error: AP Down Payment Invoice '{alloc.dpi_doc_id}' "
                    f"belongs to vendor '{dpi_raw.get('vendorId')}' but the AP Invoice "
                    f"vendor is '{vendor_id_from_gr}'. Vendor must match."
                )

            dpi_currency = dpi_raw.get("currency", "AED")
            if dpi_currency != currency_from_gr:
                raise ValueError(
                    f"DPI allocation error: AP Down Payment Invoice '{alloc.dpi_doc_id}' "
                    f"is in currency '{dpi_currency}' but the AP Invoice currency is "
                    f"'{currency_from_gr}'. Currency must match."
                )

            dpi_gross = Decimal(str(dpi_raw.get("totals", {}).get("gross", 0)))
            dpi_consumed = Decimal(str(dpi_raw.get("consumedAmount", 0)))
            dpi_outstanding = max(dpi_gross - dpi_consumed, Decimal("0"))

            if alloc_amount > dpi_outstanding + Decimal("0.005"):
                raise ValueError(
                    f"DPI allocation error: allocated amount {float(alloc_amount):.2f} "
                    f"exceeds outstanding balance {float(dpi_outstanding):.2f} "
                    f"on AP Down Payment Invoice '{alloc.dpi_doc_id}'."
                )

            total_allocated += alloc_amount
            validated_dpi_allocations.append({
                "dpiDocId": alloc.dpi_doc_id,
                "dpiDocNumber": dpi_raw.get("docNumber", ""),
                "allocatedAmount": float(alloc_amount),
            })

        if total_allocated > ap_total_gross + Decimal("0.005"):
            raise ValueError(
                f"DPI allocation error: total allocated amount {float(total_allocated):.2f} "
                f"exceeds the AP Invoice total gross {float(ap_total_gross):.2f}. "
                "Cannot allocate more DPI prepayment than the AP Invoice is worth."
            )

        # Build GR-line invoice deltas for chain-counter reconciliation.
        # ap_line_docs carry grLineId = the GR line being invoiced; quantity is
        # always the full GR line qty in v1 (no partial AP invoicing).
        gr_line_deltas: Dict[str, Decimal] = {
            ld["grLineId"]: Decimal(str(ld["quantity"]))
            for ld in ap_line_docs
            if ld.get("grLineId")
        }

        # Stamp all lines with the AP docId and org
        for idx, ld in enumerate(ap_line_docs, start=1):
            ld["docId"] = doc_id
            ld["organizationId"] = org_id
            ld["lineNumber"] = idx
            ld["createdAt"] = now
            ld["updatedAt"] = now

        async with self._txn() as session:
            doc_number = await _next_doc_number(self._db, company_code, "AP", session=session)

            header: Dict[str, Any] = {
                "docId": doc_id,
                "organizationId": org_id,
                "companyCode": company_code,
                "docType": "AP",
                "docNumber": doc_number,
                "docDate": doc_date,
                "status": DocumentStatus.DRAFT.value,
                "baseDocId": gr_doc_id,
                "baseDocNumber": gr_header.get("docNumber", ""),
                "poDocId": po_doc_id,
                "poDocNumber": po_doc_number,
                "vendorId": gr_header["vendorId"],
                "vendorCode": gr_header.get("vendorCode"),
                "vendorName": gr_header.get("vendorName"),
                "currencyCode": gr_header.get("currencyCode", "AED"),
                "paymentTermsCode": gr_header.get("paymentTermsCode"),
                "invoiceNumber": data.invoiceNumber,
                "invoiceDate": invoice_date,
                "dueDate": due_date,
                "notes": data.notes,
                **totals,
                "approvalState": "NotRequired",
                "approvalRequestedFrom": None,
                "approvalRequestedAt": None,
                "approvalDecidedBy": None,
                "approvalDecidedAt": None,
                "approvalComment": None,
                "approvalHistory": [],
                "postedAt": None,
                "postedBy": None,
                "postedEventId": None,
                # Reason: T-200.24 — store validated DPI allocations on the AP header.
                # These will be consumed (reconcile_dpi_consumption) when the AP
                # transitions to OPEN (i.e. when approve_ap fires the posting event).
                "dpiAllocations": validated_dpi_allocations,
                "createdAt": now,
                "createdBy": created_by,
                "updatedAt": now,
                "updatedBy": created_by,
                "deletedAt": None,
            }

            if ap_line_docs:
                await self._lines.insert_many(ap_line_docs, session=session)
            await self._headers.insert_one(header, session=session)

            # Append AP as targetDocRef on GR header (T-200.22 chain-ref tracking).
            await self._headers.update_one(
                {"docId": gr_doc_id},
                {
                    "$push": {
                        "targetDocRefs": {
                            "docType": "AP",
                            "docId": doc_id,
                            "docNumber": doc_number,
                        }
                    }
                },
                session=session,
            )

        # Reason: counter and auto-close calls OUTSIDE the transaction — best-effort;
        # mirrors the sales AR Invoice pattern in create_ar_invoice_from_delivery.
        # If these fail, the AP Draft is already created and the user can re-submit;
        # the GR status being OPEN rather than CLOSED is a cosmetic/listing concern,
        # not a financial integrity issue.
        await reconcile_gr_line_invoice_counters(
            self._db,
            gr_doc_id=gr_doc_id,
            org_id=org_id,
            user_id=created_by,
            ap_doc_id=doc_id,
            line_deltas=gr_line_deltas,
            # cap_check=True: v1 locks qty to GR qty, so delta == GR qty; if
            # invoicedQty already == qty (duplicate AP guard missed somehow), the
            # cap raises a ValueError before any $inc.
            cap_check=True,
        )

        gr_raw = await load_gr_with_lines(self._db, org_id=org_id, gr_doc_id=gr_doc_id)
        await auto_close_gr_if_fully_invoiced(
            self._db,
            gr_doc_id=gr_doc_id,
            gr_raw=gr_raw,
            org_id=org_id,
            user_id=created_by,
            action="auto_close_on_full_invoice",
            extra_detail={
                "triggeredByApDocId": doc_id,
                "triggeredByApDocNumber": doc_number,
            },
        )

        logger.info(
            "[DocumentService] created AP docNumber=%s from GR=%s org=%s",
            doc_number,
            gr_header.get("docNumber"),
            org_id,
        )
        lines_resp = [_line_to_response(l) for l in ap_line_docs]
        return APDetailResponse(
            **_header_to_ap_response(header).model_dump(),
            lines=lines_resp,
        )

    async def create_ap(
        self,
        org_id: str,
        data: "APCreate",
        created_by: str,
        company_code: Optional[str] = None,
        auth_token: Optional[str] = None,
    ) -> "APDetailResponse":
        """
        Create a Draft AP Invoice with an explicit baseDocId (GR docId) in the body.

        Functionally equivalent to create_ap_from_gr; accepts the GR docId in
        the request body rather than the URL path.

        Args:
            org_id:       Organisation scope.
            data:         APCreate payload with baseDocId.
            created_by:   User UUID string.
            company_code: Finance company code.
            auth_token:   Bearer token forwarded to the finance service for tax
                resolution (T-200.22b).

        Returns:
            Created APDetailResponse (status: Draft).

        Raises:
            ValueError: If GR not found, not Posted, or AP already exists.
        """
        from ..models.document import APFromGRCreate

        # Reason: reuse create_ap_from_gr — only difference is the baseDocId source
        ap_from_gr_data = APFromGRCreate(
            docDate=data.docDate,
            invoiceNumber=data.invoiceNumber,
            invoiceDate=data.invoiceDate,
            dueDate=data.dueDate,
            notes=data.notes,
            lines=data.lines,
        )
        return await self.create_ap_from_gr(
            org_id=org_id,
            gr_doc_id=data.baseDocId,
            data=ap_from_gr_data,
            created_by=created_by,
            company_code=company_code,
            auth_token=auth_token,
        )

    async def list_aps(
        self,
        org_id: str,
        *,
        page: int = 1,
        per_page: int = 20,
        status_filter: Optional[str] = None,
        search: Optional[str] = None,
        vendor_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Paginated list of AP Invoices for an organisation.

        Args:
            org_id: Organisation scope.
            page: Page number (1-based).
            per_page: Items per page.
            status_filter: Filter by AP status string.
            search: Substring search on docNumber.
            vendor_id: Filter by vendorId.

        Returns:
            Dict with items, total, page, perPage, totalPages.
        """
        query: Dict[str, Any] = {
            "organizationId": org_id,
            "docType": "AP",
            "deletedAt": None,
        }
        if status_filter:
            query["status"] = status_filter
        if vendor_id:
            query["vendorId"] = vendor_id
        if search:
            query["docNumber"] = {"$regex": search, "$options": "i"}

        total = await self._headers.count_documents(query)
        offset = (page - 1) * per_page
        cursor = self._headers.find(query).sort("docDate", -1).skip(offset).limit(per_page)
        docs = await cursor.to_list(length=per_page)

        return {
            "items": [_header_to_ap_response(d) for d in docs],
            "total": total,
            "page": page,
            "perPage": per_page,
            "totalPages": max(1, -(-total // per_page)),
        }

    async def get_ap(self, org_id: str, doc_id: str) -> Optional["APDetailResponse"]:
        """
        Fetch a single AP Invoice with its lines.

        Args:
            org_id: Organisation scope.
            doc_id: AP document UUID string.

        Returns:
            APDetailResponse or None if not found.
        """
        from ..models.document import APDetailResponse

        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "AP", "deletedAt": None}
        )
        if not header:
            return None
        lines = await self._get_lines(doc_id)
        return APDetailResponse(**_header_to_ap_response(header).model_dump(), lines=lines)

    async def update_ap(
        self,
        org_id: str,
        doc_id: str,
        data: "APUpdate",
        updated_by: str,
        auth_token: Optional[str] = None,
    ) -> Optional["APDetailResponse"]:
        """
        Partial update a Draft AP Invoice.

        Only header metadata (invoiceNumber, invoiceDate, dueDate, notes) and
        line invoiceUnitPrices may be changed. baseDocId, vendor, companyCode,
        and line quantities are immutable.

        T-200.22 note (Part 9): No GR counter reconciliation is needed on AP
        update because AP line **quantities** are immutable in purchasing v1
        (they are locked to the GR received quantity; only ``invoiceUnitPrice``
        can change).  The GR ``invoicedQty`` counter was set at
        ``create_ap_from_gr`` time and remains valid throughout the AP's life.
        If partial-quantity AP invoicing is added in a future ticket, this
        function will need counter delta logic mirroring T-201.6 on the sales side.

        Args:
            org_id:     Organisation scope.
            doc_id:     AP document UUID string.
            data:       Partial update payload.
            updated_by: User UUID string.
            auth_token: Bearer token forwarded to the finance service for tax
                resolution when line prices are updated (T-200.22b).

        Returns:
            Updated APDetailResponse or None if not found.

        Raises:
            ValueError: If AP is not in Draft status.
        """
        from ..models.document import APDetailResponse

        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "AP", "deletedAt": None}
        )
        if not header:
            return None
        if _parse_status(header["status"]) != DocumentStatus.DRAFT:
            raise ValueError("Only Draft AP Invoices can be updated")

        now = datetime.now(tz=timezone.utc)
        updates: Dict[str, Any] = {"updatedAt": now, "updatedBy": updated_by}

        if data.invoiceNumber is not None:
            updates["invoiceNumber"] = data.invoiceNumber
        if data.invoiceDate is not None:
            updates["invoiceDate"] = data.invoiceDate
        if data.dueDate is not None:
            updates["dueDate"] = data.dueDate
        if data.notes is not None:
            updates["notes"] = data.notes

        new_line_docs: Optional[List[Dict[str, Any]]] = None
        if data.lines is not None:
            # Reason: re-build all lines from GR to re-compute variance on updated prices
            gr_doc_id = header["baseDocId"]
            new_line_docs = await self._build_ap_lines_from_gr(
                gr_doc_id, org_id, data.lines, now, auth_token=auth_token
            )
            for idx, ld in enumerate(new_line_docs, start=1):
                ld["docId"] = doc_id
                ld["organizationId"] = org_id
                ld["lineNumber"] = idx
                ld["createdAt"] = now
                ld["updatedAt"] = now
            totals = self._sum_ap_lines(new_line_docs)
            updates.update(totals)

        async with self._txn() as session:
            if new_line_docs is not None:
                # Reason: replace lines wholesale — delete old, insert new
                await self._lines.delete_many({"docId": doc_id}, session=session)
                if new_line_docs:
                    await self._lines.insert_many(new_line_docs, session=session)
            await self._headers.update_one({"docId": doc_id}, {"$set": updates}, session=session)
            updated = await self._headers.find_one({"docId": doc_id}, session=session)
            assert updated is not None

        lines = await self._get_lines(doc_id)
        return APDetailResponse(**_header_to_ap_response(updated).model_dump(), lines=lines)

    async def submit_ap(
        self,
        org_id: str,
        doc_id: str,
        submitted_by: str,
        company_code: Optional[str] = None,
    ) -> "APDetailResponse":
        """
        Submit an AP Invoice for approval (Draft → Pending Approval).

        Queries the approval engine with doc_type='AP_INVOICE' and totalGross.
        If approval is not required by the engine, moves directly to Approved and
        emits the ap_invoice_posted event.

        The approval-engine HTTP call is made OUTSIDE the transaction.
        See module docstring for rationale.

        Args:
            org_id: Organisation scope.
            doc_id: AP document UUID string.
            submitted_by: User UUID string.
            company_code: Finance company code.

        Returns:
            Updated APDetailResponse.

        Raises:
            ValueError: If AP not found or invalid transition.
        """
        from ..models.document import APDetailResponse

        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "AP", "deletedAt": None}
        )
        if not header:
            raise ValueError(f"AP Invoice '{doc_id}' not found")

        current_status = _parse_status(header["status"])
        assert_legal_transition(_DOC_TYPE_AP_INVOICE, current_status, DocumentStatus.PENDING_APPROVAL)

        # Reason: resolve approval decision before opening the transaction
        total_gross = Decimal(str(header.get("totalGross", 0)))
        decision: EngineDecision = await self._engine.resolve_required_approval(
            org_id=org_id,
            company_code=company_code,
            doc_type="AP_INVOICE",
            amount=total_gross,
        )

        now = datetime.now(tz=timezone.utc)
        previous_status = header["status"]

        if decision.required:
            new_status = DocumentStatus.PENDING_APPROVAL.value
            updates: Dict[str, Any] = {
                "status": new_status,
                "approvalState": "Pending",
                "approvalRequestedFrom": decision.approver_role,
                "approvalRequestedAt": now,
                "updatedAt": now,
                "updatedBy": submitted_by,
            }

            async with self._txn() as session:
                await self._headers.update_one(
                    {"docId": doc_id, "approvalHistory": {"$exists": False}},
                    {"$set": {"approvalHistory": []}},
                    session=session,
                )
                await self._headers.update_one({"docId": doc_id}, {"$set": updates}, session=session)
                updated = await self._headers.find_one({"docId": doc_id}, session=session)
                assert updated is not None

        else:
            # Reason: no approval gate → direct DRAFT → OPEN (the auto-approve path).
            assert_legal_transition(_DOC_TYPE_AP_INVOICE, current_status, DocumentStatus.OPEN)
            new_status = DocumentStatus.OPEN.value
            history_entry = {
                "stepNumber": 1,
                "approverId": submitted_by,
                "approverRole": "auto",
                "decision": "Approved",
                "decidedAt": now,
                "comment": "Auto-approved (no approval required by rules)",
                "workflowId": None,
            }
            updates = {
                "status": new_status,
                "approvalState": "NotRequired",
                "postedAt": now,
                "postedBy": submitted_by,
                "updatedAt": now,
                "updatedBy": submitted_by,
            }

            ap_lines_cursor = self._lines.find({"docId": doc_id})
            ap_lines: List[Dict[str, Any]] = await ap_lines_cursor.to_list(length=None)

            async with self._txn() as session:
                await self._headers.update_one(
                    {"docId": doc_id},
                    {
                        "$set": updates,
                        "$push": {"approvalHistory": history_entry},
                    },
                    session=session,
                )
                updated = await self._headers.find_one({"docId": doc_id}, session=session)
                assert updated is not None

                posted_event_id = await self._emit_ap_invoice_posted_event(
                    updated, ap_lines, session=session
                )
                await self._headers.update_one(
                    {"docId": doc_id},
                    {"$set": {"postedEventId": posted_event_id}},
                    session=session,
                )
                updated = await self._headers.find_one({"docId": doc_id}, session=session)
                assert updated is not None

        logger.info(
            "[DocumentService] submitted AP docId=%s newStatus=%s", doc_id, new_status
        )

        # -----------------------------------------------------------------------
        # T-200.24 — Apply DPI consumption if this was an auto-approve (DRAFT→OPEN).
        # When approval was required (DRAFT → PENDING_APPROVAL path), DPI consumption
        # fires in approve_ap() instead.
        # -----------------------------------------------------------------------
        if new_status == DocumentStatus.OPEN.value:
            dpi_allocs = updated.get("dpiAllocations") or []
            for dpi_alloc in dpi_allocs:
                dpi_doc_id = dpi_alloc.get("dpiDocId")
                alloc_amt = Decimal(str(dpi_alloc.get("allocatedAmount", 0)))
                if not dpi_doc_id or alloc_amt <= Decimal("0"):
                    continue
                try:
                    await reconcile_dpi_consumption(
                        self._db,
                        dpi_doc_id=dpi_doc_id,
                        org_id=org_id,
                        user_id=submitted_by,
                        ap_doc_id=doc_id,
                        allocated_amount=alloc_amt,
                        cap_check=False,
                    )
                    dpi_raw_post = await self._db["ap_down_payments_v2"].find_one(
                        {"docId": dpi_doc_id, "organizationId": org_id}
                    )
                    if dpi_raw_post is not None:
                        await auto_close_dpi_if_fully_consumed(
                            self._db,
                            dpi_doc_id=dpi_doc_id,
                            dpi_raw=dpi_raw_post,
                            org_id=org_id,
                            user_id=submitted_by,
                            extra_detail={
                                "triggeredByApDocId": doc_id,
                                "triggeredByApDocNumber": updated.get("docNumber", ""),
                            },
                        )
                except Exception as exc:  # noqa: BLE001
                    logger.error(
                        "[DocumentService] DPI consumption update failed for DPI '%s' "
                        "on auto-approve AP '%s': %s",
                        dpi_doc_id,
                        doc_id,
                        exc,
                    )

        lines_resp = await self._get_lines(doc_id)
        return APDetailResponse(**_header_to_ap_response(updated).model_dump(), lines=lines_resp)

    async def approve_ap(
        self,
        org_id: str,
        doc_id: str,
        approver_id: str,
        approver_role: str,
        comment: Optional[str],
        company_code: Optional[str] = None,
    ) -> "APDetailResponse":
        """
        Approve an AP Invoice in Pending Approval state.

        On approval:
          1. Transitions AP status to Approved.
          2. Records approvalHistory entry.
          3. Emits ap_invoice_posted outbox event (the second JE in the P2P cycle).
          4. Stamps postedAt, postedBy, postedEventId.

        All steps are atomic within a single Mongo transaction.

        Args:
            org_id: Organisation scope.
            doc_id: AP document UUID string.
            approver_id: UUID of the approving user.
            approver_role: Role of the approver.
            comment: Optional approval comment.
            company_code: Finance company code.

        Returns:
            Updated APDetailResponse.

        Raises:
            ValueError: On invalid state, wrong role, or self-approval.
        """
        from ..models.document import APDetailResponse

        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "AP", "deletedAt": None}
        )
        if not header:
            raise ValueError(f"AP Invoice '{doc_id}' not found")

        current_status = _parse_status(header["status"])
        assert_legal_transition(_DOC_TYPE_AP_INVOICE, current_status, DocumentStatus.OPEN)

        # Reason: approver must hold the role specified in the approval request;
        # admin and super_admin have override authority.
        required_role = header.get("approvalRequestedFrom")
        _APPROVAL_OVERRIDE_ROLES = {"admin", "super_admin"}
        if required_role and approver_role != required_role and approver_role not in _APPROVAL_OVERRIDE_ROLES:
            raise ValueError(
                f"Approval requires role '{required_role}'; your role is '{approver_role}'"
            )

        # Reason: prevent self-approval (separation of duties)
        if (
            header.get("createdBy") == approver_id
            and approver_role not in _APPROVAL_OVERRIDE_ROLES
        ):
            raise ValueError("You cannot approve an AP Invoice you created")

        now = datetime.now(tz=timezone.utc)

        history_entry = {
            "stepNumber": 1,
            "approverId": approver_id,
            "approverRole": approver_role,
            "decision": "Approved",
            "decidedAt": now,
            "comment": comment,
            "workflowId": None,
        }

        # Reason: read lines OUTSIDE the transaction to keep the window short
        ap_lines_cursor = self._lines.find({"docId": doc_id})
        ap_lines: List[Dict[str, Any]] = await ap_lines_cursor.to_list(length=None)
        if not ap_lines:
            raise ValueError("Cannot approve an AP Invoice with no lines")

        async with self._txn() as session:
            await self._headers.update_one(
                {"docId": doc_id},
                {
                    "$set": {
                        "status": DocumentStatus.OPEN.value,
                        "approvalState": "Approved",
                        "approvalDecidedBy": approver_id,
                        "approvalDecidedAt": now,
                        "approvalComment": comment,
                        "postedAt": now,
                        "postedBy": approver_id,
                        "updatedAt": now,
                        "updatedBy": approver_id,
                    },
                    "$push": {"approvalHistory": history_entry},
                },
                session=session,
            )
            updated = await self._headers.find_one({"docId": doc_id}, session=session)
            assert updated is not None

            # Reason: emit the ap_invoice_posted event inside the same transaction so
            # the outbox write and the header update are atomic.
            posted_event_id = await self._emit_ap_invoice_posted_event(
                updated, ap_lines, session=session
            )

            # Stamp postedEventId for idempotency
            await self._headers.update_one(
                {"docId": doc_id},
                {"$set": {"postedEventId": posted_event_id}},
                session=session,
            )
            updated = await self._headers.find_one({"docId": doc_id}, session=session)
            assert updated is not None

        logger.info(
            "[DocumentService] approved AP docId=%s eventId=%s by user=%s",
            doc_id,
            posted_event_id,
            approver_id,
        )

        # -----------------------------------------------------------------------
        # T-200.24 — Apply DPI consumption counters after AP approval.
        # Best-effort (outside the transaction) — mirrors the GR counter pattern.
        # For each DPI allocation stored on the AP header:
        #   1. $inc consumedAmount on the DPI.
        #   2. Auto-close or auto-partly-close the DPI if fully/partially consumed.
        # -----------------------------------------------------------------------
        dpi_allocs = header.get("dpiAllocations") or updated.get("dpiAllocations") or []
        for dpi_alloc in dpi_allocs:
            dpi_doc_id = dpi_alloc.get("dpiDocId")
            alloc_amt = Decimal(str(dpi_alloc.get("allocatedAmount", 0)))
            if not dpi_doc_id or alloc_amt <= Decimal("0"):
                continue
            try:
                await reconcile_dpi_consumption(
                    self._db,
                    dpi_doc_id=dpi_doc_id,
                    org_id=org_id,
                    user_id=approver_id,
                    ap_doc_id=doc_id,
                    allocated_amount=alloc_amt,
                    cap_check=False,  # cap was checked at create_ap_from_gr time
                )
                # Reload DPI for auto-close decision.
                dpi_raw_post = await self._db["ap_down_payments_v2"].find_one(
                    {"docId": dpi_doc_id, "organizationId": org_id}
                )
                if dpi_raw_post is not None:
                    await auto_close_dpi_if_fully_consumed(
                        self._db,
                        dpi_doc_id=dpi_doc_id,
                        dpi_raw=dpi_raw_post,
                        org_id=org_id,
                        user_id=approver_id,
                        extra_detail={
                            "triggeredByApDocId": doc_id,
                            "triggeredByApDocNumber": updated.get("docNumber", ""),
                        },
                    )
            except Exception as exc:  # noqa: BLE001
                # Reason: DPI counter failure must not roll back AP approval.
                logger.error(
                    "[DocumentService] DPI consumption update failed for DPI '%s' "
                    "on AP approval '%s': %s",
                    dpi_doc_id,
                    doc_id,
                    exc,
                )

        lines_resp = await self._get_lines(doc_id)
        return APDetailResponse(**_header_to_ap_response(updated).model_dump(), lines=lines_resp)

    async def reject_ap(
        self,
        org_id: str,
        doc_id: str,
        approver_id: str,
        approver_role: str,
        comment: str,
        company_code: Optional[str] = None,
    ) -> "APDetailResponse":
        """
        Reject an AP Invoice in Pending Approval state.

        Rejection is terminal in v1. The user must create a new AP Invoice
        if corrections are needed.

        T-200.22 chain mechanics (Part 11 — AP terminal-reject path):
          - Rejection is semantically equivalent to cancellation: the AP will
            never be posted, so GR line ``invoicedQty`` counters are released.
          - Auto-reopens the source GR if it was CLOSED (i.e. was the only AP
            covering all lines).
          - Pulls stale AP targetDocRef from the GR header.
          - This parallels the sales ``OPEN→CANCELLED`` release path.  There is
            no OPEN→CANCELLED transition for AP in v1; "Rejected" is the only
            terminal-failure path.

        Args:
            org_id: Organisation scope.
            doc_id: AP document UUID string.
            approver_id: UUID of the rejecting user.
            approver_role: Role of the approver.
            comment: Rejection reason (required).
            company_code: Finance company code.

        Returns:
            Updated APDetailResponse.

        Raises:
            ValueError: On invalid state or wrong role.
        """
        from ..models.document import APDetailResponse

        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "AP", "deletedAt": None}
        )
        if not header:
            raise ValueError(f"AP Invoice '{doc_id}' not found")

        # Reason: "Rejected" has no DocumentStatus equivalent (Wave 4 gap).
        _validate_transition_legacy(_DOC_TYPE_AP_INVOICE, header["status"], "Rejected")

        required_role = header.get("approvalRequestedFrom")
        _APPROVAL_OVERRIDE_ROLES = {"admin", "super_admin"}
        if required_role and approver_role != required_role and approver_role not in _APPROVAL_OVERRIDE_ROLES:
            raise ValueError(
                f"Approval requires role '{required_role}'; your role is '{approver_role}'"
            )

        # Reason: read AP lines BEFORE the rejection for chain counter release.
        ap_lines_cursor = self._lines.find({"docId": doc_id})
        ap_lines: List[Dict[str, Any]] = await ap_lines_cursor.to_list(length=None)

        gr_doc_id: Optional[str] = header.get("baseDocId")

        # Build release deltas (negative — releasing invoicedQty committed at create).
        release_deltas: Dict[str, Decimal] = {
            ln["grLineId"]: -Decimal(str(ln["quantity"]))
            for ln in ap_lines
            if ln.get("grLineId")
        }

        now = datetime.now(tz=timezone.utc)

        history_entry = {
            "stepNumber": 1,
            "approverId": approver_id,
            "approverRole": approver_role,
            "decision": "Rejected",
            "decidedAt": now,
            "comment": comment,
            "workflowId": None,
        }

        async with self._txn() as session:
            await self._headers.update_one(
                {"docId": doc_id},
                {
                    "$set": {
                        # Reason: "Rejected" stored as-is; no shared enum equivalent yet.
                        "status": "Rejected",
                        "approvalState": "Rejected",
                        "approvalDecidedBy": approver_id,
                        "approvalDecidedAt": now,
                        "approvalComment": comment,
                        "updatedAt": now,
                        "updatedBy": approver_id,
                    },
                    "$push": {"approvalHistory": history_entry},
                },
                session=session,
            )
            updated = await self._headers.find_one({"docId": doc_id}, session=session)
            assert updated is not None

        logger.info("[DocumentService] rejected AP docId=%s by user=%s", doc_id, approver_id)

        # Reason: release GR chain counters after rejection — best-effort, outside
        # the transaction.  Rejection is terminal; if the user wants to re-invoice
        # the GR they must create a new AP Invoice, which requires the GR to show
        # open invoice qty.
        if gr_doc_id and release_deltas:
            await reconcile_gr_line_invoice_counters(
                self._db,
                gr_doc_id=gr_doc_id,
                org_id=org_id,
                user_id=approver_id,
                ap_doc_id=doc_id,
                line_deltas=release_deltas,
                cap_check=False,
            )

            gr_raw = await load_gr_with_lines(self._db, org_id=org_id, gr_doc_id=gr_doc_id)
            if gr_raw is not None:
                await auto_reopen_gr_if_not_fully_invoiced(
                    self._db,
                    gr_doc_id=gr_doc_id,
                    gr_raw=gr_raw,
                    org_id=org_id,
                    user_id=approver_id,
                    action="auto_reopen_on_invoice_release",
                    extra_detail={
                        "releasedByApDocId": doc_id,
                        "reason": "ap_rejected",
                        "releasedDeltas": {
                            lid: float(qty) for lid, qty in release_deltas.items()
                        },
                    },
                )

            await pull_dangling_gr_chain_refs(
                self._db,
                gr_doc_id=gr_doc_id,
                org_id=org_id,
                user_id=approver_id,
                ap_doc_id=doc_id,
            )

        # -----------------------------------------------------------------------
        # T-200.24 — Release DPI allocations on rejection (best-effort).
        # Rejection is terminal — DPI balances must be restored so they can be
        # allocated to the replacement AP Invoice.
        # Note: at rejection time the AP was still PENDING_APPROVAL (never OPEN),
        # so consumedAmount was never incremented. Nothing to release.
        # However, if the DPI targetDocRef was pushed at create time (it was not —
        # we only push on $inc), there's nothing to pull here.  This block is a
        # defensive no-op to document the reasoning and leave space for future
        # allocation-at-create semantics.
        # -----------------------------------------------------------------------
        # (No-op: allocations are only committed at approve_ap time, so no
        # consumedAmount was incremented and no targetDocRef was pushed on rejection.)

        lines_resp = await self._get_lines(doc_id)
        return APDetailResponse(**_header_to_ap_response(updated).model_dump(), lines=lines_resp)

    async def withdraw_ap(
        self,
        org_id: str,
        doc_id: str,
        withdrawn_by: str,
    ) -> "APDetailResponse":
        """
        Withdraw an AP Invoice from Pending Approval back to Draft.

        This allows the submitter to correct the invoice before re-submitting.
        No finance event is emitted (finance was not yet notified).

        Args:
            org_id: Organisation scope.
            doc_id: AP document UUID string.
            withdrawn_by: User UUID string.

        Returns:
            Updated APDetailResponse (status: Draft).

        Raises:
            ValueError: If AP is not in Pending Approval status.
        """
        from ..models.document import APDetailResponse

        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "AP", "deletedAt": None}
        )
        if not header:
            raise ValueError(f"AP Invoice '{doc_id}' not found")

        current_status = _parse_status(header["status"])
        assert_legal_transition(_DOC_TYPE_AP_INVOICE, current_status, DocumentStatus.DRAFT)

        now = datetime.now(tz=timezone.utc)

        async with self._txn() as session:
            await self._headers.update_one(
                {"docId": doc_id},
                {
                    "$set": {
                        "status": DocumentStatus.DRAFT.value,
                        "approvalState": "NotRequired",
                        "approvalRequestedFrom": None,
                        "approvalRequestedAt": None,
                        "updatedAt": now,
                        "updatedBy": withdrawn_by,
                    }
                },
                session=session,
            )
            updated = await self._headers.find_one({"docId": doc_id}, session=session)
            assert updated is not None

        logger.info("[DocumentService] withdrew AP docId=%s back to Draft", doc_id)
        lines_resp = await self._get_lines(doc_id)
        return APDetailResponse(**_header_to_ap_response(updated).model_dump(), lines=lines_resp)

    async def soft_delete_ap(self, org_id: str, doc_id: str, deleted_by: str) -> bool:
        """
        Soft-delete a Draft AP Invoice.

        Approved AP Invoices are immutable per INTEGRATION_MODEL.md §5 and can
        never be deleted.  To correct an Approved AP, a future Amendment flow is needed.

        T-200.22 chain mechanics (Part 10):
          - After soft-deletion, releases GR line ``invoicedQty`` counters for
            each AP line (reconcile_gr_line_invoice_counters with negative deltas).
          - Auto-reopens the source GR if it was CLOSED and is no longer fully
            invoiced (auto_reopen_gr_if_not_fully_invoiced).
          - Pulls stale AP targetDocRef from the GR header
            (pull_dangling_gr_chain_refs).

        Args:
            org_id: Organisation scope.
            doc_id: AP document UUID string.
            deleted_by: User UUID string.

        Returns:
            True if deleted, False if not found.

        Raises:
            ValueError: If AP is not in Draft status.
        """
        header = await self._headers.find_one(
            {"organizationId": org_id, "docId": doc_id, "docType": "AP", "deletedAt": None}
        )
        if not header:
            return False
        if _parse_status(header["status"]) != DocumentStatus.DRAFT:
            raise ValueError(
                "Only Draft AP Invoices can be deleted. "
                "Approved AP Invoices are immutable — use Amendment flow to correct errors."
            )

        # Reason: read AP lines BEFORE soft-delete to know what GR counters to release.
        ap_lines_cursor = self._lines.find({"docId": doc_id})
        ap_lines: List[Dict[str, Any]] = await ap_lines_cursor.to_list(length=None)

        gr_doc_id: Optional[str] = header.get("baseDocId")

        # Build release deltas: negative (releasing previously-committed invoicedQty).
        # AP lines carry grLineId = the source GR line.
        release_deltas: Dict[str, Decimal] = {
            ln["grLineId"]: -Decimal(str(ln["quantity"]))
            for ln in ap_lines
            if ln.get("grLineId")
        }

        now = datetime.now(tz=timezone.utc)
        await self._headers.update_one(
            {"docId": doc_id},
            {"$set": {"deletedAt": now, "updatedAt": now, "updatedBy": deleted_by}},
        )
        logger.info("[DocumentService] soft-deleted AP docId=%s", doc_id)

        # Reason: only apply chain mechanics when the AP was created from a GR
        # and has registered invoice counters.  Pure direct-AP paths (if ever
        # introduced) would have no baseDocId and are skipped here.
        if gr_doc_id and release_deltas:
            await reconcile_gr_line_invoice_counters(
                self._db,
                gr_doc_id=gr_doc_id,
                org_id=org_id,
                user_id=deleted_by,
                ap_doc_id=doc_id,
                line_deltas=release_deltas,
                # Reason: cap_check=False — release deltas are negative;
                # no over-invoice cap applies.
                cap_check=False,
            )

            gr_raw = await load_gr_with_lines(self._db, org_id=org_id, gr_doc_id=gr_doc_id)
            if gr_raw is not None:
                await auto_reopen_gr_if_not_fully_invoiced(
                    self._db,
                    gr_doc_id=gr_doc_id,
                    gr_raw=gr_raw,
                    org_id=org_id,
                    user_id=deleted_by,
                    action="auto_reopen_on_invoice_release",
                    extra_detail={
                        "releasedByApDocId": doc_id,
                        "releasedDeltas": {
                            lid: float(qty) for lid, qty in release_deltas.items()
                        },
                    },
                )

            # Reason: $pull stale AP docId from GR targetDocRefs so the GR
            # detail chain card does not show a deleted AP Invoice.
            await pull_dangling_gr_chain_refs(
                self._db,
                gr_doc_id=gr_doc_id,
                org_id=org_id,
                user_id=deleted_by,
                ap_doc_id=doc_id,
            )

        # Reason: T-200.24 — No DPI release needed on DRAFT AP deletion.
        # DPI consumedAmount is only incremented at AP PENDING_APPROVAL → OPEN
        # (approve_ap).  A DRAFT AP has never been approved, so no DPI consumption
        # was ever committed.  The dpiAllocations stored on the AP header are
        # discarded with the AP document itself.

        return True

    # ==================================================================
    # Approval Inbox
    # ==================================================================

    async def get_pending_approvals(
        self,
        org_id: str,
        user_role: str,
    ) -> List[PendingApprovalItem]:
        """
        Return pending approval items for the current user's role.

        Args:
            org_id: Organisation scope.
            user_role: Current user's role string.

        Returns:
            List of PendingApprovalItem ordered by approvalRequestedAt desc.
        """
        # Reason: admin and super_admin have authority over any role's approval
        # (mirrors the override in approve_pr / approve_po). They see all
        # pending approvals in the inbox; other roles only see docs requested
        # from them specifically.
        query: Dict[str, Any] = {
            "organizationId": org_id,
            "approvalState": "Pending",
            "deletedAt": None,
        }
        if user_role not in ("admin", "super_admin"):
            query["approvalRequestedFrom"] = user_role
        cursor = self._headers.find(query).sort("approvalRequestedAt", -1)
        docs = await cursor.to_list(length=200)

        result = []
        for doc in docs:
            item = PendingApprovalItem(
                docId=doc["docId"],
                docType=doc["docType"],
                docNumber=doc["docNumber"],
                totalGross=Decimal(str(doc.get("totalGross", 0))),
                currencyCode=doc.get("currencyCode", "AED"),
                approvalRequestedAt=doc.get("approvalRequestedAt"),
                approvalRequestedFrom=doc.get("approvalRequestedFrom"),
                department=doc.get("department"),
                urgency=doc.get("urgency"),
                vendorName=doc.get("vendorName"),
                notes=doc.get("notes"),
            )
            result.append(item)
        return result

    async def get_approval_history(
        self,
        org_id: str,
        user_id: str,
        page: int = 1,
        per_page: int = 20,
    ) -> Dict[str, Any]:
        """
        Return completed approval decisions made by this user.

        Args:
            org_id: Organisation scope.
            user_id: UUID of the current user.
            page: Page number.
            per_page: Items per page.

        Returns:
            Dict with items, total, page, perPage, totalPages.
        """
        query: Dict[str, Any] = {
            "organizationId": org_id,
            "approvalDecidedBy": user_id,
            "approvalState": {"$in": ["Approved", "Rejected"]},
            "deletedAt": None,
        }
        total = await self._headers.count_documents(query)
        offset = (page - 1) * per_page
        cursor = self._headers.find(query).sort("approvalDecidedAt", -1).skip(offset).limit(per_page)
        docs = await cursor.to_list(length=per_page)

        items = [
            ApprovalHistoryItem(
                docId=doc["docId"],
                docType=doc["docType"],
                docNumber=doc["docNumber"],
                finalState=doc["status"],
                approvalDecidedBy=doc.get("approvalDecidedBy"),
                approvalDecidedAt=doc.get("approvalDecidedAt"),
                approvalComment=doc.get("approvalComment"),
                totalGross=Decimal(str(doc.get("totalGross", 0))),
                currencyCode=doc.get("currencyCode", "AED"),
            )
            for doc in docs
        ]

        return {
            "items": items,
            "total": total,
            "page": page,
            "perPage": per_page,
            "totalPages": max(1, -(-total // per_page)),
        }
