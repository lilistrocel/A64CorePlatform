"""
Logistics Module - Shipment API Routes

Endpoints for shipment CRUD operations.
"""

from fastapi import APIRouter, Depends, status, Query, Body
from typing import Optional, List
from uuid import UUID
import logging

from src.modules.logistics.models.shipment import (
    Shipment, ShipmentCreate, ShipmentUpdate, ShipmentStatus,
    OrderAssignmentRequest, OrderAssignmentResponse, ShipmentTrackingData
)
from src.modules.logistics.services.logistics import ShipmentService
from src.modules.logistics.middleware.auth import require_permission, CurrentUser
from src.modules.logistics.utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "",
    response_model=SuccessResponse[Shipment],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new shipment",
    description="Create a new shipment. Requires logistics.create permission."
)
async def create_shipment(
    shipment_data: ShipmentCreate,
    current_user: CurrentUser = Depends(require_permission("logistics.create")),
    service: ShipmentService = Depends()
):
    """Create a new shipment"""
    shipment = await service.create_shipment(
        shipment_data,
        UUID(current_user.userId)
    )

    return SuccessResponse(
        data=shipment,
        message="Shipment created successfully"
    )


@router.get(
    "",
    response_model=PaginatedResponse[Shipment],
    summary="Get all shipments",
    description="Get all shipments with pagination and filters. Requires logistics.view permission."
)
async def get_shipments(
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[ShipmentStatus] = Query(None, description="Filter by shipment status"),
    vehicleId: Optional[UUID] = Query(None, description="Filter by vehicle ID"),
    routeId: Optional[UUID] = Query(None, description="Filter by route ID"),
    farmingYear: Optional[int] = Query(None, description="Filter by farming year (e.g., 2025)"),
    current_user: CurrentUser = Depends(require_permission("logistics.view")),
    service: ShipmentService = Depends()
):
    """Get all shipments with pagination"""
    shipments, total, total_pages = await service.get_all_shipments(
        page, perPage, status, vehicleId, routeId, farmingYear
    )

    return PaginatedResponse(
        data=shipments,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/{shipment_id}/track",
    response_model=SuccessResponse[ShipmentTrackingData],
    summary="Get shipment GPS tracking data",
    description="Get GPS tracking data for a shipment including origin, destination, current location, and progress. Requires logistics.view permission."
)
async def get_shipment_tracking(
    shipment_id: UUID,
    current_user: CurrentUser = Depends(require_permission("logistics.view")),
    service: ShipmentService = Depends()
):
    """Get GPS tracking data for a shipment"""
    tracking_data = await service.get_tracking_data(shipment_id)
    return SuccessResponse(data=tracking_data)


@router.get(
    "/{shipment_id}",
    response_model=SuccessResponse[Shipment],
    summary="Get shipment by ID",
    description="Get a specific shipment by ID. Requires logistics.view permission."
)
async def get_shipment(
    shipment_id: UUID,
    current_user: CurrentUser = Depends(require_permission("logistics.view")),
    service: ShipmentService = Depends()
):
    """Get shipment by ID"""
    shipment = await service.get_shipment(shipment_id)
    return SuccessResponse(data=shipment)


@router.patch(
    "/{shipment_id}",
    response_model=SuccessResponse[Shipment],
    summary="Update shipment",
    description="Update a shipment. Requires logistics.edit permission."
)
async def update_shipment(
    shipment_id: UUID,
    update_data: ShipmentUpdate,
    current_user: CurrentUser = Depends(require_permission("logistics.edit")),
    service: ShipmentService = Depends()
):
    """Update a shipment"""
    shipment = await service.update_shipment(shipment_id, update_data)

    return SuccessResponse(
        data=shipment,
        message="Shipment updated successfully"
    )


@router.patch(
    "/{shipment_id}/status",
    response_model=SuccessResponse[Shipment],
    summary="Update shipment status",
    description="Update shipment status with automatic date tracking. Requires logistics.edit permission."
)
async def update_shipment_status(
    shipment_id: UUID,
    status: ShipmentStatus = Body(..., embed=True, description="New shipment status"),
    current_user: CurrentUser = Depends(require_permission("logistics.edit")),
    service: ShipmentService = Depends()
):
    """Update shipment status"""
    shipment = await service.update_shipment_status(shipment_id, status)

    return SuccessResponse(
        data=shipment,
        message=f"Shipment status updated to {status.value}"
    )


@router.delete(
    "/{shipment_id}",
    response_model=SuccessResponse[dict],
    summary="Delete shipment",
    description="Delete a shipment. Requires logistics.delete permission."
)
async def delete_shipment(
    shipment_id: UUID,
    current_user: CurrentUser = Depends(require_permission("logistics.delete")),
    service: ShipmentService = Depends()
):
    """Delete a shipment"""
    result = await service.delete_shipment(shipment_id)

    return SuccessResponse(
        data=result,
        message="Shipment deleted successfully"
    )


@router.post(
    "/{shipment_id}/assign-orders",
    response_model=SuccessResponse[OrderAssignmentResponse],
    summary="Assign orders to shipment",
    description="Assign multiple sales orders to a shipment. Requires logistics.edit permission."
)
async def assign_orders_to_shipment(
    shipment_id: UUID,
    request: OrderAssignmentRequest,
    current_user: CurrentUser = Depends(require_permission("logistics.edit")),
    service: ShipmentService = Depends()
):
    """Assign sales orders to a shipment"""
    result = await service.assign_orders_to_shipment(
        shipment_id,
        request.orderIds,
        UUID(current_user.userId)
    )

    return SuccessResponse(
        data=result,
        message=f"Successfully assigned {len(request.orderIds)} orders to shipment"
    )


@router.post(
    "/{shipment_id}/start-delivery",
    response_model=SuccessResponse[Shipment],
    summary="Start shipment delivery",
    description="Start delivery for shipment, updating all linked orders to in_transit. Requires logistics.edit permission."
)
async def start_shipment_delivery(
    shipment_id: UUID,
    current_user: CurrentUser = Depends(require_permission("logistics.edit")),
    service: ShipmentService = Depends()
):
    """Start delivery for shipment and update linked orders"""
    shipment = await service.start_delivery(shipment_id, UUID(current_user.userId))

    return SuccessResponse(
        data=shipment,
        message="Shipment delivery started, all linked orders updated to in_transit"
    )


@router.post(
    "/{shipment_id}/complete-delivery",
    response_model=SuccessResponse[dict],
    summary="Complete shipment delivery",
    description="Complete delivery for shipment, updating all linked orders to delivered. Requires logistics.edit permission."
)
async def complete_shipment_delivery(
    shipment_id: UUID,
    current_user: CurrentUser = Depends(require_permission("logistics.edit")),
    service: ShipmentService = Depends()
):
    """Complete delivery for shipment and update linked orders"""
    result = await service.complete_delivery(shipment_id, UUID(current_user.userId))

    return SuccessResponse(
        data=result,
        message="Shipment delivery completed, all linked orders marked as delivered"
    )


@router.get(
    "/{shipment_id}/orders",
    response_model=SuccessResponse[List[dict]],
    summary="Get orders in shipment",
    description="Get all sales orders assigned to a shipment. Requires logistics.view permission."
)
async def get_shipment_orders(
    shipment_id: UUID,
    current_user: CurrentUser = Depends(require_permission("logistics.view")),
    service: ShipmentService = Depends()
):
    """Get orders assigned to shipment"""
    orders = await service.get_shipment_orders(shipment_id)

    return SuccessResponse(
        data=orders,
        message=f"Retrieved {len(orders)} orders from shipment"
    )
