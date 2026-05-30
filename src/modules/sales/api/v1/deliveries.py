"""
Sales Module — Delivery Note (DN) API Routes — v2

Endpoints for the Delivery Note (DN) document lifecycle.

A Delivery records physical goods leaving the warehouse for a customer.
It MUST be created from an existing Sales Order (no from-scratch path in v1).
On DRAFT → OPEN transition it:
  - Decrements inventory (inventory_movements rows).
  - Increments source SO line delivered_qty.
  - Emits delivery_posted event to the finance outbox (finance posts COGS JE
    in T-100.8.1).

Permissions (mirrors sales_orders.py pattern):
  - Read:   any authenticated active user
  - Write:  sales.create / sales.edit roles
  - Delete: sales.delete role

Endpoint set:
  GET    /deliveries                               — paginated list with filters
  GET    /deliveries/{doc_entry}                   — single Delivery with all lines
  POST   /deliveries/from-so/{so_doc_entry}        — create from Sales Order (DRAFT)
  PATCH  /deliveries/{doc_entry}                   — update header/lines (DRAFT only)
  DELETE /deliveries/{doc_entry}                   — hard delete (DRAFT only)
  POST   /deliveries/{doc_entry}/transition        — status transition

Prefix: /deliveries (registered in api/v1/__init__.py)
Full prefix after module registration: /api/v1/sales/deliveries

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
from ...models.deliveries import (
    DeliveryFromSORequest,
    DeliveryListItem,
    DeliveryResponse,
    DeliveryStatusTransitionRequest,
    DeliveryUpdate,
)
from ...services.delivery_service import (
    create_delivery_from_so,
    delete_delivery,
    get_delivery,
    list_deliveries,
    transition_status,
    update_delivery,
)
from ...utils.responses import PaginatedResponse, PaginationMeta, SuccessResponse
from src.modules.sales.services.database import sales_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Sales — Deliveries"])


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
    response_model=PaginatedResponse[DeliveryListItem],
    response_model_by_alias=True,
    summary="List Delivery Notes",
    description=(
        "Return a paginated list of Delivery Notes for the given organisation. "
        "Supports filtering by status, customer_id, so_doc_entry, and date range."
    ),
)
async def list_deliveries_endpoint(
    organization_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    customer_id: Optional[str] = Query(None),
    so_doc_entry: Optional[str] = Query(None, description="Filter by source SO UUID"),
    date_from: Optional[date] = Query(None, description="Inclusive lower bound on doc_date"),
    date_to: Optional[date] = Query(None, description="Inclusive upper bound on doc_date"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> PaginatedResponse[DeliveryListItem]:
    """
    Paginated list of Delivery Notes for an organisation.

    Args:
        organization_id: Organisation UUID (defaults to JWT claim).
        status_filter:   Filter by status value.
        customer_id:     Filter by customer FK.
        so_doc_entry:    Filter by source SO UUID.
        date_from:       Inclusive lower bound on docDate.
        date_to:         Inclusive upper bound on docDate.
        page:            1-based page number.
        size:            Items per page (max 200).
        current_user:    Authenticated user.
        db:              Motor database dependency.

    Returns:
        PaginatedResponse containing DeliveryListItem objects.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    result = await list_deliveries(
        db,
        org_id=org_id,
        status=status_filter,
        customer_id=customer_id,
        so_doc_entry=so_doc_entry,
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
    response_model=SuccessResponse[DeliveryResponse],
    response_model_by_alias=True,
    summary="Get Delivery Note detail",
)
async def get_delivery_endpoint(
    doc_entry: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
    db=Depends(_get_db),
) -> SuccessResponse[DeliveryResponse]:
    """
    Retrieve a single Delivery Note with all embedded lines.

    Args:
        doc_entry:       UUID of the Delivery.
        organization_id: Organisation UUID for scoping (defaults to JWT claim).
        current_user:    Authenticated user.
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping DeliveryResponse.

    Raises:
        HTTPException 404: If the Delivery is not found.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    dn = await get_delivery(db, doc_entry=doc_entry, org_id=org_id)
    if dn is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Delivery '{doc_entry}' not found",
        )
    return SuccessResponse(data=dn)


# ---------------------------------------------------------------------------
# Create from SO
# ---------------------------------------------------------------------------


@router.post(
    "/from-so/{so_doc_entry}",
    response_model=SuccessResponse[DeliveryResponse],
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create Delivery Note from Sales Order",
)
async def create_delivery_from_so_endpoint(
    so_doc_entry: str,
    body: DeliveryFromSORequest,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.create")),
    db=Depends(_get_db),
) -> SuccessResponse[DeliveryResponse]:
    """
    Create a new Delivery Note by shipping goods against an open Sales Order.

    The Delivery is created in DRAFT status.  Each line in the body must
    reference a valid SO line (so_line_id) with available open_qty.

    On DRAFT → OPEN (via the /transition endpoint):
      - Inventory is decremented.
      - SO line delivered_qty is incremented.
      - delivery_posted outbox event is emitted (finance posts COGS JE in T-100.8.1).

    Args:
        so_doc_entry:    UUID of the source Sales Order.
        body:            DeliveryFromSORequest with header fields and lines.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.create permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping the newly created DeliveryResponse (HTTP 201).

    Raises:
        HTTPException 404: If the SO is not found.
        HTTPException 409: If the SO is not in OPEN or PARTLY_CLOSED status.
        HTTPException 422: If any line qty exceeds the SO line open_qty.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        dn = await create_delivery_from_so(
            db,
            so_doc_entry=so_doc_entry,
            payload=body,
            org_id=org_id,
            user_id=current_user.userId,
        )
    except ValueError as exc:
        err_msg = str(exc)
        if "not found" in err_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=err_msg,
            )
        if "status is" in err_msg.lower():
            # SO status check — business conflict.
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=err_msg,
            )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=err_msg,
        )

    return SuccessResponse(data=dn, message="Delivery Note created successfully")


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


@router.patch(
    "/{doc_entry}",
    response_model=SuccessResponse[DeliveryResponse],
    response_model_by_alias=True,
    summary="Update draft Delivery Note",
)
async def update_delivery_endpoint(
    doc_entry: str,
    body: DeliveryUpdate,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    db=Depends(_get_db),
) -> SuccessResponse[DeliveryResponse]:
    """
    Partially update a DRAFT Delivery Note.

    If lines is provided in the body, the existing line set is replaced
    wholesale and all costs are recomputed from current moving-avg values.

    Args:
        doc_entry:       UUID of the Delivery.
        body:            Partial update payload.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.edit permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping the updated DeliveryResponse.

    Raises:
        HTTPException 404: If the Delivery is not found.
        HTTPException 409: If the Delivery is not in DRAFT status.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        dn = await update_delivery(
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

    if dn is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Delivery '{doc_entry}' not found",
        )
    return SuccessResponse(data=dn, message="Delivery updated")


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


@router.delete(
    "/{doc_entry}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete draft Delivery Note",
)
async def delete_delivery_endpoint(
    doc_entry: str,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.delete")),
    db=Depends(_get_db),
) -> None:
    """
    Hard-delete a DRAFT Delivery Note.

    Only DRAFT Deliveries may be deleted.

    Args:
        doc_entry:       UUID of the Delivery.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.delete permission).
        db:              Motor database dependency.

    Raises:
        HTTPException 404: If the Delivery is not found.
        HTTPException 409: If the Delivery is not in DRAFT status.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        deleted = await delete_delivery(
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
            detail=f"Delivery '{doc_entry}' not found",
        )


# ---------------------------------------------------------------------------
# Status transition
# ---------------------------------------------------------------------------


@router.post(
    "/{doc_entry}/transition",
    response_model=SuccessResponse[DeliveryResponse],
    response_model_by_alias=True,
    summary="Transition Delivery Note status",
)
async def transition_delivery_status(
    doc_entry: str,
    body: DeliveryStatusTransitionRequest,
    organization_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    db=Depends(_get_db),
) -> SuccessResponse[DeliveryResponse]:
    """
    Transition a Delivery Note to a new status.

    Legal transitions for DELIVERY (from T-100.1 LEGAL_TRANSITIONS):
        DRAFT        → OPEN, CANCELLED
        OPEN         → PARTLY_CLOSED, CLOSED
        PARTLY_CLOSED → CLOSED
        CLOSED        → (terminal)

    On DRAFT → OPEN:
      - Moving-avg unit_cost is re-snapshotted per line.
      - Inventory decremented (inventory_movements rows inserted).
      - Source SO line delivered_qty incremented.
      - Source SO auto-transitioned if all lines are now delivered.
      - delivery_posted outbox event emitted to finance_outbox.

    On OPEN → CANCELLED:
      - Inventory restored (reversing inventory_movements rows).
      - Source SO line delivered_qty decremented.
      - delivery_cancelled outbox event emitted.

    On → CLOSED (from OPEN or PARTLY_CLOSED):
      - Status flip only; no inventory or event side-effects.

    Args:
        doc_entry:       UUID of the Delivery.
        body:            Transition request with new_status and optional reason.
        organization_id: Organisation UUID for scoping.
        current_user:    Authenticated user (must hold sales.edit permission).
        db:              Motor database dependency.

    Returns:
        SuccessResponse wrapping the updated DeliveryResponse.

    Raises:
        HTTPException 404: If the Delivery is not found.
        HTTPException 422: If the transition is illegal.
    """
    org_id = _resolve_org_id(organization_id, current_user)

    try:
        dn = await transition_status(
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

    if dn is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Delivery '{doc_entry}' not found",
        )

    return SuccessResponse(
        data=dn,
        message=f"Delivery status updated to '{body.new_status.value}'",
    )
