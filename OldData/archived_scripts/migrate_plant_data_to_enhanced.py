#!/usr/bin/env python3
"""
Migration Script: Plant Data to Plant Data Enhanced
====================================================
Migrates records from plant_data collection to plant_data_enhanced collection
with proper nested schema structure.

Usage:
    python scripts/migrate_plant_data_to_enhanced.py

    # Dry run mode (no actual insertion)
    python scripts/migrate_plant_data_to_enhanced.py --dry-run
"""

import asyncio
import sys
from datetime import datetime
from typing import Dict, Any, List, Optional
from motor.motor_asyncio import AsyncIOMotorClient

# MongoDB connection
MONGO_URL = 'mongodb://localhost:27017/a64core_db'

# Spacing category to cm mapping
SPACING_MAP = {
    'xs': 15,
    's': 30,
    'm': 45,
    'l': 60,
    'xl': 90,
    'bush': 100,
    'large_bush': 150,
    'small_tree': 200,
    'medium_tree': 300,
    'large_tree': 400,
}

# Plant type to germination days mapping
GERMINATION_DAYS_MAP = {
    'leafy_vegetable': 7,
    'root_vegetable': 10,
    'fruit_vegetable': 8,
    'herb': 5,
    'legume': 6,
    'grain': 7,
    'fruit_tree': 14,
    'default': 7
}

# Plant type to growth habit mapping
GROWTH_HABIT_MAP = {
    'leafy_vegetable': 'bush',
    'root_vegetable': 'bush',
    'fruit_vegetable': 'vine',
    'herb': 'bush',
    'legume': 'vine',
    'grain': 'upright',
    'fruit_tree': 'tree',
    'default': 'bush'
}


def parse_sunlight_hours(sunlight_str: Optional[str]) -> tuple[float, float, float]:
    """
    Parse sunlightHoursDaily string like '6-8' or '8-10 hours' into min, max, optimal.

    Returns:
        (min_hours, max_hours, optimal_hours)
    """
    if not sunlight_str:
        return (6.0, 12.0, 9.0)

    # Remove non-numeric characters except dash and dot
    clean_str = ''.join(c for c in sunlight_str if c.isdigit() or c in ['-', '.'])

    if '-' in clean_str:
        parts = clean_str.split('-')
        try:
            min_h = float(parts[0])
            max_h = float(parts[1]) if len(parts) > 1 else min_h + 4
            optimal = (min_h + max_h) / 2
            return (min_h, max_h, optimal)
        except ValueError:
            return (6.0, 12.0, 9.0)
    else:
        try:
            hours = float(clean_str)
            return (hours, hours + 4, hours + 2)
        except ValueError:
            return (6.0, 12.0, 9.0)


def calculate_growth_cycle_phases(total_days: int, plant_type: str) -> Dict[str, int]:
    """
    Calculate growth cycle phases based on total cycle days and plant type.

    Returns:
        Dict with germinationDays, vegetativeDays, floweringDays, fruitingDays, harvestDurationDays
    """
    germination = GERMINATION_DAYS_MAP.get(plant_type, GERMINATION_DAYS_MAP['default'])

    # Remaining days after germination
    remaining = total_days - germination

    # Distribution percentages (after germination)
    vegetative_pct = 0.4
    flowering_pct = 0.2
    fruiting_pct = 0.3

    vegetative = int(remaining * vegetative_pct)
    flowering = int(remaining * flowering_pct)
    fruiting = int(remaining * fruiting_pct)
    harvest_duration = remaining - vegetative - flowering - fruiting

    # Ensure harvest duration is reasonable (10-20 days default)
    if harvest_duration < 10:
        harvest_duration = 10
    elif harvest_duration > 30:
        harvest_duration = 20

    return {
        'germinationDays': germination,
        'vegetativeDays': vegetative,
        'floweringDays': flowering,
        'fruitingDays': fruiting,
        'harvestDurationDays': harvest_duration,
        'totalCycleDays': germination + vegetative + flowering + fruiting + harvest_duration
    }


def get_spacing_cm(spacing_category: Optional[str]) -> tuple[float, float]:
    """
    Convert spacing category to cm values.

    Returns:
        (between_plants_cm, between_rows_cm)
    """
    if not spacing_category:
        spacing_category = 'm'

    base_spacing = SPACING_MAP.get(spacing_category.lower(), 45)
    between_plants = float(base_spacing)
    between_rows = float(base_spacing * 1.2)  # Rows are typically 20% wider

    return (between_plants, between_rows)


def transform_to_enhanced(source_doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    Transform a plant_data document to plant_data_enhanced format.

    Args:
        source_doc: Document from plant_data collection

    Returns:
        Transformed document for plant_data_enhanced collection
    """
    # Extract source fields with defaults
    plant_type = source_doc.get('plantType', 'default')
    growth_cycle_days = source_doc.get('growthCycleDays', 60)
    spacing_category = source_doc.get('spacingCategory', 'm')
    sunlight_str = source_doc.get('sunlightHoursDaily')

    # Calculate growth cycle phases
    growth_cycle = calculate_growth_cycle_phases(growth_cycle_days, plant_type)

    # Parse sunlight hours
    min_light, max_light, optimal_light = parse_sunlight_hours(sunlight_str)

    # Get spacing values
    between_plants, between_rows = get_spacing_cm(spacing_category)

    # Build enhanced document
    enhanced_doc = {
        # Basic identification
        'plantDataId': source_doc.get('plantDataId', source_doc.get('_id')),
        'plantName': source_doc.get('plantName'),
        'scientificName': source_doc.get('scientificName'),
        'plantType': plant_type,

        # Growth cycle (REQUIRED nested object)
        'growthCycle': {
            'germinationDays': growth_cycle['germinationDays'],
            'vegetativeDays': growth_cycle['vegetativeDays'],
            'floweringDays': growth_cycle['floweringDays'],
            'fruitingDays': growth_cycle['fruitingDays'],
            'harvestDurationDays': growth_cycle['harvestDurationDays'],
            'totalCycleDays': growth_cycle['totalCycleDays']
        },

        # Yield information (REQUIRED nested object)
        'yieldInfo': {
            'expectedYieldPerPlant': float(source_doc.get('expectedYieldPerPlant', 1.0)),
            'yieldUnit': source_doc.get('yieldUnit', 'kg'),
            'harvestFrequency': None,
            'wastagePercent': 10.0
        },

        # Environmental requirements (REQUIRED nested object)
        'environmentalRequirements': {
            'minTemperatureCelsius': float(source_doc.get('minTemperatureCelsius') or 15.0),
            'maxTemperatureCelsius': float(source_doc.get('maxTemperatureCelsius') or 35.0),
            'optimalTemperatureMin': float(source_doc.get('minTemperatureCelsius') or 15.0) + 3.0,
            'optimalTemperatureMax': float(source_doc.get('maxTemperatureCelsius') or 35.0) - 3.0,
            'humidityMin': 40,
            'humidityMax': 80,
            'altitudeToleranceMeters': None
        },

        # Watering requirements (REQUIRED nested object)
        'wateringRequirements': {
            'frequencyDays': int(source_doc.get('wateringFrequencyDays') or 2),
            'amountLitersPerPlant': 2.0,
            'preferredWaterType': 'tap',
            'notes': None
        },

        # Soil requirements (REQUIRED nested object)
        'soilRequirements': {
            'preferredSoilType': 'loamy',
            'phMin': float(source_doc.get('optimalPHMin') or 6.0),
            'phMax': float(source_doc.get('optimalPHMax') or 7.5),
            'drainageRequirement': 'medium',
            'organicMatterContent': None
        },

        # Light requirements (REQUIRED nested object)
        'lightRequirements': {
            'lightType': 'full_sun',
            'minHoursDaily': min_light,
            'maxHoursDaily': max_light,
            'optimalHoursDaily': optimal_light,
            'intensityLux': None,
            'intensityPpfd': None,
            'photoperiodSensitive': False,
            'notes': None
        },

        # Economics and labor (REQUIRED nested object)
        'economicsAndLabor': {
            'averageMarketValuePerKg': None,
            'currency': 'USD',
            'totalManHoursPerPlant': 1.0,
            'plantingHours': None,
            'maintenanceHours': None,
            'harvestingHours': None,
            'notes': None
        },

        # Additional information (REQUIRED nested object)
        'additionalInfo': {
            'growthHabit': GROWTH_HABIT_MAP.get(plant_type, GROWTH_HABIT_MAP['default']),
            'spacing': {
                'betweenPlantsCm': between_plants,
                'betweenRowsCm': between_rows,
                'plantsPerSquareMeter': None
            },
            'supportRequirements': 'none',
            'companionPlants': None,
            'incompatiblePlants': None,
            'notes': source_doc.get('notes', '')
        },

        # Farm type compatibility
        'farmTypeCompatibility': ['open_field'],

        # Empty arrays for diseases, pests, and grading
        'diseasesAndPests': [],
        'gradingStandards': [],

        # Tags
        'tags': source_doc.get('tags', []),

        # Audit fields
        'createdBy': source_doc.get('createdBy'),
        'createdByEmail': source_doc.get('createdByEmail'),
        'createdAt': source_doc.get('createdAt', datetime.utcnow()),
        'updatedAt': datetime.utcnow(),

        # Migration metadata
        '_migrated': True,
        '_sourceCollection': 'plant_data',
        '_migratedAt': datetime.utcnow(),
        '_oldFertilizerData': source_doc.get('_oldFertilizerData')
    }

    return enhanced_doc


async def migrate_plant_data(dry_run: bool = False):
    """
    Main migration function.

    Args:
        dry_run: If True, don't actually insert records, just print what would happen
    """
    print("=" * 70)
    print("Plant Data to Enhanced Migration Script")
    print("=" * 70)
    print(f"Mode: {'DRY RUN (no changes will be made)' if dry_run else 'LIVE (will modify database)'}")
    print()

    # Connect to MongoDB
    print(f"Connecting to MongoDB: {MONGO_URL}")
    client = AsyncIOMotorClient(MONGO_URL)
    db = client.get_default_database()

    # Collections
    source_collection = db['plant_data']
    target_collection = db['plant_data_enhanced']

    try:
        # Count source records
        source_count = await source_collection.count_documents({})
        print(f"Found {source_count} records in plant_data collection")

        # Count existing target records
        target_count = await target_collection.count_documents({})
        print(f"Found {target_count} existing records in plant_data_enhanced collection")
        print()

        if source_count == 0:
            print("⚠️  No records found in plant_data collection. Nothing to migrate.")
            return

        # Fetch all source records
        print("Fetching source records...")
        source_records = await source_collection.find({}).to_list(length=None)

        # Migration counters
        migrated_count = 0
        skipped_count = 0
        error_count = 0

        print(f"\nProcessing {len(source_records)} records...")
        print("-" * 70)

        for idx, source_doc in enumerate(source_records, 1):
            plant_name = source_doc.get('plantName', 'Unknown')

            try:
                # Check if already migrated (by plantName)
                existing = await target_collection.find_one({'plantName': plant_name})

                if existing:
                    print(f"[{idx}/{len(source_records)}] ⏭️  SKIP: '{plant_name}' already exists in target")
                    skipped_count += 1
                    continue

                # Transform the document
                enhanced_doc = transform_to_enhanced(source_doc)

                if dry_run:
                    print(f"[{idx}/{len(source_records)}] 🔍 DRY RUN: Would migrate '{plant_name}'")
                    print(f"    Growth cycle: {enhanced_doc['growthCycle']['totalCycleDays']} days")
                    print(f"    Yield: {enhanced_doc['yieldInfo']['expectedYieldPerPlant']} {enhanced_doc['yieldInfo']['yieldUnit']}")
                    print(f"    Spacing: {enhanced_doc['additionalInfo']['spacing']['betweenPlantsCm']}cm")
                else:
                    # Insert into target collection
                    result = await target_collection.insert_one(enhanced_doc)
                    print(f"[{idx}/{len(source_records)}] ✅ MIGRATED: '{plant_name}' (ID: {result.inserted_id})")

                migrated_count += 1

            except Exception as e:
                print(f"[{idx}/{len(source_records)}] ❌ ERROR: Failed to migrate '{plant_name}': {e}")
                error_count += 1
                continue

        # Summary
        print()
        print("=" * 70)
        print("Migration Summary")
        print("=" * 70)
        print(f"Total source records:     {source_count}")
        print(f"Successfully migrated:    {migrated_count}")
        print(f"Skipped (already exist):  {skipped_count}")
        print(f"Errors:                   {error_count}")
        print()

        if not dry_run:
            final_count = await target_collection.count_documents({})
            print(f"Total records in plant_data_enhanced: {final_count}")
            print()
            print("✅ Migration completed successfully!")
        else:
            print("🔍 DRY RUN completed. No changes were made to the database.")
            print("   Run without --dry-run flag to perform actual migration.")

    except Exception as e:
        print(f"\n❌ Migration failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    finally:
        client.close()
        print("\nDatabase connection closed.")


if __name__ == '__main__':
    # Check for dry-run flag
    dry_run_mode = '--dry-run' in sys.argv

    # Run migration
    asyncio.run(migrate_plant_data(dry_run=dry_run_mode))
