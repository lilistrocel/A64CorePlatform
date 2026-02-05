"""
HR Module - Employee API Routes

Endpoints for employee CRUD operations.
Includes nested routes for contracts, visas, insurance, and performance.
"""

from fastapi import APIRouter, Depends, status, Query
from typing import Optional
from uuid import UUID
import logging

from src.modules.hr.models.employee import Employee, EmployeeCreate, EmployeeUpdate, EmployeeStatus
from src.modules.hr.models.contract import Contract, ContractCreate, ContractStatus
from src.modules.hr.models.visa import Visa, VisaCreate
from src.modules.hr.models.insurance import Insurance, InsuranceCreate
from src.modules.hr.models.performance import PerformanceReview, PerformanceReviewCreate
from src.modules.hr.services.employee import (
    EmployeeService,
    ContractService,
    VisaService,
    InsuranceService,
    PerformanceService
)
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
    search: Optional[str] = Query(None, description="Search by name, email, or department"),
    current_user: CurrentUser = Depends(require_permission("hr.view")),
    service: EmployeeService = Depends()
):
    """Get all employees with pagination and optional search"""
    if search and search.strip():
        employees, total, total_pages = await service.search_employees(
            search.strip(), page, perPage
        )
    else:
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


# ============================================================================
# NESTED CONTRACT ROUTES
# ============================================================================

@router.get(
    "/{employee_id}/contracts",
    response_model=PaginatedResponse[Contract],
    summary="Get employee contracts",
    description="Get all contracts for a specific employee. Requires hr.view permission."
)
async def get_employee_contracts(
    employee_id: UUID,
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[ContractStatus] = Query(None, description="Filter by contract status"),
    current_user: CurrentUser = Depends(require_permission("hr.view")),
    service: ContractService = Depends()
):
    """Get contracts for a specific employee"""
    contracts, total, total_pages = await service.get_employee_contracts(
        employee_id, page, perPage, status
    )

    return PaginatedResponse(
        data=contracts,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.post(
    "/{employee_id}/contracts",
    response_model=SuccessResponse[Contract],
    status_code=status.HTTP_201_CREATED,
    summary="Create contract for employee",
    description="Create a new contract for an employee. Requires hr.create permission."
)
async def create_contract_for_employee(
    employee_id: UUID,
    contract_data: ContractCreate,
    current_user: CurrentUser = Depends(require_permission("hr.create")),
    service: ContractService = Depends()
):
    """Create a new contract for an employee"""
    contract_data.employeeId = employee_id
    contract = await service.create_contract(contract_data)

    return SuccessResponse(
        data=contract,
        message="Contract created successfully"
    )


# ============================================================================
# NESTED VISA ROUTES
# ============================================================================

@router.get(
    "/{employee_id}/visas",
    response_model=PaginatedResponse[Visa],
    summary="Get employee visas",
    description="Get all visas for a specific employee. Requires hr.view permission."
)
async def get_employee_visas(
    employee_id: UUID,
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: CurrentUser = Depends(require_permission("hr.view")),
    service: VisaService = Depends()
):
    """Get visas for a specific employee"""
    visas, total, total_pages = await service.get_employee_visas(
        employee_id, page, perPage
    )

    return PaginatedResponse(
        data=visas,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.post(
    "/{employee_id}/visas",
    response_model=SuccessResponse[Visa],
    status_code=status.HTTP_201_CREATED,
    summary="Create visa for employee",
    description="Create a new visa for an employee. Requires hr.create permission."
)
async def create_visa_for_employee(
    employee_id: UUID,
    visa_data: VisaCreate,
    current_user: CurrentUser = Depends(require_permission("hr.create")),
    service: VisaService = Depends()
):
    """Create a new visa for an employee"""
    visa_data.employeeId = employee_id
    visa = await service.create_visa(visa_data)

    return SuccessResponse(
        data=visa,
        message="Visa created successfully"
    )


# ============================================================================
# NESTED INSURANCE ROUTES
# ============================================================================

@router.get(
    "/{employee_id}/insurance",
    response_model=PaginatedResponse[Insurance],
    summary="Get employee insurance",
    description="Get all insurance policies for a specific employee. Requires hr.view permission."
)
async def get_employee_insurance(
    employee_id: UUID,
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: CurrentUser = Depends(require_permission("hr.view")),
    service: InsuranceService = Depends()
):
    """Get insurance policies for a specific employee"""
    insurance_list, total, total_pages = await service.get_employee_insurance(
        employee_id, page, perPage
    )

    return PaginatedResponse(
        data=insurance_list,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.post(
    "/{employee_id}/insurance",
    response_model=SuccessResponse[Insurance],
    status_code=status.HTTP_201_CREATED,
    summary="Create insurance for employee",
    description="Create a new insurance policy for an employee. Requires hr.create permission."
)
async def create_insurance_for_employee(
    employee_id: UUID,
    insurance_data: InsuranceCreate,
    current_user: CurrentUser = Depends(require_permission("hr.create")),
    service: InsuranceService = Depends()
):
    """Create a new insurance policy for an employee"""
    insurance_data.employeeId = employee_id
    insurance = await service.create_insurance(insurance_data)

    return SuccessResponse(
        data=insurance,
        message="Insurance created successfully"
    )


# ============================================================================
# NESTED PERFORMANCE ROUTES
# ============================================================================

@router.get(
    "/{employee_id}/performance",
    response_model=PaginatedResponse[PerformanceReview],
    summary="Get employee performance reviews",
    description="Get all performance reviews for a specific employee. Requires hr.view permission."
)
async def get_employee_performance_reviews(
    employee_id: UUID,
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: CurrentUser = Depends(require_permission("hr.view")),
    service: PerformanceService = Depends()
):
    """Get performance reviews for a specific employee"""
    reviews, total, total_pages = await service.get_employee_performance_reviews(
        employee_id, page, perPage
    )

    return PaginatedResponse(
        data=reviews,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.post(
    "/{employee_id}/performance",
    response_model=SuccessResponse[PerformanceReview],
    status_code=status.HTTP_201_CREATED,
    summary="Create performance review for employee",
    description="Create a new performance review for an employee. Requires hr.create permission."
)
async def create_performance_review_for_employee(
    employee_id: UUID,
    review_data: PerformanceReviewCreate,
    current_user: CurrentUser = Depends(require_permission("hr.create")),
    service: PerformanceService = Depends()
):
    """Create a new performance review for an employee"""
    review_data.employeeId = employee_id
    review = await service.create_performance_review(review_data)

    return SuccessResponse(
        data=review,
        message="Performance review created successfully"
    )
