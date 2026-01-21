"""
Performance Review Service

Business logic layer for Performance Review operations.
Handles validation, permissions, and orchestration.
"""

from typing import List
from uuid import UUID
from fastapi import HTTPException, status
import logging

from src.modules.hr.models.performance import PerformanceReview, PerformanceReviewCreate, PerformanceReviewUpdate
from src.modules.hr.services.employee.performance_repository import PerformanceRepository
from src.modules.hr.services.employee.employee_repository import EmployeeRepository

logger = logging.getLogger(__name__)


class PerformanceService:
    """Service for Performance Review business logic"""

    def __init__(self):
        self.repository = PerformanceRepository()
        self.employee_repository = EmployeeRepository()

    async def create_performance_review(
        self,
        review_data: PerformanceReviewCreate
    ) -> PerformanceReview:
        """
        Create a new performance review

        Args:
            review_data: Performance review creation data

        Returns:
            Created performance review

        Raises:
            HTTPException: If validation fails or employee not found
        """
        try:
            # Verify employee exists
            employee_exists = await self.employee_repository.exists(review_data.employeeId)
            if not employee_exists:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Employee {review_data.employeeId} not found"
                )

            review = await self.repository.create(review_data)
            logger.info(f"Performance review created: {review.reviewId} for employee {review.employeeId}")
            return review

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating performance review: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create performance review"
            )

    async def get_performance_review(self, review_id: UUID) -> PerformanceReview:
        """
        Get performance review by ID

        Args:
            review_id: Review ID

        Returns:
            Performance review

        Raises:
            HTTPException: If performance review not found
        """
        review = await self.repository.get_by_id(review_id)
        if not review:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Performance review {review_id} not found"
            )
        return review

    async def get_employee_performance_reviews(
        self,
        employee_id: UUID,
        page: int = 1,
        per_page: int = 20
    ) -> tuple[List[PerformanceReview], int, int]:
        """
        Get performance reviews for a specific employee

        Args:
            employee_id: Employee ID
            page: Page number (1-indexed)
            per_page: Items per page

        Returns:
            Tuple of (performance reviews, total, total_pages)
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
        reviews, total = await self.repository.get_by_employee_id(employee_id, skip, per_page)

        total_pages = (total + per_page - 1) // per_page

        return reviews, total, total_pages

    async def get_all_performance_reviews(
        self,
        page: int = 1,
        per_page: int = 20
    ) -> tuple[List[PerformanceReview], int, int]:
        """
        Get all performance reviews with pagination

        Args:
            page: Page number (1-indexed)
            per_page: Items per page

        Returns:
            Tuple of (performance reviews, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        reviews, total = await self.repository.get_all(skip, per_page)

        total_pages = (total + per_page - 1) // per_page

        return reviews, total, total_pages

    async def get_dashboard_metrics(self) -> dict:
        """
        Get HR dashboard metrics

        Returns:
            Dashboard metrics including average ratings and happiness scores
        """
        return await self.repository.get_dashboard_metrics()

    async def update_performance_review(
        self,
        review_id: UUID,
        update_data: PerformanceReviewUpdate
    ) -> PerformanceReview:
        """
        Update a performance review

        Args:
            review_id: Review ID
            update_data: Fields to update

        Returns:
            Updated performance review

        Raises:
            HTTPException: If performance review not found
        """
        # Check review exists
        await self.get_performance_review(review_id)

        updated_review = await self.repository.update(review_id, update_data)
        if not updated_review:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Performance review {review_id} not found"
            )

        logger.info(f"Performance review updated: {review_id}")
        return updated_review

    async def delete_performance_review(self, review_id: UUID) -> dict:
        """
        Delete a performance review

        Args:
            review_id: Review ID

        Returns:
            Success message

        Raises:
            HTTPException: If performance review not found
        """
        # Check review exists
        await self.get_performance_review(review_id)

        success = await self.repository.delete(review_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Performance review {review_id} not found"
            )

        logger.info(f"Performance review deleted: {review_id}")
        return {"message": "Performance review deleted successfully"}
