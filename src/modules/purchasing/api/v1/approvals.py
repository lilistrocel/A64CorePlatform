"""
Purchasing Module — Approval Inbox API

Endpoints for the approval inbox:
  - GET /approvals/pending   — items pending approval for the current user's role
  - GET /approvals/history   — completed approval decisions by the current user
"""

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ...middleware.auth import CurrentUser, get_current_active_user
from ...models.document import ApprovalHistoryItem, PendingApprovalItem
from ...services.document_service import DocumentService
from src.modules.farm_manager.utils.responses import (
    PaginatedResponse,
    PaginationMeta,
    SuccessResponse,
)
from src.modules.farm_manager.services.database import farm_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Purchasing — Approvals"])


def _get_service() -> DocumentService:
    """Dependency: return a DocumentService bound to the farm_db connection."""
    return DocumentService(farm_db.get_database())


@router.get(
    "/approvals/pending",
    response_model=SuccessResponse[List[PendingApprovalItem]],
    summary="Approval inbox — pending items for current user role",
)
async def get_pending_approvals(
    organization_id: str = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[List[PendingApprovalItem]]:
    """
    Return documents pending approval where approvalRequestedFrom matches
    the current user's role.

    Args:
        organization_id: Override org — defaults to current_user.organizationId.
        current_user: Authenticated user.
        service: DocumentService dependency.

    Returns:
        List of PendingApprovalItem wrapped in SuccessResponse.
    """
    org_id = organization_id or current_user.organizationId
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="organization_id is required",
        )

    items = await service.get_pending_approvals(org_id, current_user.role)
    return SuccessResponse(data=items)


@router.get(
    "/approvals/history",
    response_model=PaginatedResponse[ApprovalHistoryItem],
    summary="Approval history — decisions made by current user",
)
async def get_approval_history(
    organization_id: str = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> PaginatedResponse[ApprovalHistoryItem]:
    """
    Return completed approval decisions (approved or rejected) made by the
    current user.

    Args:
        organization_id: Override org.
        page: Page number (1-based).
        per_page: Items per page (max 200).
        current_user: Authenticated user.
        service: DocumentService dependency.

    Returns:
        Paginated ApprovalHistoryItem list.
    """
    org_id = organization_id or current_user.organizationId
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="organization_id is required",
        )

    result = await service.get_approval_history(
        org_id, current_user.userId, page=page, per_page=per_page
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
