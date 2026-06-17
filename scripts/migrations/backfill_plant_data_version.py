#!/usr/bin/env python3
"""
Backfill Plant-Data Version on Existing Blocks

For every block that has a non-null targetCrop (crop assigned) but a null
plantDataVersion, this migration looks up the CURRENT dataVersion of that
plant_data_enhanced document and writes:
  - plantDataVersion = <current dataVersion>
  - plantDataSnapshot = {plantName, yieldPerPlant, yieldUnit,
                         expectedWastePercentage, totalCycleDays}

Blocks whose targetCrop no longer exists in plant_data_enhanced are skipped
and logged.

Idempotent: only touches blocks where plantDataVersion IS NULL.

Usage:
    # Against dev container (mongodb bridge network alias)
    python scripts/migrations/backfill_plant_data_version.py

    # Dry run (no writes)
    python scripts/migrations/backfill_plant_data_version.py --dry-run

    # Custom connection
    MONGODB_URL=mongodb://localhost:27017 \\
    MONGODB_DB_NAME=a64core_db \\
    python scripts/migrations/backfill_plant_data_version.py
"""

import asyncio
import argparse
import os
import sys
from datetime import datetime
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient


async def run_migration(dry_run: bool = False) -> None:
    """
    Main migration logic.

    Args:
        dry_run: If True, compute and log what would be written but make no
                 database changes.
    """
    mongo_uri = os.getenv("MONGODB_URL") or os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    db_name = os.getenv("MONGODB_DB_NAME") or os.getenv("DATABASE_NAME", "a64core_db")

    print("=" * 60)
    print("Backfill Plant-Data Version on Blocks")
    print("=" * 60)
    if dry_run:
        print("\n[DRY RUN] No changes will be made\n")
    print(f"MongoDB URI : {mongo_uri}")
    print(f"Database    : {db_name}")

    client = AsyncIOMotorClient(mongo_uri)
    db = client[db_name]

    # Only target blocks that have a crop but no version stamp yet (idempotent)
    query = {
        "targetCrop": {"$ne": None, "$exists": True},
        "$or": [
            {"plantDataVersion": None},
            {"plantDataVersion": {"$exists": False}},
        ],
    }

    total_candidates = await db.blocks.count_documents(query)
    print(f"\nBlocks to process: {total_candidates}")

    if total_candidates == 0:
        print("Nothing to do — all eligible blocks already have plantDataVersion set.")
        client.close()
        return

    updated = 0
    skipped_missing_plant = 0
    errors = 0

    from pymongo import UpdateOne

    bulk_ops = []
    BATCH = 500

    async for block_doc in db.blocks.find(query):
        target_crop = block_doc.get("targetCrop")
        if not target_crop:
            continue

        try:
            plant_doc = await db.plant_data_enhanced.find_one(
                {"plantDataId": str(target_crop), "deletedAt": None}
            )

            if plant_doc is None:
                skipped_missing_plant += 1
                print(
                    f"[SKIP] Block {block_doc.get('blockCode', block_doc.get('_id'))} "
                    f"— plant {target_crop} not found"
                )
                continue

            data_version = plant_doc.get("dataVersion", 1)

            # Build snapshot from current plant fields
            yield_info = plant_doc.get("yieldInfo", {}) or {}
            growth_cycle = plant_doc.get("growthCycle", {}) or {}

            snapshot = {
                "plantName": plant_doc.get("plantName"),
                "yieldPerPlant": yield_info.get("yieldPerPlant"),
                "yieldUnit": yield_info.get("yieldUnit"),
                "expectedWastePercentage": yield_info.get("expectedWastePercentage"),
                "totalCycleDays": growth_cycle.get("totalCycleDays"),
            }

            if dry_run:
                print(
                    f"[DRY RUN] Would update block "
                    f"{block_doc.get('blockCode', block_doc.get('_id'))} "
                    f"plantDataVersion={data_version}"
                )
                updated += 1
                continue

            bulk_ops.append(
                UpdateOne(
                    {"_id": block_doc["_id"]},
                    {
                        "$set": {
                            "plantDataVersion": data_version,
                            "plantDataSnapshot": snapshot,
                            "updatedAt": datetime.utcnow(),
                        }
                    },
                )
            )

            if len(bulk_ops) >= BATCH:
                result = await db.blocks.bulk_write(bulk_ops, ordered=False)
                updated += result.modified_count
                bulk_ops = []
                print(f"  ... {updated} records updated so far")

        except Exception as exc:
            errors += 1
            if errors <= 10:
                print(
                    f"[ERROR] Block {block_doc.get('blockCode', block_doc.get('_id'))}: {exc}"
                )

    # Flush remaining batch
    if bulk_ops and not dry_run:
        result = await db.blocks.bulk_write(bulk_ops, ordered=False)
        updated += result.modified_count

    print("\n" + "=" * 60)
    print("Migration Summary")
    print("=" * 60)
    print(f"  Candidates found  : {total_candidates}")
    print(f"  Updated           : {updated}")
    print(f"  Skipped (no plant): {skipped_missing_plant}")
    print(f"  Errors            : {errors}")

    if dry_run:
        print("\n[DRY RUN] No changes were written.")
    else:
        # Verify
        remaining = await db.blocks.count_documents(query)
        print(f"\n[Verify] Blocks still needing migration: {remaining}")
        print("\n[SUCCESS] Migration complete.")

    client.close()


def main() -> None:
    """Entry point with argument parsing."""
    parser = argparse.ArgumentParser(
        description="Backfill plantDataVersion + plantDataSnapshot on existing blocks"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be updated without writing",
    )
    args = parser.parse_args()
    asyncio.run(run_migration(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
