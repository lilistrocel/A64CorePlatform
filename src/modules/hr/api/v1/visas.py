"""
HR Module - Visa API Routes

Endpoints for employee visa CRUD operations.
"""

from fastapi import APIRouter, Depends, status, Query
from typing import Optional
from uuid import UUID
import logging

from src.modules.hr.models.visa import Visa, VisaCreate, VisaUpdate, VisaStatus
from src.modules.hr.services.employee import VisaService
from src.modules.hr.middleware.auth import require_permission, CurrentUser
from src.modules.hr.utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/{visa_id}",
    response_model=SuccessResponse[Visa],
    summary="Get visa by ID",
    description="Get a specific visa by ID. Requires hr.view permission."
)
async def get_visa(
    visa_id: UUID,
    current_user: CurrentUser = Depends(require_permission("hr.view")),
    service: VisaService = Depends()
):
    """Get visa by ID"""
    visa = await service.get_visa(visa_id)
    return SuccessResponse(data=visa)


@router.patch(
    "/{visa_id}",
    response_model=SuccessResponse[Visa],
    summary="Update visa",
    description="Update a visa. Requires hr.edit permission."
)
async def update_visa(
    visa_id: UUID,
    update_data: VisaUpdate,
    current_user: CurrentUser = Depends(require_permission("hr.edit")),
    service: VisaService = Depends()
):
    """Update a visa"""
    visa = await service.update_visa(visa_id, update_data)

    return SuccessResponse(
        data=visa,
        message="Visa updated successfully"
    )


@router.delete(
    "/{visa_id}",
    response_model=SuccessResponse[dict],
    summary="Delete visa",
    description="Delete a visa. Requires hr.delete permission."
)
async def delete_visa(
    visa_id: UUID,
    current_user: CurrentUser = Depends(require_permission("hr.delete")),
    service: VisaService = Depends()
):
    """Delete a visa"""
    result = await service.delete_visa(visa_id)

    return SuccessResponse(
        data=result,
        message="Visa deleted successfully"
    )


# Employee-specific visa routes
@router.post(
    "/employee/{employee_id}/visas",
    response_model=SuccessResponse[Visa],
    status_code=status.HTTP_201_CREATED,
    summary="Create visa for employee",
    description="Create a new visa for an employee. Requires hr.create permission.",
    include_in_schema=False
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


@router.get(
    "/employee/{employee_id}/visas",
    response_model=PaginatedResponse[Visa],
    summary="Get employee visas",
    description="Get all visas for a specific employee. Requires hr.view permission.",
    include_in_schema=False
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
