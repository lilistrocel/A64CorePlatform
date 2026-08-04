"""
Returned Inventory Repository

Provides CRUD and filtered-list operations for the ``inventory_returned``
MongoDB collection.  Follows the same raw-dict / motor-async pattern used
elsewhere in the farm_manager service layer so callers (the inventory API
router) remain consistent.
"""

from datetime import datetime
from typing import Optional, List
from uuid import UUID, uuid4

from motor.motor_asyncio import AsyncIOMotorDatabase

from ...models.inventory import (
    ReturnedInventory,
    ReturnedInventoryCreate,
    ReturnedInventoryUpdate,
    InventoryType,
    MovementType,
    WasteSourceType,
    DisposalMethod,
    QualityGrade,
)
from ...models.farming_year_config import (
    get_farming_year,
    DEFAULT_FARMING_YEAR_START_MONTH,
)


def _serialize(doc: Optional[dict]) -> Optional[dict]:
    """
    Convert a MongoDB document to a JSON-serialisable dict.

    Args:
        doc: Raw MongoDB document (may contain _id ObjectId).

    Returns:
        Dict with ``_id`` converted to string, or None if input is None.
    """
    if doc is None:
        return None
    doc["_id"] = str(doc["_id"]) if "_id" in doc else None
    return doc


class ReturnedInventoryRepository:
    """
    Data-access layer for inventory_returned.

    All methods accept a Motor database instance injected by FastAPI
    dependency injection, matching the pattern used in the inventory API.
    """

    # ------------------------------------------------------------------
    # READ
    # ------------------------------------------------------------------

    @staticmethod
    async def get_by_id(
        db: AsyncIOMotorDatabase,
        inventory_id: UUID,
        organization_id: UUID,
    ) -> Optional[dict]:
        """
        Fetch a single returned-inventory row by its inventoryId.

        Args:
            db: Motor database instance.
            inventory_id: UUID of the row.
            organization_id: Caller's organisation (used as an extra scope guard).

        Returns:
            Serialised document dict, or None if not found.
        """
        doc = await db.inventory_returned.find_one(
            {
                "inventoryId": str(inventory_id),
                "organizationId": str(organization_id),
            }
        )
        return _serialize(doc)

    @staticmethod
    async def list_paginated(
        db: AsyncIOMotorDatabase,
        organization_id: UUID,
        farm_id: Optional[UUID] = None,
        quality_grade: Optional[QualityGrade] = None,
        farming_year: Optional[int] = None,
        search: Optional[str] = None,
        sort_by: str = "returnDate",
        sort_order: str = "desc",
        page: int = 1,
        per_page: int = 20,
    ) -> dict:
        """
        Return a paginated, filtered list of returned-inventory rows.

        Args:
            db: Motor database instance.
            organization_id: Scope guard — only rows for this org are returned.
            farm_id: Optional farm filter.
            quality_grade: Optional quality-grade filter.
            farming_year: Optional farming-year filter.
            search: Case-insensitive substring match on plantName / variety.
            sort_by: Field to sort by.  Allowed: returnDate, harvestDate,
                     plantName, quantity, createdAt.
            sort_order: "asc" or "desc".
            page: 1-based page number.
            per_page: Page size (max 100).

        Returns:
            Dict with keys: items, total, page, perPage, totalPages.
        """
        query: dict = {"organizationId": str(organization_id)}

        if farm_id:
            query["farmId"] = str(farm_id)
        if quality_grade:
            query["qualityGrade"] = quality_grade.value
        if farming_year is not None:
            query["farmingYear"] = farming_year
        if search:
            query["$or"] = [
                {"plantName": {"$regex": search, "$options": "i"}},
                {"variety": {"$regex": search, "$options": "i"}},
            ]

        valid_sort_fields = {
            "returnDate",
            "harvestDate",
            "plantName",
            "quantity",
            "createdAt",
        }
        if sort_by not in valid_sort_fields:
            sort_by = "returnDate"
        direction = 1 if sort_order.lower() == "asc" else -1

        skip = (page - 1) * per_page
        total = await db.inventory_returned.count_documents(query)
        items = (
            await db.inventory_returned.find(query)
            .sort(sort_by, direction)
            .skip(skip)
            .limit(per_page)
            .to_list(per_page)
        )

        return {
            "items": [_serialize(item) for item in items],
            "total": total,
            "page": page,
            "perPage": per_page,
            "totalPages": (total + per_page - 1) // per_page,
        }

    # ------------------------------------------------------------------
    # CREATE
    # ------------------------------------------------------------------

    @staticmethod
    async def create(
        db: AsyncIOMotorDatabase,
        data: ReturnedInventoryCreate,
        organization_id: UUID,
        user_id: UUID,
    ) -> dict:
        """
        Insert a new returned-inventory row and write an audit movement.

        The ``originalQuantity`` and ``availableQuantity`` are both set to
        ``data.quantity`` on creation, mirroring the immutability contract
        on inventory_harvest.

        Args:
            db: Motor database instance.
            data: Validated creation payload.
            organization_id: Caller's organisation UUID.
            user_id: UUID of the creating user.

        Returns:
            Serialised dict of the inserted document.
        """
        inventory_data = data.model_dump()
        inventory_data["organizationId"] = organization_id

        # Derive farmingYear from harvestDate for year-based filtering
        harvest_date_dt = data.harvestDate
        if not isinstance(harvest_date_dt, datetime):
            harvest_date_dt = datetime.fromisoformat(str(harvest_date_dt))
        farming_year = get_farming_year(
            harvest_date_dt, DEFAULT_FARMING_YEAR_START_MONTH
        )

        returned_item = ReturnedInventory(
            **inventory_data,
            originalQuantity=data.quantity,
            availableQuantity=data.quantity,
            farmingYear=farming_year,
            createdBy=user_id,
        )

        doc = returned_item.model_dump(mode="json")
        await db.inventory_returned.insert_one(doc)

        # Audit movement
        movement_doc = {
            "movementId": str(uuid4()),
            "inventoryId": str(returned_item.inventoryId),
            "inventoryType": (
                InventoryType.RETURN.value
                if hasattr(InventoryType, "RETURN")
                else "returned"
            ),
            "movementType": MovementType.RETURN.value,
            "quantityBefore": 0,
            "quantityChange": data.quantity,
            "quantityAfter": data.quantity,
            "organizationId": str(organization_id),
            "reason": f"Returned inventory created — source order {data.sourceOrderId}",
            "referenceId": str(data.sourceOrderId),
            "performedBy": str(user_id),
            "performedAt": datetime.utcnow().isoformat(),
        }
        await db.inventory_movements.insert_one(movement_doc)

        return _serialize(doc)

    # ------------------------------------------------------------------
    # UPDATE
    # ------------------------------------------------------------------

    @staticmethod
    async def update(
        db: AsyncIOMotorDatabase,
        inventory_id: UUID,
        organization_id: UUID,
        data: ReturnedInventoryUpdate,
        user_id: UUID,
    ) -> Optional[dict]:
        """
        Partially update a returned-inventory row.

        If ``quantity`` changes, ``availableQuantity`` is recalculated to
        preserve the invariant:
            availableQuantity = quantity - reservedQuantity

        An audit movement is written when quantity changes.

        Args:
            db: Motor database instance.
            inventory_id: Target row UUID.
            organization_id: Scope guard.
            data: Partial update payload.
            user_id: Performing user UUID.

        Returns:
            Updated serialised document, or None if not found / not authorised.
        """
        existing = await db.inventory_returned.find_one(
            {
                "inventoryId": str(inventory_id),
                "organizationId": str(organization_id),
            }
        )
        if existing is None:
            return None

        update_data = {
            k: v for k, v in data.model_dump(mode="json").items() if v is not None
        }
        update_data["updatedAt"] = datetime.utcnow().isoformat()

        if "quantity" in update_data:
            old_qty = existing.get("quantity", 0)
            new_qty = update_data["quantity"]
            reserved = existing.get("reservedQuantity", 0)
            update_data["availableQuantity"] = new_qty - reserved

            if old_qty != new_qty:
                movement_doc = {
                    "movementId": str(uuid4()),
                    "inventoryId": str(inventory_id),
                    "inventoryType": "returned",
                    "movementType": MovementType.ADJUSTMENT.value,
                    "quantityBefore": old_qty,
                    "quantityChange": new_qty - old_qty,
                    "quantityAfter": new_qty,
                    "organizationId": str(organization_id),
                    "reason": "Manual quantity adjustment on returned inventory",
                    "referenceId": None,
                    "performedBy": str(user_id),
                    "performedAt": datetime.utcnow().isoformat(),
                }
                await db.inventory_movements.insert_one(movement_doc)

        await db.inventory_returned.update_one(
            {"inventoryId": str(inventory_id)},
            {"$set": update_data},
        )

        updated = await db.inventory_returned.find_one(
            {"inventoryId": str(inventory_id)}
        )
        return _serialize(updated)

    # ------------------------------------------------------------------
    # DELETE (soft)
    # ------------------------------------------------------------------

    @staticmethod
    async def soft_delete(
        db: AsyncIOMotorDatabase,
        inventory_id: UUID,
        organization_id: UUID,
        user_id: UUID,
    ) -> bool:
        """
        Soft-delete a returned-inventory row.

        Sets ``quantity = 0``, ``availableQuantity = 0``, and stamps
        ``deletedAt`` on the document.  The row is kept for audit purposes.

        Args:
            db: Motor database instance.
            inventory_id: Target row UUID.
            organization_id: Scope guard.
            user_id: Performing user UUID.

        Returns:
            True if the row was found and soft-deleted, False otherwise.
        """
        existing = await db.inventory_returned.find_one(
            {
                "inventoryId": str(inventory_id),
                "organizationId": str(organization_id),
            }
        )
        if existing is None:
            return False

        now_iso = datetime.utcnow().isoformat()
        old_qty = existing.get("quantity", 0)

        await db.inventory_returned.update_one(
            {"inventoryId": str(inventory_id)},
            {
                "$set": {
                    "quantity": 0,
                    "availableQuantity": 0,
                    "deletedAt": now_iso,
                    "updatedAt": now_iso,
                }
            },
        )

        # Audit movement for the deletion
        movement_doc = {
            "movementId": str(uuid4()),
            "inventoryId": str(inventory_id),
            "inventoryType": "returned",
            "movementType": MovementType.REMOVAL.value,
            "quantityBefore": old_qty,
            "quantityChange": -old_qty,
            "quantityAfter": 0,
            "organizationId": str(organization_id),
            "reason": "Returned inventory soft-deleted",
            "referenceId": None,
            "performedBy": str(user_id),
            "performedAt": now_iso,
        }
        await db.inventory_movements.insert_one(movement_doc)

        return True

    # ------------------------------------------------------------------
    # MARK AS WASTE
    # ------------------------------------------------------------------

    @staticmethod
    async def mark_as_waste(
        db: AsyncIOMotorDatabase,
        inventory_id: UUID,
        organization_id: UUID,
        user_id: UUID,
        waste_reason: Optional[str] = None,
        disposal_method_str: Optional[str] = None,
    ) -> Optional[dict]:
        """
        Convert a returned-inventory row into an inventory_waste record.

        The source row is zeroed out (soft-depleted) and an inventory_waste
        row is created with ``sourceType=return``.  An audit movement is
        written for both sides.

        Args:
            db: Motor database instance.
            inventory_id: Returned-inventory row to convert.
            organization_id: Scope guard.
            user_id: Performing user UUID.
            waste_reason: Optional reason string.
            disposal_method_str: Optional disposal method value string.

        Returns:
            Dict with ``wasteId`` and ``quantityMoved``, or None if row
            not found / already depleted.

        Raises:
            ValueError: If the row is already depleted (quantity == 0).
        """
        existing = await db.inventory_returned.find_one(
            {
                "inventoryId": str(inventory_id),
                "organizationId": str(organization_id),
            }
        )
        if existing is None:
            return None

        qty = existing.get("quantity", 0)
        if qty <= 0:
            raise ValueError("Already depleted — nothing to move to waste")

        # Resolve disposal method with fallback
        disposal_method = DisposalMethod.PENDING.value
        if disposal_method_str:
            try:
                disposal_method = DisposalMethod(disposal_method_str).value
            except ValueError:
                pass  # Unknown value — keep PENDING

        now = datetime.utcnow()
        now_iso = now.isoformat()
        waste_id = str(uuid4())

        # Build the waste document
        waste_doc = {
            "wasteId": waste_id,
            "organizationId": str(organization_id),
            "farmId": existing.get("farmId"),
            "sourceType": WasteSourceType.RETURN.value,
            "sourceInventoryId": str(inventory_id),
            "sourceOrderId": existing.get("sourceOrderId"),
            "sourceReturnId": str(inventory_id),
            "sourceBlockId": existing.get("sourceBlockId"),
            "plantName": existing.get("plantName", "Unknown"),
            "variety": existing.get("variety"),
            "quantity": qty,
            "unit": existing.get("unit", "kg"),
            "originalGrade": existing.get("qualityGrade"),
            "wasteReason": waste_reason
            or f"Returned batch {inventory_id} moved to waste",
            "wasteDate": now_iso,
            "disposalMethod": disposal_method,
            "disposalDate": None,
            "disposalNotes": None,
            "estimatedValue": None,
            "currency": existing.get("currency", "AED"),
            "notes": None,
            "recordedBy": str(user_id),
            "divisionId": existing.get("divisionId"),
            "createdAt": now_iso,
            "updatedAt": now_iso,
        }
        await db.inventory_waste.insert_one(waste_doc)

        # Zero out the source row
        await db.inventory_returned.update_one(
            {"inventoryId": str(inventory_id)},
            {
                "$set": {
                    "quantity": 0,
                    "availableQuantity": 0,
                    "movedToWasteAt": now_iso,
                    "movedToWasteId": waste_id,
                    "updatedAt": now_iso,
                }
            },
        )

        # Audit movement
        movement_doc = {
            "movementId": str(uuid4()),
            "inventoryId": str(inventory_id),
            "inventoryType": "returned",
            "movementType": MovementType.WASTE.value,
            "quantityBefore": qty,
            "quantityChange": -qty,
            "quantityAfter": 0,
            "organizationId": str(organization_id),
            "reason": waste_reason or "Moved to waste",
            "referenceId": waste_id,
            "performedBy": str(user_id),
            "performedAt": now_iso,
        }
        await db.inventory_movements.insert_one(movement_doc)

        return {"wasteId": waste_id, "quantityMoved": qty}
