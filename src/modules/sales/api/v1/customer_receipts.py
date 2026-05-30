"""
Sales Module — Customer Receipt API Routes (T-100.10)

Endpoints for the Customer Receipt (IPAY) document lifecycle.

A Customer Receipt records when a customer pays one or more AR Invoices.
It lives on the ops side (same module as Quote/SO/Delivery/AR Invoice) with
an event-driven JE posted by the finance microservice (T-100.10.1).

On DRAFT → OPEN transition:
    - Atomically increments AR Invoice paid_amount for each allocation.
    - Transitions each AR Invoice to PARTLY_CLOSED or CLOSED.
    - Emits customer_payment_received outbox event (finance posts
      DR Bank / CR AR JE in T-100.10.1).

Permissions (mirrors ar_invoices.py pattern):
    - Read:   any authenticated active user
    - Write:  sales.create / sales.edit roles
    - Delete: sales.delete role

Endpoint set:
    GET    /customer-receipts                                paginated list
    GET    /customer-receipts/{doc_entry}                   single receipt
    POST   /customer-receipts                               create with manual allocations
    POST   /customer-receipts/from-invoice/{ar_invoice_doc_entry}  pay one invoice (shortcut)
    PATCH  /customer-receipts/{doc_entry}                   update (DRAFT only)
    DELETE /customer-receipts/{doc_entry}                   hard delete (DRAFT only)
    POST   /customer-receipts/{doc_entry}/transition        status transition

Prefix: /customer-receipts (registered in api/v1/__init__.py)
Full prefix after module registration: /api/v1/sales/customer-receipts

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
from ...models.customer_receipts import (
    CustomerReceiptCreate,
    CustomerReceiptFromInvoiceRequest,
    CustomerReceiptListItem,
    CustomerReceiptResponse,
    CustomerReceiptStatusTransitionRequest,
    CustomerReceiptUpdate,
)
from ...services.customer_receipt_service import (
    create_customer_receipt,
    create_customer_receipt_from_invoice,
    delete_customer_receipt,
    get_customer_receipt,
    list_customer_receipts,
    transition_status,
    update_customer_receipt,
)
from ...utils.responses import PaginatedResponse, PaginationMeta, SuccessResponse
from src.modules.sales.services.database import sales_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Sales — Customer Receipts"])


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
    response_model=PaginatedResponse[CustomerReceiptListItem],
    response_model_by_alias=True,
    summary="List Customer Receipts",
    description=(
        "Return a paginated list of Customer Receipts for the given organisation. "
        "Supports filtering by status, customer_id, and date range."
    ),
)
async def list_customer_receipts_endpoint(
    organization_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    customer_id: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None, description="Inclusive lower bound on doc_date"),
    date_to: Optional[date] = Query(None, description="Inclusive upper bound on doc_date"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> PaginatedResponse[CustomerReceiptListItem]:
    """
    Paginated list of Customer Receipts for an organisation.

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
        PaginatedResponse containing CustomerReceiptListItem objects.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    result = await list_customer_receipts(
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
    response_model=SuccessResponse[CustomerReceiptResponse],
    response_model_by_alias=True,
    summary="Get Customer Receipt detail",
)
async def get_customer_receipt_endpoint(
    doc_entry: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> SuccessResponse[CustomerReceiptResponse]:
    """
    Retrieve a single Customer Receipt with all embedded allocations.

    Args:
        doc_entry:       UUID of the Customer Receipt.
        organization_id: Organisation UUID for scoping (defaults to JWT claim).
        current_user:    Authenticated user.
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping CustomerReceiptResponse.

    Raises:
        HTTPException 404: If the Receipt is not found.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    receipt = await get_customer_receipt(db, doc_entry=doc_entry, org_id=org_id)
    if receipt is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer Receipt '{doc_entry}' not found",
        )
    return SuccessResponse(data=receipt)


# ---------------------------------------------------------------------------
# Create (manual allocations)
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=SuccessResponse[CustomerReceiptResponse],
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create Customer Receipt (manual allocations)",
)
async def create_customer_receipt_endpoint(
    body: CustomerReceiptCreate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.create")),
    db=Depends(_get_db),
) -> SuccessResponse[CustomerReceiptResponse]:
    """
    Create a new Customer Receipt in DRAFT status with manual allocations.

    The caller provides the header and the list of AR Invoice allocations.
    No AR Invoice updates happen at create time — those happen at DRAFT → OPEN.

    Args:
        body:            CustomerReceiptCreate with header + allocations.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.create permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping the newly created CustomerReceiptResponse (HTTP 201).

    Raises:
        HTTPException 404: If any allocation target AR Invoice is not found.
        HTTPException 409: If any allocation target AR Invoice is not in a payable status.
        HTTPException 422: If validation fails (sum mismatch, overpayment, etc.).
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        receipt = await create_customer_receipt(
            db,
            payload=body,
            org_id=org_id,
            user_id=current_user.userId,
        )
    except ValueError as exc:
        err_msg = str(exc)
        if "not found" in err_msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=err_msg)
        if "status is" in err_msg.lower() or "cannot allocate" in err_msg.lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=err_msg)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=err_msg
        )

    return SuccessResponse(data=receipt, message="Customer Receipt created successfully")


# ---------------------------------------------------------------------------
# Create from invoice (shortcut: pay one invoice)
# ---------------------------------------------------------------------------


@router.post(
    "/from-invoice/{ar_invoice_doc_entry}",
    response_model=SuccessResponse[CustomerReceiptResponse],
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create Customer Receipt from a single AR Invoice",
)
async def create_customer_receipt_from_invoice_endpoint(
    ar_invoice_doc_entry: str,
    body: CustomerReceiptFromInvoiceRequest,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.create")),
    db=Depends(_get_db),
) -> SuccessResponse[CustomerReceiptResponse]:
    """
    Shortcut: create a Customer Receipt that pays a single AR Invoice.

    The system uses the invoice's open_amount as the default payment amount.
    The caller can override this with the ``amount`` field to make a partial payment.

    Args:
        ar_invoice_doc_entry: UUID of the AR Invoice to pay.
        body:                 CustomerReceiptFromInvoiceRequest.
        organization_id:      Organisation UUID for scoping.
        current_user:         Authenticated user (must hold sales.create permission).
        db:                   Motor database dependency.

    Returns:
        SuccessResponse wrapping the newly created CustomerReceiptResponse (HTTP 201).

    Raises:
        HTTPException 404: If the AR Invoice is not found.
        HTTPException 409: If the AR Invoice is not in a payable status.
        HTTPException 422: If the requested amount exceeds the invoice open_amount.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        receipt = await create_customer_receipt_from_invoice(
            db,
            ar_invoice_doc_entry=ar_invoice_doc_entry,
            payload=body,
            org_id=org_id,
            user_id=current_user.userId,
        )
    except ValueError as exc:
        err_msg = str(exc)
        if "not found" in err_msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=err_msg)
        if "status is" in err_msg.lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=err_msg)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=err_msg
        )

    return SuccessResponse(
        data=receipt, message="Customer Receipt created from AR Invoice successfully"
    )


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


@router.patch(
    "/{doc_entry}",
    response_model=SuccessResponse[CustomerReceiptResponse],
    response_model_by_alias=True,
    summary="Update draft Customer Receipt",
)
async def update_customer_receipt_endpoint(
    doc_entry: str,
    body: CustomerReceiptUpdate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    db=Depends(_get_db),
) -> SuccessResponse[CustomerReceiptResponse]:
    """
    Partially update a DRAFT Customer Receipt.

    If ``allocations`` is provided in the body, the existing allocation set is replaced
    wholesale and the sum-equals-amount invariant is re-validated.

    Args:
        doc_entry:       UUID of the Customer Receipt.
        body:            Partial update payload.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.edit permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping the updated CustomerReceiptResponse.

    Raises:
        HTTPException 404: If the Receipt is not found.
        HTTPException 409: If the Receipt is not in DRAFT status.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        receipt = await update_customer_receipt(
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

    if receipt is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer Receipt '{doc_entry}' not found",
        )
    return SuccessResponse(data=receipt, message="Customer Receipt updated")


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


@router.delete(
    "/{doc_entry}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete draft Customer Receipt",
)
async def delete_customer_receipt_endpoint(
    doc_entry: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.delete")),
    db=Depends(_get_db),
) -> None:
    """
    Hard-delete a DRAFT Customer Receipt.

    Only DRAFT receipts may be deleted.  No AR Invoice updates are needed
    because DRAFT receipts have not yet incremented paid_amount.

    Args:
        doc_entry:       UUID of the Customer Receipt.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.delete permission).
        db:              Motor database dependency.

    Raises:
        HTTPException 404: If the Receipt is not found.
        HTTPException 409: If the Receipt is not in DRAFT status.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        deleted = await delete_customer_receipt(
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
            detail=f"Customer Receipt '{doc_entry}' not found",
        )


# ---------------------------------------------------------------------------
# Status transition
# ---------------------------------------------------------------------------


@router.post(
    "/{doc_entry}/transition",
    response_model=SuccessResponse[CustomerReceiptResponse],
    response_model_by_alias=True,
    summary="Transition Customer Receipt status",
)
async def transition_customer_receipt_status(
    doc_entry: str,
    body: CustomerReceiptStatusTransitionRequest,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    db=Depends(_get_db),
) -> SuccessResponse[CustomerReceiptResponse]:
    """
    Transition a Customer Receipt to a new status.

    Legal transitions for IPAY (from LEGAL_TRANSITIONS["IPAY"]):
        DRAFT      → OPEN, CANCELLED
        OPEN       → CLOSED
        CLOSED     → (terminal)
        CANCELLED  → (terminal)

    Special transitions (handled as override; not in LEGAL_TRANSITIONS):
        OPEN → CANCELLED — reverses all AR Invoice paid_amount increments and
                           emits customer_payment_cancelled event.

    On DRAFT → OPEN (the payment event):
        - Re-validates each AR Invoice allocation.
        - Atomically increments AR Invoice paid_amount per allocation.
        - Transitions AR Invoices to PARTLY_CLOSED or CLOSED as appropriate.
        - Emits customer_payment_received outbox event.

    Args:
        doc_entry:       UUID of the Customer Receipt.
        body:            Transition request with new_status and optional reason.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.edit permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping the updated CustomerReceiptResponse.

    Raises:
        HTTPException 404: If the Receipt is not found.
        HTTPException 422: If the transition is illegal or AR Invoice validation fails.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        receipt = await transition_status(
            db,
            doc_entry=doc_entry,
            request_body=body,
            org_id=org_id,
            user_id=current_user.userId,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    if receipt is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer Receipt '{doc_entry}' not found",
        )

    return SuccessResponse(
        data=receipt,
        message=f"Customer Receipt status updated to '{body.new_status.value}'",
    )
