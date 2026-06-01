"""
Purchasing Module — Purchase Item Service

Business logic for the purchase_items master collection.

All write operations emit a `purchase_item_changed` outbox event via
OutboxWriter on a best-effort basis.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models.purchase_item import PurchaseItemCreate, PurchaseItemResponse, PurchaseItemUpdate

logger = logging.getLogger(__name__)

_COLLECTION = "purchase_items"


def _next_item_code(existing_count: int) -> str:
    """
    Generate a sequential item code of the form ITM-XXXXXX.

    Args:
        existing_count: Number of items already in the organisation.

    Returns:
        New item code string.
    """
    return f"ITM-{(existing_count + 1):06d}"


def _doc_to_response(doc: Dict[str, Any]) -> PurchaseItemResponse:
    """
    Convert a raw MongoDB document to a PurchaseItemResponse.

    Args:
        doc: Raw document from MongoDB.

    Returns:
        PurchaseItemResponse Pydantic model.
    """
    return PurchaseItemResponse(
        itemId=doc["itemId"],
        organizationId=doc["organizationId"],
        itemCode=doc["itemCode"],
        name=doc["name"],
        itemType=doc["itemType"],
        uom=doc["uom"],
        description=doc.get("description"),
        defaultWarehouseId=doc.get("defaultWarehouseId"),
        defaultUnitCost=doc.get("defaultUnitCost"),
        barcode=doc.get("barcode"),
        manufacturer=doc.get("manufacturer"),
        isActive=doc.get("isActive", True),
        createdAt=doc["createdAt"],
        updatedAt=doc["updatedAt"],
        deletedAt=doc.get("deletedAt"),
    )


class PurchaseItemService:
    """
    Service class for purchase item master CRUD operations.

    Handles MongoDB interactions and outbox event emission for all item
    create / update / soft-delete flows.
    """

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        """
        Initialise with an active Motor database instance.

        Args:
            db: Async Motor database instance.
        """
        self._col = db[_COLLECTION]
        self._db = db

    async def list_items(
        self,
        organization_id: str,
        *,
        page: int = 1,
        per_page: int = 20,
        search: Optional[str] = None,
        item_type: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """
        Return a paginated list of purchase items for an organisation.

        Args:
            organization_id: Filter items to this org.
            page: Page number (1-based).
            per_page: Items per page.
            search: Optional substring match on name or itemCode.
            item_type: Filter by itemType if supplied.
            is_active: Filter by active status if supplied.

        Returns:
            Dict with 'items', 'total', 'page', 'perPage', 'totalPages'.
        """
        query: Dict[str, Any] = {
            "organizationId": organization_id,
            "deletedAt": None,
        }
        if is_active is not None:
            query["isActive"] = is_active
        if item_type:
            query["itemType"] = item_type
        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"itemCode": {"$regex": search, "$options": "i"}},
            ]

        total = await self._col.count_documents(query)
        offset = (page - 1) * per_page
        cursor = self._col.find(query).sort("itemCode", 1).skip(offset).limit(per_page)
        docs = await cursor.to_list(length=per_page)

        return {
            "items": [_doc_to_response(d) for d in docs],
            "total": total,
            "page": page,
            "perPage": per_page,
            "totalPages": max(1, -(-total // per_page)),
        }

    async def get_item(self, organization_id: str, item_id: str) -> Optional[PurchaseItemResponse]:
        """
        Fetch a single purchase item by itemId.

        Args:
            organization_id: Scopes the lookup to this org.
            item_id: UUID string of the item.

        Returns:
            PurchaseItemResponse or None if not found / deleted.
        """
        doc = await self._col.find_one(
            {"organizationId": organization_id, "itemId": item_id, "deletedAt": None}
        )
        return _doc_to_response(doc) if doc else None

    async def create_item(
        self,
        data: PurchaseItemCreate,
        created_by: str,
        company_code: Optional[str] = None,
    ) -> PurchaseItemResponse:
        """
        Create a new purchase item and emit purchase_item_changed outbox event.

        Args:
            data: Validated PurchaseItemCreate payload.
            created_by: UUID string of the creating user.
            company_code: Finance company code for outbox event routing.

        Returns:
            Created PurchaseItemResponse.

        Raises:
            ValueError: If itemCode already exists for the organisation.
        """
        org_id = str(data.organizationId)

        # Auto-generate itemCode if not supplied
        item_code = data.itemCode
        if not item_code:
            count = await self._col.count_documents({"organizationId": org_id})
            item_code = _next_item_code(count)

        # Reason: unique constraint on (organizationId, itemCode)
        existing = await self._col.find_one(
            {"organizationId": org_id, "itemCode": item_code}
        )
        if existing:
            raise ValueError(f"Item code '{item_code}' already exists in this organisation")

        now = datetime.now(tz=timezone.utc)
        item_id = str(uuid.uuid4())

        doc: Dict[str, Any] = {
            "itemId": item_id,
            "organizationId": org_id,
            "itemCode": item_code,
            "name": data.name,
            "itemType": data.itemType,
            "uom": data.uom,
            "description": data.description,
            "defaultWarehouseId": data.defaultWarehouseId,
            "defaultUnitCost": float(data.defaultUnitCost) if data.defaultUnitCost is not None else None,
            "barcode": data.barcode,
            "manufacturer": data.manufacturer,
            "isActive": True,
            "createdAt": now,
            "createdBy": created_by,
            "updatedAt": now,
            "updatedBy": created_by,
            "deletedAt": None,
        }

        await self._col.insert_one(doc)

        # Emit outbox event (best-effort)
        await self._emit_event(
            item_id=item_id,
            item_code=item_code,
            doc=doc,
            organization_id=org_id,
            source_user_id=created_by,
            company_code=company_code,
            is_deleted=False,
        )

        logger.info("Created purchase item itemCode=%s org=%s", item_code, org_id)
        return _doc_to_response(doc)

    async def update_item(
        self,
        organization_id: str,
        item_id: str,
        data: PurchaseItemUpdate,
        updated_by: str,
        company_code: Optional[str] = None,
    ) -> Optional[PurchaseItemResponse]:
        """
        Partially update a purchase item and emit outbox event.

        Args:
            organization_id: Scopes the update to this org.
            item_id: UUID string of the item to update.
            data: Partial update data.
            updated_by: UUID string of the updating user.
            company_code: Finance company code for outbox routing.

        Returns:
            Updated PurchaseItemResponse or None if not found.
        """
        doc = await self._col.find_one(
            {"organizationId": organization_id, "itemId": item_id, "deletedAt": None}
        )
        if not doc:
            return None

        now = datetime.now(tz=timezone.utc)
        updates: Dict[str, Any] = {"updatedAt": now, "updatedBy": updated_by}

        update_dict = data.model_dump(exclude_none=True)
        for field, value in update_dict.items():
            if field == "defaultUnitCost" and value is not None:
                updates["defaultUnitCost"] = float(value)
            else:
                updates[field] = value

        await self._col.update_one(
            {"itemId": item_id},
            {"$set": updates},
        )

        updated_doc = await self._col.find_one({"itemId": item_id})
        assert updated_doc is not None

        await self._emit_event(
            item_id=item_id,
            item_code=updated_doc["itemCode"],
            doc=updated_doc,
            organization_id=organization_id,
            source_user_id=updated_by,
            company_code=company_code,
            is_deleted=False,
        )

        logger.info("Updated purchase item itemId=%s org=%s", item_id, organization_id)
        return _doc_to_response(updated_doc)

    async def soft_delete_item(
        self,
        organization_id: str,
        item_id: str,
        deleted_by: str,
        company_code: Optional[str] = None,
    ) -> bool:
        """
        Soft-delete a purchase item.

        Args:
            organization_id: Scopes the deletion to this org.
            item_id: UUID string of the item to delete.
            deleted_by: UUID string of the deleting user.
            company_code: Finance company code for outbox routing.

        Returns:
            True if deleted, False if item not found.
        """
        doc = await self._col.find_one(
            {"organizationId": organization_id, "itemId": item_id, "deletedAt": None}
        )
        if not doc:
            return False

        now = datetime.now(tz=timezone.utc)
        await self._col.update_one(
            {"itemId": item_id},
            {"$set": {"deletedAt": now, "isActive": False, "updatedAt": now, "updatedBy": deleted_by}},
        )

        await self._emit_event(
            item_id=item_id,
            item_code=doc["itemCode"],
            doc={**doc, "isActive": False, "deletedAt": now},
            organization_id=organization_id,
            source_user_id=deleted_by,
            company_code=company_code,
            is_deleted=True,
        )

        logger.info("Soft-deleted purchase item itemId=%s org=%s", item_id, organization_id)
        return True

    async def _emit_event(
        self,
        *,
        item_id: str,
        item_code: str,
        doc: Dict[str, Any],
        organization_id: str,
        source_user_id: str,
        company_code: str,
        is_deleted: bool,
    ) -> None:
        """Emit purchase_item_changed outbox event (best-effort)."""
        try:
            from src.modules.finance_bridge.outbox_writer import OutboxWriter

            payload = {
                "itemId": item_id,
                "itemCode": item_code,
                "name": doc["name"],
                "itemType": doc["itemType"],
                "uom": doc["uom"],
                "isActive": doc.get("isActive", True),
                "isDeleted": is_deleted,
            }

            await OutboxWriter.publish(
                db=self._db,
                event_type="purchase_item_changed",
                organization_id=organization_id,
                company_code=company_code,
                payload=payload,
                source_user_id=source_user_id,
                source_document_id=item_id,
            )
        except Exception as exc:
            logger.warning(
                "Failed to emit purchase_item_changed event for item %s: %s",
                item_id, exc,
            )
