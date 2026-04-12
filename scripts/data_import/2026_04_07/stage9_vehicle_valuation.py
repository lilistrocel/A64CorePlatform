"""
stage9_vehicle_valuation.py — Merge vehicle valuations from Excel into vehicles collection.

Source: OldData/7-April-2026/VEHICLE VALUE ESTIMATION  - AED 2025 .xlsx
Sheet: VEHICLE VALUE - AED 2025
Headers at row 2: Sr, Brand, Type, Model, Plate Number, Value - AED,
                  REFRIGIRATOR, LOAD (KG), Ownership, (notes)
Data from row 3.

Logic:
  - For each row, normalize the plate number (strip, uppercase).
  - Match against existing vehicles collection by:
      1. licensePlate exact match
      2. Suffix match: vehicleName contains the plate number
  - MATCHED: update vehicle doc with `valuation` sub-object.
  - NOT MATCHED: create a new vehicle doc (with V-NNN code continuation).
  - Validate against Vehicle Pydantic model before upserting.

Run: python stage9_vehicle_valuation.py [--dry-run] [--reset]
"""

from __future__ import annotations

import re
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any, Optional

import openpyxl

sys.path.insert(0, str(Path(__file__).parent))

from common import (
    DIVISION_ID,
    MIGRATION_TAG,
    ORGANIZATION_ID,
    deterministic_uuid,
    get_db,
    make_arg_parser,
    make_logger,
    print_summary,
    reset_migration_data,
    upsert_by_legacy_ref,
    utcnow,
)

STAGE = "stage9_vehicle_valuation"
# Reason: --reset only removes NEW vehicles added by this stage (matched vehicles
# are updated in-place and their legacyRef comes from stage4; we track stage9-new
# with a distinct legacyRef prefix).
RESET_COLLECTIONS: list[str] = []  # No full reset — we patch existing vehicles

ADMIN_UUID: str = "bff26b8f-5ce9-49b2-9126-86174eaea823"

DATA_DIR: Path = Path(__file__).parent.parent.parent.parent / "OldData" / "7-April-2026"
VEHICLE_XLSX: Path = DATA_DIR / "VEHICLE VALUE ESTIMATION  - AED 2025 .xlsx"
VALUATION_AS_OF_DATE: str = "2025-12-31"

# Vehicle type inference map: Type column value (upper) → VehicleType enum
VEHICLE_TYPE_MAP: dict[str, str] = {
    "CANTER": "truck",
    "TRACTOR": "truck",      # No "tractor" enum value; truck is closest
    "NAVIGATOR": "van",      # Lincoln Navigator SUV — van is closest enum
    "CAPTIVA": "van",
    "FORTUNER": "van",
    "HILUX": "pickup",
    "HI ACE": "van",
    "HIACE": "van",
    "X TRAIL": "van",
    "EDGE": "van",
    "FE 320": "truck",       # Volvo heavy truck
    "300": "truck",          # Hino 300 series light truck
    "DUTRO": "truck",        # Hino Dutro truck
}

# Ownership string → VehicleOwnership enum
OWNERSHIP_MAP: dict[str, str] = {
    "AL SAMARAT TRADING LLC": "owned",
    "H.H SHAIKH AHMED BIN AL NAHYAN": "owned",
    "SHAIKH AHMED BIN AL NAHYAN": "owned",
    "AL MAQTAA DATES FACTORY L.L.C": "owned",
    "FLAG HOLDING L.L.C": "owned",
    "PERSONAL NAME": "owned",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def normalize_plate(plate: Any) -> Optional[str]:
    """
    Normalize plate number to uppercase stripped string.

    Args:
        plate: raw plate value (int, float, str, or None)

    Returns:
        normalized string or None if invalid
    """
    if plate is None:
        return None
    s = str(plate).strip().upper()
    # Strip .0 suffix from float representations
    s = re.sub(r"\.0$", "", s)
    if not s or s in ("NONE", "0", ""):
        return None
    return s


def parse_load_kg(raw: Any) -> float:
    """
    Parse LOAD (KG) cell value to float kilograms.

    Examples:
      "5 TONS" → 5000.0
      "8TONS"  → 8000.0
      "3 TONS" → 3000.0
      "750 KG" → 750.0
      0        → 0.0

    Args:
        raw: raw cell value

    Returns:
        load in kilograms as float
    """
    if raw is None:
        return 0.0
    s = str(raw).strip().upper()
    # Match N TONS or NTONS
    ton_match = re.match(r"(\d+\.?\d*)\s*TONS?", s)
    if ton_match:
        return float(ton_match.group(1)) * 1000.0
    # Match N KG
    kg_match = re.match(r"(\d+\.?\d*)\s*KG", s)
    if kg_match:
        return float(kg_match.group(1))
    # Plain number
    try:
        return float(s)
    except ValueError:
        return 0.0


def infer_vehicle_type(brand: Optional[str], vtype: Optional[str]) -> str:
    """
    Infer VehicleType enum value from brand and type column values.

    Args:
        brand: Brand column value (e.g. "TRACTOR", "MITSUBISHI")
        vtype: Type column value (e.g. "CANTER", "NAVIGATOR")

    Returns:
        VehicleType enum string: "truck" | "van" | "pickup" | "refrigerated"
    """
    brand_u = (brand or "").strip().upper()
    type_u = (vtype or "").strip().upper()

    # Check type first
    for key, val in VEHICLE_TYPE_MAP.items():
        if key in type_u:
            return val

    # Check brand (e.g. "TRACTOR" as brand, Type is None)
    if "TRACTOR" in brand_u:
        return "truck"
    if "HINO" in brand_u or "VOLVO" in brand_u:
        return "truck"
    if "TOYOTA" in brand_u:
        return "van"
    if "NISSAN" in brand_u or "CHEVROLET" in brand_u or "FORD" in brand_u or "LINCOLN" in brand_u:
        return "van"

    return "van"  # Safe fallback within VehicleType enum


def infer_ownership(raw_ownership: Optional[str]) -> str:
    """
    Map ownership string to VehicleOwnership enum.

    Args:
        raw_ownership: Ownership column value

    Returns:
        VehicleOwnership enum string: "owned" | "rented" | "leased"
    """
    if not raw_ownership:
        return "owned"
    return OWNERSHIP_MAP.get(raw_ownership.strip().upper(), "owned")


# ---------------------------------------------------------------------------
# Load Excel data
# ---------------------------------------------------------------------------


def load_valuation_rows() -> list[dict[str, Any]]:
    """
    Load all vehicle rows from the valuation Excel sheet.

    Returns:
        list of parsed row dicts with normalized values
    """
    wb = openpyxl.load_workbook(VEHICLE_XLSX, data_only=True)
    ws = wb["VEHICLE VALUE - AED 2025"]
    rows: list[dict[str, Any]] = []

    for row in ws.iter_rows(min_row=3, values_only=True):
        sr = row[0]
        if sr is None or not isinstance(sr, (int, float)):
            continue
        brand = str(row[1]).strip() if row[1] else None
        vtype_raw = str(row[2]).strip() if row[2] else None
        model_year_raw = row[3]
        plate_raw = row[4]
        value_aed = float(row[5]) if row[5] is not None else 0.0
        refrigerator_raw = str(row[6]).strip().upper() if row[6] else "NO"
        load_raw = row[7]
        ownership_raw = str(row[8]).strip() if row[8] else None
        notes = str(row[9]).strip() if row[9] else None

        plate = normalize_plate(plate_raw)
        has_refrigerator = refrigerator_raw.startswith("YES")
        load_kg = parse_load_kg(load_raw)

        model_year: Optional[int] = None
        if model_year_raw and isinstance(model_year_raw, (int, float)):
            model_year = int(model_year_raw)
        elif model_year_raw:
            try:
                model_year = int(str(model_year_raw).strip())
            except ValueError:
                pass

        rows.append(
            {
                "sr": int(sr),
                "brand": brand,
                "vtype_raw": vtype_raw,
                "model_year": model_year,
                "plate": plate,
                "value_aed": value_aed,
                "has_refrigerator": has_refrigerator,
                "load_kg": load_kg,
                "ownership_raw": ownership_raw,
                "notes": notes,
            }
        )

    return rows


# ---------------------------------------------------------------------------
# Matching logic
# ---------------------------------------------------------------------------


def build_existing_vehicle_index(db) -> tuple[dict[str, dict], dict[str, dict], int]:
    """
    Build lookup indexes from existing vehicles collection.

    Returns:
        (plate_index, suffix_index, max_vehicle_seq)
        plate_index: normalized plate → vehicle doc
        suffix_index: plate suffix → vehicle doc (for name-based matching)
        max_vehicle_seq: highest V-NNN sequence number
    """
    plate_index: dict[str, dict] = {}
    suffix_index: dict[str, dict] = {}
    max_seq = 0

    for doc in db.vehicles.find(
        {},
        {"vehicleId": 1, "vehicleCode": 1, "licensePlate": 1, "name": 1,
         "metadata": 1, "_id": 0},
    ):
        plate = normalize_plate(doc.get("licensePlate"))
        if plate:
            plate_index[plate] = doc

        # Extract suffix from name like "CANTER - 22924" → "22924"
        name = doc.get("name", "")
        suffix_match = re.search(r"[-\s]+(\S+)$", name)
        if suffix_match:
            suffix_index[suffix_match.group(1).upper()] = doc

        # Track vehicle code sequence
        code = doc.get("vehicleCode", "")
        if code and re.match(r"^V-\d{3}$", code):
            try:
                seq = int(code.split("-")[1])
                max_seq = max(max_seq, seq)
            except (IndexError, ValueError):
                pass

    return plate_index, suffix_index, max_seq


def match_vehicle(
    plate: Optional[str],
    plate_index: dict[str, dict],
    suffix_index: dict[str, dict],
) -> Optional[dict]:
    """
    Try to match a plate against existing vehicles.

    Args:
        plate: normalized plate string
        plate_index: plate → vehicle doc
        suffix_index: plate suffix → vehicle doc

    Returns:
        matched vehicle doc or None
    """
    if not plate:
        return None
    if plate in plate_index:
        return plate_index[plate]
    # Suffix match (e.g. "22924" matches "CANTER - 22924")
    if plate in suffix_index:
        return suffix_index[plate]
    return None


# ---------------------------------------------------------------------------
# Document builders
# ---------------------------------------------------------------------------


def build_valuation_subobj(row: dict[str, Any]) -> dict[str, Any]:
    """
    Build the valuation sub-object to embed in a vehicle doc.

    Args:
        row: parsed valuation row

    Returns:
        valuation dict
    """
    return {
        "amountAed": row["value_aed"],
        "asOfDate": VALUATION_AS_OF_DATE,
        "brand": row["brand"],
        "type": row["vtype_raw"],
        "modelYear": row["model_year"],
        "hasRefrigerator": row["has_refrigerator"],
        "loadKg": row["load_kg"],
        "ownership": row["ownership_raw"],
        "notes": row["notes"],
        "source": "VEHICLE VALUE ESTIMATION 2025",
    }


def build_new_vehicle_doc(
    row: dict[str, Any],
    vehicle_code: str,
) -> dict[str, Any]:
    """
    Build a new vehicles collection document for an unmatched valuation row.

    Args:
        row: parsed valuation row
        vehicle_code: pre-allocated V-NNN code

    Returns:
        vehicles document dict
    """
    now = utcnow()
    plate = row["plate"] or f"NOPLATE-{row['sr']}"
    legacy_ref = f"vehicle_val:{plate}"
    vehicle_uuid = deterministic_uuid("vehicle_valuation", legacy_ref)

    brand = row["brand"] or "Unknown"
    vtype_col = row["vtype_raw"] or ""
    name = f"{brand} {vtype_col} - {plate}".strip(" -")
    vehicle_type = infer_vehicle_type(row["brand"], row["vtype_raw"])
    ownership = infer_ownership(row["ownership_raw"])

    # Capacity: use load_kg if > 0, else sensible default per vehicle type
    load_kg = row["load_kg"]
    weight_capacity = load_kg if load_kg > 0 else (1000.0 if vehicle_type == "pickup" else 2000.0)

    return {
        "vehicleId": vehicle_uuid,
        "vehicleCode": vehicle_code,
        "name": name[:200],
        "type": vehicle_type,
        "ownership": ownership,
        "licensePlate": plate[:50],
        "capacity": {
            "weight": weight_capacity,
            "volume": 10.0,
            "unit": "kg/m3",
        },
        "status": "available",
        "costPerKm": None,
        "rentalCostPerDay": None,
        "purchaseDate": None,
        "purchaseCost": None,
        "maintenanceSchedule": None,
        "valuation": build_valuation_subobj(row),
        "createdBy": ADMIN_UUID,
        "isActive": True,
        "divisionId": DIVISION_ID,
        "organizationId": ORGANIZATION_ID,
        "createdAt": now,
        "updatedAt": now,
        "metadata": {
            "migratedFrom": MIGRATION_TAG,
            "legacyRef": legacy_ref,
            "sourceFile": "VEHICLE VALUE ESTIMATION 2025",
            "sr": row["sr"],
        },
    }


# ---------------------------------------------------------------------------
# Pydantic validation
# ---------------------------------------------------------------------------


def validate_vehicle_doc(doc: dict[str, Any]) -> list[str]:
    """
    Validate a vehicle document against the Vehicle Pydantic model.

    Args:
        doc: vehicle document dict

    Returns:
        list of validation error strings (empty = valid)
    """
    try:
        import sys as _sys
        _sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "src"))
        from modules.logistics.models.vehicle import Vehicle

        model_fields = {
            "vehicleId", "vehicleCode", "name", "type", "ownership",
            "licensePlate", "capacity", "status", "costPerKm",
            "rentalCostPerDay", "purchaseDate", "purchaseCost",
            "maintenanceSchedule", "divisionId", "organizationId",
            "createdBy", "createdAt", "updatedAt",
        }
        filtered = {k: v for k, v in doc.items() if k in model_fields}
        Vehicle(**filtered)
        return []
    except Exception as exc:
        return [str(exc)]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def run(dry_run: bool, reset: bool) -> None:
    """
    Main entry point for stage 9.

    Args:
        dry_run: if True, read and compute but do not write
        reset: if True, delete only stage9-specific NEW vehicle docs
    """
    logger = make_logger(STAGE)
    db = get_db()

    if reset:
        # Reason: Only delete newly-created vehicle docs from stage9 — do NOT
        # delete existing vehicles or their valuations as those come from stage4.
        result = db.vehicles.delete_many(
            {"metadata.legacyRef": {"$regex": r"^vehicle_val:"}}
        )
        logger.info(f"[RESET] Deleted {result.deleted_count} stage9-created vehicle docs")

    # Ensure index
    if not dry_run:
        db.vehicles.create_index("metadata.legacyRef", unique=False, background=True)

    # -----------------------------------------------------------------------
    # Load valuation rows and build existing vehicle index
    # -----------------------------------------------------------------------
    logger.info("Loading valuation Excel...")
    val_rows = load_valuation_rows()
    logger.info(f"  Loaded {len(val_rows)} valuation rows")

    logger.info("Building existing vehicle index...")
    plate_index, suffix_index, max_seq = build_existing_vehicle_index(db)
    logger.info(
        f"  Indexed {len(plate_index)} vehicles by plate, {len(suffix_index)} by name suffix, max seq={max_seq}"
    )

    # -----------------------------------------------------------------------
    # Process each valuation row
    # -----------------------------------------------------------------------
    matched_count = 0
    new_count = 0
    validation_errors: list[str] = []
    error_samples: list[str] = []

    # Tallies for report
    total_fleet_value = 0.0
    by_type: dict[str, list[dict]] = {"truck": [], "van": [], "pickup": [], "tractor": [], "other": []}

    new_vehicle_seq = max_seq  # counter for new V-NNN codes

    for row in val_rows:
        plate = row["plate"]
        total_fleet_value += row["value_aed"]

        # Determine category for report
        vtype = infer_vehicle_type(row["brand"], row["vtype_raw"])
        brand_u = (row["brand"] or "").upper()
        vtype_label = "tractor" if "TRACTOR" in brand_u else vtype

        existing = match_vehicle(plate, plate_index, suffix_index)

        if existing:
            matched_count += 1
            vehicle_id = existing.get("vehicleId")
            vehicle_code = existing.get("vehicleCode", "?")
            logger.info(
                f"  MATCH [{vehicle_code}]: plate={plate} → "
                f"vehicleId={vehicle_id}"
            )

            # Build update with $set to add valuation sub-object
            valuation = build_valuation_subobj(row)
            if not dry_run:
                db.vehicles.update_one(
                    {"vehicleId": vehicle_id},
                    {
                        "$set": {
                            "valuation": valuation,
                            "updatedAt": utcnow(),
                        }
                    },
                )

            by_type.get(vtype_label, by_type["other"]).append(
                {"code": vehicle_code, "plate": plate, "value": row["value_aed"], "matched": True}
            )

        else:
            new_vehicle_seq += 1
            vehicle_code = f"V-{new_vehicle_seq:03d}"
            new_count += 1
            logger.info(
                f"  NEW [{vehicle_code}]: plate={plate} brand={row['brand']} type={row['vtype_raw']}"
            )

            new_doc = build_new_vehicle_doc(row, vehicle_code)

            # Validate before write
            v_errors = validate_vehicle_doc(new_doc)
            if v_errors:
                msg = f"Validation error [plate={plate}]: {v_errors[0]}"
                logger.warning(f"  WARN: {msg}")
                validation_errors.append(msg)

            try:
                ins, upd = upsert_by_legacy_ref(
                    db.vehicles,
                    new_doc,
                    new_doc["metadata"]["legacyRef"],
                    dry_run=dry_run,
                    logger=logger,
                )
            except Exception as exc:
                msg = f"New vehicle upsert failed [plate={plate}]: {exc}"
                logger.error(msg)
                error_samples.append(msg)

            by_type.get(vtype_label, by_type["other"]).append(
                {"code": vehicle_code, "plate": plate, "value": row["value_aed"], "matched": False}
            )

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------
    logger.info("")
    logger.info("=" * 60)
    logger.info("  VEHICLE VALUATION SUMMARY:")
    logger.info(f"    Valuation rows processed: {len(val_rows)}")
    logger.info(f"    Matched existing vehicles: {matched_count}")
    logger.info(f"    New vehicles created:      {new_count}")
    logger.info(f"    Total fleet value:         AED {total_fleet_value:,.2f}")
    logger.info("")

    for cat, items in by_type.items():
        if items:
            cat_value = sum(i["value"] for i in items)
            logger.info(f"  {cat.upper()} ({len(items)} vehicles, AED {cat_value:,.2f}):")
            for item in items:
                tag = "matched" if item["matched"] else "NEW"
                logger.info(f"    [{tag}] {item['code']} plate={item['plate']} value={item['value']:,.0f}")

    if validation_errors:
        logger.info(f"\n  Validation warnings: {len(validation_errors)}")
        for ve in validation_errors[:5]:
            logger.info(f"    - {ve}")
    logger.info("=" * 60)

    print_summary(
        stage=STAGE,
        rows_read=len(val_rows),
        rows_inserted=new_count if not dry_run else 0,
        rows_updated=matched_count if not dry_run else 0,
        rows_skipped=0,
        rows_errored=len(error_samples),
        error_samples=error_samples,
        logger=logger,
    )


if __name__ == "__main__":
    parser = make_arg_parser(
        "Stage 9: Merge vehicle valuations from Excel into vehicles collection"
    )
    args = parser.parse_args()
    run(dry_run=args.dry_run, reset=args.reset)
