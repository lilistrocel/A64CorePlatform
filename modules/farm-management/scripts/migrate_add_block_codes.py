"""
Migration Script: Add blockCode, farmCode, and sequenceNumber to Existing Blocks

This script updates existing blocks in the database to include the new
code fields that were added to the Block model.

For each farm:
1. Assigns a sequential farmCode (F001, F002, etc.)
2. For each block in the farm:
   - Assigns sequenceNumber based on creation order
   - Generates blockCode as "{farmCode}-{sequenceNumber:03d}"

Example:
- Farm 1 → farmCode: "F001"
  - Block 1 → sequenceNumber: 1, blockCode: "F001-001"
  - Block 2 → sequenceNumber: 2, blockCode: "F001-002"
- Farm 2 → farmCode: "F002"
  - Block 1 → sequenceNumber: 1, blockCode: "F002-001"

Run this script once to migrate existing data.
"""

import asyncio
import sys
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from src.services.database import get_database_settings

async def migrate_block_codes():
    """Add blockCode, farmCode, and sequenceNumber to existing blocks"""

    # Connect to MongoDB
    settings = get_database_settings()
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.MONGODB_DB_NAME]

    print(f"Connected to MongoDB: {settings.MONGODB_URL}")
    print(f"Database: {settings.MONGODB_DB_NAME}")
    print()

    # Get all farms
    farms_collection = db["farms"]
    farms = await farms_collection.find({"isActive": True}).sort("createdAt", 1).to_list(None)

    if not farms:
        print("No farms found in database")
        return

    print(f"Found {len(farms)} farms")
    print()

    # Process each farm
    farm_counter = 1
    total_blocks_updated = 0

    for farm in farms:
        farm_id = farm["farmId"]
        farm_name = farm.get("name", "Unnamed Farm")
        farm_code = f"F{farm_counter:03d}"

        print(f"Processing Farm {farm_counter}: {farm_name}")
        print(f"  Farm ID: {farm_id}")
        print(f"  Farm Code: {farm_code}")

        # Update farm with farmCode if it doesn't have one
        if "farmCode" not in farm:
            await farms_collection.update_one(
                {"farmId": farm_id},
                {"$set": {
                    "farmCode": farm_code,
                    "updatedAt": datetime.utcnow()
                }}
            )
            print(f"  ✓ Added farmCode to farm")

        # Get all blocks for this farm
        blocks_collection = db["blocks"]
        blocks = await blocks_collection.find({
            "farmId": farm_id,
            "isActive": True
        }).sort("createdAt", 1).to_list(None)

        if not blocks:
            print(f"  No blocks found for this farm")
            print()
            farm_counter += 1
            continue

        print(f"  Found {len(blocks)} blocks")

        # Process each block
        block_counter = 1
        for block in blocks:
            block_id = block["blockId"]
            block_name = block.get("name", f"Block {block_counter}")

            # Check if block already has codes
            if "blockCode" in block and "farmCode" in block and "sequenceNumber" in block:
                print(f"    Block {block_counter}: {block_name} - Already has codes, skipping")
                block_counter += 1
                continue

            # Generate codes
            sequence_number = block_counter
            block_code = f"{farm_code}-{sequence_number:03d}"

            # Update block
            await blocks_collection.update_one(
                {"blockId": block_id},
                {"$set": {
                    "blockCode": block_code,
                    "farmCode": farm_code,
                    "sequenceNumber": sequence_number,
                    "updatedAt": datetime.utcnow()
                }}
            )

            print(f"    ✓ Block {block_counter}: {block_name}")
            print(f"      Block Code: {block_code}")
            print(f"      Sequence Number: {sequence_number}")

            total_blocks_updated += 1
            block_counter += 1

        print()
        farm_counter += 1

    print(f"Migration complete!")
    print(f"Total farms processed: {len(farms)}")
    print(f"Total blocks updated: {total_blocks_updated}")

    # Close connection
    client.close()

if __name__ == "__main__":
    print("=" * 70)
    print("Block Code Migration Script")
    print("=" * 70)
    print()

    asyncio.run(migrate_block_codes())
