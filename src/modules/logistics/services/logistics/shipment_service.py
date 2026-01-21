"""
Shipment Service

Business logic layer for Shipment operations.
Handles validation, permissions, and orchestration.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException, status
import logging

from src.modules.logistics.models.shipment import Shipment, ShipmentCreate, ShipmentUpdate, ShipmentStatus
from src.modules.logistics.services.logistics.shipment_repository import ShipmentRepository
from src.modules.logistics.services.logistics.vehicle_repository import VehicleRepository
from src.modules.logistics.services.logistics.route_repository import RouteRepository

logger = logging.getLogger(__name__)


class ShipmentService:
    """Service for Shipment business logic"""

    def __init__(self):
        self.repository = ShipmentRepository()
        self.vehicle_repository = VehicleRepository()
        self.route_repository = RouteRepository()

    async def create_shipment(
        self,
        shipment_data: ShipmentCreate,
        created_by: UUID
    ) -> Shipment:
        """
        Create a new shipment

        Args:
            shipment_data: Shipment creation data
            created_by: ID of the user creating the shipment

        Returns:
            Created shipment

        Raises:
            HTTPException: If validation fails
        """
        try:
            # Validate that route exists
            route_exists = await self.route_repository.exists(shipment_data.routeId)
            if not route_exists:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Route {shipment_data.routeId} not found"
                )

            # Validate that vehicle exists
            vehicle_exists = await self.vehicle_repository.exists(shipment_data.vehicleId)
            if not vehicle_exists:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Vehicle {shipment_data.vehicleId} not found"
                )

            # Validate cargo
            if not shipment_data.cargo or len(shipment_data.cargo) == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="At least one cargo item is required"
                )

            shipment = await self.repository.create(shipment_data, created_by)
            logger.info(f"Shipment created: {shipment.shipmentId} by user {created_by}")
            return shipment

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating shipment: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create shipment"
            )

    async def get_shipment(self, shipment_id: UUID) -> Shipment:
        """
        Get shipment by ID

        Args:
            shipment_id: Shipment ID

        Returns:
            Shipment

        Raises:
            HTTPException: If shipment not found
        """
        shipment = await self.repository.get_by_id(shipment_id)
        if not shipment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Shipment {shipment_id} not found"
            )
        return shipment

    async def get_all_shipments(
        self,
        page: int = 1,
        per_page: int = 20,
        status: Optional[ShipmentStatus] = None,
        vehicle_id: Optional[UUID] = None,
        route_id: Optional[UUID] = None
    ) -> tuple[List[Shipment], int, int]:
        """
        Get all shipments with pagination

        Args:
            page: Page number (1-indexed)
            per_page: Items per page
            status: Filter by shipment status (optional)
            vehicle_id: Filter by vehicle ID (optional)
            route_id: Filter by route ID (optional)

        Returns:
            Tuple of (shipments, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        shipments, total = await self.repository.get_all(skip, per_page, status, vehicle_id, route_id)

        total_pages = (total + per_page - 1) // per_page  # Ceiling division

        return shipments, total, total_pages

    async def update_shipment(
        self,
        shipment_id: UUID,
        update_data: ShipmentUpdate
    ) -> Shipment:
        """
        Update a shipment

        Args:
            shipment_id: Shipment ID
            update_data: Fields to update

        Returns:
            Updated shipment

        Raises:
            HTTPException: If shipment not found or validation fails
        """
        # Check shipment exists
        await self.get_shipment(shipment_id)

        # Validate route if being updated
        if update_data.routeId is not None:
            route_exists = await self.route_repository.exists(update_data.routeId)
            if not route_exists:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Route {update_data.routeId} not found"
                )

        # Validate vehicle if being updated
        if update_data.vehicleId is not None:
            vehicle_exists = await self.vehicle_repository.exists(update_data.vehicleId)
            if not vehicle_exists:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Vehicle {update_data.vehicleId} not found"
                )

        # Validate cargo if being updated
        if update_data.cargo is not None and len(update_data.cargo) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one cargo item is required"
            )

        updated_shipment = await self.repository.update(shipment_id, update_data)
        if not updated_shipment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Shipment {shipment_id} not found"
            )

        logger.info(f"Shipment updated: {shipment_id}")
        return updated_shipment

    async def update_shipment_status(
        self,
        shipment_id: UUID,
        new_status: ShipmentStatus
    ) -> Shipment:
        """
        Update shipment status

        Args:
            shipment_id: Shipment ID
            new_status: New status

        Returns:
            Updated shipment

        Raises:
            HTTPException: If shipment not found or invalid status transition
        """
        # Check shipment exists
        shipment = await self.get_shipment(shipment_id)

        # Validate status transition
        valid_transitions = {
            ShipmentStatus.SCHEDULED: [ShipmentStatus.IN_TRANSIT, ShipmentStatus.CANCELLED],
            ShipmentStatus.IN_TRANSIT: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED],
            ShipmentStatus.DELIVERED: [],
            ShipmentStatus.CANCELLED: []
        }

        if new_status not in valid_transitions.get(shipment.status, []):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status transition from {shipment.status} to {new_status}"
            )

        updated_shipment = await self.repository.update_status(shipment_id, new_status)
        if not updated_shipment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Shipment {shipment_id} not found"
            )

        logger.info(f"Shipment status updated: {shipment_id} to {new_status.value}")
        return updated_shipment

    async def delete_shipment(self, shipment_id: UUID) -> dict:
        """
        Delete a shipment

        Args:
            shipment_id: Shipment ID

        Returns:
            Success message

        Raises:
            HTTPException: If shipment not found
        """
        # Check shipment exists
        await self.get_shipment(shipment_id)

        success = await self.repository.delete(shipment_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Shipment {shipment_id} not found"
            )

        logger.info(f"Shipment deleted: {shipment_id}")
        return {"message": "Shipment deleted successfully"}
