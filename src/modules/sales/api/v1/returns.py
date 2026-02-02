"""
Sales Module - Return Order API Routes

Endpoints for return order CRUD and processing operations.
"""

from fastapi import APIRouter, Depends, status, Query
from typing import Optional, List
from uuid import UUID
import logging

from ...models.return_order import (
    ReturnOrder, ReturnOrderCreate, ReturnOrderUpdate,
    ReturnStatus, ProcessReturnRequest, ProcessReturnResponse
)
from ...services.sales.return_service import ReturnService
from ...middleware.auth import require_permission, CurrentUser
from ...utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "",
    response_model=SuccessResponse[ReturnOrder],
    status_code=status.HTTP_201_CREATED,
    summary="Create a return order",
    description="Create a new return order for a delivered sales order. Requires sales.create permission."
)
async def create_return(
    return_data: ReturnOrderCreate,
    current_user: CurrentUser = Depends(require_permission("sales.create")),
    service: ReturnService = Depends()
):
    """
    Create a new return order

    - **orderId**: Original sales order ID (required, must exist and be delivered)
    - **customerId**: Customer ID from CRM (required)
    - **customerName**: Customer name (denormalized)
    - **items**: List of items being returned (required, min 1 item)
    - **returnReason**: Reason for return (required)
    - **status**: Return status (default: pending)
    - **refundAmount**: Total refund amount (must match sum of item refunds)
    - **notes**: Additional notes (optional)
    """
    return_order = await service.create_return(
        return_data,
        UUID(current_user.userId)
    )

    return SuccessResponse(
        data=return_order,
        message="Return order created successfully"
    )


@router.get(
    "",
    response_model=PaginatedResponse[ReturnOrder],
    summary="Get all return orders",
    description="Get all return orders with pagination and filters. Requires sales.view permission."
)
async def get_returns(
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[ReturnStatus] = Query(None, description="Filter by return status"),
    orderId: Optional[UUID] = Query(None, description="Filter by original order ID"),
    current_user: CurrentUser = Depends(require_permission("sales.view")),
    service: ReturnService = Depends()
):
    """
    Get all return orders with pagination

    - **page**: Page number (default: 1)
    - **perPage**: Items per page (default: 20, max: 100)
    - **status**: Filter by return status (optional)
    - **orderId**: Filter by original order ID (optional)
    """
    returns, total, total_pages = await service.get_all_returns(
        page, perPage, status, orderId
    )

    return PaginatedResponse(
        data=returns,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/{return_id}",
    response_model=SuccessResponse[ReturnOrder],
    summary="Get return order by ID",
    description="Get a specific return order by ID. Requires sales.view permission."
)
async def get_return(
    return_id: UUID,
    current_user: CurrentUser = Depends(require_permission("sales.view")),
    service: ReturnService = Depends()
):
    """
    Get return order by ID

    - **return_id**: Return order ID (required)
    """
    return_order = await service.get_return(return_id)
    return SuccessResponse(data=return_order)


@router.get(
    "/order/{order_id}",
    response_model=SuccessResponse[List[ReturnOrder]],
    summary="Get returns for an order",
    description="Get all return orders for a specific sales order. Requires sales.view permission."
)
async def get_returns_for_order(
    order_id: UUID,
    current_user: CurrentUser = Depends(require_permission("sales.view")),
    service: ReturnService = Depends()
):
    """
    Get all returns for a specific order

    - **order_id**: Original sales order ID (required)
    """
    returns = await service.get_returns_for_order(order_id)
    return SuccessResponse(
        data=returns,
        message=f"Found {len(returns)} returns for order"
    )


@router.patch(
    "/{return_id}",
    response_model=SuccessResponse[ReturnOrder],
    summary="Update return order",
    description="Update a return order. Requires sales.edit permission."
)
async def update_return(
    return_id: UUID,
    update_data: ReturnOrderUpdate,
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    service: ReturnService = Depends()
):
    """
    Update a return order

    - **return_id**: Return order ID (required)
    - **update_data**: Fields to update (partial update)
    """
    return_order = await service.update_return(return_id, update_data)

    return SuccessResponse(
        data=return_order,
        message="Return order updated successfully"
    )


@router.post(
    "/{return_id}/process",
    response_model=SuccessResponse[ProcessReturnResponse],
    summary="Process a return order",
    description="Process a return order: update inventory and/or create waste records. Requires sales.edit permission."
)
async def process_return(
    return_id: UUID,
    process_request: Optional[ProcessReturnRequest] = None,
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    service: ReturnService = Depends()
):
    """
    Process a return order

    - **return_id**: Return order ID (required)
    - **restockItems**: List of items to restock to inventory (optional)
    - **wasteItems**: List of items to mark as waste (optional)
    - **notes**: Processing notes (optional)

    At least one of restockItems or wasteItems must be provided.
    """
    # Create request with return_id if not provided
    if process_request is None:
        process_request = ProcessReturnRequest(returnId=return_id)
    else:
        # Ensure return_id matches
        process_request.returnId = return_id

    result = await service.process_return(
        process_request,
        UUID(current_user.userId)
    )

    return SuccessResponse(
        data=result,
        message="Return order processed successfully"
    )


@router.delete(
    "/{return_id}",
    response_model=SuccessResponse[dict],
    summary="Delete return order",
    description="Delete a pending return order. Requires sales.delete permission."
)
async def delete_return(
    return_id: UUID,
    current_user: CurrentUser = Depends(require_permission("sales.delete")),
    service: ReturnService = Depends()
):
    """
    Delete a return order

    - **return_id**: Return order ID (required)

    Only pending returns can be deleted. Processed/completed returns cannot be deleted.
    """
    result = await service.delete_return(return_id)

    return SuccessResponse(
        data=result,
        message="Return order deleted successfully"
    )
