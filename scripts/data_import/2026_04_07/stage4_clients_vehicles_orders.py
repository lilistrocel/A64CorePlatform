"""
stage4_clients_vehicles_orders.py — Import customers, vehicles, sales_orders,
and sales_order_lines from Supabase CSVs.

Source tables:
  - client_details_rows.csv    → customers collection
  - vehicle_details_rows.csv   → vehicles collection
  - orderlist_re_rows.csv      → sales_orders collection
  - order_list_content_rows.csv → sales_order_lines collection (NEW)

New collections introduced: sales_order_lines

Idempotency: upsert keyed on metadata.legacyRef for all collections.

Code generation:
  - customers.customerCode: C-NNNN (C-0001, C-0002, ...)
  - vehicles.vehicleCode:   V-NNN  (V-001, V-002, ...)
  - sales_orders.orderCode: SO-YYYYMMDD-NNNN per-day sequence

Run:  python stage4_clients_vehicles_orders.py [--dry-run] [--reset]
"""

from __future__ import annotations

import csv
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent))

from common import (
    CSV_DIR,
    DIVISION_ID,
    MIGRATION_TAG,
    ORGANIZATION_ID,
    deterministic_uuid,
    get_db,
    is_excluded_farm,
    make_arg_parser,
    make_logger,
    print_summary,
    reset_migration_data,
    upsert_by_legacy_ref,
    utcnow,
)

STAGE = "stage4_clients_vehicles_orders"
RESET_COLLECTIONS = ["customers", "vehicles", "sales_orders", "sales_order_lines"]

# Admin identity used as createdBy for all imported documents.
# Reason: Customer, Vehicle, SalesOrder models all have createdBy: UUID = Field(...)
# (required, no default). The repository does Model(**doc) — this field MUST be present.
ADMIN_UUID: str = "bff26b8f-5ce9-49b2-9126-86174eaea823"


# ---------------------------------------------------------------------------
# Code generators with idempotency
# ---------------------------------------------------------------------------


def build_customer_code_map(
    client_rows: list[dict],
    db,
    dry_run: bool,
) -> dict[str, str]:
    """
    Build a legacyRef → customerCode mapping for all client rows.

    Idempotency: if a customer with matching metadata.legacyRef already exists
    in the collection, its existing customerCode is reused.  Otherwise a new
    C-NNNN code is allocated in insertion order starting after the current max.

    Args:
        client_rows: rows from client_details_rows.csv
        db: pymongo Database (used only for idempotency look-up)
        dry_run: if True, skips the DB look-up and always allocates fresh codes

    Returns:
        dict mapping legacy_ref → customerCode string
    """
    # Discover codes already assigned to migrated customers
    existing: dict[str, str] = {}  # legacyRef → customerCode
    if not dry_run:
        for doc in db.customers.find(
            {"metadata.migratedFrom": MIGRATION_TAG, "customerCode": {"$exists": True}},
            {"metadata.legacyRef": 1, "customerCode": 1, "_id": 0},
        ):
            ref = doc.get("metadata", {}).get("legacyRef")
            code = doc.get("customerCode")
            if ref and code:
                existing[ref] = code

    # Find highest existing C-NNNN sequence (across ALL customers, not just migrated)
    max_seq = 0
    if not dry_run:
        for doc in db.customers.find(
            {"customerCode": {"$regex": r"^C-\d{4}$"}},
            {"customerCode": 1, "_id": 0},
        ):
            try:
                seq = int(doc["customerCode"].split("-")[1])
                max_seq = max(max_seq, seq)
            except (IndexError, ValueError):
                pass

    counter = max_seq
    code_map: dict[str, str] = {}
    for row in client_rows:
        ref = row["ref"]
        if ref in existing:
            # Reason: reuse existing code so re-runs are idempotent
            code_map[ref] = existing[ref]
        else:
            counter += 1
            code_map[ref] = f"C-{counter:04d}"

    return code_map


def build_vehicle_code_map(
    vehicle_rows: list[dict],
    db,
    dry_run: bool,
) -> dict[str, str]:
    """
    Build a legacyRef → vehicleCode mapping for all vehicle rows.

    Idempotency: reuses existing vehicleCode when metadata.legacyRef matches.
    New codes allocated as V-NNN starting after the current maximum.

    Args:
        vehicle_rows: rows from vehicle_details_rows.csv
        db: pymongo Database
        dry_run: if True, always allocates fresh codes from 1

    Returns:
        dict mapping legacy_ref → vehicleCode string
    """
    existing: dict[str, str] = {}
    if not dry_run:
        for doc in db.vehicles.find(
            {"metadata.migratedFrom": MIGRATION_TAG, "vehicleCode": {"$exists": True}},
            {"metadata.legacyRef": 1, "vehicleCode": 1, "_id": 0},
        ):
            ref = doc.get("metadata", {}).get("legacyRef")
            code = doc.get("vehicleCode")
            if ref and code:
                existing[ref] = code

    max_seq = 0
    if not dry_run:
        for doc in db.vehicles.find(
            {"vehicleCode": {"$regex": r"^V-\d{3}$"}},
            {"vehicleCode": 1, "_id": 0},
        ):
            try:
                seq = int(doc["vehicleCode"].split("-")[1])
                max_seq = max(max_seq, seq)
            except (IndexError, ValueError):
                pass

    counter = max_seq
    code_map: dict[str, str] = {}
    for row in vehicle_rows:
        ref = row["ref"]
        if ref in existing:
            code_map[ref] = existing[ref]
        else:
            counter += 1
            code_map[ref] = f"V-{counter:03d}"

    return code_map


def build_order_code_map(
    order_rows: list[dict],
    db,
    dry_run: bool,
) -> dict[str, str]:
    """
    Build a legacyRef → orderCode mapping for all sales order rows.

    Format: SO-YYYYMMDD-NNNN where date is from DatePacked / StartDate and
    NNNN is a per-day counter starting at 1.  Falls back to SO-NODATE-NNNN
    when no date is available.

    Idempotency: reuses existing orderCode when metadata.legacyRef matches.

    Args:
        order_rows: rows from orderlist_re_rows.csv (after NH exclusion)
        db: pymongo Database
        dry_run: if True, always allocates fresh codes

    Returns:
        dict mapping legacy_ref → orderCode string
    """
    existing: dict[str, str] = {}
    if not dry_run:
        for doc in db.sales_orders.find(
            {"metadata.migratedFrom": MIGRATION_TAG, "orderCode": {"$exists": True}},
            {"metadata.legacyRef": 1, "orderCode": 1, "_id": 0},
        ):
            ref = doc.get("metadata", {}).get("legacyRef")
            code = doc.get("orderCode")
            if ref and code:
                existing[ref] = code

    # Discover per-day counters already in use across ALL orders (not just migrated)
    # so new codes never clash with manually-created orders.
    day_counters: dict[str, int] = defaultdict(int)  # date_str → max seq seen
    if not dry_run:
        for doc in db.sales_orders.find(
            {"orderCode": {"$regex": r"^SO-"}},
            {"orderCode": 1, "_id": 0},
        ):
            parts = doc["orderCode"].split("-")
            # SO-YYYYMMDD-NNNN → parts = ['SO', 'YYYYMMDD', 'NNNN']
            # SO-NODATE-NNNN   → parts = ['SO', 'NODATE', 'NNNN']
            if len(parts) == 3:
                date_key = parts[1]
                try:
                    seq = int(parts[2])
                    day_counters[date_key] = max(day_counters[date_key], seq)
                except ValueError:
                    pass

    code_map: dict[str, str] = {}
    for row in order_rows:
        ref = row["ref"]
        if ref in existing:
            code_map[ref] = existing[ref]
            continue

        # Determine date key
        raw_date = row.get("DatePacked") or row.get("StartDate") or ""
        parsed = _parse_dt(raw_date)
        date_key = parsed.strftime("%Y%m%d") if parsed else "NODATE"

        day_counters[date_key] += 1
        code_map[ref] = f"SO-{date_key}-{day_counters[date_key]:04d}"

    return code_map


def _parse_dt(s: str) -> Optional[datetime]:
    """Parse supabase ISO datetime string → naive UTC datetime."""
    if not s or s.strip() == "":
        return None
    s = s.strip()
    for suffix in ("+00", "+00:00", "Z"):
        if s.endswith(suffix):
            s = s[: -len(suffix)]
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# CSV loaders
# ---------------------------------------------------------------------------


def load_clients() -> list[dict]:
    with open(CSV_DIR / "client_details_rows.csv", newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_vehicles() -> list[dict]:
    with open(CSV_DIR / "vehicle_details_rows.csv", newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_orders() -> list[dict]:
    with open(CSV_DIR / "orderlist_re_rows.csv", newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_order_lines() -> list[dict]:
    with open(CSV_DIR / "order_list_content_rows.csv", newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


# ---------------------------------------------------------------------------
# Document builders
# ---------------------------------------------------------------------------


def build_customer_doc(row: dict, customer_code: str) -> dict:
    """
    Build a customers document from client_details row.

    Args:
        row: client_details_rows row
        customer_code: pre-allocated unique code like C-0001

    Returns:
        customers document dict
    """
    now = utcnow()
    legacy_ref = row["ref"]
    customer_uuid = deterministic_uuid("customer", legacy_ref)
    name = row.get("clientname", "").strip()

    return {
        "customerId": customer_uuid,
        "customerCode": customer_code,
        "name": name,
        "displayName": name,
        "type": "business",
        "status": "active",
        "email": None,
        "phone": None,
        "address": None,
        "contactPerson": None,
        "notes": None,
        # Reason: Customer.createdBy = Field(...) — required, no default.
        "createdBy": ADMIN_UUID,
        "isActive": True,
        "divisionId": DIVISION_ID,
        "organizationId": ORGANIZATION_ID,
        "createdAt": now,
        "updatedAt": now,
        "metadata": {
            "migratedFrom": MIGRATION_TAG,
            "legacyRef": legacy_ref,
            "supabaseClientName": name,
        },
    }


def build_vehicle_doc(row: dict, vehicle_code: str) -> dict:
    """
    Build a vehicles document from vehicle_details row.

    Args:
        row: vehicle_details_rows row
        vehicle_code: pre-allocated unique code like V-001

    Returns:
        vehicles document dict
    """
    now = utcnow()
    legacy_ref = row["ref"]
    vehicle_uuid = deterministic_uuid("vehicle", legacy_ref)
    name = row.get("vehiclename", "").strip()

    # Parse plate number from name (e.g. "CANTER - 22924" → "22924")
    plate_match = re.search(r"[-\s]+(\S+)$", name)
    plate = plate_match.group(1) if plate_match else name

    # Vehicle type heuristic
    name_upper = name.upper()
    if "CANTER" in name_upper:
        vehicle_type = "truck"
    elif "HINO" in name_upper:
        vehicle_type = "truck"
    elif "HIACE" in name_upper or "TOYOTA" in name_upper:
        vehicle_type = "van"
    else:
        vehicle_type = "other"

    # Map legacy heuristic type to VehicleType enum canonical values.
    # Reason: Vehicle model requires type: VehicleType (truck|van|pickup|refrigerated).
    # "other" is not a valid member; default to "van" for unknown/other.
    canonical_type_map = {
        "truck": "truck",
        "van": "van",
        "pickup": "pickup",
        "refrigerated": "refrigerated",
        "other": "van",  # Fallback — VehicleType has no "other"
    }
    canonical_type = canonical_type_map.get(vehicle_type, "van")

    return {
        "vehicleId": vehicle_uuid,
        "vehicleCode": vehicle_code,
        "name": name,
        # Canonical model field names (Vehicle model):
        # Reason: repository does Vehicle(**doc) — field names must match model exactly.
        "type": canonical_type,           # VehicleType enum: truck|van|pickup|refrigerated
        "ownership": "owned",             # VehicleOwnership default; no ownership data in CSV
        "licensePlate": plate or name[:50],  # Required field (min_length=1)
        "capacity": {                     # VehicleCapacity required: weight, volume, unit
            "weight": 1000.0,
            "volume": 10.0,
            "unit": "kg/m3",
        },
        "status": "available",            # VehicleStatus enum: available|in_use|maintenance|retired
        # Reason: Vehicle.createdBy = Field(...) — required, no default.
        "createdBy": ADMIN_UUID,
        "isActive": True,
        # Legacy/extra fields preserved in metadata for reference
        "divisionId": DIVISION_ID,
        "organizationId": ORGANIZATION_ID,
        "createdAt": now,
        "updatedAt": now,
        "metadata": {
            "migratedFrom": MIGRATION_TAG,
            "legacyRef": legacy_ref,
            "supabaseVehicleName": name,
            "legacyVehicleType": vehicle_type,  # Preserve original heuristic for audit
            "legacyPlateNumber": plate,
        },
    }


def build_sales_order_doc(
    row: dict,
    customer_uuid_map: dict[str, str],
    vehicle_uuid_map: dict[str, str],
    farm_name_to_id: dict[str, str],
    order_code: str,
) -> dict:
    """
    Build a sales_orders document from orderlist_re row.

    Args:
        row: orderlist_re_rows row
        customer_uuid_map: clientname → UUID
        vehicle_uuid_map: vehiclename → UUID
        farm_name_to_id: farm name → farmId UUID
        order_code: pre-allocated unique code like SO-20250811-0001

    Returns:
        sales_orders document dict
    """
    now = utcnow()
    legacy_ref = row["ref"]
    order_uuid = deterministic_uuid("sales_order", legacy_ref)

    order_date = _parse_dt(row.get("DatePacked") or row.get("StartDate") or "")
    packed_date = _parse_dt(row.get("DatePacked") or "")
    finished_date = _parse_dt(row.get("DateFinished") or "")
    start_date = _parse_dt(row.get("StartDate") or "")

    client_name = (row.get("client_id") or "").strip()
    customer_uuid = customer_uuid_map.get(client_name)

    vehicle_name = (row.get("vehicle_id") or "").strip()
    vehicle_uuid = vehicle_uuid_map.get(vehicle_name)

    farm_name = (row.get("farm_id") or "").strip()
    farm_id = farm_name_to_id.get(farm_name)

    status_raw = (row.get("status") or "Pending").strip()
    # Normalize supabase status to SalesOrderStatus enum values.
    # Reason: SalesOrderStatus enum is draft|confirmed|processing|assigned|in_transit|
    #         shipped|delivered|partially_returned|returned|cancelled — "pending" and
    #         "completed" are NOT valid members and cause Pydantic validation errors
    #         (500s) when the repository reads docs back.
    #
    # Correct mapping (verified against live supabaseStatus distribution):
    #   Pending  → draft       (not yet confirmed / awaiting dispatch)
    #   Started  → processing  (vehicle has departed / in progress)
    #   Finished → delivered   (delivery complete)
    status_map = {
        "Pending":  "draft",       # unconfirmed order, not yet dispatched
        "Started":  "processing",  # delivery has started
        "Finished": "delivered",   # delivery confirmed
        "Cancelled": "cancelled",
        # Legacy value from prior export — kept for safety
        "Done": "delivered",
    }
    status = status_map.get(status_raw, "draft")

    viewing_year_raw = row.get("viewing_year", "")
    viewing_year = int(viewing_year_raw) if viewing_year_raw else None

    return {
        "orderId": order_uuid,
        "orderCode": order_code,
        "orderNumber": row.get("RNumber") or None,
        "orderDate": order_date or now,
        "startDate": start_date,
        "packedDate": packed_date,
        "finishedDate": finished_date,
        "customerId": customer_uuid,
        "customerName": client_name,
        "vehicleId": vehicle_uuid,
        "vehicleName": vehicle_name,
        "farmId": farm_id,
        "farmName": farm_name,
        "driverEmail": (row.get("order_driver") or "").strip() or None,
        "packerEmail": (row.get("packager_email") or "").strip() or None,
        "receiver": (row.get("Reciever") or "").strip() or None,
        "notes": (row.get("note") or "").strip() or None,
        "status": status,
        # Reason: PaymentStatus enum is pending|partial|paid — "unknown" is not a
        # valid member.  Migrated orders have no payment data so "pending" is correct.
        "paymentStatus": "pending",
        "source": "supabase",
        # Reason: SalesOrderBase.items = Field(..., min_length=1) — required, non-empty.
        # Migrated orders are header-only records with no SKU breakdown.  A placeholder
        # item satisfies the model; line-item detail is in sales_order_lines collection.
        "items": [
            {
                "productId": "00000000-0000-0000-0000-000000000000",
                "productName": "Legacy Migration Placeholder",
                "quantity": 1.0,
                "unitPrice": 0.0,
                "totalPrice": 0.0,
                "sourceType": "fresh",
            }
        ],
        "subtotal": 0.0,
        "tax": 0.0,
        "discount": 0.0,
        "total": 0.0,
        "viewingYear": viewing_year,
        # Reason: SalesOrder.createdBy = Field(...) — required, no default.
        "createdBy": ADMIN_UUID,
        "isActive": True,
        "divisionId": DIVISION_ID,
        "organizationId": ORGANIZATION_ID,
        "createdAt": order_date or now,
        "updatedAt": now,
        "metadata": {
            "migratedFrom": MIGRATION_TAG,
            "legacyRef": legacy_ref,
            "supabaseStatus": status_raw,
            "viewingYear": viewing_year,
        },
    }


def build_order_line_doc(
    row: dict,
    order_uuid_map: dict[str, str],
    customer_uuid_map: dict[str, str],
    farm_name_to_id: dict[str, str],
) -> dict:
    """
    Build a sales_order_lines document from order_list_content row.

    Args:
        row: order_list_content_rows row
        order_uuid_map: order legacy ref → order UUID
        customer_uuid_map: clientname → UUID
        farm_name_to_id: farm name → farmId UUID

    Returns:
        sales_order_lines document dict
    """
    now = utcnow()
    legacy_ref = row["ref"]
    line_uuid = deterministic_uuid("order_line", legacy_ref)

    order_ref = row.get("order_list_ref", "").strip()
    order_uuid = order_uuid_map.get(order_ref)

    crop_name = (row.get("crop_id") or "").strip()
    client_name = (row.get("client_id") or "").strip()
    customer_uuid = customer_uuid_map.get(client_name)
    farm_name = (row.get("farm_id") or "").strip()
    farm_id = farm_name_to_id.get(farm_name)

    raw_grade = (row.get("Grade") or "").strip()
    grade = raw_grade if raw_grade in ("A", "B", "C") else None

    pkg_size = float(row["packagesize"]) if row.get("packagesize") else None
    pkg_type = (row.get("packagetype") or "").strip() or None
    qty = int(row["quantity"]) if row.get("quantity") else 0
    total_kg = float(row["totalkg"]) if row.get("totalkg") else None
    total_price = float(row["total_price"]) if row.get("total_price") else None
    avg_price = float(row["avg_price"]) if row.get("avg_price") else None

    created_dt = _parse_dt(row.get("created_time") or "")
    updated_dt = _parse_dt(row.get("updated_time") or "")

    return {
        "lineId": line_uuid,
        "orderId": order_uuid,
        "orderRef": order_ref,
        "cropName": crop_name,
        "customerId": customer_uuid,
        "customerName": client_name,
        "farmId": farm_id,
        "farmName": farm_name,
        "grade": grade,
        "packageSize": pkg_size,
        "packageType": pkg_type,
        "quantity": qty,
        "totalKg": total_kg,
        "totalPrice": total_price,
        "avgPrice": avg_price,
        # Enrichment placeholder from stage5
        "excel_data": None,
        "blockId": None,  # populated by stage5 via inventory source matching
        # sales_order_lines is a migration-only collection (no Pydantic model validation
        # on reads today) but adding createdBy for consistency with all other collections.
        "createdBy": ADMIN_UUID,
        "divisionId": DIVISION_ID,
        "organizationId": ORGANIZATION_ID,
        "createdAt": created_dt or now,
        "updatedAt": updated_dt or now,
        "metadata": {
            "migratedFrom": MIGRATION_TAG,
            "legacyRef": legacy_ref,
            "supabaseOrderRef": order_ref,
        },
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def run(dry_run: bool, reset: bool) -> None:
    """
    Main entry point for stage 4.

    Args:
        dry_run: if True, read and compute but do not write
        reset: if True, delete all migration-tagged docs before importing
    """
    logger = make_logger(STAGE)
    db = get_db()

    if reset:
        logger.info("[RESET] Deleting migration-tagged customers, vehicles, orders, lines...")
        reset_migration_data(db, RESET_COLLECTIONS, logger)

    # Ensure index on sales_order_lines.metadata.legacyRef
    if not dry_run:
        db.sales_order_lines.create_index("metadata.legacyRef", unique=False, background=True)
        db.sales_orders.create_index("metadata.legacyRef", unique=False, background=True)

    # Load CSVs
    logger.info("Loading CSVs...")
    client_rows = load_clients()
    vehicle_rows = load_vehicles()
    order_rows_raw = load_orders()
    line_rows_raw = load_order_lines()

    # Filter NH from orders (farm_id column holds farm name in supabase)
    order_rows = [
        r for r in order_rows_raw
        if not is_excluded_farm(r.get("farm_id", ""))
    ]
    ord_excl = len(order_rows_raw) - len(order_rows)

    line_rows = [
        r for r in line_rows_raw
        if not is_excluded_farm(r.get("farm_id", ""))
    ]
    line_excl = len(line_rows_raw) - len(line_rows)

    if ord_excl or line_excl:
        logger.info(
            f"NH exclusion: {ord_excl} orders excluded, {line_excl} order lines excluded"
        )

    logger.info(
        f"CSVs: {len(client_rows)} clients, {len(vehicle_rows)} vehicles, "
        f"{len(order_rows)} orders (excl. {ord_excl} NH), "
        f"{len(line_rows)} order lines (excl. {line_excl} NH)"
    )

    # Build lookup maps for denormalization
    # clientname → UUID (set during customer import)
    customer_uuid_map: dict[str, str] = {}
    vehicle_uuid_map: dict[str, str] = {}

    # Load farm name→ID map from migrated farms
    farm_name_to_id: dict[str, str] = {}
    for doc in db.farms.find(
        {"metadata.migratedFrom": MIGRATION_TAG},
        {"name": 1, "farmId": 1, "_id": 0},
    ):
        farm_name_to_id[doc["name"]] = str(doc["farmId"])

    logger.info(f"Loaded {len(farm_name_to_id)} migrated farms for lookup")

    # ---------------------------------------------------------------
    # Pre-allocate unique codes for all three collections
    # Reason: unique index on customerCode/vehicleCode/orderCode means we must
    # assign codes before the upsert loop, and must reuse existing ones on re-run.
    # ---------------------------------------------------------------
    logger.info("Allocating customer codes (C-NNNN)...")
    customer_code_map = build_customer_code_map(client_rows, db, dry_run)
    logger.info(
        f"  Sample codes: "
        + ", ".join(
            f"{row['ref'][:8]}…→{customer_code_map[row['ref']]}"
            for row in client_rows[:3]
        )
    )

    logger.info("Allocating vehicle codes (V-NNN)...")
    vehicle_code_map = build_vehicle_code_map(vehicle_rows, db, dry_run)
    logger.info(
        f"  Sample codes: "
        + ", ".join(
            f"{row['ref'][:8]}…→{vehicle_code_map[row['ref']]}"
            for row in vehicle_rows[:3]
        )
    )

    logger.info("Allocating order codes (SO-YYYYMMDD-NNNN)...")
    order_code_map = build_order_code_map(order_rows, db, dry_run)
    logger.info(
        f"  Sample codes: "
        + ", ".join(
            f"{row['ref'][:8]}…→{order_code_map[row['ref']]}"
            for row in order_rows[:3]
        )
    )

    # Counters
    inserted = updated = skipped = 0
    error_samples: list[str] = []

    # ---------------------------------------------------------------
    # Customers
    # ---------------------------------------------------------------
    logger.info(f"Importing {len(client_rows)} customers...")
    for row in client_rows:
        legacy_ref = row["ref"]
        client_name = row.get("clientname", "").strip()
        doc = build_customer_doc(row, customer_code_map[legacy_ref])
        customer_uuid_map[client_name] = doc["customerId"]
        try:
            ins, upd = upsert_by_legacy_ref(
                db.customers, doc, legacy_ref, dry_run=dry_run, logger=logger
            )
            if ins:
                inserted += 1
            elif upd:
                updated += 1
            logger.debug(f"  Customer: {client_name} [{doc['customerCode']}]")
        except Exception as exc:
            msg = f"Customer upsert failed ref={legacy_ref} name={client_name}: {exc}"
            logger.error(msg)
            error_samples.append(msg)

    logger.info(f"Customers done: {inserted} inserted, {updated} updated")
    cust_ins, cust_upd = inserted, updated
    inserted = updated = 0

    # ---------------------------------------------------------------
    # Vehicles
    # ---------------------------------------------------------------
    logger.info(f"Importing {len(vehicle_rows)} vehicles...")
    for row in vehicle_rows:
        legacy_ref = row["ref"]
        vehicle_name = row.get("vehiclename", "").strip()
        doc = build_vehicle_doc(row, vehicle_code_map[legacy_ref])
        vehicle_uuid_map[vehicle_name] = doc["vehicleId"]
        try:
            ins, upd = upsert_by_legacy_ref(
                db.vehicles, doc, legacy_ref, dry_run=dry_run, logger=logger
            )
            if ins:
                inserted += 1
            elif upd:
                updated += 1
            logger.debug(f"  Vehicle: {vehicle_name} [{doc['vehicleCode']}]")
        except Exception as exc:
            msg = f"Vehicle upsert failed ref={legacy_ref} name={vehicle_name}: {exc}"
            logger.error(msg)
            error_samples.append(msg)

    logger.info(f"Vehicles done: {inserted} inserted, {updated} updated")
    veh_ins, veh_upd = inserted, updated
    inserted = updated = 0

    # ---------------------------------------------------------------
    # Sales orders — build UUID map for order lines join
    # ---------------------------------------------------------------
    logger.info(f"Importing {len(order_rows)} sales orders...")
    order_uuid_map: dict[str, str] = {}  # legacyRef → order UUID

    for row in order_rows:
        legacy_ref = row["ref"]
        order_uuid = deterministic_uuid("sales_order", legacy_ref)
        order_uuid_map[legacy_ref] = order_uuid
        doc = build_sales_order_doc(
            row,
            customer_uuid_map,
            vehicle_uuid_map,
            farm_name_to_id,
            order_code_map[legacy_ref],
        )
        try:
            ins, upd = upsert_by_legacy_ref(
                db.sales_orders, doc, legacy_ref, dry_run=dry_run, logger=logger
            )
            if ins:
                inserted += 1
            elif upd:
                updated += 1
        except Exception as exc:
            msg = f"Order upsert failed ref={legacy_ref} code={order_code_map[legacy_ref]}: {exc}"
            logger.error(msg)
            error_samples.append(msg)

    logger.info(f"Orders done: {inserted} inserted, {updated} updated")
    ord_ins, ord_upd = inserted, updated
    inserted = updated = 0

    # ---------------------------------------------------------------
    # Order lines
    # ---------------------------------------------------------------
    logger.info(f"Importing {len(line_rows)} order lines...")
    for row in line_rows:
        legacy_ref = row["ref"]
        doc = build_order_line_doc(
            row, order_uuid_map, customer_uuid_map, farm_name_to_id
        )
        try:
            ins, upd = upsert_by_legacy_ref(
                db.sales_order_lines, doc, legacy_ref, dry_run=dry_run, logger=logger
            )
            if ins:
                inserted += 1
            elif upd:
                updated += 1
        except Exception as exc:
            msg = f"Order line upsert failed ref={legacy_ref}: {exc}"
            logger.error(msg)
            error_samples.append(msg)

    logger.info(f"Order lines done: {inserted} inserted, {updated} updated")

    total_rows = len(client_rows) + len(vehicle_rows) + len(order_rows) + len(line_rows)
    total_inserted = cust_ins + veh_ins + ord_ins + inserted
    total_updated = cust_upd + veh_upd + ord_upd + updated

    print_summary(
        stage=STAGE,
        rows_read=total_rows,
        rows_inserted=total_inserted,
        rows_updated=total_updated,
        rows_skipped=skipped,
        rows_errored=len(error_samples),
        error_samples=error_samples,
        logger=logger,
    )

    if error_samples:
        logger.warning(
            f"Stage completed with {len(error_samples)} error(s). Review log."
        )
        sys.exit(1)


if __name__ == "__main__":
    parser = make_arg_parser(
        "Stage 4: Import customers, vehicles, sales_orders, sales_order_lines from Supabase CSVs"
    )
    args = parser.parse_args()
    run(dry_run=args.dry_run, reset=args.reset)
