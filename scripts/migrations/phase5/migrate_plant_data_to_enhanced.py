"""
Migration Script: Migrate plant_data to plant_data_enhanced

The UI uses plant_data_enhanced but existing data is in plant_data.
This script converts the basic schema to enhanced schema.

Author: Migration Script
Date: 2026-01-27
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
from uuid import uuid4
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Database connection
MONGODB_URI = "mongodb://localhost:27017"
DATABASE_NAME = "a64core_db"


def _format_contributor(contributor) -> str:
    """Format contributor info as a display string."""
    if not contributor:
        return None
    if isinstance(contributor, str):
        return contributor
    if isinstance(contributor, dict):
        name = contributor.get('name', '')
        org = contributor.get('organization', '')
        if name and org:
            return f"{name} ({org})"
        return name or org or None
    return None


def convert_to_enhanced(basic: dict) -> dict:
    """
    Convert basic plant_data schema to enhanced schema.
    """
    # Extract basic info
    plant_name = basic.get('plantName', 'Unknown')
    growth_days = basic.get('growthCycleDays', 90)
    yield_per_plant = basic.get('expectedYieldPerPlant', 1.0)
    yield_unit = basic.get('yieldUnit', 'kg')
    notes = basic.get('notes', '')
    tags = basic.get('tags', [])

    # Parse temperature from basic fields
    min_temp = basic.get('minTemperatureCelsius', 15.0) or 15.0
    max_temp = basic.get('maxTemperatureCelsius', 35.0) or 35.0
    optimal_temp = (min_temp + max_temp) / 2

    # Parse pH from basic fields
    min_ph = basic.get('optimalPHMin', 6.0) or 6.0
    max_ph = basic.get('optimalPHMax', 7.0) or 7.0
    optimal_ph = (min_ph + max_ph) / 2

    # Parse watering frequency
    watering_days = basic.get('wateringFrequencyDays', 3) or 3

    # Parse sunlight hours
    sunlight = basic.get('sunlightHoursDaily', '6-8') or '6-8'
    try:
        if '-' in str(sunlight):
            parts = str(sunlight).split('-')
            min_hours = float(parts[0])
            max_hours = float(parts[1])
        else:
            min_hours = float(sunlight)
            max_hours = min_hours + 2
    except (ValueError, IndexError):
        min_hours = 6.0
        max_hours = 8.0
    optimal_hours = (min_hours + max_hours) / 2

    # Estimate growth cycle breakdown
    germination = int(growth_days * 0.1)  # 10%
    vegetative = int(growth_days * 0.4)   # 40%
    flowering = int(growth_days * 0.2)    # 20%
    fruiting = int(growth_days * 0.2)     # 20%
    harvest = int(growth_days * 0.1)      # 10%

    # Extract harvest duration from notes if available
    harvest_duration = 10
    if notes and 'Harvest duration:' in notes:
        try:
            duration_str = notes.split('Harvest duration:')[1].split('days')[0].strip()
            harvest_duration = int(duration_str)
        except (ValueError, IndexError):
            pass

    # Build enhanced document
    enhanced = {
        "plantDataId": basic.get('plantDataId', str(uuid4())),
        "plantName": plant_name,
        "scientificName": basic.get('scientificName'),
        "farmTypeCompatibility": ["open_field", "greenhouse"],  # Default

        "growthCycle": {
            "germinationDays": germination,
            "vegetativeDays": vegetative,
            "floweringDays": flowering,
            "fruitingDays": fruiting,
            "harvestDurationDays": harvest_duration,
            "totalCycleDays": growth_days
        },

        "yieldInfo": {
            "yieldPerPlant": yield_per_plant,
            "yieldUnit": yield_unit,
            "expectedWastePercentage": 10.0
        },

        "environmentalRequirements": {
            "temperature": {
                "minCelsius": min_temp,
                "maxCelsius": max_temp,
                "optimalCelsius": optimal_temp
            },
            "humidity": {
                "minPercentage": 40.0,
                "maxPercentage": 80.0,
                "optimalPercentage": 60.0
            }
        },

        "wateringRequirements": {
            "frequencyDays": watering_days,
            "waterType": "tap",
            "droughtTolerance": "medium"
        },

        "soilRequirements": {
            "phRequirements": {
                "minPH": min_ph,
                "maxPH": max_ph,
                "optimalPH": optimal_ph
            },
            "soilTypes": ["loamy", "sandy"]
        },

        "diseasesAndPests": [],

        "lightRequirements": {
            "lightType": "full_sun",
            "minHoursDaily": min_hours,
            "maxHoursDaily": max_hours,
            "optimalHoursDaily": optimal_hours,
            "photoperiodSensitive": False
        },

        "gradingStandards": [],

        "economicsAndLabor": {
            "totalManHoursPerPlant": 0.5,
            "currency": "USD"
        },

        "additionalInfo": {
            "growthHabit": "determinate",
            "spacing": {
                "betweenPlantsCm": 30.0,
                "betweenRowsCm": 60.0
            },
            "supportRequirements": "none",
            "notes": notes
        },

        "spacingCategory": basic.get('spacingCategory'),
        # Format contributor as a string for display compatibility
        "contributor": _format_contributor(basic.get('contributor')),
        "targetRegion": "UAE",
        "tags": tags,

        "dataVersion": basic.get('dataVersion', 1),
        "isActive": True,
        "createdBy": basic.get('createdBy'),
        "createdByEmail": basic.get('createdByEmail', 'admin@a64platform.com'),
        "createdAt": basic.get('createdAt', datetime.now(timezone.utc)),
        "updatedAt": datetime.now(timezone.utc),
        "deletedAt": None
    }

    return enhanced


async def migrate_to_enhanced(db) -> dict:
    """
    Migrate all plant_data records to plant_data_enhanced.
    """
    logger.info("Starting migration from plant_data to plant_data_enhanced...")

    # Get all basic plant data
    basic_records = await db.plant_data.find({}).to_list(length=None)
    logger.info(f"Found {len(basic_records)} records in plant_data")

    if not basic_records:
        logger.info("No records to migrate")
        return {"migrated": 0}

    # Convert each record
    enhanced_records = []
    for basic in basic_records:
        try:
            enhanced = convert_to_enhanced(basic)
            enhanced_records.append(enhanced)
        except Exception as e:
            logger.error(f"Error converting {basic.get('plantName')}: {e}")

    # Clear existing enhanced records and insert new ones
    await db.plant_data_enhanced.delete_many({})

    if enhanced_records:
        result = await db.plant_data_enhanced.insert_many(enhanced_records)
        logger.info(f"Inserted {len(result.inserted_ids)} records into plant_data_enhanced")

    return {"migrated": len(enhanced_records)}


async def verify_results(db) -> dict:
    """Verify the migration results."""
    logger.info("Verifying results...")

    basic_count = await db.plant_data.count_documents({})
    enhanced_count = await db.plant_data_enhanced.count_documents({})

    # Sample enhanced record
    sample = await db.plant_data_enhanced.find_one(
        {},
        {"plantName": 1, "growthCycle": 1, "contributor": 1}
    )

    logger.info("=" * 60)
    logger.info("MIGRATION RESULTS")
    logger.info("=" * 60)
    logger.info(f"plant_data: {basic_count} records")
    logger.info(f"plant_data_enhanced: {enhanced_count} records")

    if sample:
        logger.info(f"\nSample Enhanced Record:")
        logger.info(f"  Plant: {sample.get('plantName')}")
        logger.info(f"  Growth Cycle: {sample.get('growthCycle')}")
        logger.info(f"  Contributor: {sample.get('contributor')}")

    logger.info("=" * 60)

    return {
        "basic_count": basic_count,
        "enhanced_count": enhanced_count
    }


async def run_migration():
    """Run the complete migration."""
    logger.info("=" * 60)
    logger.info("PLANT DATA TO ENHANCED MIGRATION")
    logger.info("=" * 60)

    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[DATABASE_NAME]

    try:
        # Migrate
        result = await migrate_to_enhanced(db)

        # Verify
        verification = await verify_results(db)

        logger.info("\n" + "=" * 60)
        logger.info("MIGRATION COMPLETED")
        logger.info("=" * 60)

        return {
            "success": True,
            "migration": result,
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
