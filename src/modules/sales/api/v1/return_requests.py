"""
Sales Module — Return Request (RR) API Routes (T-100.11)

Endpoints for the Return Request (RMA authorisation) document lifecycle.

A Return Request is a commitment document (no GL impact). It records the
customer's intention to return goods and authorises a Return Note to be
created against it.

Permissions:
    - Read:   any authenticated active user
    - Write:  sales.create / sales.edit roles
    - Delete: sales.delete role

Endpoint set:
    GET    /return-requests                        — paginated list with filters
    GET    /return-requests/{doc_entry}            — single RR with all lines
    POST   /return-requests                        — create (status = DRAFT)
    PATCH  /return-requests/{doc_entry}            — update header/lines (DRAFT only)
    DELETE /return-requests/{doc_entry}            — hard delete (DRAFT only)
    POST   /return-requests/{doc_entry}/transition — status transition

Prefix: /return-requests (registered in api/v1/__init__.py)
Full prefix after module registration: /api/v1/sales/return-requests

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
from ...models.return_requests import (
    ReturnRequestCreate,
    ReturnRequestListItem,
    ReturnRequestResponse,
    ReturnRequestStatusTransitionRequest,
    ReturnRequestUpdate,
)
from ...services.return_request_service import (
    create_return_request,
    delete_return_request,
    get_return_request,
    list_return_requests,
    transition_status,
    update_return_request,
)
from ...utils.responses import PaginatedResponse, PaginationMeta, SuccessResponse
from src.modules.sales.services.database import sales_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Sales — Return Requests"])


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
    response_model=PaginatedResponse[ReturnRequestListItem],
    summary="List Return Requests",
    description=(
        "Return a paginated list of Return Requests (RMAs) for the given "
        "organisation. Supports filtering by status, customer_id, and date range."
    ),
)
async def list_return_requests_endpoint(
    organization_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    customer_id: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None, description="Inclusive lower bound on doc_date"),
    date_to: Optional[date] = Query(None, description="Inclusive upper bound on doc_date"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> PaginatedResponse[ReturnRequestListItem]:
    """
    Paginated list of Return Requests for an organisation.

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
        PaginatedResponse containing ReturnRequestListItem objects.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    result = await list_return_requests(
        db,
        org_id=org_id,
        customer_id=customer_id,
        status=status_filter,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=size,
    )

    return PaginatedResponse(
        data=result["items"],
        meta=PaginationMeta(
            total=result["total"],
            page=result["page"],
            perPage=result["page_size"],
            totalPages=result["total_pages"],
        ),
    )


# ---------------------------------------------------------------------------
# Get
# ---------------------------------------------------------------------------


@router.get(
    "/{doc_entry}",
    response_model=SuccessResponse[ReturnRequestResponse],
    summary="Get Return Request detail",
)
async def get_return_request_endpoint(
    doc_entry: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> SuccessResponse[ReturnRequestResponse]:
    """
    Retrieve a single Return Request with all embedded lines.

    Args:
        doc_entry:       UUID of the Return Request.
        organization_id: Organisation UUID for scoping (defaults to JWT claim).
        current_user:    Authenticated user.
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping ReturnRequestResponse.

    Raises:
        HTTPException 404: If the Return Request is not found.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    rr = await get_return_request(db, doc_entry=doc_entry, org_id=org_id)
    if rr is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Return Request '{doc_entry}' not found",
        )
    return SuccessResponse(data=rr)


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=SuccessResponse[ReturnRequestResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create Return Request",
)
async def create_return_request_endpoint(
    body: ReturnRequestCreate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.create")),
    db=Depends(_get_db),
) -> SuccessResponse[ReturnRequestResponse]:
    """
    Create a new Return Request (RMA authorisation) in DRAFT status.

    The doc_number is generated automatically (prefix "RR" → "RR-YYYY-NNNN").
    No GL impact at any stage — this is a commitment document only.

    Args:
        body:            Validated ReturnRequestCreate payload.
        organization_id: Organisation UUID for scoping (defaults to JWT claim).
        current_user:    Authenticated user (must hold sales.create permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping the newly created ReturnRequestResponse (HTTP 201).

    Raises:
        HTTPException 422: If payload validation fails.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        rr = await create_return_request(
            db,
            payload=body,
            org_id=org_id,
            user_id=current_user.userId,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    return SuccessResponse(data=rr, message="Return Request created successfully")


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


@router.patch(
    "/{doc_entry}",
    response_model=SuccessResponse[ReturnRequestResponse],
    summary="Update draft Return Request",
)
async def update_return_request_endpoint(
    doc_entry: str,
    body: ReturnRequestUpdate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    db=Depends(_get_db),
) -> SuccessResponse[ReturnRequestResponse]:
    """
    Partially update a DRAFT Return Request.

    If ``lines`` is provided in the body, the existing line set is replaced
    wholesale and all totals are recomputed. Only DRAFT Return Requests may
    be updated.

    Args:
        doc_entry:       UUID of the Return Request.
        body:            Partial update payload.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.edit permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping the updated ReturnRequestResponse.

    Raises:
        HTTPException 404: If the Return Request is not found.
        HTTPException 409: If the Return Request is not in DRAFT status.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        rr = await update_return_request(
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

    if rr is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Return Request '{doc_entry}' not found",
        )
    return SuccessResponse(data=rr, message="Return Request updated successfully")


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


@router.delete(
    "/{doc_entry}",
    response_model=SuccessResponse[None],
    summary="Delete draft Return Request",
)
async def delete_return_request_endpoint(
    doc_entry: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.delete")),
    db=Depends(_get_db),
) -> SuccessResponse[None]:
    """
    Hard-delete a DRAFT Return Request.

    Only DRAFT Return Requests may be deleted.

    Args:
        doc_entry:       UUID of the Return Request.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.delete permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse with None data on success.

    Raises:
        HTTPException 404: If the Return Request is not found.
        HTTPException 409: If the Return Request is not in DRAFT status.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        deleted = await delete_return_request(
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
            detail=f"Return Request '{doc_entry}' not found",
        )
    return SuccessResponse(data=None, message="Return Request deleted successfully")


# ---------------------------------------------------------------------------
# Status Transition
# ---------------------------------------------------------------------------


@router.post(
    "/{doc_entry}/transition",
    response_model=SuccessResponse[ReturnRequestResponse],
    summary="Transition Return Request status",
)
async def transition_return_request_endpoint(
    doc_entry: str,
    body: ReturnRequestStatusTransitionRequest,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    db=Depends(_get_db),
) -> SuccessResponse[ReturnRequestResponse]:
    """
    Transition a Return Request to a new status.

    Valid transitions:
        DRAFT  → OPEN       (RMA authorised — Return Notes can now be created)
        DRAFT  → CANCELLED  (draft abandoned)
        OPEN   → CLOSED     (fully consumed by Return Notes)
        OPEN   → CANCELLED  (RMA revoked before any Return Notes were created)

    Args:
        doc_entry:       UUID of the Return Request.
        body:            Transition request with new_status and optional reason.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.edit permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping the updated ReturnRequestResponse.

    Raises:
        HTTPException 404: If the Return Request is not found.
        HTTPException 409: If the transition is illegal.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        rr = await transition_status(
            db,
            doc_entry=doc_entry,
            request_body=body,
            org_id=org_id,
            user_id=current_user.userId,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )

    if rr is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Return Request '{doc_entry}' not found",
        )
    return SuccessResponse(
        data=rr,
        message=f"Return Request transitioned to '{body.new_status.value}'",
    )
