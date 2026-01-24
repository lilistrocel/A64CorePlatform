"""
Populate Expected Status Changes from Plant Data

This script populates expectedStatusChanges for blocks based on:
- plantedDate from the block
- growthCycleDays and notes from plant_data

Run: python -m scripts.populate_expected_dates
"""

import asyncio
import re
from datetime import datetime, timedelta, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os

# MongoDB connection
MONGO_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/a64core_db")


def parse_growth_notes(notes: str) -> dict:
    """Parse growth timing from notes like 'Sowing: 45d, Harvest: 30d'"""
    result = {"sowing_days": None, "harvest_days": None}

    if not notes:
        return result

    # Parse "Sowing: Xd"
    sowing_match = re.search(r'Sowing:\s*(\d+)d', notes)
    if sowing_match:
        result["sowing_days"] = int(sowing_match.group(1))

    # Parse "Harvest: Xd"
    harvest_match = re.search(r'Harvest:\s*(\d+)d', notes)
    if harvest_match:
        result["harvest_days"] = int(harvest_match.group(1))

    return result


async def populate_expected_dates():
    """Populate expectedStatusChanges for blocks with plantedDate."""

    client = AsyncIOMotorClient(MONGO_URI)
    db = client.get_default_database()

    blocks_collection = db.blocks
    plant_data_collection = db.plant_data

    print("=" * 60)
    print("POPULATING EXPECTED STATUS CHANGES FROM PLANT DATA")
    print("=" * 60)

    # Build plant data lookup by name
    plant_data_cursor = plant_data_collection.find({}, {"plantName": 1, "growthCycleDays": 1, "notes": 1})
    plant_data_list = await plant_data_cursor.to_list(length=1000)

    plant_lookup = {}
    for plant in plant_data_list:
        name = plant.get("plantName", "").lower()
        if name:
            plant_lookup[name] = {
                "growthCycleDays": plant.get("growthCycleDays", 60),
                "notes": plant.get("notes", "")
            }

    print(f"Loaded {len(plant_lookup)} plant data entries")

    # Find blocks with plantedDate but no expectedStatusChanges
    blocks_cursor = blocks_collection.find({
        "plantedDate": {"$exists": True, "$ne": None},
        "$or": [
            {"expectedStatusChanges": {"$exists": False}},
            {"expectedStatusChanges": None}
        ]
    })

    blocks = await blocks_cursor.to_list(length=1000)
    print(f"Found {len(blocks)} blocks with plantedDate but no expectedStatusChanges")

    updated_count = 0

    for block in blocks:
        block_code = block.get("blockCode", "Unknown")
        planted_date = block.get("plantedDate")
        crop_name = block.get("targetCropName", "")

        if not planted_date or not crop_name:
            continue

        # Find plant data
        crop_key = crop_name.lower()
        plant_info = plant_lookup.get(crop_key)

        if not plant_info:
            # Try partial match
            for key, info in plant_lookup.items():
                if crop_key in key or key in crop_key:
                    plant_info = info
                    break

        if not plant_info:
            print(f"  [{block_code}] No plant data found for '{crop_name}'")
            continue

        growth_cycle = plant_info["growthCycleDays"]
        timing = parse_growth_notes(plant_info["notes"])

        # Calculate expected dates
        # Growing period (from planted to harvesting)
        growing_days = timing.get("sowing_days") or int(growth_cycle * 0.5)
        harvest_days = timing.get("harvest_days") or int(growth_cycle * 0.3)

        expected_harvest_start = planted_date + timedelta(days=growing_days)
        expected_harvest_end = expected_harvest_start + timedelta(days=harvest_days)

        expected_status_changes = {
            "growing": planted_date,  # Growing starts at planting
            "harvesting": expected_harvest_start,
            "cleaning": expected_harvest_end
        }

        # Update block
        result = await blocks_collection.update_one(
            {"_id": block["_id"]},
            {
                "$set": {
                    "expectedStatusChanges": expected_status_changes,
                    "expectedHarvestDate": expected_harvest_start,
                    "updatedAt": datetime.now(timezone.utc)
                }
            }
        )

        if result.modified_count > 0:
            updated_count += 1
            print(f"  [{block_code}] {crop_name}")
            print(f"    Planted: {planted_date.strftime('%Y-%m-%d')}")
            print(f"    Expected Harvest: {expected_harvest_start.strftime('%Y-%m-%d')} (+{growing_days}d)")
            print(f"    Expected Cleaning: {expected_harvest_end.strftime('%Y-%m-%d')} (+{harvest_days}d)")

    print("\n" + "=" * 60)
    print(f"MIGRATION COMPLETE: {updated_count} blocks updated")
    print("=" * 60)

    client.close()


if __name__ == "__main__":
    asyncio.run(populate_expected_dates())
