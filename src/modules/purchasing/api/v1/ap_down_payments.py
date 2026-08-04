"""
Purchasing Module — AP Down Payment Invoice API (T-200.24 / Wave 4)

CRUD + state transitions for AP Down Payment Invoice (DPI) documents.

An AP Down Payment Invoice is a vendor prepayment vehicle.  It is created when
a vendor demands payment before delivering goods/services (deposits on custom
orders, big-ticket items, advance retainers).  Future AP Invoices net against
the DPI's outstanding balance; consumed amount is tracked; the DPI auto-closes
when fully netted.

DPI is a STANDALONE document — it does NOT chain from a PR/PO.

State machine (AP_DPI in document_status.py):
  Draft → Pending Approval → Open (posted) → Partly Closed / Closed
  Pending Approval → Draft  (rejection / withdraw)
  Open/Partly Closed → Cancelled

On PENDING_APPROVAL → OPEN posting:
  ap_down_payment_posted outbox event emitted for finance JE booking.
  (Finance handler: DR Prepaid Asset / CR AP / Cash — wired in follow-up ticket)

Outstanding endpoint:
  GET /ap-down-payments/outstanding — convenience endpoint returning DPIs with
  outstanding_amount > 0, optionally filtered by vendor_id. Used by the AP Invoice
  form to populate the DPI allocation picker.

Permissions:
  - Read:   procurement_officer, procurement_manager, admin, super_admin,
            accountant, finance_admin
  - Write:  procurement_officer, procurement_manager, admin, super_admin,
            accountant, finance_admin
  - Delete: super_admin only (DRAFT deletion)
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from ...middleware.auth import (
    CurrentUser,
    get_current_active_user,
)
from ...models.document import (
    APDownPaymentCreate,
    APDownPaymentListItem,
    APDownPaymentResponse,
    APDownPaymentStatusTransitionRequest,
    APDownPaymentUpdate,
)
from ...services.ap_down_payment_service import (
    create_ap_down_payment,
    delete_ap_down_payment,
    get_ap_down_payment,
    list_ap_down_payments,
    transition_status,
    update_ap_down_payment,
)
from src.modules.farm_manager.utils.responses import (
    PaginatedResponse,
    PaginationMeta,
    SuccessResponse,
)
from src.modules.farm_manager.services.database import farm_db
from src.core.finance.company_resolver import resolve_company_code

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Purchasing — AP Down Payment Invoices"])

# ---------------------------------------------------------------------------
# Role sets
# ---------------------------------------------------------------------------

_DPI_WRITE_ROLES = frozenset(
    {
        "procurement_officer",
        "procurement_manager",
        "admin",
        "super_admin",
        "accountant",
        "finance_admin",
    }
)

_DPI_DELETE_ROLES = frozenset({"super_admin"})


def _require_dpi_write(current_user: CurrentUser) -> None:
    """
    Raise HTTPException 403 if the user cannot create/update DPIs.

    Args:
        current_user: Authenticated user object from JWT.

    Raises:
        HTTPException: 403 if role not in _DPI_WRITE_ROLES.
    """
    if current_user.role not in _DPI_WRITE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Permission denied: procurement_officer, accountant, or "
                "finance_admin role required"
            ),
        )


def _require_dpi_delete(current_user: CurrentUser) -> None:
    """
    Raise HTTPException 403 if the user cannot delete DPIs.

    Only super_admin can hard-delete Draft DPIs.

    Args:
        current_user: Authenticated user object from JWT.

    Raises:
        HTTPException: 403 if role not in _DPI_DELETE_ROLES.
    """
    if current_user.role not in _DPI_DELETE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: super_admin role required to delete AP Down Payment Invoices",
        )


def _get_db():
    """Dependency: return the Motor database instance."""
    return farm_db.get_database()


def _get_org_id(
    organization_id: Optional[str],
    current_user: CurrentUser,
) -> str:
    """Resolve organisation ID from query param or JWT."""
    org_id = organization_id or current_user.organizationId
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="organization_id is required",
        )
    return org_id


def _extract_token(request: Request) -> Optional[str]:
    """Extract the raw Bearer token from the Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[len("Bearer ") :]
    return None


# ---------------------------------------------------------------------------
# Outstanding DPIs convenience endpoint (must be registered BEFORE /{doc_id})
# ---------------------------------------------------------------------------


@router.get(
    "/ap-down-payments/outstanding",
    response_model=PaginatedResponse[APDownPaymentListItem],
    summary="List DPIs with outstanding balance (allocation picker)",
)
async def list_outstanding_dpis(
    organization_id: Optional[str] = Query(None),
    vendor_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> PaginatedResponse[APDownPaymentListItem]:
    """
    Convenience endpoint: returns DPIs with outstanding_amount > 0.

    Used by the AP Invoice creation form to populate the DPI allocation picker,
    showing which prepayments can be netted against a new AP Invoice.

    Results are filtered to OPEN and PARTLY_CLOSED DPIs only (only posted DPIs
    can have their balance allocated).

    Args:
        organization_id: Override org.
        vendor_id:       Optional filter by vendor UUID (strongly recommended
                         for the AP Invoice form to narrow to the current vendor).
        page:            Page number (1-based).
        page_size:       Items per page (max 200).
        current_user:    Authenticated user.
        db:              Motor database dependency.

    Returns:
        Paginated list of DPIs with outstanding balance > 0.
    """
    org_id = _get_org_id(organization_id, current_user)
    result = await list_ap_down_payments(
        db,
        org_id,
        vendor_id=vendor_id,
        has_outstanding=True,
        page=page,
        page_size=page_size,
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
# List + Create
# ---------------------------------------------------------------------------


@router.get(
    "/ap-down-payments",
    response_model=PaginatedResponse[APDownPaymentListItem],
    summary="List AP Down Payment Invoices",
)
async def list_dpis(
    organization_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    status_filter: Optional[str] = Query(None, alias="status"),
    vendor_id: Optional[str] = Query(None),
    has_outstanding: Optional[bool] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> PaginatedResponse[APDownPaymentListItem]:
    """
    Paginated list of AP Down Payment Invoices.

    Args:
        organization_id: Override org.
        page:            Page number (1-based).
        page_size:       Items per page (max 200).
        status_filter:   Filter by status string.
        vendor_id:       Filter by vendorId.
        has_outstanding: When true, return only DPIs with outstanding balance > 0.
        current_user:    Authenticated user.
        db:              Motor database dependency.

    Returns:
        Paginated AP Down Payment Invoice list.
    """
    org_id = _get_org_id(organization_id, current_user)
    result = await list_ap_down_payments(
        db,
        org_id,
        vendor_id=vendor_id,
        status=status_filter,
        has_outstanding=has_outstanding,
        page=page,
        page_size=page_size,
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


@router.post(
    "/ap-down-payments",
    response_model=SuccessResponse[APDownPaymentResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create AP Down Payment Invoice",
)
async def create_dpi(
    request: Request,
    body: APDownPaymentCreate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> SuccessResponse[APDownPaymentResponse]:
    """
    Create a Draft AP Down Payment Invoice.

    A DPI is a STANDALONE document — it does not chain from a PR or PO.
    Use it to record a vendor deposit demand before goods/services are delivered.

    The DPI starts in DRAFT status and must be submitted for approval
    (DRAFT → PENDING_APPROVAL → OPEN) before it can be allocated against
    AP Invoices.

    Args:
        request:         Incoming HTTP request (Bearer token for company resolver).
        body:            DPI creation payload.
        organization_id: Override org.
        current_user:    Authenticated user (must have DPI write role).
        db:              Motor database dependency.

    Returns:
        Created APDownPaymentResponse (status: draft).

    Raises:
        HTTPException 400: If company code cannot be resolved.
        HTTPException 422: Validation error.
    """
    _require_dpi_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    # Reason: resolve companyCode from finance service — no hardcoded default.
    if not body.company_code:
        company_code = await resolve_company_code(
            organization_id=org_id,
            auth_token=_extract_token(request),
        )
        body = body.model_copy(update={"company_code": company_code})

    try:
        dpi = await create_ap_down_payment(
            db=db,
            payload=body,
            org_id=org_id,
            user_id=current_user.userId,
            auth_token=_extract_token(request),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )

    return SuccessResponse(
        data=dpi, message="AP Down Payment Invoice created successfully"
    )


# ---------------------------------------------------------------------------
# Get / Update / Delete
# ---------------------------------------------------------------------------


@router.get(
    "/ap-down-payments/{doc_id}",
    response_model=SuccessResponse[APDownPaymentResponse],
    summary="Get AP Down Payment Invoice detail",
)
async def get_dpi(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> SuccessResponse[APDownPaymentResponse]:
    """
    Retrieve a single AP Down Payment Invoice with all embedded lines.

    The response includes computed ``totals.outstanding_amount`` = gross - consumed_amount.

    Args:
        doc_id:          DPI UUID string.
        organization_id: Override org.
        current_user:    Authenticated user.
        db:              Motor database dependency.

    Returns:
        APDownPaymentResponse.

    Raises:
        HTTPException 404: If DPI not found.
    """
    org_id = _get_org_id(organization_id, current_user)
    dpi = await get_ap_down_payment(db=db, doc_id=doc_id, org_id=org_id)
    if dpi is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"AP Down Payment Invoice '{doc_id}' not found",
        )
    return SuccessResponse(data=dpi)


@router.patch(
    "/ap-down-payments/{doc_id}",
    response_model=SuccessResponse[APDownPaymentResponse],
    summary="Update Draft AP Down Payment Invoice",
)
async def update_dpi(
    doc_id: str,
    body: APDownPaymentUpdate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> SuccessResponse[APDownPaymentResponse]:
    """
    Partially update a Draft AP Down Payment Invoice.

    vendor and companyCode are immutable after creation.
    Lines, when supplied, replace the current set wholesale.

    Args:
        doc_id:          DPI UUID string.
        body:            Partial update payload.
        organization_id: Override org.
        current_user:    Authenticated user (must have DPI write role).
        db:              Motor database dependency.

    Returns:
        Updated APDownPaymentResponse.

    Raises:
        HTTPException 409: If DPI is not in Draft status.
        HTTPException 404: If not found.
    """
    _require_dpi_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        dpi = await update_ap_down_payment(
            db=db,
            doc_id=doc_id,
            payload=body,
            org_id=org_id,
            user_id=current_user.userId,
        )
    except ValueError as exc:
        detail = str(exc)
        if "cannot be updated" in detail:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail
        )

    if dpi is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"AP Down Payment Invoice '{doc_id}' not found",
        )
    return SuccessResponse(data=dpi, message="AP Down Payment Invoice updated")


@router.delete(
    "/ap-down-payments/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Hard-delete Draft AP Down Payment Invoice (super_admin only)",
)
async def delete_dpi(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> None:
    """
    Hard-delete a Draft AP Down Payment Invoice.

    Only Draft DPIs may be deleted.  Posted (OPEN/CLOSED) DPIs are
    immutable per accounting immutability rules.

    Only super_admin can delete DPIs — the action is irreversible.

    Args:
        doc_id:          DPI UUID string.
        organization_id: Override org.
        current_user:    Authenticated user (must be super_admin).
        db:              Motor database dependency.

    Raises:
        HTTPException 403: If not super_admin.
        HTTPException 409: If DPI is not in Draft status.
        HTTPException 404: If not found.
    """
    _require_dpi_delete(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        deleted = await delete_ap_down_payment(
            db=db,
            doc_id=doc_id,
            org_id=org_id,
            user_id=current_user.userId,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"AP Down Payment Invoice '{doc_id}' not found",
        )


# ---------------------------------------------------------------------------
# State transitions
# ---------------------------------------------------------------------------


@router.patch(
    "/ap-down-payments/{doc_id}/status",
    response_model=SuccessResponse[APDownPaymentResponse],
    summary="Transition AP Down Payment Invoice status",
)
async def transition_dpi_status(
    doc_id: str,
    body: APDownPaymentStatusTransitionRequest,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> SuccessResponse[APDownPaymentResponse]:
    """
    Transition an AP Down Payment Invoice to a new status.

    Legal transitions (see AP_DPI in document_status.py):
      - draft            → pending_approval   (submit for approval)
      - pending_approval → open               (approve and post — financial event)
      - pending_approval → draft              (reject / withdraw)
      - open             → partly_closed      (partial DPI consumption — usually auto)
      - open/partly_closed → closed           (full consumption — usually auto)
      - open/partly_closed → cancelled        (void the prepayment)

    The PENDING_APPROVAL → OPEN transition is the financial posting event:
      - ap_down_payment_posted outbox event is emitted for finance JE booking.

    Args:
        doc_id:          DPI UUID string.
        body:            Transition request with target_status and optional notes.
        organization_id: Override org.
        current_user:    Authenticated user (must have DPI write role).
        db:              Motor database dependency.

    Returns:
        Updated APDownPaymentResponse.

    Raises:
        HTTPException 409: If the transition is illegal.
        HTTPException 404: If not found.
    """
    _require_dpi_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        dpi = await transition_status(
            db=db,
            doc_id=doc_id,
            request_body=body,
            org_id=org_id,
            user_id=current_user.userId,
        )
    except ValueError as exc:
        detail = str(exc)
        code = (
            status.HTTP_404_NOT_FOUND
            if "not found" in detail.lower()
            else status.HTTP_409_CONFLICT
        )
        raise HTTPException(status_code=code, detail=detail)

    if dpi is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"AP Down Payment Invoice '{doc_id}' not found",
        )
    return SuccessResponse(
        data=dpi,
        message=f"AP Down Payment Invoice transitioned to {body.target_status}",
    )
