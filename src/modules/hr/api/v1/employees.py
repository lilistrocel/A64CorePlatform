"""
HR Module - Employee API Routes

Endpoints for employee CRUD operations.
"""

from fastapi import APIRouter, Depends, status, Query
from typing import Optional
from uuid import UUID
import logging

from src.modules.hr.models.employee import Employee, EmployeeCreate, EmployeeUpdate, EmployeeStatus
from src.modules.hr.services.employee import EmployeeService
from src.modules.hr.middleware.auth import require_permission, CurrentUser
from src.modules.hr.utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "",
    response_model=SuccessResponse[Employee],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new employee",
    description="Create a new employee. Requires hr.create permission."
)
async def create_employee(
    employee_data: EmployeeCreate,
    current_user: CurrentUser = Depends(require_permission("hr.create")),
    service: EmployeeService = Depends()
):
    """Create a new employee"""
    employee = await service.create_employee(
        employee_data,
        UUID(current_user.userId)
    )

    return SuccessResponse(
        data=employee,
        message="Employee created successfully"
    )


@router.get(
    "",
    response_model=PaginatedResponse[Employee],
    summary="Get all employees",
    description="Get all employees with pagination and filters. Requires hr.view permission."
)
async def get_employees(
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[EmployeeStatus] = Query(None, description="Filter by employee status"),
    department: Optional[str] = Query(None, description="Filter by department"),
    current_user: CurrentUser = Depends(require_permission("hr.view")),
    service: EmployeeService = Depends()
):
    """Get all employees with pagination"""
    employees, total, total_pages = await service.get_all_employees(
        page, perPage, status, department
    )

    return PaginatedResponse(
        data=employees,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/search",
    response_model=PaginatedResponse[Employee],
    summary="Search employees",
    description="Search employees by name, email, or department. Requires hr.view permission."
)
async def search_employees(
    q: str = Query(..., min_length=1, description="Search term"),
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: CurrentUser = Depends(require_permission("hr.view")),
    service: EmployeeService = Depends()
):
    """Search employees"""
    employees, total, total_pages = await service.search_employees(
        q, page, perPage
    )

    return PaginatedResponse(
        data=employees,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/{employee_id}",
    response_model=SuccessResponse[Employee],
    summary="Get employee by ID",
    description="Get a specific employee by ID. Requires hr.view permission."
)
async def get_employee(
    employee_id: UUID,
    current_user: CurrentUser = Depends(require_permission("hr.view")),
    service: EmployeeService = Depends()
):
    """Get employee by ID"""
    employee = await service.get_employee(employee_id)
    return SuccessResponse(data=employee)


@router.patch(
    "/{employee_id}",
    response_model=SuccessResponse[Employee],
    summary="Update employee",
    description="Update an employee. Requires hr.edit permission."
)
async def update_employee(
    employee_id: UUID,
    update_data: EmployeeUpdate,
    current_user: CurrentUser = Depends(require_permission("hr.edit")),
    service: EmployeeService = Depends()
):
    """Update an employee"""
    employee = await service.update_employee(employee_id, update_data)

    return SuccessResponse(
        data=employee,
        message="Employee updated successfully"
    )


@router.delete(
    "/{employee_id}",
    response_model=SuccessResponse[dict],
    summary="Delete employee",
    description="Delete an employee. Requires hr.delete permission."
)
async def delete_employee(
    employee_id: UUID,
    current_user: CurrentUser = Depends(require_permission("hr.delete")),
    service: EmployeeService = Depends()
):
    """Delete an employee"""
    result = await service.delete_employee(employee_id)

    return SuccessResponse(
        data=result,
        message="Employee deleted successfully"
    )
