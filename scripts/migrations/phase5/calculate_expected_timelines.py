"""
Migration Script: Calculate Expected Status Timelines for Virtual Blocks

This script:
1. Uses crop growth cycle data from legacy standard_planning
2. Calculates expectedStatusChanges based on plantedDate + crop stages
3. Updates expectedHarvestDate based on actual crop timeline

Timeline stages:
- growing: starts at plantedDate
- fruiting: plantedDate + sowing_days (when fruiting begins)
- harvesting: plantedDate + sowing_days (when harvest can start)
- cleaning: plantedDate + sowing_days + harvest_days
- cycle_end: plantedDate + total_days

Author: Migration Script
Date: 2026-01-27
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timedelta
from typing import Dict, Optional
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Database connection
MONGODB_URI = "mongodb://localhost:27017"
DATABASE_NAME = "a64core_db"

# Crop timeline data from legacy standard_planning
# Format: crop_name -> {sowing_days, harvest_days, cleaning_days, total_days}
CROP_TIMELINES = {
    "Ash Gourd": {"sowing_days": 70, "harvest_days": 30, "cleaning_days": 0, "total_days": 170},
    "Butternut": {"sowing_days": 60, "harvest_days": 10, "cleaning_days": 5, "total_days": 70},
    "Cabbage - Round Red": {"sowing_days": 60, "harvest_days": 20, "cleaning_days": 0, "total_days": 70},
    "Cabbage - Round White": {"sowing_days": 60, "harvest_days": 20, "cleaning_days": 0, "total_days": 70},
    "Capsicum - Green": {"sowing_days": 60, "harvest_days": 180, "cleaning_days": 20, "total_days": 210},
    "Capsicum - Red": {"sowing_days": 70, "harvest_days": 180, "cleaning_days": 20, "total_days": 210},
    "Capsicum - Yellow": {"sowing_days": 70, "harvest_days": 180, "cleaning_days": 20, "total_days": 210},
    "Cauliflower": {"sowing_days": 90, "harvest_days": 20, "cleaning_days": 5, "total_days": 110},
    "Celery": {"sowing_days": 90, "harvest_days": 30, "cleaning_days": 0, "total_days": 105},
    "Cucumber": {"sowing_days": 35, "harvest_days": 55, "cleaning_days": 0, "total_days": 90},
    "Eggplant": {"sowing_days": 60, "harvest_days": 120, "cleaning_days": 0, "total_days": 165},
    "Fennel": {"sowing_days": 70, "harvest_days": 30, "cleaning_days": 0, "total_days": 120},
    "Green Beans": {"sowing_days": 35, "harvest_days": 55, "cleaning_days": 0, "total_days": 90},
    "Habanero - Green": {"sowing_days": 60, "harvest_days": 150, "cleaning_days": 20, "total_days": 210},
    "Habanero - Orange": {"sowing_days": 60, "harvest_days": 150, "cleaning_days": 20, "total_days": 210},
    "Habanero - Red": {"sowing_days": 60, "harvest_days": 150, "cleaning_days": 20, "total_days": 210},
    "Habanero - Yellow": {"sowing_days": 60, "harvest_days": 150, "cleaning_days": 20, "total_days": 210},
    "Honeydew Melon": {"sowing_days": 70, "harvest_days": 15, "cleaning_days": 0, "total_days": 75},
    "Hot Pepper": {"sowing_days": 60, "harvest_days": 180, "cleaning_days": 20, "total_days": 210},
    "Leeks": {"sowing_days": 100, "harvest_days": 30, "cleaning_days": 0, "total_days": 120},
    "Lettuce - Boston": {"sowing_days": 45, "harvest_days": 5, "cleaning_days": 0, "total_days": 50},
    "Lettuce - Frisee": {"sowing_days": 45, "harvest_days": 5, "cleaning_days": 0, "total_days": 50},
    "Lettuce - Iceberg": {"sowing_days": 45, "harvest_days": 5, "cleaning_days": 0, "total_days": 50},
    "Lettuce - Lollo Bionda": {"sowing_days": 45, "harvest_days": 5, "cleaning_days": 0, "total_days": 50},
    "Lettuce - Lollo Rosso": {"sowing_days": 45, "harvest_days": 5, "cleaning_days": 0, "total_days": 50},
    "Lettuce - Oakleaf Red": {"sowing_days": 45, "harvest_days": 5, "cleaning_days": 0, "total_days": 50},
    "Lettuce - Romaine": {"sowing_days": 45, "harvest_days": 5, "cleaning_days": 0, "total_days": 50},
    "Long Beans": {"sowing_days": 60, "harvest_days": 30, "cleaning_days": 0, "total_days": 100},
    "Long White Pumpkin": {"sowing_days": 50, "harvest_days": 50, "cleaning_days": 0, "total_days": 105},
    "Marrow": {"sowing_days": 45, "harvest_days": 45, "cleaning_days": 0, "total_days": 90},
    "Mulukhiyah": {"sowing_days": 30, "harvest_days": 30, "cleaning_days": 0, "total_days": 60},
    "Okra": {"sowing_days": 60, "harvest_days": 90, "cleaning_days": 0, "total_days": 120},
    "Onion - White": {"sowing_days": 100, "harvest_days": 30, "cleaning_days": 10, "total_days": 120},
    "Potato": {"sowing_days": 120, "harvest_days": 20, "cleaning_days": 0, "total_days": 70},
    "Red Long Chili": {"sowing_days": 90, "harvest_days": 150, "cleaning_days": 0, "total_days": 210},
    "Rock Melon": {"sowing_days": 70, "harvest_days": 10, "cleaning_days": 0, "total_days": 80},
    "Snap Beans": {"sowing_days": 35, "harvest_days": 55, "cleaning_days": 0, "total_days": 90},
    "Sweet Corn": {"sowing_days": 70, "harvest_days": 20, "cleaning_days": 0, "total_days": 105},
    "Sweet Melon": {"sowing_days": 80, "harvest_days": 20, "cleaning_days": 0, "total_days": 85},
    "Tomato-Beef": {"sowing_days": 70, "harvest_days": 180, "cleaning_days": 20, "total_days": 240},
    "Tomato-Cherry": {"sowing_days": 70, "harvest_days": 150, "cleaning_days": 20, "total_days": 150},
    "Tomato-OF": {"sowing_days": 70, "harvest_days": 50, "cleaning_days": 5, "total_days": 135},
    "Tomato-Round-Table": {"sowing_days": 70, "harvest_days": 180, "cleaning_days": 20, "total_days": 240},
    "Watermelon": {"sowing_days": 80, "harvest_days": 20, "cleaning_days": 0, "total_days": 75},
    "Zucchini - Green": {"sowing_days": 45, "harvest_days": 30, "cleaning_days": 0, "total_days": 90},
    "Zucchini - Yellow": {"sowing_days": 45, "harvest_days": 30, "cleaning_days": 0, "total_days": 90},
}

# Additional mappings for crop name variations
CROP_NAME_MAPPINGS = {
    "Hydroponics Bionda": "Lettuce - Lollo Bionda",
    "Hydroponics Boston": "Lettuce - Boston",
    "Hydroponics Frisee": "Lettuce - Frisee",
    "Hydroponics Gem": "Lettuce - Romaine",
    "Hydroponics Oak Leafs": "Lettuce - Oakleaf Red",
    "Hydroponics Rosso": "Lettuce - Lollo Rosso",
    "Lettuce - Phase 1 (5cm)": "Lettuce - Iceberg",
    "Lettuce - Radicchio": "Lettuce - Romaine",
}


def get_crop_timeline(crop_name: str) -> Optional[Dict]:
    """Get timeline data for a crop, handling name mappings."""
    if crop_name in CROP_TIMELINES:
        return CROP_TIMELINES[crop_name]

    mapped_name = CROP_NAME_MAPPINGS.get(crop_name)
    if mapped_name and mapped_name in CROP_TIMELINES:
        return CROP_TIMELINES[mapped_name]

    return None


def calculate_expected_status_changes(planted_date: datetime, timeline: Dict) -> Dict:
    """
    Calculate expected dates for each status transition.

    Returns dict with ISO format dates for:
    - growing: when growing phase starts (plantedDate)
    - fruiting: when fruiting begins (plantedDate + sowing_days * 0.7 approximately)
    - harvesting: when harvest can begin (plantedDate + sowing_days)
    - cleaning: when cleaning begins (plantedDate + sowing_days + harvest_days)
    - cycle_end: end of full cycle
    """
    sowing = timeline.get("sowing_days", 45)
    harvest = timeline.get("harvest_days", 10)
    cleaning = timeline.get("cleaning_days", 0)
    total = timeline.get("total_days", sowing + harvest + cleaning)

    # Calculate intermediate fruiting stage (approximately 70% through sowing)
    fruiting_days = int(sowing * 0.7)

    return {
        "planted": planted_date.isoformat(),
        "growing": planted_date.isoformat(),
        "fruiting": (planted_date + timedelta(days=fruiting_days)).isoformat(),
        "harvesting": (planted_date + timedelta(days=sowing)).isoformat(),
        "cleaning": (planted_date + timedelta(days=sowing + harvest)).isoformat(),
        "cycle_end": (planted_date + timedelta(days=total)).isoformat(),
    }


def parse_datetime_field(value) -> Optional[datetime]:
    """Parse a datetime from various formats."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        # Handle format: "2025-12-18 08:00:00+00"
        value = value.replace('+00', '').strip()
        try:
            return datetime.strptime(value, '%Y-%m-%d %H:%M:%S')
        except ValueError:
            try:
                return datetime.fromisoformat(value.replace('Z', '+00:00'))
            except ValueError:
                return None
    return None


async def calculate_expected_timelines(db) -> Dict:
    """
    Calculate and update expectedStatusChanges for virtual blocks.
    Uses timeStart/timeFinish fields (legacy) or plantedDate/expectedHarvestDate.
    Also sets plantedDate and expectedHarvestDate from legacy fields if missing.
    """
    logger.info("Starting: Calculate expected timelines for virtual blocks...")

    # Get virtual blocks with timeStart OR plantedDate
    virtual_blocks = await db.blocks.find({
        "blockCategory": "virtual",
        "targetCropName": {"$ne": None},
        "$or": [
            {"timeStart": {"$ne": None}},
            {"plantedDate": {"$ne": None}}
        ],
        "isActive": True
    }).to_list(length=None)

    logger.info(f"Found {len(virtual_blocks)} virtual blocks with timeline data")

    updated_count = 0
    skipped_count = 0
    no_timeline_data = set()

    for block in virtual_blocks:
        block_id = str(block.get("blockId"))
        crop_name = block.get("targetCropName")

        # IMPORTANT: Prefer timeStart (current cycle from legacy) over plantedDate
        # plantedDate might contain OLD data from previous planting cycles
        # timeStart is the authoritative source for the CURRENT planting cycle
        planted_date = parse_datetime_field(block.get("timeStart")) or parse_datetime_field(block.get("plantedDate"))

        if not planted_date:
            skipped_count += 1
            continue

        # Get crop timeline
        timeline = get_crop_timeline(crop_name)
        if not timeline:
            no_timeline_data.add(crop_name)
            skipped_count += 1
            continue

        # Calculate expected status changes
        expected_changes = calculate_expected_status_changes(planted_date, timeline)

        # Use timeFinish if available, otherwise calculate from timeline
        time_finish = parse_datetime_field(block.get("timeFinish"))
        sowing_days = timeline.get("sowing_days", 45)

        if time_finish:
            expected_harvest = time_finish
        else:
            expected_harvest = planted_date + timedelta(days=sowing_days)

        # Update the block with all timeline fields
        result = await db.blocks.update_one(
            {"blockId": block_id},
            {"$set": {
                "plantedDate": planted_date,
                "expectedHarvestDate": expected_harvest,
                "expectedStatusChanges": expected_changes,
                "updatedAt": datetime.utcnow()
            }}
        )

        if result.modified_count > 0:
            updated_count += 1

    if no_timeline_data:
        logger.warning(f"Crops without timeline data: {no_timeline_data}")

    logger.info(f"Updated expectedStatusChanges for {updated_count} virtual blocks")
    logger.info(f"Skipped {skipped_count} blocks (no date or no timeline data)")

    return {
        "updated": updated_count,
        "skipped": skipped_count,
        "crops_without_timeline": list(no_timeline_data)
    }


async def verify_results(db) -> Dict:
    """Verify the migration results."""
    logger.info("Verifying results...")

    # Count blocks with expected timeline
    with_timeline = await db.blocks.count_documents({
        "blockCategory": "virtual",
        "expectedStatusChanges": {"$ne": None}
    })

    # Sample with timeline
    sample = await db.blocks.find_one({
        "blockCategory": "virtual",
        "expectedStatusChanges": {"$ne": None}
    }, {"blockCode": 1, "targetCropName": 1, "plantedDate": 1, "expectedHarvestDate": 1, "expectedStatusChanges": 1})

    results = {
        "blocks_with_expected_timeline": with_timeline
    }

    logger.info("=" * 60)
    logger.info("EXPECTED TIMELINE CALCULATION RESULTS")
    logger.info("=" * 60)
    logger.info(f"Virtual blocks with expectedStatusChanges: {with_timeline}")

    if sample:
        logger.info(f"\nSample Block:")
        logger.info(f"  Code: {sample.get('blockCode')}")
        logger.info(f"  Crop: {sample.get('targetCropName')}")
        logger.info(f"  Planted: {sample.get('plantedDate')}")
        logger.info(f"  Expected Harvest: {sample.get('expectedHarvestDate')}")
        logger.info(f"  Expected Status Changes:")
        for status, date in sample.get('expectedStatusChanges', {}).items():
            logger.info(f"    {status}: {date}")

    logger.info("=" * 60)

    return results


async def run_migration():
    """Run the complete migration."""
    logger.info("=" * 60)
    logger.info("EXPECTED TIMELINE CALCULATION MIGRATION")
    logger.info("=" * 60)

    # Connect to database
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[DATABASE_NAME]

    try:
        # Calculate expected timelines
        calc_result = await calculate_expected_timelines(db)

        # Verify results
        verification = await verify_results(db)

        logger.info("\n" + "=" * 60)
        logger.info("MIGRATION COMPLETED")
        logger.info("=" * 60)

        return {
            "success": True,
            "calculation_result": calc_result,
            "verification": verification
        }

    except Exception as e:
        logger.error(f"Migration failed: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}

    finally:
        client.close()


if __name__ == "__main__":
    result = asyncio.run(run_migration())
    print("\nFinal Result:", result)
