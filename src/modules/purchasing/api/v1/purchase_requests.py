"""
Purchasing Module — Purchase Requests API

CRUD + state transitions for Purchase Request documents.

Permissions:
  - Read:   procurement_officer, procurement_manager, admin, super_admin
  - Write:  procurement_officer, procurement_manager, admin, super_admin
  - Approve/Reject: procurement_manager, admin, super_admin
    (also enforced by approval engine role check)
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ...middleware.auth import (
    CurrentUser,
    get_current_active_user,
    require_purchasing_write,
)
from ...models.document import (
    ApproveRejectBody,
    PRCreate,
    PRDetailResponse,
    PRResponse,
    PRUpdate,
    RejectBody,
)
from ...services.document_service import DocumentService
from src.modules.farm_manager.utils.responses import PaginatedResponse, PaginationMeta, SuccessResponse
from src.modules.farm_manager.services.database import farm_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Purchasing — Purchase Requests"])

# Roles allowed to approve/reject (must also be validated by approval engine)
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
    """
    Resolve organisation ID from query param or JWT.

    Args:
        organization_id: Optional override from query param.
        current_user: JWT-authenticated user.

    Returns:
        Organisation UUID string.

    Raises:
        HTTPException 400: If org ID cannot be resolved.
    """
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
    "/pr",
    response_model=PaginatedResponse[PRResponse],
    summary="List purchase requests",
)
async def list_prs(
    organization_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=200),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None, max_length=200),
    requester_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> PaginatedResponse[PRResponse]:
    """
    Paginated list of Purchase Requests.

    Args:
        organization_id: Override org — defaults to current_user.organizationId.
        page: Page number (1-based).
        per_page: Items per page (max 200).
        status_filter: Filter by PR status string.
        search: Substring search on docNumber.
        requester_id: Filter by requestedBy user ID.
        current_user: Authenticated user.
        service: DocumentService dependency.

    Returns:
        Paginated PR list.
    """
    org_id = _get_org_id(organization_id, current_user)
    result = await service.list_prs(
        org_id,
        page=page,
        per_page=per_page,
        status_filter=status_filter,
        search=search,
        requester_id=requester_id,
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
    "/pr",
    response_model=SuccessResponse[PRDetailResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create purchase request",
)
async def create_pr(
    body: PRCreate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[PRDetailResponse]:
    """
    Create a new Purchase Request in Draft status.

    Args:
        body: PR creation payload with header + lines.
        organization_id: Override org — defaults to current_user.organizationId.
        current_user: Authenticated user (must have procurement write role).
        service: DocumentService dependency.

    Returns:
        Created PRDetailResponse wrapped in SuccessResponse.

    Raises:
        HTTPException 403: If insufficient role.
        HTTPException 422: If item not found.
    """
    require_purchasing_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        pr = await service.create_pr(
            org_id=org_id,
            data=body,
            created_by=current_user.userId,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    return SuccessResponse(data=pr, message="Purchase Request created successfully")


# ---------------------------------------------------------------------------
# Get / Update / Delete
# ---------------------------------------------------------------------------


@router.get(
    "/pr/{doc_id}",
    response_model=SuccessResponse[PRDetailResponse],
    summary="Get purchase request detail",
)
async def get_pr(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[PRDetailResponse]:
    """
    Retrieve a single PR with all lines.

    Args:
        doc_id: Document UUID string.
        organization_id: Override org.
        current_user: Authenticated user.
        service: DocumentService dependency.

    Returns:
        PRDetailResponse wrapped in SuccessResponse.

    Raises:
        HTTPException 404: If PR not found.
    """
    org_id = _get_org_id(organization_id, current_user)
    pr = await service.get_pr(org_id, doc_id)
    if not pr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"PR '{doc_id}' not found")
    return SuccessResponse(data=pr)


@router.patch(
    "/pr/{doc_id}",
    response_model=SuccessResponse[PRDetailResponse],
    summary="Update draft purchase request",
)
async def update_pr(
    doc_id: str,
    body: PRUpdate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[PRDetailResponse]:
    """
    Partially update a Draft PR. Lines are replaced wholesale if supplied.

    Args:
        doc_id: Document UUID string.
        body: Partial update payload.
        organization_id: Override org.
        current_user: Authenticated user (must have procurement write role).
        service: DocumentService dependency.

    Returns:
        Updated PRDetailResponse.

    Raises:
        HTTPException 403: If insufficient role.
        HTTPException 404: If PR not found.
        HTTPException 409: If PR is not in Draft status.
    """
    require_purchasing_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        pr = await service.update_pr(org_id, doc_id, body, current_user.userId)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    if not pr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"PR '{doc_id}' not found")
    return SuccessResponse(data=pr, message="Purchase Request updated")


@router.delete(
    "/pr/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft-delete draft purchase request",
)
async def delete_pr(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> None:
    """
    Soft-delete a Draft PR.

    Args:
        doc_id: Document UUID string.
        organization_id: Override org.
        current_user: Authenticated user (must have procurement write role).
        service: DocumentService dependency.

    Raises:
        HTTPException 403: If insufficient role.
        HTTPException 404: If PR not found.
        HTTPException 409: If PR is not Draft.
    """
    require_purchasing_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        deleted = await service.soft_delete_pr(org_id, doc_id, current_user.userId)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"PR '{doc_id}' not found")


# ---------------------------------------------------------------------------
# State transitions
# ---------------------------------------------------------------------------


@router.post(
    "/pr/{doc_id}/submit",
    response_model=SuccessResponse[PRDetailResponse],
    summary="Submit PR for approval",
)
async def submit_pr(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[PRDetailResponse]:
    """
    Submit a Draft PR. Queries approval engine to determine next status.

    Args:
        doc_id: Document UUID string.
        organization_id: Override org.
        current_user: Authenticated user.
        service: DocumentService dependency.

    Returns:
        Updated PRDetailResponse (status: Pending Approval or Approved).

    Raises:
        HTTPException 409: If transition not allowed.
    """
    org_id = _get_org_id(organization_id, current_user)

    try:
        pr = await service.submit_pr(org_id, doc_id, current_user.userId)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    return SuccessResponse(data=pr, message="Purchase Request submitted")


@router.post(
    "/pr/{doc_id}/cancel",
    response_model=SuccessResponse[PRDetailResponse],
    summary="Cancel purchase request",
)
async def cancel_pr(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[PRDetailResponse]:
    """
    Cancel a Draft or Pending Approval PR.

    Args:
        doc_id: Document UUID string.
        organization_id: Override org.
        current_user: Authenticated user.
        service: DocumentService dependency.

    Returns:
        Updated PRDetailResponse (status: Cancelled).

    Raises:
        HTTPException 409: If transition not allowed.
    """
    org_id = _get_org_id(organization_id, current_user)

    try:
        pr = await service.cancel_pr(org_id, doc_id, current_user.userId)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    return SuccessResponse(data=pr, message="Purchase Request cancelled")


@router.post(
    "/pr/{doc_id}/approve",
    response_model=SuccessResponse[PRDetailResponse],
    summary="Approve purchase request",
)
async def approve_pr(
    doc_id: str,
    body: ApproveRejectBody,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[PRDetailResponse]:
    """
    Approve a Pending Approval PR.

    Approver must have the role requested by the approval engine.
    Approver cannot be the same user who created the PR.

    Args:
        doc_id: Document UUID string.
        body: Optional approval comment.
        organization_id: Override org.
        current_user: Authenticated user (must hold approver role).
        service: DocumentService dependency.

    Returns:
        Updated PRDetailResponse (status: Approved).

    Raises:
        HTTPException 403: If role not in approver roles.
        HTTPException 409: If transition not allowed or role mismatch.
    """
    if current_user.role not in _APPROVER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only procurement_manager or admin can approve Purchase Requests",
        )

    org_id = _get_org_id(organization_id, current_user)

    try:
        pr = await service.approve_pr(
            org_id, doc_id, current_user.userId, current_user.role, body.comment
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    return SuccessResponse(data=pr, message="Purchase Request approved")


@router.post(
    "/pr/{doc_id}/reject",
    response_model=SuccessResponse[PRDetailResponse],
    summary="Reject purchase request",
)
async def reject_pr(
    doc_id: str,
    body: RejectBody,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[PRDetailResponse]:
    """
    Reject a Pending Approval PR. Rejection comment is required.

    Args:
        doc_id: Document UUID string.
        body: Rejection comment (required).
        organization_id: Override org.
        current_user: Authenticated user (must hold approver role).
        service: DocumentService dependency.

    Returns:
        Updated PRDetailResponse (status: Rejected).

    Raises:
        HTTPException 403: If role not in approver roles.
        HTTPException 409: If transition not allowed.
    """
    if current_user.role not in _APPROVER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only procurement_manager or admin can reject Purchase Requests",
        )

    org_id = _get_org_id(organization_id, current_user)

    try:
        pr = await service.reject_pr(
            org_id, doc_id, current_user.userId, current_user.role, body.comment
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    return SuccessResponse(data=pr, message="Purchase Request rejected")
