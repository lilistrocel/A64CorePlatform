"""
Customer Service

Business logic layer for Customer operations.
Handles validation, permissions, and orchestration.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException, status
import logging

from ...models.customer import Customer, CustomerCreate, CustomerUpdate, CustomerStatus
from .customer_repository import CustomerRepository

logger = logging.getLogger(__name__)


class CustomerService:
    """Service for Customer business logic"""

    def __init__(self):
        self.repository = CustomerRepository()

    async def create_customer(
        self,
        customer_data: CustomerCreate,
        created_by: UUID
    ) -> Customer:
        """
        Create a new customer

        Args:
            customer_data: Customer creation data
            created_by: ID of the user creating the customer

        Returns:
            Created customer

        Raises:
            HTTPException: If validation fails
        """
        try:
            # Business logic validation
            if not customer_data.name or not customer_data.name.strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Customer name is required"
                )

            customer = await self.repository.create(customer_data, created_by)
            logger.info(f"Customer created: {customer.customerId} by user {created_by}")
            return customer

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating customer: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create customer"
            )

    async def get_customer(self, customer_id: UUID) -> Customer:
        """
        Get customer by ID

        Args:
            customer_id: Customer ID

        Returns:
            Customer

        Raises:
            HTTPException: If customer not found
        """
        customer = await self.repository.get_by_id(customer_id)
        if not customer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Customer {customer_id} not found"
            )
        return customer

    async def get_all_customers(
        self,
        page: int = 1,
        per_page: int = 20,
        status: Optional[CustomerStatus] = None,
        customer_type: Optional[str] = None
    ) -> tuple[List[Customer], int, int]:
        """
        Get all customers with pagination

        Args:
            page: Page number (1-indexed)
            per_page: Items per page
            status: Filter by customer status (optional)
            customer_type: Filter by customer type (optional)

        Returns:
            Tuple of (customers, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        customers, total = await self.repository.get_all(skip, per_page, status, customer_type)

        total_pages = (total + per_page - 1) // per_page  # Ceiling division

        return customers, total, total_pages

    async def search_customers(
        self,
        search_term: str,
        page: int = 1,
        per_page: int = 20
    ) -> tuple[List[Customer], int, int]:
        """
        Search customers by name, email, or company

        Args:
            search_term: Search term to match
            page: Page number (1-indexed)
            per_page: Items per page

        Returns:
            Tuple of (customers, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        customers, total = await self.repository.search(search_term, skip, per_page)

        total_pages = (total + per_page - 1) // per_page

        return customers, total, total_pages

    async def update_customer(
        self,
        customer_id: UUID,
        update_data: CustomerUpdate
    ) -> Customer:
        """
        Update a customer

        Args:
            customer_id: Customer ID
            update_data: Fields to update

        Returns:
            Updated customer

        Raises:
            HTTPException: If customer not found or validation fails
        """
        # Check customer exists
        await self.get_customer(customer_id)

        # Validate update data
        if update_data.name is not None and not update_data.name.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Customer name cannot be empty"
            )

        updated_customer = await self.repository.update(customer_id, update_data)
        if not updated_customer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Customer {customer_id} not found"
            )

        logger.info(f"Customer updated: {customer_id}")
        return updated_customer

    async def delete_customer(self, customer_id: UUID) -> dict:
        """
        Delete a customer

        Args:
            customer_id: Customer ID

        Returns:
            Success message

        Raises:
            HTTPException: If customer not found
        """
        # Check customer exists
        await self.get_customer(customer_id)

        success = await self.repository.delete(customer_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Customer {customer_id} not found"
            )

        logger.info(f"Customer deleted: {customer_id}")
        return {"message": "Customer deleted successfully"}
