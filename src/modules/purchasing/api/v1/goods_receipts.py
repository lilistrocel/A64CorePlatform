"""
Purchasing Module — Goods Receipts API (Phase B.1)

CRUD + state transitions for Goods Receipt (GR) documents.

A GR is created from an Open or Sent PO and records the physical delivery of
goods at a warehouse.  Posting a GR (Draft → Posted) is the first
accounting-relevant event in the P2P cycle — it debits inventory and credits
the GR/IR clearing account on the finance side.

Permissions:
  - Read:   procurement_officer, procurement_manager, admin, super_admin
  - Write:  procurement_officer, procurement_manager, admin, super_admin
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from ...middleware.auth import (
    CurrentUser,
    get_current_active_user,
    require_purchasing_write,
)
from ...models.document import (
    DocumentLineResponse,
    GRCreate,
    GRDetailResponse,
    GRFromPOCreate,
    GRResponse,
    GRUpdate,
)
from ...services.document_service import DocumentService
from src.modules.farm_manager.utils.responses import (
    PaginatedResponse,
    PaginationMeta,
    SuccessResponse,
)
from src.modules.farm_manager.services.database import farm_db
from src.core.finance.company_resolver import resolve_company_code

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Purchasing — Goods Receipts"])


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


def _extract_token(request: Request) -> Optional[str]:
    """Extract the raw Bearer token from the Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[len("Bearer ") :]
    return None


# ---------------------------------------------------------------------------
# List + Create
# ---------------------------------------------------------------------------


@router.get(
    "/gr",
    response_model=PaginatedResponse[GRResponse],
    summary="List goods receipts",
)
async def list_grs(
    organization_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=200),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None, max_length=200),
    vendor_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> PaginatedResponse[GRResponse]:
    """
    Paginated list of Goods Receipts.

    Args:
        organization_id: Override org.
        page: Page number (1-based).
        per_page: Items per page (max 200).
        status_filter: Filter by GR status (Draft / Posted).
        search: Substring search on docNumber.
        vendor_id: Filter by vendorId.
        current_user: Authenticated user.
        service: DocumentService dependency.

    Returns:
        Paginated GR list.
    """
    org_id = _get_org_id(organization_id, current_user)
    result = await service.list_grs(
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
    "/gr/from-po/{po_doc_id}",
    response_model=SuccessResponse[GRDetailResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create goods receipt from an open PO",
)
async def create_gr_from_po(
    request: Request,
    po_doc_id: str,
    body: GRFromPOCreate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[GRDetailResponse]:
    """
    Create a Draft GR by receiving goods against an Open or Sent PO.

    Each line in the body references a PO line (baseLineId) and specifies the
    quantity received.  Quantity may not exceed the PO line's openQuantity.
    When lines is empty, defaults to full remaining openQuantity on every PO
    line that is not yet fully received.

    Args:
        request: Incoming HTTP request (Bearer token forwarded to finance service).
        po_doc_id: UUID of the source PO.
        body: GR creation payload.
        organization_id: Override org.
        current_user: Authenticated user (must have procurement write role).
        service: DocumentService dependency.

    Returns:
        Created GRDetailResponse (status: Draft).

    Raises:
        HTTPException 400: If company code cannot be resolved.
        HTTPException 422: If PO not found, wrong status, or quantity violations.
        HTTPException 503: If finance service is unreachable.
    """
    require_purchasing_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    # Reason: resolve companyCode from finance service — no hardcoded default.
    company_code = await resolve_company_code(
        organization_id=org_id,
        auth_token=_extract_token(request),
    )

    try:
        gr = await service.create_gr_from_po(
            org_id=org_id,
            po_doc_id=po_doc_id,
            data=body,
            created_by=current_user.userId,
            company_code=company_code,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )

    return SuccessResponse(data=gr, message="Goods Receipt created successfully")


@router.post(
    "/gr",
    response_model=SuccessResponse[GRDetailResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create goods receipt (explicit baseDocId)",
)
async def create_gr(
    request: Request,
    body: GRCreate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[GRDetailResponse]:
    """
    Create a Draft GR with the source PO identified in the request body.

    Functionally identical to POST /gr/from-po/{po_doc_id}; provided as a
    flexible alternative where the caller already has the PO docId and prefers
    to pass it in the body.

    Args:
        request: Incoming HTTP request (Bearer token forwarded to finance service).
        body: GRCreate payload (includes baseDocId).
        organization_id: Override org.
        current_user: Authenticated user (must have procurement write role).
        service: DocumentService dependency.

    Returns:
        Created GRDetailResponse (status: Draft).

    Raises:
        HTTPException 400: If company code cannot be resolved.
        HTTPException 422: If PO not found, wrong status, or quantity violations.
        HTTPException 503: If finance service is unreachable.
    """
    require_purchasing_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    # Reason: resolve companyCode from finance service — no hardcoded default.
    company_code = await resolve_company_code(
        organization_id=org_id,
        auth_token=_extract_token(request),
    )

    try:
        gr = await service.create_gr(
            org_id=org_id,
            data=body,
            created_by=current_user.userId,
            company_code=company_code,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )

    return SuccessResponse(data=gr, message="Goods Receipt created successfully")


# ---------------------------------------------------------------------------
# Get / Update / Delete
# ---------------------------------------------------------------------------


@router.get(
    "/gr/{doc_id}",
    response_model=SuccessResponse[GRDetailResponse],
    summary="Get goods receipt detail",
)
async def get_gr(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[GRDetailResponse]:
    """
    Retrieve a single GR with all lines.

    Args:
        doc_id: GR document UUID string.
        organization_id: Override org.
        current_user: Authenticated user.
        service: DocumentService dependency.

    Returns:
        GRDetailResponse.

    Raises:
        HTTPException 404: If GR not found.
    """
    org_id = _get_org_id(organization_id, current_user)
    gr = await service.get_gr(org_id, doc_id)
    if not gr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"GR '{doc_id}' not found",
        )
    return SuccessResponse(data=gr)


@router.patch(
    "/gr/{doc_id}",
    response_model=SuccessResponse[GRDetailResponse],
    summary="Update draft goods receipt",
)
async def update_gr(
    doc_id: str,
    body: GRUpdate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[GRDetailResponse]:
    """
    Partially update a Draft GR.

    Only warehouseId, notes, and line quantities may be updated.  baseDocId,
    vendor, and companyCode are immutable after creation.  Line quantities
    must still not exceed their respective PO line openQuantity.

    Args:
        doc_id: GR document UUID string.
        body: Partial update payload.
        organization_id: Override org.
        current_user: Authenticated user (must have procurement write role).
        service: DocumentService dependency.

    Returns:
        Updated GRDetailResponse.

    Raises:
        HTTPException 409: If GR is not in Draft status.
        HTTPException 422: If quantity validation fails.
    """
    require_purchasing_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        gr = await service.update_gr(org_id, doc_id, body, current_user.userId)
    except ValueError as exc:
        # Reason: status conflict (not Draft) → 409; quantity violation → 422
        detail = str(exc)
        if "Only Draft" in detail:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail
        )

    if not gr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"GR '{doc_id}' not found",
        )
    return SuccessResponse(data=gr, message="Goods Receipt updated")


@router.delete(
    "/gr/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft-delete draft goods receipt",
)
async def delete_gr(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> None:
    """
    Soft-delete a Draft GR.

    Posted GRs are immutable per the accounting immutability rules and can
    never be deleted.  To correct a posted GR, create a reversal GR.

    Args:
        doc_id: GR document UUID string.
        organization_id: Override org.
        current_user: Authenticated user (must have procurement write role).
        service: DocumentService dependency.

    Raises:
        HTTPException 409: If GR is not Draft.
        HTTPException 404: If GR not found.
    """
    require_purchasing_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        deleted = await service.soft_delete_gr(org_id, doc_id, current_user.userId)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"GR '{doc_id}' not found",
        )


# ---------------------------------------------------------------------------
# State transitions
# ---------------------------------------------------------------------------


@router.post(
    "/gr/{doc_id}/post",
    response_model=SuccessResponse[GRDetailResponse],
    summary="Post goods receipt (Draft → Posted)",
)
async def post_gr(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: DocumentService = Depends(_get_service),
) -> SuccessResponse[GRDetailResponse]:
    """
    Post a GR (Draft → Posted).  This is the first accounting event in the
    P2P cycle and triggers the DR Inventory / CR GR/IR Clearing journal entry
    on the finance side.

    Atomic steps performed within a single Mongo transaction:
      1. Decrement openQuantity on each linked PO line.
      2. GR header status → Posted (sets postedAt, postedBy, receivedDate).
      3. If all PO lines have openQuantity == 0, PO transitions to Closed
         and a po_state_changed event is emitted.
      4. purchase_received outbox event is emitted (postedEventId recorded).

    Once Posted a GR is immutable.

    Args:
        doc_id: GR document UUID string.
        organization_id: Override org.
        current_user: Authenticated user (must have procurement write role).
        service: DocumentService dependency.

    Returns:
        Updated GRDetailResponse (status: Posted).

    Raises:
        HTTPException 409: If GR is already Posted or transition not allowed.
        HTTPException 404: If GR not found.
    """
    require_purchasing_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        gr = await service.post_gr(org_id, doc_id, current_user.userId)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    return SuccessResponse(data=gr, message="Goods Receipt posted successfully")
