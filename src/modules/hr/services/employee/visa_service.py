"""
Visa Service

Business logic layer for Visa operations.
Handles validation, permissions, and orchestration.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException, status
import logging

from src.modules.hr.models.visa import Visa, VisaCreate, VisaUpdate, VisaStatus
from src.modules.hr.services.employee.visa_repository import VisaRepository
from src.modules.hr.services.employee.employee_repository import EmployeeRepository

logger = logging.getLogger(__name__)


class VisaService:
    """Service for Visa business logic"""

    def __init__(self):
        self.repository = VisaRepository()
        self.employee_repository = EmployeeRepository()

    async def create_visa(
        self,
        visa_data: VisaCreate
    ) -> Visa:
        """
        Create a new visa

        Args:
            visa_data: Visa creation data

        Returns:
            Created visa

        Raises:
            HTTPException: If validation fails or employee not found
        """
        try:
            # Verify employee exists
            employee_exists = await self.employee_repository.exists(visa_data.employeeId)
            if not employee_exists:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Employee {visa_data.employeeId} not found"
                )

            # Validate dates
            if visa_data.expiryDate < visa_data.issueDate:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Expiry date must be after issue date"
                )

            visa = await self.repository.create(visa_data)
            logger.info(f"Visa created: {visa.visaId} for employee {visa.employeeId}")
            return visa

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating visa: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create visa"
            )

    async def get_visa(self, visa_id: UUID) -> Visa:
        """
        Get visa by ID

        Args:
            visa_id: Visa ID

        Returns:
            Visa

        Raises:
            HTTPException: If visa not found
        """
        visa = await self.repository.get_by_id(visa_id)
        if not visa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Visa {visa_id} not found"
            )
        return visa

    async def get_employee_visas(
        self,
        employee_id: UUID,
        page: int = 1,
        per_page: int = 20
    ) -> tuple[List[Visa], int, int]:
        """
        Get visas for a specific employee

        Args:
            employee_id: Employee ID
            page: Page number (1-indexed)
            per_page: Items per page

        Returns:
            Tuple of (visas, total, total_pages)
        """
        # Verify employee exists
        employee_exists = await self.employee_repository.exists(employee_id)
        if not employee_exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Employee {employee_id} not found"
            )

        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        visas, total = await self.repository.get_by_employee_id(employee_id, skip, per_page)

        total_pages = (total + per_page - 1) // per_page

        return visas, total, total_pages

    async def get_all_visas(
        self,
        page: int = 1,
        per_page: int = 20,
        status: Optional[VisaStatus] = None
    ) -> tuple[List[Visa], int, int]:
        """
        Get all visas with pagination

        Args:
            page: Page number (1-indexed)
            per_page: Items per page
            status: Filter by visa status (optional)

        Returns:
            Tuple of (visas, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        visas, total = await self.repository.get_all(skip, per_page, status)

        total_pages = (total + per_page - 1) // per_page

        return visas, total, total_pages

    async def update_visa(
        self,
        visa_id: UUID,
        update_data: VisaUpdate
    ) -> Visa:
        """
        Update a visa

        Args:
            visa_id: Visa ID
            update_data: Fields to update

        Returns:
            Updated visa

        Raises:
            HTTPException: If visa not found or validation fails
        """
        # Check visa exists
        await self.get_visa(visa_id)

        # Validate dates if both are being updated
        if update_data.expiryDate and update_data.issueDate:
            if update_data.expiryDate < update_data.issueDate:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Expiry date must be after issue date"
                )

        updated_visa = await self.repository.update(visa_id, update_data)
        if not updated_visa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Visa {visa_id} not found"
            )

        logger.info(f"Visa updated: {visa_id}")
        return updated_visa

    async def delete_visa(self, visa_id: UUID) -> dict:
        """
        Delete a visa

        Args:
            visa_id: Visa ID

        Returns:
            Success message

        Raises:
            HTTPException: If visa not found
        """
        # Check visa exists
        await self.get_visa(visa_id)

        success = await self.repository.delete(visa_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Visa {visa_id} not found"
            )

        logger.info(f"Visa deleted: {visa_id}")
        return {"message": "Visa deleted successfully"}
