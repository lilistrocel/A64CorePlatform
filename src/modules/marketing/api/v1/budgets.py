"""
Marketing Module - Budget API Routes

Endpoints for marketing budget CRUD operations.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional
from uuid import UUID
import logging

from ...models.budget import Budget, BudgetCreate, BudgetUpdate, BudgetStatus
from ...services.marketing import BudgetService
from ...middleware.auth import get_current_active_user, require_permission, CurrentUser
from ...utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "",
    response_model=SuccessResponse[Budget],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new marketing budget",
    description="Create a new marketing budget. Requires marketing.create permission."
)
async def create_budget(
    budget_data: BudgetCreate,
    current_user: CurrentUser = Depends(require_permission("marketing.create")),
    service: BudgetService = Depends()
):
    """
    Create a new marketing budget

    - **name**: Budget name (required)
    - **year**: Budget year (required, 2000-2100)
    - **quarter**: Budget quarter (optional, 1-4)
    - **totalAmount**: Total budget amount (required, >= 0)
    - **allocatedAmount**: Amount allocated to campaigns (default: 0)
    - **spentAmount**: Amount already spent (default: 0)
    - **currency**: Currency code (default: USD, ISO 4217)
    - **status**: Budget status (default: draft)
    """
    budget = await service.create_budget(
        budget_data,
        UUID(current_user.userId)
    )

    return SuccessResponse(
        data=budget,
        message="Budget created successfully"
    )


@router.get(
    "",
    response_model=PaginatedResponse[Budget],
    summary="Get all marketing budgets",
    description="Get all marketing budgets with pagination and filters. Requires marketing.view permission."
)
async def get_budgets(
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[BudgetStatus] = Query(None, description="Filter by budget status"),
    year: Optional[int] = Query(None, description="Filter by year"),
    current_user: CurrentUser = Depends(require_permission("marketing.view")),
    service: BudgetService = Depends()
):
    """
    Get all marketing budgets with pagination

    - **page**: Page number (default: 1)
    - **perPage**: Items per page (default: 20, max: 100)
    - **status**: Filter by budget status (optional)
    - **year**: Filter by year (optional)
    """
    budgets, total, total_pages = await service.get_all_budgets(
        page, perPage, status, year
    )

    return PaginatedResponse(
        data=budgets,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/{budget_id}",
    response_model=SuccessResponse[Budget],
    summary="Get budget by ID",
    description="Get a specific budget by ID. Requires marketing.view permission."
)
async def get_budget(
    budget_id: UUID,
    current_user: CurrentUser = Depends(require_permission("marketing.view")),
    service: BudgetService = Depends()
):
    """
    Get budget by ID

    - **budget_id**: Budget UUID
    """
    budget = await service.get_budget(budget_id)

    return SuccessResponse(data=budget)


@router.patch(
    "/{budget_id}",
    response_model=SuccessResponse[Budget],
    summary="Update budget",
    description="Update a budget. Requires marketing.edit permission."
)
async def update_budget(
    budget_id: UUID,
    update_data: BudgetUpdate,
    current_user: CurrentUser = Depends(require_permission("marketing.edit")),
    service: BudgetService = Depends()
):
    """
    Update a budget

    - **budget_id**: Budget UUID
    - All fields are optional (partial update)
    """
    budget = await service.update_budget(
        budget_id,
        update_data
    )

    return SuccessResponse(
        data=budget,
        message="Budget updated successfully"
    )


@router.delete(
    "/{budget_id}",
    response_model=SuccessResponse[dict],
    summary="Delete budget",
    description="Delete a budget. Requires marketing.delete permission."
)
async def delete_budget(
    budget_id: UUID,
    current_user: CurrentUser = Depends(require_permission("marketing.delete")),
    service: BudgetService = Depends()
):
    """
    Delete a budget

    - **budget_id**: Budget UUID
    """
    result = await service.delete_budget(budget_id)

    return SuccessResponse(
        data=result,
        message="Budget deleted successfully"
    )
