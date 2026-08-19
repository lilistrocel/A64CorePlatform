"""
Plant Library Product Extension Stage 3 — inventory_waste routing-shape
migration.

Design doc: Docs/2-Working-Progress/plant-library-product-extension-design.md
§8 step 2. Stage 3 adds `productId`/`harvestBatchId` to `inventory_waste`
(see src/modules/farm_manager/models/inventory.py's WasteInventoryBase) so
waste lines from the new multi-line harvest submission
(HarvestService.submit_harvest_batch / block_harvests.py's POST .../batch)
carry the same product link and batch grouping as their sibling sellable/
process lines. This script backfills the shape onto the ONE live
`inventory_waste` row that predates that submission path (recorded through
the now-retired frontend write path — see design doc §5 — which had no
concept of a product or a batch).

What this script does
----------------------
For every `inventory_waste` document with `sourceType: 'harvest'` and no
`productId` set yet, tries to resolve a `(productId, harvestBatchId)` pair:

    1. Resolve a mother, preferring the source block's product link:
       a. `sourceBlockId` -> `blocks.productMotherId` (only for a live,
          `isActive: True` block — a block that was hard-deleted since the
          waste was recorded, as is the case for the one live row, does not
          resolve this way).
       b. Fall back to matching `inventory_waste.plantName` against
          `plant_mothers.plantName` (case-insensitive, `deletedAt: null`) —
          this is the reliable path when the source block no longer exists.
    2. Within the resolved mother's `products[]`, prefer a product whose
       `name` matches `plantName` (case-insensitive); fall back to the
       mother's first active sellable product.
    3. If a product resolves: set `productId` to it, and set
       `harvestBatchId` to a DETERMINISTIC id derived from the waste row's
       own id — `uuid.uuid5(uuid.NAMESPACE_OID, f"legacy-waste:{wasteId}")`
       — so a re-run always recomputes the identical value. The two fields
       are set together; a row that cannot resolve a product is left with
       both null (same "legacy rows keep null, not backfilled" treatment as
       block_harvests' new fields — see design doc §4.2/§8 step 4) and
       logged as a warning, never as a fatal error.

Idempotency
-----------
Gated on `productId` not already being set: a document that already carries
one (whether from a prior run of this script, or written directly by the
new batch-submission path going forward) is skipped entirely. Re-running
after a successful --execute is therefore always a no-op.

This script follows the plant_library_default_product_migration.py pattern:
--dry-run by default (--execute to write), per-document logging, unresolvable
data logged as a warning and skipped (never fatal), and a summary at the end.
It only ever writes `productId`/`harvestBatchId` via `$set` on
`inventory_waste` — no other field on any document is touched, and no other
collection is written to (blocks/plant_mothers are read-only lookups here).

Usage
-----
    # Dry run — the SAFE, DEFAULT behavior. No flags, or --dry-run
    # explicitly, both log what WOULD change without writing anything.
    docker compose exec api python scripts/migrations/plant_library_harvest_routing_migration.py
    docker compose exec api python scripts/migrations/plant_library_harvest_routing_migration.py --dry-run

    # Real run — requires the explicit --execute flag:
    docker compose exec api python scripts/migrations/plant_library_harvest_routing_migration.py --execute

Environment variables
---------------------
    MONGODB_URL      — full connection string (with credentials), e.g.
                        mongodb://user:pass@localhost:27017/a64core_db?authSource=a64core_db
                        Falls back to mongodb://localhost:27017 if unset.
    MONGODB_DB_NAME  — defaults to a64core_db
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import uuid
from typing import Any, Dict, Optional

from motor.motor_asyncio import AsyncIOMotorClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

MIGRATION_SYSTEM_LABEL = "system:plant_library_harvest_routing_migration"


def harvest_batch_id_for_waste_row(waste_id: Any) -> uuid.UUID:
    """
    Deterministic harvestBatchId for a migrated legacy waste row, derived
    from the row's own wasteId — stable across re-runs: the same waste row
    always produces the same batch id, so a reissued run never mints a
    second, different id for what is conceptually the same migrated row.
    """
    return uuid.uuid5(uuid.NAMESPACE_OID, f"legacy-waste:{waste_id}")


def _find_product_for_name(
    mother: Dict[str, Any], plant_name: str
) -> Optional[Dict[str, Any]]:
    """
    Within `mother["products"]`, prefer a product whose name matches
    `plant_name` case-insensitively; fall back to the mother's first active
    sellable product. Returns None if neither exists.
    """
    products = mother.get("products") or []
    normalized = (plant_name or "").strip().lower()

    for product in products:
        if str(product.get("name", "")).strip().lower() == normalized:
            return product

    for product in products:
        if product.get("isActive") and product.get("category") == "sellable":
            return product

    return None


async def _resolve_mother(db, waste_doc: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Resolve a plant_mothers document for `waste_doc`, preferring the source
    block's product link and falling back to a plantName match. Returns
    None if neither resolves.
    """
    source_block_id = waste_doc.get("sourceBlockId")
    if source_block_id:
        block = await db.blocks.find_one({"blockId": source_block_id, "isActive": True})
        if block and block.get("productMotherId"):
            mother = await db.plant_mothers.find_one(
                {"plantMotherId": block["productMotherId"], "deletedAt": None}
            )
            if mother:
                return mother

    plant_name = waste_doc.get("plantName")
    if not plant_name:
        return None

    return await db.plant_mothers.find_one(
        {
            "plantName": {"$regex": f"^{plant_name}$", "$options": "i"},
            "deletedAt": None,
        }
    )


async def _migrate_waste_routing(db, dry_run: bool) -> Dict[str, Any]:
    waste_coll = db["inventory_waste"]

    stats: Dict[str, Any] = {
        "migrated": 0,
        "skipped_already_migrated": 0,
        "skipped_not_harvest_sourced": 0,
        "warnings": 0,
        "warning_details": [],
    }

    cursor = waste_coll.find({"sourceType": "harvest"})
    async for waste_doc in cursor:
        waste_id = waste_doc.get("wasteId")
        plant_name = waste_doc.get("plantName")

        # Idempotency guard: a productId already set (whether from a prior
        # run of this script, or from the live batch-submission path)
        # skips this row entirely.
        if waste_doc.get("productId"):
            stats["skipped_already_migrated"] += 1
            logger.info(
                "waste row %s (%s) already has productId — skipped",
                waste_id,
                plant_name,
            )
            continue

        mother = await _resolve_mother(db, waste_doc)
        if not mother:
            stats["warnings"] += 1
            detail = (
                f"waste row {waste_id} ({plant_name}) — could not resolve a "
                "mother via sourceBlockId or plantName match; left "
                "unmigrated (productId/harvestBatchId stay null)"
            )
            stats["warning_details"].append(detail)
            logger.warning(detail)
            continue

        product = _find_product_for_name(mother, plant_name)
        if not product:
            stats["warnings"] += 1
            detail = (
                f"waste row {waste_id} ({plant_name}) — mother "
                f"'{mother.get('plantName')}' ({mother.get('plantMotherId')}) "
                "has no matching or active sellable product; left "
                "unmigrated (productId/harvestBatchId stay null)"
            )
            stats["warning_details"].append(detail)
            logger.warning(detail)
            continue

        product_id = product["productId"]
        batch_id = harvest_batch_id_for_waste_row(waste_id)

        if dry_run:
            stats["migrated"] += 1
            logger.info(
                "[DRY RUN] would set productId=%s (product=%s), "
                "harvestBatchId=%s on waste row %s (%s), resolved via "
                "mother %s",
                product_id,
                product.get("name"),
                batch_id,
                waste_id,
                plant_name,
                mother.get("plantName"),
            )
            continue

        result = await waste_coll.update_one(
            {"wasteId": waste_id, "productId": None},
            {
                "$set": {
                    "productId": product_id,
                    "harvestBatchId": str(batch_id),
                }
            },
        )

        if result.matched_count == 0:
            # Reason: lost a race against a concurrent writer (e.g. the
            # productId got set between this document's read and this
            # update). Out of scope for a one-shot migration to resolve —
            # log and move on; a re-run sees the now-set productId and
            # skips via the idempotency guard above.
            stats["warnings"] += 1
            detail = (
                f"waste row {waste_id} ({plant_name}) no longer matched the "
                "productId:null filter at write time (concurrent update?) "
                "— not overwritten, re-run to confirm final state"
            )
            stats["warning_details"].append(detail)
            logger.warning(detail)
            continue

        stats["migrated"] += 1
        logger.info(
            "migrated waste row %s (%s): productId=%s (product=%s), "
            "harvestBatchId=%s",
            waste_id,
            plant_name,
            product_id,
            product.get("name"),
            batch_id,
        )

    return stats


async def run_migration(dry_run: bool = True) -> Dict[str, Any]:
    """
    Backfill productId/harvestBatchId onto harvest-sourced inventory_waste
    rows predating the multi-line harvest submission.

    Args:
        dry_run: When True (the default), no writes are made — the summary
            still reflects exactly what a real run would do.

    Raises:
        RuntimeError: If MongoDB connection fails.
    """
    mongo_url = os.environ.get("MONGODB_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("MONGODB_DB_NAME", "a64core_db")

    client = AsyncIOMotorClient(mongo_url)
    try:
        db = client[db_name]

        logger.info(
            "plant_library_harvest_routing_migration: starting (dry_run=%s) "
            "against db=%s",
            dry_run,
            db_name,
        )

        stats = await _migrate_waste_routing(db, dry_run)

        return {"dry_run": dry_run, "waste": stats}
    finally:
        client.close()


def _print_summary(summary: Dict[str, Any]) -> None:
    mode = (
        "DRY RUN (no writes made)" if summary["dry_run"] else "EXECUTED (writes made)"
    )
    print(f"plant_library_harvest_routing_migration: {mode}")
    print()

    w = summary["waste"]
    print("inventory_waste (harvest-sourced rows -> productId/harvestBatchId):")
    print(f"  migrated:                     {w['migrated']}")
    print(f"  skipped (already migrated):   {w['skipped_already_migrated']}")
    print(f"  warnings:                     {w['warnings']}")
    if w["warning_details"]:
        print("  warning details:")
        for detail in w["warning_details"]:
            print(f"    - {detail}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Plant Library Product Extension Stage 3 — backfill "
            "productId/harvestBatchId onto harvest-sourced inventory_waste "
            "rows recorded before the multi-line harvest submission existed."
        )
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help=(
            "Actually write changes. Without this flag, the script ALWAYS "
            "runs in dry-run mode (the default) and only logs what WOULD "
            "change."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help=(
            "Explicit alias for the default (no-write) behavior. Identical "
            "to omitting --execute; provided for discoverability."
        ),
    )
    args = parser.parse_args()

    dry_run = not args.execute

    summary = asyncio.run(run_migration(dry_run=dry_run))
    _print_summary(summary)


if __name__ == "__main__":
    main()
