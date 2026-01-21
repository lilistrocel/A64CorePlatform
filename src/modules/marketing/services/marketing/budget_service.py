"""
Marketing Budget Service

Business logic layer for Marketing Budget operations.
Handles validation, permissions, and orchestration.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException, status
import logging

from ...models.budget import Budget, BudgetCreate, BudgetUpdate, BudgetStatus
from .budget_repository import BudgetRepository

logger = logging.getLogger(__name__)


class BudgetService:
    """Service for Budget business logic"""

    def __init__(self):
        self.repository = BudgetRepository()

    async def create_budget(
        self,
        budget_data: BudgetCreate,
        created_by: UUID
    ) -> Budget:
        """
        Create a new budget

        Args:
            budget_data: Budget creation data
            created_by: ID of the user creating the budget

        Returns:
            Created budget

        Raises:
            HTTPException: If validation fails
        """
        try:
            # Business logic validation
            if budget_data.allocatedAmount > budget_data.totalAmount:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Allocated amount cannot exceed total budget amount"
                )

            if budget_data.spentAmount > budget_data.allocatedAmount:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Spent amount cannot exceed allocated amount"
                )

            budget = await self.repository.create(budget_data, created_by)
            logger.info(f"Budget created: {budget.budgetId} by user {created_by}")
            return budget

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating budget: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create budget"
            )

    async def get_budget(self, budget_id: UUID) -> Budget:
        """
        Get budget by ID

        Args:
            budget_id: Budget ID

        Returns:
            Budget

        Raises:
            HTTPException: If budget not found
        """
        budget = await self.repository.get_by_id(budget_id)
        if not budget:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Budget {budget_id} not found"
            )
        return budget

    async def get_all_budgets(
        self,
        page: int = 1,
        per_page: int = 20,
        status: Optional[BudgetStatus] = None,
        year: Optional[int] = None
    ) -> tuple[List[Budget], int, int]:
        """
        Get all budgets with pagination

        Args:
            page: Page number (1-indexed)
            per_page: Items per page
            status: Filter by budget status (optional)
            year: Filter by year (optional)

        Returns:
            Tuple of (budgets, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        budgets, total = await self.repository.get_all(skip, per_page, status, year)

        total_pages = (total + per_page - 1) // per_page  # Ceiling division

        return budgets, total, total_pages

    async def update_budget(
        self,
        budget_id: UUID,
        update_data: BudgetUpdate
    ) -> Budget:
        """
        Update a budget

        Args:
            budget_id: Budget ID
            update_data: Fields to update

        Returns:
            Updated budget

        Raises:
            HTTPException: If budget not found or validation fails
        """
        # Check budget exists
        await self.get_budget(budget_id)

        # Validate amounts if updating
        if update_data.allocatedAmount is not None or update_data.totalAmount is not None or update_data.spentAmount is not None:
            current_budget = await self.repository.get_by_id(budget_id)

            total = update_data.totalAmount if update_data.totalAmount is not None else current_budget.totalAmount
            allocated = update_data.allocatedAmount if update_data.allocatedAmount is not None else current_budget.allocatedAmount
            spent = update_data.spentAmount if update_data.spentAmount is not None else current_budget.spentAmount

            if allocated > total:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Allocated amount cannot exceed total budget amount"
                )

            if spent > allocated:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Spent amount cannot exceed allocated amount"
                )

        updated_budget = await self.repository.update(budget_id, update_data)
        if not updated_budget:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Budget {budget_id} not found"
            )

        logger.info(f"Budget updated: {budget_id}")
        return updated_budget

    async def delete_budget(self, budget_id: UUID) -> dict:
        """
        Delete a budget

        Args:
            budget_id: Budget ID

        Returns:
            Success message

        Raises:
            HTTPException: If budget not found
        """
        # Check budget exists
        await self.get_budget(budget_id)

        success = await self.repository.delete(budget_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Budget {budget_id} not found"
            )

        logger.info(f"Budget deleted: {budget_id}")
        return {"message": "Budget deleted successfully"}
