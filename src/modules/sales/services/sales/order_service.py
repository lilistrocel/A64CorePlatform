"""
Sales Order Service

Business logic layer for Sales Order operations.
Handles validation, permissions, and orchestration.
Integrates with CRM module to validate customers.
Integrates with Farm Manager module for inventory reservation and fulfillment.

Phase 4 additions:
  - Allocation-aware reservation (inventory_harvest + inventory_returned)
  - Allocation-aware deduction on SHIPPED transition
  - Allocation-aware release on CANCELLED transition
  - Two-step delete: preview + confirm with per-batch decisions
  - Report Return: creates inventory_returned (sellable) or inventory_waste (spoiled)
"""

from typing import List, Optional
from uuid import UUID, uuid4
from datetime import datetime
from fastapi import HTTPException, status
import logging

from ...models.sales_order import (
    SalesOrder,
    SalesOrderCreate,
    SalesOrderUpdate,
    SalesOrderStatus,
    ReturnSummary,
    AllocationPreview,
    DeletePreviewResponse,
    DeleteOrderRequest,
    DeleteOrderResponse,
    ReportReturnRequest,
    ReportReturnResponse,
    ReportReturnStockChanges,
)
from .order_repository import OrderRepository
from ..database import sales_db
from src.core.cache import get_redis_cache
from src.modules.farm_manager.services.database import farm_db
from src.modules.farm_manager.models.inventory import (
    InventoryType,
    MovementType,
    InventoryMovement,
    WasteSourceType,
    DisposalMethod,
    QualityGrade,
    HarvestProductType,
)

logger = logging.getLogger(__name__)

# Statuses that represent "stock already left" — cannot delete, use Report Return
_TERMINAL_STATUSES = {
    SalesOrderStatus.SHIPPED,
    SalesOrderStatus.DELIVERED,
    SalesOrderStatus.CANCELLED,
}

# Statuses where reservations are live and must be released on cancellation/delete
_RESERVED_STATUSES = {
    SalesOrderStatus.CONFIRMED,
    SalesOrderStatus.PROCESSING,
    SalesOrderStatus.ASSIGNED,
    SalesOrderStatus.IN_TRANSIT,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    """Return current UTC time as ISO-8601 string."""
    return datetime.utcnow().isoformat()


async def _lookup_source_row(db, inventory_source: str, inventory_id: str) -> Optional[dict]:
    """
    Fetch an inventory row from the correct collection.

    Args:
        db: Motor database instance.
        inventory_source: 'harvest' or 'returned'.
        inventory_id: String UUID of the row.

    Returns:
        Raw document dict or None.
    """
    if inventory_source == "harvest":
        return await db.inventory_harvest.find_one({"inventoryId": inventory_id})
    elif inventory_source == "returned":
        return await db.inventory_returned.find_one({"inventoryId": inventory_id})
    return None


async def _update_source_row(db, inventory_source: str, inventory_id: str, update: dict) -> None:
    """Apply a $set update to the correct inventory collection."""
    collection = db.inventory_harvest if inventory_source == "harvest" else db.inventory_returned
    await collection.update_one({"inventoryId": inventory_id}, {"$set": update})


async def _write_movement(
    db,
    *,
    inventory_id: str,
    inventory_source: str,
    movement_type: MovementType,
    qty_before: float,
    qty_change: float,
    qty_after: float,
    organization_id: str,
    reference_id: str,
    reason: str,
    performed_by: str,
) -> None:
    """
    Insert an inventory_movements audit record.

    Args:
        db: Motor database instance.
        inventory_id: Source inventory row UUID string.
        inventory_source: 'harvest' or 'returned'.
        movement_type: MovementType enum value.
        qty_before: Quantity before the movement.
        qty_change: Signed change (negative for reductions).
        qty_after: Quantity after the movement.
        organization_id: Organisation UUID string for scoping.
        reference_id: Related record ID (order UUID, waste ID, etc.).
        reason: Human-readable description.
        performed_by: User UUID string.
    """
    inventory_type_str = "harvest" if inventory_source == "harvest" else "returned"
    doc = {
        "movementId": str(uuid4()),
        "inventoryId": inventory_id,
        "inventoryType": inventory_type_str,
        "movementType": movement_type.value,
        "quantityBefore": qty_before,
        "quantityChange": qty_change,
        "quantityAfter": qty_after,
        "organizationId": organization_id,
        "referenceId": reference_id,
        "reason": reason,
        "performedBy": performed_by,
        "performedAt": _now_iso(),
    }
    await db.inventory_movements.insert_one(doc)


class OrderService:
    """Service for Sales Order business logic"""

    def __init__(self):
        self.repository = OrderRepository()

    # -----------------------------------------------------------------------
    # Phase 4 — Allocation-aware reservation
    # -----------------------------------------------------------------------

    async def _reserve_allocations(self, order: SalesOrder, performed_by: str) -> None:
        """
        Reserve inventory against every OrderItemAllocation on a confirmed order.

        Skips items with an empty allocations list (legacy orders without the
        linked-stock flow).  Raises 422 immediately if any allocation fails
        validation.  On partial success (mid-loop DB error), attempts best-effort
        rollback and raises 500.

        Limitation: without MongoDB transactions, rollback is best-effort.
        The inventory_movements audit log can be used to reconstruct state.

        Args:
            order: The fully-built SalesOrder object (not yet inserted / just inserted).
            performed_by: User UUID string for audit records.

        Raises:
            HTTPException 422: If a batch row is missing or has insufficient stock.
            HTTPException 500: If a DB error occurs mid-walk (rollback attempted).
        """
        db = farm_db.get_database()
        processed: list[tuple[str, str, float]] = []  # (source, id, qty) for rollback

        for item_idx, item in enumerate(order.items):
            if not item.allocations:
                # Reason: legacy order or draft order — no per-batch allocation data
                continue

            for alloc in item.allocations:
                inv_id = str(alloc.inventoryId)
                source = alloc.inventorySource

                row = await _lookup_source_row(db, source, inv_id)

                # --- Validation ---
                if row is None:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=(
                            f"Line item {item_idx}: inventory row not found "
                            f"(source={source}, id={inv_id})"
                        ),
                    )

                available = row.get("availableQuantity", 0)
                if alloc.quantity > available:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=(
                            f"Line item {item_idx}: insufficient stock for "
                            f"'{item.productName}' batch {inv_id}. "
                            f"Available: {available:.2f}, requested: {alloc.quantity:.2f}."
                        ),
                    )

                # --- Execute reservation ---
                old_available = available
                old_reserved = row.get("reservedQuantity", 0)
                new_available = old_available - alloc.quantity
                new_reserved = old_reserved + alloc.quantity

                try:
                    await _update_source_row(db, source, inv_id, {
                        "availableQuantity": new_available,
                        "reservedQuantity": new_reserved,
                        "updatedAt": _now_iso(),
                    })
                    await _write_movement(
                        db,
                        inventory_id=inv_id,
                        inventory_source=source,
                        movement_type=MovementType.RESERVATION,
                        qty_before=old_available,
                        qty_change=-alloc.quantity,
                        qty_after=new_available,
                        organization_id=row.get("organizationId", ""),
                        reference_id=str(order.orderId),
                        reason=f"Reserved for order {order.orderCode}",
                        performed_by=performed_by,
                    )
                    processed.append((source, inv_id, alloc.quantity))
                    logger.info(
                        "Reserved %.2f from %s/%s for order %s",
                        alloc.quantity, source, inv_id, order.orderId
                    )
                except Exception as exc:
                    logger.error("Reservation mid-walk failure for %s/%s: %s", source, inv_id, exc)
                    # Best-effort rollback of successfully processed allocations
                    await self._rollback_reservations(db, processed, str(order.orderId), performed_by)
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=(
                            f"Reservation failed mid-walk at line item {item_idx} / batch {inv_id}. "
                            "Partial rollback attempted. Check inventory_movements for audit trail."
                        ),
                    ) from exc

    async def _rollback_reservations(
        self,
        db,
        processed: list,
        order_id: str,
        performed_by: str,
    ) -> None:
        """
        Reverse already-applied reservations after a mid-walk failure.

        Args:
            db: Motor database instance.
            processed: List of (source, inv_id, qty) tuples processed before the failure.
            order_id: Order UUID string for audit records.
            performed_by: User UUID string.
        """
        for source, inv_id, qty in processed:
            try:
                row = await _lookup_source_row(db, source, inv_id)
                if row is None:
                    continue
                old_available = row.get("availableQuantity", 0)
                old_reserved = row.get("reservedQuantity", 0)
                await _update_source_row(db, source, inv_id, {
                    "availableQuantity": old_available + qty,
                    "reservedQuantity": max(0, old_reserved - qty),
                    "updatedAt": _now_iso(),
                })
                await _write_movement(
                    db,
                    inventory_id=inv_id,
                    inventory_source=source,
                    movement_type=MovementType.RESTORATION,
                    qty_before=old_available,
                    qty_change=qty,
                    qty_after=old_available + qty,
                    organization_id=row.get("organizationId", ""),
                    reference_id=order_id,
                    reason=f"Rollback: reservation failed for order {order_id}",
                    performed_by=performed_by,
                )
            except Exception as exc:
                logger.error("Rollback failed for %s/%s: %s", source, inv_id, exc)

    async def _release_allocations(self, order: SalesOrder, performed_by: str) -> None:
        """
        Release (restore) all allocation reservations — used on CANCELLED transition
        and on delete-confirm for active batches.

        Falls back to legacy item.inventoryId for orders without allocations.

        Args:
            order: The order whose reservations should be released.
            performed_by: User UUID string for audit records.
        """
        db = farm_db.get_database()

        for item in order.items:
            if item.allocations:
                for alloc in item.allocations:
                    inv_id = str(alloc.inventoryId)
                    source = alloc.inventorySource
                    row = await _lookup_source_row(db, source, inv_id)
                    if row is None:
                        logger.warning("Release: row %s/%s not found for order %s", source, inv_id, order.orderId)
                        continue

                    old_available = row.get("availableQuantity", 0)
                    old_reserved = row.get("reservedQuantity", 0)
                    new_available = old_available + alloc.quantity
                    new_reserved = max(0, old_reserved - alloc.quantity)

                    await _update_source_row(db, source, inv_id, {
                        "availableQuantity": new_available,
                        "reservedQuantity": new_reserved,
                        "updatedAt": _now_iso(),
                    })
                    await _write_movement(
                        db,
                        inventory_id=inv_id,
                        inventory_source=source,
                        movement_type=MovementType.RESTORATION,
                        qty_before=old_available,
                        qty_change=alloc.quantity,
                        qty_after=new_available,
                        organization_id=row.get("organizationId", ""),
                        reference_id=str(order.orderId),
                        reason=f"Released reservation for cancelled order {order.orderCode}",
                        performed_by=performed_by,
                    )
                    logger.info("Released %.2f from %s/%s for order %s", alloc.quantity, source, inv_id, order.orderId)
            elif item.inventoryId:
                # Legacy path — inventory_harvest only
                inv_id = str(item.inventoryId)
                row = await db.inventory_harvest.find_one({"inventoryId": inv_id})
                if row is None:
                    continue
                old_available = row.get("availableQuantity", 0)
                old_reserved = row.get("reservedQuantity", 0)
                new_reserved = max(0, old_reserved - item.quantity)
                new_available = old_available + item.quantity
                await db.inventory_harvest.update_one(
                    {"inventoryId": inv_id},
                    {"$set": {
                        "availableQuantity": new_available,
                        "reservedQuantity": new_reserved,
                        "updatedAt": _now_iso(),
                    }},
                )
                await _write_movement(
                    db,
                    inventory_id=inv_id,
                    inventory_source="harvest",
                    movement_type=MovementType.RESTORATION,
                    qty_before=old_available,
                    qty_change=item.quantity,
                    qty_after=new_available,
                    organization_id=row.get("organizationId", ""),
                    reference_id=str(order.orderId),
                    reason=f"Released reservation for cancelled order {order.orderCode}",
                    performed_by=performed_by,
                )

    async def _deduct_allocations(self, order: SalesOrder, performed_by: str) -> None:
        """
        Physically deduct allocated quantities from inventory when order ships.

        Validates that neither quantity nor reservedQuantity would go negative.
        Raises 409 if validation fails.

        Args:
            order: The order transitioning to SHIPPED.
            performed_by: User UUID string for audit records.

        Raises:
            HTTPException 409: If deduction would push any value negative.
        """
        db = farm_db.get_database()

        for item_idx, item in enumerate(order.items):
            if item.allocations:
                for alloc in item.allocations:
                    inv_id = str(alloc.inventoryId)
                    source = alloc.inventorySource
                    row = await _lookup_source_row(db, source, inv_id)
                    if row is None:
                        logger.warning("Deduct: row %s/%s not found for order %s", source, inv_id, order.orderId)
                        continue

                    current_qty = row.get("quantity", 0)
                    current_reserved = row.get("reservedQuantity", 0)

                    if current_qty - alloc.quantity < 0:
                        raise HTTPException(
                            status_code=status.HTTP_409_CONFLICT,
                            detail=(
                                f"Line item {item_idx}: deduction of {alloc.quantity:.2f} from "
                                f"batch {inv_id} would result in negative quantity "
                                f"(current: {current_qty:.2f})."
                            ),
                        )
                    if current_reserved - alloc.quantity < 0:
                        raise HTTPException(
                            status_code=status.HTTP_409_CONFLICT,
                            detail=(
                                f"Line item {item_idx}: deduction of {alloc.quantity:.2f} from "
                                f"batch {inv_id} would result in negative reservedQuantity "
                                f"(current: {current_reserved:.2f})."
                            ),
                        )

                    new_qty = current_qty - alloc.quantity
                    new_reserved = current_reserved - alloc.quantity
                    new_available = row.get("availableQuantity", 0)  # available unchanged — it was already reduced on reservation

                    await _update_source_row(db, source, inv_id, {
                        "quantity": new_qty,
                        "reservedQuantity": new_reserved,
                        "updatedAt": _now_iso(),
                    })
                    await _write_movement(
                        db,
                        inventory_id=inv_id,
                        inventory_source=source,
                        movement_type=MovementType.SHIPMENT,
                        qty_before=current_qty,
                        qty_change=-alloc.quantity,
                        qty_after=new_qty,
                        organization_id=row.get("organizationId", ""),
                        reference_id=str(order.orderId),
                        reason=f"Shipped — order {order.orderCode}",
                        performed_by=performed_by,
                    )
                    logger.info("Deducted %.2f from %s/%s for shipped order %s", alloc.quantity, source, inv_id, order.orderId)
            elif item.inventoryId:
                # Legacy path — inventory_harvest only
                inv_id = str(item.inventoryId)
                row = await db.inventory_harvest.find_one({"inventoryId": inv_id})
                if row is None:
                    continue
                current_qty = row.get("quantity", 0)
                current_reserved = row.get("reservedQuantity", 0)
                new_qty = max(0, current_qty - item.quantity)
                new_reserved = max(0, current_reserved - item.quantity)
                await db.inventory_harvest.update_one(
                    {"inventoryId": inv_id},
                    {"$set": {
                        "quantity": new_qty,
                        "reservedQuantity": new_reserved,
                        "updatedAt": _now_iso(),
                    }},
                )
                await _write_movement(
                    db,
                    inventory_id=inv_id,
                    inventory_source="harvest",
                    movement_type=MovementType.SHIPMENT,
                    qty_before=current_qty,
                    qty_change=-item.quantity,
                    qty_after=new_qty,
                    organization_id=row.get("organizationId", ""),
                    reference_id=str(order.orderId),
                    reason=f"Shipped — order {order.orderCode}",
                    performed_by=performed_by,
                )

    # -----------------------------------------------------------------------
    # Legacy helpers (kept for backward compatibility with non-allocation orders)
    # -----------------------------------------------------------------------

    async def _reserve_inventory_for_order(self, order: SalesOrder) -> None:
        """
        Legacy reservation path — uses item.inventoryId (pre-Phase-4 orders).

        Only called by confirm_order for orders that have no allocations at all
        on any item.  New orders use _reserve_allocations.

        Args:
            order: The sales order to reserve inventory for.
        """
        db = farm_db.get_database()

        for item in order.items:
            if not item.inventoryId:
                continue

            inventory_item = await db.inventory_harvest.find_one({"inventoryId": str(item.inventoryId)})
            if not inventory_item:
                logger.warning(f"Inventory item {item.inventoryId} not found for order {order.orderId}")
                continue

            available = inventory_item.get("availableQuantity", 0)
            if item.quantity > available:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Insufficient inventory for {item.productName}. Available: {available}, Requested: {item.quantity}"
                )

            current_reserved = inventory_item.get("reservedQuantity", 0)
            new_reserved = current_reserved + item.quantity
            new_available = available - item.quantity

            await db.inventory_harvest.update_one(
                {"inventoryId": str(item.inventoryId)},
                {"$set": {
                    "reservedQuantity": new_reserved,
                    "availableQuantity": new_available,
                    "updatedAt": _now_iso()
                }}
            )

            movement = InventoryMovement(
                movementId=uuid4(),
                inventoryId=item.inventoryId,
                inventoryType=InventoryType.HARVEST,
                movementType=MovementType.RESERVATION,
                quantityBefore=inventory_item.get("quantity", 0),
                quantityChange=0,
                quantityAfter=inventory_item.get("quantity", 0),
                organizationId=UUID(inventory_item.get("organizationId")),
                reason=f"Reserved for order {order.orderCode}",
                referenceId=str(order.orderId),
                performedBy=order.createdBy,
                performedAt=datetime.utcnow()
            )
            await db.inventory_movements.insert_one(movement.model_dump(mode="json"))

    async def _release_inventory_reservation(self, order: SalesOrder) -> None:
        """
        Legacy release path — uses item.inventoryId (pre-Phase-4 orders).
        Kept to support old confirm_order path.
        """
        db = farm_db.get_database()

        for item in order.items:
            if not item.inventoryId:
                continue

            inventory_item = await db.inventory_harvest.find_one({"inventoryId": str(item.inventoryId)})
            if not inventory_item:
                continue

            current_reserved = inventory_item.get("reservedQuantity", 0)
            current_available = inventory_item.get("availableQuantity", 0)
            new_reserved = max(0, current_reserved - item.quantity)
            new_available = current_available + item.quantity

            await db.inventory_harvest.update_one(
                {"inventoryId": str(item.inventoryId)},
                {"$set": {
                    "reservedQuantity": new_reserved,
                    "availableQuantity": new_available,
                    "updatedAt": _now_iso()
                }}
            )

            movement = InventoryMovement(
                movementId=uuid4(),
                inventoryId=item.inventoryId,
                inventoryType=InventoryType.HARVEST,
                movementType=MovementType.RETURN,
                quantityBefore=inventory_item.get("quantity", 0),
                quantityChange=0,
                quantityAfter=inventory_item.get("quantity", 0),
                organizationId=UUID(inventory_item.get("organizationId")),
                reason=f"Released reservation for cancelled order {order.orderCode}",
                referenceId=str(order.orderId),
                performedBy=order.createdBy,
                performedAt=datetime.utcnow()
            )
            await db.inventory_movements.insert_one(movement.model_dump(mode="json"))

    async def _fulfill_inventory_for_order(self, order: SalesOrder) -> None:
        """
        Legacy deduction path — uses item.inventoryId (pre-Phase-4 orders).
        Kept for backward compatibility with DELIVERED status transitions.
        """
        db = farm_db.get_database()

        for item in order.items:
            if not item.inventoryId:
                continue

            inventory_item = await db.inventory_harvest.find_one({"inventoryId": str(item.inventoryId)})
            if not inventory_item:
                continue

            current_quantity = inventory_item.get("quantity", 0)
            current_reserved = inventory_item.get("reservedQuantity", 0)
            new_quantity = max(0, current_quantity - item.quantity)
            new_reserved = max(0, current_reserved - item.quantity)

            await db.inventory_harvest.update_one(
                {"inventoryId": str(item.inventoryId)},
                {"$set": {
                    "quantity": new_quantity,
                    "reservedQuantity": new_reserved,
                    "updatedAt": _now_iso()
                }}
            )

            movement = InventoryMovement(
                movementId=uuid4(),
                inventoryId=item.inventoryId,
                inventoryType=InventoryType.HARVEST,
                movementType=MovementType.SALE,
                quantityBefore=current_quantity,
                quantityChange=-item.quantity,
                quantityAfter=new_quantity,
                organizationId=UUID(inventory_item.get("organizationId")),
                reason=f"Sold - Order {order.orderCode} delivered",
                referenceId=str(order.orderId),
                performedBy=order.createdBy,
                performedAt=datetime.utcnow()
            )
            await db.inventory_movements.insert_one(movement.model_dump(mode="json"))

    # -----------------------------------------------------------------------
    # CRM validation
    # -----------------------------------------------------------------------

    async def _validate_customer_exists(self, customer_id: UUID) -> dict:
        """
        Validate that customer exists in CRM system.

        Args:
            customer_id: Customer ID to validate.

        Returns:
            Customer data from CRM.

        Raises:
            HTTPException: If customer not found.
        """
        try:
            db = sales_db.get_database()
            customer_doc = await db.customers.find_one({"customerId": str(customer_id)})

            if not customer_doc:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Customer {customer_id} not found in CRM system"
                )

            return customer_doc

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error validating customer: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to validate customer"
            )

    # -----------------------------------------------------------------------
    # CRUD
    # -----------------------------------------------------------------------

    async def create_order(
        self,
        order_data: SalesOrderCreate,
        created_by: UUID
    ) -> SalesOrder:
        """
        Create a new sales order.

        When status is CONFIRMED (or higher), inventory reservations are
        applied via allocation rows.  DRAFT orders skip reservation.

        Args:
            order_data: Sales order creation data.
            created_by: ID of the user creating the order.

        Returns:
            Created sales order.

        Raises:
            HTTPException: If validation fails or customer not found.
        """
        try:
            # Validate customer exists in CRM
            customer = await self._validate_customer_exists(order_data.customerId)

            if order_data.customerName != customer.get("name"):
                logger.warning(
                    "Customer name mismatch: provided '%s' vs CRM '%s'",
                    order_data.customerName, customer.get("name")
                )

            if not order_data.items or len(order_data.items) == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Order must contain at least one item"
                )

            # Validate totals
            calculated_subtotal = sum(item.totalPrice for item in order_data.items)
            if abs(calculated_subtotal - order_data.subtotal) > 0.01:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Subtotal mismatch: calculated {calculated_subtotal}, provided {order_data.subtotal}"
                )

            calculated_total = order_data.subtotal + order_data.tax - order_data.discount
            if abs(calculated_total - order_data.total) > 0.01:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Total mismatch: calculated {calculated_total}, provided {order_data.total}"
                )

            order = await self.repository.create(order_data, created_by)

            # Reserve inventory for CONFIRMED (or higher) orders with allocations
            if order.status not in (SalesOrderStatus.DRAFT,) and any(
                item.allocations for item in order.items
            ):
                await self._reserve_allocations(order, str(created_by))
            elif order.status not in (SalesOrderStatus.DRAFT,):
                # Legacy path — item.inventoryId without per-batch allocations
                await self._reserve_inventory_for_order(order)

            logger.info("Sales order created: %s by user %s", order.orderId, created_by)
            await self._invalidate_sales_dashboard_cache()

            return order

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating sales order: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create sales order"
            )

    async def get_order(self, order_id: UUID) -> SalesOrder:
        """
        Get sales order by ID.

        Args:
            order_id: Sales order ID.

        Returns:
            Sales order.

        Raises:
            HTTPException: If order not found.
        """
        order = await self.repository.get_by_id(order_id)
        if not order:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Sales order {order_id} not found"
            )
        return order

    async def get_all_orders(
        self,
        page: int = 1,
        per_page: int = 20,
        status: Optional[SalesOrderStatus] = None,
        customer_id: Optional[UUID] = None,
        farming_year: Optional[int] = None,
        include_deleted: bool = False,
    ) -> tuple[List[SalesOrder], int, int]:
        """
        Get all sales orders with pagination.

        Args:
            page: Page number (1-indexed).
            per_page: Items per page.
            status: Filter by order status (optional).
            customer_id: Filter by customer ID (optional).
            farming_year: Filter by farming year (optional).
            include_deleted: When False (default), soft-deleted orders are excluded.

        Returns:
            Tuple of (orders, total, total_pages).
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        orders, total = await self.repository.get_all(
            skip, per_page, status, customer_id, farming_year, include_deleted
        )

        total_pages = (total + per_page - 1) // per_page

        return orders, total, total_pages

    async def update_order(
        self,
        order_id: UUID,
        update_data: SalesOrderUpdate
    ) -> SalesOrder:
        """
        Update a sales order.

        Args:
            order_id: Sales order ID.
            update_data: Fields to update.

        Returns:
            Updated sales order.

        Raises:
            HTTPException: If order not found or validation fails.
        """
        await self.get_order(order_id)

        if update_data.customerId:
            await self._validate_customer_exists(update_data.customerId)

        if update_data.items is not None and len(update_data.items) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Order must contain at least one item"
            )

        updated_order = await self.repository.update(order_id, update_data)
        if not updated_order:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Sales order {order_id} not found"
            )

        logger.info(f"Sales order updated: {order_id}")
        await self._invalidate_sales_dashboard_cache()

        return updated_order

    async def update_order_status(
        self,
        order_id: UUID,
        new_status: SalesOrderStatus,
        updated_by: Optional[UUID] = None,
    ) -> SalesOrder:
        """
        Update order status with inventory operations.

        Transitions handled:
          CONFIRMED/PROCESSING/ASSIGNED/IN_TRANSIT → CANCELLED: release reservations.
          any → SHIPPED: deduct physical quantities from all allocation batches.
          (DELIVERED is handled via legacy path for backward compatibility.)

        Args:
            order_id: Sales order ID.
            new_status: New status value.
            updated_by: User performing the transition (used for audit).

        Returns:
            Updated sales order.

        Raises:
            HTTPException: If order not found or inventory operations fail.
        """
        order = await self.get_order(order_id)
        performed_by = str(updated_by) if updated_by else str(order.createdBy)

        if new_status == SalesOrderStatus.CANCELLED and order.status in _RESERVED_STATUSES:
            # Release reservations — prefer allocation-aware path
            if any(item.allocations for item in order.items):
                await self._release_allocations(order, performed_by)
            else:
                await self._release_inventory_reservation(order)
            logger.info("Released inventory reservations for cancelled order %s", order_id)

        if new_status == SalesOrderStatus.SHIPPED and order.status in _RESERVED_STATUSES:
            # Deduct physical stock when goods leave the warehouse
            if any(item.allocations for item in order.items):
                await self._deduct_allocations(order, performed_by)
            else:
                # Legacy path: treat SHIPPED as equivalent to DELIVERED for old orders
                await self._fulfill_inventory_for_order(order)
            logger.info("Deducted stock for shipped order %s", order_id)

        if new_status == SalesOrderStatus.DELIVERED and order.status in (
            SalesOrderStatus.IN_TRANSIT,
            SalesOrderStatus.SHIPPED,
        ):
            # Legacy DELIVERED deduction (for orders without the allocation flow)
            if not any(item.allocations for item in order.items):
                await self._fulfill_inventory_for_order(order)
            logger.info("Fulfilled inventory for delivered order %s", order_id)

        updated_order = await self.repository.update_status(order_id, new_status)
        if not updated_order:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Sales order {order_id} not found"
            )

        logger.info("Sales order status updated: %s -> %s", order_id, new_status.value)
        await self._invalidate_sales_dashboard_cache()

        return updated_order

    async def confirm_order(self, order_id: UUID, confirmed_by: UUID) -> SalesOrder:
        """
        Confirm an order and reserve inventory.

        Args:
            order_id: The order ID to confirm.
            confirmed_by: User ID confirming the order.

        Returns:
            Updated sales order.

        Raises:
            HTTPException: If order not found, already confirmed, or insufficient inventory.
        """
        order = await self.get_order(order_id)

        if order.status != SalesOrderStatus.DRAFT:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Order cannot be confirmed. Current status: {order.status.value}"
            )

        # Prefer allocation-aware reservation
        if any(item.allocations for item in order.items):
            await self._reserve_allocations(order, str(confirmed_by))
        else:
            await self._reserve_inventory_for_order(order)

        updated_order = await self.repository.update_status(order_id, SalesOrderStatus.CONFIRMED)
        logger.info("Order %s confirmed by user %s", order_id, confirmed_by)
        await self._invalidate_sales_dashboard_cache()

        return updated_order

    # -----------------------------------------------------------------------
    # Deliverable 4 — Two-step delete
    # -----------------------------------------------------------------------

    async def get_delete_preview(self, order_id: UUID) -> DeletePreviewResponse:
        """
        Step 1 of two-step delete.

        Returns per-allocation state so the frontend can prompt for decisions
        on expired batches.

        Args:
            order_id: Order to preview.

        Returns:
            DeletePreviewResponse with canDelete flag and allocation states.

        Raises:
            HTTPException 409: If order is in a terminal status (SHIPPED/DELIVERED/CANCELLED).
            HTTPException 404: If order not found.
        """
        order = await self.get_order(order_id)

        if order.status in _TERMINAL_STATUSES:
            return DeletePreviewResponse(
                orderId=order.orderId,
                orderCode=order.orderCode,
                canDelete=False,
                blockingReason=(
                    f"Order is {order.status.value}. "
                    "Use Report Return for shipped/delivered orders. "
                    "Cancelled orders cannot be re-deleted."
                ),
                allocations=[],
            )

        db = farm_db.get_database()
        allocation_previews: list[AllocationPreview] = []

        for item_idx, item in enumerate(order.items):
            for alloc in item.allocations:
                inv_id = str(alloc.inventoryId)
                source = alloc.inventorySource

                row = await _lookup_source_row(db, source, inv_id)
                state: str
                expired_waste_id: Optional[str] = None
                expired_on: Optional[datetime] = None

                if row is None:
                    state = "missing"
                else:
                    # Check if this batch was already moved to waste by the expiry cron
                    waste_doc = await db.inventory_waste.find_one({
                        "sourceType": WasteSourceType.EXPIRED.value,
                        "sourceInventoryId": inv_id,
                        "quantity": {"$gt": 0},
                    })
                    if waste_doc is not None:
                        state = "expired"
                        expired_waste_id = waste_doc.get("wasteId")
                        # wasteDate is the expiry timestamp
                        expired_on_raw = waste_doc.get("wasteDate")
                        if expired_on_raw:
                            try:
                                expired_on = datetime.fromisoformat(expired_on_raw)
                            except (ValueError, TypeError):
                                expired_on = None
                    else:
                        state = "active"

                allocation_previews.append(AllocationPreview(
                    lineItemIndex=item_idx,
                    inventorySource=source,
                    inventoryId=alloc.inventoryId,
                    farmName=alloc.farmName,
                    plantName=item.productName,
                    quantity=alloc.quantity,
                    state=state,
                    expiredWasteId=expired_waste_id,
                    expiredOn=expired_on,
                ))

        return DeletePreviewResponse(
            orderId=order.orderId,
            orderCode=order.orderCode,
            canDelete=True,
            blockingReason=None,
            allocations=allocation_previews,
        )

    async def confirm_delete_order(
        self,
        order_id: UUID,
        request: DeleteOrderRequest,
        deleted_by: UUID,
    ) -> DeleteOrderResponse:
        """
        Step 2 of two-step delete.

        Processes per-batch decisions from the UI, executes restoration/revive/waste
        actions, then soft-deletes the order (status → CANCELLED, deletedAt = now).

        Args:
            order_id: Order to delete.
            request: Decisions for expired/missing batches.
            deleted_by: User performing the deletion.

        Returns:
            DeleteOrderResponse with summary counts.

        Raises:
            HTTPException 409: If order is in a terminal status.
            HTTPException 422: If a 'revive' decision is missing expiryDate or expiryDate is in the past.
            HTTPException 404: If order not found.
        """
        order = await self.get_order(order_id)

        if order.status in _TERMINAL_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Order is {order.status.value} and cannot be deleted. "
                    "Use Report Return for shipped/delivered orders."
                ),
            )

        # Build decision lookup: (lineItemIndex, str(inventoryId)) -> BatchDecision
        decision_map: dict[tuple[int, str], object] = {
            (d.lineItemIndex, str(d.inventoryId)): d
            for d in request.decisions
        }

        db = farm_db.get_database()
        performed_by = str(deleted_by)
        now = datetime.utcnow()
        now_iso = now.isoformat()

        restored_kg = 0.0
        revived_batches: list[str] = []
        wasted_kg = 0.0

        for item_idx, item in enumerate(order.items):
            for alloc in item.allocations:
                inv_id = str(alloc.inventoryId)
                source = alloc.inventorySource
                decision_key = (item_idx, inv_id)
                decision = decision_map.get(decision_key)

                row = await _lookup_source_row(db, source, inv_id)

                # Determine effective action
                if row is None:
                    # Missing batch — create waste record documenting the anomaly
                    action = "waste"
                else:
                    # Check if expired
                    waste_doc = await db.inventory_waste.find_one({
                        "sourceType": WasteSourceType.EXPIRED.value,
                        "sourceInventoryId": inv_id,
                        "quantity": {"$gt": 0},
                    })
                    if waste_doc:
                        action = decision.action if decision else "waste"
                    else:
                        action = "restore"  # active batch — always restore

                if action == "restore":
                    if row is None:
                        # Should not normally happen since we set action=waste for missing rows
                        continue
                    old_available = row.get("availableQuantity", 0)
                    old_reserved = row.get("reservedQuantity", 0)
                    new_available = old_available + alloc.quantity
                    new_reserved = max(0, old_reserved - alloc.quantity)
                    await _update_source_row(db, source, inv_id, {
                        "availableQuantity": new_available,
                        "reservedQuantity": new_reserved,
                        "updatedAt": now_iso,
                    })
                    await _write_movement(
                        db,
                        inventory_id=inv_id,
                        inventory_source=source,
                        movement_type=MovementType.RESTORATION,
                        qty_before=old_available,
                        qty_change=alloc.quantity,
                        qty_after=new_available,
                        organization_id=row.get("organizationId", ""),
                        reference_id=str(order_id),
                        reason=f"Restored on order deletion — order {order.orderCode}",
                        performed_by=performed_by,
                    )
                    restored_kg += alloc.quantity

                elif action == "revive":
                    if decision is None or decision.expiryDate is None:
                        raise HTTPException(
                            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=(
                                f"Line item {item_idx}, batch {inv_id}: "
                                "action='revive' requires expiryDate."
                            ),
                        )
                    if decision.expiryDate <= now:
                        raise HTTPException(
                            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=(
                                f"Line item {item_idx}, batch {inv_id}: "
                                "expiryDate must be in the future for a revive action."
                            ),
                        )
                    # Un-expire the waste record (zero it out and stamp revertedAt)
                    waste_doc = await db.inventory_waste.find_one({
                        "sourceType": WasteSourceType.EXPIRED.value,
                        "sourceInventoryId": inv_id,
                        "quantity": {"$gt": 0},
                    })
                    if waste_doc:
                        revived_qty = waste_doc.get("quantity", 0)
                        await db.inventory_waste.update_one(
                            {"wasteId": waste_doc["wasteId"]},
                            {"$set": {
                                "quantity": 0,
                                "revertedAt": now_iso,
                                "revertedBy": performed_by,
                                "updatedAt": now_iso,
                            }},
                        )
                        # Restore source row: bump quantity and update expiryDate
                        if row is not None:
                            old_qty = row.get("quantity", 0)
                            old_available = row.get("availableQuantity", 0)
                            old_reserved = row.get("reservedQuantity", 0)
                            new_qty = old_qty + revived_qty
                            new_available = old_available + revived_qty
                            new_reserved = max(0, old_reserved - alloc.quantity)
                            await _update_source_row(db, source, inv_id, {
                                "quantity": new_qty,
                                "availableQuantity": new_available + alloc.quantity,  # restore allocation too
                                "reservedQuantity": new_reserved,
                                "expiryDate": decision.expiryDate.isoformat(),
                                "updatedAt": now_iso,
                            })
                            await _write_movement(
                                db,
                                inventory_id=inv_id,
                                inventory_source=source,
                                movement_type=MovementType.RESTORATION,
                                qty_before=old_available,
                                qty_change=revived_qty + alloc.quantity,
                                qty_after=new_available + alloc.quantity,
                                organization_id=row.get("organizationId", ""),
                                reference_id=str(order_id),
                                reason=f"Revived batch on order deletion — new expiry {decision.expiryDate.date()}",
                                performed_by=performed_by,
                            )
                        revived_batches.append(inv_id)
                        restored_kg += alloc.quantity

                elif action == "waste":
                    # Create waste record for the allocated quantity
                    waste_id = str(uuid4())
                    plant_name = item.productName
                    org_id = row.get("organizationId", "") if row else ""
                    farm_id = row.get("farmId") if row else None

                    waste_doc_new = {
                        "wasteId": waste_id,
                        "organizationId": org_id,
                        "farmId": farm_id,
                        "sourceType": WasteSourceType.ORDER_DELETION.value,
                        "sourceInventoryId": inv_id,
                        "sourceOrderId": str(order_id),
                        "sourceReturnId": None,
                        "sourceBlockId": row.get("blockId") if row else None,
                        "plantName": plant_name,
                        "variety": row.get("variety") if row else None,
                        "quantity": alloc.quantity,
                        "unit": row.get("unit", "kg") if row else "kg",
                        "originalGrade": row.get("qualityGrade") if row else None,
                        "wasteReason": (
                            f"Batch was expired before order {order.orderCode} was deleted"
                        ),
                        "wasteDate": now_iso,
                        "disposalMethod": DisposalMethod.PENDING.value,
                        "disposalDate": None,
                        "disposalNotes": None,
                        "estimatedValue": None,
                        "currency": row.get("currency", "AED") if row else "AED",
                        "notes": f"Created during deletion of order {order.orderCode}",
                        "recordedBy": performed_by,
                        "divisionId": row.get("divisionId") if row else None,
                        "createdAt": now_iso,
                        "updatedAt": now_iso,
                    }
                    await db.inventory_waste.insert_one(waste_doc_new)
                    if row:
                        await _write_movement(
                            db,
                            inventory_id=inv_id,
                            inventory_source=source,
                            movement_type=MovementType.WASTE,
                            qty_before=row.get("availableQuantity", 0),
                            qty_change=0,
                            qty_after=row.get("availableQuantity", 0),
                            organization_id=org_id,
                            reference_id=str(order_id),
                            reason=f"Wasted on order deletion — order {order.orderCode}",
                            performed_by=performed_by,
                        )
                    wasted_kg += alloc.quantity

        # Soft-delete the order (CANCELLED + deletedAt)
        collection = sales_db.get_collection("sales_orders")
        await collection.update_one(
            {"orderId": str(order_id)},
            {"$set": {
                "status": SalesOrderStatus.CANCELLED.value,
                "deletedAt": now_iso,
                "updatedAt": now_iso,
            }},
        )

        logger.info(
            "Order %s soft-deleted by %s — restored=%.2f kg, revived=%s batches, wasted=%.2f kg",
            order_id, deleted_by, restored_kg, len(revived_batches), wasted_kg
        )
        await self._invalidate_sales_dashboard_cache()

        return DeleteOrderResponse(
            success=True,
            restoredKg=restored_kg,
            revivedBatches=revived_batches,
            wastedKg=wasted_kg,
            orderStatus="cancelled",
        )

    async def delete_order(self, order_id: UUID) -> dict:
        """
        Hard-delete a sales order (legacy endpoint).

        Prefer the two-step delete flow (get_delete_preview + confirm_delete_order)
        for orders with allocations.  This path is kept for backward compatibility.

        Args:
            order_id: Sales order ID.

        Returns:
            Success message.

        Raises:
            HTTPException: If order not found.
        """
        await self.get_order(order_id)

        success = await self.repository.delete(order_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Sales order {order_id} not found"
            )

        logger.info(f"Sales order deleted: {order_id}")
        return {"message": "Sales order deleted successfully"}

    # -----------------------------------------------------------------------
    # Deliverable 5 — Report Return
    # -----------------------------------------------------------------------

    async def report_return(
        self,
        order_id: UUID,
        request: ReportReturnRequest,
        returned_by: UUID,
    ) -> ReportReturnResponse:
        """
        Record a customer return for a shipped/delivered order.

        For each return item:
          - condition='sellable' → insert inventory_returned row.
          - condition='spoiled'  → insert inventory_waste row (sourceType=RETURN).

        Also inserts a full record in return_orders (for the existing returns UI)
        and appends a thin ReturnSummary to the order's returns[] array.

        Args:
            order_id: The order being returned against.
            request: Return items and notes.
            returned_by: User processing the return.

        Returns:
            ReportReturnResponse with summary counts.

        Raises:
            HTTPException 422: If order status is not SHIPPED or DELIVERED,
                               or if returned quantity exceeds ordered quantity.
            HTTPException 404: If order not found.
        """
        order = await self.get_order(order_id)

        valid_for_return = {SalesOrderStatus.SHIPPED, SalesOrderStatus.DELIVERED}
        if order.status not in valid_for_return:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Report Return requires order status SHIPPED or DELIVERED. "
                    f"Current: {order.status.value}."
                ),
            )

        db = farm_db.get_database()
        sales_db_inst = sales_db.get_database()
        now = datetime.utcnow()
        now_iso = now.isoformat()
        performed_by = str(returned_by)

        # Compute already-returned quantities per item index from return_orders
        existing_returns_cursor = sales_db_inst.return_orders.find(
            {"orderId": str(order_id), "status": {"$ne": "rejected"}}
        )
        already_returned: dict[int, float] = {}
        async for ret_doc in existing_returns_cursor:
            for ri in ret_doc.get("items", []):
                # return_orders items don't track orderItemIndex directly.
                # We'll be conservative and skip this validation when index is unavailable.
                pass

        # Also check order.returns[] for any previously-processed report-returns
        # that stored item-level detail (future enhancement). For now validate
        # per-item against order.items[idx].quantity.

        added_to_returned = 0.0
        added_to_waste = 0.0
        items_returned_detail: list[dict] = []

        # We need to generate a return_order sequence number
        seq_result = await sales_db_inst.counters.find_one_and_update(
            {"_id": "return_order_sequence"},
            {"$inc": {"value": 1}},
            upsert=True,
            return_document=True,
        )
        return_code = f"RET{seq_result['value']:03d}"
        return_id = str(uuid4())

        # Build return_orders items list (for the existing returns UI)
        return_order_items: list[dict] = []

        for ret_item in request.items:
            idx = ret_item.orderItemIndex
            if idx < 0 or idx >= len(order.items):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"orderItemIndex {idx} is out of range (order has {len(order.items)} items).",
                )

            order_item = order.items[idx]
            if ret_item.quantity > order_item.quantity:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"Return quantity {ret_item.quantity:.2f} for item index {idx} "
                        f"exceeds ordered quantity {order_item.quantity:.2f}."
                    ),
                )

            # Derive plantDataId and harvestDate from the source allocation (first batch)
            plant_data_id_str: Optional[str] = None
            harvest_date: Optional[datetime] = None
            farm_id_str: Optional[str] = None
            org_id_str: Optional[str] = None

            if order_item.allocations:
                # Walk allocations to find the first harvest row for harvestDate
                for alloc in order_item.allocations:
                    inv_id = str(alloc.inventoryId)
                    source = alloc.inventorySource
                    src_row = await _lookup_source_row(db, source, inv_id)
                    if src_row:
                        if plant_data_id_str is None:
                            plant_data_id_str = src_row.get("plantDataId")
                        if harvest_date is None:
                            hd_raw = src_row.get("harvestDate")
                            if hd_raw:
                                try:
                                    harvest_date = datetime.fromisoformat(hd_raw)
                                except (ValueError, TypeError):
                                    pass
                        if farm_id_str is None:
                            farm_id_str = src_row.get("farmId")
                        if org_id_str is None:
                            org_id_str = src_row.get("organizationId")

            # Fall back to order-level data if per-allocation lookup failed
            if org_id_str is None:
                org_id_str = getattr(order, "organizationId", None)
            if harvest_date is None:
                harvest_date = order.orderDate  # Best approximation

            if ret_item.condition == "sellable":
                # Insert into inventory_returned
                inv_ret_id = str(uuid4())
                inv_ret_doc = {
                    "inventoryId": inv_ret_id,
                    "organizationId": org_id_str or "",
                    "farmId": farm_id_str,
                    "plantDataId": plant_data_id_str or str(order_item.productId),
                    "plantName": order_item.productName,
                    "productType": HarvestProductType.FRESH.value,
                    "variety": None,
                    "qualityGrade": (order_item.qualityGrade or QualityGrade.GRADE_A.value),
                    "quantity": ret_item.quantity,
                    "unit": "kg",
                    "harvestDate": harvest_date.isoformat() if harvest_date else now_iso,
                    "expiryDate": None,
                    "returnDate": now_iso,
                    "sourceOrderId": str(order_id),
                    "sourceOrderItemId": None,
                    "sourceInventoryHarvestId": None,
                    "sourceBlockId": None,
                    "returnReason": ret_item.reason or "Returned sellable goods",
                    "conditionNotes": None,
                    "containerCodes": [],
                    "notes": request.notes,
                    "originalQuantity": ret_item.quantity,
                    "reservedQuantity": 0.0,
                    "availableQuantity": ret_item.quantity,
                    "farmingYear": None,
                    "divisionId": None,
                    "createdBy": performed_by,
                    "createdAt": now_iso,
                    "updatedAt": now_iso,
                }
                await db.inventory_returned.insert_one(inv_ret_doc)

                await _write_movement(
                    db,
                    inventory_id=inv_ret_id,
                    inventory_source="returned",
                    movement_type=MovementType.RETURN,
                    qty_before=0,
                    qty_change=ret_item.quantity,
                    qty_after=ret_item.quantity,
                    organization_id=org_id_str or "",
                    reference_id=str(order_id),
                    reason=f"Returned sellable — order {order.orderCode}",
                    performed_by=performed_by,
                )
                added_to_returned += ret_item.quantity
                items_returned_detail.append({
                    "orderItemIndex": idx,
                    "condition": "sellable",
                    "quantity": ret_item.quantity,
                    "inventoryReturnedId": inv_ret_id,
                })

                # For return_orders UI
                return_order_items.append({
                    "orderItemId": str(uuid4()),
                    "originalOrderItemProductId": str(order_item.productId),
                    "productName": order_item.productName,
                    "orderedQuantity": order_item.quantity,
                    "returnedQuantity": ret_item.quantity,
                    "originalGrade": order_item.qualityGrade or "grade_a",
                    "newGrade": order_item.qualityGrade or "grade_a",
                    "reason": "other",
                    "condition": "resellable",
                    "inventoryId": str(order_item.inventoryId) if order_item.inventoryId else None,
                    "returnToInventory": True,
                    "notes": ret_item.reason,
                })

            elif ret_item.condition == "spoiled":
                # Insert into inventory_waste (sourceType=RETURN)
                waste_id = str(uuid4())
                waste_doc = {
                    "wasteId": waste_id,
                    "organizationId": org_id_str or "",
                    "farmId": farm_id_str,
                    "sourceType": WasteSourceType.RETURN.value,
                    "sourceInventoryId": None,
                    "sourceOrderId": str(order_id),
                    "sourceReturnId": return_id,
                    "sourceBlockId": None,
                    "plantName": order_item.productName,
                    "variety": None,
                    "quantity": ret_item.quantity,
                    "unit": "kg",
                    "originalGrade": order_item.qualityGrade or "grade_a",
                    "wasteReason": ret_item.reason or "Returned spoiled",
                    "wasteDate": now_iso,
                    "disposalMethod": ret_item.disposalMethod or DisposalMethod.PENDING.value,
                    "disposalDate": None,
                    "disposalNotes": None,
                    "estimatedValue": None,
                    "currency": "AED",
                    "notes": request.notes,
                    "recordedBy": performed_by,
                    "divisionId": None,
                    "createdAt": now_iso,
                    "updatedAt": now_iso,
                }
                await db.inventory_waste.insert_one(waste_doc)

                await _write_movement(
                    db,
                    inventory_id=waste_id,
                    inventory_source="returned",
                    movement_type=MovementType.WASTE,
                    qty_before=0,
                    qty_change=ret_item.quantity,
                    qty_after=ret_item.quantity,
                    organization_id=org_id_str or "",
                    reference_id=str(order_id),
                    reason=f"Returned spoiled — order {order.orderCode}",
                    performed_by=performed_by,
                )
                added_to_waste += ret_item.quantity
                items_returned_detail.append({
                    "orderItemIndex": idx,
                    "condition": "spoiled",
                    "quantity": ret_item.quantity,
                    "wasteId": waste_id,
                })

                # For return_orders UI
                return_order_items.append({
                    "orderItemId": str(uuid4()),
                    "originalOrderItemProductId": str(order_item.productId),
                    "productName": order_item.productName,
                    "orderedQuantity": order_item.quantity,
                    "returnedQuantity": ret_item.quantity,
                    "originalGrade": order_item.qualityGrade or "grade_a",
                    "newGrade": None,
                    "reason": "quality_issue",
                    "condition": "spoiled",
                    "inventoryId": str(order_item.inventoryId) if order_item.inventoryId else None,
                    "returnToInventory": False,
                    "notes": ret_item.reason,
                })

        # Insert full record into return_orders (for existing returns UI)
        total_returned_qty = added_to_returned + added_to_waste
        return_order_doc = {
            "returnId": return_id,
            "returnCode": return_code,
            "orderId": str(order_id),
            "orderCode": order.orderCode,
            "customerName": order.customerName,
            "shipmentId": str(order.shipmentId) if order.shipmentId else None,
            "status": "completed",
            "returnDate": now_iso,
            "processedDate": now_iso,
            "items": return_order_items,
            "totalReturnedQuantity": total_returned_qty,
            "totalRefundAmount": None,
            "notes": request.notes,
            "processedBy": performed_by,
            "divisionId": getattr(order, "divisionId", None),
            "organizationId": getattr(order, "organizationId", None),
            "createdBy": performed_by,
            "createdAt": now_iso,
            "updatedAt": now_iso,
        }
        await sales_db_inst.return_orders.insert_one(return_order_doc)

        # Append thin ReturnSummary to the order document
        return_summary = ReturnSummary(
            returnId=UUID(return_id),
            returnDate=now,
            sellableKg=added_to_returned,
            spoiledKg=added_to_waste,
            notes=request.notes,
        )
        collection = sales_db.get_collection("sales_orders")
        await collection.update_one(
            {"orderId": str(order_id)},
            {"$push": {"returns": return_summary.model_dump(mode="json")},
             "$set": {"updatedAt": now_iso}},
        )

        logger.info(
            "Report Return processed for order %s — %.2f kg sellable, %.2f kg waste",
            order_id, added_to_returned, added_to_waste
        )
        await self._invalidate_sales_dashboard_cache()

        return ReportReturnResponse(
            success=True,
            returnId=return_id,
            itemsReturned=items_returned_detail,
            stockChanges=ReportReturnStockChanges(
                addedToReturned=added_to_returned,
                addedToWaste=added_to_waste,
            ),
        )

    # -----------------------------------------------------------------------
    # Revenue stats
    # -----------------------------------------------------------------------

    async def get_revenue_stats(self, farming_year: Optional[int] = None) -> dict:
        """
        Get aggregated revenue statistics.

        Args:
            farming_year: Filter by farming year (optional).

        Returns:
            Dict with totalRevenue and pendingPayments.
        """
        return await self.repository.get_revenue_stats(farming_year=farming_year)

    # -----------------------------------------------------------------------
    # Cache invalidation
    # -----------------------------------------------------------------------

    async def _invalidate_sales_dashboard_cache(self) -> None:
        """
        Invalidate sales dashboard caches after mutations.

        Invalidates:
        - Sales dashboard statistics (get_dashboard_stats)
        """
        try:
            cache = await get_redis_cache()

            if cache.is_available:
                await cache.delete_pattern("get_dashboard_stats:*", prefix="sales")
                logger.info("[Cache] Invalidated sales dashboard caches after order mutation")

        except Exception as e:
            # Reason: Never break the application due to cache errors
            logger.warning(f"[Cache] Error invalidating sales dashboard caches: {str(e)}")
