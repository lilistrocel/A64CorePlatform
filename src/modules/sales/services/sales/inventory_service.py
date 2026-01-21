"""
Inventory Service

Business logic layer for Harvest Inventory operations.
Handles validation, permissions, and orchestration.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException, status
import logging

from ...models.inventory import HarvestInventory, HarvestInventoryCreate, HarvestInventoryUpdate, InventoryStatus
from .inventory_repository import InventoryRepository

logger = logging.getLogger(__name__)


class InventoryService:
    """Service for Harvest Inventory business logic"""

    def __init__(self):
        self.repository = InventoryRepository()

    async def create_inventory(
        self,
        inventory_data: HarvestInventoryCreate,
        created_by: UUID
    ) -> HarvestInventory:
        """
        Create a new inventory item

        Args:
            inventory_data: Inventory creation data
            created_by: ID of the user creating the inventory item

        Returns:
            Created inventory item

        Raises:
            HTTPException: If validation fails
        """
        try:
            # Business logic validation
            if inventory_data.quantity <= 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Quantity must be greater than zero"
                )

            if not inventory_data.productName or not inventory_data.productName.strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Product name is required"
                )

            inventory = await self.repository.create(inventory_data, created_by)
            logger.info(f"Inventory item created: {inventory.inventoryId} by user {created_by}")
            return inventory

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating inventory item: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create inventory item"
            )

    async def get_inventory(self, inventory_id: UUID) -> HarvestInventory:
        """
        Get inventory item by ID

        Args:
            inventory_id: Inventory ID

        Returns:
            Inventory item

        Raises:
            HTTPException: If inventory item not found
        """
        inventory = await self.repository.get_by_id(inventory_id)
        if not inventory:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Inventory item {inventory_id} not found"
            )
        return inventory

    async def get_all_inventory(
        self,
        page: int = 1,
        per_page: int = 20,
        status: Optional[InventoryStatus] = None,
        category: Optional[str] = None,
        farm_id: Optional[UUID] = None
    ) -> tuple[List[HarvestInventory], int, int]:
        """
        Get all inventory items with pagination

        Args:
            page: Page number (1-indexed)
            per_page: Items per page
            status: Filter by inventory status (optional)
            category: Filter by category (optional)
            farm_id: Filter by farm ID (optional)

        Returns:
            Tuple of (inventory items, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        inventory_items, total = await self.repository.get_all(skip, per_page, status, category, farm_id)

        total_pages = (total + per_page - 1) // per_page  # Ceiling division

        return inventory_items, total, total_pages

    async def get_available_stock(
        self,
        page: int = 1,
        per_page: int = 20
    ) -> tuple[List[HarvestInventory], int, int]:
        """
        Get available inventory items

        Args:
            page: Page number (1-indexed)
            per_page: Items per page

        Returns:
            Tuple of (available inventory items, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        inventory_items, total = await self.repository.get_available_stock(skip, per_page)

        total_pages = (total + per_page - 1) // per_page

        return inventory_items, total, total_pages

    async def update_inventory(
        self,
        inventory_id: UUID,
        update_data: HarvestInventoryUpdate
    ) -> HarvestInventory:
        """
        Update an inventory item

        Args:
            inventory_id: Inventory ID
            update_data: Fields to update

        Returns:
            Updated inventory item

        Raises:
            HTTPException: If inventory item not found or validation fails
        """
        # Check inventory exists
        await self.get_inventory(inventory_id)

        # Validate update data
        if update_data.quantity is not None and update_data.quantity <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Quantity must be greater than zero"
            )

        if update_data.productName is not None and not update_data.productName.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Product name cannot be empty"
            )

        updated_inventory = await self.repository.update(inventory_id, update_data)
        if not updated_inventory:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Inventory item {inventory_id} not found"
            )

        logger.info(f"Inventory item updated: {inventory_id}")
        return updated_inventory

    async def delete_inventory(self, inventory_id: UUID) -> dict:
        """
        Delete an inventory item

        Args:
            inventory_id: Inventory ID

        Returns:
            Success message

        Raises:
            HTTPException: If inventory item not found
        """
        # Check inventory exists
        await self.get_inventory(inventory_id)

        success = await self.repository.delete(inventory_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Inventory item {inventory_id} not found"
            )

        logger.info(f"Inventory item deleted: {inventory_id}")
        return {"message": "Inventory item deleted successfully"}
