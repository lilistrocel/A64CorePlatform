"""
Marketing Budget Repository

Data access layer for Marketing Budget operations.
Handles all database interactions for budgets.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
import logging

from ...models.budget import Budget, BudgetCreate, BudgetUpdate, BudgetStatus
from ..database import marketing_db

logger = logging.getLogger(__name__)


class BudgetRepository:
    """Repository for Budget data access"""

    def __init__(self):
        self.collection_name = "marketing_budgets"

    def _get_collection(self):
        """Get budgets collection"""
        return marketing_db.get_collection(self.collection_name)

    async def create(self, budget_data: BudgetCreate, created_by: UUID) -> Budget:
        """
        Create a new budget

        Args:
            budget_data: Budget creation data
            created_by: ID of the user creating the budget

        Returns:
            Created budget
        """
        collection = self._get_collection()

        budget_dict = budget_data.model_dump()
        budget = Budget(
            **budget_dict,
            createdBy=created_by,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow()
        )

        budget_doc = budget.model_dump(by_alias=True)
        budget_doc["budgetId"] = str(budget_doc["budgetId"])
        budget_doc["createdBy"] = str(budget_doc["createdBy"])

        await collection.insert_one(budget_doc)

        logger.info(f"Created budget: {budget.budgetId}")
        return budget

    async def get_by_id(self, budget_id: UUID) -> Optional[Budget]:
        """
        Get budget by ID

        Args:
            budget_id: Budget ID

        Returns:
            Budget if found, None otherwise
        """
        collection = self._get_collection()
        budget_doc = await collection.find_one({"budgetId": str(budget_id)})

        if budget_doc:
            budget_doc.pop("_id", None)
            return Budget(**budget_doc)
        return None

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 20,
        status: Optional[BudgetStatus] = None,
        year: Optional[int] = None
    ) -> tuple[List[Budget], int]:
        """
        Get all budgets with pagination and filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            status: Filter by budget status (optional)
            year: Filter by year (optional)

        Returns:
            Tuple of (list of budgets, total count)
        """
        collection = self._get_collection()
        query = {}

        if status:
            query["status"] = status.value
        if year:
            query["year"] = year

        # Get total count
        total = await collection.count_documents(query)

        # Get budgets
        cursor = collection.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        budgets = []

        async for budget_doc in cursor:
            budget_doc.pop("_id", None)
            budgets.append(Budget(**budget_doc))

        return budgets, total

    async def update(self, budget_id: UUID, update_data: BudgetUpdate) -> Optional[Budget]:
        """
        Update a budget

        Args:
            budget_id: Budget ID
            update_data: Fields to update

        Returns:
            Updated budget if found, None otherwise
        """
        collection = self._get_collection()

        update_dict = update_data.model_dump(exclude_unset=True)
        if not update_dict:
            return await self.get_by_id(budget_id)

        update_dict["updatedAt"] = datetime.utcnow()

        result = await collection.update_one(
            {"budgetId": str(budget_id)},
            {"$set": update_dict}
        )

        if result.modified_count > 0:
            logger.info(f"Updated budget: {budget_id}")
            return await self.get_by_id(budget_id)

        return None

    async def delete(self, budget_id: UUID) -> bool:
        """
        Delete a budget (hard delete)

        Args:
            budget_id: Budget ID

        Returns:
            True if deleted, False otherwise
        """
        collection = self._get_collection()

        result = await collection.delete_one({"budgetId": str(budget_id)})

        if result.deleted_count > 0:
            logger.info(f"Deleted budget: {budget_id}")
            return True

        return False

    async def exists(self, budget_id: UUID) -> bool:
        """
        Check if budget exists

        Args:
            budget_id: Budget ID

        Returns:
            True if exists, False otherwise
        """
        collection = self._get_collection()
        count = await collection.count_documents({"budgetId": str(budget_id)})
        return count > 0
