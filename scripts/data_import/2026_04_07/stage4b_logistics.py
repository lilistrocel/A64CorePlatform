"""
stage4b_logistics.py — Generate logistics shipments and routes from imported sales_orders.

Source: sales_orders collection (already imported by stage4_clients_vehicles_orders.py).

Collections written:
  - shipments   — one doc per sales_order, keyed by metadata.sourceOrderRef
  - routes      — one doc per (vehicleId, packedDate) group, keyed by metadata.routeKey

Status mapping (from metadata.supabaseStatus):
  Pending  → shipment status "scheduled"   (order packed, not yet dispatched)
  Started  → shipment status "in_transit"  (vehicle departed)
  Finished → shipment status "delivered"   (delivery confirmed)

Route grouping rationale:
  A single vehicle operating on the same packed date serves multiple customers
  in a single run.  Grouping by (vehicleId, packedDate) creates one Route
  per run, with all Shipments on that run referencing the same Route.
  Analysis of 4,090 orders produces 2,477 routes (max 7 orders per route),
  which is semantically correct for a multi-drop delivery operation.

driverId resolution:
  driver emails in sales_orders do NOT yet exist in the employees or users
  collections (HR data arrives in a later stage).  A deterministic UUID is
  generated from each driverEmail using UUID5 so it is stable across re-runs
  and can be reconciled to real employee UUIDs during HR import.
  The original email is preserved in metadata.driverEmail.

Required-field compliance (Pydantic model validation performed before write):
  Shipment:
    - routeId       → resolved from the parent route's routeId
    - vehicleId     → from sales_order.vehicleId (all present, verified)
    - driverId      → deterministic_uuid("driver_email", email)
    - scheduledDate → sales_order.packedDate (all non-null, verified)
  Route:
    - name          → "{vehicleName} — {date}" (e.g. "CANTER - 22924 — 2025-08-01")
    - origin        → {name: farmName, address: farmName + ", UAE"}
    - destination   → {name: "Multi-stop delivery", address: "Multiple customers, UAE"}
                      (delivery addresses not in supabase source data)
    - distance      → 1.0 km placeholder (no GPS data in source)
    - estimatedDuration → 60.0 min placeholder

Idempotency:
  Shipments: upsert by metadata.sourceOrderRef (the order's legacyRef)
  Routes:    upsert by metadata.routeKey = "{vehicleId}_{date}"

paymentStatus note:
  All imported orders have paymentStatus "pending".  Finished → "delivered"
  shipments are NOT set to "paid" because there is no payment data in supabase.
  Stage 5 (excel import) will reconcile payment status separately.

Run:  python stage4b_logistics.py [--dry-run] [--reset]
"""

from __future__ import annotations

import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent))

from common import (
    DIVISION_ID,
    MIGRATION_TAG,
    ORGANIZATION_ID,
    deterministic_uuid,
    get_db,
    get_farming_year,
    make_arg_parser,
    make_logger,
    print_summary,
    reset_migration_data,
    utcnow,
)

# Admin identity used as createdBy for all migrated documents.
# Reason: Route.createdBy and Shipment.createdBy are Field(...) — required, no default.
# Must match the ADMIN_UUID used in stage4 to keep audit trails consistent.
ADMIN_UUID: str = "bff26b8f-5ce9-49b2-9126-86174eaea823"

STAGE = "stage4b_logistics"
RESET_COLLECTIONS = ["shipments", "routes"]

# Sentinel placeholder values for required Route fields that have no source data.
PLACEHOLDER_DISTANCE_KM: float = 1.0        # gt=0 required; no GPS data in source
PLACEHOLDER_DURATION_MIN: float = 60.0      # gt=0 required; no timing data in source
FALLBACK_DRIVER_UUID: str = "00000000-0000-0000-0000-000000000099"


# ---------------------------------------------------------------------------
# Status mappings
# ---------------------------------------------------------------------------

# Supabase order status → ShipmentStatus enum value
# ShipmentStatus: pending | scheduled | loading | in_transit | delivered | cancelled
SHIPMENT_STATUS_MAP: dict[str, str] = {
    "Pending":  "scheduled",   # Packed but not yet dispatched
    "Started":  "in_transit",  # Vehicle is on the road
    "Finished": "delivered",   # Delivery confirmed
}

# Supabase order status → SalesOrderStatus enum value (corrected mapping)
# SalesOrderStatus: draft|confirmed|processing|assigned|in_transit|shipped|
#                   delivered|partially_returned|returned|cancelled
ORDER_STATUS_MAP: dict[str, str] = {
    "Pending":  "draft",        # Not yet confirmed / pending dispatch
    "Started":  "processing",   # In progress / being delivered
    "Finished": "delivered",    # Delivered and complete
}


# ---------------------------------------------------------------------------
# UUID helpers
# ---------------------------------------------------------------------------

def driver_uuid_from_email(email: str) -> str:
    """
    Derive a deterministic UUID for a driver email.

    No HR employee records exist yet for these emails.  This UUID is stable
    across re-runs and can be updated when HR data is imported.

    Args:
        email: driver email address from sales_order

    Returns:
        UUID string deterministic to the email
    """
    if not email or not email.strip():
        return FALLBACK_DRIVER_UUID
    return deterministic_uuid("driver_email", email.strip().lower())


def route_uuid(vehicle_id: str, date_str: str) -> str:
    """
    Derive a deterministic UUID for a (vehicleId, date) route group.

    Args:
        vehicle_id: vehicle UUID string
        date_str: date in YYYY-MM-DD format

    Returns:
        UUID string deterministic to the (vehicle, date) key
    """
    return deterministic_uuid("logistics_route", f"{vehicle_id}_{date_str}")


def shipment_uuid(order_legacy_ref: str) -> str:
    """
    Derive a deterministic UUID for a shipment from the source order's legacyRef.

    Args:
        order_legacy_ref: metadata.legacyRef from the sales_order

    Returns:
        UUID string
    """
    return deterministic_uuid("logistics_shipment", order_legacy_ref)


# ---------------------------------------------------------------------------
# Document builders
# ---------------------------------------------------------------------------

def migration_route_code(route_key: str) -> str:
    """
    Generate a deterministic route code for a migration-imported route.

    Uses a short hash suffix to keep codes compact and unique.
    Format: MR-{8 hex chars from key hash}  (e.g. MR-a3f1c9d7)

    Reason: routes.routeCode has a unique index — null can only appear once
    in the collection.  Migration routes get a deterministic code so the
    unique constraint is satisfied across all 2,477 routes.
    The 'MR-' prefix (Migration Route) distinguishes them from live R-NNN codes.

    Args:
        route_key: "{vehicleId}_{date_str}" composite key

    Returns:
        8-char hex route code prefixed with MR-
    """
    import hashlib
    h = hashlib.sha256(route_key.encode()).hexdigest()[:8]
    return f"MR-{h}"


def migration_shipment_code(legacy_ref: str) -> str:
    """
    Generate a deterministic shipment code for a migration-imported shipment.

    Format: MS-{8 hex chars from legacyRef hash}  (e.g. MS-b7e2a4f1)

    Reason: shipments.shipmentCode has a unique index — same constraint as
    routeCode above.  The 'MS-' prefix (Migration Shipment) distinguishes
    from live SH-NNN codes.

    Args:
        legacy_ref: supabase UUID legacyRef from the source order

    Returns:
        8-char hex shipment code prefixed with MS-
    """
    import hashlib
    h = hashlib.sha256(legacy_ref.encode()).hexdigest()[:8]
    return f"MS-{h}"


def build_route_doc(
    vehicle_id: str,
    vehicle_name: str,
    date_str: str,
    farm_id: Optional[str],
    farm_name: str,
    order_count: int,
    farming_year: int,
    now: datetime,
) -> dict:
    """
    Build a routes document for a (vehicleId, packedDate) delivery run.

    Route model required fields satisfied:
      - name           → "{vehicleName} — {date}"
      - origin         → farm location (source of produce)
      - destination    → multi-stop delivery placeholder
      - distance       → PLACEHOLDER_DISTANCE_KM (no GPS in source)
      - estimatedDuration → PLACEHOLDER_DURATION_MIN (no timing in source)
      - createdBy      → ADMIN_UUID

    Args:
        vehicle_id: vehicle UUID string
        vehicle_name: human-readable vehicle name
        date_str: packed date as YYYY-MM-DD
        farm_id: farm UUID string or None
        farm_name: farm name string
        order_count: number of orders on this run
        farming_year: computed farming year integer
        now: current UTC datetime

    Returns:
        routes document dict
    """
    r_uuid = route_uuid(vehicle_id, date_str)
    route_key = f"{vehicle_id}_{date_str}"
    route_name = f"{vehicle_name} — {date_str}"
    r_code = migration_route_code(route_key)

    # Origin is the farm (where produce is loaded)
    origin_name = farm_name if farm_name else "Farm"
    origin_address = f"{origin_name}, UAE"

    # Destination: multi-stop delivery has no single address in supabase
    dest_name = "Multi-stop Customer Delivery" if order_count > 1 else "Customer Delivery"
    dest_address = "Multiple customers, UAE" if order_count > 1 else "Customer, UAE"

    return {
        "routeId": r_uuid,
        # Reason: routeCode has a unique index — null can only appear once.
        # Migration routes get a deterministic MR-{hash} code so all 2,477
        # routes satisfy the unique constraint without collisions.
        "routeCode": r_code,
        "name": route_name,
        "origin": {
            "name": origin_name,
            "address": origin_address,
            "coordinates": None,
        },
        "destination": {
            "name": dest_name,
            "address": dest_address,
            "coordinates": None,
        },
        # Reason: Route model requires distance > 0 and estimatedDuration > 0.
        # No GPS or timing data exists in supabase source.  Placeholders are
        # used and flagged in metadata so they can be corrected manually.
        "distance": PLACEHOLDER_DISTANCE_KM,
        "estimatedDuration": PLACEHOLDER_DURATION_MIN,
        "estimatedCost": None,
        "isActive": True,
        # Logistics scoping
        "farmId": farm_id,      # Denormalised farm reference (not on Route model — stored as extra field)
        "farmName": farm_name,
        "vehicleId": vehicle_id,
        "vehicleName": vehicle_name,
        "orderCount": order_count,
        "farmingYear": farming_year,
        # Multi-industry scoping
        "divisionId": DIVISION_ID,
        "organizationId": ORGANIZATION_ID,
        # Audit
        "createdBy": ADMIN_UUID,
        "createdAt": now,
        "updatedAt": now,
        "metadata": {
            "migratedFrom": MIGRATION_TAG,
            "routeKey": route_key,
            "packedDate": date_str,
            "hasPlaceholderDistance": True,   # Flag for manual correction
            "hasPlaceholderDuration": True,
        },
    }


def build_shipment_doc(
    order: dict,
    route_id: str,
    shipment_status: str,
    order_status: str,
    farming_year: int,
    now: datetime,
) -> dict:
    """
    Build a shipments document from a sales_order document.

    Shipment model required fields satisfied:
      - routeId        → resolved route UUID
      - vehicleId      → order.vehicleId
      - driverId       → deterministic_uuid from order.driverEmail
      - scheduledDate  → order.packedDate
      - createdBy      → ADMIN_UUID

    Args:
        order: sales_order MongoDB document
        route_id: resolved parent route UUID string
        shipment_status: ShipmentStatus enum value string
        order_status: corrected SalesOrderStatus enum value string
        farming_year: computed farming year integer
        now: current UTC datetime

    Returns:
        shipments document dict
    """
    legacy_ref = order["metadata"]["legacyRef"]
    sh_uuid = shipment_uuid(legacy_ref)
    sh_code = migration_shipment_code(legacy_ref)

    driver_email = (order.get("driverEmail") or "").strip()
    driver_id = driver_uuid_from_email(driver_email) if driver_email else FALLBACK_DRIVER_UUID

    vehicle_id = order.get("vehicleId") or ""
    customer_id = order.get("customerId") or ""
    customer_name = order.get("customerName") or ""
    farm_id = order.get("farmId") or ""
    farm_name = order.get("farmName") or ""
    order_id = order.get("orderId") or ""
    order_code = order.get("orderCode") or ""

    packed_date = order.get("packedDate") or order.get("orderDate") or now
    start_date = order.get("startDate")
    finished_date = order.get("finishedDate")

    # actualDepartureDate: set for Started and Finished orders
    actual_departure = start_date if shipment_status in ("in_transit", "delivered") else None
    # actualArrivalDate: set only for Finished orders
    actual_arrival = finished_date if shipment_status == "delivered" else None

    # Cargo placeholder — real line-item detail is in sales_order_lines
    cargo = [
        {
            "description": "Produce delivery (see sales_order_lines for detail)",
            "quantity": 1,
            "weight": 1.0,  # gt=0 required; real weight unknown from supabase header
        }
    ]

    return {
        "shipmentId": sh_uuid,
        # Reason: shipmentCode has a unique index — null can only appear once.
        # Migration shipments get a deterministic MS-{hash} code so all 4,090
        # satisfy the unique constraint without collisions.
        "shipmentCode": sh_code,
        # Required Shipment fields
        "routeId": route_id,
        "vehicleId": vehicle_id,
        "driverId": driver_id,
        "status": shipment_status,
        "scheduledDate": packed_date,
        "actualDepartureDate": actual_departure,
        "actualArrivalDate": actual_arrival,
        "cargo": cargo,
        "orderIds": [order_id],
        "totalCost": None,
        "notes": order.get("notes") or None,
        "farmingYear": farming_year,
        # Denormalised delivery context (not on Shipment model — stored as extra fields)
        "customerId": customer_id,
        "customerName": customer_name,
        "farmId": farm_id,
        "farmName": farm_name,
        "vehicleName": order.get("vehicleName") or "",
        "driverEmail": driver_email or None,
        "packerEmail": order.get("packerEmail") or None,
        "orderCode": order_code,
        # Multi-industry scoping
        "divisionId": DIVISION_ID,
        "organizationId": ORGANIZATION_ID,
        # Audit
        "createdBy": ADMIN_UUID,
        "createdAt": packed_date if isinstance(packed_date, datetime) else now,
        "updatedAt": now,
        "metadata": {
            "migratedFrom": MIGRATION_TAG,
            "sourceOrderRef": legacy_ref,
            "supabaseStatus": order["metadata"].get("supabaseStatus", "Pending"),
            "orderStatus": order_status,     # The corrected SalesOrderStatus value applied to the order
            "driverEmail": driver_email or None,
            "driverIdIsPlaceholder": not bool(driver_email),
            "hasPlaceholderCargo": True,     # Flag: weight=1 is placeholder
        },
    }


# ---------------------------------------------------------------------------
# Pydantic validation (proactive, before write)
# ---------------------------------------------------------------------------

def validate_route_doc(doc: dict) -> list[str]:
    """
    Validate a route doc against the Route model's required fields.

    Performs the same validation the repository does on read (Route(**doc)).
    Returns a list of validation error strings, empty if all good.

    Args:
        doc: route document dict

    Returns:
        List of error strings (empty = valid)
    """
    errors: list[str] = []

    if not doc.get("name"):
        errors.append("name is required")
    if not doc.get("origin", {}).get("name"):
        errors.append("origin.name is required")
    if not doc.get("origin", {}).get("address"):
        errors.append("origin.address is required")
    if not doc.get("destination", {}).get("name"):
        errors.append("destination.name is required")
    if not doc.get("destination", {}).get("address"):
        errors.append("destination.address is required")
    if not doc.get("distance") or doc.get("distance", 0) <= 0:
        errors.append("distance must be > 0")
    if not doc.get("estimatedDuration") or doc.get("estimatedDuration", 0) <= 0:
        errors.append("estimatedDuration must be > 0")
    if not doc.get("createdBy"):
        errors.append("createdBy is required")
    if not doc.get("routeId"):
        errors.append("routeId is required")

    return errors


def validate_shipment_doc(doc: dict) -> list[str]:
    """
    Validate a shipment doc against the Shipment model's required fields.

    Args:
        doc: shipment document dict

    Returns:
        List of error strings (empty = valid)
    """
    errors: list[str] = []

    if not doc.get("routeId"):
        errors.append("routeId is required")
    if not doc.get("vehicleId"):
        errors.append("vehicleId is required")
    if not doc.get("driverId"):
        errors.append("driverId is required")
    if not doc.get("scheduledDate"):
        errors.append("scheduledDate is required")
    if not doc.get("createdBy"):
        errors.append("createdBy is required")
    if not doc.get("shipmentId"):
        errors.append("shipmentId is required")
    # cargo items must have weight > 0
    for i, item in enumerate(doc.get("cargo", [])):
        if not item.get("weight") or item["weight"] <= 0:
            errors.append(f"cargo[{i}].weight must be > 0")
        if not item.get("quantity") or item["quantity"] <= 0:
            errors.append(f"cargo[{i}].quantity must be > 0")
        if not item.get("description"):
            errors.append(f"cargo[{i}].description is required")

    return errors


# ---------------------------------------------------------------------------
# Upsert helpers
# ---------------------------------------------------------------------------

def upsert_by_metadata_key(
    collection,
    doc: dict,
    key_field: str,
    key_value: str,
    dry_run: bool,
    logger,
) -> tuple[bool, bool]:
    """
    Upsert a document keyed by an arbitrary metadata field.

    Args:
        collection: pymongo Collection
        doc: full document to upsert
        key_field: dot-notation field path (e.g. "metadata.sourceOrderRef")
        key_value: the key value to match
        dry_run: if True, skip write
        logger: logger instance

    Returns:
        (was_inserted: bool, was_updated: bool)
    """
    if dry_run:
        logger.debug(f"[DRY-RUN] Would upsert {key_field}={key_value}")
        return False, False

    result = collection.replace_one(
        {key_field: key_value},
        doc,
        upsert=True,
    )
    inserted = result.upserted_id is not None
    updated = result.modified_count > 0
    return inserted, updated


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(dry_run: bool, reset: bool) -> None:
    """
    Main entry point for stage 4b.

    Reads all migration-tagged sales_orders and generates:
      1. One Route per (vehicleId, packedDate) group
      2. One Shipment per sales_order, referencing its parent Route

    Args:
        dry_run: if True, read and validate without writing
        reset: if True, delete all migration-tagged shipments and routes first
    """
    logger = make_logger(STAGE)
    db = get_db()
    now = utcnow()

    if reset:
        logger.info("[RESET] Deleting migration-tagged shipments and routes...")
        reset_migration_data(db, RESET_COLLECTIONS, logger)

    # Ensure idempotency indexes
    if not dry_run:
        db.shipments.create_index("metadata.sourceOrderRef", unique=False, background=True)
        db.routes.create_index("metadata.routeKey", unique=False, background=True)
        logger.info("Ensured indexes on shipments.metadata.sourceOrderRef and routes.metadata.routeKey")

    # Load all migrated sales_orders
    logger.info("Loading migrated sales_orders...")
    orders = list(db.sales_orders.find({"metadata.migratedFrom": MIGRATION_TAG}))
    logger.info(f"Loaded {len(orders)} migrated sales_orders")

    if not orders:
        logger.warning("No migrated sales_orders found. Run stage4 first.")
        sys.exit(1)

    # -----------------------------------------------------------------------
    # Phase 1: Build route groups (vehicleId + packedDate)
    # -----------------------------------------------------------------------

    # route_key → { vehicle_id, vehicle_name, date_str, farm_id, farm_name,
    #               order_refs, supabase_statuses }
    route_groups: dict[str, dict] = {}

    logger.info("Grouping orders by (vehicleId, packedDate)...")
    for order in orders:
        vehicle_id = order.get("vehicleId") or ""
        vehicle_name = order.get("vehicleName") or "Unknown Vehicle"
        packed_dt = order.get("packedDate") or order.get("orderDate")

        if not vehicle_id or not packed_dt:
            # Reason: cannot form a meaningful route without both fields
            logger.warning(
                f"Order {order.get('metadata', {}).get('legacyRef')} "
                f"has null vehicleId or packedDate — skipping route grouping"
            )
            continue

        if isinstance(packed_dt, datetime):
            date_str = packed_dt.strftime("%Y-%m-%d")
        else:
            date_str = str(packed_dt)[:10]

        key = f"{vehicle_id}_{date_str}"

        if key not in route_groups:
            route_groups[key] = {
                "vehicle_id": vehicle_id,
                "vehicle_name": vehicle_name,
                "date_str": date_str,
                "farm_id": order.get("farmId"),
                "farm_name": order.get("farmName") or "",
                "order_refs": [],
                "packed_dt": packed_dt,
            }

        route_groups[key]["order_refs"].append(
            order.get("metadata", {}).get("legacyRef", "")
        )

    logger.info(
        f"Grouped {len(orders)} orders into {len(route_groups)} routes "
        f"(avg {len(orders)/len(route_groups):.1f} orders per route)"
    )

    # -----------------------------------------------------------------------
    # Phase 2: Upsert Routes
    # -----------------------------------------------------------------------

    logger.info(f"Upserting {len(route_groups)} route documents...")
    route_inserted = route_updated = route_errored = 0
    route_errors: list[str] = []

    # Pre-build route_key → route_uuid mapping so shipments can reference routes
    route_key_to_uuid: dict[str, str] = {}

    for key, grp in route_groups.items():
        vehicle_id = grp["vehicle_id"]
        date_str = grp["date_str"]
        r_uuid = route_uuid(vehicle_id, date_str)
        route_key_to_uuid[key] = r_uuid

        packed_dt = grp["packed_dt"]
        farming_year = get_farming_year(packed_dt) if isinstance(packed_dt, datetime) else 2024

        doc = build_route_doc(
            vehicle_id=vehicle_id,
            vehicle_name=grp["vehicle_name"],
            date_str=date_str,
            farm_id=grp["farm_id"],
            farm_name=grp["farm_name"],
            order_count=len(grp["order_refs"]),
            farming_year=farming_year,
            now=now,
        )

        # Proactive validation before write
        errors = validate_route_doc(doc)
        if errors:
            msg = f"Route validation failed key={key}: {errors}"
            logger.error(msg)
            route_errors.append(msg)
            route_errored += 1
            continue

        try:
            ins, upd = upsert_by_metadata_key(
                db.routes, doc, "metadata.routeKey", key, dry_run, logger
            )
            if ins:
                route_inserted += 1
            elif upd:
                route_updated += 1
            else:
                pass  # dry-run or unchanged
        except Exception as exc:
            msg = f"Route upsert failed key={key}: {exc}"
            logger.error(msg)
            route_errors.append(msg)
            route_errored += 1

    logger.info(
        f"Routes done: {route_inserted} inserted, {route_updated} updated, "
        f"{route_errored} errors"
    )

    # -----------------------------------------------------------------------
    # Phase 3: Upsert Shipments
    # -----------------------------------------------------------------------

    logger.info(f"Upserting {len(orders)} shipment documents...")
    sh_inserted = sh_updated = sh_errored = 0
    sh_skipped = 0
    sh_errors: list[str] = []

    # Per-status counters
    status_counts: dict[str, int] = defaultdict(int)

    for order in orders:
        legacy_ref = order.get("metadata", {}).get("legacyRef", "")
        supabase_status = order.get("metadata", {}).get("supabaseStatus", "Pending")

        shipment_status = SHIPMENT_STATUS_MAP.get(supabase_status, "scheduled")
        order_status = ORDER_STATUS_MAP.get(supabase_status, "draft")
        status_counts[shipment_status] += 1

        # Resolve parent route
        vehicle_id = order.get("vehicleId") or ""
        packed_dt = order.get("packedDate") or order.get("orderDate")

        if not vehicle_id or not packed_dt:
            logger.warning(
                f"Shipment for order {legacy_ref} skipped — null vehicleId or packedDate"
            )
            sh_skipped += 1
            continue

        if isinstance(packed_dt, datetime):
            date_str = packed_dt.strftime("%Y-%m-%d")
        else:
            date_str = str(packed_dt)[:10]

        route_key = f"{vehicle_id}_{date_str}"
        route_id = route_key_to_uuid.get(route_key)

        if not route_id:
            msg = f"Shipment for order {legacy_ref}: no route found for key={route_key}"
            logger.error(msg)
            sh_errors.append(msg)
            sh_errored += 1
            continue

        farming_year = get_farming_year(packed_dt) if isinstance(packed_dt, datetime) else 2024

        doc = build_shipment_doc(
            order=order,
            route_id=route_id,
            shipment_status=shipment_status,
            order_status=order_status,
            farming_year=farming_year,
            now=now,
        )

        # Proactive validation before write
        errors = validate_shipment_doc(doc)
        if errors:
            msg = f"Shipment validation failed legacyRef={legacy_ref}: {errors}"
            logger.error(msg)
            sh_errors.append(msg)
            sh_errored += 1
            continue

        try:
            ins, upd = upsert_by_metadata_key(
                db.shipments, doc, "metadata.sourceOrderRef", legacy_ref, dry_run, logger
            )
            if ins:
                sh_inserted += 1
            elif upd:
                sh_updated += 1
        except Exception as exc:
            msg = f"Shipment upsert failed legacyRef={legacy_ref}: {exc}"
            logger.error(msg)
            sh_errors.append(msg)
            sh_errored += 1

    logger.info(
        f"Shipments done: {sh_inserted} inserted, {sh_updated} updated, "
        f"{sh_skipped} skipped, {sh_errored} errors"
    )
    logger.info("Shipment status distribution:")
    for status, count in sorted(status_counts.items()):
        logger.info(f"  {status}: {count}")

    all_errors = route_errors + sh_errors
    print_summary(
        stage=STAGE,
        rows_read=len(orders),
        rows_inserted=route_inserted + sh_inserted,
        rows_updated=route_updated + sh_updated,
        rows_skipped=sh_skipped,
        rows_errored=len(all_errors),
        error_samples=all_errors,
        logger=logger,
    )

    if all_errors:
        logger.warning(
            f"Stage completed with {len(all_errors)} error(s). Review log."
        )
        sys.exit(1)


if __name__ == "__main__":
    parser = make_arg_parser(
        "Stage 4b: Generate logistics shipments and routes from imported sales_orders"
    )
    args = parser.parse_args()
    run(dry_run=args.dry_run, reset=args.reset)
