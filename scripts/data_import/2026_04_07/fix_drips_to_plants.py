"""
fix_drips_to_plants.py — One-shot live fix for the drips ≠ plants bug.

Background:
    Stage 2 and stage 3 stored the supabase 'drips' count directly as
    maxPlants / actualPlantCount on blocks.  This is wrong — each drip holds
    multiple seeds per the crop's seedsPerDrip value in standard_planning.

Fix 1 — Virtual blocks (167 docs):
    For each virtual block from the supabase migration:
      drips = current maxPlants   (was stored raw)
      plants = drips * seedsPerDrip
      predictedYieldKg = drips * netYieldPerDripKg
    Write the corrected values + audit metadata.
    Idempotency guard: skip if metadata.dripsToPlantsConverted == True.

Fix 2 — Physical blocks (269 docs):
    Physical blocks have no crop assigned so we can only preserve the drip
    count as a baseline reference.  maxPlants is left unchanged (conservative
    1:1 drip baseline until a crop is assigned and real plant count is known).
    Idempotency guard: skip if metadata.physicalBlockDripsBaseline == True.

Constraints:
    - Do NOT touch archives, harvests, or plant_data_enhanced.
    - Do NOT touch PC Farm (farmId = 23d67318-415e-49bf-a2b6-515b38974bde).
    - Idempotent — safe to re-run; flags prevent double-conversion.

Run:  python fix_drips_to_plants.py [--dry-run]
"""

from __future__ import annotations

import argparse
import csv
import logging
import sys
from collections import defaultdict
from pathlib import Path
from typing import Optional

# Allow running from this directory directly
sys.path.insert(0, str(Path(__file__).parent))

from common import (
    CSV_DIR,
    MIGRATION_TAG,
    PC_FARM_UUID,
    get_db,
    make_logger,
    utcnow,
)

STAGE = "fix_drips_to_plants"

# ---------------------------------------------------------------------------
# CSV loaders — reads directly from standard_planning CSV, NOT plant_data_enhanced
# ---------------------------------------------------------------------------


def load_seeds_and_yield_maps() -> tuple[dict[str, int], dict[str, float]]:
    """
    Load seedsPerDrip and NetYieldPerDripkg from standard_planning_rows.csv.

    Keyed by lower-stripped crop name for case-insensitive lookup.

    Returns:
        Tuple of (seeds_map, yield_map) where:
          seeds_map[crop_lower] = int seedsPerDrip
          yield_map[crop_lower] = float netYieldPerDripKg

    Raises:
        FileNotFoundError: if the CSV is missing
        ValueError: if required columns are absent
    """
    path = CSV_DIR / "standard_planning_rows.csv"
    seeds_map: dict[str, int] = {}
    yield_map: dict[str, float] = {}

    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        required = {"Item", "seedsPerDrip", "NetYieldPerDripkg"}
        if not required.issubset(set(reader.fieldnames or [])):
            missing_cols = required - set(reader.fieldnames or [])
            raise ValueError(
                f"standard_planning_rows.csv missing required columns: {missing_cols}"
            )
        for row in reader:
            item = row["Item"].strip()
            if not item:
                continue
            key = item.lower()
            try:
                seeds_map[key] = int(row["seedsPerDrip"])
            except (ValueError, TypeError):
                seeds_map[key] = 1  # safe fallback
            try:
                yield_map[key] = float(row["NetYieldPerDripkg"])
            except (ValueError, TypeError):
                yield_map[key] = 0.0

    return seeds_map, yield_map


# ---------------------------------------------------------------------------
# Fix 1: Virtual blocks
# ---------------------------------------------------------------------------


def fix_virtual_blocks(
    db,
    seeds_map: dict[str, int],
    yield_map: dict[str, float],
    dry_run: bool,
    logger: logging.Logger,
) -> dict:
    """
    Apply the drips-to-plants correction to all live virtual blocks from the
    supabase migration (blockCategory='virtual',
    metadata.migratedFrom='supabase_2026_04_07').

    For each block:
      - drips  = current maxPlants  (was stored as raw drip count)
      - plants = drips * seedsPerDrip
      - predictedYieldKg = drips * netYieldPerDripKg

    Args:
        db: pymongo Database
        seeds_map: crop_lower → seedsPerDrip
        yield_map: crop_lower → netYieldPerDripKg
        dry_run: if True, compute but do not write
        logger: stage logger

    Returns:
        result dict with counters and sample data
    """
    query = {
        "blockCategory": "virtual",
        "metadata.migratedFrom": MIGRATION_TAG,
        # Reason: exclude PC Farm from all migration fixes
        "farmId": {"$ne": PC_FARM_UUID},
    }

    total = db.blocks.count_documents(query)
    logger.info(f"Virtual blocks found (excl. PC Farm): {total}")

    converted = 0
    skipped_idempotent = 0
    skipped_no_crop = 0
    skipped_crop_not_found = 0
    errors = 0

    # Track multiplier distribution: seedsPerDrip value → count
    multiplier_dist: dict[int, int] = defaultdict(int)

    # Collect before/after samples (first 5 successfully converted)
    samples: list[dict] = []

    before_snapshot: list[dict] = []

    for doc in db.blocks.find(query):
        block_code = doc.get("blockCode", "?")

        # Idempotency: already converted
        if doc.get("metadata", {}).get("dripsToPlantsConverted") is True:
            skipped_idempotent += 1
            continue

        crop_name = (doc.get("targetCropName") or "").strip()
        if not crop_name:
            logger.warning(
                f"Virtual block {block_code}: no targetCropName — skipping"
            )
            skipped_no_crop += 1
            continue

        crop_lower = crop_name.lower()

        # Lookup seeds and yield from CSV maps
        if crop_lower not in seeds_map:
            logger.warning(
                f"Virtual block {block_code}: crop '{crop_name}' not found in "
                f"standard_planning CSV — skipping (will not convert)"
            )
            skipped_crop_not_found += 1
            continue

        seeds_per_drip: int = seeds_map[crop_lower]
        net_yield_per_drip_kg: float = yield_map.get(crop_lower, 0.0)

        # The current maxPlants IS the raw drip count (the bug)
        drips: int = int(doc.get("maxPlants") or 0)
        if drips <= 0:
            logger.warning(
                f"Virtual block {block_code}: maxPlants={drips} <= 0, "
                f"cannot compute new plant count — skipping"
            )
            errors += 1
            continue

        new_plants: int = drips * seeds_per_drip
        new_predicted_yield_kg: float = round(drips * net_yield_per_drip_kg, 3)

        # Capture before state for sample reporting
        if len(samples) < 5:
            before_snapshot.append({
                "blockCode": block_code,
                "crop": crop_name,
                "drips": drips,
                "seedsPerDrip": seeds_per_drip,
                "netYieldPerDripKg": net_yield_per_drip_kg,
                "old_maxPlants": drips,
                "new_maxPlants": new_plants,
                "new_predictedYieldKg": new_predicted_yield_kg,
            })

        multiplier_dist[seeds_per_drip] += 1

        if not dry_run:
            try:
                db.blocks.update_one(
                    {"_id": doc["_id"]},
                    {
                        "$set": {
                            "maxPlants": new_plants,
                            "actualPlantCount": new_plants,
                            "kpi.predictedYieldKg": new_predicted_yield_kg,
                            "metadata.totalDrips": drips,
                            "metadata.seedsPerDripUsed": seeds_per_drip,
                            "metadata.netYieldPerDripKgUsed": net_yield_per_drip_kg,
                            "metadata.dripsToPlantsConverted": True,
                            "updatedAt": utcnow(),
                        }
                    },
                )
                converted += 1
            except Exception as exc:
                logger.error(
                    f"Virtual block update failed {block_code} "
                    f"(id={doc['_id']}): {exc}"
                )
                errors += 1
        else:
            # Dry-run: count as converted but don't write
            converted += 1
            logger.debug(
                f"  [DRY-RUN] {block_code}: drips={drips} × "
                f"seedsPerDrip={seeds_per_drip} → plants={new_plants}, "
                f"yield={new_predicted_yield_kg}kg"
            )

    return {
        "total_found": total,
        "converted": converted,
        "skipped_idempotent": skipped_idempotent,
        "skipped_no_crop": skipped_no_crop,
        "skipped_crop_not_found": skipped_crop_not_found,
        "errors": errors,
        "multiplier_dist": dict(sorted(multiplier_dist.items())),
        "samples": before_snapshot,
    }


# ---------------------------------------------------------------------------
# Fix 2: Physical blocks
# ---------------------------------------------------------------------------


def fix_physical_blocks(
    db,
    dry_run: bool,
    logger: logging.Logger,
) -> dict:
    """
    Record the drip-count baseline on physical blocks from the migration.

    For each physical block:
      - metadata.totalDrips = current maxPlants  (preserve drip count reference)
      - maxPlants is left unchanged (no crop assigned, conservative 1:1 baseline)
      - metadata.physicalBlockDripsBaseline = True  (idempotency flag)

    Args:
        db: pymongo Database
        dry_run: if True, compute but do not write
        logger: stage logger

    Returns:
        result dict with counters
    """
    query = {
        "blockCategory": "physical",
        "metadata.migratedFrom": MIGRATION_TAG,
        # Reason: exclude PC Farm from all migration fixes
        "farmId": {"$ne": PC_FARM_UUID},
    }

    total = db.blocks.count_documents(query)
    logger.info(f"Physical blocks found (excl. PC Farm): {total}")

    processed = 0
    skipped_idempotent = 0
    errors = 0

    for doc in db.blocks.find(query):
        block_code = doc.get("blockCode", "?")

        # Idempotency: already baselined
        if doc.get("metadata", {}).get("physicalBlockDripsBaseline") is True:
            skipped_idempotent += 1
            continue

        # The current maxPlants holds the drip count (no crop assigned,
        # so we cannot multiply — preserve as totalDrips reference only)
        current_max_plants = doc.get("maxPlants", 0)

        if not dry_run:
            try:
                db.blocks.update_one(
                    {"_id": doc["_id"]},
                    {
                        "$set": {
                            # Reason: preserve drip count for future reference
                            # when a crop is eventually assigned to this block
                            "metadata.totalDrips": current_max_plants,
                            "metadata.physicalBlockDripsBaseline": True,
                            "updatedAt": utcnow(),
                        }
                    },
                )
                processed += 1
            except Exception as exc:
                logger.error(
                    f"Physical block update failed {block_code} "
                    f"(id={doc['_id']}): {exc}"
                )
                errors += 1
        else:
            processed += 1
            logger.debug(
                f"  [DRY-RUN] {block_code}: would set "
                f"metadata.totalDrips={current_max_plants}, "
                f"physicalBlockDripsBaseline=True"
            )

    return {
        "total_found": total,
        "processed": processed,
        "skipped_idempotent": skipped_idempotent,
        "errors": errors,
    }


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def print_report(
    virtual_result: dict,
    physical_result: dict,
    dry_run: bool,
    logger: logging.Logger,
) -> None:
    """
    Print a structured report of the fix results.

    Args:
        virtual_result: result dict from fix_virtual_blocks
        physical_result: result dict from fix_physical_blocks
        dry_run: whether this was a dry-run
        logger: stage logger
    """
    prefix = "[DRY-RUN] " if dry_run else ""

    logger.info("")
    logger.info("=" * 70)
    logger.info(f"  {prefix}FIX REPORT: fix_drips_to_plants")
    logger.info("=" * 70)

    logger.info("")
    logger.info("  ── VIRTUAL BLOCKS (Fix 1) ──────────────────────────────────")
    logger.info(f"  Total found (excl. PC Farm): {virtual_result['total_found']}")
    logger.info(f"  Converted:                   {virtual_result['converted']}")
    logger.info(f"  Skipped (idempotent):        {virtual_result['skipped_idempotent']}")
    logger.info(f"  Skipped (no crop name):      {virtual_result['skipped_no_crop']}")
    logger.info(f"  Skipped (crop not in CSV):   {virtual_result['skipped_crop_not_found']}")
    logger.info(f"  Errors:                      {virtual_result['errors']}")

    logger.info("")
    logger.info("  ── MULTIPLIER DISTRIBUTION ─────────────────────────────────")
    for mult, count in sorted(virtual_result["multiplier_dist"].items()):
        logger.info(f"  seedsPerDrip={mult}x : {count} block(s)")

    logger.info("")
    logger.info("  ── BEFORE/AFTER SAMPLES (first 5 converted) ───────────────")
    for s in virtual_result["samples"]:
        logger.info(
            f"  {s['blockCode']} | crop='{s['crop']}' | "
            f"drips={s['drips']} × seeds={s['seedsPerDrip']} "
            f"→ plants={s['new_maxPlants']} | "
            f"yield={s['new_predictedYieldKg']}kg "
            f"(netYield/drip={s['netYieldPerDripKg']})"
        )

    logger.info("")
    logger.info("  ── PHYSICAL BLOCKS (Fix 2) ─────────────────────────────────")
    logger.info(f"  Total found (excl. PC Farm): {physical_result['total_found']}")
    logger.info(f"  Baselined:                   {physical_result['processed']}")
    logger.info(f"  Skipped (idempotent):        {physical_result['skipped_idempotent']}")
    logger.info(f"  Errors:                      {physical_result['errors']}")

    total_errors = virtual_result["errors"] + physical_result["errors"]
    logger.info("")
    if total_errors > 0:
        logger.warning(f"  WARNINGS: {total_errors} error(s) encountered — review log.")
    else:
        logger.info("  All operations completed without errors.")

    logger.info("=" * 70)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def run(dry_run: bool) -> None:
    """
    Main entry point.

    Args:
        dry_run: if True, compute and report without writing to MongoDB
    """
    logger = make_logger(STAGE)
    db = get_db()

    logger.info(f"{'[DRY-RUN] ' if dry_run else ''}Starting fix_drips_to_plants...")
    logger.info(f"Connecting to MongoDB...")
    logger.info(f"PC Farm excluded: {PC_FARM_UUID}")

    # Load lookup maps from supabase CSV
    logger.info("Loading seeds and yield maps from standard_planning_rows.csv...")
    seeds_map, yield_map = load_seeds_and_yield_maps()
    logger.info(
        f"Maps loaded: {len(seeds_map)} crops with seedsPerDrip, "
        f"{len(yield_map)} crops with netYieldPerDripKg"
    )

    # Fix 1: Virtual blocks
    logger.info("")
    logger.info("── Fix 1: Virtual blocks ──────────────────────────────────────")
    virtual_result = fix_virtual_blocks(db, seeds_map, yield_map, dry_run, logger)

    # Fix 2: Physical blocks
    logger.info("")
    logger.info("── Fix 2: Physical blocks ─────────────────────────────────────")
    physical_result = fix_physical_blocks(db, dry_run, logger)

    # Report
    print_report(virtual_result, physical_result, dry_run, logger)

    # Exit non-zero if any errors
    total_errors = virtual_result["errors"] + physical_result["errors"]
    if total_errors > 0:
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Fix: correct drips→plants conversion for virtual blocks, "
                    "baseline physical blocks with drip counts."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute and report without writing to MongoDB",
    )
    args = parser.parse_args()
    run(dry_run=args.dry_run)
