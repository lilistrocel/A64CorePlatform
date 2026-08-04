"""
Sales Module - Sales Order API Routes

Endpoints for sales order CRUD operations.

Phase 4 additions:
  - GET  /{order_id}/delete-preview  — two-step delete step 1
  - POST /{order_id}/delete          — two-step delete step 2 (confirm)
  - POST /{order_id}/report-return   — report customer return
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional
from uuid import UUID
import logging

from ...models.sales_order import (
    SalesOrder,
    SalesOrderCreate,
    SalesOrderUpdate,
    SalesOrderStatus,
    DeletePreviewResponse,
    DeleteOrderRequest,
    DeleteOrderResponse,
    ReportReturnRequest,
    ReportReturnResponse,
)
from ...services.sales import OrderService
from ...middleware.auth import get_current_active_user, require_permission, CurrentUser
from ...utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "",
    response_model=SuccessResponse[SalesOrder],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new sales order",
    description=(
        "Create a new sales order. Requires sales.create permission. "
        "Validates customer exists in CRM. "
        "When status=CONFIRMED and allocations are present, inventory is reserved immediately."
    ),
)
async def create_order(
    order_data: SalesOrderCreate,
    current_user: CurrentUser = Depends(require_permission("sales.create")),
    service: OrderService = Depends(),
):
    """
    Create a new sales order.

    - **customerId**: Customer ID from CRM (required, must exist)
    - **customerName**: Customer name (denormalized for quick access)
    - **status**: Order status (default: draft). DRAFT orders skip inventory reservation.
    - **orderDate**: Order date (default: current time)
    - **items**: List of order items (required, min 1 item). Each item may carry
      an ``allocations[]`` list pointing to specific inventory_harvest /
      inventory_returned batches (Phase 4 linked-stock flow).
    - **subtotal**: Subtotal amount (must match sum of item totals)
    - **tax**: Tax amount (default: 0)
    - **discount**: Discount amount (default: 0)
    - **total**: Total amount (must equal subtotal + tax - discount)
    - **paymentStatus**: Payment status (default: pending)
    - **shippingAddress**: Shipping address (optional)
    - **notes**: Additional notes (optional)
    """
    order = await service.create_order(order_data, UUID(current_user.userId))

    return SuccessResponse(data=order, message="Sales order created successfully")


@router.get(
    "",
    response_model=PaginatedResponse[SalesOrder],
    summary="Get all sales orders",
    description=(
        "Get all sales orders with pagination and filters. "
        "Requires sales.view permission. "
        "Soft-deleted orders (cancelled via delete flow) are hidden by default; "
        "pass ?include_deleted=true to include them."
    ),
)
async def get_orders(
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[SalesOrderStatus] = Query(
        None, description="Filter by order status"
    ),
    customerId: Optional[UUID] = Query(None, description="Filter by customer ID"),
    farmingYear: Optional[int] = Query(None, description="Filter by farming year"),
    include_deleted: bool = Query(
        False, description="Include soft-deleted (cancelled via delete) orders"
    ),
    current_user: CurrentUser = Depends(require_permission("sales.view")),
    service: OrderService = Depends(),
):
    """
    Get all sales orders with pagination.

    - **page**: Page number (default: 1)
    - **perPage**: Items per page (default: 20, max: 100)
    - **status**: Filter by order status (optional)
    - **customerId**: Filter by customer ID (optional)
    - **farmingYear**: Filter by farming year (optional)
    - **include_deleted**: Include soft-deleted orders (default: false)
    """
    orders, total, total_pages = await service.get_all_orders(
        page, perPage, status, customerId, farmingYear, include_deleted
    )

    return PaginatedResponse(
        data=orders,
        meta=PaginationMeta(
            total=total, page=page, perPage=perPage, totalPages=total_pages
        ),
    )


@router.get(
    "/{order_id}",
    response_model=SuccessResponse[SalesOrder],
    summary="Get sales order by ID",
    description="Get a specific sales order by ID. Requires sales.view permission.",
)
async def get_order(
    order_id: UUID,
    current_user: CurrentUser = Depends(require_permission("sales.view")),
    service: OrderService = Depends(),
):
    """
    Get sales order by ID.

    - **order_id**: Sales order UUID
    """
    order = await service.get_order(order_id)

    return SuccessResponse(data=order)


@router.patch(
    "/{order_id}",
    response_model=SuccessResponse[SalesOrder],
    summary="Update sales order",
    description="Update a sales order. Requires sales.edit permission.",
)
async def update_order(
    order_id: UUID,
    update_data: SalesOrderUpdate,
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    service: OrderService = Depends(),
):
    """
    Update a sales order.

    - **order_id**: Sales order UUID
    - All fields are optional (partial update)
    """
    order = await service.update_order(order_id, update_data)

    return SuccessResponse(data=order, message="Sales order updated successfully")


@router.patch(
    "/{order_id}/status",
    response_model=SuccessResponse[SalesOrder],
    summary="Update sales order status",
    description=(
        "Update sales order status. Requires sales.edit permission. "
        "CONFIRMED→CANCELLED releases inventory reservations. "
        "any→SHIPPED deducts allocated quantities from inventory batches."
    ),
)
async def update_order_status(
    order_id: UUID,
    new_status: SalesOrderStatus = Query(..., description="New order status"),
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    service: OrderService = Depends(),
):
    """
    Update sales order status.

    - **order_id**: Sales order UUID
    - **new_status**: New status value (draft, confirmed, processing, shipped, delivered, cancelled)
    """
    order = await service.update_order_status(
        order_id,
        new_status,
        updated_by=UUID(current_user.userId),
    )

    return SuccessResponse(
        data=order, message=f"Sales order status updated to {new_status.value}"
    )


@router.post(
    "/{order_id}/confirm",
    response_model=SuccessResponse[SalesOrder],
    summary="Confirm a sales order",
    description="Confirm a draft order and reserve inventory. Requires sales.edit permission.",
)
async def confirm_order(
    order_id: UUID,
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    service: OrderService = Depends(),
):
    """
    Confirm a sales order and reserve inventory.

    - **order_id**: Sales order UUID (must be in draft status)

    This action:
    - Validates the order is in draft status
    - Reserves inventory for all per-batch allocations (Phase 4 linked-stock)
    - Falls back to item.inventoryId reservation for legacy orders
    - Updates order status to confirmed
    """
    order = await service.confirm_order(order_id, UUID(current_user.userId))

    return SuccessResponse(
        data=order, message="Sales order confirmed and inventory reserved"
    )


# ---------------------------------------------------------------------------
# Two-step delete — Deliverable 4
# ---------------------------------------------------------------------------


@router.get(
    "/{order_id}/delete-preview",
    response_model=SuccessResponse[DeletePreviewResponse],
    summary="Preview order deletion",
    description=(
        "Step 1 of two-step delete. Returns per-allocation state (active / expired / missing) "
        "so the UI can prompt for per-batch decisions before confirming deletion. "
        "Returns canDelete=false with a reason for SHIPPED, DELIVERED, or CANCELLED orders. "
        "Requires sales.delete permission."
    ),
)
async def get_delete_preview(
    order_id: UUID,
    current_user: CurrentUser = Depends(require_permission("sales.delete")),
    service: OrderService = Depends(),
):
    """
    Preview what will happen when this order is deleted.

    - **order_id**: Sales order UUID

    Returns:
    - **canDelete**: false if order is in a terminal status (SHIPPED/DELIVERED/CANCELLED)
    - **allocations**: per-batch state — active, expired, or missing
    - For expired batches: **expiredWasteId** and **expiredOn** are populated so the
      UI can show context and prompt for a decision (restore / revive / waste)
    """
    preview = await service.get_delete_preview(order_id)

    return SuccessResponse(data=preview, message="Delete preview generated")


@router.post(
    "/{order_id}/delete",
    response_model=SuccessResponse[DeleteOrderResponse],
    summary="Confirm order deletion",
    description=(
        "Step 2 of two-step delete. Applies per-batch decisions (restore / revive / waste) "
        "and soft-deletes the order (status → cancelled, deletedAt = now). "
        "Requires sales.delete permission."
    ),
)
async def confirm_delete_order(
    order_id: UUID,
    request: DeleteOrderRequest,
    current_user: CurrentUser = Depends(require_permission("sales.delete")),
    service: OrderService = Depends(),
):
    """
    Confirm deletion of a sales order with per-batch inventory decisions.

    - **order_id**: Sales order UUID
    - **decisions**: List of BatchDecision objects for expired/missing allocations.
      Active allocations are auto-restored and do not require an explicit decision.
      Each decision specifies action (restore / revive / waste) and, for 'revive',
      a new expiryDate (must be in the future).

    The order is soft-deleted: status set to 'cancelled', deletedAt stamped.
    The order will no longer appear in the default list view.
    """
    result = await service.confirm_delete_order(
        order_id,
        request,
        deleted_by=UUID(current_user.userId),
    )

    return SuccessResponse(data=result, message="Order deleted successfully")


# ---------------------------------------------------------------------------
# Report Return — Deliverable 5
# ---------------------------------------------------------------------------


@router.post(
    "/{order_id}/report-return",
    response_model=SuccessResponse[ReportReturnResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Report a customer return",
    description=(
        "Record goods returned by a customer for a SHIPPED or DELIVERED order. "
        "Sellable items are added to inventory_returned; spoiled items go to inventory_waste. "
        "A full record is inserted into return_orders (for the existing returns UI). "
        "A thin summary is appended to the order's returns[] array for display. "
        "Requires sales.edit permission."
    ),
)
async def report_return(
    order_id: UUID,
    request: ReportReturnRequest,
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    service: OrderService = Depends(),
):
    """
    Report a customer return against a shipped or delivered order.

    - **order_id**: Sales order UUID (must be SHIPPED or DELIVERED)
    - **items**: List of return items. For each item:
        - **orderItemIndex**: Index into order.items[] (0-based)
        - **quantity**: Quantity returned (kg)
        - **condition**: 'sellable' or 'spoiled'
        - **reason**: Optional return reason
        - **disposalMethod**: Required/recommended for spoiled items
    - **notes**: Optional overall notes for this return event

    Returns:
    - **returnId**: ID of the new return_orders record
    - **stockChanges**: Summary of kg added to inventory_returned vs inventory_waste
    """
    result = await service.report_return(
        order_id,
        request,
        returned_by=UUID(current_user.userId),
    )

    return SuccessResponse(data=result, message="Return reported and stock updated")


# ---------------------------------------------------------------------------
# Legacy hard-delete — kept for backward compatibility
# ---------------------------------------------------------------------------


@router.delete(
    "/{order_id}",
    response_model=SuccessResponse[dict],
    summary="Delete sales order (legacy hard-delete)",
    description=(
        "Hard-delete a sales order. For orders with allocations, prefer the two-step "
        "delete flow (GET /{id}/delete-preview + POST /{id}/delete) which handles "
        "inventory restoration with per-batch decisions. "
        "Requires sales.delete permission."
    ),
)
async def delete_order(
    order_id: UUID,
    current_user: CurrentUser = Depends(require_permission("sales.delete")),
    service: OrderService = Depends(),
):
    """
    Delete a sales order (legacy hard-delete).

    - **order_id**: Sales order UUID

    Note: This endpoint performs a hard-delete without inventory cleanup.
    Use POST /{order_id}/delete (with GET /{order_id}/delete-preview first)
    for orders with linked inventory allocations.
    """
    result = await service.delete_order(order_id)

    return SuccessResponse(data=result, message="Sales order deleted successfully")
