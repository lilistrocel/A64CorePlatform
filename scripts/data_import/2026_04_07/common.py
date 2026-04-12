"""
common.py — Shared helpers for A64 Supabase 2026-04-07 data import.

All stage scripts import from here. Provides:
- MongoDB connection (pymongo sync, host-side)
- UUID generation / deterministic UUID from legacy ref
- Name→ID maps for crops (plant_data_enhanced lookup)
- Farm/block code generators
- Legacy-ref upsert helpers
- Logging factory
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import pymongo
from pymongo import MongoClient
from pymongo.database import Database
from bson import ObjectId

# ---------------------------------------------------------------------------
# Constants — ALL final, negotiated with user
# ---------------------------------------------------------------------------

MONGO_URI: str = "mongodb://localhost:27017"
MONGO_DB: str = "a64core_db"

PC_FARM_UUID: str = "23d67318-415e-49bf-a2b6-515b38974bde"
PC_FARM_MONGO_ID: ObjectId = ObjectId("6990e785db9eb6307324b933")
DIVISION_ID: str = "00000000-0000-0000-0000-000000000010"
ORGANIZATION_ID: str = "00000000-0000-0000-0000-000000000001"
MIGRATION_TAG: str = "supabase_2026_04_07"

# First new farm gets F011 (PC Farm is F010)
FIRST_NEW_FARM_NUMBER: int = 11

# Supabase CSV directory
CSV_DIR: Path = Path(__file__).parent.parent.parent.parent / "OldData" / "7-April-2026" / "supabase_data_latest_040726"

# Excel files
SALES_EXCEL: Path = Path(__file__).parent.parent.parent.parent / "OldData" / "7-April-2026" / "Sales Reports - 02-04-2026 Aug25-July26.xlsx"
PURCHASE_EXCEL: Path = Path(__file__).parent.parent.parent.parent / "OldData" / "7-April-2026" / "Purchase Register 2025-2026.xlsx"

# Farming year start month (August = 8, consistent with system_config)
FARMING_YEAR_START_MONTH: int = 8

# Unmatched crops file — written by stage 3 if any crop is missing
UNMATCHED_CROPS_FILE: Path = Path(__file__).parent / "unmatched_crops.txt"

# Log directory
LOG_DIR: Path = Path(__file__).parent / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# NH farm exclusion — user confirmed this farm is no longer used
# ---------------------------------------------------------------------------

# Case-insensitive set of farm names to exclude entirely from all stages.
# Rows where farm name (stripped, lowercased) matches any entry are silently
# skipped; excluded row counts are logged per stage.
EXCLUDED_FARM_NAMES: frozenset[str] = frozenset(
    {"new hydroponic", "new hydroponics"}
)


def is_excluded_farm(farm_name: str) -> bool:
    """
    Return True if the farm name matches the exclusion list.

    Args:
        farm_name: raw farm name string from any CSV column

    Returns:
        True if this farm should be excluded from import
    """
    return farm_name.strip().lower() in EXCLUDED_FARM_NAMES


# ---------------------------------------------------------------------------
# Missing crop auto-create — only for the specific Phase 1 crop
# ---------------------------------------------------------------------------

# Crop name that is auto-created at stage3 startup (cloned from Romaine).
# All OTHER unmatched crops still fail loudly.
AUTO_CREATE_CROP_NAME: str = "Lettuce - Phase 1 (5cm)"
AUTO_CREATE_SOURCE_CROP: str = "Lettuce - Romaine"


def ensure_phase1_crop(db: Database, logger: logging.Logger) -> None:
    """
    Ensure 'Lettuce - Phase 1 (5cm)' exists in plant_data_enhanced.

    If missing, clones 'Lettuce - Romaine' and writes the new document.
    Called at stage3 startup.  If Romaine itself is missing, raises RuntimeError.

    Args:
        db: pymongo Database
        logger: stage logger

    Raises:
        RuntimeError: if Lettuce - Romaine does not exist (cannot clone)
    """
    existing = db.plant_data_enhanced.find_one(
        {"plantName": AUTO_CREATE_CROP_NAME}
    )
    if existing:
        logger.info(
            f"Crop '{AUTO_CREATE_CROP_NAME}' already exists — no action needed."
        )
        return

    source = db.plant_data_enhanced.find_one({"plantName": AUTO_CREATE_SOURCE_CROP})
    if not source:
        raise RuntimeError(
            f"Cannot auto-create '{AUTO_CREATE_CROP_NAME}': "
            f"source crop '{AUTO_CREATE_SOURCE_CROP}' not found in plant_data_enhanced."
        )

    # Clone with new identity fields
    new_doc = dict(source)
    new_doc["_id"] = ObjectId()
    new_doc["plantDataId"] = str(uuid.uuid4())
    # plantId field may or may not exist — handle both
    if "plantId" in new_doc:
        new_doc["plantId"] = str(uuid.uuid4())
    new_doc["plantName"] = AUTO_CREATE_CROP_NAME
    now = datetime.utcnow()
    new_doc["createdAt"] = now
    new_doc["updatedAt"] = now

    # Tag metadata so we can identify migration-created docs
    if "metadata" not in new_doc or new_doc["metadata"] is None:
        new_doc["metadata"] = {}
    new_doc["metadata"]["createdFor"] = "supabase_2026_04_07_import"

    db.plant_data_enhanced.insert_one(new_doc)
    logger.info(
        f"Auto-created crop '{AUTO_CREATE_CROP_NAME}' "
        f"(cloned from '{AUTO_CREATE_SOURCE_CROP}', "
        f"new plantDataId={new_doc['plantDataId']})"
    )


# Block type mapping from supabase → mongo enum
BLOCK_TYPE_MAP: dict[str, str] = {
    "Open Field": "openfield",
    "Green House": "greenhouse",
    "Net House": "nethouse",
    "Hydroponic": "hydroponic",
    "Hydroponics": "hydroponic",
}

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------


def make_logger(stage_name: str) -> logging.Logger:
    """
    Create a logger that writes to both stdout and a timestamped log file.

    Args:
        stage_name: e.g. "stage2_farms_blocks"

    Returns:
        Configured logger
    """
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = LOG_DIR / f"{stage_name}_{ts}.log"

    logger = logging.getLogger(stage_name)
    logger.setLevel(logging.DEBUG)

    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")

    # File handler
    fh = logging.FileHandler(log_path, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    # Stdout handler
    sh = logging.StreamHandler(sys.stdout)
    sh.setLevel(logging.INFO)
    sh.setFormatter(fmt)
    logger.addHandler(sh)

    logger.info(f"Log file: {log_path}")
    return logger


# ---------------------------------------------------------------------------
# MongoDB connection
# ---------------------------------------------------------------------------


def get_db() -> Database:
    """
    Return a pymongo Database handle for a64core_db.

    The client is module-level singleton — safe for single-threaded migration scripts.

    Returns:
        pymongo.database.Database
    """
    global _client
    if _client is None:
        _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        # Ping to validate connection early
        _client.admin.command("ping")
    return _client[MONGO_DB]


_client: Optional[MongoClient] = None


# ---------------------------------------------------------------------------
# UUID helpers
# ---------------------------------------------------------------------------


def new_uuid() -> str:
    """Return a new random UUID string."""
    return str(uuid.uuid4())


def deterministic_uuid(namespace: str, legacy_ref: str) -> str:
    """
    Generate a deterministic UUID from namespace + legacy_ref using UUID5.

    This ensures the same legacy record always produces the same UUID across
    re-runs, enabling safe idempotency without a lookup table.

    Args:
        namespace: e.g. "farm", "block", "archive", "harvest"
        legacy_ref: the supabase UUID or other unique legacy key

    Returns:
        UUID string

    Reason: Deterministic UUIDs mean upserts are truly idempotent —
    no orphan duplicates if a stage is re-run.
    """
    ns = uuid.UUID(hashlib.md5(namespace.encode()).hexdigest()[:32])
    return str(uuid.uuid5(ns, legacy_ref))


# ---------------------------------------------------------------------------
# Farming year helper
# ---------------------------------------------------------------------------


def get_farming_year(dt: datetime, start_month: int = FARMING_YEAR_START_MONTH) -> int:
    """
    Return the farming year for a given datetime.

    The farming year starts on start_month/1. A date in Aug 2025 → year 2025.
    A date in Jan 2026 → still 2025 (it started in Aug 2025).

    Args:
        dt: datetime (timezone-aware or naive)
        start_month: month the farming year begins (default 8 = August)

    Returns:
        Farming year integer (e.g. 2025)
    """
    if dt.month >= start_month:
        return dt.year
    return dt.year - 1


# ---------------------------------------------------------------------------
# Crop / plant_data_enhanced lookup
# ---------------------------------------------------------------------------


def load_seeds_and_yield_maps() -> tuple[dict[str, int], dict[str, float]]:
    """
    Load seedsPerDrip and NetYieldPerDripkg from standard_planning_rows.csv.

    These values come directly from the supabase planning table, NOT from
    plant_data_enhanced.  Each crop entry has:
      - seedsPerDrip: how many seeds/plants occupy a single drip
      - NetYieldPerDripkg: expected kg of yield per drip for this crop

    Used by stage2 (physical block drip baseline) and stage3 (virtual block
    plant count and predicted yield calculation).

    Args: none

    Returns:
        Tuple of (seeds_map, yield_map):
          seeds_map[crop_lower] = int seedsPerDrip
          yield_map[crop_lower] = float netYieldPerDripKg
        Both keyed by lower-stripped crop name for case-insensitive lookup.

    Raises:
        FileNotFoundError: if standard_planning_rows.csv is missing
        ValueError: if required columns (Item, seedsPerDrip, NetYieldPerDripkg)
                    are absent from the CSV
    """
    path = CSV_DIR / "standard_planning_rows.csv"
    seeds_map: dict[str, int] = {}
    yield_map: dict[str, float] = {}

    import csv as _csv
    with open(path, newline="", encoding="utf-8") as f:
        reader = _csv.DictReader(f)
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
                # Reason: safe fallback — 1 seed per drip if data is missing
                seeds_map[key] = 1
            try:
                yield_map[key] = float(row["NetYieldPerDripkg"])
            except (ValueError, TypeError):
                yield_map[key] = 0.0

    return seeds_map, yield_map


def load_crop_map(db: Database) -> dict[str, str]:
    """
    Build a case-insensitive name → UUID map from plant_data_enhanced.

    The collection uses 'plantDataId' as the UUID field (not 'plantId').

    Args:
        db: pymongo Database

    Returns:
        dict mapping lower-stripped crop name → plantDataId UUID string
    """
    crop_map: dict[str, str] = {}
    for doc in db.plant_data_enhanced.find(
        {}, {"plantName": 1, "plantDataId": 1, "_id": 0}
    ):
        name = doc.get("plantName", "")
        # Reason: field is plantDataId not plantId per actual collection schema
        plant_id = doc.get("plantDataId", "")
        if name and plant_id:
            crop_map[name.strip().lower()] = str(plant_id)
    return crop_map


def resolve_crop(
    crop_name: str,
    crop_map: dict[str, str],
    unmatched_collector: list[str],
) -> Optional[str]:
    """
    Resolve a crop name to its plantId UUID.

    If not matched, appends to unmatched_collector and returns None.
    The caller MUST check for None and handle accordingly.

    Args:
        crop_name: raw name from supabase
        crop_map: from load_crop_map()
        unmatched_collector: mutable list for collecting unmatched names

    Returns:
        plantId UUID string, or None if not found
    """
    key = crop_name.strip().lower()
    if key in crop_map:
        return crop_map[key]
    if key not in (x.strip().lower() for x in unmatched_collector):
        unmatched_collector.append(crop_name.strip())
    return None


# ---------------------------------------------------------------------------
# Farm code generation
# ---------------------------------------------------------------------------


def farm_code_from_number(n: int) -> str:
    """
    Generate a farm code like F011, F012, etc.

    Args:
        n: farm sequence number (11+)

    Returns:
        e.g. "F011"
    """
    return f"F{n:03d}"


def block_code(farm_code: str, seq: int) -> str:
    """
    Generate a physical block code like F011-001.

    Args:
        farm_code: e.g. "F011"
        seq: block sequence (1-based)

    Returns:
        e.g. "F011-001"
    """
    return f"{farm_code}-{seq:03d}"


def virtual_block_code(parent_block_code: str, counter: int) -> str:
    """
    Generate a virtual block code like F011-001/001.

    Args:
        parent_block_code: e.g. "F011-001"
        counter: 1-based counter from parent.virtualBlockCounter

    Returns:
        e.g. "F011-001/001"
    """
    return f"{parent_block_code}/{counter:03d}"


# ---------------------------------------------------------------------------
# Idempotent upsert by legacyRef
# ---------------------------------------------------------------------------


def upsert_by_legacy_ref(
    collection,
    doc: dict[str, Any],
    legacy_ref: str,
    dry_run: bool = False,
    logger: Optional[logging.Logger] = None,
) -> tuple[bool, bool]:
    """
    Upsert a document keyed by metadata.legacyRef.

    Uses replace_one with upsert=True. The document MUST have
    doc['metadata']['legacyRef'] == legacy_ref.

    Args:
        collection: pymongo Collection
        doc: full document to upsert
        legacy_ref: the supabase UUID / key
        dry_run: if True, does not write
        logger: optional logger

    Returns:
        (was_inserted: bool, was_updated: bool)
    """
    if dry_run:
        if logger:
            logger.debug(f"[DRY-RUN] Would upsert legacyRef={legacy_ref}")
        return False, False

    result = collection.replace_one(
        {"metadata.legacyRef": legacy_ref},
        doc,
        upsert=True,
    )
    inserted = result.upserted_id is not None
    updated = result.modified_count > 0
    return inserted, updated


# ---------------------------------------------------------------------------
# --reset helper
# ---------------------------------------------------------------------------


def reset_migration_data(db: Database, collections: list[str], logger: logging.Logger) -> None:
    """
    Delete all documents tagged with MIGRATION_TAG from the given collections.

    Does NOT touch PC Farm data (farmId != PC_FARM_UUID is enforced by the
    migration tag — PC Farm docs never receive metadata.migratedFrom).

    Args:
        db: pymongo Database
        collections: list of collection names to clean
        logger: logger instance
    """
    for col_name in collections:
        col = db[col_name]
        result = col.delete_many({"metadata.migratedFrom": MIGRATION_TAG})
        logger.info(f"[RESET] {col_name}: deleted {result.deleted_count} docs")


# ---------------------------------------------------------------------------
# Argument parser factory
# ---------------------------------------------------------------------------


def make_arg_parser(description: str) -> argparse.ArgumentParser:
    """
    Return a standard argument parser with --dry-run, --reset, and
    --create-missing-crops flags.

    Args:
        description: script description string

    Returns:
        argparse.ArgumentParser
    """
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and compute without writing to MongoDB",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete all migration-tagged docs before importing (idempotent reset)",
    )
    parser.add_argument(
        "--create-missing-crops",
        action="store_true",
        help=(
            "Auto-create known missing crops (e.g. Lettuce - Phase 1 (5cm)) "
            "before stage3 runs.  Other unmatched crops still fail loudly."
        ),
    )
    return parser


# ---------------------------------------------------------------------------
# Summary printer
# ---------------------------------------------------------------------------


def print_summary(
    stage: str,
    rows_read: int,
    rows_inserted: int,
    rows_updated: int,
    rows_skipped: int,
    rows_errored: int,
    error_samples: list[str],
    logger: logging.Logger,
) -> None:
    """
    Print a formatted summary table at the end of a stage script.

    Args:
        stage: stage name
        rows_read: total input rows processed
        rows_inserted: new documents inserted
        rows_updated: existing documents updated
        rows_skipped: rows deliberately skipped (e.g. dry-run or already exists)
        rows_errored: rows that failed
        error_samples: list of sample error descriptions (first 5 shown)
        logger: logger instance
    """
    logger.info("")
    logger.info("=" * 60)
    logger.info(f"  SUMMARY: {stage}")
    logger.info("=" * 60)
    logger.info(f"  Rows read:     {rows_read}")
    logger.info(f"  Rows inserted: {rows_inserted}")
    logger.info(f"  Rows updated:  {rows_updated}")
    logger.info(f"  Rows skipped:  {rows_skipped}")
    logger.info(f"  Rows errored:  {rows_errored}")
    if error_samples:
        logger.info("  Error samples (first 5):")
        for s in error_samples[:5]:
            logger.info(f"    - {s}")
    logger.info("=" * 60)


# ---------------------------------------------------------------------------
# now() helper
# ---------------------------------------------------------------------------


def utcnow() -> datetime:
    """Return current UTC datetime (timezone-naive, matching existing docs)."""
    return datetime.utcnow()
