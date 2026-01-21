"""
Insurance Service

Business logic layer for Insurance operations.
Handles validation, permissions, and orchestration.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException, status
import logging

from src.modules.hr.models.insurance import Insurance, InsuranceCreate, InsuranceUpdate, InsuranceType
from src.modules.hr.services.employee.insurance_repository import InsuranceRepository
from src.modules.hr.services.employee.employee_repository import EmployeeRepository

logger = logging.getLogger(__name__)


class InsuranceService:
    """Service for Insurance business logic"""

    def __init__(self):
        self.repository = InsuranceRepository()
        self.employee_repository = EmployeeRepository()

    async def create_insurance(
        self,
        insurance_data: InsuranceCreate
    ) -> Insurance:
        """
        Create a new insurance policy

        Args:
            insurance_data: Insurance creation data

        Returns:
            Created insurance

        Raises:
            HTTPException: If validation fails or employee not found
        """
        try:
            # Verify employee exists
            employee_exists = await self.employee_repository.exists(insurance_data.employeeId)
            if not employee_exists:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Employee {insurance_data.employeeId} not found"
                )

            # Validate dates
            if insurance_data.endDate < insurance_data.startDate:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="End date must be after start date"
                )

            insurance = await self.repository.create(insurance_data)
            logger.info(f"Insurance created: {insurance.insuranceId} for employee {insurance.employeeId}")
            return insurance

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating insurance: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create insurance"
            )

    async def get_insurance(self, insurance_id: UUID) -> Insurance:
        """
        Get insurance by ID

        Args:
            insurance_id: Insurance ID

        Returns:
            Insurance

        Raises:
            HTTPException: If insurance not found
        """
        insurance = await self.repository.get_by_id(insurance_id)
        if not insurance:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Insurance {insurance_id} not found"
            )
        return insurance

    async def get_employee_insurance(
        self,
        employee_id: UUID,
        page: int = 1,
        per_page: int = 20
    ) -> tuple[List[Insurance], int, int]:
        """
        Get insurance policies for a specific employee

        Args:
            employee_id: Employee ID
            page: Page number (1-indexed)
            per_page: Items per page

        Returns:
            Tuple of (insurance policies, total, total_pages)
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
        insurance_list, total = await self.repository.get_by_employee_id(employee_id, skip, per_page)

        total_pages = (total + per_page - 1) // per_page

        return insurance_list, total, total_pages

    async def get_all_insurance(
        self,
        page: int = 1,
        per_page: int = 20,
        insurance_type: Optional[InsuranceType] = None
    ) -> tuple[List[Insurance], int, int]:
        """
        Get all insurance policies with pagination

        Args:
            page: Page number (1-indexed)
            per_page: Items per page
            insurance_type: Filter by insurance type (optional)

        Returns:
            Tuple of (insurance policies, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        insurance_list, total = await self.repository.get_all(skip, per_page, insurance_type)

        total_pages = (total + per_page - 1) // per_page

        return insurance_list, total, total_pages

    async def update_insurance(
        self,
        insurance_id: UUID,
        update_data: InsuranceUpdate
    ) -> Insurance:
        """
        Update an insurance policy

        Args:
            insurance_id: Insurance ID
            update_data: Fields to update

        Returns:
            Updated insurance

        Raises:
            HTTPException: If insurance not found or validation fails
        """
        # Check insurance exists
        await self.get_insurance(insurance_id)

        # Validate dates if both are being updated
        if update_data.endDate and update_data.startDate:
            if update_data.endDate < update_data.startDate:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="End date must be after start date"
                )

        updated_insurance = await self.repository.update(insurance_id, update_data)
        if not updated_insurance:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Insurance {insurance_id} not found"
            )

        logger.info(f"Insurance updated: {insurance_id}")
        return updated_insurance

    async def delete_insurance(self, insurance_id: UUID) -> dict:
        """
        Delete an insurance policy

        Args:
            insurance_id: Insurance ID

        Returns:
            Success message

        Raises:
            HTTPException: If insurance not found
        """
        # Check insurance exists
        await self.get_insurance(insurance_id)

        success = await self.repository.delete(insurance_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Insurance {insurance_id} not found"
            )

        logger.info(f"Insurance deleted: {insurance_id}")
        return {"message": "Insurance deleted successfully"}
