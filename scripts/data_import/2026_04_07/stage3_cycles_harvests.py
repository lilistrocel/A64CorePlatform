"""
stage3_cycles_harvests.py — Import virtual blocks (active cycles) and block_archives
(completed cycles), plus all block_harvests records.

Source tables:
  - block_history_rows.csv  → completed cycles (state=Cleaned) → block_archives
  - farm_block_rows.csv     → active cycles (state=Planted/Harvested/Planned) → virtual blocks
  - harvest_reports_rows.csv → harvest entries → block_harvests

Join path:
  - block_history.block_standard_ref → block_standard.ref  (physical block)
  - harvest.farm_block_ref → block_history.farm_block_ref   (harvest belongs to completed cycle)
  - harvest.farm_block_ref → farm_block.ref                 (harvest belongs to active cycle)
  - farm_block.block_standard_ref → block_standard.ref      (physical block for active cycle)

Critical rules (per brief):
  - Completed cycles (block_history): create block_archives + block_harvests on parent,
    increment parent.virtualBlockCounter, update parent.kpi, parent.historicalKpi
    Do NOT create a virtual block doc.
  - Active cycles (farm_block): create virtual block doc + block_harvests on virtual block UUID,
    decrement parent.availableArea, append to parent.childBlockIds
  - Unmatched crops: FAIL LOUDLY, write to unmatched_crops.txt, exit non-zero

Run:  python stage3_cycles_harvests.py [--dry-run] [--reset]
"""

from __future__ import annotations

import csv
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent))

from common import (
    AUTO_CREATE_CROP_NAME,
    CSV_DIR,
    DIVISION_ID,
    FARMING_YEAR_START_MONTH,
    MIGRATION_TAG,
    ORGANIZATION_ID,
    UNMATCHED_CROPS_FILE,
    block_code,
    deterministic_uuid,
    ensure_phase1_crop,
    get_db,
    get_farming_year,
    is_excluded_farm,
    load_crop_map,
    load_seeds_and_yield_maps,
    make_arg_parser,
    make_logger,
    new_uuid,
    print_summary,
    reset_migration_data,
    resolve_crop,
    upsert_by_legacy_ref,
    utcnow,
    virtual_block_code,
)

STAGE = "stage3_cycles_harvests"
RESET_COLLECTIONS = ["block_archives", "block_harvests", "blocks"]

# System user for migration-generated status changes
MIGRATION_USER_EMAIL = "migration@supabase_2026_04_07"
MIGRATION_USER_UUID = deterministic_uuid("user", "migration_system_user")


# ---------------------------------------------------------------------------
# CSV loaders
# ---------------------------------------------------------------------------


def _parse_dt(s: str) -> Optional[datetime]:
    """Parse supabase ISO datetime string → naive UTC datetime."""
    if not s or s.strip() == "":
        return None
    s = s.strip()
    # Remove timezone suffix — all supabase times are UTC
    for suffix in ("+00", "+00:00", "Z"):
        if s.endswith(suffix):
            s = s[: -len(suffix)]
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def load_block_standards() -> dict[str, dict]:
    """Load block_standard_rows.csv keyed by ref."""
    with open(CSV_DIR / "block_standard_rows.csv", newline="", encoding="utf-8") as f:
        return {r["ref"]: r for r in csv.DictReader(f)}


def load_block_history() -> list[dict]:
    """Load block_history_rows.csv (all Cleaned = completed cycles)."""
    with open(CSV_DIR / "block_history_rows.csv", newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_farm_blocks() -> list[dict]:
    """Load farm_block_rows.csv (active cycles: Planted, Harvested, Planned)."""
    with open(CSV_DIR / "farm_block_rows.csv", newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_harvest_reports() -> list[dict]:
    """Load harvest_reports_rows.csv grouped by farm_block_ref."""
    harvests_by_fb_ref: dict[str, list[dict]] = defaultdict(list)
    with open(CSV_DIR / "harvest_reports_rows.csv", newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            harvests_by_fb_ref[row["farm_block_ref"]].append(row)
    return harvests_by_fb_ref


# ---------------------------------------------------------------------------
# Block lookup from already-imported stage2 docs
# ---------------------------------------------------------------------------


def load_physical_block_map(db) -> dict[str, dict]:
    """
    Load all physical blocks inserted in stage2, keyed by metadata.legacyRef (supabase block ref).

    Args:
        db: pymongo Database

    Returns:
        dict legacyRef → mongo block doc
    """
    result = {}
    for doc in db.blocks.find(
        {"blockCategory": "physical", "metadata.migratedFrom": MIGRATION_TAG},
        {
            "blockId": 1,
            "blockCode": 1,
            "farmId": 1,
            "farmCode": 1,
            "area": 1,
            "availableArea": 1,
            "virtualBlockCounter": 1,
            "childBlockIds": 1,
            "kpi": 1,
            "historicalKpi": 1,
            "maxPlants": 1,
            "blockType": 1,
            "metadata": 1,
            "_id": 0,
        },
    ):
        ref = doc.get("metadata", {}).get("legacyRef", "")
        if ref:
            result[ref] = doc
    return result


def load_farm_map(db) -> dict[str, dict]:
    """Load migrated farms keyed by farmId UUID string."""
    result = {}
    for doc in db.farms.find(
        {"metadata.migratedFrom": MIGRATION_TAG},
        {"farmId": 1, "name": 1, "farmCode": 1, "_id": 0},
    ):
        result[str(doc["farmId"])] = doc
    return result


# ---------------------------------------------------------------------------
# Harvest doc builder
# ---------------------------------------------------------------------------


def build_harvest_doc(
    harv_row: dict,
    block_id_uuid: str,
    farm_id_uuid: str,
    source_block_code: str,
    legacy_block_code: str,
    cycle_ref: str,
) -> dict:
    """
    Build a block_harvests document from a harvest_reports row.

    Args:
        harv_row: row from harvest_reports_rows.csv
        block_id_uuid: UUID of block to link harvest to (parent for completed, virtual for active)
        farm_id_uuid: UUID of farm
        source_block_code: formatted code like "LW-10/001" for attribution
        legacy_block_code: the supabase block_id field (e.g. "LW-07")
        cycle_ref: the farm_block_ref that identifies this cycle

    Returns:
        block_harvests document dict
    """
    now = utcnow()
    harvest_dt = _parse_dt(harv_row["time"]) or now
    qty_raw = float(harv_row["Quantity"]) if harv_row["Quantity"] else 0.0
    # Reason: BlockHarvestBase.quantityKg = Field(..., gt=0) — strictly positive required.
    # Zero-quantity rows in source data are clamped to 0.001 so the record is preserved
    # and readable; metadata.originalQuantityKg captures the original value for audit.
    qty = qty_raw if qty_raw > 0 else 0.001
    raw_grade = harv_row.get("grade", "").strip()
    # Reason: qualityGrade is required (Field(...)) with enum A|B|C — no default.
    # Blank or non-standard values default to "A"; metadata.originalGrade preserves
    # the source value so it can be corrected manually if needed.
    grade = raw_grade if raw_grade in ("A", "B", "C") else "A"
    season = int(harv_row["harvestSeason"]) if harv_row.get("harvestSeason") else None
    viewing_year = int(harv_row["viewing_year"]) if harv_row.get("viewing_year") else None

    harvest_uuid = deterministic_uuid("harvest", harv_row["ref"] if harv_row.get("ref") else new_uuid())

    farming_year = get_farming_year(harvest_dt)

    return {
        "harvestId": harvest_uuid,
        "blockId": block_id_uuid,
        "farmId": farm_id_uuid,
        "harvestDate": harvest_dt,
        "quantityKg": qty,
        "qualityGrade": grade,
        "farmingYear": farming_year,
        "recordedBy": MIGRATION_USER_UUID,
        "recordedByEmail": harv_row.get("reporter_user", MIGRATION_USER_EMAIL),
        "notes": None,
        "sourceBlockCode": source_block_code,
        "createdAt": now,
        "updatedAt": now,
        "divisionId": DIVISION_ID,
        "organizationId": ORGANIZATION_ID,
        "metadata": {
            "migratedFrom": MIGRATION_TAG,
            "legacyRef": harv_row.get("ref", ""),
            "oldFarmBlockRef": cycle_ref,
            "harvestSeason": season,
            "viewingYear": viewing_year,
            "crop": harv_row.get("crop", ""),
            "mainBlock": harv_row.get("main_block", ""),
            "legacyBlockCode": legacy_block_code,
            "originalGrade": raw_grade,
            # Preserve original quantity when clamped for audit trail
            "originalQuantityKg": qty_raw if qty_raw != qty else None,
        },
    }


# ---------------------------------------------------------------------------
# Archive doc builder
# ---------------------------------------------------------------------------


def build_archive_doc(
    hist_row: dict,
    physical_block: dict,
    farm_name: str,
    actual_yield_kg: float,
    total_harvests: int,
    quality_breakdown: dict,
    virtual_counter: int,
) -> dict:
    """
    Build a block_archives document replicating the shape of archive_block_cycle().

    Args:
        hist_row: row from block_history_rows.csv
        physical_block: physical block mongo doc
        farm_name: farm name string
        actual_yield_kg: sum of harvest quantities for this cycle
        total_harvests: count of harvest rows for this cycle
        quality_breakdown: {"qualityAKg": x, "qualityBKg": y, "qualityCKg": z}
        virtual_counter: the virtualBlockCounter value on the parent AT THIS cycle

    Returns:
        block_archives document dict
    """
    now = utcnow()
    planted_dt = _parse_dt(hist_row["time_start"]) or now
    cleaned_dt = _parse_dt(hist_row["time_cleaned"]) or now
    cycle_days = max(1, (cleaned_dt - planted_dt).days)

    predicted_yield = float(hist_row["predicted_yield"]) if hist_row.get("predicted_yield") else 0.0
    yield_eff = round((actual_yield_kg / predicted_yield * 100) if predicted_yield > 0 else 0.0, 2)

    farming_year_planted = get_farming_year(planted_dt)
    farming_year_harvested = get_farming_year(cleaned_dt)

    physical_block_uuid = str(physical_block["blockId"])
    vcode = virtual_block_code(physical_block["blockCode"], virtual_counter)
    archive_uuid = deterministic_uuid("archive", hist_row["ref"])

    # Reconstruct a minimal status history
    status_changes = [
        {
            "status": "growing",
            "changedAt": planted_dt,
            "changedBy": MIGRATION_USER_UUID,
            "changedByEmail": MIGRATION_USER_EMAIL,
            "notes": f"Migrated from supabase. Original state: {hist_row.get('state','Cleaned')}",
            "expectedDate": None,
            "offsetDays": None,
            "offsetType": None,
        },
        {
            "status": "cleaning",
            "changedAt": _parse_dt(hist_row.get("time_finish") or "") or cleaned_dt,
            "changedBy": MIGRATION_USER_UUID,
            "changedByEmail": MIGRATION_USER_EMAIL,
            "notes": "Harvest period ended",
            "expectedDate": None,
            "offsetDays": None,
            "offsetType": None,
        },
    ]

    return {
        "archiveId": archive_uuid,
        "blockId": physical_block_uuid,
        "blockCode": vcode,
        "farmId": str(physical_block["farmId"]),
        "farmName": farm_name,
        "blockType": str(physical_block.get("blockType", "openfield")),
        "maxPlants": physical_block.get("maxPlants", 0),
        "actualPlantCount": int(float(hist_row.get("drips") or 0)),
        "location": None,
        "area": float(hist_row.get("area") or 0) or None,
        "areaUnit": "sqm",
        "targetCrop": None,  # no uuid available in history — crop name is stored below
        "targetCropName": hist_row.get("crop_id", "Unknown"),
        "plantedDate": planted_dt,
        "harvestCompletedDate": cleaned_dt,
        "cycleDurationDays": cycle_days,
        "farmingYearPlanted": farming_year_planted,
        "farmingYearHarvested": farming_year_harvested,
        "predictedYieldKg": predicted_yield,
        "actualYieldKg": round(actual_yield_kg, 3),
        "yieldEfficiencyPercent": yield_eff,
        "totalHarvests": total_harvests,
        "qualityBreakdown": quality_breakdown,
        "statusChanges": status_changes,
        "alertsSummary": {
            "totalAlerts": 0,
            "resolvedAlerts": 0,
            "averageResolutionTimeHours": None,
        },
        "divisionId": DIVISION_ID,
        "organizationId": ORGANIZATION_ID,
        "archivedAt": cleaned_dt,
        "archivedBy": MIGRATION_USER_UUID,
        "archivedByEmail": MIGRATION_USER_EMAIL,
        "createdAt": now,
        "updatedAt": now,
        "metadata": {
            "migratedFrom": MIGRATION_TAG,
            "legacyRef": hist_row["ref"],
            "legacyBlockCode": hist_row.get("block_id", ""),
            "legacyFarmBlockRef": hist_row.get("farm_block_ref", ""),
            "supabaseState": hist_row.get("state", ""),
            "viewingYear": int(hist_row["viewing_year"]) if hist_row.get("viewing_year") else None,
            "virtualCounterAtArchive": virtual_counter,
        },
    }


# ---------------------------------------------------------------------------
# Virtual block doc builder
# ---------------------------------------------------------------------------


def build_virtual_block_doc(
    fb_row: dict,
    physical_block: dict,
    virtual_counter: int,
    crop_uuid: Optional[str],
    crop_name: str,
    harvest_yield_kg: float,
    total_harvests: int,
    seeds_map: dict[str, int],
    yield_map: dict[str, float],
    logger=None,
) -> dict:
    """
    Build a blocks document for a virtual (active) block.

    Plant count and predicted yield are computed from the supabase
    standard_planning CSV data (seeds_map / yield_map), NOT from the
    old plannedseason formula.  Reason: drips ≠ plants — each drip holds
    seedsPerDrip seeds, and NetYieldPerDripkg is the authoritative yield
    estimate per drip for each crop.

    Args:
        fb_row: row from farm_block_rows.csv
        physical_block: physical block mongo doc
        virtual_counter: counter value for this cycle on the parent (1-based)
        crop_uuid: resolved plant UUID (None if crop unmatched)
        crop_name: crop name string
        harvest_yield_kg: sum of known harvests so far
        total_harvests: count of harvest rows
        seeds_map: crop_lower → seedsPerDrip int (from standard_planning CSV)
        yield_map: crop_lower → netYieldPerDripKg float (from standard_planning CSV)
        logger: optional logger for warnings (maxPlants clamping)

    Returns:
        blocks document dict
    """
    now = utcnow()
    planted_dt = _parse_dt(fb_row["time_start"]) or now
    expected_harvest_dt = _parse_dt(fb_row["time_finish"])
    viewing_year = int(fb_row["viewing_year"]) if fb_row.get("viewing_year") else None
    farming_year = get_farming_year(planted_dt)
    area_raw = float(fb_row.get("area", "") or 0)
    area = area_raw if area_raw > 0 else None

    # --- Drip count from CSV column 'drips' ---
    raw_drips = fb_row.get("drips", "")
    drips = int(raw_drips) if raw_drips else 0

    # --- Resolve seedsPerDrip and netYieldPerDripKg from standard_planning CSV ---
    # Reason: these values come from the supabase planning table, not from
    # plant_data_enhanced.  They govern how many plants fit per drip and the
    # expected yield per drip for each crop.
    crop_lower = crop_name.strip().lower()
    seeds_per_drip: Optional[int] = seeds_map.get(crop_lower)
    seeds_fallback = False
    if seeds_per_drip is None:
        # Reason: log warning but don't fail — use 1 as safe fallback so the
        # block can still be created with an approximate plant count
        if logger:
            logger.warning(
                f"Virtual block {fb_row.get('block_id','?')} (ref={fb_row.get('ref','?')}): "
                f"crop '{crop_name}' not found in standard_planning CSV — "
                f"using seedsPerDrip=1 as fallback, metadata.seedsPerDripFallback=true"
            )
        seeds_per_drip = 1
        seeds_fallback = True

    net_yield_per_drip_kg: float = yield_map.get(crop_lower, 0.0)

    # --- Plant count: drips × seedsPerDrip ---
    # Clamp to minimum 1 (Block model requires maxPlants > 0)
    max_plants_placeholder = False
    if drips <= 0:
        # drips field is missing or zero — flag and clamp
        max_plants_placeholder = True
        legacy_code = fb_row.get("block_id", fb_row.get("ref", "?"))
        if logger:
            logger.warning(
                f"Virtual block {legacy_code} (ref={fb_row.get('ref','?')}) has "
                f"drips={raw_drips!r} <= 0 — clamped to 1, metadata.maxPlantsPlaceholder=true"
            )
        drips = 0  # keep drips=0 in metadata; plants clamped to 1 below
        plants = 1
    else:
        plants = drips * seeds_per_drip
    plants = max(plants, 1)  # final safety clamp

    # --- Predicted yield: drips × netYieldPerDripKg ---
    # Reason: use supabase NetYieldPerDripkg as the authoritative yield estimate.
    # The old formula (plannedseason × drips) was incorrect.
    predicted_yield = round(drips * net_yield_per_drip_kg, 3) if drips > 0 else 0.0

    yield_eff = round(
        (harvest_yield_kg / predicted_yield * 100) if predicted_yield > 0 else 0.0, 2
    )

    legacy_ref = fb_row["ref"]
    virtual_uuid = deterministic_uuid("virtual_block", legacy_ref)

    # Map farm_block state to block status
    raw_state = fb_row.get("state", "Planted")
    state_map = {
        "Planted": "growing",
        "Harvested": "harvesting",
        "Planned": "planned",
        "Harvesting": "harvesting",
        "Cleaning": "cleaning",
    }
    state = state_map.get(raw_state, "growing")

    vcode = virtual_block_code(physical_block["blockCode"], virtual_counter)

    status_changes = [
        {
            "status": state,
            "changedAt": planted_dt,
            "changedBy": MIGRATION_USER_UUID,
            "changedByEmail": MIGRATION_USER_EMAIL,
            "notes": f"Migrated from supabase. Original state: {raw_state}",
            "expectedDate": None,
            "offsetDays": None,
            "offsetType": None,
        }
    ]

    # Build metadata — include audit fields for drips-to-plants conversion
    metadata: dict = {
        "migratedFrom": MIGRATION_TAG,
        "legacyRef": legacy_ref,
        "legacyBlockCode": fb_row.get("block_id", ""),
        "supabaseState": raw_state,
        "viewingYear": viewing_year,
        "totalDrips": drips,
        "seedsPerDripUsed": seeds_per_drip,
        "netYieldPerDripKgUsed": net_yield_per_drip_kg,
        "dripsToPlantsConverted": True,
    }
    if max_plants_placeholder:
        metadata["maxPlantsPlaceholder"] = True
        metadata["originalDrips"] = raw_drips
    if seeds_fallback:
        metadata["seedsPerDripFallback"] = True

    return {
        "blockId": virtual_uuid,
        "blockCode": vcode,
        "legacyBlockCode": fb_row.get("block_id", ""),
        "name": fb_row.get("block_id", vcode),
        "blockType": str(physical_block.get("blockType", "openfield")),
        "maxPlants": plants,
        "area": area,
        "areaUnit": "sqm",
        "boundary": None,
        "iotController": None,
        "farmId": str(physical_block["farmId"]),
        "farmCode": str(physical_block.get("farmCode", "")),
        "sequenceNumber": None,
        "blockCategory": "virtual",
        "parentBlockId": str(physical_block["blockId"]),
        "availableArea": None,
        "virtualBlockCounter": 0,
        "childBlockIds": [],
        "allocatedArea": area,
        "state": state,
        "previousState": None,
        "targetCrop": crop_uuid,
        "targetCropName": crop_name,
        "actualPlantCount": plants,
        "kpi": {
            "predictedYieldKg": predicted_yield,
            "actualYieldKg": round(harvest_yield_kg, 3),
            "yieldEfficiencyPercent": yield_eff,
            "totalHarvests": total_harvests,
        },
        "historicalKpi": None,
        "plantedDate": planted_dt,
        "farmingYearPlanted": farming_year,
        "expectedHarvestDate": expected_harvest_dt,
        "expectedStatusChanges": None,
        "statusChanges": status_changes,
        "isActive": True,
        "divisionId": DIVISION_ID,
        "organizationId": ORGANIZATION_ID,
        "createdAt": planted_dt,
        "updatedAt": now,
        "metadata": metadata,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def run(dry_run: bool, reset: bool, create_missing_crops: bool = True) -> None:
    """
    Main entry point for stage 3.

    Args:
        dry_run: if True, read and compute but do not write
        reset: if True, delete all migration-tagged block_archives, block_harvests
               and virtual blocks before reimporting
        create_missing_crops: if True, auto-create known missing crops before
               running (default True — always runs at stage startup)
    """
    logger = make_logger(STAGE)
    db = get_db()

    # -------------------------------------------------------------------
    # Auto-create known missing crops BEFORE any data processing
    # This handles 'Lettuce - Phase 1 (5cm)' only — all other unmatched
    # crops still fail loudly later.
    # -------------------------------------------------------------------
    logger.info(
        f"Checking for known missing crop '{AUTO_CREATE_CROP_NAME}'..."
    )
    if not dry_run:
        ensure_phase1_crop(db, logger)
    else:
        logger.info("[DRY-RUN] Skipping crop auto-create (would run in real mode)")

    if reset:
        logger.info("[RESET] Deleting migration-tagged archives, harvests, virtual blocks...")
        # Only delete virtual blocks and archives/harvests — do NOT delete physical blocks (stage2)
        db.block_archives.delete_many({"metadata.migratedFrom": MIGRATION_TAG})
        db.block_harvests.delete_many({"metadata.migratedFrom": MIGRATION_TAG})
        db.blocks.delete_many({
            "blockCategory": "virtual",
            "metadata.migratedFrom": MIGRATION_TAG,
        })
        # Reset parent block state fields to defaults
        if not dry_run:
            db.blocks.update_many(
                {"blockCategory": "physical", "metadata.migratedFrom": MIGRATION_TAG},
                {
                    "$set": {
                        "state": "empty",
                        "virtualBlockCounter": 0,
                        "childBlockIds": [],
                        "availableArea": None,
                        "kpi.actualYieldKg": 0.0,
                        "kpi.totalHarvests": 0,
                        "historicalKpi.totalYieldKg": 0.0,
                        "historicalKpi.totalHarvests": 0,
                        "historicalKpi.completedCycles": 0,
                        "historicalKpi.avgYieldPerCycle": 0.0,
                    }
                },
            )
        logger.info("[RESET] Complete.")

    # -------------------------------------------------------------------
    # Load data
    # -------------------------------------------------------------------
    logger.info("Loading CSVs...")
    std_by_ref_raw = load_block_standards()
    hist_rows_raw = load_block_history()
    fb_rows_raw = load_farm_blocks()
    harv_by_fb_ref = load_harvest_reports()

    # -------------------------------------------------------------------
    # Filter NH blocks/cycles/harvests BEFORE any processing
    # -------------------------------------------------------------------

    # Identify excluded block_standard refs (NH farm)
    nh_std_refs: set[str] = {
        ref for ref, row in std_by_ref_raw.items()
        if is_excluded_farm(row.get("farm", ""))
    }
    std_by_ref = {
        ref: row for ref, row in std_by_ref_raw.items()
        if ref not in nh_std_refs
    }
    logger.info(
        f"Excluded {len(nh_std_refs)} NH block_standard refs from processing"
    )

    # Filter completed cycles linked to NH blocks
    hist_rows = [r for r in hist_rows_raw if r.get("block_standard_ref", "") not in nh_std_refs]
    hist_excl = len(hist_rows_raw) - len(hist_rows)

    # Filter active cycles linked to NH blocks
    fb_rows = [r for r in fb_rows_raw if r.get("block_standard_ref", "") not in nh_std_refs]
    fb_excl = len(fb_rows_raw) - len(fb_rows)

    # Filter harvest rows: exclude those whose farm_block_ref belongs to an NH cycle
    nh_fb_refs: set[str] = {
        r["ref"] for r in fb_rows_raw if r.get("block_standard_ref", "") in nh_std_refs
    }
    nh_hist_fb_refs: set[str] = {
        r.get("farm_block_ref", "") for r in hist_rows_raw
        if r.get("block_standard_ref", "") in nh_std_refs
    }
    all_nh_cycle_refs = nh_fb_refs | nh_hist_fb_refs

    harv_excl = sum(
        len(v) for k, v in harv_by_fb_ref.items() if k in all_nh_cycle_refs
    )
    harv_by_fb_ref = {
        k: v for k, v in harv_by_fb_ref.items() if k not in all_nh_cycle_refs
    }

    logger.info(
        f"NH exclusion: {hist_excl} completed cycles, {fb_excl} active cycles, "
        f"{harv_excl} harvest rows excluded"
    )

    logger.info(
        f"CSVs (after NH exclusion): {len(std_by_ref)} blocks, "
        f"{len(hist_rows)} completed cycles, "
        f"{len(fb_rows)} active cycles, "
        f"{sum(len(v) for v in harv_by_fb_ref.values())} harvest rows"
    )

    # -------------------------------------------------------------------
    # Load crop map
    # -------------------------------------------------------------------
    # Load seeds/yield maps from supabase CSV — used for virtual block plant
    # count and predicted yield computation.  Must be loaded before Pass 2.
    logger.info("Loading seeds and yield maps from standard_planning_rows.csv...")
    seeds_map, yield_map = load_seeds_and_yield_maps()
    logger.info(
        f"Seeds/yield maps loaded: {len(seeds_map)} crops"
    )

    logger.info("Loading crop map from plant_data_enhanced...")
    crop_map = load_crop_map(db)
    logger.info(f"Crop map loaded: {len(crop_map)} crops")

    # -------------------------------------------------------------------
    # Load physical blocks from stage2 (need their UUIDs and codes)
    # -------------------------------------------------------------------
    logger.info("Loading physical blocks from stage2...")
    physical_by_legacy_ref = load_physical_block_map(db)
    physical_by_block_id = {
        doc["metadata"]["legacyBlockCode"]: doc
        for doc in physical_by_legacy_ref.values()
    }

    # Also build lookup by block_standard_ref for block_history
    physical_by_std_ref = {
        doc["metadata"]["supabaseFarmDetailsRef"]: []
        for doc in physical_by_legacy_ref.values()
    }
    # Better: keyed by supabase block ref (block_standard.ref) = metadata.legacyRef
    # physical_by_legacy_ref IS already keyed by block_standard.ref

    logger.info(f"Loaded {len(physical_by_legacy_ref)} physical blocks from stage2")

    if len(physical_by_legacy_ref) == 0:
        logger.error("No physical blocks found — did stage2 run successfully?")
        sys.exit(1)

    # Load farm names
    farm_map = load_farm_map(db)
    farm_names_by_id = {fid: doc.get("name", "") for fid, doc in farm_map.items()}

    # -------------------------------------------------------------------
    # Per-physical-block mutable state tracking
    # We accumulate changes and apply in bulk at the end.
    # -------------------------------------------------------------------
    # parent_updates[block_std_ref] = {virtualBlockCounter, childBlockIds, kpi, historicalKpi, ...}
    parent_updates: dict[str, dict] = {}

    def get_parent_state(std_ref: str, physical_doc: dict) -> dict:
        """Get or initialize the mutable state tracker for a parent block."""
        if std_ref not in parent_updates:
            parent_updates[std_ref] = {
                "virtualBlockCounter": physical_doc.get("virtualBlockCounter", 0),
                "childBlockIds": list(physical_doc.get("childBlockIds", [])),
                "kpi_actual_yield": physical_doc.get("kpi", {}).get("actualYieldKg", 0.0),
                "kpi_total_harvests": physical_doc.get("kpi", {}).get("totalHarvests", 0),
                "kpi_predicted_yield": physical_doc.get("kpi", {}).get("predictedYieldKg", 0.0),
                "hist_total_yield": physical_doc.get("historicalKpi", {}).get("totalYieldKg", 0.0),
                "hist_total_harvests": physical_doc.get("historicalKpi", {}).get("totalHarvests", 0),
                "hist_completed_cycles": physical_doc.get("historicalKpi", {}).get("completedCycles", 0),
                "active_child_area": 0.0,
                "state": "empty",
            }
        return parent_updates[std_ref]

    # -------------------------------------------------------------------
    # Crop unmatched tracker
    # -------------------------------------------------------------------
    unmatched_crops: list[str] = []

    # -------------------------------------------------------------------
    # Counters
    # -------------------------------------------------------------------
    archives_inserted = archives_updated = 0
    virtual_inserted = virtual_updated = 0
    virtual_max_plants_placeholder = 0
    harvests_inserted = harvests_updated = 0
    rows_skipped = 0
    error_samples: list[str] = []

    total_rows = len(hist_rows) + len(fb_rows)

    # ===================================================================
    # PASS 1: Completed cycles → block_archives
    # ===================================================================
    logger.info(f"Pass 1: Processing {len(hist_rows)} completed cycles (block_history)...")

    for hist_row in hist_rows:
        std_ref = hist_row.get("block_standard_ref", "")
        physical_block = physical_by_legacy_ref.get(std_ref)

        if not physical_block:
            msg = (
                f"Completed cycle {hist_row['ref']}: no physical block for "
                f"block_standard_ref={std_ref} (block_id={hist_row.get('block_id','')})"
            )
            logger.warning(msg)
            error_samples.append(msg)
            rows_skipped += 1
            continue

        # Crop validation
        crop_name = hist_row.get("crop_id", "").strip()
        crop_uuid = resolve_crop(crop_name, crop_map, unmatched_crops)
        # Note: for archives, targetCrop being None is non-fatal (historical data)
        # but we still track unmatched for reporting

        # Collect harvests for this completed cycle
        cycle_ref = hist_row.get("farm_block_ref", "")
        cycle_harvests = harv_by_fb_ref.get(cycle_ref, [])

        total_yield = sum(
            float(h["Quantity"]) for h in cycle_harvests if h.get("Quantity")
        )
        n_harvests = len(cycle_harvests)

        quality_a = sum(
            float(h["Quantity"]) for h in cycle_harvests
            if h.get("Quantity") and h.get("grade", "").strip() == "A"
        )
        quality_b = sum(
            float(h["Quantity"]) for h in cycle_harvests
            if h.get("Quantity") and h.get("grade", "").strip() == "B"
        )
        quality_c = sum(
            float(h["Quantity"]) for h in cycle_harvests
            if h.get("Quantity") and h.get("grade", "").strip() == "C"
        )
        quality_breakdown = {
            "qualityAKg": round(quality_a, 3),
            "qualityBKg": round(quality_b, 3),
            "qualityCKg": round(quality_c, 3),
        }

        # Advance parent virtual counter for this cycle
        parent_state = get_parent_state(std_ref, physical_block)
        parent_state["virtualBlockCounter"] += 1
        virtual_counter = parent_state["virtualBlockCounter"]

        # Build and upsert archive
        archive_doc = build_archive_doc(
            hist_row=hist_row,
            physical_block=physical_block,
            farm_name=farm_names_by_id.get(str(physical_block["farmId"]), ""),
            actual_yield_kg=total_yield,
            total_harvests=n_harvests,
            quality_breakdown=quality_breakdown,
            virtual_counter=virtual_counter,
        )
        # Patch targetCrop if resolved
        if crop_uuid:
            archive_doc["targetCrop"] = crop_uuid

        try:
            ins, upd = upsert_by_legacy_ref(
                db.block_archives, archive_doc, hist_row["ref"],
                dry_run=dry_run, logger=logger
            )
            if ins:
                archives_inserted += 1
            elif upd:
                archives_updated += 1
        except Exception as exc:
            msg = f"Archive upsert failed for cycle={hist_row['ref']}: {exc}"
            logger.error(msg)
            error_samples.append(msg)

        # Update parent KPI accumulators
        parent_state["hist_total_yield"] += total_yield
        parent_state["hist_total_harvests"] += n_harvests
        parent_state["hist_completed_cycles"] += 1
        parent_state["kpi_actual_yield"] += total_yield
        parent_state["kpi_total_harvests"] += n_harvests

        # Insert block_harvests — linked to PARENT physical block (completed cycle)
        parent_block_uuid = str(physical_block["blockId"])
        parent_legacy_code = physical_block["metadata"].get("legacyBlockCode", "")
        source_code = virtual_block_code(physical_block["blockCode"], virtual_counter)

        for harv_row in cycle_harvests:
            harvest_doc = build_harvest_doc(
                harv_row=harv_row,
                block_id_uuid=parent_block_uuid,
                farm_id_uuid=str(physical_block["farmId"]),
                source_block_code=source_code,
                legacy_block_code=harv_row.get("block_id", parent_legacy_code),
                cycle_ref=cycle_ref,
            )
            harv_legacy_ref = harv_row.get("ref", "")
            if not harv_legacy_ref:
                harv_legacy_ref = deterministic_uuid(
                    "harvest_fallback", f"{cycle_ref}_{harv_row['time']}_{harv_row['Quantity']}"
                )
                harvest_doc["harvestId"] = harv_legacy_ref
                harvest_doc["metadata"]["legacyRef"] = harv_legacy_ref

            try:
                ins, upd = upsert_by_legacy_ref(
                    db.block_harvests, harvest_doc, harv_legacy_ref,
                    dry_run=dry_run, logger=logger
                )
                if ins:
                    harvests_inserted += 1
                elif upd:
                    harvests_updated += 1
            except Exception as exc:
                msg = f"Harvest upsert failed ref={harv_legacy_ref}: {exc}"
                logger.error(msg)
                error_samples.append(msg)

    logger.info(
        f"Pass 1 done. Archives: {archives_inserted} inserted, {archives_updated} updated."
    )

    # ===================================================================
    # PASS 2: Active cycles → virtual blocks
    # ===================================================================
    logger.info(f"Pass 2: Processing {len(fb_rows)} active cycles (farm_block)...")

    for fb_row in fb_rows:
        std_ref = fb_row.get("block_standard_ref", "")
        physical_block = physical_by_legacy_ref.get(std_ref)

        if not physical_block:
            msg = (
                f"Active cycle {fb_row['ref']}: no physical block for "
                f"block_standard_ref={std_ref} (block_id={fb_row.get('block_id','')})"
            )
            logger.warning(msg)
            error_samples.append(msg)
            rows_skipped += 1
            continue

        # Crop validation — REQUIRED for active cycles
        crop_name = fb_row.get("Item", "").strip()
        crop_uuid = resolve_crop(crop_name, crop_map, unmatched_crops)
        # We do NOT fail immediately — collect all unmatched then fail

        # Advance parent virtual counter
        parent_state = get_parent_state(std_ref, physical_block)
        parent_state["virtualBlockCounter"] += 1
        virtual_counter = parent_state["virtualBlockCounter"]

        # Collect active cycle harvests
        cycle_ref = fb_row["ref"]
        cycle_harvests = harv_by_fb_ref.get(cycle_ref, [])

        total_yield = sum(
            float(h["Quantity"]) for h in cycle_harvests if h.get("Quantity")
        )
        n_harvests = len(cycle_harvests)

        # Build virtual block — seeds_map and yield_map passed from stage startup
        virtual_doc = build_virtual_block_doc(
            fb_row=fb_row,
            physical_block=physical_block,
            virtual_counter=virtual_counter,
            crop_uuid=crop_uuid,
            crop_name=crop_name,
            harvest_yield_kg=total_yield,
            total_harvests=n_harvests,
            seeds_map=seeds_map,
            yield_map=yield_map,
            logger=logger,
        )
        if virtual_doc.get("metadata", {}).get("maxPlantsPlaceholder"):
            virtual_max_plants_placeholder += 1
        virtual_uuid = virtual_doc["blockId"]

        try:
            ins, upd = upsert_by_legacy_ref(
                db.blocks, virtual_doc, fb_row["ref"],
                dry_run=dry_run, logger=logger
            )
            if ins:
                virtual_inserted += 1
            elif upd:
                virtual_updated += 1
        except Exception as exc:
            msg = f"Virtual block upsert failed: ref={fb_row['ref']}: {exc}"
            logger.error(msg)
            error_samples.append(msg)

        # Track parent child references
        if virtual_uuid not in parent_state["childBlockIds"]:
            parent_state["childBlockIds"].append(virtual_uuid)

        # Accumulate allocated area for parent availableArea deduction.
        # Use allocatedArea from the virtual doc; fall back to area when null.
        # Both should be equal for virtual blocks (area = allocatedArea).
        v_allocated = virtual_doc.get("allocatedArea")
        v_area = virtual_doc.get("area")
        if v_allocated is not None and v_allocated > 0:
            child_area_contribution = float(v_allocated)
        elif v_area is not None and v_area > 0:
            child_area_contribution = float(v_area)
            if v_allocated is not None and v_allocated != v_area:
                logger.warning(
                    f"Virtual block {virtual_doc.get('blockCode','?')} allocatedArea={v_allocated} "
                    f"differs from area={v_area} — using area for parent deduction"
                )
        else:
            child_area_contribution = 0.0
            logger.warning(
                f"Virtual block {virtual_doc.get('blockCode','?')} has null/zero area and "
                f"allocatedArea — parent availableArea cannot be deducted for this child. "
                f"Manual review required."
            )
        parent_state["active_child_area"] += child_area_contribution
        parent_state["kpi_actual_yield"] += total_yield
        parent_state["kpi_total_harvests"] += n_harvests
        # Reason: accumulate predicted yield from active virtual children so
        # Pass 3 can include it in the parent block's kpi.predictedYieldKg rollup
        parent_state["kpi_predicted_yield"] += virtual_doc["kpi"]["predictedYieldKg"]
        parent_state["state"] = "partial"

        # Insert block_harvests — linked to VIRTUAL block UUID
        source_code = virtual_block_code(physical_block["blockCode"], virtual_counter)
        legacy_block_code = fb_row.get("block_id", "")

        for harv_row in cycle_harvests:
            harvest_doc = build_harvest_doc(
                harv_row=harv_row,
                block_id_uuid=virtual_uuid,
                farm_id_uuid=str(physical_block["farmId"]),
                source_block_code=source_code,
                legacy_block_code=harv_row.get("block_id", legacy_block_code),
                cycle_ref=cycle_ref,
            )
            harv_legacy_ref = harv_row.get("ref", "")
            if not harv_legacy_ref:
                harv_legacy_ref = deterministic_uuid(
                    "harvest_fallback", f"{cycle_ref}_{harv_row['time']}_{harv_row['Quantity']}"
                )
                harvest_doc["harvestId"] = harv_legacy_ref
                harvest_doc["metadata"]["legacyRef"] = harv_legacy_ref

            try:
                ins, upd = upsert_by_legacy_ref(
                    db.block_harvests, harvest_doc, harv_legacy_ref,
                    dry_run=dry_run, logger=logger
                )
                if ins:
                    harvests_inserted += 1
                elif upd:
                    harvests_updated += 1
            except Exception as exc:
                msg = f"Harvest upsert failed ref={harv_legacy_ref}: {exc}"
                logger.error(msg)
                error_samples.append(msg)

    logger.info(
        f"Pass 2 done. Virtual blocks: {virtual_inserted} inserted, {virtual_updated} updated."
    )

    # ===================================================================
    # PASS 3: Apply parent block updates
    # ===================================================================
    logger.info(f"Pass 3: Updating {len(parent_updates)} parent physical blocks...")

    parent_errors = 0
    parents_with_active_children = 0
    parents_overallocated = 0
    for std_ref, pstate in parent_updates.items():
        physical_block = physical_by_legacy_ref.get(std_ref)
        if not physical_block:
            continue

        completed = pstate["hist_completed_cycles"]
        total_yield = pstate["hist_total_yield"]
        avg_per_cycle = round(total_yield / completed, 3) if completed > 0 else 0.0

        # Recompute availableArea = area - sum(allocatedArea for each ACTIVE virtual child).
        # active_child_area was accumulated in Pass 2 from each virtual child's
        # allocatedArea (falling back to area when allocatedArea is null).
        total_area = physical_block.get("area") or 0.0
        used_area = pstate["active_child_area"]
        has_active_children = len(pstate["childBlockIds"]) > 0

        overallocated_flag = False
        if used_area > total_area and total_area > 0:
            logger.warning(
                f"Parent {physical_block.get('blockCode','?')} (std_ref={std_ref}) is "
                f"overallocated: area={total_area}, used_area={used_area} — "
                f"clamping availableArea to 0 and flagging metadata.areaOverallocated=true"
            )
            available_area = 0.0
            overallocated_flag = True
            parents_overallocated += 1
        else:
            available_area = max(0.0, total_area - used_area)

        if has_active_children:
            parents_with_active_children += 1

        # Build the $set payload
        # Reason: kpi.predictedYieldKg on the parent is the SUM of predicted
        # yields from active virtual children (computed from drips × netYieldPerDripKg).
        # This gives the parent block a meaningful predicted yield that reflects
        # all its active cycles.
        set_fields: dict = {
            "virtualBlockCounter": pstate["virtualBlockCounter"],
            "childBlockIds": pstate["childBlockIds"],
            "state": pstate["state"],
            "availableArea": available_area,
            "kpi.predictedYieldKg": round(pstate["kpi_predicted_yield"], 3),
            "kpi.actualYieldKg": round(pstate["kpi_actual_yield"], 3),
            "kpi.totalHarvests": pstate["kpi_total_harvests"],
            "historicalKpi.totalYieldKg": round(pstate["hist_total_yield"], 3),
            "historicalKpi.totalHarvests": pstate["hist_total_harvests"],
            "historicalKpi.completedCycles": completed,
            "historicalKpi.avgYieldPerCycle": avg_per_cycle,
            "updatedAt": utcnow(),
        }
        if overallocated_flag:
            set_fields["metadata.areaOverallocated"] = True
            set_fields["metadata.usedArea"] = round(used_area, 3)

        update_payload = {"$set": set_fields}

        if not dry_run:
            try:
                db.blocks.update_one(
                    {"metadata.legacyRef": std_ref},
                    update_payload,
                )
            except Exception as exc:
                msg = f"Parent block update failed std_ref={std_ref}: {exc}"
                logger.error(msg)
                error_samples.append(msg)
                parent_errors += 1
        else:
            logger.debug(
                f"  [DRY-RUN] Would update parent block {physical_block.get('blockCode','')} "
                f"counter={pstate['virtualBlockCounter']} "
                f"children={len(pstate['childBlockIds'])} "
                f"availableArea={available_area} "
                f"yield={round(pstate['kpi_actual_yield'],1)}"
            )

    logger.info(
        f"Pass 3 done. Parent updates: {len(parent_updates)} ({parent_errors} errors) | "
        f"parents with active children: {parents_with_active_children} | "
        f"overallocated (clamped to 0): {parents_overallocated}"
    )
    if virtual_max_plants_placeholder > 0:
        logger.warning(
            f"PLACEHOLDER SUMMARY: {virtual_max_plants_placeholder} virtual block(s) had "
            f"drips <= 0 and were clamped to maxPlants=1 (metadata.maxPlantsPlaceholder=true)."
        )

    # ===================================================================
    # Unmatched crops check — FAIL if any found (except auto-create crops)
    # 'Lettuce - Phase 1 (5cm)' is handled by ensure_phase1_crop() at startup.
    # All OTHER unmatched crops still cause a hard fail.
    # ===================================================================
    # Remove the auto-created crop from the unmatched list — it was created
    # at startup so the crop_map would have it in real mode; in dry-run mode
    # it won't exist yet, so we suppress it here.
    truly_unmatched = [
        c for c in set(unmatched_crops)
        if c.strip().lower() != AUTO_CREATE_CROP_NAME.lower()
    ]

    if truly_unmatched:
        logger.error(
            f"CRITICAL: {len(truly_unmatched)} unmatched crop name(s) found (excluding known auto-creates). "
            f"Writing to {UNMATCHED_CROPS_FILE}"
        )
        with open(UNMATCHED_CROPS_FILE, "w", encoding="utf-8") as uf:
            uf.write("Unmatched crop names from stage3 import:\n")
            for crop in sorted(truly_unmatched):
                uf.write(f"  - {crop}\n")
        logger.error(
            "User action required: resolve unmatched crops in plant_data_enhanced "
            "and re-run stage3 --reset"
        )
        print_summary(
            stage=STAGE,
            rows_read=total_rows,
            rows_inserted=archives_inserted + virtual_inserted + harvests_inserted,
            rows_updated=archives_updated + virtual_updated + harvests_updated,
            rows_skipped=rows_skipped,
            rows_errored=len(error_samples),
            error_samples=error_samples,
            logger=logger,
        )
        sys.exit(1)

    if AUTO_CREATE_CROP_NAME in unmatched_crops and dry_run:
        logger.info(
            f"[DRY-RUN] Note: '{AUTO_CREATE_CROP_NAME}' would be resolved via "
            f"auto-create in real mode (ensure_phase1_crop skipped in dry-run)."
        )

    print_summary(
        stage=STAGE,
        rows_read=total_rows,
        rows_inserted=archives_inserted + virtual_inserted + harvests_inserted,
        rows_updated=archives_updated + virtual_updated + harvests_updated,
        rows_skipped=rows_skipped,
        rows_errored=len(error_samples),
        error_samples=error_samples,
        logger=logger,
    )
    logger.info(f"  Archives: {archives_inserted} inserted, {archives_updated} updated")
    logger.info(f"  Virtual blocks: {virtual_inserted} inserted, {virtual_updated} updated")
    logger.info(f"  Harvests: {harvests_inserted} inserted, {harvests_updated} updated")

    if error_samples:
        logger.warning(
            f"Stage completed with {len(error_samples)} non-fatal warning(s). Review log."
        )


if __name__ == "__main__":
    parser = make_arg_parser(
        "Stage 3: Import virtual blocks (active cycles), block_archives (completed), and block_harvests"
    )
    args = parser.parse_args()
    run(
        dry_run=args.dry_run,
        reset=args.reset,
        create_missing_crops=args.create_missing_crops,
    )
