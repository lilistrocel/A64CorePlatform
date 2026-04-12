"""
stage7_finalize.py — Finalization: farm_assignments for admin + financial_summary aggregation.

Actions:
  1. Find admin user(s) in `users` collection (email = admin@a64platform.com)
  2. For EACH farm (PC Farm + all imported), upsert into farm_assignments:
       { userId, farmId, role: "admin", assignedAt, assignedBy: admin UUID }
  3. Rebuild `financial_summary` collection (idempotent full rebuild):
       Aggregate by (farmId, cropName, yearMonth) from:
         - sales_order_lines with excel_data.totalActualValue (revenue)
         - purchase_register items:
             * Items with mappedCropName → cost allocated to (farm, crop, month)
               BUT we don't have a farm column on purchase items, so crop-specific
               costs are distributed across ALL farms that grew that crop in that month
               proportionally by their revenue share.
             * Items with no mappedCropName → overhead, distributed by farm-month revenue ratio

Run:  python stage7_finalize.py [--dry-run] [--reset]
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
    PC_FARM_UUID,
    deterministic_uuid,
    get_db,
    make_arg_parser,
    make_logger,
    print_summary,
    utcnow,
)

STAGE = "stage7_finalize"
ADMIN_EMAIL = "admin@a64platform.com"


# ---------------------------------------------------------------------------
# Farm assignments
# ---------------------------------------------------------------------------


def upsert_farm_assignments(db, admin_user: dict, dry_run: bool, logger) -> int:
    """
    Upsert farm_assignments for admin user across all farms.

    Args:
        db: pymongo Database
        admin_user: admin user document from users collection
        dry_run: if True, do not write
        logger: logger instance

    Returns:
        count of assignments upserted
    """
    admin_uuid = str(admin_user.get("userId") or admin_user.get("_id", ""))
    admin_email = admin_user.get("email", ADMIN_EMAIL)
    now = utcnow()

    # Collect all farms
    all_farms = list(db.farms.find({}, {"farmId": 1, "name": 1, "_id": 0}))
    logger.info(f"Found {len(all_farms)} farms for assignment")

    # Check existing assignment shape (if any docs exist, match it)
    existing_sample = db.farm_assignments.find_one({})
    has_role_field = existing_sample is None or "role" in (existing_sample or {})

    count = 0
    for farm in all_farms:
        farm_id = str(farm.get("farmId", ""))
        farm_name = farm.get("name", "")

        doc_key = f"admin|{admin_uuid}|{farm_id}"
        doc_uuid = deterministic_uuid("farm_assignment", doc_key)

        assignment_doc = {
            "assignmentId": doc_uuid,
            "userId": admin_uuid,
            "userEmail": admin_email,
            "farmId": farm_id,
            "farmName": farm_name,
            "role": "admin",
            "assignedAt": now,
            "assignedBy": admin_uuid,
            "isActive": True,
            "createdAt": now,
            "updatedAt": now,
        }

        if not dry_run:
            try:
                db.farm_assignments.replace_one(
                    {"userId": admin_uuid, "farmId": farm_id},
                    assignment_doc,
                    upsert=True,
                )
                logger.debug(f"  farm_assignment: admin → {farm_name} ({farm_id})")
                count += 1
            except Exception as exc:
                logger.error(f"farm_assignment upsert failed for farm {farm_id}: {exc}")
        else:
            logger.debug(f"  [DRY-RUN] Would assign admin → {farm_name} ({farm_id})")
            count += 1

    return count


# ---------------------------------------------------------------------------
# Financial summary aggregation
# ---------------------------------------------------------------------------


def build_financial_summary(db, dry_run: bool, logger) -> int:
    """
    Aggregate financial data into financial_summary collection.

    Algorithm:
    1. Collect all revenue by (farmId, cropName, yearMonth) from sales_order_lines
       where excel_data.totalActualValue is set.
    2. Collect all cost by (cropName, yearMonth) from purchase_register items.
    3. For crop-specific costs (mappedCropName != None):
       - Find all farms with revenue for that (cropName, yearMonth)
       - Distribute cost proportionally by revenue share
    4. For overhead costs (mappedCropName == None):
       - Distribute by farm-month total revenue ratio
    5. Upsert into financial_summary.

    Args:
        db: pymongo Database
        dry_run: if True, do not write
        logger: logger instance

    Returns:
        count of financial_summary docs upserted
    """
    logger.info("Step 1: Aggregating revenue from sales_order_lines...")

    # revenue_by_key[(farmId, cropName, yearMonth)] = total AED
    revenue_by_key: dict[tuple, float] = defaultdict(float)
    # yearMonth = "YYYY-MM"

    for line in db.sales_order_lines.find(
        {"excel_data.totalActualValue": {"$ne": None}},
        {"farmId": 1, "cropName": 1, "excel_data": 1, "orderId": 1, "_id": 0},
    ):
        farm_id = str(line.get("farmId") or "unknown")
        crop_name = str(line.get("cropName") or "unknown")
        value = line.get("excel_data", {}).get("totalActualValue") or 0.0
        # Get yearMonth from order date
        order_id = str(line.get("orderId") or "")
        # We'll patch year_month below via join
        revenue_by_key[(farm_id, crop_name, order_id)] += float(value)

    # Now join order dates
    logger.info("Joining order dates for yearMonth...")
    order_date_map: dict[str, str] = {}
    for order in db.sales_orders.find(
        {},
        {"orderId": 1, "orderDate": 1, "packedDate": 1, "_id": 0},
    ):
        oid = str(order.get("orderId", ""))
        date_val = order.get("packedDate") or order.get("orderDate")
        if isinstance(date_val, datetime):
            order_date_map[oid] = date_val.strftime("%Y-%m")
        elif isinstance(date_val, str):
            order_date_map[oid] = date_val[:7]

    # Re-key by (farmId, cropName, yearMonth)
    revenue_keyed: dict[tuple, float] = defaultdict(float)
    for (farm_id, crop_name, order_id), value in revenue_by_key.items():
        year_month = order_date_map.get(order_id, "unknown")
        revenue_keyed[(farm_id, crop_name, year_month)] += value

    logger.info(f"Revenue buckets: {len(revenue_keyed)}")

    # Total revenue per (farm, yearMonth) for overhead distribution
    farm_month_revenue: dict[tuple, float] = defaultdict(float)
    for (farm_id, crop_name, ym), val in revenue_keyed.items():
        farm_month_revenue[(farm_id, ym)] += val

    # Total revenue per (crop, yearMonth) for crop-cost distribution
    crop_month_revenue: dict[tuple, float] = defaultdict(float)
    for (farm_id, crop_name, ym), val in revenue_keyed.items():
        crop_month_revenue[(crop_name, ym)] += val

    logger.info("Step 2: Aggregating costs from purchase_register...")

    # crop_costs[(cropName, yearMonth)] = AED
    crop_costs: dict[tuple, float] = defaultdict(float)
    # overhead_costs[yearMonth] = AED
    overhead_costs: dict[str, float] = defaultdict(float)

    for voucher in db.purchase_register.find(
        {},
        {"date": 1, "items": 1, "_id": 0},
    ):
        date_val = voucher.get("date")
        if isinstance(date_val, datetime):
            ym = date_val.strftime("%Y-%m")
        else:
            ym = str(date_val)[:7] if date_val else "unknown"

        for item in voucher.get("items", []):
            amount = float(item.get("amount") or 0.0)
            mapped_crop = item.get("mappedCropName")
            if mapped_crop:
                crop_costs[(mapped_crop, ym)] += amount
            else:
                overhead_costs[ym] += amount

    logger.info(
        f"Cost buckets: {len(crop_costs)} crop-specific, "
        f"{len(overhead_costs)} overhead yearMonths"
    )

    # Step 3: Build financial_summary docs
    logger.info("Step 3: Building financial_summary documents...")

    # Start with revenue as the base set
    summary: dict[tuple, dict] = {}
    for (farm_id, crop_name, ym), revenue in revenue_keyed.items():
        key = (farm_id, crop_name, ym)
        summary[key] = {
            "farmId": farm_id,
            "cropName": crop_name,
            "yearMonth": ym,
            "revenueAED": round(revenue, 2),
            "costAllocatedAED": 0.0,
            "grossMarginAED": 0.0,
        }

    # Distribute crop-specific costs
    for (crop_name, ym), total_cost in crop_costs.items():
        total_crop_rev = crop_month_revenue.get((crop_name, ym), 0.0)
        if total_crop_rev <= 0:
            # No revenue for this crop/month — treat as overhead
            overhead_costs[ym] += total_cost
            continue
        # Distribute proportionally across farms with this crop in this month
        for (farm_id, cname, cym), rev in revenue_keyed.items():
            if cname == crop_name and cym == ym:
                share = rev / total_crop_rev
                key = (farm_id, crop_name, ym)
                if key in summary:
                    summary[key]["costAllocatedAED"] += round(total_cost * share, 2)
                else:
                    summary[key] = {
                        "farmId": farm_id,
                        "cropName": crop_name,
                        "yearMonth": ym,
                        "revenueAED": 0.0,
                        "costAllocatedAED": round(total_cost * share, 2),
                        "grossMarginAED": 0.0,
                    }

    # Distribute overhead costs
    for ym, total_overhead in overhead_costs.items():
        total_farm_rev_month = sum(
            v for (fid, cym), v in farm_month_revenue.items() if cym == ym
        )
        if total_farm_rev_month <= 0:
            continue
        for (farm_id, cname, cym), rev in revenue_keyed.items():
            if cym != ym:
                continue
            farm_ym_rev = farm_month_revenue.get((farm_id, ym), 0.0)
            if farm_ym_rev <= 0:
                continue
            farm_share = farm_ym_rev / total_farm_rev_month
            # Distribute overhead equally across crops within that farm-month
            farm_crops_in_month = [
                (fi, cn, cy) for (fi, cn, cy) in summary
                if fi == farm_id and cy == ym
            ]
            if not farm_crops_in_month:
                continue
            per_crop_overhead = (total_overhead * farm_share) / len(farm_crops_in_month)
            for key in farm_crops_in_month:
                summary[key]["costAllocatedAED"] = round(
                    summary[key].get("costAllocatedAED", 0.0) + per_crop_overhead, 2
                )
            break  # only once per farm in this ym loop

    # Compute gross margins
    for key, doc in summary.items():
        doc["grossMarginAED"] = round(
            doc["revenueAED"] - doc["costAllocatedAED"], 2
        )

    # Step 4: Upsert
    now = utcnow()
    count = 0
    if not dry_run:
        db.financial_summary.create_index(
            [("farmId", 1), ("cropName", 1), ("yearMonth", 1)],
            unique=False,
            background=True,
        )
        # Full rebuild — delete existing migration-tagged docs
        db.financial_summary.delete_many({"metadata.migratedFrom": MIGRATION_TAG})

    for (farm_id, crop_name, ym), data in summary.items():
        summary_uuid = deterministic_uuid("financial_summary", f"{farm_id}|{crop_name}|{ym}")
        doc = {
            "summaryId": summary_uuid,
            "farmId": farm_id,
            "cropName": crop_name,
            "yearMonth": ym,
            "revenueAED": data["revenueAED"],
            "costAllocatedAED": data["costAllocatedAED"],
            "grossMarginAED": data["grossMarginAED"],
            "divisionId": DIVISION_ID,
            "organizationId": ORGANIZATION_ID,
            "generatedAt": now,
            "metadata": {
                "migratedFrom": MIGRATION_TAG,
                "legacyRef": summary_uuid,
                "generatedBy": "stage7_finalize",
            },
        }
        if not dry_run:
            try:
                db.financial_summary.replace_one(
                    {"summaryId": summary_uuid},
                    doc,
                    upsert=True,
                )
                count += 1
            except Exception as exc:
                logger.error(f"financial_summary upsert failed: {exc}")
        else:
            logger.debug(
                f"  [DRY-RUN] {ym} {farm_id[:8]} {crop_name}: "
                f"rev={data['revenueAED']} cost={data['costAllocatedAED']} margin={data['grossMarginAED']}"
            )
            count += 1

    return count


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def run(dry_run: bool, reset: bool) -> None:
    """
    Main entry point for stage 7.

    Args:
        dry_run: if True, read and compute but do not write
        reset: if True, delete all migration-tagged financial_summary docs
    """
    logger = make_logger(STAGE)
    db = get_db()

    if reset:
        logger.info("[RESET] Deleting migration-tagged financial_summary docs...")
        db.financial_summary.delete_many({"metadata.migratedFrom": MIGRATION_TAG})

    # -------------------------------------------------------------------
    # Step 1: Farm assignments
    # -------------------------------------------------------------------
    logger.info(f"Looking up admin user: {ADMIN_EMAIL}")
    admin_user = db.users.find_one({"email": ADMIN_EMAIL})
    if not admin_user:
        logger.error(f"Admin user not found: {ADMIN_EMAIL}. Cannot create farm_assignments.")
        sys.exit(1)

    logger.info(
        f"Found admin: {admin_user.get('email')} "
        f"(userId={admin_user.get('userId', admin_user.get('_id','?'))})"
    )

    assignments_count = upsert_farm_assignments(db, admin_user, dry_run, logger)
    logger.info(f"Farm assignments upserted: {assignments_count}")

    # -------------------------------------------------------------------
    # Step 2: Financial summary
    # -------------------------------------------------------------------
    logger.info("Building financial summary...")
    summary_count = build_financial_summary(db, dry_run, logger)
    logger.info(f"Financial summary documents: {summary_count}")

    print_summary(
        stage=STAGE,
        rows_read=0,
        rows_inserted=assignments_count + summary_count,
        rows_updated=0,
        rows_skipped=0,
        rows_errored=0,
        error_samples=[],
        logger=logger,
    )
    logger.info(
        f"  Farm assignments: {assignments_count}\n"
        f"  Financial summary docs: {summary_count}"
    )


if __name__ == "__main__":
    parser = make_arg_parser(
        "Stage 7: Create farm_assignments for admin + build financial_summary"
    )
    args = parser.parse_args()
    run(dry_run=args.dry_run, reset=args.reset)
