"""
Migration Script: Fix Duplicate Block Codes

Problem: Different legacy block types were mapped to the same new blockCode
- A-01 and AG-01 both became F004-001
- TV-01, TVGH-01, TVNH-01 all became F003-001

Solution: Add type suffix to distinguish them
- A-xx (Open Field) → F004-xxx-OF
- AG-xx (Greenhouse) → F004-xxx-GH
- TV-xx (Open Field) → F003-xxx-OF
- TVGH-xx (Greenhouse) → F003-xxx-GH
- TVNH-xx (New Hydroponics) → F003-xxx-NH

Author: Migration Script
Date: 2026-01-27
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import logging
import re

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Database connection
MONGODB_URI = "mongodb://localhost:27017"
DATABASE_NAME = "a64core_db"

# Legacy prefix to block type suffix mapping
PREFIX_TO_SUFFIX = {
    # Al Ain blocks
    "A-": "-OF",      # Open Field
    "AG-": "-GH",     # Greenhouse

    # Tawam Valley blocks
    "TV-": "-OF",     # Open Field
    "TVGH-": "-GH",   # Greenhouse
    "TVNH-": "-NH",   # New Hydroponics

    # Al Wagen blocks (if any duplicates)
    "WG-": "-OF",     # Open Field
    "WGGH-": "-GH",   # Greenhouse

    # Al Khazana blocks (if any duplicates)
    "KHZ-": "-OF",    # Open Field
    "KHZGH-": "-GH",  # Greenhouse
}


def get_block_type_suffix(legacy_code: str) -> str:
    """Determine the type suffix based on legacy block code prefix."""
    if not legacy_code:
        return ""

    # Sort by length descending to match longer prefixes first (e.g., TVGH- before TV-)
    for prefix, suffix in sorted(PREFIX_TO_SUFFIX.items(), key=lambda x: -len(x[0])):
        if legacy_code.startswith(prefix):
            return suffix

    return ""


async def find_duplicate_physical_blocks(db) -> dict:
    """Find physical blocks that share the same blockCode."""
    pipeline = [
        {"$match": {"blockCategory": "physical"}},
        {"$group": {
            "_id": "$blockCode",
            "blocks": {"$push": {
                "blockId": "$blockId",
                "legacyBlockCode": "$legacyBlockCode",
                "blockCode": "$blockCode"
            }},
            "count": {"$sum": 1}
        }},
        {"$match": {"count": {"$gt": 1}}}
    ]

    duplicates = await db.blocks.aggregate(pipeline).to_list(length=None)
    return {d["_id"]: d["blocks"] for d in duplicates}


async def fix_duplicate_block_codes(db) -> dict:
    """Fix duplicate blockCodes by adding type suffixes."""
    logger.info("Finding duplicate physical block codes...")

    duplicates = await find_duplicate_physical_blocks(db)
    logger.info(f"Found {len(duplicates)} duplicate blockCode groups")

    physical_updated = 0
    virtual_updated = 0

    for old_code, blocks in duplicates.items():
        logger.info(f"\nProcessing duplicate: {old_code}")

        for block in blocks:
            block_id = block["blockId"]
            legacy_code = block["legacyBlockCode"]

            # Determine new suffix
            suffix = get_block_type_suffix(legacy_code)
            if not suffix:
                logger.warning(f"  No suffix mapping for legacy code: {legacy_code}")
                continue

            new_code = f"{old_code}{suffix}"
            logger.info(f"  {legacy_code} → {new_code}")

            # Update physical block
            result = await db.blocks.update_one(
                {"blockId": block_id},
                {"$set": {
                    "blockCode": new_code,
                    "updatedAt": datetime.utcnow()
                }}
            )
            if result.modified_count > 0:
                physical_updated += 1

            # Update all virtual blocks under this physical block
            virtual_result = await db.blocks.update_many(
                {"parentBlockId": block_id, "blockCategory": "virtual"},
                {"$set": {"updatedAt": datetime.utcnow()}}
            )

            # Also update virtual block codes (F004-001-001 → F004-001-GH-001)
            virtual_blocks = await db.blocks.find(
                {"parentBlockId": block_id, "blockCategory": "virtual"}
            ).to_list(length=None)

            for vb in virtual_blocks:
                old_vb_code = vb.get("blockCode", "")
                # Replace the parent portion of the code
                # e.g., F004-001-001 → F004-001-GH-001
                if old_vb_code.startswith(old_code):
                    new_vb_code = old_vb_code.replace(old_code, new_code, 1)
                    await db.blocks.update_one(
                        {"blockId": vb["blockId"]},
                        {"$set": {
                            "blockCode": new_vb_code,
                            "updatedAt": datetime.utcnow()
                        }}
                    )
                    virtual_updated += 1
                    logger.info(f"    Virtual: {old_vb_code} → {new_vb_code}")

    return {
        "physical_blocks_updated": physical_updated,
        "virtual_blocks_updated": virtual_updated,
        "duplicate_groups_processed": len(duplicates)
    }


async def verify_results(db) -> dict:
    """Verify no more duplicates exist."""
    logger.info("\nVerifying results...")

    # Check for remaining duplicates
    remaining = await find_duplicate_physical_blocks(db)

    # Sample some updated blocks
    samples = await db.blocks.find(
        {"blockCategory": "physical", "blockCode": {"$regex": "-(OF|GH|NH)$"}}
    ).limit(10).to_list(length=None)

    logger.info("=" * 60)
    logger.info("VERIFICATION RESULTS")
    logger.info("=" * 60)
    logger.info(f"Remaining duplicate groups: {len(remaining)}")

    if remaining:
        logger.warning("Still have duplicates:")
        for code, blocks in remaining.items():
            logger.warning(f"  {code}: {[b['legacyBlockCode'] for b in blocks]}")

    logger.info(f"\nSample updated blocks:")
    for s in samples[:5]:
        logger.info(f"  {s.get('legacyBlockCode')} → {s.get('blockCode')}")

    logger.info("=" * 60)

    return {
        "remaining_duplicates": len(remaining),
        "sample_count": len(samples)
    }


async def run_migration():
    """Run the complete migration."""
    logger.info("=" * 60)
    logger.info("FIX DUPLICATE BLOCK CODES MIGRATION")
    logger.info("=" * 60)

    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[DATABASE_NAME]

    try:
        # Fix duplicates
        fix_result = await fix_duplicate_block_codes(db)

        # Verify
        verification = await verify_results(db)

        logger.info("\n" + "=" * 60)
        logger.info("MIGRATION COMPLETED")
        logger.info("=" * 60)
        logger.info(f"Physical blocks updated: {fix_result['physical_blocks_updated']}")
        logger.info(f"Virtual blocks updated: {fix_result['virtual_blocks_updated']}")

        return {
            "success": True,
            "fix_result": fix_result,
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
