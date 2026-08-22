"""
Plant Library Product Extension — default-product seeding migration.

Design doc: Docs/2-Working-Progress/plant-library-product-extension-design.md
§8 step 1, pulled forward from Stage 5 at the user's request. Reasoning:
without at least one product per mother, a block cannot record a harvest at
all, because the harvest picklist (Stage 5) resolves live from
`block.productMotherId` -> mother `products[]` — an empty array means an
empty picklist, so harvesting is blocked until someone manually adds a
product through a UI that does not exist yet.

What this script does
----------------------
For every `plant_mothers` document with `deletedAt: null`, seed exactly ONE
`PlantProduct` (see src/modules/farm_manager/models/plant_mother.py — this
script reuses that model directly rather than re-declaring its shape):

    name        = the mother's own plantName   (e.g. "Potato" -> "Potato")
    category    = ProductCategory.SELLABLE
    unit        = ProductUnit.KG
    isActive    = True
    productId   = uuid.uuid5(uuid.NAMESPACE_OID, str(plantMotherId))

Gating and idempotency
-----------------------
Gated on `deletedAt: null` ONLY — same reasoning as
plant_library_mother_variety_migration.py: `isActive` only gates whether a
mother shows up in planting dropdowns for NEW plantings; it does not mean
the mother's products are irrelevant, so an inactive-but-not-deleted mother
still gets seeded.

**Idempotency is at the MOTHER level, not the product level**: a mother
that already has ANY product (`len(products) > 0`) is SKIPPED ENTIRELY, not
appended to and not reconciled. This is deliberate and matches the task's
explicit requirement — once a mother has products (whether seeded by this
script or added later by a human through the products editor UI that is
being built concurrently), this script never touches that mother's
`products` array again. Re-running the script after a successful full run
is therefore always a no-op: N mothers skipped, 0 seeded.

The product id IS still deterministic (uuid5 of the mother id) so that if a
mother is somehow reset to `products: []` and the script runs again, it
reissues the exact same id rather than a new random one — but the primary
idempotency guard is "does this mother already have products", checked
before that id is ever computed for a write decision.

This script follows the plant_library_mother_variety_migration.py pattern:
--dry-run by default (--execute to write), per-document logging,
unresolvable/odd data logged as a warning and skipped (never fatal), and a
summary at the end. It only ever writes to `plant_mothers.products` via
`$set` — no other field on any document is read for a value that gets
mutated, and no other collection is touched.

Usage
-----
    # Dry run — the SAFE, DEFAULT behavior. No flags, or --dry-run
    # explicitly, both log what WOULD change without writing anything.
    # Matches the invocation convention of the reference migration
    # (plant_library_mother_variety_migration.py) and wave4's:
    docker compose exec api python scripts/migrations/plant_library_default_product_migration.py
    docker compose exec api python scripts/migrations/plant_library_default_product_migration.py --dry-run

    # Real run — requires the explicit --execute flag:
    docker compose exec api python scripts/migrations/plant_library_default_product_migration.py --execute

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
from datetime import datetime
from typing import Any, Dict

from motor.motor_asyncio import AsyncIOMotorClient

from src.modules.farm_manager.models.plant_mother import (
    PlantProduct,
    ProductCategory,
    ProductUnit,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

MIGRATION_SYSTEM_LABEL = "system:plant_library_default_product_migration"


def product_id_for_mother(mother_id: Any) -> uuid.UUID:
    """
    Deterministic product id for a mother's seeded default product, derived
    from the mother's own plantMotherId.

    uuid.uuid5(uuid.NAMESPACE_OID, str(mother_id)) — stable across re-runs:
    the same mother id always produces the same seeded product id, so a
    reissued run (should the mother's products array ever be reset) never
    mints a second, different id for what is conceptually the same seeded
    product. `mother_id` is accepted as `Any` (str or UUID) and coerced via
    str() to work identically regardless of how the caller obtained it.
    """
    return uuid.uuid5(uuid.NAMESPACE_OID, str(mother_id))


async def _seed_default_products(db, dry_run: bool) -> Dict[str, Any]:
    mother_coll = db["plant_mothers"]

    stats: Dict[str, Any] = {
        "seeded": 0,
        "skipped_already_has_products": 0,
        "warnings": 0,
        "warning_details": [],
    }

    cursor = mother_coll.find({"deletedAt": None})
    async for mother in cursor:
        mother_id = mother.get("plantMotherId")
        plant_name = mother.get("plantName")

        # Idempotency guard: ANY existing product on this mother skips it
        # entirely — never appended to, never reconciled.
        existing_products = mother.get("products") or []
        if len(existing_products) > 0:
            stats["skipped_already_has_products"] += 1
            logger.info(
                "mother %s (%s) already has %d product(s) — skipped",
                mother_id,
                plant_name,
                len(existing_products),
            )
            continue

        if not plant_name or not str(plant_name).strip():
            # Reason: PlantProduct.name requires min_length=1 — a mother
            # with a blank/missing plantName cannot get a valid seeded
            # product name. Log and skip rather than crash; this should be
            # unreachable per PlantMotherBase's own validation, but the
            # migration must never assume that at the DB layer.
            stats["warnings"] += 1
            detail = (
                f"mother {mother_id} has no usable plantName "
                f"({plant_name!r}) — cannot seed a default product, skipped"
            )
            stats["warning_details"].append(detail)
            logger.warning(detail)
            continue

        if mother.get("organizationId") is None:
            # Reason: not fatal — the task explicitly notes one mother has
            # organizationId: null and instructs to log and proceed, not
            # block. Seeding a product does not depend on org scope.
            logger.warning(
                "mother %s (%s) has organizationId: null — proceeding anyway",
                mother_id,
                plant_name,
            )

        product_id = product_id_for_mother(mother_id)

        # Reuse the real model — construction also re-validates name length
        # / enum membership rather than trusting a hand-built dict.
        product = PlantProduct(
            productId=product_id,
            name=str(plant_name),
            unit=ProductUnit.KG,
            category=ProductCategory.SELLABLE,
            isActive=True,
        )
        product_dict = product.model_dump()
        product_dict["productId"] = str(product_dict["productId"])

        if dry_run:
            stats["seeded"] += 1
            logger.info(
                "[DRY RUN] would seed product %s (name=%s, category=%s, "
                "unit=%s) onto mother %s (%s)",
                product_id,
                product.name,
                product.category.value,
                product.unit.value,
                mother_id,
                plant_name,
            )
            continue

        now = datetime.utcnow()
        # Reason: filter re-checks deletedAt: null AND products empty at
        # write time — guards against a concurrent writer having added a
        # product between this document's read and this update (e.g. the
        # products-editor UI being built concurrently). If that race has
        # happened, matched_count is 0 and we do not overwrite their write.
        result = await mother_coll.update_one(
            {
                "plantMotherId": mother_id,
                "deletedAt": None,
                "$or": [
                    {"products": {"$exists": False}},
                    {"products": {"$size": 0}},
                ],
            },
            {
                "$set": {
                    "products": [product_dict],
                    "updatedAt": now,
                }
            },
        )

        if result.matched_count == 0:
            # Reason: lost the race described above — re-fetch-worthy but
            # out of scope for a one-shot migration; log as a warning so a
            # re-run (which will see the now-nonempty products array and
            # skip) is the documented recovery path.
            stats["warnings"] += 1
            detail = (
                f"mother {mother_id} ({plant_name}) no longer matched the "
                f"empty-products filter at write time (concurrent update?) "
                f"— not overwritten, re-run to confirm final state"
            )
            stats["warning_details"].append(detail)
            logger.warning(detail)
            continue

        stats["seeded"] += 1
        logger.info(
            "seeded product %s (name=%s, category=%s, unit=%s) onto "
            "mother %s (%s)",
            product_id,
            product.name,
            product.category.value,
            product.unit.value,
            mother_id,
            plant_name,
        )

    return stats


async def run_migration(dry_run: bool = True) -> Dict[str, Any]:
    """
    Seed one default sellable product per non-deleted plant mother.

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
            "plant_library_default_product_migration: starting (dry_run=%s) "
            "against db=%s",
            dry_run,
            db_name,
        )

        stats = await _seed_default_products(db, dry_run)

        return {"dry_run": dry_run, "products": stats}
    finally:
        client.close()


def _print_summary(summary: Dict[str, Any]) -> None:
    mode = "DRY RUN (no writes made)" if summary["dry_run"] else "EXECUTED (writes made)"
    print(f"plant_library_default_product_migration: {mode}")
    print()

    p = summary["products"]
    print("Mothers (plant_mothers.products default-product seeding):")
    print(f"  seeded:                          {p['seeded']}")
    print(f"  skipped (already has products):  {p['skipped_already_has_products']}")
    print(f"  warnings:                        {p['warnings']}")
    if p["warning_details"]:
        print("  warning details:")
        for detail in p["warning_details"]:
            print(f"    - {detail}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Plant Library Product Extension — seed exactly one sellable "
            "'kg' product per non-deleted plant_mothers document, named "
            "after the mother's plantName, so blocks can record harvests "
            "without manual product setup."
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
