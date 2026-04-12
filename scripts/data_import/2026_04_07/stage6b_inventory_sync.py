"""
stage6b_inventory_sync.py — Sync purchase_register into inventory_input / inventory_asset
with realistic stock = received - consumed.

4-pass pipeline:
  Pass 1 — Classify items from purchase_register into a catalog (inventory docs)
  Pass 2 — Build "received" movements from each voucher line
  Pass 3 — Build "consumed" movements from block_archives + active virtual blocks
            using standard_planning_rows.csv fertilizer schedules
  Pass 4 — Reconcile: received - consumed → final quantity on catalog docs

Source collections:
  purchase_register — 130 vouchers, 401 items (already imported by stage6)
  block_archives    — 956 docs; plantedDate, targetCropName, maxPlants (used as drip proxy)
  blocks            — virtual blocks; metadata.totalDrips, plantedDate, targetCropName
  plant_data_enhanced — crop name lookup

Target collections:
  inventory_input   — fertilizers, pesticides, seeds, other inputs
  inventory_asset   — pumps, motors, pipes, equipment
  inventory_movements — raw movement journal (received / consumed)

Constraints:
  - Do NOT touch PC Farm data (farmId 23d67318-415e-49bf-a2b6-515b38974bde)
  - Do NOT re-run earlier stages
  - Idempotent: upsert catalog by metadata.legacyRef, movements by deterministic movementId

Run:
  python stage6b_inventory_sync.py --dry-run   # validate, no writes
  python stage6b_inventory_sync.py             # real run
  python stage6b_inventory_sync.py --reset     # delete migration-tagged docs then re-import
"""

from __future__ import annotations

import csv
import json
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from uuid import UUID

sys.path.insert(0, str(Path(__file__).parent))

from common import (
    CSV_DIR,
    DIVISION_ID,
    MIGRATION_TAG,
    ORGANIZATION_ID,
    PC_FARM_UUID,
    deterministic_uuid,
    get_db,
    make_arg_parser,
    make_logger,
    print_summary,
    reset_migration_data,
    utcnow,
)

STAGE = "stage6b_inventory_sync"
RESET_COLLECTIONS = ["inventory_input", "inventory_asset", "inventory_movements"]

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CREATED_BY: str = "bff26b8f-5ce9-49b2-9126-86174eaea823"
CUTOFF_DATE: datetime = datetime(2025, 8, 1)

# Base unit names used in MongoDB docs (plain strings, not enum values)
BASE_UNIT_MG: str = "mg"
BASE_UNIT_ML: str = "ml"
BASE_UNIT_UNIT: str = "unit"

# Inventory scope
INVENTORY_SCOPE_ORG: str = "organization"

# Inventory types
INV_TYPE_INPUT: str = "input"
INV_TYPE_ASSET: str = "asset"

# Movement types
MOV_TYPE_RECEIVED: str = "received"
MOV_TYPE_CONSUMED: str = "consumed"


# ---------------------------------------------------------------------------
# Pass 1 — Classification keywords
# ---------------------------------------------------------------------------

# Regex pattern for NPK-style numbers (e.g. 20-20-20, 28.14.14)
NPK_PATTERN = re.compile(r"\d+[.\-]\d+[.\-]\d+")

# Keywords that classify an item as fertilizer
FERTILIZER_KEYWORDS = [
    "NITRATE", "POTASH", "SULFATE", "SULPHATE", "UREA", "NPK",
    "PHOSPHATE", "NORUS", "CHELATED", "HUMIC", "AMINO", "FERRO",
    "AMCOTON", "PHOSPHORIC", "CALCIUM", "POTASSIUM", "MAGNESIUM",
]

# Keywords that classify as seed (checked first — starts-with "SEED" wins)
SEED_KEYWORDS = ["SEED", "SEEDS"]

# Keywords that classify as pesticide
PESTICIDE_KEYWORDS = [
    "PESTICIDE", "INSECTICIDE", "FUNGICIDE", "HERBICIDE",
    "TRITON", "ACTARA", "CONFIDOR",
]

# Keywords that classify as asset (infrastructure/equipment)
ASSET_KEYWORDS = [
    "PUMP", "MOTOR", "GENERATOR", "VALVE", "PIPE", "FILTER",
    "TANK", "DRIPPER", "SPRAYER", "CABLE", "CONTROLLER",
    "METER", "SENSOR", "ENGINE",
]

# Keywords that classify as expense (skip — no inventory entry)
EXPENSE_KEYWORDS = [
    "REPAIR", "SERVICE", "MAINTENANCE", "LABOR", "TRANSPORT",
    "FREIGHT", "DELIVERY", "FEE", "COMMISSION", "CONSULTANCY", "VAT",
]


def classify_item(name: str) -> str:
    """
    Classify a purchase item name into one of:
    fertilizer | seed | pesticide | asset | expense_skip | other

    Args:
        name: raw item name from purchase_register

    Returns:
        Classification string
    """
    upper = name.upper()

    # expense_skip — check first so "PUMP REPAIR" is skipped, not classified as asset
    for kw in EXPENSE_KEYWORDS:
        if kw in upper:
            return "expense_skip"

    # seed — starts with SEED wins
    if upper.strip().startswith("SEED"):
        return "seed"

    # fertilizer — keyword match OR NPK numeric pattern
    for kw in FERTILIZER_KEYWORDS:
        if kw in upper:
            return "fertilizer"
    if NPK_PATTERN.search(upper):
        return "fertilizer"

    # pesticide
    for kw in PESTICIDE_KEYWORDS:
        if kw in upper:
            return "pesticide"

    # asset
    for kw in ASSET_KEYWORDS:
        if kw in upper:
            return "asset"

    return "other"


# ---------------------------------------------------------------------------
# Unit / base-unit conversion helpers
# ---------------------------------------------------------------------------

# Multiplier to convert display qty to base qty in mg
UNIT_TO_BASE_KG: dict[str, float] = {
    "BAG_FERTILIZER_POTASH": 50.0,   # BAG of potash/sulphate potash → 50 kg
    "BAG_FERTILIZER_OTHER": 25.0,    # BAG of other fertilizer → 25 kg
    "BAG_SEED": 1.0,                 # BAG of seed → 1 kg
    "BAG_OTHER": 25.0,               # BAG of misc → 25 kg
    "Kg": 1.0,
    "Pack": 1.0,
}

UNIT_TO_BASE_L: dict[str, float] = {
    "Ltr": 1.0,
    "Bottle": 1.0,
    "Gal": 3.785,
    "Gallon": 3.785,
    "CAN": 20.0,
}

COUNTABLE_UNITS: set[str] = {"NOS", "PCS", "Roll", "pc", "NOS ", None}


def _bag_kg_factor(item_name: str, classification: str) -> float:
    """
    Return the kg per BAG based on item name and classification.

    Args:
        item_name: canonical item name
        classification: one of fertilizer|seed|pesticide|other|...

    Returns:
        kg per BAG
    """
    if classification == "seed":
        return 1.0
    upper = item_name.upper()
    if classification == "fertilizer" and ("POTASH" in upper or "SULPHATE" in upper):
        return 50.0
    return 25.0


def compute_base_unit_and_qty(
    qty: float,
    unit: Optional[str],
    classification: str,
    item_name: str,
) -> tuple[str, float, str]:
    """
    Convert qty + unit to (display_unit, base_quantity, base_unit).

    BAG is expanded using bag-content defaults.
    Solids → mg, liquids → ml, countables → unit.

    Args:
        qty: quantity from voucher
        unit: unit string from voucher (may be None)
        classification: item classification
        item_name: for bag-content resolution

    Returns:
        (normalised_display_unit, base_quantity, base_unit_str)
    """
    safe_qty = qty or 0.0
    u = (unit or "NOS").strip()

    if u == "BAG":
        kg_per_bag = _bag_kg_factor(item_name, classification)
        total_kg = safe_qty * kg_per_bag
        return ("kg", total_kg * 1_000_000, BASE_UNIT_MG)  # kg → mg

    if u in ("Kg", "Pack"):
        return ("kg", safe_qty * 1_000_000, BASE_UNIT_MG)   # 1 kg = 1,000,000 mg

    if u in ("Ltr", "Bottle"):
        return ("L", safe_qty * 1_000, BASE_UNIT_ML)         # 1 L = 1000 ml

    if u == "Gal" or u == "Gallon":
        return ("L", safe_qty * 3.785 * 1_000, BASE_UNIT_ML)

    if u == "CAN":
        return ("L", safe_qty * 20.0 * 1_000, BASE_UNIT_ML)

    if u == "Kg":
        return ("kg", safe_qty * 1_000_000, BASE_UNIT_MG)

    # Countable: NOS, PCS, Roll, pc, etc.
    return ("unit", safe_qty, BASE_UNIT_UNIT)


def base_qty_to_display(base_qty: float, base_unit: str, display_unit: str) -> float:
    """
    Convert base_qty back to display unit.

    Args:
        base_qty: quantity in base units (mg / ml / unit)
        base_unit: "mg" | "ml" | "unit"
        display_unit: target display unit

    Returns:
        Quantity in display unit
    """
    if base_unit == BASE_UNIT_MG:
        if display_unit == "kg":
            return base_qty / 1_000_000
        if display_unit == "g":
            return base_qty / 1_000
        return base_qty   # mg stays mg
    if base_unit == BASE_UNIT_ML:
        if display_unit == "L":
            return base_qty / 1_000
        return base_qty   # ml stays ml
    return base_qty   # unit stays unit


def infer_base_unit_from_display(display_unit: str, classification: str) -> str:
    """
    Infer base_unit from display_unit and classification.

    Args:
        display_unit: normalised display unit
        classification: item classification

    Returns:
        base_unit string
    """
    if display_unit in ("kg", "g", "mg"):
        return BASE_UNIT_MG
    if display_unit in ("L", "ml"):
        return BASE_UNIT_ML
    if classification in ("fertilizer",):
        return BASE_UNIT_MG
    if classification in ("pesticide",):
        return BASE_UNIT_ML
    return BASE_UNIT_UNIT


# ---------------------------------------------------------------------------
# Catalog item name normalisation
# ---------------------------------------------------------------------------


def canonical_name(raw: str) -> str:
    """
    Normalise an item name: collapse whitespace, title-case.

    Args:
        raw: raw item name

    Returns:
        Canonical name string
    """
    return " ".join(raw.strip().split()).title()


def canonical_key(raw: str) -> str:
    """
    Return a lowercase, whitespace-collapsed key for map lookups.

    Args:
        raw: raw or canonical item name

    Returns:
        Lowercase key string
    """
    return " ".join(raw.strip().lower().split())


# ---------------------------------------------------------------------------
# Pass 3 — Fertilizer planning helpers
# ---------------------------------------------------------------------------

# Fertilizer name aliases: planning name → catalog canonical_key pattern
# Reason: planning data uses abbreviated or slightly misspelled names that need
# explicit mapping to canonical catalog keys.
FERTILIZER_ALIASES: dict[str, str] = {
    "cal nitrate": "calcium nitrate",
    "mg sulfate": "magnesium sulphate",
    "mg sul": "magnesium sulphate",
    "magnesium sulfate": "magnesium sulphate",
    "potassium sulfate": "sulphate potash",
    "pottassium sulfate": "sulphate potash",
    "pottassium sulphate": "sulphate potash",
    "pottasium sulfate": "sulphate potash",
    "pottasium sulphate": "sulphate potash",
    # planning uses short names for common compounds
    "map": "map 12-61-0",
    "mkp": "mkpo 0-52-34",
    "phosphric acid": "phosphoric acid",
    "chaleted micro": "librel mix chelated rmx26",
    "chelated micro": "librel mix chelated rmx26",
    # NPK-only names: map to single canonical catalog key
    # 20.20.20 → platinum 20-20-20+te (primary catalog item, largest quantity)
    "20.20.20": "platinum 20-20-20+te",
    "20-20-20": "platinum 20-20-20+te",
    # 28.14.14 → platinum 28-14-14+te
    "28.14.14": "platinum 28-14-14+te",
    "28-14-14": "platinum 28-14-14+te",
    # 12.61.0 → map 12-61-0
    "12.61.0": "map 12-61-0",
    "12-61-0": "map 12-61-0",
    # 0.0.60 → norus 0-0-60+te (potassium)
    "0.0.60": "norus 0-0-60+te",
    "0-0-60": "norus 0-0-60+te",
    # potassium nitrate aliases
    "potassium nitrate": "potassium nitrate",
}


def _normalise_npk(s: str) -> str:
    """Collapse separators in NPK strings: 20-20-20 → 202020, 20.20.20 → 202020."""
    return re.sub(r"[.\-]", "", s)


def match_fertilizer_to_catalog(
    plan_name: str,
    catalog: dict[str, dict],
) -> Optional[str]:
    """
    Match a planning fertilizer name to a catalog key using 4 strategies.

    Args:
        plan_name: fertilizer name from standard_planning (e.g. "Cal Nitrate")
        catalog: dict keyed by canonical_key → catalog doc

    Returns:
        Matched catalog key, or None if not found
    """
    pn_lower = plan_name.strip().lower()

    # Strategy 1: alias substitution
    resolved = FERTILIZER_ALIASES.get(pn_lower, pn_lower)

    # Strategy 2: exact match
    if resolved in catalog:
        return resolved
    if pn_lower in catalog:
        return pn_lower

    # Strategy 3: contains match (either direction)
    for cat_key in catalog:
        if len(resolved) >= 4 and resolved in cat_key:
            return cat_key
        if len(cat_key) >= 4 and cat_key in resolved:
            return cat_key

    # Strategy 4: NPK numeric normalisation
    # Extract the NPK triplet from plan name AND catalog key using regex,
    # then compare normalised (separator-stripped) forms.
    # e.g. "20.20.20" matches "platinum 20-20-20+te" because both yield "202020"
    pn_matches = NPK_PATTERN.findall(resolved)
    if pn_matches:
        pn_npk = _normalise_npk(pn_matches[0])
        if pn_npk and pn_npk not in ("", "0"):
            for cat_key in catalog:
                cat_matches = NPK_PATTERN.findall(cat_key)
                for cat_m in cat_matches:
                    cat_npk = _normalise_npk(cat_m)
                    if cat_npk == pn_npk:
                        return cat_key

    return None


# ---------------------------------------------------------------------------
# Load planning data
# ---------------------------------------------------------------------------


def load_planning_data(logger) -> dict[str, dict[str, float]]:
    """
    Load standard_planning_rows.csv into {crop_lower: {fertilizer_name: total_kg_per_drip}}.

    ProcessedFertilizerData is a JSON array:
      [{"identifier": "Urea", "value": 21.0}, ...]
    where value = total kg per drip for the full cycle (pre-computed sum).

    Args:
        logger: logger instance

    Returns:
        dict[crop_lower, dict[fertilizer_lower, total_kg_per_drip]]
    """
    path = CSV_DIR / "standard_planning_rows.csv"
    plan_map: dict[str, dict[str, float]] = {}

    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            item = (row.get("Item") or "").strip()
            if not item or item.lower() in ("empty", ""):
                continue
            pfd_raw = (row.get("ProcessedFertilizerData") or "").strip()
            if not pfd_raw or pfd_raw == "0":
                continue
            try:
                fert_list = json.loads(pfd_raw)
                if not isinstance(fert_list, list):
                    continue
            except (json.JSONDecodeError, ValueError):
                logger.warning(f"  [PLAN] Cannot parse ProcessedFertilizerData for {item!r}")
                continue

            fert_map: dict[str, float] = {}
            for entry in fert_list:
                if not isinstance(entry, dict):
                    continue
                fert_name = (entry.get("identifier") or "").strip()
                val = entry.get("value", 0.0)
                try:
                    val = float(val)
                except (TypeError, ValueError):
                    val = 0.0
                if fert_name and val > 0:
                    # Reason: store by lowercase for case-insensitive lookup
                    fert_map[fert_name.lower()] = val

            if fert_map:
                plan_map[item.lower()] = fert_map

    logger.info(f"Loaded planning data for {len(plan_map)} crops")
    return plan_map


# ---------------------------------------------------------------------------
# Pydantic-style validation shim
# ---------------------------------------------------------------------------


def _validate_input_doc(doc: dict) -> list[str]:
    """
    Validate a proposed inventory_input document against required fields.

    Returns a list of validation error strings (empty = valid).
    """
    errors: list[str] = []
    required_fields = [
        "inventoryId", "organizationId", "itemName", "category",
        "quantity", "unit", "minimumStock", "inventoryScope",
        "baseUnit", "baseQuantity", "baseMinimumStock", "isLowStock",
        "transferHistory", "divisionId", "createdBy", "createdAt",
        "updatedAt",
    ]
    for f in required_fields:
        if f not in doc:
            errors.append(f"Missing required field: {f}")

    if "category" in doc and doc["category"] not in (
        "fertilizer", "pesticide", "herbicide", "fungicide",
        "seed", "seedling", "soil", "substrate", "nutrient_solution",
        "growth_regulator", "packaging", "other",
    ):
        errors.append(f"Invalid category: {doc['category']!r}")

    if "inventoryScope" in doc and doc["inventoryScope"] not in ("organization", "farm"):
        errors.append(f"Invalid inventoryScope: {doc['inventoryScope']!r}")

    if "baseUnit" in doc and doc["baseUnit"] not in ("mg", "ml", "unit"):
        errors.append(f"Invalid baseUnit: {doc['baseUnit']!r}")

    qty = doc.get("quantity", 0)
    if not isinstance(qty, (int, float)) or qty < 0:
        errors.append(f"Invalid quantity: {qty!r}")

    return errors


def _validate_asset_doc(doc: dict) -> list[str]:
    """
    Validate a proposed inventory_asset document against required fields.

    Returns a list of validation error strings (empty = valid).
    """
    errors: list[str] = []
    required_fields = [
        "inventoryId", "organizationId", "assetName", "category",
        "inventoryScope", "createdBy", "createdAt", "updatedAt",
    ]
    for f in required_fields:
        if f not in doc:
            errors.append(f"Missing required field: {f}")

    if "category" in doc and doc["category"] not in (
        "tractor", "harvester", "irrigation_system", "greenhouse",
        "storage_facility", "vehicle", "tool", "equipment",
        "infrastructure", "sensor", "other",
    ):
        errors.append(f"Invalid asset category: {doc['category']!r}")

    return errors


# ---------------------------------------------------------------------------
# Classify asset category
# ---------------------------------------------------------------------------


def classify_asset_category(name: str) -> str:
    """
    Map asset item name to an AssetCategory enum value string.

    Args:
        name: item name

    Returns:
        AssetCategory string value
    """
    upper = name.upper()
    if any(k in upper for k in ("PUMP", "MOTOR", "ENGINE")):
        return "equipment"
    if any(k in upper for k in ("PIPE", "VALVE", "NIPPLE", "UNION", "COUPLER", "ADAPTER", "SOCKET")):
        return "infrastructure"
    if any(k in upper for k in ("FILTER",)):
        return "irrigation_system"
    if any(k in upper for k in ("CABLE", "CONTROLLER", "HAGER", "STARTER", "SENSOR")):
        return "equipment"
    if any(k in upper for k in ("TANK",)):
        return "storage_facility"
    if any(k in upper for k in ("METER",)):
        return "equipment"
    return "other"


# ---------------------------------------------------------------------------
# Map classification → InputCategory for input items
# ---------------------------------------------------------------------------

CLASSIFICATION_TO_INPUT_CATEGORY: dict[str, str] = {
    "fertilizer": "fertilizer",
    "pesticide": "pesticide",
    "seed": "seed",
    "other": "other",
}


# ---------------------------------------------------------------------------
# Pass 1 — Build catalog
# ---------------------------------------------------------------------------


def build_catalog(
    db,
    logger,
    dry_run: bool,
) -> tuple[dict[str, dict], dict[str, int]]:
    """
    Aggregate distinct purchase items into catalog docs.

    Groups by canonical item name.  Computes weighted average unit cost,
    picks most-recent supplier, earliest purchase date.

    Args:
        db: pymongo Database
        logger: logger instance
        dry_run: if True skip DB writes

    Returns:
        (catalog: dict[canonical_key → catalog_doc],
         classification_counts: dict[class → count])
    """
    now = utcnow()

    # Aggregate all items from purchase_register
    item_accum: dict[str, dict[str, Any]] = {}

    for voucher in db.purchase_register.find({"metadata.migratedFrom": MIGRATION_TAG}):
        voucher_id = str(voucher.get("voucherId", ""))
        voucher_date: datetime = voucher.get("date", now)
        supplier = str(voucher.get("supplier") or "Unknown")

        for item in voucher.get("items", []):
            raw_name: str = (item.get("name") or "").strip()
            if not raw_name:
                continue

            cname = canonical_name(raw_name)
            ckey = canonical_key(cname)

            qty: float = float(item.get("qty") or 0.0)
            rate: float = float(item.get("rate") or 0.0)
            amount: float = float(item.get("amount") or 0.0)
            unit: Optional[str] = item.get("unit")

            if ckey not in item_accum:
                item_accum[ckey] = {
                    "canonical_name": cname,
                    "unit": unit,
                    "total_qty": 0.0,
                    "total_amount": 0.0,
                    "qty_for_wavg": 0.0,
                    "cost_for_wavg": 0.0,
                    "earliest_date": voucher_date,
                    "latest_date": voucher_date,
                    "latest_supplier": supplier,
                    "voucher_refs": [],
                }

            acc = item_accum[ckey]
            acc["total_qty"] += qty
            acc["total_amount"] += amount
            # weighted avg: track sum(rate*qty) and sum(qty) separately
            if rate and qty:
                acc["qty_for_wavg"] += qty
                acc["cost_for_wavg"] += rate * qty

            if voucher_date < acc["earliest_date"]:
                acc["earliest_date"] = voucher_date
            if voucher_date >= acc["latest_date"]:
                acc["latest_date"] = voucher_date
                acc["latest_supplier"] = supplier

            if unit and not acc["unit"]:
                acc["unit"] = unit

            acc["voucher_refs"].append(voucher_id)

    logger.info(f"Pass 1: aggregated {len(item_accum)} distinct item names from purchase_register")

    # Build catalog docs
    catalog: dict[str, dict] = {}
    classification_counts: dict[str, int] = defaultdict(int)
    validation_failures: list[str] = []
    inserted = updated = 0

    for ckey, acc in item_accum.items():
        classification = classify_item(acc["canonical_name"])
        classification_counts[classification] += 1

        if classification == "expense_skip":
            continue  # No inventory doc for expenses

        # Compute weighted avg unit cost
        unit_cost: Optional[float] = None
        if acc["qty_for_wavg"] > 0:
            unit_cost = acc["cost_for_wavg"] / acc["qty_for_wavg"]

        # Normalise display unit
        raw_unit = (acc["unit"] or "NOS").strip()
        _, dummy_base_qty, base_unit = compute_base_unit_and_qty(
            1.0, raw_unit, classification, acc["canonical_name"]
        )
        # Pick a sensible display unit after BAG expansion
        if raw_unit == "BAG" or raw_unit in ("Kg", "Pack"):
            display_unit = "kg"
        elif raw_unit in ("Ltr", "Bottle", "Gal", "Gallon", "CAN"):
            display_unit = "L"
        else:
            display_unit = raw_unit  # NOS, PCS, Roll, etc.

        # Deterministic inventoryId
        legacy_ref = f"purchase_item|{ckey}"
        inventory_id = deterministic_uuid("inventory_catalog", legacy_ref)

        # Build base quantity from display quantity = 0 (filled in Pass 4)
        base_quantity = 0.0
        base_minimum_stock = 0.0

        is_asset = classification == "asset"

        if is_asset:
            asset_category = classify_asset_category(acc["canonical_name"])
            doc: dict[str, Any] = {
                "inventoryId": inventory_id,
                "farmId": None,
                "organizationId": ORGANIZATION_ID,
                "assetName": acc["canonical_name"],
                "category": asset_category,
                "assetTag": None,
                "serialNumber": None,
                "brand": None,
                "model": None,
                "year": None,
                "status": "operational",
                "condition": None,
                "location": None,
                "assignedTo": None,
                "purchaseDate": acc["earliest_date"],
                "purchasePrice": unit_cost,
                "currentValue": None,
                "currency": "AED",
                "lastMaintenanceDate": None,
                "nextMaintenanceDate": None,
                "maintenanceNotes": None,
                "specifications": None,
                "warrantyExpiry": None,
                "documentationUrl": None,
                "notes": None,
                "inventoryScope": INVENTORY_SCOPE_ORG,
                "maintenanceOverdue": False,
                "currentAllocation": None,
                "allocationHistory": [],
                "divisionId": DIVISION_ID,
                "createdBy": CREATED_BY,
                "createdAt": now,
                "updatedAt": now,
                "supplier": acc["latest_supplier"],
                "metadata": {
                    "migratedFrom": MIGRATION_TAG,
                    "legacyRef": legacy_ref,
                    "classificationSource": "auto_keyword",
                    "totalReceivedQty": acc["total_qty"],
                    "totalReceivedAmt": acc["total_amount"],
                },
            }
            errs = _validate_asset_doc(doc)
        else:
            input_category = CLASSIFICATION_TO_INPUT_CATEGORY.get(classification, "other")
            doc = {
                "inventoryId": inventory_id,
                "farmId": None,
                "organizationId": ORGANIZATION_ID,
                "productId": None,
                "itemName": acc["canonical_name"],
                "category": input_category,
                "brand": None,
                "sku": None,
                "quantity": 0.0,
                "unit": display_unit,
                "minimumStock": 0.0,
                "purchaseDate": acc["earliest_date"],
                "expiryDate": None,
                "storageLocation": None,
                "unitCost": unit_cost,
                "currency": "AED",
                "supplier": acc["latest_supplier"],
                "activeIngredients": None,
                "concentration": None,
                "applicationRate": None,
                "safetyNotes": None,
                "notes": None,
                "inventoryScope": INVENTORY_SCOPE_ORG,
                "baseUnit": base_unit,
                "baseQuantity": base_quantity,
                "baseMinimumStock": base_minimum_stock,
                "isLowStock": False,
                "transferHistory": [],
                "divisionId": DIVISION_ID,
                "createdBy": CREATED_BY,
                "createdAt": now,
                "updatedAt": now,
                "lastUsedAt": None,
                "reservedQuantity": 0.0,
                "availableQuantity": 0.0,
                "metadata": {
                    "migratedFrom": MIGRATION_TAG,
                    "legacyRef": legacy_ref,
                    "classificationSource": "auto_keyword",
                },
            }
            errs = _validate_input_doc(doc)

        if errs:
            msg = f"Validation failed for {acc['canonical_name']!r}: {errs}"
            logger.error(msg)
            validation_failures.append(msg)
            continue

        # Store in memory catalog keyed by ckey
        catalog[ckey] = {
            "doc": doc,
            "is_asset": is_asset,
            "classification": classification,
            "display_unit": display_unit,
            "base_unit": base_unit,
            "legacy_ref": legacy_ref,
            "inventory_id": inventory_id,
        }

        # Write to DB
        if not dry_run:
            collection = db.inventory_asset if is_asset else db.inventory_input
            result = collection.replace_one(
                {"metadata.legacyRef": legacy_ref},
                doc,
                upsert=True,
            )
            if result.upserted_id:
                inserted += 1
            else:
                updated += 1
        else:
            inserted += 1  # Count as "would insert"

    if validation_failures:
        logger.warning(f"Pass 1: {len(validation_failures)} validation failure(s)")
        for msg in validation_failures[:5]:
            logger.warning(f"  {msg}")

    logger.info(
        f"Pass 1 done: {len(catalog)} catalog items "
        f"(input={sum(1 for v in catalog.values() if not v['is_asset'])}, "
        f"asset={sum(1 for v in catalog.values() if v['is_asset'])}), "
        f"inserted={inserted}, updated={updated}"
    )
    logger.info(f"Pass 1 classification: {dict(classification_counts)}")
    return catalog, dict(classification_counts), validation_failures


# ---------------------------------------------------------------------------
# Pass 2 — Received movements
# ---------------------------------------------------------------------------


def build_received_movements(
    db,
    catalog: dict[str, dict],
    logger,
    dry_run: bool,
) -> tuple[int, float]:
    """
    Build inventory_movements docs of type "received" from purchase_register.

    Args:
        db: pymongo Database
        catalog: from Pass 1
        logger: logger instance
        dry_run: if True skip DB writes

    Returns:
        (movement_count, total_received_value_AED)
    """
    now = utcnow()
    inserted = skipped = 0
    total_value = 0.0

    for voucher in db.purchase_register.find({"metadata.migratedFrom": MIGRATION_TAG}):
        voucher_id = str(voucher.get("voucherId", ""))
        voucher_date: datetime = voucher.get("date", now)
        supplier = str(voucher.get("supplier") or "Unknown")

        for item in voucher.get("items", []):
            raw_name: str = (item.get("name") or "").strip()
            if not raw_name:
                continue

            ckey = canonical_key(canonical_name(raw_name))
            if ckey not in catalog:
                # expense_skip or validation failure — skip silently
                continue

            cat = catalog[ckey]
            qty: float = float(item.get("qty") or 0.0)
            raw_unit: Optional[str] = item.get("unit")
            rate: float = float(item.get("rate") or 0.0)
            amount: float = float(item.get("amount") or 0.0)

            display_unit, base_qty, base_unit = compute_base_unit_and_qty(
                qty, raw_unit, cat["classification"], cat["doc"].get("itemName") or cat["doc"].get("assetName", "")
            )

            # Deterministic movementId
            movement_id = deterministic_uuid(
                "inventory_movement_received",
                f"{voucher_id}|{ckey}|{qty}|{raw_unit}",
            )

            mov_doc = {
                "movementId": movement_id,
                "inventoryId": cat["inventory_id"],
                "inventoryType": INV_TYPE_ASSET if cat["is_asset"] else INV_TYPE_INPUT,
                "type": MOV_TYPE_RECEIVED,
                "quantity": qty,
                "unit": display_unit,
                "baseQuantity": base_qty,
                "baseUnit": base_unit,
                "sourceType": "purchase",
                "sourceRef": voucher_id,
                "supplier": supplier,
                "unitCost": rate,
                "totalCost": amount,
                "movementDate": voucher_date,
                "createdBy": CREATED_BY,
                "divisionId": DIVISION_ID,
                "organizationId": ORGANIZATION_ID,
                "createdAt": now,
                "updatedAt": now,
                "metadata": {
                    "migratedFrom": MIGRATION_TAG,
                },
            }

            total_value += amount

            if not dry_run:
                result = db.inventory_movements.replace_one(
                    {"movementId": movement_id},
                    mov_doc,
                    upsert=True,
                )
                if result.upserted_id:
                    inserted += 1
                else:
                    skipped += 1
            else:
                inserted += 1

    logger.info(
        f"Pass 2 done: {inserted} received movements written "
        f"({skipped} already existed), total value AED {total_value:,.2f}"
    )
    return inserted, total_value


# ---------------------------------------------------------------------------
# Pass 3 — Consumed movements from cycles
# ---------------------------------------------------------------------------


def build_consumed_movements(
    db,
    catalog: dict[str, dict],
    plan_map: dict[str, dict[str, float]],
    logger,
    dry_run: bool,
) -> tuple[int, set[str], dict[str, int]]:
    """
    Build inventory_movements docs of type "consumed" from cycles.

    Scans block_archives (planted >= Aug 2025) + active virtual blocks (not PC Farm).
    Matches fertilizer names from plan_map to catalog items.

    Args:
        db: pymongo Database
        catalog: from Pass 1 (keyed by canonical_key)
        plan_map: from load_planning_data()
        logger: logger instance
        dry_run: if True skip DB writes

    Returns:
        (movement_count, unmatched_fertilizer_names, skip_counts_by_reason)
    """
    now = utcnow()
    inserted = already_exists = 0
    unmatched_fertilizers: set[str] = set()
    skip_counts: dict[str, int] = defaultdict(int)

    def _process_cycle(
        cycle_id: str,
        planted_date: Optional[datetime],
        crop_name: str,
        drips: int,
        source_type: str,
    ) -> int:
        """Process a single cycle, return number of movements created."""
        nonlocal inserted, already_exists

        if not planted_date or planted_date < CUTOFF_DATE:
            skip_counts["before_cutoff"] += 1
            return 0

        crop_lower = crop_name.strip().lower()
        if crop_lower not in plan_map:
            skip_counts["no_plan"] += 1
            logger.debug(f"  [SKIP] No plan for crop {crop_name!r}")
            return 0

        if drips <= 0:
            skip_counts["zero_drips"] += 1
            return 0

        fert_plan = plan_map[crop_lower]
        count = 0

        for fert_lower, kg_per_drip in fert_plan.items():
            total_kg = kg_per_drip * drips
            if total_kg <= 0:
                continue

            # Match fertilizer to catalog
            matched_ckey = match_fertilizer_to_catalog(fert_lower, catalog)
            if not matched_ckey:
                unmatched_fertilizers.add(fert_lower)
                continue

            cat = catalog[matched_ckey]
            if cat["is_asset"]:
                # Assets don't get consumed movements
                continue

            base_unit = cat["base_unit"]
            # Reason: planning values are always kg; convert based on base_unit
            if base_unit == BASE_UNIT_MG:
                base_consumed = total_kg * 1_000_000   # kg → mg
                display_qty = total_kg
                display_unit = "kg"
            elif base_unit == BASE_UNIT_ML:
                # Assume planning values in L for liquid fertilizers
                base_consumed = total_kg * 1_000       # L → ml
                display_qty = total_kg
                display_unit = "L"
            else:
                base_consumed = total_kg
                display_qty = total_kg
                display_unit = "unit"

            movement_id = deterministic_uuid(
                "inventory_movement_consumed",
                f"{cycle_id}|{matched_ckey}|{source_type}",
            )

            mov_doc = {
                "movementId": movement_id,
                "inventoryId": cat["inventory_id"],
                "inventoryType": INV_TYPE_INPUT,
                "type": MOV_TYPE_CONSUMED,
                "quantity": display_qty,
                "unit": display_unit,
                "baseQuantity": base_consumed,
                "baseUnit": base_unit,
                "sourceType": source_type,
                "sourceRef": cycle_id,
                "supplier": None,
                "unitCost": cat["doc"].get("unitCost"),
                "totalCost": (cat["doc"].get("unitCost") or 0.0) * display_qty,
                "movementDate": planted_date,
                "createdBy": CREATED_BY,
                "divisionId": DIVISION_ID,
                "organizationId": ORGANIZATION_ID,
                "createdAt": now,
                "updatedAt": now,
                "metadata": {
                    "migratedFrom": MIGRATION_TAG,
                    "drips": drips,
                    "kgPerDrip": kg_per_drip,
                    "cropName": crop_name,
                },
            }

            if not dry_run:
                result = db.inventory_movements.replace_one(
                    {"movementId": movement_id},
                    mov_doc,
                    upsert=True,
                )
                if result.upserted_id:
                    inserted += 1
                else:
                    already_exists += 1
            else:
                inserted += 1
            count += 1

        return count

    # Process block_archives
    logger.info("Pass 3a: Processing block_archives...")
    ba_processed = ba_skipped = 0
    for archive in db.block_archives.find(
        {"plantedDate": {"$gte": CUTOFF_DATE}},
        {
            "archiveId": 1,
            "_id": 1,
            "plantedDate": 1,
            "targetCropName": 1,
            "maxPlants": 1,
            "farmId": 1,
            "metadata": 1,
        },
    ):
        farm_id = str(archive.get("farmId") or "")
        if farm_id == PC_FARM_UUID:
            ba_skipped += 1
            skip_counts["pc_farm"] += 1
            continue

        # Use archiveId if present, otherwise fall back to string of _id
        archive_id = str(archive.get("archiveId") or archive["_id"])
        planted_date = archive.get("plantedDate")
        crop_name = str(archive.get("targetCropName") or "")
        # block_archives: maxPlants = raw supabase drip count (1:1 from supabase)
        # Reason: fix_drips_to_plants.py only converted virtual blocks, not archives
        drips = int(archive.get("maxPlants") or 0)

        n = _process_cycle(archive_id, planted_date, crop_name, drips, "cycle_archive")
        if n > 0:
            ba_processed += 1
        else:
            ba_skipped += 1

    logger.info(f"  block_archives: {ba_processed} cycles processed, {ba_skipped} skipped")

    # Process active virtual blocks (not PC Farm)
    logger.info("Pass 3b: Processing virtual blocks...")
    vb_processed = vb_skipped = 0
    for block in db.blocks.find(
        {"blockCategory": "virtual"},
        {
            "blockId": 1,
            "plantedDate": 1,
            "targetCropName": 1,
            "maxPlants": 1,
            "farmId": 1,
            "metadata": 1,
        },
    ):
        farm_id = str(block.get("farmId") or "")
        if farm_id == PC_FARM_UUID:
            vb_skipped += 1
            skip_counts["pc_farm"] += 1
            continue

        block_id = str(block.get("blockId") or block["_id"])
        planted_date = block.get("plantedDate")
        crop_name = str(block.get("targetCropName") or "")

        # Virtual blocks: use metadata.totalDrips (set by fix_drips_to_plants.py)
        # Fallback to maxPlants if totalDrips missing
        meta = block.get("metadata") or {}
        drips = int(meta.get("totalDrips") or block.get("maxPlants") or 0)

        n = _process_cycle(block_id, planted_date, crop_name, drips, "cycle_virtual")
        if n > 0:
            vb_processed += 1
        else:
            vb_skipped += 1

    logger.info(f"  virtual blocks: {vb_processed} cycles processed, {vb_skipped} skipped")
    logger.info(
        f"Pass 3 done: {inserted} consumed movements written "
        f"({already_exists} already existed)"
    )
    logger.info(f"  Unmatched fertilizer names: {len(unmatched_fertilizers)}")

    return inserted, unmatched_fertilizers, dict(skip_counts)


# ---------------------------------------------------------------------------
# Pass 4 — Reconcile
# ---------------------------------------------------------------------------


def reconcile_inventory(
    db,
    catalog: dict[str, dict],
    logger,
    dry_run: bool,
) -> tuple[int, list[dict]]:
    """
    For each catalog item, compute current stock = received - consumed
    and update the doc's quantity fields.

    Args:
        db: pymongo Database
        catalog: from Pass 1
        logger: logger instance
        dry_run: if True skip DB writes

    Returns:
        (update_count, negative_stock_items)
    """
    now = utcnow()
    update_count = 0
    negative_items: list[dict] = []

    for ckey, cat in catalog.items():
        inventory_id = cat["inventory_id"]
        base_unit = cat["base_unit"]
        display_unit = cat["display_unit"]
        is_asset = cat["is_asset"]

        # Aggregate movements for this inventory item
        received_base = 0.0
        consumed_base = 0.0

        for mov in db.inventory_movements.find({"inventoryId": inventory_id}):
            mov_type = mov.get("type", "")
            mov_base = float(mov.get("baseQuantity") or 0.0)
            if mov_type == MOV_TYPE_RECEIVED:
                received_base += mov_base
            elif mov_type == MOV_TYPE_CONSUMED:
                consumed_base += mov_base

        current_base = received_base - consumed_base
        is_negative = current_base < 0

        if is_negative:
            overconsumed = consumed_base - received_base
            negative_items.append({
                "itemName": cat["doc"].get("itemName") or cat["doc"].get("assetName"),
                "ckey": ckey,
                "received_base": received_base,
                "consumed_base": consumed_base,
                "overconsumed_base": overconsumed,
                "base_unit": base_unit,
            })
            logger.warning(
                f"  [NEGATIVE STOCK] {cat['doc'].get('itemName') or cat['doc'].get('assetName')}: "
                f"received={received_base:.0f}{base_unit}, consumed={consumed_base:.0f}{base_unit}, "
                f"clamping to 0"
            )
            current_base = 0.0

        # Convert base qty back to display qty
        display_qty = base_qty_to_display(current_base, base_unit, display_unit)

        if not dry_run:
            collection = db.inventory_asset if is_asset else db.inventory_input
            legacy_ref = cat["legacy_ref"]
            update_fields: dict[str, Any] = {
                "updatedAt": now,
            }
            if not is_asset:
                update_fields["quantity"] = display_qty
                update_fields["baseQuantity"] = current_base
                update_fields["availableQuantity"] = display_qty
                update_fields["isLowStock"] = False
                if is_negative:
                    update_fields["metadata.stockCalculatedNegative"] = True
                    update_fields["metadata.overconsumed_base"] = (
                        consumed_base - received_base
                    )
                    update_fields["metadata.received_base"] = received_base
                    update_fields["metadata.consumed_base"] = consumed_base
            result = collection.update_one(
                {"metadata.legacyRef": legacy_ref},
                {"$set": update_fields},
            )
            if result.modified_count > 0:
                update_count += 1
        else:
            update_count += 1

        # Update in-memory doc too (for dry-run reporting)
        if not is_asset:
            cat["doc"]["quantity"] = display_qty
            cat["doc"]["baseQuantity"] = current_base
            cat["doc"]["availableQuantity"] = display_qty

    logger.info(
        f"Pass 4 done: {update_count} catalog items updated, "
        f"{len(negative_items)} clamped from negative"
    )
    return update_count, negative_items


# ---------------------------------------------------------------------------
# Reporting helpers
# ---------------------------------------------------------------------------


def compute_consumed_value(
    catalog: dict[str, dict],
    db,
) -> float:
    """
    Estimate total consumed value = sum(consumed_qty_display * unitCost).

    Args:
        catalog: catalog dict
        db: pymongo Database

    Returns:
        Total estimated consumed value in AED
    """
    total = 0.0
    for ckey, cat in catalog.items():
        unit_cost = cat["doc"].get("unitCost") or 0.0
        if not unit_cost:
            continue
        consumed_base = sum(
            float(m.get("baseQuantity") or 0.0)
            for m in db.inventory_movements.find(
                {"inventoryId": cat["inventory_id"], "type": MOV_TYPE_CONSUMED}
            )
        )
        base_unit = cat["base_unit"]
        display_unit = cat["display_unit"]
        consumed_display = base_qty_to_display(consumed_base, base_unit, display_unit)
        total += consumed_display * unit_cost
    return total


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def run(dry_run: bool, reset: bool) -> None:
    """
    Main entry point for stage 6b.

    Args:
        dry_run: if True, read and compute but do not write
        reset: if True, delete all migration-tagged inventory docs first
    """
    logger = make_logger(STAGE)
    db = get_db()

    logger.info(f"{'[DRY-RUN] ' if dry_run else ''}Starting {STAGE}")

    if reset:
        logger.info("[RESET] Deleting migration-tagged inventory docs...")
        reset_migration_data(db, RESET_COLLECTIONS, logger)

    # Ensure indexes
    # Reason: skip conflicting index creation using ensure_index-style try/except
    if not dry_run:
        def _safe_index(collection, keys, **kwargs):
            """Create index, silently skip if an equivalent already exists."""
            try:
                collection.create_index(keys, **kwargs)
            except Exception as idx_err:
                logger.debug(f"Index create skipped (already exists or conflict): {idx_err}")

        _safe_index(db.inventory_input, "metadata.legacyRef", background=True)
        _safe_index(db.inventory_input, "inventoryId", unique=True, background=True)
        _safe_index(db.inventory_asset, "metadata.legacyRef", background=True)
        _safe_index(db.inventory_asset, "inventoryId", unique=True, background=True)
        _safe_index(db.inventory_movements, "movementId", unique=True, background=True)
        _safe_index(db.inventory_movements, "inventoryId", background=True)
        logger.info("Indexes ensured")

    # ------------------------------------------------------------------ Pass 1
    logger.info("=" * 60)
    logger.info("PASS 1: Classify + Build Catalog")
    logger.info("=" * 60)
    catalog, classification_counts, validation_failures = build_catalog(
        db, logger, dry_run
    )

    # ------------------------------------------------------------------ Pass 2
    logger.info("=" * 60)
    logger.info("PASS 2: Received Movements")
    logger.info("=" * 60)
    received_count, total_received_value = build_received_movements(
        db, catalog, logger, dry_run
    )

    # ------------------------------------------------------------------ Pass 3
    logger.info("=" * 60)
    logger.info("PASS 3: Consumed Movements from Cycles")
    logger.info("=" * 60)
    plan_map = load_planning_data(logger)
    consumed_count, unmatched_fertilizers, skip_counts = build_consumed_movements(
        db, catalog, plan_map, logger, dry_run
    )

    # ------------------------------------------------------------------ Pass 4
    logger.info("=" * 60)
    logger.info("PASS 4: Reconcile Stock")
    logger.info("=" * 60)
    update_count, negative_items = reconcile_inventory(db, catalog, logger, dry_run)

    # ------------------------------------------------------------------ Report
    total_consumed_value = compute_consumed_value(catalog, db)

    input_count = sum(1 for v in catalog.values() if not v["is_asset"])
    asset_count = sum(1 for v in catalog.values() if v["is_asset"])

    logger.info("")
    logger.info("=" * 60)
    logger.info(f"  SUMMARY: {STAGE}")
    logger.info("=" * 60)

    logger.info("  Classification:")
    for cls_name in ("fertilizer", "seed", "pesticide", "asset", "other", "expense_skip"):
        logger.info(f"    {cls_name:20s}: {classification_counts.get(cls_name, 0)}")

    logger.info(f"  Catalog docs created: {input_count} inventory_input + {asset_count} inventory_asset")
    logger.info(f"  Movements — received: {received_count}, consumed: {consumed_count}")
    logger.info(f"  Cycle skip counts: {skip_counts}")
    logger.info(f"  Total received value: AED {total_received_value:,.2f}")
    logger.info(f"  Total consumed value (estimated): AED {total_consumed_value:,.2f}")
    logger.info(f"  Pydantic validation failures: {len(validation_failures)}")

    if unmatched_fertilizers:
        sorted_unmatched = sorted(unmatched_fertilizers)
        logger.info(f"  Unmatched planning fertilizer names ({len(sorted_unmatched)}):")
        for fn in sorted_unmatched[:20]:
            logger.info(f"    - {fn!r}")
        if len(sorted_unmatched) > 20:
            logger.info(f"    ... ({len(sorted_unmatched) - 20} more)")

    if negative_items:
        logger.info(f"  Negative-stock clamps: {len(negative_items)} items")
        for ni in negative_items[:5]:
            logger.info(
                f"    - {ni['itemName']!r}: "
                f"received={ni['received_base']:.0f}{ni['base_unit']}, "
                f"consumed={ni['consumed_base']:.0f}{ni['base_unit']}, "
                f"over={ni['overconsumed_base']:.0f}{ni['base_unit']}"
            )

    # Sample 3 catalog items
    logger.info("  3 sample catalog items (post-reconcile):")
    sample_items = [v for v in catalog.values() if not v["is_asset"]][:3]
    for cat in sample_items:
        doc = cat["doc"]
        item_name = doc.get("itemName", "?")
        unit = doc.get("unit", "?")
        base_unit = cat["base_unit"]
        inv_id = cat["inventory_id"]
        rec_base = sum(
            float(m.get("baseQuantity") or 0.0)
            for m in db.inventory_movements.find(
                {"inventoryId": inv_id, "type": MOV_TYPE_RECEIVED}
            )
        )
        con_base = sum(
            float(m.get("baseQuantity") or 0.0)
            for m in db.inventory_movements.find(
                {"inventoryId": inv_id, "type": MOV_TYPE_CONSUMED}
            )
        )
        rec_disp = base_qty_to_display(rec_base, base_unit, unit)
        con_disp = base_qty_to_display(con_base, base_unit, unit)
        cur_disp = doc.get("quantity", 0.0)
        logger.info(
            f"    {item_name!r}: "
            f"received={rec_disp:.2f}{unit}, "
            f"consumed={con_disp:.2f}{unit}, "
            f"stock={cur_disp:.2f}{unit}"
        )

    logger.info("=" * 60)

    if validation_failures:
        logger.warning(f"Stage completed with {len(validation_failures)} validation error(s).")

    logger.info("Done.")


if __name__ == "__main__":
    parser = make_arg_parser(
        "Stage 6b: Sync purchase_register → inventory_input/asset + inventory_movements"
    )
    args = parser.parse_args()
    run(dry_run=args.dry_run, reset=args.reset)
