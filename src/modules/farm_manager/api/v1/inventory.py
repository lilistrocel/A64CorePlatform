"""
Inventory API Endpoints

CRUD operations for the three inventory types:
- Harvest Inventory
- Input Inventory
- Asset Inventory
"""

from datetime import datetime
from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorDatabase
import csv
from io import StringIO

from ...services.database import farm_db
from ...middleware.auth import get_current_active_user, CurrentUser
from ...models.farming_year_config import get_farming_year, DEFAULT_FARMING_YEAR_START_MONTH

from src.modules.farm_manager.models.inventory import (
    # Enums
    InventoryType,
    InventoryScope,
    InputCategory,
    AssetCategory,
    AssetStatus,
    QualityGrade,
    MovementType,
    BaseUnit,
    DisplayUnit,
    WasteSourceType,
    DisposalMethod,
    # Products
    Product,
    ProductCreate,
    ProductUpdate,
    # Harvest
    HarvestInventory,
    HarvestInventoryCreate,
    HarvestInventoryUpdate,
    # Input
    InputInventory,
    InputInventoryCreate,
    InputInventoryUpdate,
    # Asset
    AssetInventory,
    AssetInventoryCreate,
    AssetInventoryUpdate,
    # Movement
    InventoryMovement,
    # Transfer
    TransferRequest,
    TransferResponse,
    TransferRecord,
    # Waste
    WasteInventory,
    WasteInventoryCreate,
    WasteInventoryUpdate,
    MoveToWasteRequest,
    WasteSummary,
    # Summary
    InventorySummary,
    # Unit conversion functions
    get_base_unit_for_category,
    convert_to_base_unit,
    convert_from_base_unit,
    format_base_quantity_for_display,
    MASS_TO_MG,
    VOLUME_TO_ML,
    COUNT_TO_UNIT,
)

router = APIRouter(prefix="/inventory", tags=["Inventory"])


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_database():
    """Get database instance from farm module"""
    return farm_db.get_database()


def serialize_doc(doc: dict) -> dict:
    """Convert MongoDB document to JSON-serializable format"""
    if doc is None:
        return None
    doc["_id"] = str(doc["_id"]) if "_id" in doc else None
    return doc


def compute_inventory_scope(farm_id: Optional[UUID]) -> InventoryScope:
    """
    Compute inventory scope based on farmId.

    Args:
        farm_id: The farm ID (None for organization-level)

    Returns:
        InventoryScope: ORGANIZATION if farmId is None, else FARM
    """
    return InventoryScope.ORGANIZATION if farm_id is None else InventoryScope.FARM


def validate_scope_rules(
    farm_id: Optional[UUID],
    block_id: Optional[UUID],
    inventory_scope: InventoryScope
) -> None:
    """
    Validate inventory scope rules.

    Validation Rules:
    1. If farmId is None, inventoryScope must be ORGANIZATION
    2. If farmId is present, inventoryScope must be FARM
    3. blockId can only be present if farmId is present (blocks belong to farms)

    Args:
        farm_id: Farm ID
        block_id: Block ID
        inventory_scope: Computed inventory scope

    Raises:
        HTTPException: If validation fails
    """
    # Rule 1: farmId None => ORGANIZATION scope
    if farm_id is None and inventory_scope != InventoryScope.ORGANIZATION:
        raise HTTPException(
            status_code=400,
            detail="Default inventory (farmId=null) must have inventoryScope='organization'"
        )

    # Rule 2: farmId present => FARM scope
    if farm_id is not None and inventory_scope != InventoryScope.FARM:
        raise HTTPException(
            status_code=400,
            detail="Farm inventory must have inventoryScope='farm'"
        )

    # Rule 3: blockId only valid for farm inventory
    if block_id is not None and farm_id is None:
        raise HTTPException(
            status_code=400,
            detail="blockId can only be set for farm-scoped inventory (farmId must be present)"
        )


async def get_organization_id(current_user: CurrentUser) -> UUID:
    """
    Get organization ID from current user.

    Args:
        current_user: Current authenticated user

    Returns:
        UUID: Organization ID

    Raises:
        HTTPException: If user has no organization
    """
    org_id = getattr(current_user, 'organizationId', None)
    if not org_id:
        raise HTTPException(
            status_code=400,
            detail="User must belong to an organization"
        )
    return UUID(org_id) if isinstance(org_id, str) else org_id


async def record_movement(
    db: AsyncIOMotorDatabase,
    inventory_id: UUID,
    inventory_type: InventoryType,
    movement_type: MovementType,
    quantity_before: float,
    quantity_change: float,
    user_id: UUID,
    organization_id: UUID,
    reason: Optional[str] = None,
    reference_id: Optional[str] = None,
    from_scope: Optional[InventoryScope] = None,
    to_scope: Optional[InventoryScope] = None,
    from_farm_id: Optional[UUID] = None,
    to_farm_id: Optional[UUID] = None
):
    """
    Record an inventory movement.

    Args:
        db: Database instance
        inventory_id: Inventory item ID
        inventory_type: Type of inventory
        movement_type: Type of movement
        quantity_before: Quantity before movement
        quantity_change: Change in quantity
        user_id: User performing the movement
        organization_id: Organization ID
        reason: Optional reason for movement
        reference_id: Optional reference to related record
        from_scope: Source scope (for transfers)
        to_scope: Destination scope (for transfers)
        from_farm_id: Source farm (for transfers)
        to_farm_id: Destination farm (for transfers)
    """
    movement = InventoryMovement(
        inventoryId=inventory_id,
        inventoryType=inventory_type,
        movementType=movement_type,
        quantityBefore=quantity_before,
        quantityChange=quantity_change,
        quantityAfter=quantity_before + quantity_change,
        organizationId=organization_id,
        fromScope=from_scope,
        toScope=to_scope,
        fromFarmId=from_farm_id,
        toFarmId=to_farm_id,
        reason=reason,
        referenceId=reference_id,
        performedBy=user_id,
        performedAt=datetime.utcnow()
    )
    await db.inventory_movements.insert_one(movement.model_dump(mode="json"))


# ============================================================================
# INVENTORY SUMMARY & DASHBOARD
# ============================================================================

@router.get("/summary", response_model=InventorySummary)
async def get_inventory_summary(
    farm_id: Optional[UUID] = Query(None, description="Filter by farm"),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Get inventory summary for dashboard"""
    farm_filter = {"farmId": str(farm_id)} if farm_id else {}

    # Harvest inventory stats from Farm Manager's inventory_harvest collection
    # This collection contains aggregated harvest data grouped by farm + crop + grade + productType
    harvest_pipeline = [
        {"$match": farm_filter},
        {"$group": {
            "_id": None,
            "totalItems": {"$sum": 1},
            "totalQuantity": {"$sum": "$quantity"},
            "totalValue": {"$sum": {"$multiply": ["$quantity", {"$ifNull": ["$unitPrice", 0]}]}},
            "byGrade": {"$push": "$qualityGrade"}
        }}
    ]
    harvest_result = await db.inventory_harvest.aggregate(harvest_pipeline).to_list(1)
    harvest_stats = harvest_result[0] if harvest_result else {"totalItems": 0, "totalQuantity": 0, "totalValue": 0}

    # Input inventory stats
    input_pipeline = [
        {"$match": farm_filter},
        {"$group": {
            "_id": None,
            "totalItems": {"$sum": 1},
            "totalValue": {"$sum": {"$multiply": ["$quantity", {"$ifNull": ["$unitCost", 0]}]}},
            "lowStockCount": {"$sum": {"$cond": ["$isLowStock", 1, 0]}}
        }}
    ]
    input_result = await db.inventory_input.aggregate(input_pipeline).to_list(1)
    input_stats = input_result[0] if input_result else {"totalItems": 0, "totalValue": 0, "lowStockCount": 0}

    # Asset inventory stats
    asset_pipeline = [
        {"$match": farm_filter},
        {"$group": {
            "_id": None,
            "totalItems": {"$sum": 1},
            "totalValue": {"$sum": {"$ifNull": ["$currentValue", 0]}},
            "maintenanceOverdueCount": {"$sum": {"$cond": ["$maintenanceOverdue", 1, 0]}},
            "byStatus": {"$push": "$status"}
        }}
    ]
    asset_result = await db.inventory_asset.aggregate(asset_pipeline).to_list(1)
    asset_stats = asset_result[0] if asset_result else {"totalItems": 0, "totalValue": 0, "maintenanceOverdueCount": 0}

    # Waste inventory stats
    waste_pipeline = [
        {"$match": farm_filter},
        {"$group": {
            "_id": None,
            "totalItems": {"$sum": 1},
            "totalValue": {"$sum": {"$ifNull": ["$estimatedValue", 0]}},
            "pendingDisposal": {"$sum": {"$cond": [{"$eq": ["$disposalMethod", "pending"]}, 1, 0]}}
        }}
    ]
    waste_result = await db.inventory_waste.aggregate(waste_pipeline).to_list(1)
    waste_stats = waste_result[0] if waste_result else {"totalItems": 0, "totalValue": 0, "pendingDisposal": 0}

    # Count expiring items (within 7 days)
    seven_days = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    from datetime import timedelta
    seven_days_later = seven_days + timedelta(days=7)

    expiring_harvest = await db.inventory_harvest.count_documents({
        **farm_filter,
        "expiryDate": {"$lte": seven_days_later.isoformat(), "$gte": datetime.utcnow().isoformat()}
    })
    expiring_input = await db.inventory_input.count_documents({
        **farm_filter,
        "expiryDate": {"$lte": seven_days_later.isoformat(), "$gte": datetime.utcnow().isoformat()}
    })

    return InventorySummary(
        harvestInventory={
            "totalItems": harvest_stats.get("totalItems", 0),
            "totalQuantity": harvest_stats.get("totalQuantity", 0)
        },
        inputInventory={
            "totalItems": input_stats.get("totalItems", 0),
            "lowStockItems": input_stats.get("lowStockCount", 0)
        },
        assetInventory={
            "totalItems": asset_stats.get("totalItems", 0),
            "operationalCount": sum(1 for s in asset_stats.get("byStatus", []) if s == "operational")
        },
        wasteInventory={
            "totalItems": waste_stats.get("totalItems", 0),
            "pendingDisposal": waste_stats.get("pendingDisposal", 0)
        },
        totalHarvestValue=harvest_stats.get("totalValue", 0),
        totalInputValue=input_stats.get("totalValue", 0),
        totalAssetValue=asset_stats.get("totalValue", 0),
        totalWasteValue=waste_stats.get("totalValue", 0),
        lowStockAlerts=input_stats.get("lowStockCount", 0),
        expiringItems=expiring_harvest + expiring_input,
        maintenanceOverdue=asset_stats.get("maintenanceOverdueCount", 0)
    )


# ============================================================================
# HARVEST INVENTORY ENDPOINTS
# ============================================================================

@router.get("/harvest", response_model=dict)
async def list_harvest_inventory(
    farm_id: Optional[UUID] = Query(None, description="Filter by farm ID"),
    scope: Optional[InventoryScope] = Query(None, description="Filter by scope (organization or farm)"),
    quality_grade: Optional[QualityGrade] = Query(None),
    farming_year: Optional[int] = Query(None, alias="farmingYear", description="Filter by farming year (e.g., 2025)"),
    search: Optional[str] = Query(None, max_length=100),
    sort_by: str = Query("harvestDate", description="Field to sort by (harvestDate, createdAt, plantName, quantity)"),
    sort_order: str = Query("desc", description="Sort order (asc or desc)"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    List harvest inventory items with pagination.

    Query Parameters:
    - scope=organization: Show only default inventory (farmId=null)
    - scope=farm&farmId=xxx: Show only specific farm's inventory
    - scope=farm: Show all farm inventories
    - (no scope): Show all inventory (default + all farms)
    - farmingYear: Filter by farming year (e.g., 2025)
    """
    # Get organization ID from current user
    org_id = await get_organization_id(current_user)

    query = {"organizationId": str(org_id)}

    # Scope filtering
    if scope == InventoryScope.ORGANIZATION:
        query["farmId"] = None  # Default inventory only
    elif scope == InventoryScope.FARM:
        if farm_id:
            query["farmId"] = str(farm_id)  # Specific farm
        else:
            query["farmId"] = {"$ne": None}  # All farms
    elif farm_id:
        # If farm_id provided without scope, filter by farm
        query["farmId"] = str(farm_id)

    if quality_grade:
        query["qualityGrade"] = quality_grade.value
    if farming_year is not None:
        query["farmingYear"] = farming_year
    if search:
        query["$or"] = [
            {"plantName": {"$regex": search, "$options": "i"}},
            {"variety": {"$regex": search, "$options": "i"}},
            {"storageLocation": {"$regex": search, "$options": "i"}}
        ]

    skip = (page - 1) * per_page
    total = await db.inventory_harvest.count_documents(query)

    # Validate and apply sorting
    valid_sort_fields = ["harvestDate", "createdAt", "plantName", "quantity", "qualityGrade"]
    if sort_by not in valid_sort_fields:
        sort_by = "harvestDate"
    sort_direction = 1 if sort_order.lower() == "asc" else -1

    items = await db.inventory_harvest.find(query).sort(sort_by, sort_direction).skip(skip).limit(per_page).to_list(per_page)

    return {
        "items": [serialize_doc(item) for item in items],
        "total": total,
        "page": page,
        "perPage": per_page,
        "totalPages": (total + per_page - 1) // per_page
    }


@router.get(
    "/harvest/export/csv",
    summary="Export harvest inventory to CSV",
    responses={
        200: {
            "content": {"text/csv": {}},
            "description": "CSV file with filtered harvest inventory"
        }
    }
)
async def export_harvest_inventory_csv(
    farm_id: Optional[UUID] = Query(None, description="Filter by farm ID"),
    scope: Optional[InventoryScope] = Query(None, description="Filter by scope (organization or farm)"),
    quality_grade: Optional[QualityGrade] = Query(None),
    search: Optional[str] = Query(None, max_length=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Export harvest inventory to CSV format.

    Supports the same filters as the list endpoint:
    - farm_id: Filter by specific farm
    - scope: Filter by organization or farm scope
    - quality_grade: Filter by quality grade
    - search: Text search on plant name or variety

    The export respects all active filters and only exports matching items.
    """
    org_id = await get_organization_id(current_user)

    query = {"organizationId": str(org_id)}

    if scope == InventoryScope.ORGANIZATION:
        query["farmId"] = None
    elif scope == InventoryScope.FARM:
        if farm_id:
            query["farmId"] = str(farm_id)
        else:
            query["farmId"] = {"$ne": None}
    elif farm_id:
        query["farmId"] = str(farm_id)

    if quality_grade:
        query["qualityGrade"] = quality_grade.value
    if search:
        query["$or"] = [
            {"plantName": {"$regex": search, "$options": "i"}},
            {"variety": {"$regex": search, "$options": "i"}},
            {"storageLocation": {"$regex": search, "$options": "i"}}
        ]

    items = await db.inventory_harvest.find(query).sort("harvestDate", -1).to_list(10000)

    # Generate CSV
    output = StringIO()
    writer = csv.writer(output)

    # Header row
    writer.writerow([
        "Plant Name", "Variety", "Quality Grade", "Product Type",
        "Quantity", "Unit", "Available Quantity",
        "Harvest Date", "Expiry Date", "Farm ID", "Block ID",
        "Unit Price", "Currency", "Storage Location", "Notes"
    ])

    # Data rows
    for item in items:
        writer.writerow([
            item.get("plantName", ""),
            item.get("variety", ""),
            item.get("qualityGrade", ""),
            item.get("productType", ""),
            item.get("quantity", ""),
            item.get("unit", ""),
            item.get("availableQuantity", ""),
            item.get("harvestDate", ""),
            item.get("expiryDate", ""),
            item.get("farmId", ""),
            item.get("blockId", ""),
            item.get("unitPrice", ""),
            item.get("currency", ""),
            item.get("storageLocation", ""),
            item.get("notes", "")
        ])

    csv_content = output.getvalue()

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=harvest_inventory_export.csv"
        }
    )


@router.post("/harvest", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_harvest_inventory(
    data: HarvestInventoryCreate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Create a new harvest inventory item.

    Can create either:
    - Farm inventory: Provide farmId
    - Default inventory: Set farmId=null (organization-level)
    """
    # Get organization ID from current user
    org_id = await get_organization_id(current_user)

    # Compute inventory scope
    inventory_scope = compute_inventory_scope(data.farmId)

    # Validate scope rules
    validate_scope_rules(data.farmId, data.blockId, inventory_scope)

    # Build inventory item with organization ID from auth context
    inventory_data = data.model_dump()
    inventory_data["organizationId"] = org_id  # Override with auth context

    # Calculate farmingYear from harvestDate
    farming_year = get_farming_year(data.harvestDate, DEFAULT_FARMING_YEAR_START_MONTH)

    inventory = HarvestInventory(
        **inventory_data,
        inventoryScope=inventory_scope,
        availableQuantity=data.quantity,
        farmingYear=farming_year,
        createdBy=UUID(current_user.userId)
    )

    doc = inventory.model_dump(mode="json")
    await db.inventory_harvest.insert_one(doc)

    # Record movement
    await record_movement(
        db=db,
        inventory_id=inventory.inventoryId,
        inventory_type=InventoryType.HARVEST,
        movement_type=MovementType.ADDITION,
        quantity_before=0,
        quantity_change=data.quantity,
        user_id=UUID(current_user.userId),
        organization_id=org_id,
        reason="Initial inventory creation"
    )

    return serialize_doc(doc)


@router.get("/harvest/{inventory_id}", response_model=dict)
async def get_harvest_inventory(
    inventory_id: UUID,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Get a specific harvest inventory item"""
    item = await db.inventory_harvest.find_one({"inventoryId": str(inventory_id)})
    if not item:
        raise HTTPException(status_code=404, detail="Harvest inventory item not found")
    return serialize_doc(item)


@router.patch("/harvest/{inventory_id}", response_model=dict)
async def update_harvest_inventory(
    inventory_id: UUID,
    data: HarvestInventoryUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Update a harvest inventory item"""
    org_id = await get_organization_id(current_user)

    item = await db.inventory_harvest.find_one({"inventoryId": str(inventory_id)})
    if not item:
        raise HTTPException(status_code=404, detail="Harvest inventory item not found")

    # Verify organization
    if item.get("organizationId") != str(org_id):
        raise HTTPException(status_code=403, detail="Inventory item does not belong to your organization")

    update_data = {k: v for k, v in data.model_dump(mode="json").items() if v is not None}
    update_data["updatedAt"] = datetime.utcnow().isoformat()

    # If quantity changed, update available quantity and record movement
    if "quantity" in update_data:
        old_quantity = item.get("quantity", 0)
        new_quantity = update_data["quantity"]
        reserved = item.get("reservedQuantity", 0)
        update_data["availableQuantity"] = new_quantity - reserved

        if old_quantity != new_quantity:
            await record_movement(
                db=db,
                inventory_id=inventory_id,
                inventory_type=InventoryType.HARVEST,
                movement_type=MovementType.ADJUSTMENT,
                quantity_before=old_quantity,
                quantity_change=new_quantity - old_quantity,
                user_id=UUID(current_user.userId),
                organization_id=org_id,
                reason="Manual quantity adjustment"
            )

    await db.inventory_harvest.update_one(
        {"inventoryId": str(inventory_id)},
        {"$set": update_data}
    )

    updated = await db.inventory_harvest.find_one({"inventoryId": str(inventory_id)})
    return serialize_doc(updated)


@router.delete("/harvest/{inventory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_harvest_inventory(
    inventory_id: UUID,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Delete a harvest inventory item"""
    result = await db.inventory_harvest.delete_one({"inventoryId": str(inventory_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Harvest inventory item not found")


# ============================================================================
# INPUT INVENTORY ENDPOINTS
# ============================================================================

@router.get("/input", response_model=dict)
async def list_input_inventory(
    farm_id: Optional[UUID] = Query(None, description="Filter by farm ID"),
    scope: Optional[InventoryScope] = Query(None, description="Filter by scope (organization or farm)"),
    category: Optional[InputCategory] = Query(None),
    low_stock_only: bool = Query(False),
    search: Optional[str] = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    List input inventory items with pagination.

    Query Parameters:
    - scope=organization: Show only default inventory (farmId=null)
    - scope=farm&farmId=xxx: Show only specific farm's inventory
    - scope=farm: Show all farm inventories
    - (no scope): Show all inventory (default + all farms)
    """
    # Get organization ID from current user
    org_id = await get_organization_id(current_user)

    query = {"organizationId": str(org_id)}

    # Scope filtering
    if scope == InventoryScope.ORGANIZATION:
        query["farmId"] = None  # Default inventory only
    elif scope == InventoryScope.FARM:
        if farm_id:
            query["farmId"] = str(farm_id)  # Specific farm
        else:
            query["farmId"] = {"$ne": None}  # All farms
    elif farm_id:
        # If farm_id provided without scope, filter by farm
        query["farmId"] = str(farm_id)

    if category:
        query["category"] = category.value
    if low_stock_only:
        query["isLowStock"] = True
    if search:
        query["$or"] = [
            {"itemName": {"$regex": search, "$options": "i"}},
            {"brand": {"$regex": search, "$options": "i"}},
            {"sku": {"$regex": search, "$options": "i"}}
        ]

    skip = (page - 1) * per_page
    total = await db.inventory_input.count_documents(query)
    items = await db.inventory_input.find(query).sort("createdAt", -1).skip(skip).limit(per_page).to_list(per_page)

    return {
        "items": [serialize_doc(item) for item in items],
        "total": total,
        "page": page,
        "perPage": per_page,
        "totalPages": (total + per_page - 1) // per_page
    }


@router.get(
    "/input/export/csv",
    summary="Export input inventory to CSV",
    responses={
        200: {
            "content": {"text/csv": {}},
            "description": "CSV file with filtered input inventory"
        }
    }
)
async def export_input_inventory_csv(
    farm_id: Optional[UUID] = Query(None, description="Filter by farm ID"),
    scope: Optional[InventoryScope] = Query(None, description="Filter by scope (organization or farm)"),
    category: Optional[InputCategory] = Query(None),
    low_stock_only: bool = Query(False),
    search: Optional[str] = Query(None, max_length=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Export input inventory to CSV format.

    Supports the same filters as the list endpoint:
    - farm_id: Filter by specific farm
    - scope: Filter by organization or farm scope
    - category: Filter by input category
    - low_stock_only: Only show low stock items
    - search: Text search on item name, brand, or SKU

    The export respects all active filters and only exports matching items.
    """
    org_id = await get_organization_id(current_user)

    query = {"organizationId": str(org_id)}

    if scope == InventoryScope.ORGANIZATION:
        query["farmId"] = None
    elif scope == InventoryScope.FARM:
        if farm_id:
            query["farmId"] = str(farm_id)
        else:
            query["farmId"] = {"$ne": None}
    elif farm_id:
        query["farmId"] = str(farm_id)

    if category:
        query["category"] = category.value
    if low_stock_only:
        query["isLowStock"] = True
    if search:
        query["$or"] = [
            {"itemName": {"$regex": search, "$options": "i"}},
            {"brand": {"$regex": search, "$options": "i"}},
            {"sku": {"$regex": search, "$options": "i"}}
        ]

    items = await db.inventory_input.find(query).sort("createdAt", -1).to_list(10000)

    # Generate CSV
    output = StringIO()
    writer = csv.writer(output)

    # Header row
    writer.writerow([
        "Item Name", "Category", "Brand", "SKU",
        "Quantity", "Unit", "Minimum Stock", "Low Stock",
        "Unit Cost", "Expiry Date", "Farm ID",
        "Supplier", "Notes"
    ])

    # Data rows
    for item in items:
        writer.writerow([
            item.get("itemName", ""),
            item.get("category", ""),
            item.get("brand", ""),
            item.get("sku", ""),
            item.get("quantity", ""),
            item.get("unit", ""),
            item.get("minimumStock", ""),
            item.get("isLowStock", ""),
            item.get("unitCost", ""),
            item.get("expiryDate", ""),
            item.get("farmId", ""),
            item.get("supplier", ""),
            item.get("notes", "")
        ])

    csv_content = output.getvalue()

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=input_inventory_export.csv"
        }
    )


@router.post("/input", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_input_inventory(
    data: InputInventoryCreate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Create a new input inventory item.

    Can create either:
    - Farm inventory: Provide farmId
    - Default inventory: Set farmId=null (organization-level)
    """
    # Get organization ID from current user
    org_id = await get_organization_id(current_user)

    # Compute inventory scope
    inventory_scope = compute_inventory_scope(data.farmId)

    # Validate scope rules (blockId not applicable for input inventory)
    validate_scope_rules(data.farmId, None, inventory_scope)

    is_low_stock = data.quantity <= data.minimumStock if data.minimumStock > 0 else False

    # Calculate base unit and quantities for automated calculations
    base_unit = get_base_unit_for_category(data.category)
    base_quantity = convert_to_base_unit(data.quantity, data.unit, data.category)
    base_minimum_stock = convert_to_base_unit(data.minimumStock, data.unit, data.category)

    inventory = InputInventory(
        **data.model_dump(exclude={"organizationId"}),
        organizationId=org_id,
        inventoryScope=inventory_scope,
        baseUnit=base_unit,
        baseQuantity=base_quantity,
        baseMinimumStock=base_minimum_stock,
        isLowStock=is_low_stock,
        createdBy=UUID(current_user.userId)
    )

    doc = inventory.model_dump(mode="json")
    await db.inventory_input.insert_one(doc)

    # Record movement
    await record_movement(
        db=db,
        inventory_id=inventory.inventoryId,
        inventory_type=InventoryType.INPUT,
        movement_type=MovementType.ADDITION,
        quantity_before=0,
        quantity_change=data.quantity,
        user_id=UUID(current_user.userId),
        organization_id=org_id,
        reason="Initial inventory creation"
    )

    return serialize_doc(doc)


@router.get("/input/{inventory_id}", response_model=dict)
async def get_input_inventory(
    inventory_id: UUID,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Get a specific input inventory item"""
    item = await db.inventory_input.find_one({"inventoryId": str(inventory_id)})
    if not item:
        raise HTTPException(status_code=404, detail="Input inventory item not found")
    return serialize_doc(item)


@router.patch("/input/{inventory_id}", response_model=dict)
async def update_input_inventory(
    inventory_id: UUID,
    data: InputInventoryUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Update an input inventory item"""
    org_id = await get_organization_id(current_user)

    item = await db.inventory_input.find_one({"inventoryId": str(inventory_id)})
    if not item:
        raise HTTPException(status_code=404, detail="Input inventory item not found")

    # Verify organization
    if item.get("organizationId") != str(org_id):
        raise HTTPException(status_code=403, detail="Inventory item does not belong to your organization")

    update_data = {k: v for k, v in data.model_dump(mode="json").items() if v is not None}
    update_data["updatedAt"] = datetime.utcnow().isoformat()

    # Check low stock status
    new_quantity = update_data.get("quantity", item.get("quantity", 0))
    min_stock = update_data.get("minimumStock", item.get("minimumStock", 0))
    update_data["isLowStock"] = new_quantity <= min_stock if min_stock > 0 else False

    # Recalculate base quantities if quantity or minimumStock changed
    category = InputCategory(item.get("category"))
    unit = item.get("unit", "kg")

    if "quantity" in update_data:
        update_data["baseQuantity"] = convert_to_base_unit(new_quantity, unit, category)

    if "minimumStock" in update_data:
        update_data["baseMinimumStock"] = convert_to_base_unit(min_stock, unit, category)

    # Record quantity change
    if "quantity" in update_data:
        old_quantity = item.get("quantity", 0)
        if old_quantity != new_quantity:
            await record_movement(
                db=db,
                inventory_id=inventory_id,
                inventory_type=InventoryType.INPUT,
                movement_type=MovementType.ADJUSTMENT,
                quantity_before=old_quantity,
                quantity_change=new_quantity - old_quantity,
                user_id=UUID(current_user.userId),
                organization_id=org_id,
                reason="Manual quantity adjustment"
            )

    await db.inventory_input.update_one(
        {"inventoryId": str(inventory_id)},
        {"$set": update_data}
    )

    updated = await db.inventory_input.find_one({"inventoryId": str(inventory_id)})
    return serialize_doc(updated)


@router.delete("/input/{inventory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_input_inventory(
    inventory_id: UUID,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Delete an input inventory item"""
    result = await db.inventory_input.delete_one({"inventoryId": str(inventory_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Input inventory item not found")


# Record usage of input item
@router.post("/input/{inventory_id}/use", response_model=dict)
async def use_input_inventory(
    inventory_id: UUID,
    quantity: float = Query(..., gt=0, description="Quantity to use in display units"),
    farm_id: Optional[UUID] = Query(None, description="Farm requesting inventory (for pool fallback)"),
    allow_pool_deduction: bool = Query(True, description="Allow automatic fallback to default inventory"),
    reason: Optional[str] = Query(None, max_length=500),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Record usage of an input inventory item with automatic pool fallback.

    Pool Fallback Logic:
    1. If farmId provided, try to deduct from farm's inventory first
    2. If insufficient quantity in farm inventory and allow_pool_deduction=True,
       automatically deduct remaining from default inventory
    3. If allow_pool_deduction=False, fail if insufficient quantity in farm inventory
    """
    org_id = await get_organization_id(current_user)

    # Try farm inventory first if farm_id provided
    item = await db.inventory_input.find_one({"inventoryId": str(inventory_id)})
    if not item:
        raise HTTPException(status_code=404, detail="Input inventory item not found")

    # Verify organization
    if item.get("organizationId") != str(org_id):
        raise HTTPException(status_code=403, detail="Inventory item does not belong to your organization")

    current_quantity = item.get("quantity", 0)
    category = InputCategory(item.get("category"))
    unit = item.get("unit", "kg")

    # Check if sufficient quantity in this inventory
    if quantity <= current_quantity:
        # Sufficient quantity - proceed with deduction
        new_quantity = current_quantity - quantity
        min_stock = item.get("minimumStock", 0)
        new_base_quantity = convert_to_base_unit(new_quantity, unit, category)

        await db.inventory_input.update_one(
            {"inventoryId": str(inventory_id)},
            {"$set": {
                "quantity": new_quantity,
                "baseQuantity": new_base_quantity,
                "isLowStock": new_quantity <= min_stock if min_stock > 0 else False,
                "lastUsedAt": datetime.utcnow().isoformat(),
                "updatedAt": datetime.utcnow().isoformat()
            }}
        )

        await record_movement(
            db=db,
            inventory_id=inventory_id,
            inventory_type=InventoryType.INPUT,
            movement_type=MovementType.USAGE,
            quantity_before=current_quantity,
            quantity_change=-quantity,
            user_id=UUID(current_user.userId),
            organization_id=org_id,
            reason=reason or "Input material usage"
        )

        updated = await db.inventory_input.find_one({"inventoryId": str(inventory_id)})
        return serialize_doc(updated)

    # Insufficient quantity - try pool fallback
    if not allow_pool_deduction:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient quantity. Available: {current_quantity} {unit}, Requested: {quantity} {unit}"
        )

    # Check if this is farm inventory
    item_farm_id = item.get("farmId")
    if item_farm_id is None:
        # Already default inventory - no fallback possible
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient quantity in default inventory. Available: {current_quantity} {unit}, Requested: {quantity} {unit}"
        )

    # Find default inventory with same item
    default_item = await db.inventory_input.find_one({
        "organizationId": str(org_id),
        "farmId": None,
        "itemName": item.get("itemName"),
        "category": item.get("category")
    })

    if not default_item:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient quantity in farm inventory and no default inventory found. Available: {current_quantity} {unit}, Requested: {quantity} {unit}"
        )

    remaining_quantity = quantity - current_quantity
    default_quantity = default_item.get("quantity", 0)

    if remaining_quantity > default_quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient total quantity. Farm: {current_quantity} {unit}, Default: {default_quantity} {unit}, Requested: {quantity} {unit}"
        )

    # Deduct all from farm inventory (use everything available)
    if current_quantity > 0:
        await db.inventory_input.update_one(
            {"inventoryId": str(inventory_id)},
            {"$set": {
                "quantity": 0,
                "baseQuantity": 0,
                "isLowStock": True,
                "lastUsedAt": datetime.utcnow().isoformat(),
                "updatedAt": datetime.utcnow().isoformat()
            }}
        )

        await record_movement(
            db=db,
            inventory_id=inventory_id,
            inventory_type=InventoryType.INPUT,
            movement_type=MovementType.USAGE,
            quantity_before=current_quantity,
            quantity_change=-current_quantity,
            user_id=UUID(current_user.userId),
            organization_id=org_id,
            reason=f"Partial usage (farm inventory): {reason or 'Input material usage'}"
        )

    # Deduct remaining from default inventory
    new_default_quantity = default_quantity - remaining_quantity
    min_stock_default = default_item.get("minimumStock", 0)
    new_base_quantity_default = convert_to_base_unit(new_default_quantity, unit, category)

    await db.inventory_input.update_one(
        {"inventoryId": str(default_item["inventoryId"])},
        {"$set": {
            "quantity": new_default_quantity,
            "baseQuantity": new_base_quantity_default,
            "isLowStock": new_default_quantity <= min_stock_default if min_stock_default > 0 else False,
            "lastUsedAt": datetime.utcnow().isoformat(),
            "updatedAt": datetime.utcnow().isoformat()
        }}
    )

    await record_movement(
        db=db,
        inventory_id=UUID(default_item["inventoryId"]),
        inventory_type=InventoryType.INPUT,
        movement_type=MovementType.USAGE,
        quantity_before=default_quantity,
        quantity_change=-remaining_quantity,
        user_id=UUID(current_user.userId),
        organization_id=org_id,
        reason=f"Pool fallback usage (from default inventory): {reason or 'Input material usage'}"
    )

    # Return both updated items
    updated_farm = await db.inventory_input.find_one({"inventoryId": str(inventory_id)})
    updated_default = await db.inventory_input.find_one({"inventoryId": str(default_item["inventoryId"])})

    return {
        "message": f"Successfully used {quantity} {unit} ({current_quantity} from farm, {remaining_quantity} from default inventory)",
        "farmInventory": serialize_doc(updated_farm),
        "defaultInventory": serialize_doc(updated_default),
        "poolFallbackUsed": True
    }


# Automated deduction using base units (for irrigation/fertilization systems)
@router.post("/input/{inventory_id}/deduct-base", response_model=dict)
async def deduct_input_base_units(
    inventory_id: UUID,
    base_quantity: float = Query(..., gt=0, description="Quantity to deduct in base units (mg or ml)"),
    reason: Optional[str] = Query(None, max_length=500),
    reference_id: Optional[str] = Query(None, max_length=100, description="Reference to task/block/plant"),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Deduct inventory using base units (mg/ml).
    Used by automated irrigation/fertilization systems.

    Args:
        inventory_id: The inventory item to deduct from
        base_quantity: Amount to deduct in base units (mg for solids, ml for liquids)
        reason: Optional reason for deduction
        reference_id: Optional reference to related record (task, block, plant)

    Returns:
        Updated inventory item with new quantities
    """
    org_id = await get_organization_id(current_user)

    item = await db.inventory_input.find_one({"inventoryId": str(inventory_id)})
    if not item:
        raise HTTPException(status_code=404, detail="Input inventory item not found")

    # Verify organization
    if item.get("organizationId") != str(org_id):
        raise HTTPException(status_code=403, detail="Inventory item does not belong to your organization")

    current_base_quantity = item.get("baseQuantity", 0)
    if base_quantity > current_base_quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient quantity. Available: {current_base_quantity} {item.get('baseUnit', 'units')}"
        )

    # Calculate new quantities
    new_base_quantity = current_base_quantity - base_quantity
    category = InputCategory(item.get("category"))
    unit = item.get("unit", "kg")

    # Convert back to display units
    new_display_quantity = convert_from_base_unit(new_base_quantity, unit, category)
    min_stock = item.get("minimumStock", 0)

    # Calculate display quantity change for movement record
    display_quantity_change = convert_from_base_unit(base_quantity, unit, category)

    await db.inventory_input.update_one(
        {"inventoryId": str(inventory_id)},
        {"$set": {
            "quantity": new_display_quantity,
            "baseQuantity": new_base_quantity,
            "isLowStock": new_display_quantity <= min_stock if min_stock > 0 else False,
            "lastUsedAt": datetime.utcnow().isoformat(),
            "updatedAt": datetime.utcnow().isoformat()
        }}
    )

    await record_movement(
        db=db,
        inventory_id=inventory_id,
        inventory_type=InventoryType.INPUT,
        movement_type=MovementType.USAGE,
        quantity_before=item.get("quantity", 0),
        quantity_change=-display_quantity_change,
        user_id=UUID(current_user.userId),
        organization_id=org_id,
        reason=reason or f"Automated deduction ({base_quantity} {item.get('baseUnit', 'units')})",
        reference_id=reference_id
    )

    updated = await db.inventory_input.find_one({"inventoryId": str(inventory_id)})
    return serialize_doc(updated)


# Get available units for a category
@router.get("/units/{category}", response_model=dict)
async def get_units_for_category(
    category: InputCategory
):
    """
    Get available display units and base unit for a category.
    Useful for frontend dropdowns.
    """
    base_unit = get_base_unit_for_category(category)

    if base_unit == BaseUnit.MILLIGRAM:
        display_units = [
            {"value": "kg", "label": "Kilograms (kg)", "conversionFactor": MASS_TO_MG["kg"]},
            {"value": "g", "label": "Grams (g)", "conversionFactor": MASS_TO_MG["g"]},
            {"value": "mg", "label": "Milligrams (mg)", "conversionFactor": MASS_TO_MG["mg"]},
            {"value": "lb", "label": "Pounds (lb)", "conversionFactor": MASS_TO_MG["lb"]},
            {"value": "oz", "label": "Ounces (oz)", "conversionFactor": MASS_TO_MG["oz"]},
        ]
    elif base_unit == BaseUnit.MILLILITER:
        display_units = [
            {"value": "L", "label": "Liters (L)", "conversionFactor": VOLUME_TO_ML["L"]},
            {"value": "ml", "label": "Milliliters (ml)", "conversionFactor": VOLUME_TO_ML["ml"]},
            {"value": "gal", "label": "Gallons (gal)", "conversionFactor": VOLUME_TO_ML["gal"]},
        ]
    else:  # BaseUnit.UNIT
        display_units = [
            {"value": "unit", "label": "Units", "conversionFactor": 1},
            {"value": "piece", "label": "Pieces", "conversionFactor": 1},
            {"value": "packet", "label": "Packets", "conversionFactor": 1},
            {"value": "bag", "label": "Bags", "conversionFactor": 1},
            {"value": "box", "label": "Boxes", "conversionFactor": 1},
        ]

    return {
        "category": category.value,
        "baseUnit": base_unit.value,
        "displayUnits": display_units
    }


# ============================================================================
# ASSET INVENTORY ENDPOINTS
# ============================================================================

@router.get("/asset", response_model=dict)
async def list_asset_inventory(
    farm_id: Optional[UUID] = Query(None, description="Filter by farm ID"),
    scope: Optional[InventoryScope] = Query(None, description="Filter by scope (organization or farm)"),
    category: Optional[AssetCategory] = Query(None),
    status_filter: Optional[AssetStatus] = Query(None, alias="status"),
    maintenance_overdue: bool = Query(False),
    allocated_to_farm: Optional[UUID] = Query(None, description="Filter by currently allocated farm"),
    search: Optional[str] = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    List asset inventory items with pagination.

    Query Parameters:
    - scope=organization: Show only default inventory (farmId=null)
    - scope=farm&farmId=xxx: Show only specific farm's inventory
    - allocatedToFarm=xxx: Show assets currently allocated to farm
    - (no scope): Show all inventory (default + all farms)
    """
    # Get organization ID from current user
    org_id = await get_organization_id(current_user)

    query = {"organizationId": str(org_id)}

    # Scope filtering
    if scope == InventoryScope.ORGANIZATION:
        query["farmId"] = None  # Default inventory only
    elif scope == InventoryScope.FARM:
        if farm_id:
            query["farmId"] = str(farm_id)  # Specific farm
        else:
            query["farmId"] = {"$ne": None}  # All farms
    elif farm_id:
        # If farm_id provided without scope, filter by farm
        query["farmId"] = str(farm_id)

    # Allocation filtering
    if allocated_to_farm:
        query["currentAllocation.farmId"] = str(allocated_to_farm)

    if category:
        query["category"] = category.value
    if status_filter:
        query["status"] = status_filter.value
    if maintenance_overdue:
        query["maintenanceOverdue"] = True
    if search:
        query["$or"] = [
            {"assetName": {"$regex": search, "$options": "i"}},
            {"brand": {"$regex": search, "$options": "i"}},
            {"model": {"$regex": search, "$options": "i"}},
            {"assetTag": {"$regex": search, "$options": "i"}}
        ]

    skip = (page - 1) * per_page
    total = await db.inventory_asset.count_documents(query)
    items = await db.inventory_asset.find(query).sort("createdAt", -1).skip(skip).limit(per_page).to_list(per_page)

    return {
        "items": [serialize_doc(item) for item in items],
        "total": total,
        "page": page,
        "perPage": per_page,
        "totalPages": (total + per_page - 1) // per_page
    }


@router.get(
    "/asset/export/csv",
    summary="Export asset inventory to CSV",
    responses={
        200: {
            "content": {"text/csv": {}},
            "description": "CSV file with filtered asset inventory"
        }
    }
)
async def export_asset_inventory_csv(
    farm_id: Optional[UUID] = Query(None, description="Filter by farm ID"),
    scope: Optional[InventoryScope] = Query(None, description="Filter by scope (organization or farm)"),
    category: Optional[AssetCategory] = Query(None),
    status_filter: Optional[AssetStatus] = Query(None, alias="status"),
    maintenance_overdue: bool = Query(False),
    search: Optional[str] = Query(None, max_length=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Export asset inventory to CSV format.

    Supports the same filters as the list endpoint:
    - farm_id: Filter by specific farm
    - scope: Filter by organization or farm scope
    - category: Filter by asset category
    - status: Filter by asset status
    - maintenance_overdue: Only show maintenance overdue items
    - search: Text search on asset name, brand, model, or asset tag

    The export respects all active filters and only exports matching items.
    """
    org_id = await get_organization_id(current_user)

    query = {"organizationId": str(org_id)}

    if scope == InventoryScope.ORGANIZATION:
        query["farmId"] = None
    elif scope == InventoryScope.FARM:
        if farm_id:
            query["farmId"] = str(farm_id)
        else:
            query["farmId"] = {"$ne": None}
    elif farm_id:
        query["farmId"] = str(farm_id)

    if category:
        query["category"] = category.value
    if status_filter:
        query["status"] = status_filter.value
    if maintenance_overdue:
        query["maintenanceOverdue"] = True
    if search:
        query["$or"] = [
            {"assetName": {"$regex": search, "$options": "i"}},
            {"brand": {"$regex": search, "$options": "i"}},
            {"model": {"$regex": search, "$options": "i"}},
            {"assetTag": {"$regex": search, "$options": "i"}}
        ]

    items = await db.inventory_asset.find(query).sort("createdAt", -1).to_list(10000)

    # Generate CSV
    output = StringIO()
    writer = csv.writer(output)

    # Header row
    writer.writerow([
        "Asset Name", "Category", "Status", "Brand", "Model",
        "Asset Tag", "Serial Number", "Purchase Date", "Purchase Cost",
        "Current Value", "Next Maintenance Date", "Maintenance Overdue",
        "Farm ID", "Location", "Notes"
    ])

    # Data rows
    for item in items:
        writer.writerow([
            item.get("assetName", ""),
            item.get("category", ""),
            item.get("status", ""),
            item.get("brand", ""),
            item.get("model", ""),
            item.get("assetTag", ""),
            item.get("serialNumber", ""),
            item.get("purchaseDate", ""),
            item.get("purchaseCost", ""),
            item.get("currentValue", ""),
            item.get("nextMaintenanceDate", ""),
            item.get("maintenanceOverdue", ""),
            item.get("farmId", ""),
            item.get("location", ""),
            item.get("notes", "")
        ])

    csv_content = output.getvalue()

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=asset_inventory_export.csv"
        }
    )


@router.post("/asset", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_asset_inventory(
    data: AssetInventoryCreate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Create a new asset inventory item.

    Can create either:
    - Farm inventory: Provide farmId
    - Default inventory: Set farmId=null (organization-level shared asset)
    """
    # Get organization ID from current user
    org_id = await get_organization_id(current_user)

    # Compute inventory scope
    inventory_scope = compute_inventory_scope(data.farmId)

    # Validate scope rules (blockId not applicable for asset inventory)
    validate_scope_rules(data.farmId, None, inventory_scope)

    # Check if maintenance is overdue
    maintenance_overdue = False
    if data.nextMaintenanceDate:
        maintenance_overdue = data.nextMaintenanceDate < datetime.utcnow()

    # Prepare inventory data with org_id from auth context
    inventory_data = data.model_dump()
    inventory_data["organizationId"] = org_id  # Override with auth context

    inventory = AssetInventory(
        **inventory_data,
        inventoryScope=inventory_scope,
        maintenanceOverdue=maintenance_overdue,
        createdBy=UUID(current_user.userId)
    )

    doc = inventory.model_dump(mode="json")
    await db.inventory_asset.insert_one(doc)

    return serialize_doc(doc)


@router.get("/asset/{inventory_id}", response_model=dict)
async def get_asset_inventory(
    inventory_id: UUID,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Get a specific asset inventory item"""
    item = await db.inventory_asset.find_one({"inventoryId": str(inventory_id)})
    if not item:
        raise HTTPException(status_code=404, detail="Asset inventory item not found")
    return serialize_doc(item)


@router.patch("/asset/{inventory_id}", response_model=dict)
async def update_asset_inventory(
    inventory_id: UUID,
    data: AssetInventoryUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Update an asset inventory item"""
    item = await db.inventory_asset.find_one({"inventoryId": str(inventory_id)})
    if not item:
        raise HTTPException(status_code=404, detail="Asset inventory item not found")

    update_data = {k: v for k, v in data.model_dump(mode="json").items() if v is not None}
    update_data["updatedAt"] = datetime.utcnow().isoformat()

    # Check maintenance overdue status
    next_maintenance = update_data.get("nextMaintenanceDate", item.get("nextMaintenanceDate"))
    if next_maintenance:
        if isinstance(next_maintenance, str):
            next_maintenance = datetime.fromisoformat(next_maintenance.replace("Z", "+00:00"))
        update_data["maintenanceOverdue"] = next_maintenance < datetime.utcnow()

    await db.inventory_asset.update_one(
        {"inventoryId": str(inventory_id)},
        {"$set": update_data}
    )

    updated = await db.inventory_asset.find_one({"inventoryId": str(inventory_id)})
    return serialize_doc(updated)


@router.delete("/asset/{inventory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset_inventory(
    inventory_id: UUID,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Delete an asset inventory item"""
    result = await db.inventory_asset.delete_one({"inventoryId": str(inventory_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Asset inventory item not found")


# ============================================================================
# TRANSFER OPERATIONS
# ============================================================================

@router.post("/transfer", response_model=dict, status_code=status.HTTP_201_CREATED)
async def transfer_inventory(
    transfer: TransferRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Transfer inventory between scopes.

    Supported Transfers:
    - Organization → Farm: Transfer from default inventory to farm
    - Farm → Organization: Return from farm to default inventory
    - Farm → Farm: Via organization (2 movements)

    Business Logic:
    - Reduces quantity from source
    - Creates/updates destination inventory
    - Records transfer in movement history
    - Adds transfer record to item's transferHistory
    """
    # Get organization ID from current user
    org_id = await get_organization_id(current_user)
    user_id = UUID(current_user.userId)

    # Validate transfer request
    if transfer.fromScope == transfer.toScope == InventoryScope.ORGANIZATION:
        raise HTTPException(
            status_code=400,
            detail="Cannot transfer within organization scope (use adjustment instead)"
        )

    if transfer.fromScope == InventoryScope.ORGANIZATION and transfer.fromFarmId:
        raise HTTPException(
            status_code=400,
            detail="Organization inventory has no farmId (fromFarmId must be null)"
        )

    if transfer.toScope == InventoryScope.ORGANIZATION and transfer.toFarmId:
        raise HTTPException(
            status_code=400,
            detail="Organization inventory has no farmId (toFarmId must be null)"
        )

    if transfer.fromScope == InventoryScope.FARM and not transfer.fromFarmId:
        raise HTTPException(
            status_code=400,
            detail="Farm transfer requires fromFarmId"
        )

    if transfer.toScope == InventoryScope.FARM and not transfer.toFarmId:
        raise HTTPException(
            status_code=400,
            detail="Farm transfer requires toFarmId"
        )

    # Get collection based on inventory type
    if transfer.inventoryType == InventoryType.HARVEST:
        collection = db.inventory_harvest
    elif transfer.inventoryType == InventoryType.INPUT:
        collection = db.inventory_input
    elif transfer.inventoryType == InventoryType.ASSET:
        collection = db.inventory_asset
    else:
        raise HTTPException(status_code=400, detail="Invalid inventory type")

    # Find source inventory item
    source_item = await collection.find_one({"inventoryId": str(transfer.inventoryId)})
    if not source_item:
        raise HTTPException(status_code=404, detail="Source inventory item not found")

    # Verify source item belongs to organization
    if source_item.get("organizationId") != str(org_id):
        raise HTTPException(status_code=403, detail="Inventory item does not belong to your organization")

    # Verify source scope matches
    source_farm_id = source_item.get("farmId")
    actual_from_scope = InventoryScope.ORGANIZATION if source_farm_id is None else InventoryScope.FARM
    if actual_from_scope != transfer.fromScope:
        raise HTTPException(
            status_code=400,
            detail=f"Source item is {actual_from_scope} scope, but transfer specifies {transfer.fromScope}"
        )

    # Check sufficient quantity
    current_quantity = source_item.get("quantity", 0)
    if transfer.quantity > current_quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient quantity. Available: {current_quantity} {transfer.unit}, Requested: {transfer.quantity} {transfer.unit}"
        )

    # Calculate base quantity for input inventory
    if transfer.inventoryType == InventoryType.INPUT:
        category = InputCategory(source_item.get("category"))
        base_quantity_transferred = convert_to_base_unit(transfer.quantity, transfer.unit, category)
    else:
        base_quantity_transferred = transfer.quantity

    # Generate transfer ID
    transfer_id = uuid4()

    # Update source: Reduce quantity
    new_source_quantity = current_quantity - transfer.quantity
    update_data = {
        "quantity": new_source_quantity,
        "updatedAt": datetime.utcnow().isoformat()
    }

    if transfer.inventoryType == InventoryType.HARVEST:
        reserved = source_item.get("reservedQuantity", 0)
        update_data["availableQuantity"] = new_source_quantity - reserved

    if transfer.inventoryType == InventoryType.INPUT:
        category = InputCategory(source_item.get("category"))
        unit = source_item.get("unit")
        new_base_quantity = convert_to_base_unit(new_source_quantity, unit, category)
        update_data["baseQuantity"] = new_base_quantity
        min_stock = source_item.get("minimumStock", 0)
        update_data["isLowStock"] = new_source_quantity <= min_stock if min_stock > 0 else False

    # Add to transfer history
    transfer_record = TransferRecord(
        transferId=transfer_id,
        fromScope=transfer.fromScope,
        toScope=transfer.toScope,
        fromFarmId=transfer.fromFarmId,
        toFarmId=transfer.toFarmId,
        quantityTransferred=base_quantity_transferred if transfer.inventoryType == InventoryType.INPUT else transfer.quantity,
        transferredBy=user_id,
        reason=transfer.reason
    )

    if "transferHistory" in source_item:
        update_data["transferHistory"] = source_item["transferHistory"] + [transfer_record.model_dump(mode="json")]
    else:
        update_data["transferHistory"] = [transfer_record.model_dump(mode="json")]

    await collection.update_one(
        {"inventoryId": str(transfer.inventoryId)},
        {"$set": update_data}
    )

    # Record movement for source
    await record_movement(
        db=db,
        inventory_id=transfer.inventoryId,
        inventory_type=transfer.inventoryType,
        movement_type=MovementType.TRANSFER,
        quantity_before=current_quantity,
        quantity_change=-transfer.quantity,
        user_id=user_id,
        organization_id=org_id,
        from_scope=transfer.fromScope,
        to_scope=transfer.toScope,
        from_farm_id=transfer.fromFarmId,
        to_farm_id=transfer.toFarmId,
        reason=f"Transfer to {transfer.toScope}: {transfer.reason}",
        reference_id=str(transfer_id)
    )

    # Create or update destination inventory
    # For simplicity, create a new inventory item at destination
    # (Alternative: Find existing item and increase quantity)
    dest_inventory_data = {k: v for k, v in source_item.items() if k not in ["_id", "inventoryId", "farmId", "inventoryScope", "createdAt", "updatedAt", "createdBy"]}
    dest_inventory_data.update({
        "inventoryId": str(uuid4()),
        "organizationId": str(org_id),
        "farmId": str(transfer.toFarmId) if transfer.toFarmId else None,
        "inventoryScope": transfer.toScope.value,
        "quantity": transfer.quantity,
        "createdBy": str(user_id),
        "createdAt": datetime.utcnow().isoformat(),
        "updatedAt": datetime.utcnow().isoformat()
    })

    if transfer.inventoryType == InventoryType.HARVEST:
        dest_inventory_data["availableQuantity"] = transfer.quantity
        dest_inventory_data["reservedQuantity"] = 0

    if transfer.inventoryType == InventoryType.INPUT:
        dest_inventory_data["baseQuantity"] = base_quantity_transferred
        min_stock = dest_inventory_data.get("minimumStock", 0)
        dest_inventory_data["isLowStock"] = transfer.quantity <= min_stock if min_stock > 0 else False

    # Insert destination inventory
    await collection.insert_one(dest_inventory_data)
    dest_inventory_id = UUID(dest_inventory_data["inventoryId"])

    # Record movement for destination
    await record_movement(
        db=db,
        inventory_id=dest_inventory_id,
        inventory_type=transfer.inventoryType,
        movement_type=MovementType.ADDITION,
        quantity_before=0,
        quantity_change=transfer.quantity,
        user_id=user_id,
        organization_id=org_id,
        from_scope=transfer.fromScope,
        to_scope=transfer.toScope,
        from_farm_id=transfer.fromFarmId,
        to_farm_id=transfer.toFarmId,
        reason=f"Transfer from {transfer.fromScope}: {transfer.reason}",
        reference_id=str(transfer_id)
    )

    # Get updated source and destination
    updated_source = await collection.find_one({"inventoryId": str(transfer.inventoryId)})
    updated_destination = await collection.find_one({"inventoryId": str(dest_inventory_id)})

    return {
        "transferId": str(transfer_id),
        "sourceInventory": serialize_doc(updated_source),
        "destinationInventory": serialize_doc(updated_destination),
        "message": f"Successfully transferred {transfer.quantity} {transfer.unit} from {transfer.fromScope} to {transfer.toScope}"
    }


# ============================================================================
# PRODUCT CATALOG ENDPOINTS
# ============================================================================

@router.get("/products", response_model=dict)
async def list_products(
    category: Optional[InputCategory] = Query(None),
    search: Optional[str] = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """List products in the master catalog"""
    org_id = await get_organization_id(current_user)

    query = {"organizationId": str(org_id)}
    if category:
        query["category"] = category.value
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"brand": {"$regex": search, "$options": "i"}},
            {"sku": {"$regex": search, "$options": "i"}}
        ]

    skip = (page - 1) * per_page
    total = await db.products.count_documents(query)
    items = await db.products.find(query).sort("name", 1).skip(skip).limit(per_page).to_list(per_page)

    return {
        "items": [serialize_doc(item) for item in items],
        "total": total,
        "page": page,
        "perPage": per_page,
        "totalPages": (total + per_page - 1) // per_page
    }


@router.post("/products", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_product(
    data: ProductCreate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Create a new product in the master catalog"""
    org_id = await get_organization_id(current_user)

    # Get base unit and calculate conversion factor
    base_unit = get_base_unit_for_category(data.category)
    conversion_factor = convert_to_base_unit(1.0, data.unit, data.category)

    product = Product(
        organizationId=org_id,
        name=data.name,
        category=data.category,
        description=data.description,
        unit=data.unit,
        baseUnit=base_unit,
        conversionFactor=conversion_factor,
        brand=data.brand,
        sku=data.sku,
        createdBy=UUID(current_user.userId)
    )

    doc = product.model_dump(mode="json")
    await db.products.insert_one(doc)

    return serialize_doc(doc)


@router.get("/products/{product_id}", response_model=dict)
async def get_product(
    product_id: UUID,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Get a specific product"""
    org_id = await get_organization_id(current_user)

    product = await db.products.find_one({
        "productId": str(product_id),
        "organizationId": str(org_id)
    })

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return serialize_doc(product)


@router.patch("/products/{product_id}", response_model=dict)
async def update_product(
    product_id: UUID,
    data: ProductUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Update a product"""
    org_id = await get_organization_id(current_user)

    product = await db.products.find_one({
        "productId": str(product_id),
        "organizationId": str(org_id)
    })

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    update_data = {k: v for k, v in data.model_dump(mode="json").items() if v is not None}
    update_data["updatedAt"] = datetime.utcnow().isoformat()

    await db.products.update_one(
        {"productId": str(product_id)},
        {"$set": update_data}
    )

    updated = await db.products.find_one({"productId": str(product_id)})
    return serialize_doc(updated)


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: UUID,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Delete a product"""
    org_id = await get_organization_id(current_user)

    result = await db.products.delete_one({
        "productId": str(product_id),
        "organizationId": str(org_id)
    })

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")


# ============================================================================
# INVENTORY MOVEMENTS HISTORY
# ============================================================================

@router.get("/movements", response_model=dict)
async def list_inventory_movements(
    inventory_id: Optional[UUID] = Query(None),
    inventory_type: Optional[InventoryType] = Query(None),
    movement_type: Optional[MovementType] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """List inventory movements/transactions"""
    query = {}
    if inventory_id:
        query["inventoryId"] = str(inventory_id)
    if inventory_type:
        query["inventoryType"] = inventory_type.value
    if movement_type:
        query["movementType"] = movement_type.value

    skip = (page - 1) * per_page
    total = await db.inventory_movements.count_documents(query)
    items = await db.inventory_movements.find(query).sort("performedAt", -1).skip(skip).limit(per_page).to_list(per_page)

    return {
        "items": [serialize_doc(item) for item in items],
        "total": total,
        "page": page,
        "perPage": per_page,
        "totalPages": (total + per_page - 1) // per_page
    }


# ============================================================================
# CATEGORY LOOKUPS
# ============================================================================

@router.get("/categories/input", response_model=List[dict])
async def get_input_categories():
    """Get list of input inventory categories"""
    return [{"value": cat.value, "label": cat.value.replace("_", " ").title()} for cat in InputCategory]


@router.get("/categories/asset", response_model=List[dict])
async def get_asset_categories():
    """Get list of asset inventory categories"""
    return [{"value": cat.value, "label": cat.value.replace("_", " ").title()} for cat in AssetCategory]


@router.get("/statuses/asset", response_model=List[dict])
async def get_asset_statuses():
    """Get list of asset statuses"""
    return [{"value": s.value, "label": s.value.replace("_", " ").title()} for s in AssetStatus]


@router.get("/grades/quality", response_model=List[dict])
async def get_quality_grades():
    """Get list of quality grades"""
    return [{"value": g.value, "label": g.value.replace("_", " ").title()} for g in QualityGrade]


# ============================================================================
# WASTE INVENTORY ENDPOINTS
# ============================================================================

@router.get("/waste", response_model=dict)
async def list_waste_inventory(
    farm_id: Optional[UUID] = Query(None, description="Filter by farm ID"),
    source_type: Optional[WasteSourceType] = Query(None, description="Filter by source type"),
    disposal_method: Optional[DisposalMethod] = Query(None, description="Filter by disposal method"),
    pending_only: bool = Query(False, description="Show only pending disposal"),
    search: Optional[str] = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """List waste inventory items with pagination"""
    org_id = await get_organization_id(current_user)

    query = {"organizationId": str(org_id)}

    if farm_id:
        query["farmId"] = str(farm_id)
    if source_type:
        query["sourceType"] = source_type.value
    if disposal_method:
        query["disposalMethod"] = disposal_method.value
    if pending_only:
        query["disposalMethod"] = DisposalMethod.PENDING.value
    if search:
        query["$or"] = [
            {"plantName": {"$regex": search, "$options": "i"}},
            {"variety": {"$regex": search, "$options": "i"}},
            {"wasteReason": {"$regex": search, "$options": "i"}}
        ]

    skip = (page - 1) * per_page
    total = await db.inventory_waste.count_documents(query)
    items = await db.inventory_waste.find(query).sort("wasteDate", -1).skip(skip).limit(per_page).to_list(per_page)

    return {
        "items": [serialize_doc(item) for item in items],
        "total": total,
        "page": page,
        "perPage": per_page,
        "totalPages": (total + per_page - 1) // per_page
    }


@router.get(
    "/waste/export/csv",
    summary="Export waste inventory to CSV",
    responses={
        200: {
            "content": {"text/csv": {}},
            "description": "CSV file with filtered waste inventory"
        }
    }
)
async def export_waste_inventory_csv(
    farm_id: Optional[UUID] = Query(None, description="Filter by farm ID"),
    source_type: Optional[WasteSourceType] = Query(None, description="Filter by source type"),
    disposal_method: Optional[DisposalMethod] = Query(None, description="Filter by disposal method"),
    pending_only: bool = Query(False, description="Show only pending disposal"),
    search: Optional[str] = Query(None, max_length=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Export waste inventory to CSV format.

    Supports the same filters as the list endpoint:
    - farm_id: Filter by specific farm
    - source_type: Filter by waste source type
    - disposal_method: Filter by disposal method
    - pending_only: Only show pending disposal items
    - search: Text search on plant name, variety, or waste reason

    The export respects all active filters and only exports matching items.
    """
    org_id = await get_organization_id(current_user)

    query = {"organizationId": str(org_id)}

    if farm_id:
        query["farmId"] = str(farm_id)
    if source_type:
        query["sourceType"] = source_type.value
    if disposal_method:
        query["disposalMethod"] = disposal_method.value
    if pending_only:
        query["disposalMethod"] = DisposalMethod.PENDING.value
    if search:
        query["$or"] = [
            {"plantName": {"$regex": search, "$options": "i"}},
            {"variety": {"$regex": search, "$options": "i"}},
            {"wasteReason": {"$regex": search, "$options": "i"}}
        ]

    items = await db.inventory_waste.find(query).sort("wasteDate", -1).to_list(10000)

    # Generate CSV
    output = StringIO()
    writer = csv.writer(output)

    # Header row
    writer.writerow([
        "Plant Name", "Variety", "Source Type", "Waste Reason",
        "Quantity", "Unit", "Waste Date", "Disposal Method",
        "Disposal Date", "Original Grade", "Estimated Value",
        "Currency", "Farm ID", "Notes"
    ])

    # Data rows
    for item in items:
        writer.writerow([
            item.get("plantName", ""),
            item.get("variety", ""),
            item.get("sourceType", ""),
            item.get("wasteReason", ""),
            item.get("quantity", ""),
            item.get("unit", ""),
            item.get("wasteDate", ""),
            item.get("disposalMethod", ""),
            item.get("disposalDate", ""),
            item.get("originalGrade", ""),
            item.get("estimatedValue", ""),
            item.get("currency", ""),
            item.get("farmId", ""),
            item.get("notes", "")
        ])

    csv_content = output.getvalue()

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=waste_inventory_export.csv"
        }
    )


@router.post("/waste", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_waste_inventory(
    data: WasteInventoryCreate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Create a new waste inventory record"""
    org_id = await get_organization_id(current_user)

    waste_data = data.model_dump()
    waste_data["organizationId"] = org_id  # Set from auth context

    waste = WasteInventory(
        **waste_data,
        recordedBy=UUID(current_user.userId)
    )

    doc = waste.model_dump(mode="json")
    await db.inventory_waste.insert_one(doc)

    return serialize_doc(doc)


# NOTE: Static routes MUST come before dynamic /{waste_id} routes
@router.get("/waste/summary", response_model=WasteSummary)
async def get_waste_summary(
    farm_id: Optional[UUID] = Query(None, description="Filter by farm"),
    start_date: Optional[datetime] = Query(None, description="Start date for summary"),
    end_date: Optional[datetime] = Query(None, description="End date for summary"),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Get waste inventory summary statistics"""
    org_id = await get_organization_id(current_user)

    match_query = {"organizationId": str(org_id)}
    if farm_id:
        match_query["farmId"] = str(farm_id)
    if start_date or end_date:
        match_query["wasteDate"] = {}
        if start_date:
            match_query["wasteDate"]["$gte"] = start_date.isoformat()
        if end_date:
            match_query["wasteDate"]["$lte"] = end_date.isoformat()

    # Aggregation pipeline
    pipeline = [
        {"$match": match_query},
        {"$group": {
            "_id": None,
            "totalRecords": {"$sum": 1},
            "totalQuantity": {"$sum": "$quantity"},
            "totalValue": {"$sum": {"$ifNull": ["$estimatedValue", 0]}},
            "pendingDisposal": {
                "$sum": {"$cond": [{"$eq": ["$disposalMethod", "pending"]}, 1, 0]}
            }
        }}
    ]

    result = await db.inventory_waste.aggregate(pipeline).to_list(1)
    stats = result[0] if result else {"totalRecords": 0, "totalQuantity": 0, "totalValue": 0, "pendingDisposal": 0}

    # Get breakdown by source type
    source_pipeline = [
        {"$match": match_query},
        {"$group": {"_id": "$sourceType", "count": {"$sum": 1}, "quantity": {"$sum": "$quantity"}}}
    ]
    source_result = await db.inventory_waste.aggregate(source_pipeline).to_list(100)
    by_source = {r["_id"]: {"count": r["count"], "quantity": r["quantity"]} for r in source_result}

    # Get breakdown by disposal method
    disposal_pipeline = [
        {"$match": match_query},
        {"$group": {"_id": "$disposalMethod", "count": {"$sum": 1}, "quantity": {"$sum": "$quantity"}}}
    ]
    disposal_result = await db.inventory_waste.aggregate(disposal_pipeline).to_list(100)
    by_disposal = {r["_id"]: {"count": r["count"], "quantity": r["quantity"]} for r in disposal_result}

    return WasteSummary(
        totalWasteRecords=stats.get("totalRecords", 0),
        totalQuantity=stats.get("totalQuantity", 0),
        totalEstimatedValue=stats.get("totalValue", 0),
        bySourceType=by_source,
        byDisposalMethod=by_disposal,
        pendingDisposal=stats.get("pendingDisposal", 0)
    )


@router.post("/waste/from-harvest", response_model=dict)
async def move_harvest_to_waste(
    request: MoveToWasteRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Move inventory from harvest to waste.

    Deducts quantity from harvest inventory and creates a waste record.
    """
    org_id = await get_organization_id(current_user)
    user_id = UUID(current_user.userId)

    # Get harvest inventory item
    harvest_item = await db.inventory_harvest.find_one({"inventoryId": str(request.inventoryId)})
    if not harvest_item:
        raise HTTPException(status_code=404, detail="Harvest inventory item not found")

    # Verify organization
    if harvest_item.get("organizationId") != str(org_id):
        raise HTTPException(status_code=403, detail="Inventory item does not belong to your organization")

    # Check available quantity
    available = harvest_item.get("availableQuantity", harvest_item.get("quantity", 0))
    if request.quantity > available:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient quantity. Available: {available}, Requested: {request.quantity}"
        )

    # Deduct from harvest inventory
    current_qty = harvest_item.get("quantity", 0)
    current_available = harvest_item.get("availableQuantity", 0)
    new_qty = current_qty - request.quantity
    new_available = current_available - request.quantity

    await db.inventory_harvest.update_one(
        {"inventoryId": str(request.inventoryId)},
        {"$set": {
            "quantity": new_qty,
            "availableQuantity": new_available,
            "updatedAt": datetime.utcnow().isoformat()
        }}
    )

    # Record movement
    await record_movement(
        db=db,
        inventory_id=request.inventoryId,
        inventory_type=InventoryType.HARVEST,
        movement_type=MovementType.WASTE,
        quantity_before=current_qty,
        quantity_change=-request.quantity,
        user_id=user_id,
        organization_id=org_id,
        reason=f"Moved to waste: {request.wasteReason}"
    )

    # Create waste record
    waste = WasteInventory(
        organizationId=org_id,
        farmId=UUID(harvest_item["farmId"]) if harvest_item.get("farmId") else None,
        sourceType=request.sourceType,
        sourceInventoryId=request.inventoryId,
        sourceBlockId=UUID(harvest_item["blockId"]) if harvest_item.get("blockId") else None,
        plantName=harvest_item.get("plantName", "Unknown"),
        variety=harvest_item.get("variety"),
        quantity=request.quantity,
        unit=harvest_item.get("unit", "kg"),
        originalGrade=harvest_item.get("qualityGrade"),
        wasteReason=request.wasteReason,
        wasteDate=datetime.utcnow(),
        estimatedValue=request.quantity * (harvest_item.get("unitPrice", 0) or 0),
        currency=harvest_item.get("currency", "AED"),
        recordedBy=user_id
    )

    waste_doc = waste.model_dump(mode="json")
    await db.inventory_waste.insert_one(waste_doc)

    return {
        "message": f"Moved {request.quantity} {harvest_item.get('unit', 'units')} to waste",
        "wasteRecord": serialize_doc(waste_doc),
        "updatedInventory": serialize_doc(await db.inventory_harvest.find_one({"inventoryId": str(request.inventoryId)}))
    }


# Dynamic routes with path parameters must come AFTER static routes
@router.get("/waste/{waste_id}", response_model=dict)
async def get_waste_inventory(
    waste_id: UUID,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Get a specific waste inventory item"""
    item = await db.inventory_waste.find_one({"wasteId": str(waste_id)})
    if not item:
        raise HTTPException(status_code=404, detail="Waste inventory item not found")
    return serialize_doc(item)


@router.patch("/waste/{waste_id}", response_model=dict)
async def update_waste_inventory(
    waste_id: UUID,
    data: WasteInventoryUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Update a waste inventory item (usually for disposal tracking)"""
    org_id = await get_organization_id(current_user)

    item = await db.inventory_waste.find_one({"wasteId": str(waste_id)})
    if not item:
        raise HTTPException(status_code=404, detail="Waste inventory item not found")

    if item.get("organizationId") != str(org_id):
        raise HTTPException(status_code=403, detail="Waste item does not belong to your organization")

    update_data = {k: v for k, v in data.model_dump(mode="json").items() if v is not None}
    update_data["updatedAt"] = datetime.utcnow().isoformat()

    await db.inventory_waste.update_one(
        {"wasteId": str(waste_id)},
        {"$set": update_data}
    )

    updated = await db.inventory_waste.find_one({"wasteId": str(waste_id)})
    return serialize_doc(updated)


@router.delete("/waste/{waste_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_waste_inventory(
    waste_id: UUID,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Delete a waste inventory item"""
    result = await db.inventory_waste.delete_one({"wasteId": str(waste_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Waste inventory item not found")
