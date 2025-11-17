"""
Initialize Farm Codes Utility

Run this script once to assign farm codes to existing farms.
Farm codes are numeric (F001, F002, etc.) and required for block code generation.

Usage:
    python -m scripts.initialize_farm_codes
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.services.database import farm_db
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def initialize_farm_codes():
    """Initialize farm codes for all farms"""
    try:
        # Connect to database
        db = farm_db.get_database()

        logger.info("Starting farm code initialization...")

        # Get all farms
        farms = await db.farms.find({}).to_list(length=None)

        if not farms:
            logger.info("No farms found in database.")
            return

        logger.info(f"Found {len(farms)} farms to process")

        # Get the highest existing farm code number
        max_code_num = 0
        for farm in farms:
            if "farmCode" in farm and farm["farmCode"]:
                try:
                    # Extract number from code like "F001"
                    code_num = int(farm["farmCode"][1:])
                    max_code_num = max(max_code_num, code_num)
                except:
                    pass

        next_code_num = max_code_num + 1

        # Process each farm
        updated_count = 0
        for farm in farms:
            farm_id = farm["farmId"]

            # Skip if already has a farm code
            if "farmCode" in farm and farm["farmCode"]:
                logger.info(f"  Farm {farm_id} already has code: {farm['farmCode']}")
                continue

            # Generate new farm code
            farm_code = f"F{next_code_num:03d}"  # e.g., "F001", "F002"

            # Update farm with code and initialize next block sequence
            await db.farms.update_one(
                {"farmId": farm_id},
                {
                    "$set": {
                        "farmCode": farm_code,
                        "nextBlockSequence": 1
                    }
                }
            )

            logger.info(f"  ✅ Assigned code {farm_code} to farm {farm_id} ({farm.get('name', 'N/A')})")
            updated_count += 1
            next_code_num += 1

        logger.info(f"\n✅ Farm code initialization complete!")
        logger.info(f"   - Total farms: {len(farms)}")
        logger.info(f"   - Updated: {updated_count}")
        logger.info(f"   - Already had codes: {len(farms) - updated_count}")

    except Exception as e:
        logger.error(f"❌ Error initializing farm codes: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(initialize_farm_codes())
