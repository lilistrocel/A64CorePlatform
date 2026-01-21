"""
Logistics Module - Route API Routes

Endpoints for route CRUD operations.
"""

from fastapi import APIRouter, Depends, status, Query
from typing import Optional
from uuid import UUID
import logging

from src.modules.logistics.models.route import Route, RouteCreate, RouteUpdate
from src.modules.logistics.services.logistics import RouteService
from src.modules.logistics.middleware.auth import require_permission, CurrentUser
from src.modules.logistics.utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "",
    response_model=SuccessResponse[Route],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new route",
    description="Create a new route. Requires logistics.create permission."
)
async def create_route(
    route_data: RouteCreate,
    current_user: CurrentUser = Depends(require_permission("logistics.create")),
    service: RouteService = Depends()
):
    """Create a new route"""
    route = await service.create_route(
        route_data,
        UUID(current_user.userId)
    )

    return SuccessResponse(
        data=route,
        message="Route created successfully"
    )


@router.get(
    "",
    response_model=PaginatedResponse[Route],
    summary="Get all routes",
    description="Get all routes with pagination and filters. Requires logistics.view permission."
)
async def get_routes(
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    isActive: Optional[bool] = Query(None, description="Filter by active status"),
    current_user: CurrentUser = Depends(require_permission("logistics.view")),
    service: RouteService = Depends()
):
    """Get all routes with pagination"""
    routes, total, total_pages = await service.get_all_routes(
        page, perPage, isActive
    )

    return PaginatedResponse(
        data=routes,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/{route_id}",
    response_model=SuccessResponse[Route],
    summary="Get route by ID",
    description="Get a specific route by ID. Requires logistics.view permission."
)
async def get_route(
    route_id: UUID,
    current_user: CurrentUser = Depends(require_permission("logistics.view")),
    service: RouteService = Depends()
):
    """Get route by ID"""
    route = await service.get_route(route_id)
    return SuccessResponse(data=route)


@router.patch(
    "/{route_id}",
    response_model=SuccessResponse[Route],
    summary="Update route",
    description="Update a route. Requires logistics.edit permission."
)
async def update_route(
    route_id: UUID,
    update_data: RouteUpdate,
    current_user: CurrentUser = Depends(require_permission("logistics.edit")),
    service: RouteService = Depends()
):
    """Update a route"""
    route = await service.update_route(route_id, update_data)

    return SuccessResponse(
        data=route,
        message="Route updated successfully"
    )


@router.delete(
    "/{route_id}",
    response_model=SuccessResponse[dict],
    summary="Delete route",
    description="Delete a route. Requires logistics.delete permission."
)
async def delete_route(
    route_id: UUID,
    current_user: CurrentUser = Depends(require_permission("logistics.delete")),
    service: RouteService = Depends()
):
    """Delete a route"""
    result = await service.delete_route(route_id)

    return SuccessResponse(
        data=result,
        message="Route deleted successfully"
    )
