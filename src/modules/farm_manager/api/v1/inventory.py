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
from motor.motor_asyncio import AsyncIOMotorDatabase

from ...services.database import farm_db
from ...middleware.auth import get_current_active_user, CurrentUser

from src.modules.farm_manager.models.inventory import (
    # Enums
    InventoryType,
    InputCategory,
    AssetCategory,
    AssetStatus,
    QualityGrade,
    MovementType,
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
    # Summary
    InventorySummary,
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


async def record_movement(
    db: AsyncIOMotorDatabase,
    inventory_id: UUID,
    inventory_type: InventoryType,
    movement_type: MovementType,
    quantity_before: float,
    quantity_change: float,
    user_id: UUID,
    reason: Optional[str] = None,
    reference_id: Optional[str] = None
):
    """Record an inventory movement"""
    movement = InventoryMovement(
        inventoryId=inventory_id,
        inventoryType=inventory_type,
        movementType=movement_type,
        quantityBefore=quantity_before,
        quantityChange=quantity_change,
        quantityAfter=quantity_before + quantity_change,
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

    # Harvest inventory stats
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
        totalHarvestValue=harvest_stats.get("totalValue", 0),
        totalInputValue=input_stats.get("totalValue", 0),
        totalAssetValue=asset_stats.get("totalValue", 0),
        lowStockAlerts=input_stats.get("lowStockCount", 0),
        expiringItems=expiring_harvest + expiring_input,
        maintenanceOverdue=asset_stats.get("maintenanceOverdueCount", 0)
    )


# ============================================================================
# HARVEST INVENTORY ENDPOINTS
# ============================================================================

@router.get("/harvest", response_model=dict)
async def list_harvest_inventory(
    farm_id: Optional[UUID] = Query(None),
    quality_grade: Optional[QualityGrade] = Query(None),
    search: Optional[str] = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """List harvest inventory items with pagination"""
    query = {}
    if farm_id:
        query["farmId"] = str(farm_id)
    if quality_grade:
        query["qualityGrade"] = quality_grade.value
    if search:
        query["$or"] = [
            {"plantName": {"$regex": search, "$options": "i"}},
            {"variety": {"$regex": search, "$options": "i"}}
        ]

    skip = (page - 1) * per_page
    total = await db.inventory_harvest.count_documents(query)
    items = await db.inventory_harvest.find(query).sort("createdAt", -1).skip(skip).limit(per_page).to_list(per_page)

    return {
        "items": [serialize_doc(item) for item in items],
        "total": total,
        "page": page,
        "perPage": per_page,
        "totalPages": (total + per_page - 1) // per_page
    }


@router.post("/harvest", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_harvest_inventory(
    data: HarvestInventoryCreate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Create a new harvest inventory item"""
    inventory = HarvestInventory(
        **data.model_dump(),
        availableQuantity=data.quantity,
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
    item = await db.inventory_harvest.find_one({"inventoryId": str(inventory_id)})
    if not item:
        raise HTTPException(status_code=404, detail="Harvest inventory item not found")

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
    farm_id: Optional[UUID] = Query(None),
    category: Optional[InputCategory] = Query(None),
    low_stock_only: bool = Query(False),
    search: Optional[str] = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """List input inventory items with pagination"""
    query = {}
    if farm_id:
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


@router.post("/input", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_input_inventory(
    data: InputInventoryCreate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Create a new input inventory item"""
    is_low_stock = data.quantity <= data.minimumStock if data.minimumStock > 0 else False

    inventory = InputInventory(
        **data.model_dump(),
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
    item = await db.inventory_input.find_one({"inventoryId": str(inventory_id)})
    if not item:
        raise HTTPException(status_code=404, detail="Input inventory item not found")

    update_data = {k: v for k, v in data.model_dump(mode="json").items() if v is not None}
    update_data["updatedAt"] = datetime.utcnow().isoformat()

    # Check low stock status
    new_quantity = update_data.get("quantity", item.get("quantity", 0))
    min_stock = update_data.get("minimumStock", item.get("minimumStock", 0))
    update_data["isLowStock"] = new_quantity <= min_stock if min_stock > 0 else False

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
    quantity: float = Query(..., gt=0, description="Quantity to use"),
    reason: Optional[str] = Query(None, max_length=500),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Record usage of an input inventory item"""
    item = await db.inventory_input.find_one({"inventoryId": str(inventory_id)})
    if not item:
        raise HTTPException(status_code=404, detail="Input inventory item not found")

    current_quantity = item.get("quantity", 0)
    if quantity > current_quantity:
        raise HTTPException(status_code=400, detail="Insufficient quantity available")

    new_quantity = current_quantity - quantity
    min_stock = item.get("minimumStock", 0)

    await db.inventory_input.update_one(
        {"inventoryId": str(inventory_id)},
        {"$set": {
            "quantity": new_quantity,
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
        reason=reason or "Input material usage"
    )

    updated = await db.inventory_input.find_one({"inventoryId": str(inventory_id)})
    return serialize_doc(updated)


# ============================================================================
# ASSET INVENTORY ENDPOINTS
# ============================================================================

@router.get("/asset", response_model=dict)
async def list_asset_inventory(
    farm_id: Optional[UUID] = Query(None),
    category: Optional[AssetCategory] = Query(None),
    status_filter: Optional[AssetStatus] = Query(None, alias="status"),
    maintenance_overdue: bool = Query(False),
    search: Optional[str] = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """List asset inventory items with pagination"""
    query = {}
    if farm_id:
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


@router.post("/asset", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_asset_inventory(
    data: AssetInventoryCreate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Create a new asset inventory item"""
    # Check if maintenance is overdue
    maintenance_overdue = False
    if data.nextMaintenanceDate:
        maintenance_overdue = data.nextMaintenanceDate < datetime.utcnow()

    inventory = AssetInventory(
        **data.model_dump(),
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
