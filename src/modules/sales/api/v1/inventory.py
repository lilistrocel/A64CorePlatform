"""
Sales Module - Inventory API Routes

Endpoints for harvest inventory CRUD operations.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional
from uuid import UUID
import logging

from ...models.inventory import HarvestInventory, HarvestInventoryCreate, HarvestInventoryUpdate, InventoryStatus
from ...services.sales import InventoryService
from ...middleware.auth import get_current_active_user, require_permission, CurrentUser
from ...utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "",
    response_model=SuccessResponse[HarvestInventory],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new inventory item",
    description="Create a new harvest inventory item. Requires sales.create permission."
)
async def create_inventory(
    inventory_data: HarvestInventoryCreate,
    current_user: CurrentUser = Depends(require_permission("sales.create")),
    service: InventoryService = Depends()
):
    """
    Create a new harvest inventory item

    - **productName**: Product name (required)
    - **category**: Product category (required)
    - **farmId**: Farm ID (optional)
    - **blockId**: Block ID (optional)
    - **harvestDate**: Harvest date (required)
    - **quantity**: Available quantity (required, > 0)
    - **unit**: Unit of measurement (kg, pieces, bunches)
    - **quality**: Quality grade (A, B, C, default: A)
    - **status**: Inventory status (default: available)
    - **expiryDate**: Expiry date (optional)
    - **storageLocation**: Storage location (optional)
    """
    inventory = await service.create_inventory(
        inventory_data,
        UUID(current_user.userId)
    )

    return SuccessResponse(
        data=inventory,
        message="Inventory item created successfully"
    )


@router.get(
    "",
    response_model=PaginatedResponse[HarvestInventory],
    summary="Get all inventory items",
    description="Get all harvest inventory items with pagination and filters. Requires sales.view permission."
)
async def get_inventory(
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[InventoryStatus] = Query(None, description="Filter by inventory status"),
    category: Optional[str] = Query(None, description="Filter by category"),
    farmId: Optional[UUID] = Query(None, description="Filter by farm ID"),
    current_user: CurrentUser = Depends(require_permission("sales.view")),
    service: InventoryService = Depends()
):
    """
    Get all inventory items with pagination

    - **page**: Page number (default: 1)
    - **perPage**: Items per page (default: 20, max: 100)
    - **status**: Filter by inventory status (optional)
    - **category**: Filter by category (optional)
    - **farmId**: Filter by farm ID (optional)
    """
    inventory_items, total, total_pages = await service.get_all_inventory(
        page, perPage, status, category, farmId
    )

    return PaginatedResponse(
        data=inventory_items,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/available",
    response_model=PaginatedResponse[HarvestInventory],
    summary="Get available inventory",
    description="Get available harvest inventory items. Requires sales.view permission."
)
async def get_available_inventory(
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: CurrentUser = Depends(require_permission("sales.view")),
    service: InventoryService = Depends()
):
    """
    Get available inventory items (status = available)

    - **page**: Page number (default: 1)
    - **perPage**: Items per page (default: 20, max: 100)
    """
    inventory_items, total, total_pages = await service.get_available_stock(
        page, perPage
    )

    return PaginatedResponse(
        data=inventory_items,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/{inventory_id}",
    response_model=SuccessResponse[HarvestInventory],
    summary="Get inventory item by ID",
    description="Get a specific inventory item by ID. Requires sales.view permission."
)
async def get_inventory_item(
    inventory_id: UUID,
    current_user: CurrentUser = Depends(require_permission("sales.view")),
    service: InventoryService = Depends()
):
    """
    Get inventory item by ID

    - **inventory_id**: Inventory UUID
    """
    inventory = await service.get_inventory(inventory_id)

    return SuccessResponse(data=inventory)


@router.patch(
    "/{inventory_id}",
    response_model=SuccessResponse[HarvestInventory],
    summary="Update inventory item",
    description="Update an inventory item. Requires sales.edit permission."
)
async def update_inventory(
    inventory_id: UUID,
    update_data: HarvestInventoryUpdate,
    current_user: CurrentUser = Depends(require_permission("sales.edit")),
    service: InventoryService = Depends()
):
    """
    Update an inventory item

    - **inventory_id**: Inventory UUID
    - All fields are optional (partial update)
    """
    inventory = await service.update_inventory(
        inventory_id,
        update_data
    )

    return SuccessResponse(
        data=inventory,
        message="Inventory item updated successfully"
    )


@router.delete(
    "/{inventory_id}",
    response_model=SuccessResponse[dict],
    summary="Delete inventory item",
    description="Delete an inventory item. Requires sales.delete permission."
)
async def delete_inventory(
    inventory_id: UUID,
    current_user: CurrentUser = Depends(require_permission("sales.delete")),
    service: InventoryService = Depends()
):
    """
    Delete an inventory item

    - **inventory_id**: Inventory UUID
    """
    result = await service.delete_inventory(inventory_id)

    return SuccessResponse(
        data=result,
        message="Inventory item deleted successfully"
    )
