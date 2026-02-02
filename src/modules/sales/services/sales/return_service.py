"""
Return Order Service

Business logic layer for handling sales returns.
Handles return creation, processing, and inventory/waste updates.
"""

from typing import List, Optional
from uuid import UUID, uuid4
from datetime import datetime
from fastapi import HTTPException, status
import logging

from ...models.return_order import (
    ReturnOrder, ReturnOrderCreate, ReturnOrderUpdate,
    ReturnStatus, ReturnCondition, ProcessReturnRequest, ProcessReturnResponse
)
from ...models.sales_order import SalesOrderStatus
from ..database import sales_db
from src.modules.farm_manager.services.database import farm_db
from src.modules.farm_manager.models.inventory import (
    InventoryType, MovementType, InventoryMovement, QualityGrade
)

logger = logging.getLogger(__name__)


class ReturnService:
    """Service for Return Order business logic"""

    def __init__(self):
        self.collection_name = "return_orders"

    def _get_collection(self):
        """Get return orders collection"""
        return sales_db.get_database()[self.collection_name]

    async def _get_next_return_sequence(self) -> int:
        """Get next return sequence number using atomic increment."""
        db = sales_db.get_database()
        result = await db.counters.find_one_and_update(
            {"_id": "return_order_sequence"},
            {"$inc": {"value": 1}},
            upsert=True,
            return_document=True
        )
        return result["value"]

    async def create_return(
        self,
        return_data: ReturnOrderCreate,
        created_by: UUID
    ) -> ReturnOrder:
        """
        Create a new return order.

        Args:
            return_data: Return order creation data
            created_by: User ID creating the return

        Returns:
            Created return order

        Raises:
            HTTPException: If original order not found or invalid
        """
        db = sales_db.get_database()

        # Validate original order exists
        order_doc = await db.sales_orders.find_one({"orderId": str(return_data.orderId)})
        if not order_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Original order {return_data.orderId} not found"
            )

        # Validate order is in a deliverable state
        valid_statuses = [SalesOrderStatus.DELIVERED.value, SalesOrderStatus.IN_TRANSIT.value]
        if order_doc.get("status") not in valid_statuses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot create return for order with status: {order_doc.get('status')}. Must be DELIVERED or IN_TRANSIT."
            )

        # Calculate total returned quantity
        total_returned = sum(item.returnedQuantity for item in return_data.items)

        # Generate return code
        sequence = await self._get_next_return_sequence()
        return_code = f"RET{sequence:03d}"

        # Create return order
        return_order = ReturnOrder(
            orderId=return_data.orderId,
            shipmentId=return_data.shipmentId,
            items=[item.model_dump() for item in return_data.items],
            notes=return_data.notes,
            returnCode=return_code,
            customerName=order_doc.get("customerName"),
            orderCode=order_doc.get("orderCode"),
            totalReturnedQuantity=total_returned,
            createdBy=created_by,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow()
        )

        # Convert to dict for MongoDB
        return_doc = return_order.model_dump(mode="json")
        return_doc["returnId"] = str(return_doc["returnId"])
        return_doc["orderId"] = str(return_doc["orderId"])
        if return_doc.get("shipmentId"):
            return_doc["shipmentId"] = str(return_doc["shipmentId"])
        return_doc["createdBy"] = str(return_doc["createdBy"])

        # Convert item IDs to strings
        for item in return_doc["items"]:
            item["orderItemId"] = str(item["orderItemId"])
            item["originalOrderItemProductId"] = str(item["originalOrderItemProductId"])
            if item.get("inventoryId"):
                item["inventoryId"] = str(item["inventoryId"])

        await self._get_collection().insert_one(return_doc)

        logger.info(f"Return order created: {return_order.returnId} for order {return_data.orderId}")
        return return_order

    async def get_return(self, return_id: UUID) -> ReturnOrder:
        """
        Get return order by ID.

        Args:
            return_id: Return order ID

        Returns:
            Return order

        Raises:
            HTTPException: If return not found
        """
        return_doc = await self._get_collection().find_one({"returnId": str(return_id)})
        if not return_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Return order {return_id} not found"
            )
        return_doc.pop("_id", None)
        return ReturnOrder(**return_doc)

    async def get_returns_for_order(self, order_id: UUID) -> List[ReturnOrder]:
        """Get all returns for a specific order."""
        cursor = self._get_collection().find({"orderId": str(order_id)}).sort("createdAt", -1)
        returns = []
        async for doc in cursor:
            doc.pop("_id", None)
            returns.append(ReturnOrder(**doc))
        return returns

    async def get_all_returns(
        self,
        page: int = 1,
        per_page: int = 20,
        status_filter: Optional[ReturnStatus] = None,
        order_id: Optional[UUID] = None
    ) -> tuple[List[ReturnOrder], int, int]:
        """
        Get all returns with pagination.

        Args:
            page: Page number
            per_page: Items per page
            status_filter: Filter by status
            order_id: Filter by order ID

        Returns:
            Tuple of (returns, total, total_pages)
        """
        query = {}
        if status_filter:
            query["status"] = status_filter.value
        if order_id:
            query["orderId"] = str(order_id)

        skip = (page - 1) * per_page
        total = await self._get_collection().count_documents(query)

        cursor = self._get_collection().find(query).sort("createdAt", -1).skip(skip).limit(per_page)
        returns = []
        async for doc in cursor:
            doc.pop("_id", None)
            returns.append(ReturnOrder(**doc))

        total_pages = (total + per_page - 1) // per_page
        return returns, total, total_pages

    async def update_return(
        self,
        return_id: UUID,
        update_data: ReturnOrderUpdate
    ) -> ReturnOrder:
        """Update a return order."""
        await self.get_return(return_id)  # Validate exists

        update_dict = update_data.model_dump(exclude_unset=True, mode="json")
        if not update_dict:
            return await self.get_return(return_id)

        update_dict["updatedAt"] = datetime.utcnow().isoformat()

        await self._get_collection().update_one(
            {"returnId": str(return_id)},
            {"$set": update_dict}
        )

        logger.info(f"Return order updated: {return_id}")
        return await self.get_return(return_id)

    async def process_return(
        self,
        process_request: ProcessReturnRequest,
        processed_by: UUID
    ) -> ProcessReturnResponse:
        """
        Process a return order: update inventory and/or create waste records.

        Args:
            process_request: Processing request with return ID and optional overrides
            processed_by: User ID processing the return

        Returns:
            ProcessReturnResponse with inventory and waste updates

        Raises:
            HTTPException: If return not found or already processed
        """
        return_order = await self.get_return(process_request.returnId)

        # Validate return can be processed
        if return_order.status == ReturnStatus.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Return order has already been processed"
            )

        if return_order.status == ReturnStatus.REJECTED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Return order was rejected and cannot be processed"
            )

        # Update status to processing
        await self._get_collection().update_one(
            {"returnId": str(process_request.returnId)},
            {"$set": {"status": ReturnStatus.PROCESSING.value, "updatedAt": datetime.utcnow().isoformat()}}
        )

        farm_db_instance = farm_db.get_database()
        inventory_updates = []
        waste_created = []

        # Process each return item
        for item in return_order.items:
            # Check for overrides
            item_override = None
            if process_request.itemOverrides:
                for override in process_request.itemOverrides:
                    if str(override.get("orderItemId")) == str(item.get("orderItemId") or item.orderItemId):
                        item_override = override
                        break

            # Determine if item goes back to inventory or waste
            return_to_inventory = item_override.get("returnToInventory", item.returnToInventory) if item_override else item.returnToInventory
            new_grade = item_override.get("newGrade", item.newGrade) if item_override else item.newGrade
            condition = item.condition if isinstance(item.condition, str) else item.condition.value

            # Items in poor condition always go to waste
            if condition in [ReturnCondition.SPOILED.value, ReturnCondition.CONTAMINATED.value, "spoiled", "contaminated"]:
                return_to_inventory = False

            if return_to_inventory:
                # Return to harvest inventory
                inventory_update = await self._return_to_inventory(
                    farm_db_instance,
                    item,
                    new_grade,
                    return_order,
                    processed_by
                )
                if inventory_update:
                    inventory_updates.append(inventory_update)
            else:
                # Create waste record
                waste_record = await self._create_waste_record(
                    farm_db_instance,
                    item,
                    return_order,
                    processed_by
                )
                if waste_record:
                    waste_created.append(waste_record)

        # Update original sales order status
        sales_db_instance = sales_db.get_database()

        # Determine if full or partial return
        order_doc = await sales_db_instance.sales_orders.find_one({"orderId": str(return_order.orderId)})
        if order_doc:
            total_ordered = sum(item.get("quantity", 0) for item in order_doc.get("items", []))
            total_returned = return_order.totalReturnedQuantity

            new_status = SalesOrderStatus.PARTIALLY_RETURNED.value
            if total_returned >= total_ordered:
                new_status = SalesOrderStatus.RETURNED.value

            await sales_db_instance.sales_orders.update_one(
                {"orderId": str(return_order.orderId)},
                {"$set": {"status": new_status, "updatedAt": datetime.utcnow().isoformat()}}
            )

        # Mark return as completed
        await self._get_collection().update_one(
            {"returnId": str(process_request.returnId)},
            {
                "$set": {
                    "status": ReturnStatus.COMPLETED.value,
                    "processedDate": datetime.utcnow().isoformat(),
                    "processedBy": str(processed_by),
                    "updatedAt": datetime.utcnow().isoformat()
                }
            }
        )

        updated_return = await self.get_return(process_request.returnId)

        logger.info(f"Return order {process_request.returnId} processed: {len(inventory_updates)} inventory updates, {len(waste_created)} waste records")

        return ProcessReturnResponse(
            returnOrder=updated_return.model_dump(mode="json"),
            inventoryUpdates=inventory_updates,
            wasteCreated=waste_created,
            message=f"Return processed: {len(inventory_updates)} items returned to inventory, {len(waste_created)} items marked as waste"
        )

    async def _return_to_inventory(
        self,
        db,
        item,
        new_grade: Optional[str],
        return_order: ReturnOrder,
        processed_by: UUID
    ) -> Optional[dict]:
        """Return item to harvest inventory."""
        # Get item attributes
        inventory_id = item.get("inventoryId") or getattr(item, "inventoryId", None)
        product_name = item.get("productName") or getattr(item, "productName", None)
        returned_qty = item.get("returnedQuantity") or getattr(item, "returnedQuantity", 0)
        original_grade = item.get("originalGrade") or getattr(item, "originalGrade", None)

        if inventory_id:
            # Update existing inventory
            inventory_item = await db.inventory_harvest.find_one({"inventoryId": str(inventory_id)})
            if inventory_item:
                current_qty = inventory_item.get("quantity", 0)
                current_available = inventory_item.get("availableQuantity", 0)

                new_qty = current_qty + returned_qty
                new_available = current_available + returned_qty

                update_data = {
                    "quantity": new_qty,
                    "availableQuantity": new_available,
                    "updatedAt": datetime.utcnow().isoformat()
                }

                # Update grade if changed
                if new_grade and new_grade != original_grade:
                    update_data["qualityGrade"] = new_grade

                await db.inventory_harvest.update_one(
                    {"inventoryId": str(inventory_id)},
                    {"$set": update_data}
                )

                # Record movement
                movement = InventoryMovement(
                    movementId=uuid4(),
                    inventoryId=UUID(str(inventory_id)),
                    inventoryType=InventoryType.HARVEST,
                    movementType=MovementType.RETURN,
                    quantityBefore=current_qty,
                    quantityChange=returned_qty,
                    quantityAfter=new_qty,
                    organizationId=UUID(inventory_item.get("organizationId")),
                    reason=f"Return from order {return_order.orderCode}: {item.get('reason', 'Return')}",
                    referenceId=str(return_order.returnId),
                    performedBy=processed_by,
                    performedAt=datetime.utcnow()
                )
                await db.inventory_movements.insert_one(movement.model_dump(mode="json"))

                logger.info(f"Returned {returned_qty} to inventory {inventory_id}")

                return {
                    "inventoryId": str(inventory_id),
                    "productName": product_name,
                    "quantityReturned": returned_qty,
                    "newGrade": new_grade or original_grade,
                    "newTotal": new_qty
                }

        return None

    async def _create_waste_record(
        self,
        db,
        item,
        return_order: ReturnOrder,
        processed_by: UUID
    ) -> Optional[dict]:
        """Create waste inventory record for returned item."""
        # Get item attributes
        product_name = item.get("productName") or getattr(item, "productName", None)
        returned_qty = item.get("returnedQuantity") or getattr(item, "returnedQuantity", 0)
        original_grade = item.get("originalGrade") or getattr(item, "originalGrade", None)
        condition = item.get("condition") or getattr(item, "condition", None)
        reason = item.get("reason") or getattr(item, "reason", None)
        inventory_id = item.get("inventoryId") or getattr(item, "inventoryId", None)

        # Get organization ID from inventory or default
        org_id = None
        if inventory_id:
            inventory_item = await db.inventory_harvest.find_one({"inventoryId": str(inventory_id)})
            if inventory_item:
                org_id = inventory_item.get("organizationId")

        # Create waste record
        waste_record = {
            "wasteId": str(uuid4()),
            "organizationId": org_id,
            "sourceType": "return",
            "sourceInventoryId": str(inventory_id) if inventory_id else None,
            "sourceOrderId": str(return_order.orderId),
            "sourceReturnId": str(return_order.returnId),
            "plantName": product_name,
            "quantity": returned_qty,
            "unit": "kg",  # Default unit
            "originalGrade": original_grade,
            "wasteReason": f"{reason}: {condition}" if isinstance(reason, str) else f"{reason.value if hasattr(reason, 'value') else reason}: {condition.value if hasattr(condition, 'value') else condition}",
            "wasteDate": datetime.utcnow().isoformat(),
            "disposalMethod": None,
            "disposalDate": None,
            "recordedBy": str(processed_by),
            "createdAt": datetime.utcnow().isoformat()
        }

        await db.inventory_waste.insert_one(waste_record)

        logger.info(f"Created waste record for {returned_qty} of {product_name}")

        return waste_record

    async def delete_return(self, return_id: UUID) -> dict:
        """Delete a return order (only if pending)."""
        return_order = await self.get_return(return_id)

        if return_order.status != ReturnStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete return with status: {return_order.status.value}. Only PENDING returns can be deleted."
            )

        result = await self._get_collection().delete_one({"returnId": str(return_id)})
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Return order {return_id} not found"
            )

        logger.info(f"Return order deleted: {return_id}")
        return {"message": "Return order deleted successfully"}
