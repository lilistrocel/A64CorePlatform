#!/usr/bin/env python3
"""
Backfill Farming Year on Existing Data

This migration script calculates and sets farmingYear on all existing:
- block_harvests: farmingYear from harvestDate
- blocks: farmingYearPlanted from plantedDate
- block_archives: farmingYearPlanted from plantedDate, farmingYearHarvested from harvestCompletedDate
- shipments: farmingYear from actualDepartureDate or scheduledDate or createdAt
- harvest_inventory: farmingYear from harvestDate
- sales_orders: farmingYear from orderDate

The farming year is determined by the configured start month (default: August).
For example, if start month is August (8):
- January 2025 -> farming year 2024 (started Aug 2024)
- August 2025 -> farming year 2025 (started Aug 2025)
- December 2025 -> farming year 2025 (started Aug 2025)

This script is idempotent - safe to run multiple times.
Records with farmingYear already set will be recalculated based on config.

Usage:
    python backfill_farming_year.py [--dry-run] [--start-month=N]

Options:
    --dry-run        Show what would be updated without making changes
    --start-month=N  Override farming year start month (1-12, default: from config or 8)
"""

import asyncio
import argparse
import os
import sys
from datetime import datetime
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient


# Default farming year start month (August)
DEFAULT_START_MONTH = 8


def get_farming_year_for_date(date: datetime, start_month: int = DEFAULT_START_MONTH) -> int:
    """
    Calculate farming year for a given date.

    Args:
        date: The date to calculate farming year for
        start_month: Month when the farming year starts (1-12)

    Returns:
        The farming year integer (e.g., 2024, 2025)
    """
    if date.month >= start_month:
        return date.year
    else:
        return date.year - 1


async def get_farming_year_config(db) -> int:
    """
    Get farming year start month from system config.

    Args:
        db: MongoDB database instance

    Returns:
        Configured start month, or DEFAULT_START_MONTH if not set
    """
    try:
        config_doc = await db.system_config.find_one({
            "configType": "farming_year_config"
        })

        if config_doc and "farmingYearStartMonth" in config_doc:
            return config_doc["farmingYearStartMonth"]
    except Exception as e:
        print(f"[WARN] Could not read farming year config: {e}")

    return DEFAULT_START_MONTH


async def backfill_block_harvests(db, start_month: int, dry_run: bool = False) -> dict:
    """
    Backfill farmingYear on block_harvests collection.

    Args:
        db: MongoDB database instance
        start_month: Farming year start month
        dry_run: If True, don't make changes

    Returns:
        Dict with update statistics
    """
    from pymongo import UpdateOne

    collection = db.block_harvests

    # Find all harvests with harvestDate
    query = {"harvestDate": {"$exists": True, "$ne": None}}
    total = await collection.count_documents(query)

    if total == 0:
        return {"total": 0, "updated": 0, "errors": 0}

    print(f"\n[block_harvests] Processing {total} records...")

    updated = 0
    errors = 0

    # Process in batches for efficiency
    batch_size = 500
    cursor = collection.find(query)

    bulk_updates = []

    async for doc in cursor:
        try:
            harvest_date = doc.get("harvestDate")
            if not harvest_date:
                continue

            # Ensure we have a datetime object
            if isinstance(harvest_date, str):
                harvest_date = datetime.fromisoformat(harvest_date.replace("Z", "+00:00"))

            farming_year = get_farming_year_for_date(harvest_date, start_month)

            # Check if already has correct value
            if doc.get("farmingYear") == farming_year:
                continue

            bulk_updates.append(UpdateOne(
                {"_id": doc["_id"]},
                {"$set": {"farmingYear": farming_year}}
            ))

            # Execute bulk write when batch is full
            if len(bulk_updates) >= batch_size:
                if not dry_run:
                    result = await collection.bulk_write(bulk_updates, ordered=False)
                    updated += result.modified_count
                else:
                    updated += len(bulk_updates)
                bulk_updates = []

                # Progress update
                print(f"    Processed {updated} records...")

        except Exception as e:
            errors += 1
            if errors <= 5:  # Only show first 5 errors
                print(f"    [ERROR] Record {doc.get('_id')}: {e}")

    # Process remaining batch
    if bulk_updates:
        if not dry_run:
            result = await collection.bulk_write(bulk_updates, ordered=False)
            updated += result.modified_count
        else:
            updated += len(bulk_updates)

    return {"total": total, "updated": updated, "errors": errors}


async def backfill_blocks(db, start_month: int, dry_run: bool = False) -> dict:
    """
    Backfill farmingYearPlanted on blocks collection.

    Args:
        db: MongoDB database instance
        start_month: Farming year start month
        dry_run: If True, don't make changes

    Returns:
        Dict with update statistics
    """
    collection = db.blocks

    # Find blocks with plantedDate (active or not)
    query = {"plantedDate": {"$exists": True, "$ne": None}}
    total = await collection.count_documents(query)

    if total == 0:
        return {"total": 0, "updated": 0, "errors": 0}

    print(f"\n[blocks] Processing {total} records with plantedDate...")

    updated = 0
    errors = 0

    from pymongo import UpdateOne
    bulk_updates = []
    batch_size = 500
    cursor = collection.find(query)

    async for doc in cursor:
        try:
            planted_date = doc.get("plantedDate")
            if not planted_date:
                continue

            # Ensure we have a datetime object
            if isinstance(planted_date, str):
                planted_date = datetime.fromisoformat(planted_date.replace("Z", "+00:00"))

            farming_year = get_farming_year_for_date(planted_date, start_month)

            # Check if already has correct value
            if doc.get("farmingYearPlanted") == farming_year:
                continue

            bulk_updates.append(UpdateOne(
                {"_id": doc["_id"]},
                {"$set": {"farmingYearPlanted": farming_year}}
            ))

            # Execute bulk write when batch is full
            if len(bulk_updates) >= batch_size:
                if not dry_run:
                    result = await collection.bulk_write(bulk_updates, ordered=False)
                    updated += result.modified_count
                else:
                    updated += len(bulk_updates)
                bulk_updates = []

                # Progress update
                print(f"    Processed {updated} records...")

        except Exception as e:
            errors += 1
            if errors <= 5:  # Only show first 5 errors
                print(f"    [ERROR] Record {doc.get('_id')}: {e}")

    # Process remaining batch
    if bulk_updates:
        if not dry_run:
            result = await collection.bulk_write(bulk_updates, ordered=False)
            updated += result.modified_count
        else:
            updated += len(bulk_updates)

    return {"total": total, "updated": updated, "errors": errors}


async def backfill_block_archives(db, start_month: int, dry_run: bool = False) -> dict:
    """
    Backfill farmingYearPlanted and farmingYearHarvested on block_archives collection.

    Args:
        db: MongoDB database instance
        start_month: Farming year start month
        dry_run: If True, don't make changes

    Returns:
        Dict with update statistics
    """
    collection = db.block_archives

    # Find all archives
    total = await collection.count_documents({})

    if total == 0:
        return {"total": 0, "updated": 0, "errors": 0}

    print(f"\n[block_archives] Processing {total} records...")

    updated = 0
    errors = 0

    from pymongo import UpdateOne
    bulk_updates = []
    batch_size = 500
    cursor = collection.find({})

    async for doc in cursor:
        try:
            update_fields = {}

            # Calculate farmingYearPlanted from plantedDate or timeStart (legacy field)
            planted_date = doc.get("plantedDate") or doc.get("timeStart")
            if planted_date:
                if isinstance(planted_date, str):
                    planted_date = datetime.fromisoformat(planted_date.replace("Z", "+00:00"))

                farming_year_planted = get_farming_year_for_date(planted_date, start_month)

                if doc.get("farmingYearPlanted") != farming_year_planted:
                    update_fields["farmingYearPlanted"] = farming_year_planted

            # Calculate farmingYearHarvested from harvestCompletedDate or timeFinish (legacy field)
            harvest_date = doc.get("harvestCompletedDate") or doc.get("timeFinish")
            if harvest_date:
                if isinstance(harvest_date, str):
                    harvest_date = datetime.fromisoformat(harvest_date.replace("Z", "+00:00"))

                farming_year_harvested = get_farming_year_for_date(harvest_date, start_month)

                if doc.get("farmingYearHarvested") != farming_year_harvested:
                    update_fields["farmingYearHarvested"] = farming_year_harvested

            # Skip if nothing to update
            if not update_fields:
                continue

            bulk_updates.append(UpdateOne(
                {"_id": doc["_id"]},
                {"$set": update_fields}
            ))

            # Execute bulk write when batch is full
            if len(bulk_updates) >= batch_size:
                if not dry_run:
                    result = await collection.bulk_write(bulk_updates, ordered=False)
                    updated += result.modified_count
                else:
                    updated += len(bulk_updates)
                bulk_updates = []

                # Progress update
                print(f"    Processed {updated} records...")

        except Exception as e:
            errors += 1
            if errors <= 5:  # Only show first 5 errors
                print(f"    [ERROR] Record {doc.get('_id')}: {e}")

    # Process remaining batch
    if bulk_updates:
        if not dry_run:
            result = await collection.bulk_write(bulk_updates, ordered=False)
            updated += result.modified_count
        else:
            updated += len(bulk_updates)

    return {"total": total, "updated": updated, "errors": errors}


async def backfill_shipments(db, start_month: int, dry_run: bool = False) -> dict:
    """
    Backfill farmingYear on shipments collection.

    Args:
        db: MongoDB database instance
        start_month: Farming year start month
        dry_run: If True, don't make changes

    Returns:
        Dict with update statistics
    """
    collection = db.shipments

    # Find all shipments
    total = await collection.count_documents({})

    if total == 0:
        return {"total": 0, "updated": 0, "errors": 0}

    print(f"\n[shipments] Processing {total} records...")

    updated = 0
    errors = 0

    from pymongo import UpdateOne
    bulk_updates = []
    batch_size = 500
    cursor = collection.find({})

    async for doc in cursor:
        try:
            # Get date for farming year calculation
            # Priority: actualDepartureDate > scheduledDate > createdAt
            date_for_fy = (
                doc.get("actualDepartureDate") or
                doc.get("scheduledDate") or
                doc.get("createdAt")
            )

            if not date_for_fy:
                continue

            # Ensure we have a datetime object
            if isinstance(date_for_fy, str):
                date_for_fy = datetime.fromisoformat(date_for_fy.replace("Z", "+00:00"))

            farming_year = get_farming_year_for_date(date_for_fy, start_month)

            # Check if already has correct value
            if doc.get("farmingYear") == farming_year:
                continue

            bulk_updates.append(UpdateOne(
                {"_id": doc["_id"]},
                {"$set": {"farmingYear": farming_year}}
            ))

            # Execute bulk write when batch is full
            if len(bulk_updates) >= batch_size:
                if not dry_run:
                    result = await collection.bulk_write(bulk_updates, ordered=False)
                    updated += result.modified_count
                else:
                    updated += len(bulk_updates)
                bulk_updates = []

                # Progress update
                print(f"    Processed {updated} records...")

        except Exception as e:
            errors += 1
            if errors <= 5:  # Only show first 5 errors
                print(f"    [ERROR] Record {doc.get('_id')}: {e}")

    # Process remaining batch
    if bulk_updates:
        if not dry_run:
            result = await collection.bulk_write(bulk_updates, ordered=False)
            updated += result.modified_count
        else:
            updated += len(bulk_updates)

    return {"total": total, "updated": updated, "errors": errors}


async def backfill_harvest_inventory(db, start_month: int, dry_run: bool = False) -> dict:
    """
    Backfill farmingYear on harvest_inventory collection.

    Args:
        db: MongoDB database instance
        start_month: Farming year start month
        dry_run: If True, don't make changes

    Returns:
        Dict with update statistics
    """
    from pymongo import UpdateOne

    collection = db.harvest_inventory

    # Find all inventory items with harvestDate
    query = {"harvestDate": {"$exists": True, "$ne": None}}
    total = await collection.count_documents(query)

    if total == 0:
        return {"total": 0, "updated": 0, "errors": 0}

    print(f"\n[harvest_inventory] Processing {total} records...")

    updated = 0
    errors = 0

    # Process in batches for efficiency
    batch_size = 500
    cursor = collection.find(query)

    bulk_updates = []

    async for doc in cursor:
        try:
            harvest_date = doc.get("harvestDate")
            if not harvest_date:
                continue

            # Ensure we have a datetime object
            if isinstance(harvest_date, str):
                # Handle ISO format date strings (YYYY-MM-DD)
                if "T" not in harvest_date:
                    harvest_date = datetime.fromisoformat(harvest_date + "T00:00:00")
                else:
                    harvest_date = datetime.fromisoformat(harvest_date.replace("Z", "+00:00"))
            elif not isinstance(harvest_date, datetime):
                # Handle date objects (convert to datetime)
                harvest_date = datetime.combine(harvest_date, datetime.min.time())

            farming_year = get_farming_year_for_date(harvest_date, start_month)

            # Check if already has correct value
            if doc.get("farmingYear") == farming_year:
                continue

            bulk_updates.append(UpdateOne(
                {"_id": doc["_id"]},
                {"$set": {"farmingYear": farming_year}}
            ))

            # Execute bulk write when batch is full
            if len(bulk_updates) >= batch_size:
                if not dry_run:
                    result = await collection.bulk_write(bulk_updates, ordered=False)
                    updated += result.modified_count
                else:
                    updated += len(bulk_updates)
                bulk_updates = []

                # Progress update
                print(f"    Processed {updated} records...")

        except Exception as e:
            errors += 1
            if errors <= 5:  # Only show first 5 errors
                print(f"    [ERROR] Record {doc.get('_id')}: {e}")

    # Process remaining batch
    if bulk_updates:
        if not dry_run:
            result = await collection.bulk_write(bulk_updates, ordered=False)
            updated += result.modified_count
        else:
            updated += len(bulk_updates)

    return {"total": total, "updated": updated, "errors": errors}


async def backfill_sales_orders(db, start_month: int, dry_run: bool = False) -> dict:
    """
    Backfill farmingYear on sales_orders collection.

    Args:
        db: MongoDB database instance
        start_month: Farming year start month
        dry_run: If True, don't make changes

    Returns:
        Dict with update statistics
    """
    from pymongo import UpdateOne

    collection = db.sales_orders

    # Find all orders with orderDate
    query = {"orderDate": {"$exists": True, "$ne": None}}
    total = await collection.count_documents(query)

    if total == 0:
        return {"total": 0, "updated": 0, "errors": 0}

    print(f"\n[sales_orders] Processing {total} records...")

    updated = 0
    errors = 0

    # Process in batches for efficiency
    batch_size = 500
    cursor = collection.find(query)

    bulk_updates = []

    async for doc in cursor:
        try:
            order_date = doc.get("orderDate")
            if not order_date:
                continue

            # Ensure we have a datetime object
            if isinstance(order_date, str):
                # Handle ISO format date strings (YYYY-MM-DD)
                if "T" not in order_date:
                    order_date = datetime.fromisoformat(order_date + "T00:00:00")
                else:
                    order_date = datetime.fromisoformat(order_date.replace("Z", "+00:00"))
            elif not isinstance(order_date, datetime):
                # Handle date objects (convert to datetime)
                order_date = datetime.combine(order_date, datetime.min.time())

            farming_year = get_farming_year_for_date(order_date, start_month)

            # Check if already has correct value
            if doc.get("farmingYear") == farming_year:
                continue

            bulk_updates.append(UpdateOne(
                {"_id": doc["_id"]},
                {"$set": {"farmingYear": farming_year}}
            ))

            # Execute bulk write when batch is full
            if len(bulk_updates) >= batch_size:
                if not dry_run:
                    result = await collection.bulk_write(bulk_updates, ordered=False)
                    updated += result.modified_count
                else:
                    updated += len(bulk_updates)
                bulk_updates = []

                # Progress update
                print(f"    Processed {updated} records...")

        except Exception as e:
            errors += 1
            if errors <= 5:  # Only show first 5 errors
                print(f"    [ERROR] Record {doc.get('_id')}: {e}")

    # Process remaining batch
    if bulk_updates:
        if not dry_run:
            result = await collection.bulk_write(bulk_updates, ordered=False)
            updated += result.modified_count
        else:
            updated += len(bulk_updates)

    return {"total": total, "updated": updated, "errors": errors}


async def verify_migration(db, start_month: int):
    """
    Verify the migration was successful.

    Args:
        db: MongoDB database instance
        start_month: Farming year start month
    """
    print("\n" + "=" * 60)
    print("Verification")
    print("=" * 60)

    # Check block_harvests
    harvests_total = await db.block_harvests.count_documents({})
    harvests_with_fy = await db.block_harvests.count_documents({"farmingYear": {"$exists": True, "$ne": None}})
    print(f"\n[block_harvests]")
    print(f"  Total records: {harvests_total}")
    print(f"  With farmingYear: {harvests_with_fy}")

    # Sample some records
    sample = await db.block_harvests.find(
        {"farmingYear": {"$exists": True}},
        {"harvestDate": 1, "farmingYear": 1, "blockId": 1}
    ).limit(3).to_list(length=3)

    if sample:
        print(f"  Sample records:")
        for rec in sample:
            hd = rec.get("harvestDate")
            if hd:
                hd_str = hd.strftime("%Y-%m-%d") if isinstance(hd, datetime) else str(hd)[:10]
            else:
                hd_str = "N/A"
            print(f"    - harvestDate: {hd_str}, farmingYear: {rec.get('farmingYear')}")

    # Check blocks
    blocks_with_planted = await db.blocks.count_documents({"plantedDate": {"$exists": True, "$ne": None}})
    blocks_with_fy = await db.blocks.count_documents({"farmingYearPlanted": {"$exists": True, "$ne": None}})
    print(f"\n[blocks]")
    print(f"  With plantedDate: {blocks_with_planted}")
    print(f"  With farmingYearPlanted: {blocks_with_fy}")

    # Sample some records
    sample = await db.blocks.find(
        {"farmingYearPlanted": {"$exists": True}},
        {"plantedDate": 1, "farmingYearPlanted": 1, "blockCode": 1}
    ).limit(3).to_list(length=3)

    if sample:
        print(f"  Sample records:")
        for rec in sample:
            pd = rec.get("plantedDate")
            if pd:
                pd_str = pd.strftime("%Y-%m-%d") if isinstance(pd, datetime) else str(pd)[:10]
            else:
                pd_str = "N/A"
            print(f"    - {rec.get('blockCode')}: plantedDate: {pd_str}, farmingYearPlanted: {rec.get('farmingYearPlanted')}")

    # Check block_archives
    archives_total = await db.block_archives.count_documents({})
    archives_with_planted_fy = await db.block_archives.count_documents({"farmingYearPlanted": {"$exists": True, "$ne": None}})
    archives_with_harvested_fy = await db.block_archives.count_documents({"farmingYearHarvested": {"$exists": True, "$ne": None}})
    print(f"\n[block_archives]")
    print(f"  Total records: {archives_total}")
    print(f"  With farmingYearPlanted: {archives_with_planted_fy}")
    print(f"  With farmingYearHarvested: {archives_with_harvested_fy}")

    # Sample some records - include legacy fields timeStart/timeFinish
    sample = await db.block_archives.find(
        {},
        {"plantedDate": 1, "harvestCompletedDate": 1, "timeStart": 1, "timeFinish": 1, "farmingYearPlanted": 1, "farmingYearHarvested": 1, "blockCode": 1}
    ).limit(3).to_list(length=3)

    if sample:
        print(f"  Sample records:")
        for rec in sample:
            # Use plantedDate or timeStart (legacy field)
            pd = rec.get("plantedDate") or rec.get("timeStart")
            hd = rec.get("harvestCompletedDate") or rec.get("timeFinish")
            pd_str = pd.strftime("%Y-%m-%d") if isinstance(pd, datetime) else (str(pd)[:10] if pd else "N/A")
            hd_str = hd.strftime("%Y-%m-%d") if isinstance(hd, datetime) else (str(hd)[:10] if hd else "N/A")
            print(f"    - {rec.get('blockCode')}: planted: {pd_str} (FY{rec.get('farmingYearPlanted')}), harvested: {hd_str} (FY{rec.get('farmingYearHarvested')})")

    # Check shipments
    shipments_total = await db.shipments.count_documents({})
    shipments_with_fy = await db.shipments.count_documents({"farmingYear": {"$exists": True, "$ne": None}})
    print(f"\n[shipments]")
    print(f"  Total records: {shipments_total}")
    print(f"  With farmingYear: {shipments_with_fy}")

    # Sample some shipments
    sample = await db.shipments.find(
        {"farmingYear": {"$exists": True}},
        {"shipmentCode": 1, "actualDepartureDate": 1, "scheduledDate": 1, "createdAt": 1, "farmingYear": 1}
    ).limit(3).to_list(length=3)

    if sample:
        print(f"  Sample records:")
        for rec in sample:
            date_used = rec.get("actualDepartureDate") or rec.get("scheduledDate") or rec.get("createdAt")
            date_str = date_used.strftime("%Y-%m-%d") if isinstance(date_used, datetime) else (str(date_used)[:10] if date_used else "N/A")
            print(f"    - {rec.get('shipmentCode')}: date: {date_str}, farmingYear: {rec.get('farmingYear')}")

    # Check harvest_inventory
    inventory_total = await db.harvest_inventory.count_documents({})
    inventory_with_fy = await db.harvest_inventory.count_documents({"farmingYear": {"$exists": True, "$ne": None}})
    print(f"\n[harvest_inventory]")
    print(f"  Total records: {inventory_total}")
    print(f"  With farmingYear: {inventory_with_fy}")

    # Sample some harvest_inventory records
    sample = await db.harvest_inventory.find(
        {"farmingYear": {"$exists": True}},
        {"productName": 1, "harvestDate": 1, "farmingYear": 1}
    ).limit(3).to_list(length=3)

    if sample:
        print(f"  Sample records:")
        for rec in sample:
            hd = rec.get("harvestDate")
            if hd:
                hd_str = hd.strftime("%Y-%m-%d") if isinstance(hd, datetime) else str(hd)[:10]
            else:
                hd_str = "N/A"
            print(f"    - {rec.get('productName')}: harvestDate: {hd_str}, farmingYear: {rec.get('farmingYear')}")


async def run_migration(dry_run: bool = False, override_start_month: Optional[int] = None):
    """
    Run the farming year backfill migration.

    Args:
        dry_run: If True, show what would be updated without making changes
        override_start_month: Override farming year start month (1-12)
    """
    # MongoDB connection - try multiple env var names for compatibility
    mongo_uri = os.getenv("MONGODB_URL") or os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    database_name = os.getenv("MONGODB_DB_NAME") or os.getenv("DATABASE_NAME", "a64core_db")

    print("=" * 60)
    print("Backfill Farming Year Migration")
    print("=" * 60)

    if dry_run:
        print("\n[DRY RUN MODE] No changes will be made\n")

    print(f"MongoDB URI: {mongo_uri}")
    print(f"Database: {database_name}")

    client = AsyncIOMotorClient(mongo_uri)
    db = client[database_name]

    # Get farming year start month
    if override_start_month:
        start_month = override_start_month
        print(f"Start month: {start_month} (override)")
    else:
        start_month = await get_farming_year_config(db)
        print(f"Start month: {start_month} (from config)")

    print(f"\nFarming year calculation:")
    print(f"  - Months {start_month}-12 -> current calendar year")
    print(f"  - Months 1-{start_month-1} -> previous calendar year")

    # Run backfill for each collection
    results = {}

    try:
        # 1. Backfill block_harvests
        results["block_harvests"] = await backfill_block_harvests(db, start_month, dry_run)

        # 2. Backfill blocks
        results["blocks"] = await backfill_blocks(db, start_month, dry_run)

        # 3. Backfill block_archives
        results["block_archives"] = await backfill_block_archives(db, start_month, dry_run)

        # 4. Backfill shipments
        results["shipments"] = await backfill_shipments(db, start_month, dry_run)

        # 5. Backfill harvest_inventory
        results["harvest_inventory"] = await backfill_harvest_inventory(db, start_month, dry_run)

    except Exception as e:
        print(f"\n[ERROR] Migration failed: {e}")
        client.close()
        return

    # Print summary
    print("\n" + "=" * 60)
    print("Migration Summary")
    print("=" * 60)

    total_updated = 0
    total_errors = 0

    for collection, stats in results.items():
        print(f"\n[{collection}]")
        print(f"  Total records: {stats['total']}")
        print(f"  Updated: {stats['updated']}")
        print(f"  Errors: {stats['errors']}")
        total_updated += stats['updated']
        total_errors += stats['errors']

    print(f"\n{'='*60}")
    print(f"TOTAL: {total_updated} records updated, {total_errors} errors")
    print("=" * 60)

    if dry_run:
        print("\n[DRY RUN] No changes were made. Run without --dry-run to apply changes.")
    else:
        # Verify migration
        await verify_migration(db, start_month)
        print("\n[SUCCESS] Migration completed!")

    client.close()


def main():
    """Main entry point with argument parsing."""
    parser = argparse.ArgumentParser(
        description="Backfill farmingYear on existing data (block_harvests, blocks, block_archives, shipments, harvest_inventory)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be updated without making changes"
    )
    parser.add_argument(
        "--start-month",
        type=int,
        choices=range(1, 13),
        metavar="N",
        help="Override farming year start month (1-12, default: from config or 8)"
    )

    args = parser.parse_args()

    asyncio.run(run_migration(
        dry_run=args.dry_run,
        override_start_month=args.start_month
    ))


if __name__ == "__main__":
    main()
