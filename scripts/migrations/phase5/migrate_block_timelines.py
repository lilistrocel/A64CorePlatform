"""
Migration Script: Migrate Block Timelines from Legacy Data

This script:
1. Parses block_history from legacy SQL for timeline data
2. Matches to virtual blocks via parent legacyBlockCode + cropName
3. Updates plantedDate, expectedHarvestDate, and basic statusChanges

Author: Migration Script
Date: 2026-01-27
"""

import asyncio
import re
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from typing import Dict, List, Optional, Tuple
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Database connection
MONGODB_URI = "mongodb://localhost:27017"
DATABASE_NAME = "a64core_db"

# Path to legacy SQL file
BLOCK_HISTORY_SQL = "/home/noobcity/Code/A64CorePlatform/OldData/220126/block_history_rows.sql"


def parse_legacy_timelines() -> List[Dict]:
    """Parse block_history SQL for timeline data."""
    logger.info("Parsing legacy block_history SQL...")

    with open(BLOCK_HISTORY_SQL, 'r') as f:
        content = f.read()

    # Extract value tuples
    # Structure: (area, drips, plannedseason, time_finish, time_start, ref, block_id, farm_id, crop_id,
    #             time_cleaned, harvest_duration, farm_block_ref, state, ...)
    pattern = r"\('([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)'"

    matches = re.findall(pattern, content)

    timelines = []
    for match in matches:
        area, drips, season, time_finish, time_start, ref, block_id, farm, crop, time_cleaned, harvest_dur, farm_block_ref, state = match

        # Parse the physical block code from block_id
        # Examples: "A-21-1" -> "A-21", "KHZ-26" -> "KHZ-26", "NH-01-214" -> "NH-01"
        parts = block_id.split('-')
        if len(parts) >= 2:
            # Take first two parts as the physical block base
            physical_block_code = f"{parts[0]}-{parts[1]}"
        else:
            physical_block_code = block_id

        timelines.append({
            'block_id': block_id,
            'physical_block_code': physical_block_code,
            'farm': farm,
            'crop': crop,
            'time_start': time_start,
            'time_finish': time_finish,
            'time_cleaned': time_cleaned,
            'harvest_duration': int(harvest_dur) if harvest_dur.isdigit() else 0,
            'state': state
        })

    logger.info(f"Parsed {len(timelines)} block_history records")
    return timelines


def parse_datetime(dt_str: str) -> Optional[datetime]:
    """Parse datetime string from SQL."""
    if not dt_str or dt_str == 'null':
        return None
    try:
        # Handle format: "2024-11-04 08:00:00+00"
        dt_str = dt_str.replace('+00', '')
        return datetime.strptime(dt_str, '%Y-%m-%d %H:%M:%S')
    except ValueError:
        try:
            # Try with microseconds
            return datetime.strptime(dt_str.split('.')[0], '%Y-%m-%d %H:%M:%S')
        except ValueError:
            return None


def build_timeline_lookup(timelines: List[Dict]) -> Dict[Tuple[str, str], Dict]:
    """
    Build a lookup map: (physical_block_code, crop) -> most recent timeline

    For multiple records with same key, keep the most recent (by time_start).
    """
    lookup = {}

    for t in timelines:
        key = (t['physical_block_code'], t['crop'])

        time_start = parse_datetime(t['time_start'])
        if not time_start:
            continue

        existing = lookup.get(key)
        if not existing:
            lookup[key] = t
        else:
            existing_start = parse_datetime(existing['time_start'])
            if existing_start and time_start > existing_start:
                lookup[key] = t

    logger.info(f"Built lookup with {len(lookup)} unique (block, crop) combinations")
    return lookup


async def migrate_timelines(db, timeline_lookup: Dict) -> Dict:
    """
    Migrate timeline data to virtual blocks.

    Matching strategy:
    1. Get virtual block's parent physical block legacyBlockCode
    2. Match with timeline_lookup using (legacyBlockCode, targetCropName)
    3. Update plantedDate, expectedHarvestDate
    """
    logger.info("Starting timeline migration...")

    # Get all virtual blocks with their parent info
    virtual_blocks = await db.blocks.find({
        "blockCategory": "virtual",
        "targetCropName": {"$ne": None},
        "isActive": True
    }).to_list(length=None)

    logger.info(f"Found {len(virtual_blocks)} virtual blocks to process")

    # Build parent lookup
    parent_ids = list(set(str(b.get('parentBlockId')) for b in virtual_blocks if b.get('parentBlockId')))
    parents = await db.blocks.find({
        "blockId": {"$in": parent_ids}
    }).to_list(length=None)

    parent_lookup = {str(p.get('blockId')): p for p in parents}
    logger.info(f"Found {len(parent_lookup)} parent physical blocks")

    updated_count = 0
    not_found_count = 0
    already_set_count = 0
    no_parent_count = 0

    missing_combinations = set()

    for block in virtual_blocks:
        block_id = str(block.get('blockId'))
        crop_name = block.get('targetCropName')
        parent_id = str(block.get('parentBlockId')) if block.get('parentBlockId') else None

        # Skip if already has timeline data
        if block.get('plantedDate') and block.get('expectedHarvestDate'):
            already_set_count += 1
            continue

        # Get parent's legacyBlockCode
        parent = parent_lookup.get(parent_id) if parent_id else None
        if not parent:
            no_parent_count += 1
            continue

        parent_legacy_code = parent.get('legacyBlockCode')
        if not parent_legacy_code:
            no_parent_count += 1
            continue

        # Look up timeline data
        key = (parent_legacy_code, crop_name)
        timeline = timeline_lookup.get(key)

        if not timeline:
            not_found_count += 1
            missing_combinations.add(key)
            continue

        # Parse dates
        planted_date = parse_datetime(timeline['time_start'])
        expected_harvest = parse_datetime(timeline['time_finish'])

        if not planted_date:
            not_found_count += 1
            continue

        # Update the block
        update_data = {
            "updatedAt": datetime.utcnow()
        }

        if planted_date:
            update_data["plantedDate"] = planted_date

        if expected_harvest:
            update_data["expectedHarvestDate"] = expected_harvest

        result = await db.blocks.update_one(
            {"blockId": block_id},
            {"$set": update_data}
        )

        if result.modified_count > 0:
            updated_count += 1

    # Log some missing combinations for reference
    if missing_combinations:
        logger.warning(f"Sample missing (block, crop) combinations:")
        for combo in list(missing_combinations)[:10]:
            logger.warning(f"  {combo}")

    logger.info(f"Updated {updated_count} virtual blocks with timeline data")
    logger.info(f"Already had timeline: {already_set_count}")
    logger.info(f"No matching timeline found: {not_found_count}")
    logger.info(f"No parent block: {no_parent_count}")

    return {
        "updated": updated_count,
        "already_set": already_set_count,
        "not_found": not_found_count,
        "no_parent": no_parent_count
    }


async def verify_results(db) -> Dict:
    """Verify the migration results."""
    logger.info("Verifying results...")

    # Count blocks with timeline data
    with_timeline = await db.blocks.count_documents({
        "blockCategory": "virtual",
        "plantedDate": {"$ne": None}
    })

    without_timeline = await db.blocks.count_documents({
        "blockCategory": "virtual",
        "targetCropName": {"$ne": None},
        "plantedDate": None
    })

    # Sample with timeline
    sample = await db.blocks.find_one({
        "blockCategory": "virtual",
        "plantedDate": {"$ne": None}
    }, {"blockCode": 1, "targetCropName": 1, "plantedDate": 1, "expectedHarvestDate": 1})

    results = {
        "blocks_with_timeline": with_timeline,
        "blocks_without_timeline": without_timeline
    }

    logger.info("=" * 60)
    logger.info("TIMELINE MIGRATION RESULTS")
    logger.info("=" * 60)
    logger.info(f"Virtual blocks with timeline: {with_timeline}")
    logger.info(f"Virtual blocks without timeline: {without_timeline}")

    if sample:
        logger.info(f"\nSample Block with Timeline:")
        logger.info(f"  Code: {sample.get('blockCode')}")
        logger.info(f"  Crop: {sample.get('targetCropName')}")
        logger.info(f"  Planted: {sample.get('plantedDate')}")
        logger.info(f"  Expected Harvest: {sample.get('expectedHarvestDate')}")

    logger.info("=" * 60)

    return results


async def run_migration():
    """Run the complete migration."""
    logger.info("=" * 60)
    logger.info("BLOCK TIMELINE MIGRATION")
    logger.info("=" * 60)

    # Parse legacy data
    timelines = parse_legacy_timelines()
    timeline_lookup = build_timeline_lookup(timelines)

    # Connect to database
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[DATABASE_NAME]

    try:
        # Migrate timelines
        migration_result = await migrate_timelines(db, timeline_lookup)

        # Verify results
        verification = await verify_results(db)

        logger.info("\n" + "=" * 60)
        logger.info("MIGRATION COMPLETED")
        logger.info("=" * 60)

        return {
            "success": True,
            "migration_result": migration_result,
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
