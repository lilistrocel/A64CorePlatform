"""
HR Module - Contract API Routes

Endpoints for employment contract CRUD operations.
"""

from fastapi import APIRouter, Depends, status, Query
from typing import Optional
from uuid import UUID
import logging

from src.modules.hr.models.contract import Contract, ContractCreate, ContractUpdate, ContractStatus
from src.modules.hr.services.employee import ContractService
from src.modules.hr.middleware.auth import require_permission, CurrentUser
from src.modules.hr.utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/{contract_id}",
    response_model=SuccessResponse[Contract],
    summary="Get contract by ID",
    description="Get a specific contract by ID. Requires hr.view permission."
)
async def get_contract(
    contract_id: UUID,
    current_user: CurrentUser = Depends(require_permission("hr.view")),
    service: ContractService = Depends()
):
    """Get contract by ID"""
    contract = await service.get_contract(contract_id)
    return SuccessResponse(data=contract)


@router.patch(
    "/{contract_id}",
    response_model=SuccessResponse[Contract],
    summary="Update contract",
    description="Update a contract. Requires hr.edit permission."
)
async def update_contract(
    contract_id: UUID,
    update_data: ContractUpdate,
    current_user: CurrentUser = Depends(require_permission("hr.edit")),
    service: ContractService = Depends()
):
    """Update a contract"""
    contract = await service.update_contract(contract_id, update_data)

    return SuccessResponse(
        data=contract,
        message="Contract updated successfully"
    )


@router.delete(
    "/{contract_id}",
    response_model=SuccessResponse[dict],
    summary="Delete contract",
    description="Delete a contract. Requires hr.delete permission."
)
async def delete_contract(
    contract_id: UUID,
    current_user: CurrentUser = Depends(require_permission("hr.delete")),
    service: ContractService = Depends()
):
    """Delete a contract"""
    result = await service.delete_contract(contract_id)

    return SuccessResponse(
        data=result,
        message="Contract deleted successfully"
    )


# Employee-specific contract routes (nested under /employees in main router)
@router.post(
    "/employee/{employee_id}/contracts",
    response_model=SuccessResponse[Contract],
    status_code=status.HTTP_201_CREATED,
    summary="Create contract for employee",
    description="Create a new contract for an employee. Requires hr.create permission.",
    include_in_schema=False  # Will be included via employees router
)
async def create_contract_for_employee(
    employee_id: UUID,
    contract_data: ContractCreate,
    current_user: CurrentUser = Depends(require_permission("hr.create")),
    service: ContractService = Depends()
):
    """Create a new contract for an employee"""
    # Override employeeId from path parameter
    contract_data.employeeId = employee_id

    contract = await service.create_contract(contract_data)

    return SuccessResponse(
        data=contract,
        message="Contract created successfully"
    )


@router.get(
    "/employee/{employee_id}/contracts",
    response_model=PaginatedResponse[Contract],
    summary="Get employee contracts",
    description="Get all contracts for a specific employee. Requires hr.view permission.",
    include_in_schema=False  # Will be included via employees router
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
