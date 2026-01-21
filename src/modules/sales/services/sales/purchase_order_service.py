"""
Purchase Order Service

Business logic layer for Purchase Order operations.
Handles validation, permissions, and orchestration.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException, status
import logging

from ...models.purchase_order import PurchaseOrder, PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrderStatus
from .purchase_order_repository import PurchaseOrderRepository

logger = logging.getLogger(__name__)


class PurchaseOrderService:
    """Service for Purchase Order business logic"""

    def __init__(self):
        self.repository = PurchaseOrderRepository()

    async def create_purchase_order(
        self,
        po_data: PurchaseOrderCreate,
        created_by: UUID
    ) -> PurchaseOrder:
        """
        Create a new purchase order

        Args:
            po_data: Purchase order creation data
            created_by: ID of the user creating the purchase order

        Returns:
            Created purchase order

        Raises:
            HTTPException: If validation fails
        """
        try:
            # Business logic validation
            if not po_data.items or len(po_data.items) == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Purchase order must contain at least one item"
                )

            # Validate total
            calculated_total = sum(item.totalPrice for item in po_data.items)
            if abs(calculated_total - po_data.total) > 0.01:  # Allow small floating point differences
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Total mismatch: calculated {calculated_total}, provided {po_data.total}"
                )

            if not po_data.supplierName or not po_data.supplierName.strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Supplier name is required"
                )

            purchase_order = await self.repository.create(po_data, created_by)
            logger.info(f"Purchase order created: {purchase_order.purchaseOrderId} by user {created_by}")
            return purchase_order

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating purchase order: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create purchase order"
            )

    async def get_purchase_order(self, po_id: UUID) -> PurchaseOrder:
        """
        Get purchase order by ID

        Args:
            po_id: Purchase order ID

        Returns:
            Purchase order

        Raises:
            HTTPException: If purchase order not found
        """
        purchase_order = await self.repository.get_by_id(po_id)
        if not purchase_order:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Purchase order {po_id} not found"
            )
        return purchase_order

    async def get_all_purchase_orders(
        self,
        page: int = 1,
        per_page: int = 20,
        status: Optional[PurchaseOrderStatus] = None,
        supplier_id: Optional[UUID] = None
    ) -> tuple[List[PurchaseOrder], int, int]:
        """
        Get all purchase orders with pagination

        Args:
            page: Page number (1-indexed)
            per_page: Items per page
            status: Filter by PO status (optional)
            supplier_id: Filter by supplier ID (optional)

        Returns:
            Tuple of (purchase orders, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        purchase_orders, total = await self.repository.get_all(skip, per_page, status, supplier_id)

        total_pages = (total + per_page - 1) // per_page  # Ceiling division

        return purchase_orders, total, total_pages

    async def update_purchase_order(
        self,
        po_id: UUID,
        update_data: PurchaseOrderUpdate
    ) -> PurchaseOrder:
        """
        Update a purchase order

        Args:
            po_id: Purchase order ID
            update_data: Fields to update

        Returns:
            Updated purchase order

        Raises:
            HTTPException: If purchase order not found or validation fails
        """
        # Check purchase order exists
        await self.get_purchase_order(po_id)

        # Validate items if provided
        if update_data.items is not None and len(update_data.items) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Purchase order must contain at least one item"
            )

        # Validate supplier name if provided
        if update_data.supplierName is not None and not update_data.supplierName.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Supplier name cannot be empty"
            )

        updated_po = await self.repository.update(po_id, update_data)
        if not updated_po:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Purchase order {po_id} not found"
            )

        logger.info(f"Purchase order updated: {po_id}")
        return updated_po

    async def update_purchase_order_status(
        self,
        po_id: UUID,
        new_status: PurchaseOrderStatus
    ) -> PurchaseOrder:
        """
        Update purchase order status

        Args:
            po_id: Purchase order ID
            new_status: New status value

        Returns:
            Updated purchase order

        Raises:
            HTTPException: If purchase order not found
        """
        # Check purchase order exists
        await self.get_purchase_order(po_id)

        updated_po = await self.repository.update_status(po_id, new_status)
        if not updated_po:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Purchase order {po_id} not found"
            )

        logger.info(f"Purchase order status updated: {po_id} -> {new_status.value}")
        return updated_po

    async def delete_purchase_order(self, po_id: UUID) -> dict:
        """
        Delete a purchase order

        Args:
            po_id: Purchase order ID

        Returns:
            Success message

        Raises:
            HTTPException: If purchase order not found
        """
        # Check purchase order exists
        await self.get_purchase_order(po_id)

        success = await self.repository.delete(po_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Purchase order {po_id} not found"
            )

        logger.info(f"Purchase order deleted: {po_id}")
        return {"message": "Purchase order deleted successfully"}
