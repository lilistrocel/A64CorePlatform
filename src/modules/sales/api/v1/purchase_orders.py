"""
Sales Module - Purchase Order API Routes

Endpoints for purchase order CRUD operations.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional
from uuid import UUID
import logging

from ...models.purchase_order import PurchaseOrder, PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrderStatus
from ...services.sales import PurchaseOrderService
from ...middleware.auth import get_current_active_user, require_permission, CurrentUser
from ...utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "",
    response_model=SuccessResponse[PurchaseOrder],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new purchase order",
    description="Create a new purchase order. Requires sales.create permission."
)
async def create_purchase_order(
    po_data: PurchaseOrderCreate,
    current_user: CurrentUser = Depends(require_permission("sales.create")),
    service: PurchaseOrderService = Depends()
):
    """
    Create a new purchase order

    - **supplierId**: Supplier ID (required)
    - **supplierName**: Supplier name (denormalized for quick access)
    - **status**: Purchase order status (default: draft)
    - **orderDate**: Order date (default: current time)
    - **expectedDeliveryDate**: Expected delivery date (optional)
    - **items**: List of purchase order items (required, min 1 item)
    - **total**: Total amount (must match sum of item totals)
    - **paymentTerms**: Payment terms (optional)
    - **notes**: Additional notes (optional)
    """
    purchase_order = await service.create_purchase_order(
        po_data,
        UUID(current_user.userId)
    )

    return SuccessResponse(
        data=purchase_order,
        message="Purchase order created successfully"
    )


@router.get(
    "",
    response_model=PaginatedResponse[PurchaseOrder],
    summary="Get all purchase orders",
    description="Get all purchase orders with pagination and filters. Requires sales.view permission."
)
async def get_purchase_orders(
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[PurchaseOrderStatus] = Query(None, description="Filter by PO status"),
    supplierId: Optional[UUID] = Query(None, description="Filter by supplier ID"),
    current_user: CurrentUser = Depends(require_permission("sales.view")),
    service: PurchaseOrderService = Depends()
):
    """
    Get all purchase orders with pagination

    - **page**: Page number (default: 1)
    - **perPage**: Items per page (default: 20, max: 100)
    - **status**: Filter by purchase order status (optional)
    - **supplierId**: Filter by supplier ID (optional)
    """
    purchase_orders, total, total_pages = await service.get_all_purchase_orders(
        page, perPage, status, supplierId
    )

    return PaginatedResponse(
        data=purchase_orders,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/{po_id}",
    response_model=SuccessResponse[PurchaseOrder],
    summary="Get purchase order by ID",
    description="Get a specific purchase order by ID. Requires sales.view permission."
)
async def get_purchase_order(
    po_id: UUID,
    current_user: CurrentUser = Depends(require_permission("sales.view")),
    service: PurchaseOrderService = Depends()
):
    """
    Get purchase order by ID

    - **po_id**: Purchase order UUID
    """
    purchase_order = await service.get_purchase_order(po_id)

    return SuccessResponse(data=purchase_order)


@router.patch(
    "/{po_id}",
    response_model=SuccessResponse[PurchaseOrder],
    summary="Update purchase order",
    description="Update a purchase order. Requires sales.edit permission."
)
async def update_purchase_order(
    po_id: UUID,
    update_data: PurchaseOrderUpdate,
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    service: PurchaseOrderService = Depends()
):
    """
    Update a purchase order

    - **po_id**: Purchase order UUID
    - All fields are optional (partial update)
    """
    purchase_order = await service.update_purchase_order(
        po_id,
        update_data
    )

    return SuccessResponse(
        data=purchase_order,
        message="Purchase order updated successfully"
    )


@router.patch(
    "/{po_id}/status",
    response_model=SuccessResponse[PurchaseOrder],
    summary="Update purchase order status",
    description="Update purchase order status. Requires sales.edit permission."
)
async def update_purchase_order_status(
    po_id: UUID,
    new_status: PurchaseOrderStatus = Query(..., description="New PO status"),
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    service: PurchaseOrderService = Depends()
):
    """
    Update purchase order status

    - **po_id**: Purchase order UUID
    - **new_status**: New status value (draft, sent, confirmed, received, cancelled)
    """
    purchase_order = await service.update_purchase_order_status(
        po_id,
        new_status
    )

    return SuccessResponse(
        data=purchase_order,
        message=f"Purchase order status updated to {new_status.value}"
    )


@router.delete(
    "/{po_id}",
    response_model=SuccessResponse[dict],
    summary="Delete purchase order",
    description="Delete a purchase order. Requires sales.delete permission."
)
async def delete_purchase_order(
    po_id: UUID,
    current_user: CurrentUser = Depends(require_permission("sales.delete")),
    service: PurchaseOrderService = Depends()
):
    """
    Delete a purchase order

    - **po_id**: Purchase order UUID
    """
    result = await service.delete_purchase_order(po_id)

    return SuccessResponse(
        data=result,
        message="Purchase order deleted successfully"
    )
