"""
Sales Module - Inventory API Routes

Endpoints for harvest inventory CRUD operations.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional, List
from uuid import UUID
import logging

from ...models.inventory import HarvestInventory, HarvestInventoryCreate, HarvestInventoryUpdate, InventoryStatus
from src.modules.farm_manager.models.farming_year_config import MONTH_NAMES
from src.modules.farm_manager.services.farming_year_service import get_farming_year_service
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
    farmingYear: Optional[int] = Query(None, description="Filter by farming year (e.g., 2025)"),
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
    - **farmingYear**: Filter by farming year (optional)
    """
    inventory_items, total, total_pages = await service.get_all_inventory(
        page, perPage, status, category, farmId, farmingYear
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
    "/farming-years",
    response_model=SuccessResponse[dict],
    summary="Get available farming years for inventory",
    description="Get a list of all farming years that have harvest inventory data, used for year selector dropdown."
)
async def get_inventory_farming_years(
    farmId: Optional[UUID] = Query(None, description="Filter by farm ID (optional)"),
    current_user: CurrentUser = Depends(require_permission("sales.view")),
    service: InventoryService = Depends()
):
    """
    Get all farming years that have harvest inventory data.

    Returns a list of farming years found in harvest_inventory collection,
    sorted newest first. Includes the current farming year even if no data exists.

    Args:
        farmId: Optional farm UUID to filter inventory by farm

    Returns:
        years: List of available farming years with:
            - year: The farming year number (e.g., 2025)
            - display: Formatted string like "Aug 2025 - Jul 2026"
            - isCurrent: True if this is the current farming year
            - hasInventory: True if there is inventory data for this year
            - itemCount: Number of inventory items for this year
    """
    from ...services.database import sales_db

    db = sales_db.get_database()

    # Get farming year service for config and formatting
    fy_service = get_farming_year_service()
    config = await fy_service.get_farming_year_config()
    current_year = await fy_service.get_current_farming_year()

    # Build query match stage
    match_stage = {"farmingYear": {"$ne": None}}
    if farmId:
        match_stage["farmId"] = str(farmId)

    # Query distinct farmingYear values from harvest_inventory with counts
    inventory_years_cursor = db.harvest_inventory.aggregate([
        {"$match": match_stage},
        {"$group": {
            "_id": "$farmingYear",
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id": -1}}
    ])

    inventory_years = {}  # year -> count
    async for doc in inventory_years_cursor:
        if doc["_id"] is not None:
            inventory_years[doc["_id"]] = doc["count"]

    # Combine all years with current year
    all_years = set(inventory_years.keys())
    all_years.add(current_year)

    # Sort descending (newest first)
    sorted_years = sorted(all_years, reverse=True)

    # Build response with formatted display strings
    years_list = []
    for year in sorted_years:
        display = fy_service.format_farming_year_display(year, config.farmingYearStartMonth)
        item_count = inventory_years.get(year, 0)
        years_list.append({
            "year": year,
            "display": display,
            "isCurrent": year == current_year,
            "hasInventory": year in inventory_years,
            "itemCount": item_count
        })

    return SuccessResponse(
        data={
            "years": years_list,
            "count": len(years_list),
            "currentFarmingYear": current_year,
            "totalItems": sum(inventory_years.values()),
            "config": {
                "startMonth": config.farmingYearStartMonth,
                "startMonthName": MONTH_NAMES.get(config.farmingYearStartMonth, "Unknown")
            }
        },
        message=f"Found {len(years_list)} farming years with inventory data"
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
