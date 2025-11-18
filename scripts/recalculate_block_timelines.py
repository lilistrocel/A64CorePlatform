"""
Recalculate expectedStatusChanges for blocks using their plant data
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timedelta

MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "a64core_db"


async def recalculate_timeline(block_code: str):
    """Recalculate expectedStatusChanges for a specific block"""

    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    blocks_collection = db.blocks
    plant_collection = db.plant_data

    # Get block
    block = await blocks_collection.find_one({"blockCode": block_code})

    if not block:
        print(f"[ERROR] Block {block_code} not found")
        return

    print(f"\n{'='*60}")
    print(f"Recalculating timeline for: {block_code}")
    print(f"Current state: {block['state']}")
    print(f"Target crop: {block.get('targetCrop')}")

    # Get plant data
    plant_data = await plant_collection.find_one({"plantDataId": block.get('targetCrop')})

    if not plant_data:
        print(f"[ERROR] Plant data not found for: {block.get('targetCrop')}")
        return

    if 'growthCycle' not in plant_data:
        print(f"[ERROR] Plant data has no growthCycle object")
        return

    print(f"Plant: {plant_data['plantName']}")
    print(f"Growth cycle: {plant_data['growthCycle']}")

    # Use plantedDate if available, otherwise get from expectedStatusChanges, otherwise skip
    planting_date = block.get('plantedDate')

    if not planting_date and 'expectedStatusChanges' in block:
        # Try to get from existing expectedStatusChanges
        planting_date = block['expectedStatusChanges'].get('planted')

    if not planting_date:
        print(f"[SKIP] No planting date available for {block_code}")
        return

    if isinstance(planting_date, str):
        planting_date = datetime.fromisoformat(planting_date)

    print(f"Planting date: {planting_date}")

    # Calculate expected dates
    cycle = plant_data['growthCycle']
    expected_dates = {}

    # Planted date
    expected_dates["planted"] = planting_date

    # Growing phase (after germination)
    if cycle.get('germinationDays') is not None:
        expected_dates["growing"] = planting_date + timedelta(days=cycle['germinationDays'])

    # Fruiting phase (after vegetative)
    if cycle.get('germinationDays') is not None and cycle.get('vegetativeDays') is not None:
        expected_dates["fruiting"] = planting_date + timedelta(
            days=cycle['germinationDays'] + cycle['vegetativeDays']
        )

    # Harvesting phase (after flowering) - THIS WAS MISSING FOR LETTUCE!
    if (cycle.get('germinationDays') is not None and
        cycle.get('vegetativeDays') is not None and
        cycle.get('floweringDays') is not None):
        expected_dates["harvesting"] = planting_date + timedelta(
            days=cycle['germinationDays'] + cycle['vegetativeDays'] + cycle['floweringDays']
        )

    # Cleaning phase (after total cycle)
    if cycle.get('totalCycleDays') is not None:
        expected_dates["cleaning"] = planting_date + timedelta(days=cycle['totalCycleDays'])

    print(f"\nCalculated expected dates:")
    for state, date in expected_dates.items():
        print(f"  {state}: {date}")

    # Update block
    result = await blocks_collection.update_one(
        {"blockCode": block_code},
        {
            "$set": {
                "expectedStatusChanges": expected_dates,
                "updatedAt": datetime.utcnow()
            }
        }
    )

    if result.modified_count > 0:
        print(f"\n[OK] Timeline recalculated successfully!")
    else:
        print(f"\n[SKIP] No changes made")

    print("="*60)

    client.close()


async def main():
    """Recalculate timelines for all test blocks"""

    print("="*60)
    print("Block Timeline Recalculation")
    print("="*60)

    blocks_to_fix = ["F001-004", "F001-005"]

    for block_code in blocks_to_fix:
        await recalculate_timeline(block_code)

    print("\n[OK] All blocks recalculated!")


if __name__ == "__main__":
    asyncio.run(main())
