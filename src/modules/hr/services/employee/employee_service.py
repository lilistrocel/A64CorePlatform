"""
Employee Service

Business logic layer for Employee operations.
Handles validation, permissions, and orchestration.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException, status
import logging

from src.modules.hr.models.employee import Employee, EmployeeCreate, EmployeeUpdate, EmployeeStatus
from src.modules.hr.services.employee.employee_repository import EmployeeRepository

logger = logging.getLogger(__name__)


class EmployeeService:
    """Service for Employee business logic"""

    def __init__(self):
        self.repository = EmployeeRepository()

    async def create_employee(
        self,
        employee_data: EmployeeCreate,
        created_by: UUID
    ) -> Employee:
        """
        Create a new employee

        Args:
            employee_data: Employee creation data
            created_by: ID of the user creating the employee

        Returns:
            Created employee

        Raises:
            HTTPException: If validation fails
        """
        try:
            # Business logic validation
            if not employee_data.firstName or not employee_data.firstName.strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="First name is required"
                )

            if not employee_data.lastName or not employee_data.lastName.strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Last name is required"
                )

            employee = await self.repository.create(employee_data, created_by)
            logger.info(f"Employee created: {employee.employeeId} by user {created_by}")
            return employee

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating employee: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create employee"
            )

    async def get_employee(self, employee_id: UUID) -> Employee:
        """
        Get employee by ID

        Args:
            employee_id: Employee ID

        Returns:
            Employee

        Raises:
            HTTPException: If employee not found
        """
        employee = await self.repository.get_by_id(employee_id)
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Employee {employee_id} not found"
            )
        return employee

    async def get_all_employees(
        self,
        page: int = 1,
        per_page: int = 20,
        status: Optional[EmployeeStatus] = None,
        department: Optional[str] = None
    ) -> tuple[List[Employee], int, int]:
        """
        Get all employees with pagination

        Args:
            page: Page number (1-indexed)
            per_page: Items per page
            status: Filter by employee status (optional)
            department: Filter by department (optional)

        Returns:
            Tuple of (employees, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        employees, total = await self.repository.get_all(skip, per_page, status, department)

        total_pages = (total + per_page - 1) // per_page  # Ceiling division

        return employees, total, total_pages

    async def search_employees(
        self,
        search_term: str,
        page: int = 1,
        per_page: int = 20
    ) -> tuple[List[Employee], int, int]:
        """
        Search employees by name, email, or department

        Args:
            search_term: Search term to match
            page: Page number (1-indexed)
            per_page: Items per page

        Returns:
            Tuple of (employees, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        employees, total = await self.repository.search(search_term, skip, per_page)

        total_pages = (total + per_page - 1) // per_page

        return employees, total, total_pages

    async def update_employee(
        self,
        employee_id: UUID,
        update_data: EmployeeUpdate
    ) -> Employee:
        """
        Update an employee

        Args:
            employee_id: Employee ID
            update_data: Fields to update

        Returns:
            Updated employee

        Raises:
            HTTPException: If employee not found or validation fails
        """
        # Check employee exists
        await self.get_employee(employee_id)

        # Validate update data
        if update_data.firstName is not None and not update_data.firstName.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="First name cannot be empty"
            )

        if update_data.lastName is not None and not update_data.lastName.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Last name cannot be empty"
            )

        updated_employee = await self.repository.update(employee_id, update_data)
        if not updated_employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Employee {employee_id} not found"
            )

        logger.info(f"Employee updated: {employee_id}")
        return updated_employee

    async def delete_employee(self, employee_id: UUID) -> dict:
        """
        Delete an employee

        Args:
            employee_id: Employee ID

        Returns:
            Success message

        Raises:
            HTTPException: If employee not found
        """
        # Check employee exists
        await self.get_employee(employee_id)

        success = await self.repository.delete(employee_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Employee {employee_id} not found"
            )

        logger.info(f"Employee deleted: {employee_id}")
        return {"message": "Employee deleted successfully"}
