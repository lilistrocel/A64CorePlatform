"""
Sales Module — Sales Order (SO) API Routes — v2

Endpoints for the Sales Order (SO) document lifecycle.

This file uses the ``/orders-v2`` prefix to avoid colliding with the legacy
``/orders`` route owned by ``orders.py`` (which serves the old ``sales_orders``
MongoDB collection used by the existing dashboard).  The ``-v2`` suffix is
temporary — when the legacy module is deprecated in a future task, this router
should be re-prefixed to bare ``/orders``.  See T-100.7.2 (follow-up task).

Permissions (mirrors quotes.py pattern):
  - Read:   any authenticated active user
  - Write:  sales.create / sales.edit roles
  - Delete: sales.delete role

Endpoint set:
  GET    /orders-v2                               — paginated list with filters
  GET    /orders-v2/{doc_entry}                   — single SO with all lines
  POST   /orders-v2                               — create from scratch (DRAFT)
  POST   /orders-v2/from-quote/{quote_doc_entry}  — create from Quote (DRAFT)
  PATCH  /orders-v2/{doc_entry}                   — update header/lines (DRAFT only)
  DELETE /orders-v2/{doc_entry}                   — hard delete (DRAFT only)
  POST   /orders-v2/{doc_entry}/transition        — status transition

All endpoints require organisation_id, resolved from query param or JWT.
"""

import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from ...middleware.auth import (
    CurrentUser,
    get_current_active_user,
    require_permission,
)
from ...models.sales_orders import (
    SalesOrderCreate,
    SalesOrderFromQuoteRequest,
    SalesOrderListItem,
    SalesOrderResponse,
    SalesOrderStatusTransitionRequest,
    SalesOrderUpdate,
)
from ...services.sales_order_service import (
    create_sales_order,
    create_sales_order_from_quote,
    delete_sales_order,
    get_sales_order,
    list_sales_orders,
    transition_status,
    update_sales_order,
)
from ...utils.responses import PaginatedResponse, PaginationMeta, SuccessResponse
from src.modules.sales.services.database import sales_db
from src.core.finance.company_resolver import resolve_company_code

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Sales — Orders v2"])


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


def _extract_auth_token(request: Request) -> Optional[str]:
    """Extract the raw Bearer token from the Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[len("Bearer ") :]
    return None


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=PaginatedResponse[SalesOrderListItem],
    response_model_by_alias=True,
    summary="List Sales Orders (v2)",
    description=(
        "Return a paginated list of Sales Orders (v2) for the given organisation. "
        "Supports filtering by status, customer_id, date range, has_open_lines, and "
        "has_service_open_lines. "
        "Note: has_service_open_lines is applied post-pagination (requires per-item "
        "HTTP calls to the finance microservice to classify isStock); the returned "
        "page may contain fewer items than the requested page size when this filter "
        "is active."
    ),
)
async def list_sales_orders_endpoint(
    request: Request,
    organization_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    customer_id: Optional[str] = Query(None),
    date_from: Optional[date] = Query(
        None, description="Inclusive lower bound on doc_date"
    ),
    date_to: Optional[date] = Query(
        None, description="Inclusive upper bound on doc_date"
    ),
    has_open_lines: Optional[bool] = Query(
        None, description="Filter to SOs with open qty"
    ),
    has_service_open_lines: Optional[bool] = Query(
        None,
        alias="hasServiceOpenLines",
        description=(
            "When True, filter to only Sales Orders that have at least one service "
            "line with service_open_invoice_qty > 0. Computed via isStock HTTP calls "
            "to the finance microservice. Used by SalesOrdersV2Page's "
            "'Has Service Open Qty' filter chip. "
            "Known limitation: applied post-pagination; pages may be shorter than "
            "the requested size when active."
        ),
    ),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> PaginatedResponse[SalesOrderListItem]:
    """
    Paginated list of Sales Orders for an organisation.

    Args:
        request:                  Incoming HTTP request (for Bearer token extraction).
        organization_id:          Organisation UUID (defaults to JWT claim).
        status_filter:            Filter by status value (draft, open, partly_closed,
                                  closed, cancelled).
        customer_id:              Filter by customer FK.
        date_from:                Inclusive lower bound on docDate.
        date_to:                  Inclusive upper bound on docDate.
        has_open_lines:           When True, filter to SOs with open lines.
        has_service_open_lines:   When True, filter to SOs with service_open_invoice_qty > 0.
                                  Computed via finance microservice HTTP calls. Post-pagination.
        page:                     1-based page number.
        size:                     Items per page (max 200).
        current_user:             Authenticated user.
        db:                       Motor database dependency.

    Returns:
        PaginatedResponse containing SalesOrderListItem objects.
    """
    org_id = _resolve_org_id(organization_id, current_user)
    auth_token = _extract_auth_token(request)

    result = await list_sales_orders(
        db,
        org_id=org_id,
        status=status_filter,
        customer_id=customer_id,
        date_from=date_from,
        date_to=date_to,
        has_open_lines=has_open_lines,
        has_service_open_lines=has_service_open_lines,
        page=page,
        size=size,
        auth_token=auth_token,
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
    response_model=SuccessResponse[SalesOrderResponse],
    response_model_by_alias=True,
    summary="Get Sales Order detail (v2)",
)
async def get_sales_order_endpoint(
    doc_entry: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> SuccessResponse[SalesOrderResponse]:
    """
    Retrieve a single Sales Order with all embedded lines.

    Args:
        doc_entry:       UUID of the Sales Order.
        organization_id: Organisation UUID for scoping (defaults to JWT claim).
        current_user:    Authenticated user.
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping SalesOrderResponse.

    Raises:
        HTTPException 404: If the SO is not found.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    so = await get_sales_order(db, doc_entry=doc_entry, org_id=org_id)
    if so is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sales Order '{doc_entry}' not found",
        )
    return SuccessResponse(data=so)


# ---------------------------------------------------------------------------
# Create from scratch
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=SuccessResponse[SalesOrderResponse],
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create Sales Order (v2)",
)
async def create_sales_order_endpoint(
    request: Request,
    body: SalesOrderCreate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.create")),
    db=Depends(_get_db),
) -> SuccessResponse[SalesOrderResponse]:
    """
    Create a new Sales Order from scratch in DRAFT status.

    The doc_number is generated automatically (prefix "SO" → "SO-YYYY-NNNN").

    Args:
        request:         The incoming HTTP request (used to extract Bearer token).
        body:            Validated SalesOrderCreate payload.
        organization_id: Organisation UUID for scoping (query string).
        current_user:    Authenticated user (must hold sales.create permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping the newly created SalesOrderResponse (HTTP 201).
    """
    org_id = _resolve_org_id(organization_id, current_user)

    # Reason: resolve companyCode from finance service — no hardcoded default.
    if not body.company_code:
        resolved = await resolve_company_code(
            organization_id=org_id,
            auth_token=_extract_auth_token(request),
        )
        body = body.model_copy(update={"company_code": resolved})

    try:
        so = await create_sales_order(db, payload=body, user_id=current_user.userId)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    return SuccessResponse(data=so, message="Sales Order created successfully")


# ---------------------------------------------------------------------------
# Create from Quote
# ---------------------------------------------------------------------------


@router.post(
    "/from-quote/{quote_doc_entry}",
    response_model=SuccessResponse[SalesOrderResponse],
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create Sales Order from Quote (v2)",
)
async def create_sales_order_from_quote_endpoint(
    quote_doc_entry: str,
    body: SalesOrderFromQuoteRequest,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.create")),
    db=Depends(_get_db),
) -> SuccessResponse[SalesOrderResponse]:
    """
    Create a new Sales Order by copying from an existing Sales Quote.

    The SO is created in DRAFT status.  All Quote lines are copied into SO lines
    (consuming their remaining open_qty).  The Quote's consumed_qty is updated
    atomically; the Quote is auto-closed if all its lines are now fully consumed.

    Args:
        quote_doc_entry: UUID of the source Sales Quote.
        body:            Optional overrides (delivery_date, notes).
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.create permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping the newly created SalesOrderResponse (HTTP 201).

    Raises:
        HTTPException 404: If the Quote is not found.
        HTTPException 409: If the Quote is in a non-open state or all lines are consumed.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        so = await create_sales_order_from_quote(
            db,
            quote_doc_entry=quote_doc_entry,
            payload=body,
            org_id=org_id,
            user_id=current_user.userId,
        )
    except ValueError as exc:
        err_msg = str(exc)
        if "not found" in err_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=err_msg,
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=err_msg,
        )

    return SuccessResponse(
        data=so, message="Sales Order created from Quote successfully"
    )


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


@router.patch(
    "/{doc_entry}",
    response_model=SuccessResponse[SalesOrderResponse],
    response_model_by_alias=True,
    summary="Update draft Sales Order (v2)",
)
async def update_sales_order_endpoint(
    doc_entry: str,
    body: SalesOrderUpdate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    db=Depends(_get_db),
) -> SuccessResponse[SalesOrderResponse]:
    """
    Partially update a DRAFT Sales Order.

    If ``lines`` is provided in the body, the existing line set is replaced
    wholesale and all totals are recomputed.

    Args:
        doc_entry:       UUID of the Sales Order.
        body:            Partial update payload.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.edit permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping the updated SalesOrderResponse.

    Raises:
        HTTPException 404: If the SO is not found.
        HTTPException 409: If the SO is not in DRAFT status.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        so = await update_sales_order(
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

    if so is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sales Order '{doc_entry}' not found",
        )
    return SuccessResponse(data=so, message="Sales Order updated")


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


@router.delete(
    "/{doc_entry}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete draft Sales Order (v2)",
)
async def delete_sales_order_endpoint(
    doc_entry: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.delete")),
    db=Depends(_get_db),
) -> None:
    """
    Hard-delete a DRAFT Sales Order.

    Only DRAFT SOs may be deleted.  If the SO was created from a Quote, the
    Quote's consumed_qty is restored before deletion.

    Args:
        doc_entry:       UUID of the Sales Order.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.delete permission).
        db:              Motor database dependency.

    Raises:
        HTTPException 404: If the SO is not found.
        HTTPException 409: If the SO is not in DRAFT status.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        deleted = await delete_sales_order(
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
            detail=f"Sales Order '{doc_entry}' not found",
        )


# ---------------------------------------------------------------------------
# Status transition
# ---------------------------------------------------------------------------


@router.post(
    "/{doc_entry}/transition",
    response_model=SuccessResponse[SalesOrderResponse],
    response_model_by_alias=True,
    summary="Transition Sales Order status (v2)",
)
async def transition_sales_order_status(
    doc_entry: str,
    body: SalesOrderStatusTransitionRequest,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    db=Depends(_get_db),
) -> SuccessResponse[SalesOrderResponse]:
    """
    Transition a Sales Order to a new status.

    Legal transitions for SO (from T-100.1 LEGAL_TRANSITIONS):
        DRAFT        → OPEN, CANCELLED
        OPEN         → PARTLY_CLOSED, CLOSED, CANCELLED
        PARTLY_CLOSED → CLOSED, CANCELLED
        CLOSED        → (terminal)
        CANCELLED     → (terminal)

    On DRAFT → OPEN:
      - Credit-limit check runs against the finance microservice.
      - If credit is blocked and ``override_credit_check=True`` with a
        super_admin / finance_admin role, the transition proceeds with
        ``credit_check.result = 'override'``.
      - If credit is blocked and override is not authorised → HTTP 409.

    On → CANCELLED:
      - committed_qty is cleared on all lines.
      - If the SO was created from a Quote, the Quote's consumed_qty is
        restored and the Quote may be reopened if it was auto-closed.

    On → CLOSED:
      - Rejected if any line has open_qty > 0 → HTTP 422.

    Args:
        doc_entry:       UUID of the Sales Order.
        body:            Transition request with new_status and optional fields.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.edit permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping the updated SalesOrderResponse.

    Raises:
        HTTPException 404: If the SO is not found.
        HTTPException 409: If credit limit is blocked (without override).
        HTTPException 422: If the transition is illegal or CLOSED with open lines.
        HTTPException 403: If credit override is requested without admin role.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        so = await transition_status(
            db,
            doc_entry=doc_entry,
            request_body=body,
            org_id=org_id,
            user_id=current_user.userId,
            user_role=current_user.role,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        )
    except ValueError as exc:
        err_msg = str(exc)
        # Reason: credit-block is a business rejection (409), illegal transition
        # is a protocol error (422).  Distinguish by content.
        if "credit limit" in err_msg.lower() or "blocked" in err_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=err_msg,
            )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=err_msg,
        )

    if so is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sales Order '{doc_entry}' not found",
        )

    return SuccessResponse(
        data=so,
        message=f"Sales Order status updated to '{body.new_status.value}'",
    )
