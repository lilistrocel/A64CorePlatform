"""
Vehicle Service

Business logic layer for Vehicle operations.
Handles validation, permissions, and orchestration.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException, status
import logging

from src.modules.logistics.models.vehicle import Vehicle, VehicleCreate, VehicleUpdate, VehicleStatus
from src.modules.logistics.services.logistics.vehicle_repository import VehicleRepository

logger = logging.getLogger(__name__)


class VehicleService:
    """Service for Vehicle business logic"""

    def __init__(self):
        self.repository = VehicleRepository()

    async def create_vehicle(
        self,
        vehicle_data: VehicleCreate,
        created_by: UUID
    ) -> Vehicle:
        """
        Create a new vehicle

        Args:
            vehicle_data: Vehicle creation data
            created_by: ID of the user creating the vehicle

        Returns:
            Created vehicle

        Raises:
            HTTPException: If validation fails
        """
        try:
            # Business logic validation
            if not vehicle_data.name or not vehicle_data.name.strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Vehicle name is required"
                )

            if not vehicle_data.licensePlate or not vehicle_data.licensePlate.strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="License plate is required"
                )

            vehicle = await self.repository.create(vehicle_data, created_by)
            logger.info(f"Vehicle created: {vehicle.vehicleId} by user {created_by}")
            return vehicle

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating vehicle: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create vehicle"
            )

    async def get_vehicle(self, vehicle_id: UUID) -> Vehicle:
        """
        Get vehicle by ID

        Args:
            vehicle_id: Vehicle ID

        Returns:
            Vehicle

        Raises:
            HTTPException: If vehicle not found
        """
        vehicle = await self.repository.get_by_id(vehicle_id)
        if not vehicle:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Vehicle {vehicle_id} not found"
            )
        return vehicle

    async def get_all_vehicles(
        self,
        page: int = 1,
        per_page: int = 20,
        status: Optional[VehicleStatus] = None,
        type: Optional[str] = None
    ) -> tuple[List[Vehicle], int, int]:
        """
        Get all vehicles with pagination

        Args:
            page: Page number (1-indexed)
            per_page: Items per page
            status: Filter by vehicle status (optional)
            type: Filter by vehicle type (optional)

        Returns:
            Tuple of (vehicles, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        vehicles, total = await self.repository.get_all(skip, per_page, status, type)

        total_pages = (total + per_page - 1) // per_page  # Ceiling division

        return vehicles, total, total_pages

    async def get_available_vehicles(
        self,
        page: int = 1,
        per_page: int = 20
    ) -> tuple[List[Vehicle], int, int]:
        """
        Get all available vehicles

        Args:
            page: Page number (1-indexed)
            per_page: Items per page

        Returns:
            Tuple of (vehicles, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        vehicles, total = await self.repository.get_available_vehicles(skip, per_page)

        total_pages = (total + per_page - 1) // per_page

        return vehicles, total, total_pages

    async def update_vehicle(
        self,
        vehicle_id: UUID,
        update_data: VehicleUpdate
    ) -> Vehicle:
        """
        Update a vehicle

        Args:
            vehicle_id: Vehicle ID
            update_data: Fields to update

        Returns:
            Updated vehicle

        Raises:
            HTTPException: If vehicle not found or validation fails
        """
        # Check vehicle exists
        await self.get_vehicle(vehicle_id)

        # Validate update data
        if update_data.name is not None and not update_data.name.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vehicle name cannot be empty"
            )

        if update_data.licensePlate is not None and not update_data.licensePlate.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="License plate cannot be empty"
            )

        updated_vehicle = await self.repository.update(vehicle_id, update_data)
        if not updated_vehicle:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Vehicle {vehicle_id} not found"
            )

        logger.info(f"Vehicle updated: {vehicle_id}")
        return updated_vehicle

    async def delete_vehicle(self, vehicle_id: UUID) -> dict:
        """
        Delete a vehicle

        Args:
            vehicle_id: Vehicle ID

        Returns:
            Success message

        Raises:
            HTTPException: If vehicle not found
        """
        # Check vehicle exists
        await self.get_vehicle(vehicle_id)

        success = await self.repository.delete(vehicle_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Vehicle {vehicle_id} not found"
            )

        logger.info(f"Vehicle deleted: {vehicle_id}")
        return {"message": "Vehicle deleted successfully"}
