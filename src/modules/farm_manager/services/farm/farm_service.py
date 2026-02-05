"""
Farm Service

Business logic layer for Farm operations.
Handles validation, permissions, and orchestration.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException, status
import logging

from ...models.farm import Farm, FarmCreate, FarmUpdate
from .farm_repository import FarmRepository
from src.core.cache import get_redis_cache

logger = logging.getLogger(__name__)


class FarmService:
    """Service for Farm business logic"""

    def __init__(self):
        self.repository = FarmRepository()

    async def create_farm(
        self,
        farm_data: FarmCreate,
        manager_id: UUID,
        manager_email: str
    ) -> Farm:
        """
        Create a new farm

        Args:
            farm_data: Farm creation data
            manager_id: ID of the manager creating the farm
            manager_email: Email of the manager

        Returns:
            Created farm

        Raises:
            HTTPException: If validation fails
        """
        try:
            # Business logic validation
            if farm_data.totalArea and farm_data.totalArea <= 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Total area must be greater than 0"
                )

            farm = await self.repository.create(farm_data, manager_id, manager_email)
            logger.info(f"Farm created: {farm.farmId} by manager {manager_id}")

            # Invalidate farm list and dashboard caches
            await self._invalidate_farm_caches()

            return farm

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating farm: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create farm"
            )

    async def get_farm(self, farm_id: UUID) -> Farm:
        """
        Get farm by ID

        Args:
            farm_id: Farm ID

        Returns:
            Farm

        Raises:
            HTTPException: If farm not found
        """
        farm = await self.repository.get_by_id(farm_id)
        if not farm:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Farm {farm_id} not found"
            )
        return farm

    async def get_user_farms(
        self,
        user_id: UUID,
        is_active: Optional[bool] = None
    ) -> List[Farm]:
        """
        Get all farms for a user (manager)

        Args:
            user_id: User ID
            is_active: Filter by active status (optional)

        Returns:
            List of farms
        """
        farms = await self.repository.get_by_manager(user_id, is_active)
        return farms

    async def get_all_farms(
        self,
        page: int = 1,
        per_page: int = 20,
        is_active: Optional[bool] = None
    ) -> tuple[List[Farm], int, int]:
        """
        Get all farms with pagination

        Args:
            page: Page number (1-indexed)
            per_page: Items per page
            is_active: Filter by active status (optional)

        Returns:
            Tuple of (farms, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        farms, total = await self.repository.get_all(skip, per_page, is_active)

        total_pages = (total + per_page - 1) // per_page  # Ceiling division

        return farms, total, total_pages

    async def update_farm(
        self,
        farm_id: UUID,
        update_data: FarmUpdate,
        user_id: UUID,
        is_admin: bool = False
    ) -> Farm:
        """
        Update a farm

        Args:
            farm_id: Farm ID
            update_data: Fields to update
            user_id: ID of user making the update
            is_admin: If True, bypass manager check (for super_admin users)

        Returns:
            Updated farm

        Raises:
            HTTPException: If farm not found or validation fails
        """
        # Check farm exists
        farm = await self.get_farm(farm_id)

        # Check permissions (user must be the manager, unless admin)
        if not is_admin and str(farm.managerId) != str(user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the farm manager can update this farm"
            )

        # Only admins can change the manager
        if update_data.managerId is not None and not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can change the farm manager"
            )

        # Validate update data
        if update_data.totalArea is not None and update_data.totalArea <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Total area must be greater than 0"
            )

        updated_farm = await self.repository.update(farm_id, update_data)
        if not updated_farm:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Farm {farm_id} not found"
            )

        logger.info(f"Farm updated: {farm_id} by user {user_id}")

        # Invalidate farm list and dashboard caches
        await self._invalidate_farm_caches()

        return updated_farm

    async def delete_farm(self, farm_id: UUID, user_id: UUID) -> dict:
        """
        Delete a farm (soft delete)

        Args:
            farm_id: Farm ID
            user_id: ID of user making the deletion

        Returns:
            Success message

        Raises:
            HTTPException: If farm not found or has active blocks
        """
        # Check farm exists
        farm = await self.get_farm(farm_id)

        # Check permissions
        if str(farm.managerId) != str(user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the farm manager can delete this farm"
            )

        # TODO: Check if farm has active blocks (implement after BlockRepository)
        # For now, allow deletion

        success = await self.repository.delete(farm_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Farm {farm_id} not found"
            )

        logger.info(f"Farm deleted: {farm_id} by user {user_id}")

        # Invalidate farm list and dashboard caches
        await self._invalidate_farm_caches()

        return {"message": "Farm deleted successfully"}

    async def _invalidate_farm_caches(self) -> None:
        """
        Invalidate all farm-related caches after mutations.

        Invalidates:
        - Farm list caches (get_farms)
        - Dashboard summary caches (get_dashboard_summary)
        """
        try:
            cache = await get_redis_cache()

            if cache.is_available:
                # Invalidate farm list caches (all variations with different params)
                await cache.delete_pattern("get_farms:*", prefix="farm")

                # Invalidate dashboard summary caches
                await cache.delete_pattern("get_dashboard_summary:*", prefix="farm")

                logger.info("[Cache] Invalidated farm and dashboard caches after mutation")

        except Exception as e:
            # CRITICAL: Never break the application due to cache errors
            logger.warning(f"[Cache] Error invalidating farm caches: {str(e)}")
