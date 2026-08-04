"""
Sales Module — Return Note (RTN) API Routes (T-100.11)

Endpoints for the Return Note document lifecycle.

A Return Note records goods physically coming back into stock.  On
DRAFT → OPEN transition it restores inventory and emits a `return_posted`
event so the finance service can post the COGS reversal JE.

NOTE: This file is named returns_v2.py to avoid name collision with the
legacy farm-based returns.py in this same directory.  The router is mounted
at prefix /returns-v2 by the module __init__.py.

Permissions:
    - Read:   any authenticated active user
    - Write:  sales.create / sales.edit roles
    - Delete: sales.delete role

Endpoint set:
    GET    /returns-v2                                       — paginated list
    GET    /returns-v2/{doc_entry}                           — single RTN
    POST   /returns-v2                                       — direct create
    POST   /returns-v2/from-request/{rr_doc_entry}          — create from RR
    PATCH  /returns-v2/{doc_entry}                          — update (DRAFT only)
    DELETE /returns-v2/{doc_entry}                          — hard delete (DRAFT only)
    POST   /returns-v2/{doc_entry}/transition               — status transition

Prefix: /returns-v2 (registered in api/v1/__init__.py)
Full prefix after module registration: /api/v1/sales/returns-v2

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
from ...models.returns import (
    ReturnCreate,
    ReturnFromRequestRequest,
    ReturnListItem,
    ReturnResponse,
    ReturnStatusTransitionRequest,
    ReturnUpdate,
)
from ...services.rtn_service import (
    create_return_direct,
    create_return_from_request,
    delete_return,
    get_return,
    list_returns,
    transition_status,
    update_return,
)
from ...utils.responses import PaginatedResponse, PaginationMeta, SuccessResponse
from src.modules.sales.services.database import sales_db
from src.core.finance.company_resolver import resolve_company_code

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Sales — Returns v2"])


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
    response_model=PaginatedResponse[ReturnListItem],
    response_model_by_alias=True,
    summary="List Return Notes",
    description=(
        "Return a paginated list of Return Notes for the given organisation. "
        "Supports filtering by status, customer_id, and date range."
    ),
)
async def list_returns_endpoint(
    organization_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    customer_id: Optional[str] = Query(None),
    date_from: Optional[date] = Query(
        None, description="Inclusive lower bound on doc_date"
    ),
    date_to: Optional[date] = Query(
        None, description="Inclusive upper bound on doc_date"
    ),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> PaginatedResponse[ReturnListItem]:
    """
    Paginated list of Return Notes for an organisation.

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
        PaginatedResponse containing ReturnListItem objects.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    result = await list_returns(
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
    response_model=SuccessResponse[ReturnResponse],
    response_model_by_alias=True,
    summary="Get Return Note detail",
)
async def get_return_endpoint(
    doc_entry: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> SuccessResponse[ReturnResponse]:
    """
    Retrieve a single Return Note with all embedded lines.

    Args:
        doc_entry:       UUID of the Return Note.
        organization_id: Organisation UUID for scoping (defaults to JWT claim).
        current_user:    Authenticated user.
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping ReturnResponse.

    Raises:
        HTTPException 404: If the Return Note is not found.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    rtn = await get_return(db, doc_entry=doc_entry, org_id=org_id)
    if rtn is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Return Note '{doc_entry}' not found",
        )
    return SuccessResponse(data=rtn)


# ---------------------------------------------------------------------------
# Create — direct (from Delivery, no Return Request)
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=SuccessResponse[ReturnResponse],
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create Return Note (direct)",
    description=(
        "Create a Return Note directly from a Delivery, without a preceding "
        "Return Request.  Use this for ad-hoc returns where RMA authorisation "
        "is not required."
    ),
)
async def create_return_direct_endpoint(
    request: Request,
    body: ReturnCreate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.create")),
    db=Depends(_get_db),
) -> SuccessResponse[ReturnResponse]:
    """
    Create a Return Note directly from a Delivery (no RR).

    The doc_number is generated automatically (prefix "RTN" → "RTN-YYYY-NNNN").
    No inventory changes happen at DRAFT creation — those happen at DRAFT → OPEN.

    Args:
        request:         The incoming HTTP request (used to extract Bearer token).
        body:            Validated ReturnCreate payload.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.create permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping the newly created ReturnResponse (HTTP 201).

    Raises:
        HTTPException 422: If payload validation fails.
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
        rtn = await create_return_direct(
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

    return SuccessResponse(data=rtn, message="Return Note created successfully")


# ---------------------------------------------------------------------------
# Create — from Return Request
# ---------------------------------------------------------------------------


@router.post(
    "/from-request/{rr_doc_entry}",
    response_model=SuccessResponse[ReturnResponse],
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create Return Note from Return Request",
    description=(
        "Create a Return Note from an OPEN Return Request (RMA). "
        "The Return Request must be in 'open' status.  This method allows "
        "partial returns — only the lines and quantities specified in the "
        "request body need be included."
    ),
)
async def create_return_from_request_endpoint(
    request: Request,
    rr_doc_entry: str,
    body: ReturnFromRequestRequest,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.create")),
    db=Depends(_get_db),
) -> SuccessResponse[ReturnResponse]:
    """
    Create a Return Note from a Return Request.

    The RR must be in OPEN status.  Each payload line must reference a line
    on the RR via base_doc_ref.line_id, and the returned_qty must not exceed
    the available qty (requestedQty - consumedQty) on the RR line.

    Args:
        request:         The incoming HTTP request (used to extract Bearer token).
        rr_doc_entry:    UUID of the source Return Request.
        body:            Validated ReturnFromRequestRequest payload.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.create permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping the newly created ReturnResponse (HTTP 201).

    Raises:
        HTTPException 404: If the Return Request is not found.
        HTTPException 422: If RR status is wrong or qty constraints are violated.
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
        rtn = await create_return_from_request(
            db,
            rr_doc_entry=rr_doc_entry,
            payload=body,
            org_id=org_id,
            user_id=current_user.userId,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    return SuccessResponse(
        data=rtn,
        message="Return Note created from Return Request successfully",
    )


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


@router.patch(
    "/{doc_entry}",
    response_model=SuccessResponse[ReturnResponse],
    response_model_by_alias=True,
    summary="Update draft Return Note",
)
async def update_return_endpoint(
    doc_entry: str,
    body: ReturnUpdate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    db=Depends(_get_db),
) -> SuccessResponse[ReturnResponse]:
    """
    Partially update a DRAFT Return Note.

    If ``lines`` is provided in the body, the existing line set is replaced
    wholesale and all totals are recomputed. Only DRAFT Return Notes may
    be updated.

    Args:
        doc_entry:       UUID of the Return Note.
        body:            Partial update payload.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.edit permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping the updated ReturnResponse.

    Raises:
        HTTPException 404: If the Return Note is not found.
        HTTPException 409: If the Return Note is not in DRAFT status.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        rtn = await update_return(
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

    if rtn is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Return Note '{doc_entry}' not found",
        )
    return SuccessResponse(data=rtn, message="Return Note updated successfully")


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


@router.delete(
    "/{doc_entry}",
    response_model=SuccessResponse[None],
    summary="Delete draft Return Note",
)
async def delete_return_endpoint(
    doc_entry: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.delete")),
    db=Depends(_get_db),
) -> SuccessResponse[None]:
    """
    Hard-delete a DRAFT Return Note.

    Only DRAFT Return Notes may be deleted. No inventory changes are needed
    because DRAFT Return Notes have not yet moved any stock.

    Args:
        doc_entry:       UUID of the Return Note.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.delete permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse with None data on success.

    Raises:
        HTTPException 404: If the Return Note is not found.
        HTTPException 409: If the Return Note is not in DRAFT status.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        deleted = await delete_return(
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
            detail=f"Return Note '{doc_entry}' not found",
        )
    return SuccessResponse(data=None, message="Return Note deleted successfully")


# ---------------------------------------------------------------------------
# Status Transition
# ---------------------------------------------------------------------------


@router.post(
    "/{doc_entry}/transition",
    response_model=SuccessResponse[ReturnResponse],
    response_model_by_alias=True,
    summary="Transition Return Note status",
)
async def transition_return_endpoint(
    doc_entry: str,
    body: ReturnStatusTransitionRequest,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    db=Depends(_get_db),
) -> SuccessResponse[ReturnResponse]:
    """
    Transition a Return Note to a new status.

    Valid transitions:
        DRAFT → OPEN       Primary event: restores inventory, emits return_posted.
        DRAFT → CANCELLED  Draft abandoned (no side-effects).
        OPEN  → CLOSED     Terminal close (e.g. Credit Note fully consumed lines).
        OPEN  → CANCELLED  Reversal: un-restores inventory, emits return_cancelled.

    Args:
        doc_entry:       UUID of the Return Note.
        body:            Transition request with new_status and optional reason.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.edit permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping the updated ReturnResponse.

    Raises:
        HTTPException 404: If the Return Note is not found.
        HTTPException 409: If the transition is illegal or validation fails.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        rtn = await transition_status(
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

    if rtn is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Return Note '{doc_entry}' not found",
        )
    return SuccessResponse(
        data=rtn,
        message=f"Return Note transitioned to '{body.new_status.value}'",
    )
