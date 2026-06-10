"""
Purchasing Module — Blanket Agreement API (T-200.25 / Wave 4)

CRUD + state transitions for Blanket Agreement (BLA) documents.

A Blanket Agreement is a long-term volume/price commitment between buyer and
vendor.  Example: "ACME Corp commits to purchase 10,000 units of widget-X at
AED 5/unit from VendorCo over the next 12 months."

BLA is a STANDALONE document — it does NOT chain from a PR/PO in T-200.25.
PO→BLA integration (PO referencing a BLA + consumption tracking) is T-200.25.1.

State machine (BLA in document_status.py):
  Draft → Pending Approval → Open → Partly Closed / Closed
  Draft → Open  (small-org direct path — no approval gate)
  Pending Approval → Draft  (rejection / withdraw)
  Open / Partly Closed → Cancelled

BLAs do NOT post to the GL.  No outbox event is emitted.

Active endpoint:
  GET /blanket-agreements/active — convenience endpoint returning BLAs in
  OPEN/PARTLY_CLOSED status where today falls within [validFrom, validTo].
  Optionally filtered by vendor_id + item_id.
  Used by the PO form to surface "you have an active BLA for this item —
  use its price?" hint (UI work in T-200.26).

IMPORTANT: the /active route is registered BEFORE /{doc_id} to prevent
FastAPI treating the literal string "active" as a doc_id path parameter.

Permissions:
  - Read:   procurement_officer, procurement_manager, admin, super_admin,
            accountant, finance_admin
  - Write:  procurement_officer, procurement_manager, admin, super_admin,
            accountant, finance_admin
  - Delete: super_admin only (DRAFT deletion)
"""

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from ...middleware.auth import (
    CurrentUser,
    get_current_active_user,
)
from ...models.document import (
    BlanketAgreementCreate,
    BlanketAgreementListItem,
    BlanketAgreementResponse,
    BlanketAgreementStatusTransitionRequest,
    BlanketAgreementUpdate,
)
from ...services.blanket_agreement_service import (
    create_blanket_agreement,
    delete_blanket_agreement,
    get_blanket_agreement,
    list_blanket_agreements,
    transition_status,
    update_blanket_agreement,
)
from src.modules.farm_manager.utils.responses import (
    PaginatedResponse,
    PaginationMeta,
    SuccessResponse,
)
from src.modules.farm_manager.services.database import farm_db
from src.core.finance.company_resolver import resolve_company_code

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Purchasing — Blanket Agreements"])

# ---------------------------------------------------------------------------
# Role sets
# ---------------------------------------------------------------------------

_BLA_WRITE_ROLES = frozenset({
    "procurement_officer",
    "procurement_manager",
    "admin",
    "super_admin",
    "accountant",
    "finance_admin",
})

_BLA_DELETE_ROLES = frozenset({"super_admin"})


def _require_bla_write(current_user: CurrentUser) -> None:
    """
    Raise HTTPException 403 if the user cannot create/update BLAs.

    Args:
        current_user: Authenticated user object from JWT.

    Raises:
        HTTPException: 403 if role not in _BLA_WRITE_ROLES.
    """
    if current_user.role not in _BLA_WRITE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Permission denied: procurement_officer, accountant, or "
                "finance_admin role required"
            ),
        )


def _require_bla_delete(current_user: CurrentUser) -> None:
    """
    Raise HTTPException 403 if the user cannot delete BLAs.

    Only super_admin can hard-delete Draft BLAs.

    Args:
        current_user: Authenticated user object from JWT.

    Raises:
        HTTPException: 403 if role not in _BLA_DELETE_ROLES.
    """
    if current_user.role not in _BLA_DELETE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: super_admin role required to delete Blanket Agreements",
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
        return auth_header[len("Bearer "):]
    return None


# ---------------------------------------------------------------------------
# Active BLAs convenience endpoint
# MUST be registered BEFORE /{doc_id} to avoid "active" being treated as a
# doc_id path parameter (same pattern as /ap-down-payments/outstanding).
# ---------------------------------------------------------------------------


@router.get(
    "/blanket-agreements/active",
    response_model=PaginatedResponse[BlanketAgreementListItem],
    summary="List active Blanket Agreements (PO form hint)",
)
async def list_active_blas(
    organization_id: Optional[str] = Query(None),
    vendor_id: Optional[str] = Query(None),
    item_id: Optional[str] = Query(
        None,
        description=(
            "Filter by item UUID.  Returns BLAs whose lines include this item — "
            "useful for the PO form: 'you have an active BLA for this item — use its price?'"
        ),
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> PaginatedResponse[BlanketAgreementListItem]:
    """
    Convenience endpoint: returns BLAs in OPEN/PARTLY_CLOSED status where today
    falls within [validFrom, validTo].

    Optionally filtered by vendor_id and/or item_id.

    Used by the PO form (T-200.26) to surface "you have an active BLA for this
    item — use its price?" hint before the user enters a line unit price.

    Args:
        organization_id: Override org.
        vendor_id:       Optional filter by vendor UUID.
        item_id:         Optional filter by item UUID in BLA lines.
        page:            Page number (1-based).
        page_size:       Items per page (max 200).
        current_user:    Authenticated user.
        db:              Motor database dependency.

    Returns:
        Paginated list of active BLAs.
    """
    org_id = _get_org_id(organization_id, current_user)
    result = await list_blanket_agreements(
        db,
        org_id,
        vendor_id=vendor_id,
        item_id=item_id,
        is_active=True,
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
    "/blanket-agreements",
    response_model=PaginatedResponse[BlanketAgreementListItem],
    summary="List Blanket Agreements",
)
async def list_blas(
    organization_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    status_filter: Optional[str] = Query(None, alias="status"),
    vendor_id: Optional[str] = Query(None),
    agreement_type: Optional[str] = Query(None),
    item_id: Optional[str] = Query(None),
    valid_from_after: Optional[datetime] = Query(None),
    valid_from_before: Optional[datetime] = Query(None),
    valid_to_after: Optional[datetime] = Query(None),
    valid_to_before: Optional[datetime] = Query(None),
    is_active: Optional[bool] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> PaginatedResponse[BlanketAgreementListItem]:
    """
    Paginated list of Blanket Agreements.

    Args:
        organization_id:   Override org.
        page:              Page number (1-based).
        page_size:         Items per page (max 200).
        status_filter:     Filter by status string.
        vendor_id:         Filter by vendorId.
        agreement_type:    Filter by "line_based" or "amount_based".
        item_id:           Filter by item UUID in BLA lines.
        valid_from_after:  Filter validFrom >= value.
        valid_from_before: Filter validFrom <= value.
        valid_to_after:    Filter validTo >= value.
        valid_to_before:   Filter validTo <= value.
        is_active:         When true, return only active BLAs (status + date window).
        current_user:      Authenticated user.
        db:                Motor database dependency.

    Returns:
        Paginated Blanket Agreement list.
    """
    org_id = _get_org_id(organization_id, current_user)
    result = await list_blanket_agreements(
        db,
        org_id,
        vendor_id=vendor_id,
        status=status_filter,
        agreement_type=agreement_type,
        item_id=item_id,
        valid_from_after=valid_from_after,
        valid_from_before=valid_from_before,
        valid_to_after=valid_to_after,
        valid_to_before=valid_to_before,
        is_active=is_active,
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
    "/blanket-agreements",
    response_model=SuccessResponse[BlanketAgreementResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create Blanket Agreement",
)
async def create_bla(
    request: Request,
    body: BlanketAgreementCreate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> SuccessResponse[BlanketAgreementResponse]:
    """
    Create a Draft Blanket Agreement.

    A BLA is a STANDALONE document — it does not chain from a PR or PO.
    Use it to formalise a long-term volume/price commitment with a vendor.

    The BLA starts in DRAFT status and can be submitted for approval
    (DRAFT → PENDING_APPROVAL → OPEN) or opened directly (DRAFT → OPEN)
    for organisations that skip the approval gate.

    Args:
        request:         Incoming HTTP request (Bearer token for company resolver).
        body:            BLA creation payload.
        organization_id: Override org.
        current_user:    Authenticated user (must have BLA write role).
        db:              Motor database dependency.

    Returns:
        Created BlanketAgreementResponse (status: draft).

    Raises:
        HTTPException 400: If company code cannot be resolved.
        HTTPException 422: Validation error (e.g. valid_to <= valid_from).
    """
    _require_bla_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    # Reason: resolve companyCode from finance service — no hardcoded default.
    if not body.company_code:
        company_code = await resolve_company_code(
            organization_id=org_id,
            auth_token=_extract_token(request),
        )
        body = body.model_copy(update={"company_code": company_code})

    try:
        bla = await create_blanket_agreement(
            db=db,
            payload=body,
            org_id=org_id,
            user_id=current_user.userId,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )

    return SuccessResponse(data=bla, message="Blanket Agreement created successfully")


# ---------------------------------------------------------------------------
# Get / Update / Delete  (/{doc_id} routes AFTER /active and collection-level)
# ---------------------------------------------------------------------------


@router.get(
    "/blanket-agreements/{doc_id}",
    response_model=SuccessResponse[BlanketAgreementResponse],
    summary="Get Blanket Agreement detail",
)
async def get_bla(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> SuccessResponse[BlanketAgreementResponse]:
    """
    Retrieve a single Blanket Agreement with all embedded lines.

    The response includes computed ``totals.outstanding_amount`` =
    gross - consumed_amount, and per-line ``outstanding_qty`` =
    committed_quantity - consumed_qty.

    Args:
        doc_id:          BLA UUID string.
        organization_id: Override org.
        current_user:    Authenticated user.
        db:              Motor database dependency.

    Returns:
        BlanketAgreementResponse.

    Raises:
        HTTPException 404: If BLA not found.
    """
    org_id = _get_org_id(organization_id, current_user)
    bla = await get_blanket_agreement(db=db, doc_id=doc_id, org_id=org_id)
    if bla is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Blanket Agreement '{doc_id}' not found",
        )
    return SuccessResponse(data=bla)


@router.patch(
    "/blanket-agreements/{doc_id}",
    response_model=SuccessResponse[BlanketAgreementResponse],
    summary="Update Draft Blanket Agreement",
)
async def update_bla(
    doc_id: str,
    body: BlanketAgreementUpdate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> SuccessResponse[BlanketAgreementResponse]:
    """
    Partially update a Draft Blanket Agreement.

    vendor, companyCode, and agreement_type are immutable after creation.
    Lines, when supplied, replace the current set wholesale.

    Args:
        doc_id:          BLA UUID string.
        body:            Partial update payload.
        organization_id: Override org.
        current_user:    Authenticated user (must have BLA write role).
        db:              Motor database dependency.

    Returns:
        Updated BlanketAgreementResponse.

    Raises:
        HTTPException 409: If BLA is not in Draft status.
        HTTPException 404: If not found.
    """
    _require_bla_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        bla = await update_blanket_agreement(
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

    if bla is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Blanket Agreement '{doc_id}' not found",
        )
    return SuccessResponse(data=bla, message="Blanket Agreement updated")


@router.delete(
    "/blanket-agreements/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Hard-delete Draft Blanket Agreement (super_admin only)",
)
async def delete_bla(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> None:
    """
    Hard-delete a Draft Blanket Agreement.

    Only Draft BLAs may be deleted.  Active/posted BLAs are
    immutable per accounting immutability rules.

    Only super_admin can delete BLAs — the action is irreversible.

    Args:
        doc_id:          BLA UUID string.
        organization_id: Override org.
        current_user:    Authenticated user (must be super_admin).
        db:              Motor database dependency.

    Raises:
        HTTPException 403: If not super_admin.
        HTTPException 409: If BLA is not in Draft status.
        HTTPException 404: If not found.
    """
    _require_bla_delete(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        deleted = await delete_blanket_agreement(
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
            detail=f"Blanket Agreement '{doc_id}' not found",
        )


# ---------------------------------------------------------------------------
# State transitions
# ---------------------------------------------------------------------------


@router.patch(
    "/blanket-agreements/{doc_id}/status",
    response_model=SuccessResponse[BlanketAgreementResponse],
    summary="Transition Blanket Agreement status",
)
async def transition_bla_status(
    doc_id: str,
    body: BlanketAgreementStatusTransitionRequest,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> SuccessResponse[BlanketAgreementResponse]:
    """
    Transition a Blanket Agreement to a new status.

    Legal transitions (see BLA in document_status.py):
      - draft            → pending_approval   (submit for approval)
      - draft            → open               (direct-open, small-org path)
      - pending_approval → open               (approve)
      - pending_approval → draft              (reject / withdraw)
      - open             → partly_closed      (partial consumption — usually auto via T-200.25.1)
      - open/partly_closed → closed           (full consumption — usually auto via T-200.25.1)
      - open/partly_closed → cancelled        (void the agreement)

    BLAs do NOT post to the GL — no outbox event is emitted on any transition.

    Args:
        doc_id:          BLA UUID string.
        body:            Transition request with target_status and optional notes.
        organization_id: Override org.
        current_user:    Authenticated user (must have BLA write role).
        db:              Motor database dependency.

    Returns:
        Updated BlanketAgreementResponse.

    Raises:
        HTTPException 409: If the transition is illegal.
        HTTPException 404: If not found.
    """
    _require_bla_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        bla = await transition_status(
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

    if bla is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Blanket Agreement '{doc_id}' not found",
        )
    return SuccessResponse(
        data=bla,
        message=f"Blanket Agreement transitioned to {body.target_status}",
    )
