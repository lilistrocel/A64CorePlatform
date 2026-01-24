"""
Populate Status History from Harvest Data

This script populates statusChanges for blocks that have harvests but no status history.
It infers:
- Growing/Planted: Assumes planting happened some days before first harvest
- Harvesting: Set to first harvest date

Run: python -m scripts.populate_status_history
"""

import asyncio
from datetime import datetime, timedelta
from uuid import UUID
from motor.motor_asyncio import AsyncIOMotorClient
import os

# MongoDB connection
MONGO_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/a64core_db")

# Default days before first harvest to assume planting occurred
DAYS_BEFORE_HARVEST_FOR_PLANTING = 60  # Typical growing period


async def populate_status_history():
    """Populate statusChanges for blocks with harvests but no history."""

    client = AsyncIOMotorClient(MONGO_URI)
    db = client.get_default_database()

    blocks_collection = db.blocks
    harvests_collection = db.block_harvests

    print("=" * 60)
    print("POPULATING STATUS HISTORY FROM HARVEST DATA")
    print("=" * 60)

    # Find blocks with harvests but no statusChanges
    blocks_cursor = blocks_collection.find({
        "state": "harvesting",
        "$or": [
            {"statusChanges": {"$exists": False}},
            {"statusChanges": {"$size": 0}}
        ]
    })

    blocks = await blocks_cursor.to_list(length=1000)
    print(f"\nFound {len(blocks)} blocks in harvesting state without status history")

    updated_count = 0

    for block in blocks:
        block_id = block.get("blockId") or str(block.get("_id"))
        block_code = block.get("blockCode", "Unknown")

        # Get earliest and latest harvest dates
        pipeline = [
            {"$match": {"blockId": block_id}},
            {"$group": {
                "_id": "$blockId",
                "firstHarvest": {"$min": "$harvestDate"},
                "lastHarvest": {"$max": "$harvestDate"},
                "count": {"$sum": 1}
            }}
        ]

        harvest_stats = await harvests_collection.aggregate(pipeline).to_list(length=1)

        if not harvest_stats:
            print(f"  [{block_code}] No harvests found, skipping")
            continue

        stats = harvest_stats[0]
        first_harvest = stats["firstHarvest"]
        last_harvest = stats["lastHarvest"]
        harvest_count = stats["count"]

        print(f"\n  [{block_code}] {harvest_count} harvests: {first_harvest.strftime('%Y-%m-%d')} to {last_harvest.strftime('%Y-%m-%d')}")

        # Estimate planting date (days before first harvest)
        estimated_planted = first_harvest - timedelta(days=DAYS_BEFORE_HARVEST_FOR_PLANTING)

        # Build status history
        status_changes = [
            {
                "status": "planned",
                "changedAt": estimated_planted - timedelta(days=7),  # Planned a week before planting
                "changedBy": "00000000-0000-0000-0000-000000000001",
                "changedByEmail": "system@migration",
                "notes": "Auto-populated from harvest data migration"
            },
            {
                "status": "growing",
                "changedAt": estimated_planted,
                "changedBy": "00000000-0000-0000-0000-000000000001",
                "changedByEmail": "system@migration",
                "notes": f"Estimated planted date ({DAYS_BEFORE_HARVEST_FOR_PLANTING} days before first harvest)"
            },
            {
                "status": "harvesting",
                "changedAt": first_harvest,
                "changedBy": "00000000-0000-0000-0000-000000000001",
                "changedByEmail": "system@migration",
                "notes": f"First harvest recorded on {first_harvest.strftime('%Y-%m-%d')}"
            }
        ]

        # Update block
        result = await blocks_collection.update_one(
            {"_id": block["_id"]},
            {
                "$set": {
                    "statusChanges": status_changes,
                    "plantedDate": estimated_planted,
                    "updatedAt": datetime.utcnow()
                }
            }
        )

        if result.modified_count > 0:
            updated_count += 1
            print(f"    ✓ Updated with estimated planted: {estimated_planted.strftime('%Y-%m-%d')}")
            print(f"    ✓ Harvesting started: {first_harvest.strftime('%Y-%m-%d')}")
        else:
            print(f"    ! No changes made")

    print("\n" + "=" * 60)
    print(f"MIGRATION COMPLETE: {updated_count} blocks updated")
    print("=" * 60)

    client.close()


if __name__ == "__main__":
    asyncio.run(populate_status_history())
