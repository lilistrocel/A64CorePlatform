"""
stage2_farms_blocks.py — Import farms and physical blocks from Supabase CSVs.

Source:
  - block_standard_rows.csv  → farms (distinct farm names) + physical blocks
  - block_standard_rows.type → blockType enum mapping

What this produces:
  - `farms` collection: one doc per distinct farm name (F011, F012, ...)
  - `blocks` collection: one physical block doc per block_standard_rows row
    with blockCategory="physical", legacyBlockCode preserved, fresh blockCode

Idempotency:
  - Farm upsert keyed on metadata.legacyRef (supabase farm_details_ref).
  - Block upsert keyed on metadata.legacyRef (supabase block UUID).
  - Re-runs are safe: replace_one with upsert=True — existing docs overwritten
    with identical data, new docs inserted.
  - After all blocks are upserted the script loops over each farm and sets
    nextBlockSequence = max(blocks.sequenceNumber for that farm) + 1 so the
    counter is always accurate after a re-run.

Run:  python stage2_farms_blocks.py [--dry-run] [--reset]
"""

from __future__ import annotations

import csv
import sys
from collections import defaultdict
from pathlib import Path

# Allow running from scripts/ directly
sys.path.insert(0, str(Path(__file__).parent))

from common import (
    BLOCK_TYPE_MAP,
    CSV_DIR,
    DIVISION_ID,
    FIRST_NEW_FARM_NUMBER,
    MIGRATION_TAG,
    ORGANIZATION_ID,
    PC_FARM_UUID,
    block_code,
    deterministic_uuid,
    farm_code_from_number,
    get_db,
    is_excluded_farm,
    load_seeds_and_yield_maps,
    make_arg_parser,
    make_logger,
    new_uuid,
    print_summary,
    reset_migration_data,
    upsert_by_legacy_ref,
    utcnow,
)

STAGE = "stage2_farms_blocks"
RESET_COLLECTIONS = ["farms", "blocks"]

# ---------------------------------------------------------------------------
# Admin identity used as manager for all imported farms
# ---------------------------------------------------------------------------

ADMIN_UUID: str = "bff26b8f-5ce9-49b2-9126-86174eaea823"
ADMIN_EMAIL: str = "admin@a64platform.com"


def load_block_standards() -> list[dict]:
    """Load block_standard_rows.csv into a list of dicts."""
    path = CSV_DIR / "block_standard_rows.csv"
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def build_farm_index(rows: list[dict]) -> dict[str, dict]:
    """
    Build a map of farm_details_ref → farm info from block_standard rows.

    Uses farm_details_ref as the stable supabase farm ID since the CSV has
    one farm_details_ref per farm name.

    Args:
        rows: parsed block_standard rows

    Returns:
        dict farm_details_ref → {name, type_set, farm_number, farm_code, farm_uuid}
    """
    # Collect distinct farm refs in order of first appearance
    seen: dict[str, dict] = {}
    for row in rows:
        ref = row["farm_details_ref"]
        if ref not in seen:
            seen[ref] = {
                "name": row["farm"],
                "farm_details_ref": ref,
                "types": set(),
            }
        seen[ref]["types"].add(row["type"])

    # Assign farm numbers starting at FIRST_NEW_FARM_NUMBER
    farm_number = FIRST_NEW_FARM_NUMBER
    for ref, info in seen.items():
        info["farm_number"] = farm_number
        info["farm_code"] = farm_code_from_number(farm_number)
        info["farm_uuid"] = deterministic_uuid("farm", ref)
        farm_number += 1

    return seen


def build_farm_doc(info: dict) -> dict:
    """
    Build a Mongo `farms` document from farm info.

    Produces a document shape that satisfies the Farm Pydantic model in
    src/modules/farm_manager/models/farm.py.  Required fields (no default in
    Farm model) are:  managerId, managerEmail.  nextBlockSequence is not part
    of the Pydantic model but is written by farm_repository.create() and read
    atomically by block_repository_new.get_next_sequence_number(); it must be
    present so new blocks can be sequenced correctly even for imported farms.
    It is initialised to 1 here and corrected after all blocks are upserted.

    Args:
        info: from build_farm_index

    Returns:
        farms document dict
    """
    now = utcnow()
    return {
        # --- identity ---
        "farmId": info["farm_uuid"],
        "farmCode": info["farm_code"],
        # --- Farm model required fields ---
        "managerId": ADMIN_UUID,
        "managerEmail": ADMIN_EMAIL,
        # --- FarmBase optional fields (populate sensible defaults) ---
        "name": info["name"],
        "description": None,
        "owner": "Imported",
        "location": {
            "latitude": None,
            "longitude": None,
            "address": None,
            "city": "Abu Dhabi",
            "state": "Abu Dhabi",
            "country": "UAE",
        },
        "totalArea": 1.0,
        "areaUnit": "hectares",
        "numberOfStaff": 0,
        "boundary": None,
        # --- status / scoping ---
        "isActive": True,
        "divisionId": DIVISION_ID,
        "organizationId": ORGANIZATION_ID,
        # --- nextBlockSequence: written by farm_repository, required by
        #     block_repository sequence counter.  Set to 1 at upsert time;
        #     corrected to max(sequenceNumber)+1 at end of run(). ---
        "nextBlockSequence": 1,
        # --- timestamps ---
        "createdAt": now,
        "updatedAt": now,
        # --- migration provenance ---
        "metadata": {
            "migratedFrom": MIGRATION_TAG,
            "legacyRef": info["farm_details_ref"],
            "supabaseFarmName": info["name"],
        },
    }


def build_block_doc(
    row: dict,
    farm_info: dict,
    seq: int,
    logger=None,
) -> dict:  # noqa: C901
    """
    Build a Mongo `blocks` document for a physical block.

    Args:
        row: one row from block_standard_rows.csv
        farm_info: from build_farm_index for this block's farm
        seq: 1-based sequence number for this block within its farm
        logger: optional logger for warnings (area/maxPlants clamping)

    Returns:
        blocks document dict
    """
    now = utcnow()
    legacy_ref = row["ref"]  # supabase block UUID
    legacy_block_code = row["BlockID"]
    raw_type = row["type"]
    block_type = BLOCK_TYPE_MAP.get(raw_type, "openfield")
    block_code_str = block_code(farm_info["farm_code"], seq)
    block_uuid = deterministic_uuid("block", legacy_ref)

    # --- area: Block model requires area > 0 (Field(..., gt=0)) ---
    # Clamp zero/missing values to 1.0 and flag for manual review.
    area_val = float(row.get("Area") or 0)
    area_placeholder = False
    if area_val <= 0:
        area_val = 1.0  # minimum valid placeholder
        area_placeholder = True
        if logger:
            logger.warning(
                f"Block {legacy_block_code} (ref={legacy_ref}) has Area={row.get('Area')!r} <= 0 — "
                f"clamped to 1.0, metadata.areaPlaceholder=true"
            )
    area = area_val

    # --- maxPlants for physical blocks: stores the RAW drip count from TotalDrips.
    # Reason: physical blocks have no crop assigned at import time, so we cannot
    # multiply drips × seedsPerDrip.  maxPlants stays as-is (drip-based 1:1
    # conservative baseline) until a crop is assigned and the block is cycled.
    # metadata.totalDrips preserves the drip count for future reference.
    # metadata.physicalBlockDripsBaseline=True marks this baseline as intentional.
    raw_drips = row.get("TotalDrips", "")
    max_plants_val = int(raw_drips) if raw_drips else 0
    max_plants_placeholder = False
    if max_plants_val <= 0:
        max_plants_val = 1
        max_plants_placeholder = True
        if raw_drips and logger:
            logger.warning(
                f"Block {legacy_block_code} (ref={legacy_ref}) has TotalDrips={raw_drips!r} <= 0 — "
                f"clamped to 1, metadata.maxPlantsPlaceholder=true"
            )
    max_plants = max_plants_val
    # totalDrips = raw drip count (before any seedsPerDrip multiplication)
    total_drips = max_plants_val

    # Build metadata with optional placeholder flags
    metadata: dict = {
        "migratedFrom": MIGRATION_TAG,
        "legacyRef": legacy_ref,
        "legacyBlockCode": legacy_block_code,
        "supabaseFarmDetailsRef": row["farm_details_ref"],
        "supabaseFarmTypesRef": row["farm_types_ref"],
        "originalType": raw_type,
        # Reason: record drip count baseline so the value is not lost when
        # a crop is later assigned and maxPlants is updated with seeds×drips
        "totalDrips": total_drips,
        # Reason: flag that maxPlants on physical blocks is a drip-count
        # baseline (no crop assigned), not a true plant count
        "physicalBlockDripsBaseline": True,
    }
    if area_placeholder:
        metadata["areaPlaceholder"] = True
        metadata["originalArea"] = row.get("Area")
    if max_plants_placeholder:
        metadata["maxPlantsPlaceholder"] = True
        metadata["originalTotalDrips"] = raw_drips

    return {
        "blockId": block_uuid,
        "blockCode": block_code_str,
        "legacyBlockCode": legacy_block_code,
        "name": legacy_block_code,
        "blockType": block_type,
        "maxPlants": max_plants,
        "area": area,
        "areaUnit": "sqm",
        "boundary": None,
        "iotController": None,
        "farmId": farm_info["farm_uuid"],
        "farmCode": farm_info["farm_code"],
        "sequenceNumber": seq,
        "blockCategory": "physical",
        "parentBlockId": None,
        "availableArea": area,
        "virtualBlockCounter": 0,
        "childBlockIds": [],
        "allocatedArea": None,
        "state": "empty",
        "previousState": None,
        "targetCrop": None,
        "targetCropName": None,
        "actualPlantCount": None,
        "kpi": {
            "predictedYieldKg": 0.0,
            "actualYieldKg": 0.0,
            "yieldEfficiencyPercent": 0.0,
            "totalHarvests": 0,
        },
        "historicalKpi": {
            "totalYieldKg": 0.0,
            "totalHarvests": 0,
            "completedCycles": 0,
            "avgYieldPerCycle": 0.0,
        },
        "plantedDate": None,
        "farmingYearPlanted": None,
        "expectedHarvestDate": None,
        "expectedStatusChanges": None,
        "statusChanges": [],
        "isActive": True,
        "divisionId": DIVISION_ID,
        "organizationId": ORGANIZATION_ID,
        "createdAt": now,
        "updatedAt": now,
        "metadata": metadata,
    }


def run(dry_run: bool, reset: bool) -> None:
    """
    Main entry point for stage 2.

    Args:
        dry_run: if True, read and compute but do not write
        reset: if True, delete all migration-tagged docs before importing
    """
    logger = make_logger(STAGE)
    db = get_db()

    if reset:
        logger.info("[RESET] Deleting migration-tagged docs from farms and blocks...")
        reset_migration_data(db, RESET_COLLECTIONS, logger)

    # Load seeds/yield maps to validate CSV availability early.
    # Stage 2 does not multiply drips × seedsPerDrip for physical blocks
    # (no crop assigned), but loading here ensures the CSV is present before
    # any writes happen.  Stage 3 uses these maps to compute virtual block
    # plant counts and predicted yields.
    logger.info("Loading seeds and yield maps from standard_planning_rows.csv...")
    seeds_map, yield_map = load_seeds_and_yield_maps()
    logger.info(
        f"Maps loaded: {len(seeds_map)} crops with seedsPerDrip, "
        f"{len(yield_map)} crops with netYieldPerDripKg"
    )

    logger.info("Loading block_standard_rows.csv...")
    all_rows = load_block_standards()
    logger.info(f"Loaded {len(all_rows)} block_standard rows (raw)")

    # Filter out excluded farms (New Hydroponic / New Hydroponics)
    rows = [r for r in all_rows if not is_excluded_farm(r.get("farm", ""))]
    excluded_count = len(all_rows) - len(rows)
    if excluded_count:
        logger.info(
            f"Excluded {excluded_count} block_standard rows from NH farm "
            f"(farm names: New Hydroponic / New Hydroponics)"
        )

    farm_index = build_farm_index(rows)
    logger.info(f"Distinct farms found: {len(farm_index)}")

    # Track per-farm block sequence numbers
    farm_block_seq: dict[str, int] = defaultdict(int)

    farms_inserted = farms_updated = 0
    blocks_inserted = blocks_updated = 0
    blocks_skipped = 0
    blocks_area_placeholder = 0
    blocks_max_plants_placeholder = 0
    error_samples: list[str] = []

    # --- Upsert farms ---
    for farm_ref, info in farm_index.items():
        doc = build_farm_doc(info)
        try:
            ins, upd = upsert_by_legacy_ref(
                db.farms, doc, farm_ref, dry_run=dry_run, logger=logger
            )
            if ins:
                farms_inserted += 1
            elif upd:
                farms_updated += 1
            logger.info(
                f"  Farm [{info['farm_code']}] {info['name']} → "
                f"{'DRY-RUN' if dry_run else ('inserted' if ins else 'updated/existing')}"
            )
        except Exception as exc:
            msg = f"Farm upsert failed for ref={farm_ref} name={info['name']}: {exc}"
            logger.error(msg)
            error_samples.append(msg)

    # --- Upsert physical blocks ---
    for row in rows:
        farm_ref = row["farm_details_ref"]
        info = farm_index.get(farm_ref)
        if not info:
            msg = f"Block {row['BlockID']} has unknown farm_details_ref={farm_ref}"
            logger.warning(msg)
            error_samples.append(msg)
            blocks_skipped += 1
            continue

        # Advance per-farm sequence
        farm_block_seq[farm_ref] += 1
        seq = farm_block_seq[farm_ref]
        legacy_ref = row["ref"]

        try:
            doc = build_block_doc(row, info, seq, logger=logger)
            if doc.get("metadata", {}).get("areaPlaceholder"):
                blocks_area_placeholder += 1
            if doc.get("metadata", {}).get("maxPlantsPlaceholder"):
                blocks_max_plants_placeholder += 1
            ins, upd = upsert_by_legacy_ref(
                db.blocks, doc, legacy_ref, dry_run=dry_run, logger=logger
            )
            if ins:
                blocks_inserted += 1
            elif upd:
                blocks_updated += 1
            logger.debug(
                f"  Block [{doc['blockCode']}] legacy={row['BlockID']} "
                f"→ {'DRY-RUN' if dry_run else ('inserted' if ins else 'updated/existing')}"
            )
        except Exception as exc:
            msg = f"Block upsert failed: BlockID={row['BlockID']} ref={legacy_ref}: {exc}"
            logger.error(msg)
            error_samples.append(msg)

    # --- Correct nextBlockSequence for every imported farm ---
    # After all blocks are upserted we set nextBlockSequence = highest
    # sequenceNumber assigned + 1.  This must happen even on re-runs so
    # the counter stays accurate regardless of the number of times the
    # script is executed.
    #
    # Reason: block_repository_new.get_next_sequence_number() does an
    # atomic $inc on nextBlockSequence and returns the post-increment
    # value.  If nextBlockSequence == 1 and the farm already has 47 blocks
    # (sequenceNumbers 1..47) the next new block would get code F011-001
    # — a collision.  Setting it to max+1 prevents that.
    if not dry_run and not error_samples:
        logger.info("Correcting nextBlockSequence for each imported farm...")
        for farm_ref, info in farm_index.items():
            farm_uuid = info["farm_uuid"]
            # Find the highest sequenceNumber among blocks for this farm
            pipeline = [
                {"$match": {"farmId": farm_uuid}},
                {"$group": {"_id": None, "maxSeq": {"$max": "$sequenceNumber"}}},
            ]
            result = list(db.blocks.aggregate(pipeline))
            if result and result[0].get("maxSeq") is not None:
                next_seq = int(result[0]["maxSeq"]) + 1
            else:
                # Farm has no blocks yet — start at 1
                next_seq = 1
            db.farms.update_one(
                {"metadata.legacyRef": farm_ref},
                {"$set": {"nextBlockSequence": next_seq}},
            )
            logger.debug(
                f"  Farm [{info['farm_code']}] nextBlockSequence → {next_seq}"
            )
        logger.info("nextBlockSequence correction complete.")
    elif dry_run:
        # Report what we would set for each farm
        for farm_ref, info in farm_index.items():
            max_seq = farm_block_seq.get(farm_ref, 0)
            logger.info(
                f"  [DRY-RUN] Farm [{info['farm_code']}] "
                f"nextBlockSequence would be set to {max_seq + 1}"
            )

    print_summary(
        stage=STAGE,
        rows_read=len(rows),
        rows_inserted=blocks_inserted,
        rows_updated=blocks_updated,
        rows_skipped=blocks_skipped,
        rows_errored=len(error_samples),
        error_samples=error_samples,
        logger=logger,
    )
    logger.info(
        f"Farms: {farms_inserted} inserted, {farms_updated} updated"
    )
    if blocks_area_placeholder > 0:
        logger.warning(
            f"PLACEHOLDER SUMMARY: {blocks_area_placeholder} block(s) had Area <= 0 and were "
            f"clamped to 1.0 (metadata.areaPlaceholder=true). These need manual area correction."
        )
    if blocks_max_plants_placeholder > 0:
        logger.warning(
            f"PLACEHOLDER SUMMARY: {blocks_max_plants_placeholder} block(s) had TotalDrips <= 0 and "
            f"were clamped to 1 (metadata.maxPlantsPlaceholder=true). These need manual review."
        )

    if error_samples:
        logger.error(
            f"Stage completed with {len(error_samples)} error(s). "
            "Review log before proceeding to stage 3."
        )
        sys.exit(1)


if __name__ == "__main__":
    parser = make_arg_parser("Stage 2: Import farms and physical blocks from Supabase CSVs")
    args = parser.parse_args()
    run(dry_run=args.dry_run, reset=args.reset)
