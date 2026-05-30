"""
Sales Module — AR Invoice API Routes (T-100.9a)

Endpoints for the AR Invoice (ARI) document lifecycle.

An AR Invoice is the revenue-recognition document in the quote-to-cash chain.
It can be created:
    1. Directly (no Delivery base) — caller provides all header + line data.
    2. From a Posted Delivery Note — inherits customer + dates from Delivery;
       increments Delivery line invoiced_qty on DRAFT creation.

On DRAFT → OPEN transition it:
    - Re-validates revenue accounts per line.
    - Re-validates customer_finance_ext (for T-100.9b arControlAccountId resolution).
    - Emits sales_invoice_posted event to the finance outbox (finance posts the
      AR/Revenue/Output VAT JE in T-100.9b).

Permissions (mirrors deliveries.py pattern):
    - Read:   any authenticated active user
    - Write:  sales.create / sales.edit roles
    - Delete: sales.delete role

Endpoint set:
    GET    /ar-invoices                                   paginated list
    GET    /ar-invoices/{doc_entry}                       single invoice with all lines
    POST   /ar-invoices                                   direct create (DRAFT)
    POST   /ar-invoices/from-delivery/{delivery_doc_entry} from-Delivery create (DRAFT)
    PATCH  /ar-invoices/{doc_entry}                       update (DRAFT only)
    DELETE /ar-invoices/{doc_entry}                       hard delete (DRAFT only)
    POST   /ar-invoices/{doc_entry}/transition            status transition

Prefix: /ar-invoices (registered in api/v1/__init__.py)
Full prefix after module registration: /api/v1/sales/ar-invoices

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
from ...models.ar_invoices import (
    ARInvoiceCreate,
    ARInvoiceFromDeliveryRequest,
    ARInvoiceListItem,
    ARInvoiceResponse,
    ARInvoiceStatusTransitionRequest,
    ARInvoiceUpdate,
)
from ...services.ar_invoice_service import (
    create_ar_invoice,
    create_ar_invoice_from_delivery,
    delete_ar_invoice,
    get_ar_invoice,
    list_ar_invoices,
    transition_status,
    update_ar_invoice,
)
from ...utils.responses import PaginatedResponse, PaginationMeta, SuccessResponse
from src.modules.sales.services.database import sales_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Sales — AR Invoices"])


def _get_db():
    """Dependency: return the shared ops MongoDB database instance."""
    return sales_db.get_database()


def _extract_auth_token(request: Request) -> Optional[str]:
    """
    Extract the raw Bearer token from the Authorization header.

    Used to forward the user's JWT to the finance microservice for
    cross-service lookups (sale_item_finance_ext, customer_finance_ext).

    Args:
        request: The incoming FastAPI Request object.

    Returns:
        The raw token string, or None if not present.
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[len("Bearer "):]
    return None


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
    response_model=PaginatedResponse[ARInvoiceListItem],
    summary="List AR Invoices",
    description=(
        "Return a paginated list of AR Invoices for the given organisation. "
        "Supports filtering by status, customer_id, and date range."
    ),
)
async def list_ar_invoices_endpoint(
    organization_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    customer_id: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None, description="Inclusive lower bound on doc_date"),
    date_to: Optional[date] = Query(None, description="Inclusive upper bound on doc_date"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> PaginatedResponse[ARInvoiceListItem]:
    """
    Paginated list of AR Invoices for an organisation.

    Args:
        organization_id: Organisation UUID (defaults to JWT claim).
        status_filter:   Filter by status value.
        customer_id:     Filter by customer FK.
        date_from:       Inclusive lower bound on docDate.
        date_to:         Inclusive upper bound on docDate.
        page:            1-based page number.
        size:            Items per page (max 200).
        current_user:    Authenticated user.
        db:              Motor database dependency.

    Returns:
        PaginatedResponse containing ARInvoiceListItem objects.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    result = await list_ar_invoices(
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
    response_model=SuccessResponse[ARInvoiceResponse],
    summary="Get AR Invoice detail",
)
async def get_ar_invoice_endpoint(
    doc_entry: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> SuccessResponse[ARInvoiceResponse]:
    """
    Retrieve a single AR Invoice with all embedded lines.

    Args:
        doc_entry:       UUID of the AR Invoice.
        organization_id: Organisation UUID for scoping (defaults to JWT claim).
        current_user:    Authenticated user.
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping ARInvoiceResponse.

    Raises:
        HTTPException 404: If the AR Invoice is not found.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    ari = await get_ar_invoice(db, doc_entry=doc_entry, org_id=org_id)
    if ari is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"AR Invoice '{doc_entry}' not found",
        )
    return SuccessResponse(data=ari)


# ---------------------------------------------------------------------------
# Direct create
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=SuccessResponse[ARInvoiceResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create AR Invoice (direct)",
)
async def create_ar_invoice_endpoint(
    request: Request,
    body: ARInvoiceCreate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.create")),
    db=Depends(_get_db),
) -> SuccessResponse[ARInvoiceResponse]:
    """
    Create a new AR Invoice in DRAFT status (no Delivery base).

    The caller provides all header fields and lines.  Each line item must have
    a configured `sale_item_finance_ext.revenueAccountId` in the finance service —
    the endpoint returns 400 if this is missing.

    organization_id is taken from the query string (canonical source of truth).
    If also provided in the request body it is accepted but ignored.

    On DRAFT → OPEN (via the /transition endpoint):
        - Revenue accounts re-validated.
        - sales_invoice_posted outbox event emitted (finance posts AR JE in T-100.9b).

    Args:
        request:         The incoming HTTP request (used to extract Bearer token).
        body:            ARInvoiceCreate with header + lines.
        organization_id: Organisation UUID for scoping (query string).
        current_user:    Authenticated user (must hold sales.create permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping the newly created ARInvoiceResponse (HTTP 201).

    Raises:
        HTTPException 400: If revenue account missing for any line item.
        HTTPException 422: If validation fails.
    """
    org_id = _resolve_org_id(organization_id, current_user)
    auth_token = _extract_auth_token(request)

    try:
        ari = await create_ar_invoice(
            db,
            payload=body,
            org_id=org_id,
            user_id=current_user.userId,
            auth_token=auth_token,
        )
    except ValueError as exc:
        err_msg = str(exc)
        if "revenueaccountid" in err_msg.lower() or "finance_ext" in err_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=err_msg,
            )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=err_msg,
        )

    return SuccessResponse(data=ari, message="AR Invoice created successfully")


# ---------------------------------------------------------------------------
# Create from Delivery
# ---------------------------------------------------------------------------


@router.post(
    "/from-delivery/{delivery_doc_entry}",
    response_model=SuccessResponse[ARInvoiceResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create AR Invoice from Delivery Note",
)
async def create_ar_invoice_from_delivery_endpoint(
    request: Request,
    delivery_doc_entry: str,
    body: ARInvoiceFromDeliveryRequest,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.create")),
    db=Depends(_get_db),
) -> SuccessResponse[ARInvoiceResponse]:
    """
    Create a new AR Invoice from a Posted (OPEN) Delivery Note.

    The system validates:
        - The Delivery is in OPEN or CLOSED status (COGS must have been posted).
        - Each line in the body references a valid Delivery line ID.
        - Each requested quantity does not exceed the Delivery line open invoice qty.

    On DRAFT creation the Delivery line `invoicedQty` is incremented immediately.
    If the DRAFT invoice is deleted, the qty is released back.

    Args:
        request:            The incoming HTTP request (used to extract Bearer token).
        delivery_doc_entry: UUID of the source Delivery Note.
        body:               ARInvoiceFromDeliveryRequest with header + lines.
        organization_id:    Organisation UUID for scoping (query string).
        current_user:       Authenticated user (must hold sales.create permission).
        db:                 Motor database dependency.

    Returns:
        SuccessResponse wrapping the newly created ARInvoiceResponse (HTTP 201).

    Raises:
        HTTPException 404: If the Delivery is not found.
        HTTPException 409: If the Delivery is not in OPEN or CLOSED status.
        HTTPException 422: If any line qty exceeds the Delivery line open invoice qty.
    """
    org_id = _resolve_org_id(organization_id, current_user)
    auth_token = _extract_auth_token(request)

    try:
        ari = await create_ar_invoice_from_delivery(
            db,
            delivery_doc_entry=delivery_doc_entry,
            payload=body,
            org_id=org_id,
            user_id=current_user.userId,
            auth_token=auth_token,
        )
    except ValueError as exc:
        err_msg = str(exc)
        if "not found" in err_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=err_msg,
            )
        if "status is" in err_msg.lower():
            # Delivery status check — business conflict.
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=err_msg,
            )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=err_msg,
        )

    return SuccessResponse(data=ari, message="AR Invoice created from Delivery successfully")


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


@router.patch(
    "/{doc_entry}",
    response_model=SuccessResponse[ARInvoiceResponse],
    summary="Update draft AR Invoice",
)
async def update_ar_invoice_endpoint(
    request: Request,
    doc_entry: str,
    body: ARInvoiceUpdate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    db=Depends(_get_db),
) -> SuccessResponse[ARInvoiceResponse]:
    """
    Partially update a DRAFT AR Invoice.

    If `lines` is provided in the body, the existing line set is replaced
    wholesale and all amounts are recomputed (including revenue_account_id re-lookup).

    Args:
        request:         The incoming HTTP request (used to extract Bearer token).
        doc_entry:       UUID of the AR Invoice.
        body:            Partial update payload.
        organization_id: Organisation UUID for scoping (query string).
        current_user:    Authenticated user (must hold sales.edit permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping the updated ARInvoiceResponse.

    Raises:
        HTTPException 404: If the AR Invoice is not found.
        HTTPException 409: If the AR Invoice is not in DRAFT status.
    """
    org_id = _resolve_org_id(organization_id, current_user)
    auth_token = _extract_auth_token(request)

    try:
        ari = await update_ar_invoice(
            db,
            doc_entry=doc_entry,
            payload=body,
            org_id=org_id,
            user_id=current_user.userId,
            auth_token=auth_token,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )

    if ari is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"AR Invoice '{doc_entry}' not found",
        )
    return SuccessResponse(data=ari, message="AR Invoice updated")


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


@router.delete(
    "/{doc_entry}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete draft AR Invoice",
)
async def delete_ar_invoice_endpoint(
    doc_entry: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.delete")),
    db=Depends(_get_db),
) -> None:
    """
    Hard-delete a DRAFT AR Invoice.

    Only DRAFT AR Invoices may be deleted.  If the invoice was created from a
    Delivery, the Delivery line invoiced_qty counters are decremented back.

    Args:
        doc_entry:       UUID of the AR Invoice.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.delete permission).
        db:              Motor database dependency.

    Raises:
        HTTPException 404: If the AR Invoice is not found.
        HTTPException 409: If the AR Invoice is not in DRAFT status.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        deleted = await delete_ar_invoice(
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
            detail=f"AR Invoice '{doc_entry}' not found",
        )


# ---------------------------------------------------------------------------
# Status transition
# ---------------------------------------------------------------------------


@router.post(
    "/{doc_entry}/transition",
    response_model=SuccessResponse[ARInvoiceResponse],
    summary="Transition AR Invoice status",
)
async def transition_ar_invoice_status(
    request: Request,
    doc_entry: str,
    body: ARInvoiceStatusTransitionRequest,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    db=Depends(_get_db),
) -> SuccessResponse[ARInvoiceResponse]:
    """
    Transition an AR Invoice to a new status.

    Legal transitions for AR_INVOICE (from LEGAL_TRANSITIONS["AR_INVOICE"]):
        DRAFT           → PENDING_APPROVAL, OPEN
        PENDING_APPROVAL → OPEN, DRAFT
        OPEN            → PARTLY_CLOSED, CLOSED
        PARTLY_CLOSED   → CLOSED

    Special transitions (super_admin override; not in standard table):
        OPEN → CANCELLED — emits sales_invoice_cancelled event; decrements
                           Delivery line invoiced_qty if from-Delivery invoice.

    On DRAFT → OPEN (primary accounting event):
        - Revenue accounts re-validated per line via finance service HTTP call.
        - customer_finance_ext validated (for T-100.9b) via finance service HTTP call.
        - sales_invoice_posted outbox event emitted.

    On OPEN → PARTLY_CLOSED, PARTLY_CLOSED → CLOSED:
        - Status flip only; normally driven by Customer Receipt (T-100.10).
        - Allowed here for super_admin manual mark-paid workflow.

    Args:
        request:         The incoming HTTP request (used to extract Bearer token).
        doc_entry:       UUID of the AR Invoice.
        body:            Transition request with new_status and optional reason.
        organization_id: Organisation UUID for scoping (query string).
        current_user:    Authenticated user (must hold sales.edit permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping the updated ARInvoiceResponse.

    Raises:
        HTTPException 404: If the AR Invoice is not found.
        HTTPException 422: If the transition is illegal.
    """
    org_id = _resolve_org_id(organization_id, current_user)
    auth_token = _extract_auth_token(request)

    try:
        ari = await transition_status(
            db,
            doc_entry=doc_entry,
            request_body=body,
            org_id=org_id,
            user_id=current_user.userId,
            auth_token=auth_token,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    if ari is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"AR Invoice '{doc_entry}' not found",
        )

    return SuccessResponse(
        data=ari,
        message=f"AR Invoice status updated to '{body.new_status.value}'",
    )
