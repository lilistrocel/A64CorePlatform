"""
Logistics Module - Vehicle API Routes

Endpoints for vehicle CRUD operations.
"""

from fastapi import APIRouter, Depends, status, Query
from typing import Optional
from uuid import UUID
import logging

from src.modules.logistics.models.vehicle import Vehicle, VehicleCreate, VehicleUpdate, VehicleStatus, VehicleType, VehicleOwnership
from src.modules.logistics.services.logistics import VehicleService
from src.modules.logistics.middleware.auth import require_permission, CurrentUser
from src.modules.logistics.utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "",
    response_model=SuccessResponse[Vehicle],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new vehicle",
    description="Create a new vehicle. Requires logistics.create permission."
)
async def create_vehicle(
    vehicle_data: VehicleCreate,
    current_user: CurrentUser = Depends(require_permission("logistics.create")),
    service: VehicleService = Depends()
):
    """Create a new vehicle"""
    vehicle = await service.create_vehicle(
        vehicle_data,
        UUID(current_user.userId)
    )

    return SuccessResponse(
        data=vehicle,
        message="Vehicle created successfully"
    )


@router.get(
    "",
    response_model=PaginatedResponse[Vehicle],
    summary="Get all vehicles",
    description="Get all vehicles with pagination and filters. Requires logistics.view permission."
)
async def get_vehicles(
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[VehicleStatus] = Query(None, description="Filter by vehicle status"),
    type: Optional[VehicleType] = Query(None, description="Filter by vehicle type"),
    ownershipType: Optional[VehicleOwnership] = Query(None, description="Filter by ownership type"),
    current_user: CurrentUser = Depends(require_permission("logistics.view")),
    service: VehicleService = Depends()
):
    """Get all vehicles with pagination"""
    vehicles, total, total_pages = await service.get_all_vehicles(
        page, perPage, status, type.value if type else None, ownershipType.value if ownershipType else None
    )

    return PaginatedResponse(
        data=vehicles,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/available",
    response_model=PaginatedResponse[Vehicle],
    summary="Get available vehicles",
    description="Get all available vehicles. Requires logistics.view permission."
)
async def get_available_vehicles(
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: CurrentUser = Depends(require_permission("logistics.view")),
    service: VehicleService = Depends()
):
    """Get all available vehicles"""
    vehicles, total, total_pages = await service.get_available_vehicles(
        page, perPage
    )

    return PaginatedResponse(
        data=vehicles,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/{vehicle_id}",
    response_model=SuccessResponse[Vehicle],
    summary="Get vehicle by ID",
    description="Get a specific vehicle by ID. Requires logistics.view permission."
)
async def get_vehicle(
    vehicle_id: UUID,
    current_user: CurrentUser = Depends(require_permission("logistics.view")),
    service: VehicleService = Depends()
):
    """Get vehicle by ID"""
    vehicle = await service.get_vehicle(vehicle_id)
    return SuccessResponse(data=vehicle)


@router.patch(
    "/{vehicle_id}",
    response_model=SuccessResponse[Vehicle],
    summary="Update vehicle",
    description="Update a vehicle. Requires logistics.edit permission."
)
async def update_vehicle(
    vehicle_id: UUID,
    update_data: VehicleUpdate,
    current_user: CurrentUser = Depends(require_permission("logistics.edit")),
    service: VehicleService = Depends()
):
    """Update a vehicle"""
    vehicle = await service.update_vehicle(vehicle_id, update_data)

    return SuccessResponse(
        data=vehicle,
        message="Vehicle updated successfully"
    )


@router.delete(
    "/{vehicle_id}",
    response_model=SuccessResponse[dict],
    summary="Delete vehicle",
    description="Delete a vehicle. Requires logistics.delete permission."
)
async def delete_vehicle(
    vehicle_id: UUID,
    current_user: CurrentUser = Depends(require_permission("logistics.delete")),
    service: VehicleService = Depends()
):
    """Delete a vehicle"""
    result = await service.delete_vehicle(vehicle_id)

    return SuccessResponse(
        data=result,
        message="Vehicle deleted successfully"
    )
