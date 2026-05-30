"""
Sales Module — Sales Quote API Routes

Endpoints for the Sales Quote (SQ) document lifecycle.

Permissions (mirrors orders.py pattern):
  - Read:   any authenticated active user
  - Write:  sales.create / sales.edit roles
  - Delete: sales.delete role

Endpoint set:
  GET    /quotes                           — paginated list with filters
  GET    /quotes/{doc_entry}               — single quote with all lines
  POST   /quotes                           — create (status = DRAFT)
  PATCH  /quotes/{doc_entry}              — update header/lines (DRAFT only)
  DELETE /quotes/{doc_entry}              — hard delete (DRAFT only)
  POST   /quotes/{doc_entry}/transition   — status transition

All endpoints require organisation_id, resolved from query param or JWT.
"""

import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ...middleware.auth import (
    CurrentUser,
    get_current_active_user,
    require_permission,
)
from ...models.quotes import (
    QuoteCreate,
    QuoteListItem,
    QuoteResponse,
    QuoteStatusTransitionRequest,
    QuoteUpdate,
)
from ...services.quote_service import (
    create_quote,
    delete_quote,
    get_quote,
    list_quotes,
    transition_status,
    update_quote,
)
from ...utils.responses import PaginatedResponse, PaginationMeta, SuccessResponse
from src.core.documents.document_status import DocumentStatus
from src.modules.sales.services.database import sales_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Sales — Quotes"])

# Roles whose members may write / transition quotes.
_WRITE_ROLES = frozenset({
    "admin",
    "super_admin",
    "moderator",
    "user",
})


def _get_db():
    """Dependency: return the shared ops MongoDB database instance."""
    return sales_db.get_database()


def _resolve_org_id(
    organization_id: Optional[str],
    current_user: CurrentUser,
) -> str:
    """
    Resolve organisation ID from query param or JWT claim.

    Args:
        organization_id: Optional explicit override from query param.
        current_user:    Authenticated user from JWT.

    Returns:
        Organisation UUID string.

    Raises:
        HTTPException 400: If org ID cannot be resolved from either source.
    """
    org_id = organization_id or getattr(current_user, "organizationId", None)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="organization_id is required",
        )
    return org_id


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=PaginatedResponse[QuoteListItem],
    response_model_by_alias=True,
    summary="List Sales Quotes",
    description=(
        "Return a paginated list of Sales Quotes for the given organisation. "
        "Supports filtering by status, customer_id, and date range."
    ),
)
async def list_quotes_endpoint(
    organization_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    customer_id: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None, description="Inclusive lower bound on doc_date"),
    date_to: Optional[date] = Query(None, description="Inclusive upper bound on doc_date"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> PaginatedResponse[QuoteListItem]:
    """
    Paginated list of Sales Quotes for an organisation.

    Args:
        organization_id: Organisation UUID (defaults to JWT claim).
        status_filter:   Filter by status value (draft, open, closed, cancelled).
        customer_id:     Filter by customer FK.
        date_from:       Inclusive lower bound on docDate.
        date_to:         Inclusive upper bound on docDate.
        page:            1-based page number.
        size:            Items per page (max 200).
        current_user:    Authenticated user.
        db:              Motor database dependency.

    Returns:
        PaginatedResponse containing QuoteListItem objects.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    result = await list_quotes(
        db,
        org_id=org_id,
        status=status_filter,
        customer_id=customer_id,
        date_from=date_from,
        date_to=date_to,
        page=page,
        size=size,
    )

    return PaginatedResponse(
        data=result["items"],
        meta=PaginationMeta(
            total=result["total"],
            page=result["page"],
            perPage=result["perPage"],
            totalPages=result["totalPages"],
        ),
    )


# ---------------------------------------------------------------------------
# Get
# ---------------------------------------------------------------------------


@router.get(
    "/{doc_entry}",
    response_model=SuccessResponse[QuoteResponse],
    response_model_by_alias=True,
    summary="Get Sales Quote detail",
)
async def get_quote_endpoint(
    doc_entry: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> SuccessResponse[QuoteResponse]:
    """
    Retrieve a single Sales Quote with all embedded lines.

    Args:
        doc_entry:       UUID of the Sales Quote.
        organization_id: Organisation UUID for scoping (defaults to JWT claim).
        current_user:    Authenticated user.
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping QuoteResponse.

    Raises:
        HTTPException 404: If the quote is not found.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    quote = await get_quote(db, doc_entry=doc_entry, org_id=org_id)
    if quote is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sales Quote '{doc_entry}' not found",
        )
    return SuccessResponse(data=quote)


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=SuccessResponse[QuoteResponse],
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create Sales Quote",
)
async def create_quote_endpoint(
    body: QuoteCreate,
    current_user: CurrentUser = Depends(require_permission("sales.create")),
    db=Depends(_get_db),
) -> SuccessResponse[QuoteResponse]:
    """
    Create a new Sales Quote in DRAFT status.

    The doc_number is generated automatically using the T-100.1 ``next_doc_number``
    helper (prefix "QUOTE" → "SQ-YYYY-NNNN").

    Args:
        body:         Validated QuoteCreate payload.
        current_user: Authenticated user (must hold sales.create permission).
        db:           Motor database dependency.

    Returns:
        SuccessResponse wrapping the newly created QuoteResponse (HTTP 201).

    Raises:
        HTTPException 422: If doc_number generation fails or payload is invalid.
    """
    try:
        quote = await create_quote(db, payload=body, user_id=current_user.userId)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    return SuccessResponse(data=quote, message="Sales Quote created successfully")


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


@router.patch(
    "/{doc_entry}",
    response_model=SuccessResponse[QuoteResponse],
    response_model_by_alias=True,
    summary="Update draft Sales Quote",
)
async def update_quote_endpoint(
    doc_entry: str,
    body: QuoteUpdate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    db=Depends(_get_db),
) -> SuccessResponse[QuoteResponse]:
    """
    Partially update a DRAFT Sales Quote.

    If ``lines`` is provided in the body, the existing line set is replaced
    wholesale and all totals are recomputed.

    Args:
        doc_entry:       UUID of the Sales Quote.
        body:            Partial update payload.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.edit permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping the updated QuoteResponse.

    Raises:
        HTTPException 404: If the quote is not found.
        HTTPException 409: If the quote is not in DRAFT status.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        quote = await update_quote(
            db,
            doc_entry=doc_entry,
            payload=body,
            org_id=org_id,
            user_id=current_user.userId,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )

    if quote is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sales Quote '{doc_entry}' not found",
        )
    return SuccessResponse(data=quote, message="Sales Quote updated")


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


@router.delete(
    "/{doc_entry}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete draft Sales Quote",
)
async def delete_quote_endpoint(
    doc_entry: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.delete")),
    db=Depends(_get_db),
) -> None:
    """
    Hard-delete a DRAFT Sales Quote.

    Only DRAFT quotes may be deleted.  To remove an OPEN quote, cancel it
    first via the /transition endpoint, then the system will record the
    cancellation in the audit trail.

    Args:
        doc_entry:       UUID of the Sales Quote.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.delete permission).
        db:              Motor database dependency.

    Raises:
        HTTPException 404: If the quote is not found.
        HTTPException 409: If the quote is not in DRAFT status.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        deleted = await delete_quote(
            db,
            doc_entry=doc_entry,
            org_id=org_id,
            user_id=current_user.userId,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sales Quote '{doc_entry}' not found",
        )


# ---------------------------------------------------------------------------
# Status transition
# ---------------------------------------------------------------------------


@router.post(
    "/{doc_entry}/transition",
    response_model=SuccessResponse[QuoteResponse],
    response_model_by_alias=True,
    summary="Transition Sales Quote status",
)
async def transition_quote_status(
    doc_entry: str,
    body: QuoteStatusTransitionRequest,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    db=Depends(_get_db),
) -> SuccessResponse[QuoteResponse]:
    """
    Transition a Sales Quote to a new status.

    Legal transitions for QUOTE (from T-100.1 LEGAL_TRANSITIONS):
        DRAFT  → OPEN, CLOSED, CANCELLED
        OPEN   → CLOSED, CANCELLED
        CLOSED → (terminal)
        CANCELLED → (terminal)

    Args:
        doc_entry:       UUID of the Sales Quote.
        body:            Transition request with new_status and optional reason.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.edit permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping the updated QuoteResponse.

    Raises:
        HTTPException 404: If the quote is not found.
        HTTPException 422: If the transition is illegal (e.g. DRAFT → CLOSED
                           is NOT in the QUOTE transition table).

    Note:
        DRAFT → CLOSED is illegal for QUOTE.  The only path to CLOSED from DRAFT
        is DRAFT → OPEN → CLOSED (or DRAFT → CANCELLED).
        Callers attempting DRAFT → CLOSED will receive HTTP 422.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        quote = await transition_status(
            db,
            doc_entry=doc_entry,
            new_status=body.new_status,
            org_id=org_id,
            user_id=current_user.userId,
            reason=body.reason,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    if quote is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sales Quote '{doc_entry}' not found",
        )

    return SuccessResponse(
        data=quote,
        message=f"Sales Quote status updated to '{body.new_status.value}'",
    )
