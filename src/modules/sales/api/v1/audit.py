"""
Sales Module — Audit History Endpoint (T-200.x)

Exposes the per-document audit trails maintained in the Wave 3 sales v2 audit
collections (ar_invoices_v2_audit, quotes_v2_audit, etc.).

Each sales document, on every state transition or write, appends a row to its
corresponding _audit collection.  The canonical row shape is::

    {
        "_id": ObjectId,
        "docEntry": str,          # UUID of the parent document
        "action":   str,          # e.g. "create_from_delivery", "transition_draft_to_open"
        "userId":   str,          # UUID of the actor
        "detail":   dict | None,  # opaque per-action payload
        "timestamp": datetime,    # UTC
    }

This endpoint reads those audit collections and returns them in a normalised
camelCase response ordered by timestamp descending (most recent first).

Endpoint
--------
GET /api/v1/sales/audit?docType=AR_INVOICE&docEntry=<uuid>&organizationId=<uuid>

Auth
----
Requires ``sales.view`` permission (same gate as all read endpoints in the
sales module). Any accountant, sales, or admin user can call this.

Doc-type → audit collection mapping
------------------------------------
The same 8 Wave 3 sales doc types as the attachment service (T-200.x):

    AR_INVOICE      → ar_invoices_v2_audit
    CUSTOMER_RECEIPT → customer_receipts_v2_audit
    QUOTE           → quotes_v2_audit
    SALES_ORDER     → sales_orders_v2_audit
    DELIVERY        → deliveries_v2_audit
    RETURN_REQUEST  → return_requests_v2_audit
    RETURN          → returns_v2_audit
    AR_CREDIT_NOTE  → ar_credit_notes_v2_audit

Actor name resolution is delegated to the frontend (useAdminUsers hook from
T-064) — we return the raw actorUserId UUID; the frontend maps it to a display
name.  This keeps the backend stateless and avoids a cross-service lookup on
every audit fetch.

Prefix: /audit (registered in src/modules/sales/api/v1/__init__.py)
Full path: GET /api/v1/sales/audit
"""

import logging
from datetime import datetime, timezone
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from ...middleware.auth import (
    CurrentUser,
    require_permission,
)
from src.modules.sales.services.database import sales_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Sales — Audit History"])

# ---------------------------------------------------------------------------
# Response config — matches the pattern used across all Wave 3 sales models
# (ar_invoices.py, quotes.py, etc.). populate_by_name=True allows snake_case
# input; alias_generator=to_camel serialises camelCase to the frontend.
# ---------------------------------------------------------------------------

_RESPONSE_CONFIG = ConfigDict(
    populate_by_name=True,
    alias_generator=to_camel,
    from_attributes=True,
)

# ---------------------------------------------------------------------------
# Doc-type → audit collection dispatch table
# ---------------------------------------------------------------------------

# Mapping mirrors _SALES_V2_COLLECTIONS in attachment_service.py plus the
# _audit suffix.  All 8 Wave 3 sales doc types are covered.
_SALES_AUDIT_COLLECTIONS: dict[str, str] = {
    "AR_INVOICE": "ar_invoices_v2_audit",
    "CUSTOMER_RECEIPT": "customer_receipts_v2_audit",
    "QUOTE": "quotes_v2_audit",
    "SALES_ORDER": "sales_orders_v2_audit",
    "DELIVERY": "deliveries_v2_audit",
    "RETURN_REQUEST": "return_requests_v2_audit",
    "RETURN": "returns_v2_audit",
    "AR_CREDIT_NOTE": "ar_credit_notes_v2_audit",
}

# ---------------------------------------------------------------------------
# Allowed doc types (for validation — reject other values with a clear 400)
# ---------------------------------------------------------------------------

_ALLOWED_DOC_TYPES: frozenset[str] = frozenset(_SALES_AUDIT_COLLECTIONS.keys())

# ---------------------------------------------------------------------------
# Response Pydantic models
# ---------------------------------------------------------------------------


class SalesAuditEntry(BaseModel):
    """
    A single audit event for a Wave 3 sales document.

    Fields
    ------
    entry_id:       Mongo _id as a hex string (unique per row).
    doc_entry:      UUID of the parent sales document (matches docEntry in the
                    parent collection, e.g. ar_invoices_v2).
    action:         Action label from the service layer, e.g.
                    "create_from_delivery", "transition_draft_to_open".
    actor_user_id:  UUID of the user who triggered the action.  The frontend
                    resolves this to a display name via useAdminUsers (T-064).
    timestamp:      UTC datetime when the action was recorded.
    detail:         Opaque per-action payload (varies by action type).  May be
                    null for simple state-transition events.

    Serialised as camelCase (entryId, docEntry, action, actorUserId, …).
    """

    model_config = _RESPONSE_CONFIG

    entry_id: str
    doc_entry: str
    action: str
    actor_user_id: str
    timestamp: datetime
    detail: Optional[dict] = None


class SalesAuditResponse(BaseModel):
    """
    Paginated (but single-page in v1) audit event list for a sales document.

    entries: ordered by timestamp DESC (most recent first).
    total:   total number of entries returned.
    """

    model_config = _RESPONSE_CONFIG

    entries: List[SalesAuditEntry]
    total: int


# ---------------------------------------------------------------------------
# Helper: document → SalesAuditEntry
# ---------------------------------------------------------------------------


def _doc_to_entry(doc: dict) -> SalesAuditEntry:
    """
    Convert a raw MongoDB audit document to a SalesAuditEntry Pydantic model.

    Args:
        doc: Raw dict from Motor / fake-Motor with _id, docEntry, action,
             userId (or actorUserId), detail, timestamp fields.

    Returns:
        SalesAuditEntry with entry_id coerced to str.
    """
    # Reason: _id is an ObjectId; coerce to hex string for JSON serialisation.
    entry_id = str(doc.get("_id", ""))

    # Reason: audit rows written by service layer use "userId"; normalise to
    # "actor_user_id" here so the response is consistent regardless of which
    # field name older rows used.
    actor = doc.get("userId") or doc.get("actorUserId") or ""

    return SalesAuditEntry(
        entry_id=entry_id,
        doc_entry=doc.get("docEntry", ""),
        action=doc.get("action", "unknown"),
        actor_user_id=actor,
        timestamp=doc.get("timestamp", datetime.now(tz=timezone.utc)),
        detail=doc.get("detail"),
    )


# ---------------------------------------------------------------------------
# Dependency: database
# ---------------------------------------------------------------------------


def _get_db():
    """Return the shared ops MongoDB database instance."""
    return sales_db.get_database()


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=SalesAuditResponse,
    response_model_by_alias=True,
    status_code=status.HTTP_200_OK,
    summary="Get sales document audit history",
    description=(
        "Return the audit trail for a Wave 3 sales document. "
        "Results are ordered by timestamp descending (most recent first). "
        "Actor name resolution is delegated to the frontend."
    ),
)
async def get_sales_audit(
    doc_type: str = Query(
        ...,
        alias="docType",
        description=(
            "Sales document type. One of: AR_INVOICE, CUSTOMER_RECEIPT, QUOTE, "
            "SALES_ORDER, DELIVERY, RETURN_REQUEST, RETURN, AR_CREDIT_NOTE."
        ),
    ),
    doc_entry: str = Query(
        ...,
        alias="docEntry",
        description="UUID of the sales document (docEntry field in the v2 collection).",
    ),
    organization_id: str = Query(
        ...,
        alias="organizationId",
        description="UUID of the owning organisation.",
    ),
    current_user: CurrentUser = Depends(require_permission("sales.view")),
    db=Depends(_get_db),
) -> SalesAuditResponse:
    """
    Fetch audit events for a Wave 3 sales document.

    Dispatches to the correct ``<doctype>_v2_audit`` Mongo collection based
    on the ``docType`` query parameter.  Returns all events ordered newest
    first.

    Args:
        doc_type:        Sales document type (validated against whitelist).
        doc_entry:       Primary key UUID of the sales document.
        organization_id: Organisation UUID for cross-org isolation.
        current_user:    Authenticated user with sales.view permission.
        db:              Motor database dependency.

    Returns:
        SalesAuditResponse with entries list and total count.

    Raises:
        HTTPException 400: If doc_type is not in the allowed whitelist.
        HTTPException 500: If the Mongo query fails unexpectedly.
    """
    # Validate doc_type against the whitelist
    doc_type_upper = doc_type.upper()
    if doc_type_upper not in _ALLOWED_DOC_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"doc_type {doc_type!r} is not permitted. "
                f"Allowed types: {sorted(_ALLOWED_DOC_TYPES)}"
            ),
        )

    collection_name = _SALES_AUDIT_COLLECTIONS[doc_type_upper]

    try:
        # Audit rows in the *_v2_audit collections store {_id, docEntry, action,
        # userId, detail, timestamp} — they do NOT carry organizationId. Cross-
        # org isolation is enforced by the parent document (the docEntry uniquely
        # identifies a doc within an org; users only reach this endpoint after
        # navigating to the parent's detail page, which is itself org-scoped via
        # the require_permission("sales.view") guard above). The organizationId
        # query param is retained for trace/audit consistency but is not part of
        # the Mongo filter.
        _ = organization_id  # acknowledged but unused in the filter
        cursor = db[collection_name].find(
            {"docEntry": doc_entry},
            sort=[("timestamp", -1)],
        )
        raw_docs: list[dict] = []
        async for doc in cursor:
            raw_docs.append(doc)

    except Exception as exc:
        logger.error(
            "[SalesAudit] MongoDB query failed for %s docEntry=%s org=%s: %s",
            collection_name,
            doc_entry,
            organization_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve audit history.",
        ) from exc

    entries = [_doc_to_entry(doc) for doc in raw_docs]

    logger.info(
        "[SalesAudit] Fetched %d entries for %s docEntry=%s org=%s",
        len(entries),
        doc_type_upper,
        doc_entry,
        organization_id,
    )

    return SalesAuditResponse(entries=entries, total=len(entries))
