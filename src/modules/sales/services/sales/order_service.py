"""
Sales Order Service

Business logic layer for Sales Order operations.
Handles validation, permissions, and orchestration.
Integrates with CRM module to validate customers.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException, status
import logging

from ...models.sales_order import SalesOrder, SalesOrderCreate, SalesOrderUpdate, SalesOrderStatus
from .order_repository import OrderRepository
from ..database import sales_db

logger = logging.getLogger(__name__)


class OrderService:
    """Service for Sales Order business logic"""

    def __init__(self):
        self.repository = OrderRepository()

    async def _validate_customer_exists(self, customer_id: UUID) -> dict:
        """
        Validate that customer exists in CRM system

        Args:
            customer_id: Customer ID to validate

        Returns:
            Customer data from CRM

        Raises:
            HTTPException: If customer not found
        """
        try:
            # Check customer in CRM customers collection
            db = sales_db.get_database()
            customer_doc = await db.customers.find_one({"customerId": str(customer_id)})

            if not customer_doc:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Customer {customer_id} not found in CRM system"
                )

            return customer_doc

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error validating customer: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to validate customer"
            )

    async def create_order(
        self,
        order_data: SalesOrderCreate,
        created_by: UUID
    ) -> SalesOrder:
        """
        Create a new sales order

        Args:
            order_data: Sales order creation data
            created_by: ID of the user creating the order

        Returns:
            Created sales order

        Raises:
            HTTPException: If validation fails or customer not found
        """
        try:
            # Validate customer exists in CRM
            customer = await self._validate_customer_exists(order_data.customerId)

            # Verify customer name matches (optional - can be used for denormalization)
            if order_data.customerName != customer.get("name"):
                logger.warning(
                    f"Customer name mismatch: provided '{order_data.customerName}' vs CRM '{customer.get('name')}'"
                )

            # Business logic validation
            if not order_data.items or len(order_data.items) == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Order must contain at least one item"
                )

            # Validate totals
            calculated_subtotal = sum(item.totalPrice for item in order_data.items)
            if abs(calculated_subtotal - order_data.subtotal) > 0.01:  # Allow small floating point differences
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Subtotal mismatch: calculated {calculated_subtotal}, provided {order_data.subtotal}"
                )

            calculated_total = order_data.subtotal + order_data.tax - order_data.discount
            if abs(calculated_total - order_data.total) > 0.01:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Total mismatch: calculated {calculated_total}, provided {order_data.total}"
                )

            order = await self.repository.create(order_data, created_by)
            logger.info(f"Sales order created: {order.orderId} by user {created_by}")
            return order

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating sales order: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create sales order"
            )

    async def get_order(self, order_id: UUID) -> SalesOrder:
        """
        Get sales order by ID

        Args:
            order_id: Sales order ID

        Returns:
            Sales order

        Raises:
            HTTPException: If order not found
        """
        order = await self.repository.get_by_id(order_id)
        if not order:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Sales order {order_id} not found"
            )
        return order

    async def get_all_orders(
        self,
        page: int = 1,
        per_page: int = 20,
        status: Optional[SalesOrderStatus] = None,
        customer_id: Optional[UUID] = None
    ) -> tuple[List[SalesOrder], int, int]:
        """
        Get all sales orders with pagination

        Args:
            page: Page number (1-indexed)
            per_page: Items per page
            status: Filter by order status (optional)
            customer_id: Filter by customer ID (optional)

        Returns:
            Tuple of (orders, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        orders, total = await self.repository.get_all(skip, per_page, status, customer_id)

        total_pages = (total + per_page - 1) // per_page  # Ceiling division

        return orders, total, total_pages

    async def update_order(
        self,
        order_id: UUID,
        update_data: SalesOrderUpdate
    ) -> SalesOrder:
        """
        Update a sales order

        Args:
            order_id: Sales order ID
            update_data: Fields to update

        Returns:
            Updated sales order

        Raises:
            HTTPException: If order not found or validation fails
        """
        # Check order exists
        await self.get_order(order_id)

        # If updating customer, validate customer exists
        if update_data.customerId:
            await self._validate_customer_exists(update_data.customerId)

        # Validate items if provided
        if update_data.items is not None and len(update_data.items) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Order must contain at least one item"
            )

        updated_order = await self.repository.update(order_id, update_data)
        if not updated_order:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Sales order {order_id} not found"
            )

        logger.info(f"Sales order updated: {order_id}")
        return updated_order

    async def update_order_status(
        self,
        order_id: UUID,
        new_status: SalesOrderStatus
    ) -> SalesOrder:
        """
        Update order status

        Args:
            order_id: Sales order ID
            new_status: New status value

        Returns:
            Updated sales order

        Raises:
            HTTPException: If order not found
        """
        # Check order exists
        await self.get_order(order_id)

        updated_order = await self.repository.update_status(order_id, new_status)
        if not updated_order:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Sales order {order_id} not found"
            )

        logger.info(f"Sales order status updated: {order_id} -> {new_status.value}")
        return updated_order

    async def delete_order(self, order_id: UUID) -> dict:
        """
        Delete a sales order

        Args:
            order_id: Sales order ID

        Returns:
            Success message

        Raises:
            HTTPException: If order not found
        """
        # Check order exists
        await self.get_order(order_id)

        success = await self.repository.delete(order_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Sales order {order_id} not found"
            )

        logger.info(f"Sales order deleted: {order_id}")
        return {"message": "Sales order deleted successfully"}
