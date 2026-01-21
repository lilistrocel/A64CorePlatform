"""
HR Module - Insurance API Routes

Endpoints for employee insurance policy CRUD operations.
"""

from fastapi import APIRouter, Depends, status, Query
from typing import Optional
from uuid import UUID
import logging

from src.modules.hr.models.insurance import Insurance, InsuranceCreate, InsuranceUpdate, InsuranceType
from src.modules.hr.services.employee import InsuranceService
from src.modules.hr.middleware.auth import require_permission, CurrentUser
from src.modules.hr.utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/{insurance_id}",
    response_model=SuccessResponse[Insurance],
    summary="Get insurance by ID",
    description="Get a specific insurance policy by ID. Requires hr.view permission."
)
async def get_insurance(
    insurance_id: UUID,
    current_user: CurrentUser = Depends(require_permission("hr.view")),
    service: InsuranceService = Depends()
):
    """Get insurance by ID"""
    insurance = await service.get_insurance(insurance_id)
    return SuccessResponse(data=insurance)


@router.patch(
    "/{insurance_id}",
    response_model=SuccessResponse[Insurance],
    summary="Update insurance",
    description="Update an insurance policy. Requires hr.edit permission."
)
async def update_insurance(
    insurance_id: UUID,
    update_data: InsuranceUpdate,
    current_user: CurrentUser = Depends(require_permission("hr.edit")),
    service: InsuranceService = Depends()
):
    """Update an insurance policy"""
    insurance = await service.update_insurance(insurance_id, update_data)

    return SuccessResponse(
        data=insurance,
        message="Insurance updated successfully"
    )


@router.delete(
    "/{insurance_id}",
    response_model=SuccessResponse[dict],
    summary="Delete insurance",
    description="Delete an insurance policy. Requires hr.delete permission."
)
async def delete_insurance(
    insurance_id: UUID,
    current_user: CurrentUser = Depends(require_permission("hr.delete")),
    service: InsuranceService = Depends()
):
    """Delete an insurance policy"""
    result = await service.delete_insurance(insurance_id)

    return SuccessResponse(
        data=result,
        message="Insurance deleted successfully"
    )


# Employee-specific insurance routes
@router.post(
    "/employee/{employee_id}/insurance",
    response_model=SuccessResponse[Insurance],
    status_code=status.HTTP_201_CREATED,
    summary="Create insurance for employee",
    description="Create a new insurance policy for an employee. Requires hr.create permission.",
    include_in_schema=False
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


@router.get(
    "/employee/{employee_id}/insurance",
    response_model=PaginatedResponse[Insurance],
    summary="Get employee insurance",
    description="Get all insurance policies for a specific employee. Requires hr.view permission.",
    include_in_schema=False
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
