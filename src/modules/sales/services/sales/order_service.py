"""
Sales Order Service

Business logic layer for Sales Order operations.
Handles validation, permissions, and orchestration.
Integrates with CRM module to validate customers.
Integrates with Farm Manager module for inventory reservation and fulfillment.
"""

from typing import List, Optional
from uuid import UUID, uuid4
from datetime import datetime
from fastapi import HTTPException, status
import logging

from ...models.sales_order import SalesOrder, SalesOrderCreate, SalesOrderUpdate, SalesOrderStatus
from .order_repository import OrderRepository
from ..database import sales_db
from src.core.cache import get_redis_cache
from src.modules.farm_manager.services.database import farm_db
from src.modules.farm_manager.models.inventory import InventoryType, MovementType, InventoryMovement

logger = logging.getLogger(__name__)


class OrderService:
    """Service for Sales Order business logic"""

    def __init__(self):
        self.repository = OrderRepository()

    async def _reserve_inventory_for_order(self, order: SalesOrder) -> None:
        """
        Reserve inventory for all items in the order that have inventoryId.

        Args:
            order: The sales order to reserve inventory for

        Raises:
            HTTPException: If inventory not found or insufficient quantity
        """
        db = farm_db.get_database()

        for item in order.items:
            # Skip items without inventory link
            if not item.inventoryId:
                continue

            # Get the harvest inventory item
            inventory_item = await db.inventory_harvest.find_one({"inventoryId": str(item.inventoryId)})
            if not inventory_item:
                logger.warning(f"Inventory item {item.inventoryId} not found for order {order.orderId}")
                continue

            # Check available quantity
            available = inventory_item.get("availableQuantity", 0)
            if item.quantity > available:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Insufficient inventory for {item.productName}. Available: {available}, Requested: {item.quantity}"
                )

            # Update inventory: increase reservedQuantity, decrease availableQuantity
            current_reserved = inventory_item.get("reservedQuantity", 0)
            new_reserved = current_reserved + item.quantity
            new_available = available - item.quantity

            await db.inventory_harvest.update_one(
                {"inventoryId": str(item.inventoryId)},
                {"$set": {
                    "reservedQuantity": new_reserved,
                    "availableQuantity": new_available,
                    "updatedAt": datetime.utcnow().isoformat()
                }}
            )

            # Record movement
            movement = InventoryMovement(
                movementId=uuid4(),
                inventoryId=item.inventoryId,
                inventoryType=InventoryType.HARVEST,
                movementType=MovementType.SALE,
                quantityBefore=inventory_item.get("quantity", 0),
                quantityChange=0,  # Quantity doesn't change, only reservation
                quantityAfter=inventory_item.get("quantity", 0),
                organizationId=UUID(inventory_item.get("organizationId")),
                reason=f"Reserved for order {order.orderCode}",
                referenceId=str(order.orderId),
                performedBy=order.createdBy,
                performedAt=datetime.utcnow()
            )
            await db.inventory_movements.insert_one(movement.model_dump(mode="json"))

            logger.info(f"Reserved {item.quantity} {inventory_item.get('unit', 'units')} of {item.productName} for order {order.orderId}")

    async def _release_inventory_reservation(self, order: SalesOrder) -> None:
        """
        Release reserved inventory for cancelled orders.

        Args:
            order: The cancelled sales order
        """
        db = farm_db.get_database()

        for item in order.items:
            if not item.inventoryId:
                continue

            inventory_item = await db.inventory_harvest.find_one({"inventoryId": str(item.inventoryId)})
            if not inventory_item:
                logger.warning(f"Inventory item {item.inventoryId} not found when releasing reservation for order {order.orderId}")
                continue

            current_reserved = inventory_item.get("reservedQuantity", 0)
            current_available = inventory_item.get("availableQuantity", 0)

            # Release the reservation
            new_reserved = max(0, current_reserved - item.quantity)
            new_available = current_available + item.quantity

            await db.inventory_harvest.update_one(
                {"inventoryId": str(item.inventoryId)},
                {"$set": {
                    "reservedQuantity": new_reserved,
                    "availableQuantity": new_available,
                    "updatedAt": datetime.utcnow().isoformat()
                }}
            )

            # Record movement
            movement = InventoryMovement(
                movementId=uuid4(),
                inventoryId=item.inventoryId,
                inventoryType=InventoryType.HARVEST,
                movementType=MovementType.RETURN,
                quantityBefore=inventory_item.get("quantity", 0),
                quantityChange=0,
                quantityAfter=inventory_item.get("quantity", 0),
                organizationId=UUID(inventory_item.get("organizationId")),
                reason=f"Released reservation for cancelled order {order.orderCode}",
                referenceId=str(order.orderId),
                performedBy=order.createdBy,
                performedAt=datetime.utcnow()
            )
            await db.inventory_movements.insert_one(movement.model_dump(mode="json"))

            logger.info(f"Released {item.quantity} reservation for cancelled order {order.orderId}")

    async def _fulfill_inventory_for_order(self, order: SalesOrder) -> None:
        """
        When order is delivered, convert reserved quantity to actual deduction.

        Args:
            order: The delivered sales order
        """
        db = farm_db.get_database()

        for item in order.items:
            if not item.inventoryId:
                continue

            inventory_item = await db.inventory_harvest.find_one({"inventoryId": str(item.inventoryId)})
            if not inventory_item:
                logger.warning(f"Inventory item {item.inventoryId} not found when fulfilling order {order.orderId}")
                continue

            # Decrease total quantity and reserved quantity
            current_quantity = inventory_item.get("quantity", 0)
            current_reserved = inventory_item.get("reservedQuantity", 0)

            new_quantity = max(0, current_quantity - item.quantity)
            new_reserved = max(0, current_reserved - item.quantity)

            await db.inventory_harvest.update_one(
                {"inventoryId": str(item.inventoryId)},
                {"$set": {
                    "quantity": new_quantity,
                    "reservedQuantity": new_reserved,
                    "updatedAt": datetime.utcnow().isoformat()
                }}
            )

            # Record movement
            movement = InventoryMovement(
                movementId=uuid4(),
                inventoryId=item.inventoryId,
                inventoryType=InventoryType.HARVEST,
                movementType=MovementType.SALE,
                quantityBefore=current_quantity,
                quantityChange=-item.quantity,
                quantityAfter=new_quantity,
                organizationId=UUID(inventory_item.get("organizationId")),
                reason=f"Sold - Order {order.orderCode} delivered",
                referenceId=str(order.orderId),
                performedBy=order.createdBy,
                performedAt=datetime.utcnow()
            )
            await db.inventory_movements.insert_one(movement.model_dump(mode="json"))

            logger.info(f"Fulfilled {item.quantity} of {item.productName} for delivered order {order.orderId}")

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

            # Invalidate sales dashboard cache
            await self._invalidate_sales_dashboard_cache()

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
        customer_id: Optional[UUID] = None,
        farming_year: Optional[int] = None
    ) -> tuple[List[SalesOrder], int, int]:
        """
        Get all sales orders with pagination

        Args:
            page: Page number (1-indexed)
            per_page: Items per page
            status: Filter by order status (optional)
            customer_id: Filter by customer ID (optional)
            farming_year: Filter by farming year (optional)

        Returns:
            Tuple of (orders, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        orders, total = await self.repository.get_all(skip, per_page, status, customer_id, farming_year)

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

        # Invalidate sales dashboard cache
        await self._invalidate_sales_dashboard_cache()

        return updated_order

    async def update_order_status(
        self,
        order_id: UUID,
        new_status: SalesOrderStatus
    ) -> SalesOrder:
        """
        Update order status with inventory operations.

        Args:
            order_id: Sales order ID
            new_status: New status value

        Returns:
            Updated sales order

        Raises:
            HTTPException: If order not found or inventory operations fail
        """
        # Get current order
        order = await self.get_order(order_id)

        # Handle inventory operations based on status transition
        if new_status == SalesOrderStatus.CANCELLED and order.status in [
            SalesOrderStatus.CONFIRMED,
            SalesOrderStatus.PROCESSING,
            SalesOrderStatus.ASSIGNED
        ]:
            # Release reserved inventory when cancelling confirmed orders
            await self._release_inventory_reservation(order)
            logger.info(f"Released inventory reservations for cancelled order {order_id}")

        if new_status == SalesOrderStatus.DELIVERED and order.status in [
            SalesOrderStatus.IN_TRANSIT,
            SalesOrderStatus.SHIPPED
        ]:
            # Fulfill inventory (deduct from total) when order is delivered
            await self._fulfill_inventory_for_order(order)
            logger.info(f"Fulfilled inventory for delivered order {order_id}")

        # Update order status
        updated_order = await self.repository.update_status(order_id, new_status)
        if not updated_order:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Sales order {order_id} not found"
            )

        logger.info(f"Sales order status updated: {order_id} -> {new_status.value}")

        # Invalidate sales dashboard cache
        await self._invalidate_sales_dashboard_cache()

        return updated_order

    async def confirm_order(self, order_id: UUID, confirmed_by: UUID) -> SalesOrder:
        """
        Confirm an order and reserve inventory.

        Args:
            order_id: The order ID to confirm
            confirmed_by: User ID confirming the order

        Returns:
            Updated sales order

        Raises:
            HTTPException: If order not found, already confirmed, or insufficient inventory
        """
        order = await self.get_order(order_id)

        # Validate order can be confirmed
        if order.status != SalesOrderStatus.DRAFT:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Order cannot be confirmed. Current status: {order.status.value}"
            )

        # Reserve inventory for items with inventoryId
        await self._reserve_inventory_for_order(order)

        # Update order status to confirmed
        updated_order = await self.repository.update_status(order_id, SalesOrderStatus.CONFIRMED)

        logger.info(f"Order {order_id} confirmed by user {confirmed_by}")

        # Invalidate cache
        await self._invalidate_sales_dashboard_cache()

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

    async def get_revenue_stats(self) -> dict:
        """
        Get aggregated revenue statistics across ALL orders.

        Returns:
            Dict with totalRevenue and pendingPayments
        """
        return await self.repository.get_revenue_stats()

    async def _invalidate_sales_dashboard_cache(self) -> None:
        """
        Invalidate sales dashboard caches after mutations.

        Invalidates:
        - Sales dashboard statistics (get_dashboard_stats)
        """
        try:
            cache = await get_redis_cache()

            if cache.is_available:
                # Invalidate sales dashboard caches
                await cache.delete_pattern("get_dashboard_stats:*", prefix="sales")

                logger.info("[Cache] Invalidated sales dashboard caches after order mutation")

        except Exception as e:
            # CRITICAL: Never break the application due to cache errors
            logger.warning(f"[Cache] Error invalidating sales dashboard caches: {str(e)}")
