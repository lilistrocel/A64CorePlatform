"""
Sales Module - Sales Order API Routes

Endpoints for sales order CRUD operations.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional
from uuid import UUID
import logging

from ...models.sales_order import SalesOrder, SalesOrderCreate, SalesOrderUpdate, SalesOrderStatus
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
    description="Create a new sales order. Requires sales.create permission. Validates customer exists in CRM."
)
async def create_order(
    order_data: SalesOrderCreate,
    current_user: CurrentUser = Depends(require_permission("sales.create")),
    service: OrderService = Depends()
):
    """
    Create a new sales order

    - **customerId**: Customer ID from CRM (required, must exist)
    - **customerName**: Customer name (denormalized for quick access)
    - **status**: Order status (default: draft)
    - **orderDate**: Order date (default: current time)
    - **items**: List of order items (required, min 1 item)
    - **subtotal**: Subtotal amount (must match sum of item totals)
    - **tax**: Tax amount (default: 0)
    - **discount**: Discount amount (default: 0)
    - **total**: Total amount (must equal subtotal + tax - discount)
    - **paymentStatus**: Payment status (default: pending)
    - **shippingAddress**: Shipping address (optional)
    - **notes**: Additional notes (optional)
    """
    order = await service.create_order(
        order_data,
        UUID(current_user.userId)
    )

    return SuccessResponse(
        data=order,
        message="Sales order created successfully"
    )


@router.get(
    "",
    response_model=PaginatedResponse[SalesOrder],
    summary="Get all sales orders",
    description="Get all sales orders with pagination and filters. Requires sales.view permission."
)
async def get_orders(
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[SalesOrderStatus] = Query(None, description="Filter by order status"),
    customerId: Optional[UUID] = Query(None, description="Filter by customer ID"),
    current_user: CurrentUser = Depends(require_permission("sales.view")),
    service: OrderService = Depends()
):
    """
    Get all sales orders with pagination

    - **page**: Page number (default: 1)
    - **perPage**: Items per page (default: 20, max: 100)
    - **status**: Filter by order status (optional)
    - **customerId**: Filter by customer ID (optional)
    """
    orders, total, total_pages = await service.get_all_orders(
        page, perPage, status, customerId
    )

    return PaginatedResponse(
        data=orders,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/{order_id}",
    response_model=SuccessResponse[SalesOrder],
    summary="Get sales order by ID",
    description="Get a specific sales order by ID. Requires sales.view permission."
)
async def get_order(
    order_id: UUID,
    current_user: CurrentUser = Depends(require_permission("sales.view")),
    service: OrderService = Depends()
):
    """
    Get sales order by ID

    - **order_id**: Sales order UUID
    """
    order = await service.get_order(order_id)

    return SuccessResponse(data=order)


@router.patch(
    "/{order_id}",
    response_model=SuccessResponse[SalesOrder],
    summary="Update sales order",
    description="Update a sales order. Requires sales.edit permission."
)
async def update_order(
    order_id: UUID,
    update_data: SalesOrderUpdate,
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    service: OrderService = Depends()
):
    """
    Update a sales order

    - **order_id**: Sales order UUID
    - All fields are optional (partial update)
    """
    order = await service.update_order(
        order_id,
        update_data
    )

    return SuccessResponse(
        data=order,
        message="Sales order updated successfully"
    )


@router.patch(
    "/{order_id}/status",
    response_model=SuccessResponse[SalesOrder],
    summary="Update sales order status",
    description="Update sales order status. Requires sales.edit permission."
)
async def update_order_status(
    order_id: UUID,
    new_status: SalesOrderStatus = Query(..., description="New order status"),
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    service: OrderService = Depends()
):
    """
    Update sales order status

    - **order_id**: Sales order UUID
    - **new_status**: New status value (draft, confirmed, processing, shipped, delivered, cancelled)
    """
    order = await service.update_order_status(
        order_id,
        new_status
    )

    return SuccessResponse(
        data=order,
        message=f"Sales order status updated to {new_status.value}"
    )


@router.delete(
    "/{order_id}",
    response_model=SuccessResponse[dict],
    summary="Delete sales order",
    description="Delete a sales order. Requires sales.delete permission."
)
async def delete_order(
    order_id: UUID,
    current_user: CurrentUser = Depends(require_permission("sales.delete")),
    service: OrderService = Depends()
):
    """
    Delete a sales order

    - **order_id**: Sales order UUID
    """
    result = await service.delete_order(order_id)

    return SuccessResponse(
        data=result,
        message="Sales order deleted successfully"
    )
