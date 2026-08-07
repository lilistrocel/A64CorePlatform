"""
Plant Library Phase 1 — Mother/Variety hierarchy migration.

Introduces the two-level Plant Library hierarchy:

    mother  (plant_mothers, NEW collection)  = the product/SKU. Harvest,
        inventory, and sales roll up here, so it's one "Cabbage" product
        rather than one line item per variety.
    variety (plant_data_enhanced, EXISTING)  = the cultivation recipe. A
        block is planted with a variety and reads ALL growing data
        (density, fertigation, yield, waste %) from it. Meaning UNCHANGED
        by this migration.

A block carries BOTH: `targetCrop` (existing field) = the variety, UNCHANGED
meaning, AND a new denormalized `productMotherId`/`productName` = the
mother. `block_archives` mirrors the same pair.

This script performs THREE idempotent steps, in order:

  1. Mother backfill — for every variety (`plant_data_enhanced` document)
     with `deletedAt: null`, create (or re-link to) a `plant_mothers`
     document and set the variety's `motherPlantId` + `varietyName`.

     NOTE on "active": PlantDataEnhanced.isActive only gates whether a
     variety shows up in planting dropdowns for NEW plantings — it is
     independent of soft-delete (deletedAt) and does NOT mean the variety
     is unused (existing blocks may still reference an isActive=False
     variety via targetCrop). This step therefore gates on `deletedAt: null`
     ONLY, not isActive, so every non-deleted variety — active or not —
     gets a resolvable mother.

     The mother id is DETERMINISTIC:

         uuid.uuid5(uuid.NAMESPACE_OID, str(variety["plantDataId"]))

     Re-running this script therefore always resolves to the SAME mother
     id for the same variety, so mothers are never duplicated even if the
     script is interrupted and restarted, or run out of order relative to
     steps 2/3. `plantDataId` on the variety itself is NEVER read as
     mutable, written to, or reissued anywhere in this script.

     `plantType` on the new mother is INFERRED from the variety's `tags`
     array — see TAG_PLANT_TYPE_PRECEDENCE / infer_plant_type_from_tags()
     below (standalone, unit-tested, importable). Defaults to 'crop' when
     no tag matches.

     Skipped (idempotent) when the variety already has `motherPlantId` set.

  2. Block backfill — for every document in `blocks` with a non-null
     `targetCrop`, resolve it to its owning mother and set:

         block.productMotherId = <mother id>
         block.productName     = <mother's plantName>

     Resolution: look up the variety by `plantDataId == targetCrop` in
     `plant_data_enhanced` (WITHOUT a deletedAt filter — a block can
     reference a variety that has since been soft-deleted, and the variety
     doc having ever existed is what "known" means here). If found, the
     mother id is RECOMPUTED via the same uuid5 scheme directly from
     `targetCrop` — NOT read from the variety's `motherPlantId` field. This
     is the more robust of the two options: it produces the correct,
     idempotent-consistent mother id even if step 1 has not run yet, was
     interrupted, or the variety doc's own `motherPlantId` field is for any
     reason stale — the uuid5 formula is a pure function of `targetCrop`
     alone, so it can never disagree with what step 1 assigns to that same
     variety. `productName` is taken directly from the variety doc's
     `plantName` (denormalized, same pattern as the existing
     `targetCropName`).

     `targetCrop` itself is left completely untouched — it continues to
     mean "the variety".

     Idempotent: skipped when `productMotherId` is already set AND still
     equals the freshly-resolved mother id for the block's CURRENT
     `targetCrop`; re-backfilled (updated) when they differ, which is how a
     changed `targetCrop` since the last run is detected and corrected.

     Blocks whose `targetCrop` does not resolve to any known variety
     document (e.g. a hard-deleted or corrupted historical reference) are
     logged as a warning and skipped — never crash the migration.

  3. Archive backfill — identical logic to step 2, applied to
     `block_archives` (also keyed by `targetCrop`, also unchanged).

`block_harvests` is NEVER read or written by this script. Harvests carry no
plant reference of their own — historical rollups are derived through the
block/archive they belong to, so backfilling blocks and archives is
sufficient; touching 13,947 harvest docs is unnecessary and out of scope.

Idempotent: running this script any number of times, in any mix of
--execute / dry-run invocations, converges to the same end state and never
duplicates a mother or reissues an id.

Usage
-----
    # Dry run — the SAFE, DEFAULT behavior. No flags, or --dry-run
    # explicitly, both log what WOULD change without writing anything:
    docker compose exec api python scripts/migrations/plant_library_mother_variety_migration.py
    docker compose exec api python scripts/migrations/plant_library_mother_variety_migration.py --dry-run

    # Real run — requires the explicit --execute flag:
    docker compose exec api python scripts/migrations/plant_library_mother_variety_migration.py --execute

Environment variables
---------------------
    MONGODB_URL      — defaults to mongodb://localhost:27017
    MONGODB_DB_NAME  — defaults to a64core_db
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tag -> plantType inference (standalone, unit-tested — see
# tests/unit/test_farm_manager/test_plant_library_migration.py)
# ---------------------------------------------------------------------------

# Reuses plant_data_enhanced's existing plantType vocabulary exactly as
# defined in src/modules/farm_manager/models/plant_mother.py
# (PlantMotherTypeLiteral) — not a new enum.
_TAG_TO_PLANT_TYPE: Dict[str, str] = {
    "tree": "tree",
    "herb": "herb",
    "ornamental": "ornamental",
    "medicinal": "medicinal",
    "vegetable": "vegetable",
    "fruit": "fruit",
}

# Precedence when a variety's `tags` array contains MULTIPLE mapped tags
# (e.g. ["fruit", "tree"] for a fruit tree) — first match in this order
# wins. Documented, deterministic tie-break:
#   1. Growth-habit tags ('tree', 'herb') rank highest — they describe the
#      plant's cultivation form, which is the more decision-relevant
#      classification for a product/mother grouping than what part of it
#      is harvested.
#   2. Use-category tags ('ornamental', 'medicinal') rank next — they
#      denote a distinct primary purpose that overrides a generic
#      vegetable/fruit classification.
#   3. 'vegetable' ranks above 'fruit' as the final, arbitrary-but-fixed
#      tie-breaker between the two remaining produce-category tags.
TAG_PLANT_TYPE_PRECEDENCE: List[str] = [
    "tree",
    "herb",
    "ornamental",
    "medicinal",
    "vegetable",
    "fruit",
]

DEFAULT_PLANT_TYPE = "crop"


def infer_plant_type_from_tags(tags: Optional[List[str]]) -> str:
    """
    Infer a plant_mothers.plantType value from a plant_data_enhanced
    variety's `tags` array.

    Case-insensitive match against _TAG_TO_PLANT_TYPE. When multiple mapped
    tags are present, TAG_PLANT_TYPE_PRECEDENCE decides the winner (see
    module docstring / comment above for the documented reasoning). Falls
    back to DEFAULT_PLANT_TYPE ('crop') when `tags` is None, empty, or
    contains no mapped tag.

    Pure function — no I/O — safe to unit test directly.
    """
    if not tags:
        return DEFAULT_PLANT_TYPE

    normalized = {t.strip().lower() for t in tags if t and t.strip()}
    for candidate in TAG_PLANT_TYPE_PRECEDENCE:
        if candidate in normalized:
            return _TAG_TO_PLANT_TYPE[candidate]

    return DEFAULT_PLANT_TYPE


# ---------------------------------------------------------------------------
# Deterministic mother id
# ---------------------------------------------------------------------------


def mother_id_for_variety(variety_plant_data_id: Any) -> uuid.UUID:
    """
    Deterministic mother id for a variety, derived from its plantDataId.

    uuid.uuid5(uuid.NAMESPACE_OID, str(variety_plant_data_id)) — stable
    across re-runs: the same variety plantDataId always produces the same
    mother id, so mothers are never duplicated regardless of run order or
    interruption. `variety_plant_data_id` is accepted as `Any` (str or UUID)
    and coerced via str() so it works identically whether called with a
    variety's own `plantDataId` or a block's `targetCrop` (both mean the
    same variety id).
    """
    return uuid.uuid5(uuid.NAMESPACE_OID, str(variety_plant_data_id))


MIGRATION_SYSTEM_LABEL = "system:plant_library_mother_variety_migration"


# ---------------------------------------------------------------------------
# Step 1 — mother backfill
# ---------------------------------------------------------------------------


async def _backfill_mothers(db, dry_run: bool) -> Dict[str, Any]:
    variety_coll = db["plant_data_enhanced"]
    mother_coll = db["plant_mothers"]

    stats: Dict[str, Any] = {
        "mothers_created": 0,
        "mothers_already_existed": 0,
        "varieties_linked": 0,
        "varieties_already_linked": 0,
        "plant_type_breakdown": {},
    }

    cursor = variety_coll.find({"deletedAt": None})
    async for variety in cursor:
        variety_id = variety["plantDataId"]

        if variety.get("motherPlantId"):
            stats["varieties_already_linked"] += 1
            continue

        mother_id = mother_id_for_variety(variety_id)
        plant_type = infer_plant_type_from_tags(variety.get("tags"))
        stats["plant_type_breakdown"][plant_type] = (
            stats["plant_type_breakdown"].get(plant_type, 0) + 1
        )

        # Reason: read-only existence check is safe to run even in dry-run —
        # it lets the dry-run summary distinguish "would create" from
        # "mother already exists from a prior partial run" without writing.
        existing_mother = await mother_coll.find_one(
            {"plantMotherId": str(mother_id)}
        )

        if dry_run:
            if existing_mother:
                stats["mothers_already_existed"] += 1
                logger.info(
                    "[DRY RUN] mother already exists for variety %s (%s) -> "
                    "mother %s — would link variety only",
                    variety_id,
                    variety.get("plantName"),
                    mother_id,
                )
            else:
                stats["mothers_created"] += 1
                logger.info(
                    "[DRY RUN] would create mother %s (plantName=%s, "
                    "plantType=%s) for variety %s and set "
                    "motherPlantId/varietyName='Standard'",
                    mother_id,
                    variety.get("plantName"),
                    plant_type,
                    variety_id,
                )
            stats["varieties_linked"] += 1
            continue

        now = datetime.utcnow()

        if existing_mother:
            stats["mothers_already_existed"] += 1
        else:
            mother_doc = {
                "plantMotherId": str(mother_id),
                "plantName": variety.get("plantName"),
                "scientificName": variety.get("scientificName"),
                "plantType": plant_type,
                "isActive": True,
                "divisionId": variety.get("divisionId"),
                "organizationId": variety.get("organizationId"),
                "createdBy": None,
                "createdByEmail": MIGRATION_SYSTEM_LABEL,
                "createdAt": now,
                "updatedAt": now,
                "deletedAt": None,
            }
            await mother_coll.insert_one(mother_doc)
            stats["mothers_created"] += 1
            logger.info(
                "created mother %s (plantName=%s, plantType=%s) for "
                "variety %s",
                mother_id,
                variety.get("plantName"),
                plant_type,
                variety_id,
            )

        await variety_coll.update_one(
            {"plantDataId": variety_id},
            {
                "$set": {
                    "motherPlantId": str(mother_id),
                    "varietyName": "Standard",
                    "updatedAt": now,
                }
            },
        )
        stats["varieties_linked"] += 1

    return stats


# ---------------------------------------------------------------------------
# Steps 2 & 3 — block / archive backfill (shared logic; only the collection
# and the id field name differ)
# ---------------------------------------------------------------------------


async def _backfill_target_crop_collection(
    db,
    dry_run: bool,
    *,
    collection_name: str,
    id_field: str,
) -> Dict[str, Any]:
    variety_coll = db["plant_data_enhanced"]
    target_coll = db[collection_name]

    stats: Dict[str, Any] = {
        "backfilled": 0,
        "already_correct": 0,
        "unresolved": 0,
        "unresolved_ids": [],
    }

    # Small in-process cache so repeated targetCrop values (the common case
    # — many blocks share one variety) don't re-query plant_data_enhanced
    # per document.
    resolution_cache: Dict[str, Optional[Dict[str, Any]]] = {}

    cursor = target_coll.find({"targetCrop": {"$ne": None}})
    async for doc in cursor:
        target_crop = doc["targetCrop"]
        doc_id = doc[id_field]

        if target_crop not in resolution_cache:
            variety = await variety_coll.find_one({"plantDataId": target_crop})
            resolution_cache[target_crop] = variety
        variety = resolution_cache[target_crop]

        if variety is None:
            stats["unresolved"] += 1
            stats["unresolved_ids"].append(str(doc_id))
            logger.warning(
                "[%s] %s=%s has targetCrop=%s which does not resolve to any "
                "plant_data_enhanced document — skipped",
                collection_name,
                id_field,
                doc_id,
                target_crop,
            )
            continue

        mother_id = mother_id_for_variety(target_crop)
        mother_name = variety.get("plantName")

        if doc.get("productMotherId") == str(mother_id):
            stats["already_correct"] += 1
            continue

        if dry_run:
            stats["backfilled"] += 1
            logger.info(
                "[DRY RUN][%s] would set %s=%s productMotherId=%s "
                "productName=%s",
                collection_name,
                id_field,
                doc_id,
                mother_id,
                mother_name,
            )
            continue

        await target_coll.update_one(
            {id_field: doc_id},
            {"$set": {"productMotherId": str(mother_id), "productName": mother_name}},
        )
        stats["backfilled"] += 1

    return stats


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


async def run_migration(dry_run: bool = True) -> Dict[str, Any]:
    """
    Run all three backfill steps in order and return a structured summary.

    Args:
        dry_run: When True (the default), no writes are made — every step
            still performs its read-side resolution so the summary reflects
            exactly what a real run would do.

    Raises:
        RuntimeError: If MongoDB connection fails.
    """
    mongo_url = os.environ.get("MONGODB_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("MONGODB_DB_NAME", "a64core_db")

    client = AsyncIOMotorClient(mongo_url)
    try:
        db = client[db_name]

        logger.info(
            "plant_library_mother_variety_migration: starting (dry_run=%s) "
            "against db=%s",
            dry_run,
            db_name,
        )

        mother_stats = await _backfill_mothers(db, dry_run)
        block_stats = await _backfill_target_crop_collection(
            db,
            dry_run,
            collection_name="blocks",
            id_field="blockId",
        )
        archive_stats = await _backfill_target_crop_collection(
            db,
            dry_run,
            collection_name="block_archives",
            id_field="archiveId",
        )

        return {
            "dry_run": dry_run,
            "mothers": mother_stats,
            "blocks": block_stats,
            "archives": archive_stats,
        }
    finally:
        client.close()


def _print_summary(summary: Dict[str, Any]) -> None:
    mode = "DRY RUN (no writes made)" if summary["dry_run"] else "EXECUTED (writes made)"
    print(f"plant_library_mother_variety_migration: {mode}")
    print()

    m = summary["mothers"]
    print("Mothers (plant_mothers backfill from plant_data_enhanced):")
    print(f"  mothers created:            {m['mothers_created']}")
    print(f"  mothers already existed:    {m['mothers_already_existed']}")
    print(f"  varieties linked:           {m['varieties_linked']}")
    print(f"  varieties already linked:   {m['varieties_already_linked']}")
    print("  plantType inference breakdown:")
    for plant_type, count in sorted(m["plant_type_breakdown"].items()):
        print(f"    {plant_type}: {count}")
    print()

    for label, key in (("Blocks", "blocks"), ("Archives", "archives")):
        s = summary[key]
        print(f"{label} (targetCrop -> productMotherId/productName backfill):")
        print(f"  backfilled (created/updated): {s['backfilled']}")
        print(f"  already correct (skipped):    {s['already_correct']}")
        print(f"  unresolved targetCrop:        {s['unresolved']}")
        if s["unresolved_ids"]:
            print(f"    unresolved ids: {', '.join(s['unresolved_ids'])}")
        print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Plant Library Phase 1 — backfill plant_mothers from "
            "plant_data_enhanced, and productMotherId/productName on "
            "blocks/block_archives."
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
