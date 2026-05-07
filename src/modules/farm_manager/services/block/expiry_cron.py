"""
Expiry Cron Service

Daily job that scans inventory_harvest for rows whose expiryDate has passed
and still carry availableQuantity > 0.  For each such row the job:

  1. Creates an inventory_waste record with sourceType=EXPIRED.
  2. Zeroes availableQuantity on the inventory_harvest row.
  3. Appends an inventory_movements audit record.

This is invoked at 02:00 UTC every day by the cron service via the
POST /api/v1/farm/inventory/admin/process-expired endpoint.
"""

from datetime import datetime
from typing import Optional
from uuid import uuid4
import logging

from ...models.inventory import WasteSourceType, DisposalMethod

logger = logging.getLogger(__name__)


async def process_expired_harvest_inventory(db) -> dict:
    """
    Find all inventory_harvest rows whose expiryDate has passed and still have
    availableQuantity > 0, then move them to inventory_waste.

    Args:
        db: AsyncIOMotorDatabase instance (e.g. from farm_db.get_database()).

    Returns:
        Dict with keys:
          - moved: number of rows processed
          - skipped: number of rows skipped due to zero/negative qty
          - errors: number of rows that raised an exception
    """
    now = datetime.utcnow()
    now_iso = now.isoformat()

    # Match rows that have an expiryDate in the past AND still hold sellable stock.
    # expiryDate is stored as an ISO-8601 string ("YYYY-MM-DD" or full datetime).
    # Lexicographic comparison works correctly for ISO-8601 date strings.
    cursor = db.inventory_harvest.find({
        "expiryDate": {"$lte": now_iso, "$ne": None, "$exists": True},
        "availableQuantity": {"$gt": 0},
    })

    moved = 0
    skipped = 0
    errors = 0

    async for inv in cursor:
        expired_qty = inv.get("availableQuantity", 0)

        if expired_qty <= 0:
            # Race condition guard — another process may have zeroed it
            skipped += 1
            continue

        inventory_id = inv.get("inventoryId", "unknown")

        try:
            waste_id = str(uuid4())

            # 1. Build waste record — insert raw dict so we don't depend on the
            #    Pydantic model's required fields (recordedBy is System=None here).
            waste_doc = {
                "wasteId": waste_id,
                "organizationId": inv.get("organizationId"),
                "farmId": inv.get("farmId"),
                "sourceType": WasteSourceType.EXPIRED.value,
                "sourceInventoryId": inventory_id,
                "sourceOrderId": None,
                "sourceReturnId": None,
                "sourceBlockId": inv.get("blockId"),
                "plantName": inv.get("plantName", "Unknown"),
                "variety": inv.get("variety"),
                "quantity": expired_qty,
                "unit": inv.get("unit", "kg"),
                "originalGrade": inv.get("qualityGrade"),
                "wasteReason": (
                    f"Auto-moved from sellable stock — expiry {inv.get('expiryDate')}"
                ),
                "wasteDate": now_iso,
                "disposalMethod": DisposalMethod.PENDING.value,
                "disposalDate": None,
                "disposalNotes": None,
                "estimatedValue": None,
                "currency": inv.get("currency", "AED"),
                "notes": None,
                # System-generated; no human user — recordedBy is absent
                # (field is required on WasteInventory Pydantic model but
                # we bypass Pydantic here to allow system-driven inserts).
                "recordedBy": None,
                "divisionId": inv.get("divisionId"),
                "createdAt": now_iso,
                "updatedAt": now_iso,
            }
            await db.inventory_waste.insert_one(waste_doc)

            # 2. Zero availableQuantity; reduce quantity by the expired amount
            #    so the total stored qty stays accurate.
            prior_qty = inv.get("quantity", expired_qty)
            await db.inventory_harvest.update_one(
                {"inventoryId": inventory_id},
                {
                    "$set": {
                        "quantity": max(0.0, prior_qty - expired_qty),
                        "availableQuantity": 0,
                        "updatedAt": now_iso,
                    }
                },
            )

            # 3. Audit movement record
            movement_doc = {
                "movementId": str(uuid4()),
                "inventoryId": inventory_id,
                "inventoryType": "harvest",
                "movementType": "waste",
                "quantityBefore": expired_qty,
                "quantityChange": -expired_qty,
                "quantityAfter": 0,
                "organizationId": inv.get("organizationId"),
                "reason": f"Expired — auto-moved to waste (wasteId={waste_id})",
                "referenceId": waste_id,
                "performedBy": None,  # System
                "performedAt": now_iso,
            }
            await db.inventory_movements.insert_one(movement_doc)

            moved += 1
            logger.info(
                f"[Expiry Cron] Moved expired inventory {inventory_id} "
                f"({expired_qty} {inv.get('unit', 'kg')}) → waste {waste_id}"
            )

        except Exception as exc:
            errors += 1
            logger.error(
                f"[Expiry Cron] Failed to process inventory {inventory_id}: {exc}",
                exc_info=True,
            )

    logger.info(
        f"[Expiry Cron] Completed — moved={moved}, skipped={skipped}, errors={errors}"
    )
    return {"moved": moved, "skipped": skipped, "errors": errors}
