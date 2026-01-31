"""
Migration Script: Calculate Predicted Yields for Virtual Blocks

This script:
1. Uses the legacy drip system formula: predictedYieldKg = maxPlants × NetYieldPerDripkg
2. Updates virtual block KPIs with calculated predicted yields
3. Recalculates yield efficiency percentages

Author: Migration Script
Date: 2026-01-27
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from typing import Dict
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Database connection
MONGODB_URI = "mongodb://localhost:27017"
DATABASE_NAME = "a64core_db"

# Crop yield data from legacy standard_planning table
# Format: crop_name -> NetYieldPerDripkg (kg per drip point)
CROP_YIELDS = {
    "Ash Gourd": 2.55,
    "Butternut": 1.5,
    "Cabbage - Round Red": 2.8,
    "Cabbage - Round White": 2.8,
    "Capsicum - Green": 4.0,
    "Capsicum - Red": 4.0,
    "Capsicum - Yellow": 4.0,
    "Cauliflower": 2.0,
    "Celery": 2.55,
    "Cucumber": 4.25,
    "Eggplant": 5.6,
    "Fennel": 2.7,
    "Green Beans": 4.5,
    "Habanero - Green": 4.5,
    "Habanero - Orange": 4.5,
    "Habanero - Red": 4.5,
    "Habanero - Yellow": 4.5,
    "Honeydew Melon": 2.0,
    "Hot Pepper": 2.0,
    "Leeks": 3.8,
    "Lettuce - Boston": 0.85,
    "Lettuce - Frisee": 0.9,
    "Lettuce - Iceberg": 1.2,
    "Lettuce - Lollo Bionda": 0.85,
    "Lettuce - Lollo Rosso": 0.85,
    "Lettuce - Oakleaf Red": 0.9,
    "Lettuce - Romaine": 2.04,
    "Long Beans": 0.85,
    "Long White Pumpkin": 1.6,
    "Marrow": 1.875,
    "Mulukhiyah": 1.0,
    "Okra": 0.48,
    "Onion - White": 4.0,
    "Potato": 3.15,
    "Red Long Chili": 3.2,
    "Rock Melon": 1.2,
    "Snap Beans": 4.5,
    "Sweet Corn": 1.0,
    "Sweet Melon": 2.4,
    "Tomato-Beef": 7.0,
    "Tomato-Cherry": 5.0,
    "Tomato-OF": 7.0,
    "Tomato-Round-Table": 7.0,
    "Watermelon": 3.75,
    "Zucchini - Green": 2.55,
    "Zucchini - Yellow": 2.55,
}

# Additional mappings for MongoDB crop names that differ from legacy
CROP_NAME_MAPPINGS = {
    # Hydroponics variants map to their lettuce equivalents
    "Hydroponics Bionda": "Lettuce - Lollo Bionda",
    "Hydroponics Boston": "Lettuce - Boston",
    "Hydroponics Frisee": "Lettuce - Frisee",
    "Hydroponics Gem": "Lettuce - Romaine",  # Gem is similar to Romaine
    "Hydroponics Oak Leafs": "Lettuce - Oakleaf Red",
    "Hydroponics Rosso": "Lettuce - Lollo Rosso",
    # Phase variants
    "Lettuce - Phase 1 (5cm)": "Lettuce - Iceberg",  # Use Iceberg as default for phase lettuce
    "Lettuce - Radicchio": "Lettuce - Romaine",  # Radicchio similar yield to romaine
}


def get_yield_per_drip(crop_name: str) -> float:
    """Get the yield per drip for a crop, handling name mappings."""
    # Try direct match first
    if crop_name in CROP_YIELDS:
        return CROP_YIELDS[crop_name]

    # Try mapped name
    mapped_name = CROP_NAME_MAPPINGS.get(crop_name)
    if mapped_name and mapped_name in CROP_YIELDS:
        return CROP_YIELDS[mapped_name]

    # No match found
    return 0.0


async def calculate_predicted_yields(db) -> Dict:
    """
    Calculate predictedYieldKg for all virtual blocks.

    Formula: predictedYieldKg = maxPlants × NetYieldPerDripkg

    Also updates yieldEfficiencyPercent based on new predicted values.
    """
    logger.info("Starting: Calculate predicted yields for virtual blocks...")

    # Get all virtual blocks with crops
    virtual_blocks = await db.blocks.find({
        "blockCategory": "virtual",
        "targetCropName": {"$ne": None},
        "isActive": True
    }).to_list(length=None)

    logger.info(f"Found {len(virtual_blocks)} virtual blocks with crops")

    updated_count = 0
    skipped_count = 0
    no_yield_data = []

    for block in virtual_blocks:
        block_id = str(block.get("blockId"))
        crop_name = block.get("targetCropName")
        max_plants = block.get("maxPlants", 0) or 0

        # Get yield per drip for this crop
        yield_per_drip = get_yield_per_drip(crop_name)

        if yield_per_drip == 0.0:
            no_yield_data.append(crop_name)
            skipped_count += 1
            continue

        if max_plants <= 0:
            skipped_count += 1
            continue

        # Calculate predicted yield
        predicted_yield = max_plants * yield_per_drip

        # Get current actual yield
        current_kpi = block.get("kpi", {})
        actual_yield = current_kpi.get("actualYieldKg", 0) or 0

        # Calculate efficiency
        efficiency = (actual_yield / predicted_yield * 100) if predicted_yield > 0 else 0

        # Update block KPIs
        result = await db.blocks.update_one(
            {"blockId": block_id},
            {"$set": {
                "kpi.predictedYieldKg": round(predicted_yield, 2),
                "kpi.yieldEfficiencyPercent": round(efficiency, 1),
                "updatedAt": datetime.utcnow()
            }}
        )

        if result.modified_count > 0:
            updated_count += 1
            logger.debug(f"Updated {block.get('blockCode')}: {crop_name} - "
                        f"{max_plants} drips × {yield_per_drip} kg/drip = {predicted_yield:.2f} kg predicted")

    # Log unique crops without yield data
    unique_no_yield = set(no_yield_data)
    if unique_no_yield:
        logger.warning(f"Crops without yield data: {unique_no_yield}")

    logger.info(f"Updated predictedYieldKg for {updated_count} virtual blocks")
    logger.info(f"Skipped {skipped_count} blocks (no yield data or no plants)")

    return {
        "updated": updated_count,
        "skipped": skipped_count,
        "crops_without_data": list(unique_no_yield)
    }


async def verify_results(db) -> Dict:
    """Verify the migration results."""
    logger.info("Verifying results...")

    # Count blocks with predicted yields
    with_predicted = await db.blocks.count_documents({
        "blockCategory": "virtual",
        "kpi.predictedYieldKg": {"$gt": 0}
    })

    without_predicted = await db.blocks.count_documents({
        "blockCategory": "virtual",
        "targetCropName": {"$ne": None},
        "kpi.predictedYieldKg": {"$lte": 0}
    })

    # Sample data
    sample = await db.blocks.find_one({
        "blockCategory": "virtual",
        "kpi.predictedYieldKg": {"$gt": 0},
        "kpi.actualYieldKg": {"$gt": 0}
    }, {"blockCode": 1, "targetCropName": 1, "maxPlants": 1, "kpi": 1})

    results = {
        "blocks_with_predicted_yield": with_predicted,
        "blocks_without_predicted_yield": without_predicted
    }

    logger.info("=" * 60)
    logger.info("PREDICTED YIELD CALCULATION RESULTS")
    logger.info("=" * 60)
    logger.info(f"Virtual blocks with predicted yield: {with_predicted}")
    logger.info(f"Virtual blocks without predicted yield: {without_predicted}")

    if sample:
        logger.info(f"\nSample Block:")
        logger.info(f"  Code: {sample.get('blockCode')}")
        logger.info(f"  Crop: {sample.get('targetCropName')}")
        logger.info(f"  Max Plants: {sample.get('maxPlants')}")
        logger.info(f"  KPI: {sample.get('kpi')}")

        # Calculate expected
        crop = sample.get('targetCropName')
        plants = sample.get('maxPlants', 0)
        yield_per_drip = get_yield_per_drip(crop)
        expected = plants * yield_per_drip
        logger.info(f"  Expected Calc: {plants} × {yield_per_drip} = {expected:.2f} kg")

    logger.info("=" * 60)

    return results


async def run_migration():
    """Run the complete migration."""
    logger.info("=" * 60)
    logger.info("PREDICTED YIELD CALCULATION MIGRATION")
    logger.info("=" * 60)

    # Connect to database
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[DATABASE_NAME]

    try:
        # Step 1: Calculate predicted yields
        calc_result = await calculate_predicted_yields(db)

        # Step 2: Verify results
        verification = await verify_results(db)

        logger.info("\n" + "=" * 60)
        logger.info("MIGRATION COMPLETED SUCCESSFULLY")
        logger.info("=" * 60)

        return {
            "success": True,
            "calculation_result": calc_result,
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
