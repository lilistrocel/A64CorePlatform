"""
Purchasing Module — Purchase Orders API

CRUD + state transitions for Purchase Order documents.

Permissions:
  - Read:   procurement_officer, procurement_manager, admin, super_admin
  - Write:  procurement_officer, procurement_manager, admin, super_admin
  - Approve/Reject: procurement_manager, admin, super_admin
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ...middleware.auth import (
    CurrentUser,
    get_current_active_user,
    require_purchasing_write,
)
from ...models.document import (
    ApproveRejectBody,
    DocumentLineResponse,
    POCreate,
    PODetailResponse,
    POFromPRCreate,
    POResponse,
    POUpdate,
    RejectBody,
)
from ...services.document_service import DocumentService
from src.modules.farm_manager.utils.responses import PaginatedResponse, PaginationMeta, SuccessResponse
from src.modules.farm_manager.services.database import farm_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Purchasing — Purchase Orders"])

_APPROVER_ROLES = frozenset({
    "procurement_manager",
    "admin",
    "super_admin",
})


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
    "/po",
    response_model=PaginatedResponse[POResponse],
    summary="List purchase orders",
)
async def list_pos(
    organization_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=200),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None, max_length=200),
    vendor_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> PaginatedResponse[POResponse]:
    """
    Paginated list of Purchase Orders.

    Args:
        organization_id: Override org.
        page: Page number (1-based).
        per_page: Items per page (max 200).
        status_filter: Filter by PO status string.
        search: Substring search on docNumber.
        vendor_id: Filter by vendorId.
        current_user: Authenticated user.
        service: DocumentService dependency.

    Returns:
        Paginated PO list.
    """
    org_id = _get_org_id(organization_id, current_user)
    result = await service.list_pos(
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
    "/po",
    response_model=SuccessResponse[PODetailResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create purchase order (manual)",
)
async def create_po(
    body: POCreate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[PODetailResponse]:
    """
    Create a new Purchase Order in Draft status (manual creation).

    Args:
        body: PO creation payload (vendor required).
        organization_id: Override org.
        current_user: Authenticated user (must have procurement write role).
        service: DocumentService dependency.

    Returns:
        Created PODetailResponse.

    Raises:
        HTTPException 422: If vendor or item not found.
    """
    require_purchasing_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        po = await service.create_po(
            org_id=org_id,
            data=body,
            created_by=current_user.userId,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    return SuccessResponse(data=po, message="Purchase Order created successfully")


@router.post(
    "/po/from-pr/{pr_doc_id}",
    response_model=SuccessResponse[PODetailResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create purchase order from approved PR",
)
async def create_po_from_pr(
    pr_doc_id: str,
    body: POFromPRCreate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[PODetailResponse]:
    """
    Create a PO from an Approved PR. Lines are copied; PR is auto-closed.

    Args:
        pr_doc_id: UUID of the Approved PR.
        body: Vendor + optional header overrides.
        organization_id: Override org.
        current_user: Authenticated user (must have procurement write role).
        service: DocumentService dependency.

    Returns:
        Created PODetailResponse.

    Raises:
        HTTPException 422: If PR not found, not Approved, or vendor not found.
    """
    require_purchasing_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        po = await service.create_po_from_pr(
            org_id=org_id,
            pr_doc_id=pr_doc_id,
            data=body,
            created_by=current_user.userId,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    return SuccessResponse(data=po, message="Purchase Order created from PR successfully")


# ---------------------------------------------------------------------------
# Get / Update / Delete
# ---------------------------------------------------------------------------


@router.get(
    "/po/{doc_id}",
    response_model=SuccessResponse[PODetailResponse],
    summary="Get purchase order detail",
)
async def get_po(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[PODetailResponse]:
    """
    Retrieve a single PO with all lines.

    Args:
        doc_id: Document UUID string.
        organization_id: Override org.
        current_user: Authenticated user.
        service: DocumentService dependency.

    Returns:
        PODetailResponse.

    Raises:
        HTTPException 404: If PO not found.
    """
    org_id = _get_org_id(organization_id, current_user)
    po = await service.get_po(org_id, doc_id)
    if not po:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"PO '{doc_id}' not found")
    return SuccessResponse(data=po)


@router.patch(
    "/po/{doc_id}",
    response_model=SuccessResponse[PODetailResponse],
    summary="Update draft purchase order",
)
async def update_po(
    doc_id: str,
    body: POUpdate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[PODetailResponse]:
    """
    Partially update a Draft PO.

    Args:
        doc_id: Document UUID string.
        body: Partial update payload.
        organization_id: Override org.
        current_user: Authenticated user (must have procurement write role).
        service: DocumentService dependency.

    Returns:
        Updated PODetailResponse.

    Raises:
        HTTPException 409: If PO is not in Draft status.
    """
    require_purchasing_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        po = await service.update_po(org_id, doc_id, body, current_user.userId)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    if not po:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"PO '{doc_id}' not found")
    return SuccessResponse(data=po, message="Purchase Order updated")


@router.delete(
    "/po/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft-delete draft purchase order",
)
async def delete_po(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> None:
    """
    Soft-delete a Draft PO.

    Args:
        doc_id: Document UUID string.
        organization_id: Override org.
        current_user: Authenticated user (must have procurement write role).
        service: DocumentService dependency.

    Raises:
        HTTPException 409: If PO is not Draft.
    """
    require_purchasing_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        deleted = await service.soft_delete_po(org_id, doc_id, current_user.userId)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"PO '{doc_id}' not found")


# ---------------------------------------------------------------------------
# State transitions
# ---------------------------------------------------------------------------


@router.post(
    "/po/{doc_id}/submit",
    response_model=SuccessResponse[PODetailResponse],
    summary="Submit PO for approval or open",
)
async def submit_po(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[PODetailResponse]:
    """
    Submit a Draft PO. Queries approval engine to determine next status.

    Args:
        doc_id: Document UUID string.
        organization_id: Override org.
        current_user: Authenticated user.
        service: DocumentService dependency.

    Returns:
        Updated PODetailResponse (status: Pending Approval or Open).

    Raises:
        HTTPException 409: If transition not allowed.
    """
    org_id = _get_org_id(organization_id, current_user)

    try:
        po = await service.submit_po(org_id, doc_id, current_user.userId)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    return SuccessResponse(data=po, message="Purchase Order submitted")


@router.post(
    "/po/{doc_id}/approve",
    response_model=SuccessResponse[PODetailResponse],
    summary="Approve purchase order",
)
async def approve_po(
    doc_id: str,
    body: ApproveRejectBody,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[PODetailResponse]:
    """
    Approve a Pending Approval PO → Open.

    Args:
        doc_id: Document UUID string.
        body: Optional approval comment.
        organization_id: Override org.
        current_user: Authenticated user (must hold approver role).
        service: DocumentService dependency.

    Returns:
        Updated PODetailResponse (status: Open).

    Raises:
        HTTPException 403: If insufficient role.
        HTTPException 409: If transition not allowed.
    """
    if current_user.role not in _APPROVER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only procurement_manager or admin can approve Purchase Orders",
        )

    org_id = _get_org_id(organization_id, current_user)

    try:
        po = await service.approve_po(
            org_id, doc_id, current_user.userId, current_user.role, body.comment
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    return SuccessResponse(data=po, message="Purchase Order approved")


@router.post(
    "/po/{doc_id}/reject",
    response_model=SuccessResponse[PODetailResponse],
    summary="Reject purchase order",
)
async def reject_po(
    doc_id: str,
    body: RejectBody,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[PODetailResponse]:
    """
    Reject a Pending Approval PO. Rejection comment is required.

    Args:
        doc_id: Document UUID string.
        body: Rejection comment (required).
        organization_id: Override org.
        current_user: Authenticated user (must hold approver role).
        service: DocumentService dependency.

    Returns:
        Updated PODetailResponse (status: Rejected).

    Raises:
        HTTPException 403: If insufficient role.
        HTTPException 409: If transition not allowed.
    """
    if current_user.role not in _APPROVER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only procurement_manager or admin can reject Purchase Orders",
        )

    org_id = _get_org_id(organization_id, current_user)

    try:
        po = await service.reject_po(
            org_id, doc_id, current_user.userId, current_user.role, body.comment
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    return SuccessResponse(data=po, message="Purchase Order rejected")


@router.post(
    "/po/{doc_id}/send",
    response_model=SuccessResponse[PODetailResponse],
    summary="Mark purchase order as sent to vendor",
)
async def send_po(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[PODetailResponse]:
    """
    Mark an Open PO as Sent (informational — PO sent to vendor).

    Args:
        doc_id: Document UUID string.
        organization_id: Override org.
        current_user: Authenticated user.
        service: DocumentService dependency.

    Returns:
        Updated PODetailResponse (status: Sent).

    Raises:
        HTTPException 409: If PO is not Open.
    """
    org_id = _get_org_id(organization_id, current_user)

    try:
        po = await service.send_po(org_id, doc_id, current_user.userId)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    return SuccessResponse(data=po, message="Purchase Order marked as sent")


@router.post(
    "/po/{doc_id}/cancel",
    response_model=SuccessResponse[PODetailResponse],
    summary="Cancel purchase order",
)
async def cancel_po(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[PODetailResponse]:
    """
    Cancel a PO in Draft, Pending Approval, Open, or Sent status.

    Args:
        doc_id: Document UUID string.
        organization_id: Override org.
        current_user: Authenticated user.
        service: DocumentService dependency.

    Returns:
        Updated PODetailResponse (status: Cancelled).

    Raises:
        HTTPException 409: If transition not allowed.
    """
    org_id = _get_org_id(organization_id, current_user)

    try:
        po = await service.cancel_po(org_id, doc_id, current_user.userId)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    return SuccessResponse(data=po, message="Purchase Order cancelled")


@router.get(
    "/po/{doc_id}/open-lines",
    response_model=SuccessResponse[List[DocumentLineResponse]],
    summary="Get PO open lines (for GRPO)",
)
async def get_po_open_lines(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[List[DocumentLineResponse]]:
    """
    Return PO lines with openQuantity > 0 (Phase 2 GRPO helper).

    Args:
        doc_id: Document UUID string.
        organization_id: Override org.
        current_user: Authenticated user.
        service: DocumentService dependency.

    Returns:
        List of DocumentLineResponse with openQuantity > 0.

    Raises:
        HTTPException 404: If PO not found.
    """
    org_id = _get_org_id(organization_id, current_user)

    try:
        lines = await service.get_po_open_lines(org_id, doc_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    return SuccessResponse(data=lines)
