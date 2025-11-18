"""
Fix F001-002 and F001-004 blocks missing harvesting timeline

These blocks have expectedStatusChanges without "harvesting" key because
their original plant data didn't have floweringDays field or was deleted.
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timedelta

MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "a64core_db"

# Valid lettuce plant with proper growth cycle
LETTUCE_PLANT_ID = "d9afffbc-742f-4c70-ab3f-81cc9bbc1df5"  # Test Lettuce (Fixed Timeline)


async def fix_lettuce_blocks():
    """Fix F001-002 and F001-004 blocks"""

    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    blocks_collection = db.blocks
    plant_collection = db.plant_data

    print("=" * 60)
    print("Fix Lettuce Blocks Missing Harvesting Timeline")
    print("=" * 60)

    # Get the lettuce plant data
    lettuce = await plant_collection.find_one({"plantDataId": LETTUCE_PLANT_ID})

    if not lettuce:
        print(f"[ERROR] Lettuce plant not found: {LETTUCE_PLANT_ID}")
        return

    print(f"\nUsing plant: {lettuce['plantName']}")
    print(f"Growth cycle: {lettuce['growthCycle']}")

    # Fix both blocks
    blocks_to_fix = ["F001-002", "F001-004"]

    for block_code in blocks_to_fix:
        print(f"\n{'='*60}")
        print(f"Fixing block: {block_code}")

        block = await blocks_collection.find_one({"blockCode": block_code})

        if not block:
            print(f"[ERROR] Block not found: {block_code}")
            continue

        print(f"Current state: {block['state']}")
        print(f"Current targetCrop: {block.get('targetCrop')}")
        print(f"Current expectedStatusChanges: {block.get('expectedStatusChanges')}")

        # Use planted date from existing expectedStatusChanges
        if 'expectedStatusChanges' not in block or 'planted' not in block['expectedStatusChanges']:
            print(f"[SKIP] No planting date found")
            continue

        planting_date = block['expectedStatusChanges']['planted']
        print(f"\nPlanting date: {planting_date}")

        # Recalculate expected dates
        cycle = lettuce['growthCycle']
        expected_dates = {}

        expected_dates["planted"] = planting_date

        if cycle.get('germinationDays') is not None:
            expected_dates["growing"] = planting_date + timedelta(days=cycle['germinationDays'])

        if cycle.get('germinationDays') is not None and cycle.get('vegetativeDays') is not None:
            expected_dates["fruiting"] = planting_date + timedelta(
                days=cycle['germinationDays'] + cycle['vegetativeDays']
            )

        # HARVESTING - handle crops with or without flowering
        if (cycle.get('germinationDays') is not None and
            cycle.get('vegetativeDays') is not None):
            # Calculate days until harvesting
            days_until_harvest = cycle['germinationDays'] + cycle['vegetativeDays']

            # Add flowering days if present and > 0
            if cycle.get('floweringDays') and cycle['floweringDays'] > 0:
                days_until_harvest += cycle['floweringDays']

            expected_dates["harvesting"] = planting_date + timedelta(days=days_until_harvest)

        if cycle.get('totalCycleDays') is not None:
            expected_dates["cleaning"] = planting_date + timedelta(days=cycle['totalCycleDays'])

        print(f"\nNew expected dates:")
        for state, date in expected_dates.items():
            print(f"  {state}: {date}")

        # Update block
        result = await blocks_collection.update_one(
            {"blockCode": block_code},
            {
                "$set": {
                    "targetCrop": LETTUCE_PLANT_ID,
                    "targetCropName": lettuce['plantName'],
                    "expectedStatusChanges": expected_dates,
                    "updatedAt": datetime.utcnow()
                }
            }
        )

        if result.modified_count > 0:
            print(f"\n[OK] Block fixed successfully!")
        else:
            print(f"\n[SKIP] No changes made")

    print("\n" + "=" * 60)
    print("Fix complete!")
    print("=" * 60)

    client.close()


if __name__ == "__main__":
    asyncio.run(fix_lettuce_blocks())
