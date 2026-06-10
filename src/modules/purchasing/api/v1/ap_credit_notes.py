"""
Purchasing Module — AP Credit Note API (T-200.23 / Wave 4)

CRUD + state transitions for AP Credit Note documents.

An AP Credit Note (ACN) is the vendor-side counterpart to the sales AR Credit Note.
It records vendor billing corrections, post-AP discounts, vendor refunds, and
bad-debt write-offs.

Two creation paths:
  1. Direct-create:      POST /ap-credit-notes
  2. From-AP-Invoice:    POST /ap-credit-notes/from-invoice/{ap_doc_id}

State machine (AP_CREDIT in document_status.py):
  Draft → Pending Approval → Open (posted) → Closed
  Pending Approval → Draft  (rejection / withdraw)

On PENDING_APPROVAL → OPEN posting:
  - From-AP-Invoice path: AP Invoice line creditedQty and header creditedAmount
    are incremented via purchasing_chain_reconciler. AP auto-closes if fully credited.
  - Both paths: ap_credit_note_posted outbox event emitted for finance JE booking.

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
    APCreditNoteCreate,
    APCreditNoteListItem,
    APCreditNoteResponse,
    APCreditNoteStatusTransitionRequest,
    APCreditNoteUpdate,
)
from ...services.ap_credit_note_service import (
    create_ap_credit_note,
    create_ap_credit_note_from_invoice,
    delete_ap_credit_note,
    get_ap_credit_note,
    list_ap_credit_notes,
    transition_status,
    update_ap_credit_note,
)
from src.modules.farm_manager.utils.responses import (
    PaginatedResponse,
    PaginationMeta,
    SuccessResponse,
)
from src.modules.farm_manager.services.database import farm_db
from src.core.finance.company_resolver import resolve_company_code

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Purchasing — AP Credit Notes"])

# ---------------------------------------------------------------------------
# Role sets
# ---------------------------------------------------------------------------

_ACN_WRITE_ROLES = frozenset({
    "procurement_officer",
    "procurement_manager",
    "admin",
    "super_admin",
    "accountant",
    "finance_admin",
})

_ACN_DELETE_ROLES = frozenset({"super_admin"})


def _require_acn_write(current_user: CurrentUser) -> None:
    """
    Raise HTTPException 403 if the user cannot create/update AP Credit Notes.

    Args:
        current_user: Authenticated user object from JWT.

    Raises:
        HTTPException: 403 if role not in _ACN_WRITE_ROLES.
    """
    if current_user.role not in _ACN_WRITE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Permission denied: procurement_officer, accountant, or "
                "finance_admin role required"
            ),
        )


def _require_acn_delete(current_user: CurrentUser) -> None:
    """
    Raise HTTPException 403 if the user cannot delete AP Credit Notes.

    Only super_admin can hard-delete Draft AP Credit Notes.

    Args:
        current_user: Authenticated user object from JWT.

    Raises:
        HTTPException: 403 if role not in _ACN_DELETE_ROLES.
    """
    if current_user.role not in _ACN_DELETE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: super_admin role required to delete AP Credit Notes",
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
# List + Create
# ---------------------------------------------------------------------------


@router.get(
    "/ap-credit-notes",
    response_model=PaginatedResponse[APCreditNoteListItem],
    summary="List AP Credit Notes",
)
async def list_acns(
    organization_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    status_filter: Optional[str] = Query(None, alias="status"),
    vendor_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> PaginatedResponse[APCreditNoteListItem]:
    """
    Paginated list of AP Credit Notes.

    Args:
        organization_id: Override org.
        page:            Page number (1-based).
        page_size:       Items per page (max 200).
        status_filter:   Filter by status string.
        vendor_id:       Filter by vendorId.
        current_user:    Authenticated user.
        db:              Motor database dependency.

    Returns:
        Paginated AP Credit Note list.
    """
    org_id = _get_org_id(organization_id, current_user)
    result = await list_ap_credit_notes(
        db,
        org_id,
        vendor_id=vendor_id,
        status=status_filter,
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
    "/ap-credit-notes",
    response_model=SuccessResponse[APCreditNoteResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create AP Credit Note (direct-create path)",
)
async def create_acn_direct(
    request: Request,
    body: APCreditNoteCreate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> SuccessResponse[APCreditNoteResponse]:
    """
    Create a Draft AP Credit Note without a source AP Invoice.

    Used for:
    - Vendor billing corrections spanning multiple invoices
    - Goodwill credits / post-discount adjustments
    - Bad-debt write-offs against vendor balances

    Args:
        request:         Incoming HTTP request (Bearer token for company resolver).
        body:            AP Credit Note creation payload.
        organization_id: Override org.
        current_user:    Authenticated user (must have ACN write role).
        db:              Motor database dependency.

    Returns:
        Created APCreditNoteResponse (status: draft).

    Raises:
        HTTPException 400: If company code cannot be resolved.
        HTTPException 422: Validation error.
    """
    _require_acn_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    # Reason: resolve companyCode from finance service — no hardcoded default.
    if not body.company_code:
        company_code = await resolve_company_code(
            organization_id=org_id,
            auth_token=_extract_token(request),
        )
        # Inject resolved code into the payload by rebuilding with the resolved code.
        body = body.model_copy(update={"company_code": company_code})

    try:
        acn = await create_ap_credit_note(
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

    return SuccessResponse(data=acn, message="AP Credit Note created successfully")


@router.post(
    "/ap-credit-notes/from-invoice/{ap_doc_id}",
    response_model=SuccessResponse[APCreditNoteResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create AP Credit Note from a source AP Invoice",
)
async def create_acn_from_invoice(
    request: Request,
    ap_doc_id: str,
    body: APCreditNoteCreate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> SuccessResponse[APCreditNoteResponse]:
    """
    Create a Draft AP Credit Note chained to an existing AP Invoice.

    Validates that the source AP Invoice is in a creditable state and that the
    requested credit amount does not exceed the remaining open balance.

    Vendor, currency, and company code are inherited from the source AP.

    Args:
        request:         Incoming HTTP request.
        ap_doc_id:       UUID of the source AP Invoice.
        body:            AP Credit Note creation payload with line items.
        organization_id: Override org.
        current_user:    Authenticated user (must have ACN write role).
        db:              Motor database dependency.

    Returns:
        Created APCreditNoteResponse (status: draft).

    Raises:
        HTTPException 404: If source AP Invoice not found.
        HTTPException 422: If source AP not in creditable status, or qty cap exceeded.
    """
    _require_acn_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        acn = await create_ap_credit_note_from_invoice(
            db=db,
            ap_doc_id=ap_doc_id,
            payload=body,
            org_id=org_id,
            user_id=current_user.userId,
            auth_token=_extract_token(request),
        )
    except ValueError as exc:
        detail = str(exc)
        code = (
            status.HTTP_404_NOT_FOUND
            if "not found" in detail.lower()
            else status.HTTP_422_UNPROCESSABLE_ENTITY
        )
        raise HTTPException(status_code=code, detail=detail)

    return SuccessResponse(data=acn, message="AP Credit Note created from AP Invoice")


# ---------------------------------------------------------------------------
# Get / Update / Delete
# ---------------------------------------------------------------------------


@router.get(
    "/ap-credit-notes/{doc_id}",
    response_model=SuccessResponse[APCreditNoteResponse],
    summary="Get AP Credit Note detail",
)
async def get_acn(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> SuccessResponse[APCreditNoteResponse]:
    """
    Retrieve a single AP Credit Note with all embedded lines.

    Args:
        doc_id:          AP Credit Note UUID string.
        organization_id: Override org.
        current_user:    Authenticated user.
        db:              Motor database dependency.

    Returns:
        APCreditNoteResponse.

    Raises:
        HTTPException 404: If AP Credit Note not found.
    """
    org_id = _get_org_id(organization_id, current_user)
    acn = await get_ap_credit_note(db=db, doc_id=doc_id, org_id=org_id)
    if acn is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"AP Credit Note '{doc_id}' not found",
        )
    return SuccessResponse(data=acn)


@router.patch(
    "/ap-credit-notes/{doc_id}",
    response_model=SuccessResponse[APCreditNoteResponse],
    summary="Update Draft AP Credit Note",
)
async def update_acn(
    doc_id: str,
    body: APCreditNoteUpdate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> SuccessResponse[APCreditNoteResponse]:
    """
    Partially update a Draft AP Credit Note.

    Vendor, companyCode, and baseInvoiceDocRef are immutable after creation.
    Lines, when supplied, replace the current set wholesale.

    Args:
        doc_id:          AP Credit Note UUID string.
        body:            Partial update payload.
        organization_id: Override org.
        current_user:    Authenticated user (must have ACN write role).
        db:              Motor database dependency.

    Returns:
        Updated APCreditNoteResponse.

    Raises:
        HTTPException 409: If AP Credit Note is not in Draft status.
        HTTPException 404: If not found.
    """
    _require_acn_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        acn = await update_ap_credit_note(
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

    if acn is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"AP Credit Note '{doc_id}' not found",
        )
    return SuccessResponse(data=acn, message="AP Credit Note updated")


@router.delete(
    "/ap-credit-notes/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Hard-delete Draft AP Credit Note (super_admin only)",
)
async def delete_acn(
    doc_id: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> None:
    """
    Hard-delete a Draft AP Credit Note.

    Only Draft AP Credit Notes may be deleted.  Posted (OPEN/CLOSED) Credit Notes
    are immutable per accounting immutability rules.

    Only super_admin can delete AP Credit Notes — the action is irreversible
    and modifies the audit trail's referential integrity.

    Args:
        doc_id:          AP Credit Note UUID string.
        organization_id: Override org.
        current_user:    Authenticated user (must be super_admin).
        db:              Motor database dependency.

    Raises:
        HTTPException 403: If not super_admin.
        HTTPException 409: If AP Credit Note is not in Draft status.
        HTTPException 404: If not found.
    """
    _require_acn_delete(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        deleted = await delete_ap_credit_note(
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
            detail=f"AP Credit Note '{doc_id}' not found",
        )


# ---------------------------------------------------------------------------
# State transitions
# ---------------------------------------------------------------------------


@router.patch(
    "/ap-credit-notes/{doc_id}/status",
    response_model=SuccessResponse[APCreditNoteResponse],
    summary="Transition AP Credit Note status",
)
async def transition_acn_status(
    doc_id: str,
    body: APCreditNoteStatusTransitionRequest,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> SuccessResponse[APCreditNoteResponse]:
    """
    Transition an AP Credit Note to a new status.

    Legal transitions (see AP_CREDIT in document_status.py):
      - draft            → pending_approval   (submit for approval)
      - pending_approval → open               (approve and post — financial event)
      - pending_approval → draft              (reject / withdraw)
      - open             → closed             (terminal)

    The PENDING_APPROVAL → OPEN transition is the financial posting event:
      - For from-AP-Invoice ACNs: AP Invoice creditedAmount and line creditedQty
        are incremented. AP auto-closes if fully credited.
      - ap_credit_note_posted outbox event is emitted for finance JE booking.

    Args:
        doc_id:          AP Credit Note UUID string.
        body:            Transition request with target_status and optional notes.
        organization_id: Override org.
        current_user:    Authenticated user (must have ACN write role).
        db:              Motor database dependency.

    Returns:
        Updated APCreditNoteResponse.

    Raises:
        HTTPException 409: If the transition is illegal.
        HTTPException 404: If not found.
    """
    _require_acn_write(current_user)
    org_id = _get_org_id(organization_id, current_user)

    try:
        acn = await transition_status(
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

    if acn is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"AP Credit Note '{doc_id}' not found",
        )
    return SuccessResponse(data=acn, message=f"AP Credit Note transitioned to {body.target_status}")
