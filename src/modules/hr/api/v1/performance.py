"""
HR Module - Performance Review API Routes

Endpoints for employee performance review CRUD operations.
"""

from fastapi import APIRouter, Depends, status, Query
from uuid import UUID
import logging

from src.modules.hr.models.performance import PerformanceReview, PerformanceReviewCreate, PerformanceReviewUpdate
from src.modules.hr.services.employee import PerformanceService
from src.modules.hr.middleware.auth import require_permission, CurrentUser
from src.modules.hr.utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/dashboard",
    response_model=SuccessResponse[dict],
    summary="Get HR dashboard metrics",
    description="Get HR performance metrics including average ratings and happiness scores. Requires hr.view permission."
)
async def get_dashboard_metrics(
    current_user: CurrentUser = Depends(require_permission("hr.view")),
    service: PerformanceService = Depends()
):
    """Get HR dashboard metrics"""
    metrics = await service.get_dashboard_metrics()
    return SuccessResponse(data=metrics)


@router.get(
    "/{review_id}",
    response_model=SuccessResponse[PerformanceReview],
    summary="Get performance review by ID",
    description="Get a specific performance review by ID. Requires hr.view permission."
)
async def get_performance_review(
    review_id: UUID,
    current_user: CurrentUser = Depends(require_permission("hr.view")),
    service: PerformanceService = Depends()
):
    """Get performance review by ID"""
    review = await service.get_performance_review(review_id)
    return SuccessResponse(data=review)


@router.patch(
    "/{review_id}",
    response_model=SuccessResponse[PerformanceReview],
    summary="Update performance review",
    description="Update a performance review. Requires hr.edit permission."
)
async def update_performance_review(
    review_id: UUID,
    update_data: PerformanceReviewUpdate,
    current_user: CurrentUser = Depends(require_permission("hr.edit")),
    service: PerformanceService = Depends()
):
    """Update a performance review"""
    review = await service.update_performance_review(review_id, update_data)

    return SuccessResponse(
        data=review,
        message="Performance review updated successfully"
    )


@router.delete(
    "/{review_id}",
    response_model=SuccessResponse[dict],
    summary="Delete performance review",
    description="Delete a performance review. Requires hr.delete permission."
)
async def delete_performance_review(
    review_id: UUID,
    current_user: CurrentUser = Depends(require_permission("hr.delete")),
    service: PerformanceService = Depends()
):
    """Delete a performance review"""
    result = await service.delete_performance_review(review_id)

    return SuccessResponse(
        data=result,
        message="Performance review deleted successfully"
    )


# Employee-specific performance review routes
@router.post(
    "/employee/{employee_id}/performance",
    response_model=SuccessResponse[PerformanceReview],
    status_code=status.HTTP_201_CREATED,
    summary="Create performance review for employee",
    description="Create a new performance review for an employee. Requires hr.create permission.",
    include_in_schema=False
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


@router.get(
    "/employee/{employee_id}/performance",
    response_model=PaginatedResponse[PerformanceReview],
    summary="Get employee performance reviews",
    description="Get all performance reviews for a specific employee. Requires hr.view permission.",
    include_in_schema=False
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
