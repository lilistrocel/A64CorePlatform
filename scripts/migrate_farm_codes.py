"""
Migration Script: Add farmCode to existing farms

This script:
1. Finds all farms without farmCode
2. Assigns farmCode sequentially (F001, F002, etc.)
3. Updates the farm_sequence counter to the correct value

Run with: python scripts/migrate_farm_codes.py
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os

# MongoDB connection
MONGO_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("MONGODB_DB", "a64core_db")


async def migrate_farm_codes():
    """Add farmCode to all existing farms that don't have one."""
    print(f"Connecting to MongoDB: {MONGO_URI}")
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]

    # Get all farms, sorted by createdAt to maintain order
    farms = await db.farms.find({}).sort("createdAt", 1).to_list(length=1000)

    print(f"Found {len(farms)} farms in database")

    # Find farms without farmCode
    farms_without_code = [f for f in farms if not f.get("farmCode")]
    print(f"Found {len(farms_without_code)} farms without farmCode")

    if not farms_without_code:
        print("All farms already have farmCode. Nothing to migrate.")
        # Still need to set the counter correctly
        max_sequence = 0
        for farm in farms:
            code = farm.get("farmCode", "")
            if code and code.startswith("F") and code[1:].isdigit():
                seq = int(code[1:])
                if seq > max_sequence:
                    max_sequence = seq

        # Update counter
        await db.counters.update_one(
            {"_id": "farm_sequence"},
            {"$set": {"value": max_sequence}},
            upsert=True
        )
        print(f"Counter set to {max_sequence}")
        return

    # Find the highest existing farmCode number
    existing_codes = []
    for farm in farms:
        code = farm.get("farmCode", "")
        if code and code.startswith("F") and code[1:].isdigit():
            existing_codes.append(int(code[1:]))

    next_sequence = max(existing_codes) + 1 if existing_codes else 1

    print(f"Starting sequence from F{next_sequence:03d}")

    # Assign farmCode to farms without one
    for farm in farms_without_code:
        farm_code = f"F{next_sequence:03d}"
        farm_id = farm["farmId"]

        result = await db.farms.update_one(
            {"farmId": farm_id},
            {
                "$set": {
                    "farmCode": farm_code,
                    "nextBlockSequence": farm.get("nextBlockSequence", 1)
                }
            }
        )

        if result.modified_count > 0:
            print(f"  Updated farm {farm_id} ({farm.get('name', 'Unknown')}) -> {farm_code}")
        else:
            print(f"  Failed to update farm {farm_id}")

        next_sequence += 1

    # Update the counter
    final_sequence = next_sequence - 1
    await db.counters.update_one(
        {"_id": "farm_sequence"},
        {"$set": {"value": final_sequence}},
        upsert=True
    )
    print(f"\nCounter set to {final_sequence}")
    print(f"Migration complete! {len(farms_without_code)} farms updated.")


if __name__ == "__main__":
    asyncio.run(migrate_farm_codes())
