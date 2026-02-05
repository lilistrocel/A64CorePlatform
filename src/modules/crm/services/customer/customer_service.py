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
from src.services.database import mongodb

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
        Update a customer with cascading updates to related entities.

        When customer name is updated, all related sales orders are updated
        to reflect the new customerName (denormalized field).

        Args:
            customer_id: Customer ID
            update_data: Fields to update

        Returns:
            Updated customer

        Raises:
            HTTPException: If customer not found or validation fails
        """
        # Check customer exists and get current data
        current_customer = await self.get_customer(customer_id)

        # Validate update data
        if update_data.name is not None and not update_data.name.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Customer name cannot be empty"
            )

        # Check if name is being updated (for cascading)
        name_changed = (
            update_data.name is not None and
            update_data.name.strip() != current_customer.name
        )

        updated_customer = await self.repository.update(customer_id, update_data)
        if not updated_customer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Customer {customer_id} not found"
            )

        # Cascade name update to related sales orders
        if name_changed:
            await self._cascade_customer_name_update(customer_id, updated_customer.name)

        logger.info(f"Customer updated: {customer_id}")
        return updated_customer

    async def _cascade_customer_name_update(
        self,
        customer_id: UUID,
        new_name: str
    ) -> int:
        """
        Cascade customer name update to all related sales orders.

        Updates the denormalized customerName field in all orders
        belonging to this customer.

        Args:
            customer_id: Customer ID
            new_name: New customer name

        Returns:
            Number of orders updated
        """
        db = mongodb.get_database()

        result = await db.sales_orders.update_many(
            {"customerId": str(customer_id)},
            {"$set": {"customerName": new_name}}
        )

        if result.modified_count > 0:
            logger.info(
                f"Cascaded customer name update to {result.modified_count} "
                f"sales orders for customer {customer_id}"
            )

        return result.modified_count

    async def delete_customer(self, customer_id: UUID) -> dict:
        """
        Delete a customer with sales order cascade handling.

        If the customer has active orders (not cancelled or delivered),
        the deletion is blocked with a clear error message.
        If all orders are completed/cancelled, associated orders are
        cascade deleted along with the customer.

        Args:
            customer_id: Customer ID

        Returns:
            Success message with cascade details

        Raises:
            HTTPException: If customer not found or has active orders
        """
        # Check customer exists
        customer = await self.get_customer(customer_id)

        # Check for associated sales orders
        db = mongodb.get_database()

        # Find all orders for this customer
        all_orders_count = await db.sales_orders.count_documents(
            {"customerId": str(customer_id)}
        )

        if all_orders_count > 0:
            # Check for active orders (not cancelled or delivered)
            active_statuses = ["draft", "confirmed", "processing", "assigned", "in_transit", "shipped"]
            active_orders_count = await db.sales_orders.count_documents({
                "customerId": str(customer_id),
                "status": {"$in": active_statuses}
            })

            if active_orders_count > 0:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Cannot delete customer '{customer.name}': {active_orders_count} active sales order(s) exist. Cancel or complete all orders before deleting this customer."
                )

            # All orders are completed/cancelled - cascade delete them
            delete_result = await db.sales_orders.delete_many(
                {"customerId": str(customer_id)}
            )
            orders_deleted = delete_result.deleted_count
            logger.info(f"Cascade deleted {orders_deleted} sales orders for customer {customer_id}")
        else:
            orders_deleted = 0

        # Delete the customer
        success = await self.repository.delete(customer_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Customer {customer_id} not found"
            )

        logger.info(f"Customer deleted: {customer_id} (cascade: {orders_deleted} orders)")
        return {
            "message": "Customer deleted successfully",
            "relatedRecordsDeleted": {
                "salesOrders": orders_deleted
            }
        }
