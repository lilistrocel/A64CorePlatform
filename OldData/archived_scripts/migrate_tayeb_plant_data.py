"""
Tayeb Plant Data Migration Script

Migrates plant data from Tayeb's standard_planning.json to the PlantDataEnhanced collection.

Usage:
    python scripts/migrations/migrate_tayeb_plant_data.py --dry-run
    python scripts/migrations/migrate_tayeb_plant_data.py --execute

Features:
- Names plants as "{PlantName}-Tayeb" format
- Sets contributor="Tayeb" and targetRegion="UAE"
- Transforms day-by-day fertilizer schedules to stage-based format
- Handles duplicates by skipping if plant already exists
"""

import json
import os
import sys
import argparse
from datetime import datetime
from uuid import uuid4
from typing import Dict, List, Any, Optional

# Add project root to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# MongoDB connection settings
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "a64core_db")
COLLECTION_NAME = "plant_data_enhanced"

# Source file path
SOURCE_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "OldData", "json_exports", "standard_planning.json"
)

# Default system user for migration
SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000"
SYSTEM_USER_EMAIL = "system@a64platform.com"


def determine_growth_stage(day: int, sowing_days: int, total_days: int) -> str:
    """Determine growth stage based on day number."""
    if day <= 14:
        return "germination"
    elif day <= sowing_days:
        return "vegetative"
    elif day <= sowing_days + 30:
        return "flowering"
    elif day <= total_days - 30:
        return "fruiting"
    else:
        return "harvest"


def transform_fertilizer_schedule(
    planning_data: Dict[str, Any],
    sowing_days: int,
    total_days: int
) -> List[Dict[str, Any]]:
    """
    Transform day-by-day fertilizer data to stage-based schedule.

    Groups applications by growth stage and fertilizer type.
    """
    if not planning_data or "Day" not in planning_data:
        return []

    days = planning_data["Day"]
    fertilizers_by_stage: Dict[str, Dict[str, List[float]]] = {}

    # Get all fertilizer types (exclude 'Day' key)
    fertilizer_types = [k for k in planning_data.keys() if k != "Day"]

    for i, day in enumerate(days):
        stage = determine_growth_stage(day, sowing_days, total_days)

        if stage not in fertilizers_by_stage:
            fertilizers_by_stage[stage] = {}

        for fert_type in fertilizer_types:
            values = planning_data.get(fert_type, [])
            if i < len(values) and values[i] > 0:
                if fert_type not in fertilizers_by_stage[stage]:
                    fertilizers_by_stage[stage][fert_type] = []
                fertilizers_by_stage[stage][fert_type].append(values[i])

    # Create schedule entries
    schedule = []
    stage_order = ["germination", "vegetative", "flowering", "fruiting", "harvest"]

    for stage in stage_order:
        if stage in fertilizers_by_stage:
            for fert_type, values in fertilizers_by_stage[stage].items():
                if values:
                    avg_quantity = sum(values) / len(values)
                    total_quantity = sum(values)

                    # Determine NPK ratio if applicable
                    npk_ratio = None
                    if "." in fert_type:
                        # Formats like "28.14.14", "20.20.20", "0.0.60"
                        parts = fert_type.split(".")
                        if len(parts) == 3:
                            npk_ratio = f"{parts[0]}-{parts[1]}-{parts[2]}"

                    schedule.append({
                        "stage": stage,
                        "fertilizerType": fert_type,
                        "quantityPerPlant": round(avg_quantity, 3),
                        "quantityUnit": "grams",
                        "frequencyDays": 7,  # Weekly schedule based on source data
                        "npkRatio": npk_ratio,
                        "notes": f"Total for stage: {round(total_quantity, 2)}g, {len(values)} applications"
                    })

    return schedule


def determine_spacing_category(plant_name: str, seeds_per_drip: int) -> str:
    """Determine spacing category based on plant type and seeding."""
    plant_lower = plant_name.lower()

    # Trees
    if any(x in plant_lower for x in ["date", "palm", "coconut"]):
        return "large_tree"
    if any(x in plant_lower for x in ["mango", "avocado", "apple", "orange", "lemon"]):
        return "medium_tree"
    if any(x in plant_lower for x in ["citrus", "lemon", "lime", "grapefruit"]):
        return "small_tree"

    # Bushes
    if any(x in plant_lower for x in ["blueberry", "raspberry"]):
        return "bush"

    # Large plants
    if any(x in plant_lower for x in ["squash", "melon", "watermelon", "pumpkin", "cucumber"]):
        return "xl"

    # Medium-Large plants
    if any(x in plant_lower for x in ["tomato", "eggplant", "aubergine"]):
        return "l"

    # Medium plants (peppers, beans, etc.)
    if any(x in plant_lower for x in ["pepper", "chili", "habanero", "jalapeno", "capsicum", "bean"]):
        return "m"

    # Small plants
    if any(x in plant_lower for x in ["lettuce", "spinach", "chard", "kale", "arugula"]):
        return "s"

    # Extra small
    if any(x in plant_lower for x in ["microgreen", "herb", "basil", "cilantro", "parsley", "mint"]):
        return "xs"

    # Default to medium
    return "m"


def transform_plant_data(source: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Transform a single plant entry from source format to PlantDataEnhanced format."""
    plant_name = source.get("Item", "").strip()

    # Skip empty entries
    if not plant_name or plant_name.lower() == "empty":
        return None

    # Extract values with defaults
    sowing_days = int(source.get("SowingDurationday", 60) or 60)
    harvest_days = int(source.get("HarvestDurationday", 30) or 30)
    total_days = int(source.get("TotalDurationday", 90) or 90)
    cleaning_days = int(source.get("Cleaningday", 0) or 0)
    net_yield = float(source.get("NetYieldPerDripkg", 1.0) or 1.0)
    products_per_drip = float(source.get("ProductsPerDripkg", 1.0) or 1.0)
    seeds_per_drip = int(source.get("seedsPerDrip", 1) or 1)
    pollination_loss = float(source.get("PollinationLosspercent", 0) or 0)
    seeding_type = source.get("SeedingType", "Seed")

    # Calculate growth cycle breakdown
    # Assume germination is ~10% of sowing, vegetative is rest of sowing
    germination_days = min(14, int(sowing_days * 0.15))
    vegetative_days = sowing_days - germination_days

    # Flowering and fruiting from the growing period
    growing_period = total_days - sowing_days - harvest_days
    flowering_days = int(growing_period * 0.4) if growing_period > 0 else 0
    fruiting_days = growing_period - flowering_days if growing_period > 0 else 0

    # Transform fertilizer schedule
    fertilizer_schedule = transform_fertilizer_schedule(
        source.get("PlanningFertilizer", {}),
        sowing_days,
        total_days
    )

    # Determine spacing category
    spacing_category = determine_spacing_category(plant_name, seeds_per_drip)

    # Create the enhanced plant data document
    plant_id = str(uuid4())
    now = datetime.utcnow()

    return {
        "plantDataId": plant_id,
        "plantName": f"{plant_name}-Tayeb",
        "scientificName": None,  # Not available in source - use None to avoid unique index conflict
        "farmTypeCompatibility": ["open_field"],  # Default for UAE outdoor farming

        # Growth Cycle
        "growthCycle": {
            "germinationDays": germination_days,
            "vegetativeDays": vegetative_days,
            "floweringDays": flowering_days,
            "fruitingDays": fruiting_days,
            "harvestDurationDays": harvest_days,
            "totalCycleDays": total_days
        },

        # Yield Info
        "yieldInfo": {
            "yieldPerPlant": net_yield,
            "yieldUnit": "kg",
            "expectedWastePercentage": pollination_loss
        },

        # Fertilizer Schedule (transformed)
        "fertilizerSchedule": fertilizer_schedule,

        # Pesticide Schedule (empty - not in source)
        "pesticideSchedule": [],

        # Environmental Requirements (UAE defaults)
        "environmentalRequirements": {
            "temperature": {
                "minCelsius": 15.0,
                "maxCelsius": 40.0,
                "optimalCelsius": 28.0
            },
            "humidity": {
                "minPercentage": 30.0,
                "maxPercentage": 70.0,
                "optimalPercentage": 50.0
            }
        },

        # Watering Requirements (defaults)
        "wateringRequirements": {
            "frequencyDays": 1,  # Daily in UAE climate
            "waterType": "filtered",
            "amountPerPlantLiters": 2.0,
            "droughtTolerance": "low"
        },

        # Soil Requirements (defaults)
        "soilRequirements": {
            "phRequirements": {
                "minPH": 6.0,
                "maxPH": 7.5,
                "optimalPH": 6.5
            },
            "soilTypes": ["loamy", "sandy"]
        },

        # Diseases and Pests (empty - not in source)
        "diseasesAndPests": [],

        # Light Requirements (UAE defaults)
        "lightRequirements": {
            "lightType": "full_sun",
            "minHoursDaily": 6.0,
            "maxHoursDaily": 12.0,
            "optimalHoursDaily": 8.0,
            "photoperiodSensitive": False
        },

        # Grading Standards (empty)
        "gradingStandards": [],

        # Economics and Labor (from source)
        "economicsAndLabor": {
            "currency": "AED",
            "totalManHoursPerPlant": 1.0
        },

        # Additional Information
        "additionalInfo": {
            "growthHabit": "determinate" if seeding_type == "Transplant" else "indeterminate",
            "spacing": {
                "betweenPlantsCm": 50.0,  # Default
                "betweenRowsCm": 75.0     # Default
            },
            "supportRequirements": "none",
            "notes": f"Seeding type: {seeding_type}, Seeds per drip: {seeds_per_drip}, "
                    f"Products per drip: {products_per_drip}kg, "
                    f"Cleaning days: {cleaning_days}"
        },

        # Spacing Category
        "spacingCategory": spacing_category,

        # Data Attribution (NEW FIELDS)
        "contributor": "Tayeb",
        "targetRegion": "UAE",

        # Tags
        "tags": ["tayeb", "uae", "open-field"],

        # Versioning and Audit
        "dataVersion": 1,
        "createdBy": SYSTEM_USER_ID,
        "createdByEmail": SYSTEM_USER_EMAIL,
        "createdAt": now,
        "updatedAt": now,
        "deletedAt": None
    }


def load_source_data() -> List[Dict[str, Any]]:
    """Load plant data from source JSON file."""
    if not os.path.exists(SOURCE_FILE):
        raise FileNotFoundError(f"Source file not found: {SOURCE_FILE}")

    with open(SOURCE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def migrate_to_mongodb(
    plants: List[Dict[str, Any]],
    dry_run: bool = True,
    mongodb_uri: str = MONGODB_URI,
    database_name: str = DATABASE_NAME
):
    """Migrate transformed plant data to MongoDB."""
    from pymongo import MongoClient

    client = MongoClient(mongodb_uri)
    db = client[database_name]
    collection = db[COLLECTION_NAME]

    inserted_count = 0
    skipped_count = 0
    errors = []

    for plant in plants:
        plant_name = plant["plantName"]

        # Check for existing plant with same name
        existing = collection.find_one({"plantName": plant_name})
        if existing:
            print(f"  SKIP: '{plant_name}' already exists")
            skipped_count += 1
            continue

        if dry_run:
            print(f"  [DRY-RUN] Would insert: '{plant_name}'")
            inserted_count += 1
        else:
            try:
                result = collection.insert_one(plant)
                print(f"  INSERT: '{plant_name}' (ID: {result.inserted_id})")
                inserted_count += 1
            except Exception as e:
                print(f"  ERROR: Failed to insert '{plant_name}': {e}")
                errors.append({"plant": plant_name, "error": str(e)})

    client.close()

    return {
        "inserted": inserted_count,
        "skipped": skipped_count,
        "errors": errors
    }


def main():
    parser = argparse.ArgumentParser(description="Migrate Tayeb plant data to PlantDataEnhanced")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without writing to database")
    parser.add_argument("--execute", action="store_true", help="Execute the migration")
    parser.add_argument("--mongodb-uri", default=None, help="MongoDB connection URI")
    parser.add_argument("--database", default=None, help="Database name")
    args = parser.parse_args()

    if not args.dry_run and not args.execute:
        print("Please specify either --dry-run or --execute")
        print("  --dry-run  : Preview changes without writing")
        print("  --execute  : Execute the actual migration")
        sys.exit(1)

    # Use provided values or defaults
    mongodb_uri = args.mongodb_uri or MONGODB_URI
    database_name = args.database or DATABASE_NAME

    print("=" * 60)
    print("Tayeb Plant Data Migration")
    print("=" * 60)
    print(f"Source: {SOURCE_FILE}")
    print(f"Target: {mongodb_uri}/{database_name}.{COLLECTION_NAME}")
    print(f"Mode: {'DRY-RUN (no changes)' if args.dry_run else 'EXECUTE (will write)'}")
    print()

    # Load source data
    print("Loading source data...")
    source_data = load_source_data()
    print(f"  Found {len(source_data)} entries in source file")

    # Transform data
    print("\nTransforming plant data...")
    transformed_plants = []
    for entry in source_data:
        plant = transform_plant_data(entry)
        if plant:
            transformed_plants.append(plant)

    print(f"  Transformed {len(transformed_plants)} plants (excluding empty entries)")

    # Show sample of transformed data
    if transformed_plants:
        print("\nSample transformed plant:")
        sample = transformed_plants[0]
        print(f"  Name: {sample['plantName']}")
        print(f"  Contributor: {sample['contributor']}")
        print(f"  Target Region: {sample['targetRegion']}")
        print(f"  Growth Cycle: {sample['growthCycle']['totalCycleDays']} days")
        print(f"  Yield: {sample['yieldInfo']['yieldPerPlant']} {sample['yieldInfo']['yieldUnit']}")
        print(f"  Fertilizer entries: {len(sample['fertilizerSchedule'])}")
        print(f"  Spacing Category: {sample['spacingCategory']}")

    # Migrate to MongoDB
    print("\nMigrating to MongoDB...")
    result = migrate_to_mongodb(
        transformed_plants,
        dry_run=args.dry_run,
        mongodb_uri=mongodb_uri,
        database_name=database_name
    )

    # Summary
    print("\n" + "=" * 60)
    print("Migration Summary")
    print("=" * 60)
    print(f"  Plants processed: {len(transformed_plants)}")
    print(f"  Inserted: {result['inserted']}")
    print(f"  Skipped (duplicates): {result['skipped']}")
    print(f"  Errors: {len(result['errors'])}")

    if result['errors']:
        print("\nErrors:")
        for err in result['errors']:
            print(f"  - {err['plant']}: {err['error']}")

    if args.dry_run:
        print("\n[DRY-RUN MODE] No changes were made to the database.")
        print("Run with --execute to perform actual migration.")


if __name__ == "__main__":
    main()
