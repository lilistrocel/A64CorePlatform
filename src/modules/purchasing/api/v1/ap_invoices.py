"""
Purchasing Module — AP Invoice API (Phase C.1)

CRUD + state transitions for AP (vendor) Invoice documents.

An AP Invoice is created from a Posted GR and captures the vendor's invoice
details.  On approval the ap_invoice_posted outbox event is emitted which the
finance service uses to post the second JE of the P2P cycle:
  DR GR/IR Clearing + DR Input VAT + DR Purchase Price Variance (if any)
  CR AP Control Account

State machine:
  Draft → Pending Approval → Approved (terminal in v1)
                           → Rejected (terminal in v1)
  Pending Approval → Draft (withdraw)

Permissions:
  - Read:   procurement_officer, procurement_manager, admin, super_admin,
            accountant, finance_admin
  - Write:  procurement_officer, procurement_manager, admin, super_admin,
            accountant, finance_admin   ← note: accountant added for AP ownership
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ...middleware.auth import (
    CurrentUser,
    get_current_active_user,
)
from ...models.document import (
    APCreate,
    APDetailResponse,
    APFromGRCreate,
    APResponse,
    APUpdate,
    ApproveRejectBody,
    RejectBody,
)
from ...services.document_service import DocumentService
from src.modules.farm_manager.utils.responses import (
    PaginatedResponse,
    PaginationMeta,
    SuccessResponse,
)
from src.modules.farm_manager.services.database import farm_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Purchasing — AP Invoices"])

# ---------------------------------------------------------------------------
# AP Invoice write-role set (expanded to include accountant and finance_admin)
# ---------------------------------------------------------------------------

_AP_WRITE_ROLES = frozenset({
    "procurement_officer",
    "procurement_manager",
    "admin",
    "super_admin",
    "accountant",
    "finance_admin",
})


def _require_ap_write(current_user: CurrentUser) -> None:
    """
    Raise HTTPException 403 if the user cannot create/update AP Invoices.

    AP write is broader than general procurement write — accountant and
    finance_admin are also allowed because AP Invoice ownership typically
    sits with the finance/AP team in most companies.

    Args:
        current_user: Authenticated user object from JWT.

    Raises:
        HTTPException: 403 if role not in _AP_WRITE_ROLES.
    """
    if current_user.role not in _AP_WRITE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: procurement_officer, accountant, or finance_admin role required",
        )


def _get_service() -> DocumentService:
    """Dependency: return a DocumentService bound to the farm_db connection."""
    return DocumentService(farm_db.get_database())


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


# ---------------------------------------------------------------------------
# List + Create
# ---------------------------------------------------------------------------


@router.get(
    "/ap",
    response_model=PaginatedResponse[APResponse],
    summary="List AP invoices",
)
async def list_aps(
    organization_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=200),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None, max_length=200),
    vendor_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> PaginatedResponse[APResponse]:
    """
    Paginated list of AP Invoices.

    Args:
        organization_id: Override org.
        page: Page number (1-based).
        per_page: Items per page (max 200).
        status_filter: Filter by status (Draft / Pending Approval / Approved / Rejected).
        search: Substring search on docNumber.
        vendor_id: Filter by vendorId.
        current_user: Authenticated user.
        service: DocumentService dependency.

    Returns:
        Paginated AP Invoice list.
    """
    org_id = _get_org_id(organization_id, current_user)
    result = await service.list_aps(
        org_id,
        page=page,
        per_page=per_page,
        status_filter=status_filter,
        search=search,
        vendor_id=vendor_id,
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


@router.post(
    "/ap/from-gr/{gr_doc_id}",
    response_model=SuccessResponse[APDetailResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create AP invoice from a posted GR (primary path)",
)
async def create_ap_from_gr(
    gr_doc_id: str,
    body: APFromGRCreate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[APDetailResponse]:
    """
    Create a Draft AP Invoice from a Posted Goods Receipt.

    This is the primary UX path. The system validates:
      - The GR is in Posted status.
      - No non-rejected AP Invoice already exists for this GR.
      - Each grLineId in the body references a real GR line.

    Quantity per line is locked to the GR receipt quantity (v1 — no partial invoicing).
    The user may specify invoiceUnitPrice per line to capture vendor price differences.

    Args:
        gr_doc_id: UUID of the source Posted GR.
        body: AP Invoice creation payload with line prices.
        organization_id: Override org.
        current_user: Authenticated user (must have AP write role).
        service: DocumentService dependency.

    Returns:
        Created APDetailResponse (status: Draft).

    Raises:
        HTTPException 422: If GR not found, wrong status, or AP already exists.
    """
    _require_ap_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        ap = await service.create_ap_from_gr(
            org_id=org_id,
            gr_doc_id=gr_doc_id,
            data=body,
            created_by=current_user.userId,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )

    return SuccessResponse(data=ap, message="AP Invoice created successfully")


@router.post(
    "/ap",
    response_model=SuccessResponse[APDetailResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create AP invoice (explicit baseDocId)",
)
async def create_ap(
    body: APCreate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[APDetailResponse]:
    """
    Create a Draft AP Invoice with the source GR identified in the request body.

    Functionally identical to POST /ap/from-gr/{gr_doc_id}; provided as a
    flexible alternative where the caller already has the GR docId in the body.

    Args:
        body: APCreate payload (includes baseDocId = GR docId).
        organization_id: Override org.
        current_user: Authenticated user (must have AP write role).
        service: DocumentService dependency.

    Returns:
        Created APDetailResponse (status: Draft).

    Raises:
        HTTPException 422: If GR not found, wrong status, or AP already exists.
    """
    _require_ap_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        ap = await service.create_ap(
            org_id=org_id,
            data=body,
            created_by=current_user.userId,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )

    return SuccessResponse(data=ap, message="AP Invoice created successfully")


# ---------------------------------------------------------------------------
# Get / Update / Delete
# ---------------------------------------------------------------------------


@router.get(
    "/ap/{doc_id}",
    response_model=SuccessResponse[APDetailResponse],
    summary="Get AP invoice detail",
)
async def get_ap(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[APDetailResponse]:
    """
    Retrieve a single AP Invoice with all lines.

    Args:
        doc_id: AP document UUID string.
        organization_id: Override org.
        current_user: Authenticated user.
        service: DocumentService dependency.

    Returns:
        APDetailResponse.

    Raises:
        HTTPException 404: If AP Invoice not found.
    """
    org_id = _get_org_id(organization_id, current_user)
    ap = await service.get_ap(org_id, doc_id)
    if not ap:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"AP Invoice '{doc_id}' not found",
        )
    return SuccessResponse(data=ap)


@router.patch(
    "/ap/{doc_id}",
    response_model=SuccessResponse[APDetailResponse],
    summary="Update draft AP invoice",
)
async def update_ap(
    doc_id: str,
    body: APUpdate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[APDetailResponse]:
    """
    Partially update a Draft AP Invoice.

    Only invoiceNumber, invoiceDate, dueDate, notes, and line invoiceUnitPrices
    may be updated.  baseDocId, vendor, companyCode, and line quantities are
    immutable after creation.

    Args:
        doc_id: AP document UUID string.
        body: Partial update payload.
        organization_id: Override org.
        current_user: Authenticated user (must have AP write role).
        service: DocumentService dependency.

    Returns:
        Updated APDetailResponse.

    Raises:
        HTTPException 409: If AP is not in Draft status.
        HTTPException 404: If AP Invoice not found.
    """
    _require_ap_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        ap = await service.update_ap(org_id, doc_id, body, current_user.userId)
    except ValueError as exc:
        detail = str(exc)
        if "Only Draft" in detail:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail
        )

    if not ap:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"AP Invoice '{doc_id}' not found",
        )
    return SuccessResponse(data=ap, message="AP Invoice updated")


@router.delete(
    "/ap/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft-delete draft AP invoice",
)
async def delete_ap(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> None:
    """
    Soft-delete a Draft AP Invoice.

    Approved AP Invoices are immutable per the accounting immutability rules
    and can never be deleted.  To correct an approved AP, use the Amendment flow
    (deferred to Phase C+).

    Args:
        doc_id: AP document UUID string.
        organization_id: Override org.
        current_user: Authenticated user (must have AP write role).
        service: DocumentService dependency.

    Raises:
        HTTPException 409: If AP is not Draft.
        HTTPException 404: If AP Invoice not found.
    """
    _require_ap_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        deleted = await service.soft_delete_ap(org_id, doc_id, current_user.userId)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"AP Invoice '{doc_id}' not found",
        )


# ---------------------------------------------------------------------------
# State transitions
# ---------------------------------------------------------------------------


@router.post(
    "/ap/{doc_id}/submit",
    response_model=SuccessResponse[APDetailResponse],
    summary="Submit AP invoice for approval (Draft → Pending Approval)",
)
async def submit_ap(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[APDetailResponse]:
    """
    Submit an AP Invoice for approval (Draft → Pending Approval).

    Queries the approval engine with doc_type=AP_INVOICE and totalGross.
    If the engine determines no approval is required, transitions directly
    to Approved and emits the ap_invoice_posted finance event.

    Args:
        doc_id: AP document UUID string.
        organization_id: Override org.
        current_user: Authenticated user (must have AP write role).
        service: DocumentService dependency.

    Returns:
        Updated APDetailResponse.

    Raises:
        HTTPException 409: If AP is not in Draft status.
        HTTPException 404: If AP Invoice not found.
    """
    _require_ap_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        ap = await service.submit_ap(
            org_id=org_id,
            doc_id=doc_id,
            submitted_by=current_user.userId,
        )
    except ValueError as exc:
        detail = str(exc)
        code = status.HTTP_404_NOT_FOUND if "not found" in detail else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=code, detail=detail)

    return SuccessResponse(data=ap, message="AP Invoice submitted for approval")


@router.post(
    "/ap/{doc_id}/approve",
    response_model=SuccessResponse[APDetailResponse],
    summary="Approve AP invoice (Pending Approval → Approved)",
)
async def approve_ap(
    doc_id: str,
    body: ApproveRejectBody,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[APDetailResponse]:
    """
    Approve an AP Invoice in Pending Approval state.

    On approval the ap_invoice_posted outbox event is emitted, triggering the
    second JE in the P2P cycle on the finance side.

    Args:
        doc_id: AP document UUID string.
        body: Optional comment.
        organization_id: Override org.
        current_user: Authenticated user (must hold the required approver role).
        service: DocumentService dependency.

    Returns:
        Updated APDetailResponse (status: Approved).

    Raises:
        HTTPException 409: If AP is not in Pending Approval state or role mismatch.
        HTTPException 404: If AP Invoice not found.
    """
    org_id = _get_org_id(organization_id, current_user)

    try:
        ap = await service.approve_ap(
            org_id=org_id,
            doc_id=doc_id,
            approver_id=current_user.userId,
            approver_role=current_user.role,
            comment=body.comment if body else None,
        )
    except ValueError as exc:
        detail = str(exc)
        code = status.HTTP_404_NOT_FOUND if "not found" in detail else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=code, detail=detail)

    return SuccessResponse(data=ap, message="AP Invoice approved and posted")


@router.post(
    "/ap/{doc_id}/reject",
    response_model=SuccessResponse[APDetailResponse],
    summary="Reject AP invoice (Pending Approval → Rejected)",
)
async def reject_ap(
    doc_id: str,
    body: RejectBody,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[APDetailResponse]:
    """
    Reject an AP Invoice in Pending Approval state.

    Rejection is terminal in v1. A comment is required to document the reason.

    Args:
        doc_id: AP document UUID string.
        body: Rejection comment (required).
        organization_id: Override org.
        current_user: Authenticated user (must hold the required approver role).
        service: DocumentService dependency.

    Returns:
        Updated APDetailResponse (status: Rejected).

    Raises:
        HTTPException 409: If AP is not in Pending Approval state or role mismatch.
        HTTPException 404: If AP Invoice not found.
    """
    org_id = _get_org_id(organization_id, current_user)

    try:
        ap = await service.reject_ap(
            org_id=org_id,
            doc_id=doc_id,
            approver_id=current_user.userId,
            approver_role=current_user.role,
            comment=body.comment,
        )
    except ValueError as exc:
        detail = str(exc)
        code = status.HTTP_404_NOT_FOUND if "not found" in detail else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=code, detail=detail)

    return SuccessResponse(data=ap, message="AP Invoice rejected")


@router.post(
    "/ap/{doc_id}/withdraw",
    response_model=SuccessResponse[APDetailResponse],
    summary="Withdraw AP invoice back to Draft (Pending Approval → Draft)",
)
async def withdraw_ap(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[APDetailResponse]:
    """
    Withdraw an AP Invoice from Pending Approval back to Draft.

    Allows the submitter to correct the invoice (e.g. wrong price) before
    re-submitting.  No finance event is emitted (finance was not yet notified).

    Args:
        doc_id: AP document UUID string.
        organization_id: Override org.
        current_user: Authenticated user (must have AP write role).
        service: DocumentService dependency.

    Returns:
        Updated APDetailResponse (status: Draft).

    Raises:
        HTTPException 409: If AP is not in Pending Approval status.
        HTTPException 404: If AP Invoice not found.
    """
    _require_ap_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        ap = await service.withdraw_ap(
            org_id=org_id,
            doc_id=doc_id,
            withdrawn_by=current_user.userId,
        )
    except ValueError as exc:
        detail = str(exc)
        code = status.HTTP_404_NOT_FOUND if "not found" in detail else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=code, detail=detail)

    return SuccessResponse(data=ap, message="AP Invoice withdrawn to Draft")
