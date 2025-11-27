#!/usr/bin/env python3
"""
Add multi-crop support fields to all existing blocks

This migration adds the following fields to support virtual blocks for multi-crop planting:
- blockCategory: 'physical' (all existing blocks are physical)
- parentBlockId: null (existing blocks have no parent)
- availableArea: null (will be set when first virtual child is created)
- virtualBlockCounter: 0 (no virtual children yet)
- childBlockIds: [] (empty array for child tracking)
- allocatedArea: null (only virtual blocks have this)

Run this script once to update the database schema.
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from datetime import datetime


async def add_multicrop_fields():
    """Add multi-crop fields to all existing blocks"""

    # MongoDB connection
    mongo_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    database_name = os.getenv("DATABASE_NAME", "a64core_db")

    print(f"Connecting to MongoDB: {mongo_uri}")
    client = AsyncIOMotorClient(mongo_uri)
    db = client[database_name]

    print(f"Database: {database_name}")
    print("=" * 60)

    # ============================================================
    # 1. Check if blocks collection exists
    # ============================================================
    print("\n[1/3] Checking blocks collection...")

    if "blocks" not in await db.list_collection_names():
        print("[WARN] blocks collection doesn't exist yet")
        print("       No migration needed - new blocks will use updated schema")
        client.close()
        return

    blocks_collection = db.blocks
    total_blocks = await blocks_collection.count_documents({})
    print(f"[OK] Found {total_blocks} blocks to update")

    # ============================================================
    # 2. Add multi-crop fields to all existing blocks
    # ============================================================
    print("\n[2/3] Adding multi-crop fields to existing blocks...")

    # Update all blocks that don't have the new fields
    update_result = await blocks_collection.update_many(
        {
            # Only update blocks that don't have the new fields yet
            "blockCategory": {"$exists": False}
        },
        {
            "$set": {
                # Multi-crop support fields
                "blockCategory": "physical",  # All existing blocks are physical
                "parentBlockId": None,  # No parent for existing blocks
                "availableArea": None,  # Will be set when first virtual child is created
                "virtualBlockCounter": 0,  # No virtual children yet
                "childBlockIds": [],  # Empty array for child tracking
                "allocatedArea": None,  # Only virtual blocks have this
                "updatedAt": datetime.utcnow()  # Update timestamp
            }
        }
    )

    print(f"[OK] Updated {update_result.modified_count} blocks")

    if update_result.modified_count > 0:
        print(f"     - Set blockCategory='physical' for all")
        print(f"     - Set parentBlockId=null for all")
        print(f"     - Set availableArea=null for all")
        print(f"     - Set virtualBlockCounter=0 for all")
        print(f"     - Set childBlockIds=[] for all")
        print(f"     - Set allocatedArea=null for all")

    # ============================================================
    # 3. Create indexes for efficient virtual block queries
    # ============================================================
    print("\n[3/3] Creating indexes for virtual block queries...")

    # Index 1: Query blocks by category
    await blocks_collection.create_index(
        [("blockCategory", 1)],
        name="idx_block_category"
    )
    print("[OK] Created index: blockCategory")

    # Index 2: Query virtual blocks by parent
    await blocks_collection.create_index(
        [("parentBlockId", 1)],
        name="idx_parent_block",
        sparse=True  # Only index documents where parentBlockId exists
    )
    print("[OK] Created index: parentBlockId (sparse)")

    # Index 3: Compound index for querying active virtual blocks by parent
    await blocks_collection.create_index(
        [("parentBlockId", 1), ("isActive", 1)],
        name="idx_parent_active",
        sparse=True
    )
    print("[OK] Created index: parentBlockId + isActive (sparse)")

    # ============================================================
    # Summary
    # ============================================================
    print("\n" + "=" * 60)
    print("[SUCCESS] Multi-crop fields added to all blocks!")
    print("=" * 60)
    print(f"\nBlocks updated: {update_result.modified_count}")
    print("\nNew fields added:")
    print("  - blockCategory: 'physical' (all existing blocks)")
    print("  - parentBlockId: null (no parent for existing blocks)")
    print("  - availableArea: null (set when virtual children created)")
    print("  - virtualBlockCounter: 0 (no virtual children yet)")
    print("  - childBlockIds: [] (empty array)")
    print("  - allocatedArea: null (only for virtual blocks)")
    print("\nIndexes created:")
    print("  1. idx_block_category - Query by category")
    print("  2. idx_parent_block - Query virtual blocks by parent (sparse)")
    print("  3. idx_parent_active - Query active virtual blocks (sparse)")
    print("\nNext steps:")
    print("  -> Implement virtual block creation logic in BlockService")
    print("  -> Add multi-crop planting endpoints to API")
    print("  -> Implement virtual block auto-deletion on EMPTY status")
    print("  -> Update frontend to support multi-crop planting UI")

    # Verify migration
    print("\n" + "=" * 60)
    print("Verification:")
    print("=" * 60)

    # Count blocks by category
    physical_count = await blocks_collection.count_documents({"blockCategory": "physical"})
    virtual_count = await blocks_collection.count_documents({"blockCategory": "virtual"})
    print(f"\nBlock categories:")
    print(f"  - Physical blocks: {physical_count}")
    print(f"  - Virtual blocks: {virtual_count}")

    # Sample a few blocks to verify fields
    sample_blocks = await blocks_collection.find().limit(3).to_list(length=3)
    if sample_blocks:
        print(f"\nSample block verification (showing {len(sample_blocks)} blocks):")
        for i, block in enumerate(sample_blocks, 1):
            print(f"\n  Block {i}: {block.get('blockCode', 'N/A')}")
            print(f"    - blockCategory: {block.get('blockCategory', 'MISSING')}")
            print(f"    - parentBlockId: {block.get('parentBlockId', 'MISSING')}")
            print(f"    - virtualBlockCounter: {block.get('virtualBlockCounter', 'MISSING')}")
            print(f"    - childBlockIds: {block.get('childBlockIds', 'MISSING')}")

    # Close connection
    client.close()
    print("\n[OK] Database connection closed")


if __name__ == "__main__":
    print("=" * 60)
    print("Multi-Crop Support - Database Migration")
    print("=" * 60)
    asyncio.run(add_multicrop_fields())
