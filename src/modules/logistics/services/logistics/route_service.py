"""
Route Service

Business logic layer for Route operations.
Handles validation, permissions, and orchestration.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException, status
import logging

from src.modules.logistics.models.route import Route, RouteCreate, RouteUpdate
from src.modules.logistics.services.logistics.route_repository import RouteRepository

logger = logging.getLogger(__name__)


class RouteService:
    """Service for Route business logic"""

    def __init__(self):
        self.repository = RouteRepository()

    async def create_route(
        self,
        route_data: RouteCreate,
        created_by: UUID
    ) -> Route:
        """
        Create a new route

        Args:
            route_data: Route creation data
            created_by: ID of the user creating the route

        Returns:
            Created route

        Raises:
            HTTPException: If validation fails
        """
        try:
            # Business logic validation
            if not route_data.name or not route_data.name.strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Route name is required"
                )

            if route_data.distance <= 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Distance must be greater than 0"
                )

            if route_data.estimatedDuration <= 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Estimated duration must be greater than 0"
                )

            route = await self.repository.create(route_data, created_by)
            logger.info(f"Route created: {route.routeId} by user {created_by}")
            return route

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating route: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create route"
            )

    async def get_route(self, route_id: UUID) -> Route:
        """
        Get route by ID

        Args:
            route_id: Route ID

        Returns:
            Route

        Raises:
            HTTPException: If route not found
        """
        route = await self.repository.get_by_id(route_id)
        if not route:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Route {route_id} not found"
            )
        return route

    async def get_all_routes(
        self,
        page: int = 1,
        per_page: int = 20,
        is_active: Optional[bool] = None
    ) -> tuple[List[Route], int, int]:
        """
        Get all routes with pagination

        Args:
            page: Page number (1-indexed)
            per_page: Items per page
            is_active: Filter by active status (optional)

        Returns:
            Tuple of (routes, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        routes, total = await self.repository.get_all(skip, per_page, is_active)

        total_pages = (total + per_page - 1) // per_page  # Ceiling division

        return routes, total, total_pages

    async def update_route(
        self,
        route_id: UUID,
        update_data: RouteUpdate
    ) -> Route:
        """
        Update a route

        Args:
            route_id: Route ID
            update_data: Fields to update

        Returns:
            Updated route

        Raises:
            HTTPException: If route not found or validation fails
        """
        # Check route exists
        await self.get_route(route_id)

        # Validate update data
        if update_data.name is not None and not update_data.name.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Route name cannot be empty"
            )

        if update_data.distance is not None and update_data.distance <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Distance must be greater than 0"
            )

        if update_data.estimatedDuration is not None and update_data.estimatedDuration <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Estimated duration must be greater than 0"
            )

        updated_route = await self.repository.update(route_id, update_data)
        if not updated_route:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Route {route_id} not found"
            )

        logger.info(f"Route updated: {route_id}")
        return updated_route

    async def delete_route(self, route_id: UUID) -> dict:
        """
        Delete a route

        Args:
            route_id: Route ID

        Returns:
            Success message

        Raises:
            HTTPException: If route not found
        """
        # Check route exists
        await self.get_route(route_id)

        success = await self.repository.delete(route_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Route {route_id} not found"
            )

        logger.info(f"Route deleted: {route_id}")
        return {"message": "Route deleted successfully"}
