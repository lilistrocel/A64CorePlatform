"""
Migration Script: Convert Old Plant Data to Enhanced Schema

Migrates plant_data entries from simple growthCycleDays to detailed
GrowthCycleDuration object with phase breakdowns.
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from uuid import UUID

# Database connection
MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "a64core_db"


async def migrate_plant_data():
    """Migrate plant data from old schema to enhanced schema"""

    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    plant_collection = db.plant_data

    print("=" * 60)
    print("Plant Data Migration: Old Schema -> Enhanced Schema")
    print("=" * 60)

    # Find all plant data WITHOUT growthCycle object
    old_schema_plants = await plant_collection.find(
        {"growthCycle": {"$exists": False}}
    ).to_list(length=None)

    print(f"\nFound {len(old_schema_plants)} plants using old schema")

    if not old_schema_plants:
        print("\n[OK] No plants to migrate - all data already uses enhanced schema")
        return

    migrated_count = 0
    error_count = 0

    for plant in old_schema_plants:
        plant_name = plant.get("plantName", "Unknown")
        total_days = plant.get("growthCycleDays", 0)

        print(f"\nMigrating: {plant_name} ({total_days} days total)")

        try:
            # Convert simple total days to phase breakdown
            growth_cycle = calculate_growth_phases(
                total_days=total_days,
                plant_type=plant.get("plantType", "Crop"),
                plant_name=plant_name
            )

            # Update document with new growthCycle object
            result = await plant_collection.update_one(
                {"_id": plant["_id"]},
                {
                    "$set": {
                        "growthCycle": growth_cycle,
                        "updatedAt": datetime.utcnow()
                    }
                }
            )

            if result.modified_count > 0:
                print(f"   [OK] Migrated successfully")
                print(f"      Phases: {growth_cycle}")
                migrated_count += 1
            else:
                print(f"   [SKIP] No changes made (already migrated?)")

        except Exception as e:
            print(f"   [ERROR] {str(e)}")
            error_count += 1

    print("\n" + "=" * 60)
    print(f"Migration Complete!")
    print(f"  Successfully migrated: {migrated_count}")
    print(f"  Errors: {error_count}")
    print("=" * 60)

    client.close()


def calculate_growth_phases(total_days: int, plant_type: str, plant_name: str) -> dict:
    """
    Calculate growth phase breakdown from total cycle days

    Uses intelligent heuristics based on plant type and total duration
    """

    # Default phase percentages by plant type
    # Format: (germination%, vegetative%, flowering%, fruiting%, harvest%)
    PHASE_RATIOS = {
        "Vegetable": (0.10, 0.40, 0.20, 0.20, 0.10),  # Tomatoes, peppers
        "Crop": (0.10, 0.40, 0.20, 0.20, 0.10),       # General crops
        "Leafy Green": (0.15, 0.75, 0, 0, 0.10),      # Lettuce, spinach (no flowering/fruiting)
        "Herb": (0.15, 0.55, 0.20, 0, 0.10),          # Basil, parsley
        "Fruit": (0.05, 0.30, 0.25, 0.30, 0.10),      # Berries, melons
        "Tree": (0.10, 0.60, 0.15, 0.15, 0),          # Fruit trees
        "Root Vegetable": (0.10, 0.80, 0, 0, 0.10),   # Carrots, radishes
    }

    # Detect leafy greens by name
    leafy_greens = ["lettuce", "spinach", "kale", "chard", "arugula", "cabbage"]
    is_leafy = any(green in plant_name.lower() for green in leafy_greens)

    # Select appropriate ratios
    if is_leafy:
        ratios = PHASE_RATIOS["Leafy Green"]
    else:
        ratios = PHASE_RATIOS.get(plant_type, PHASE_RATIOS["Crop"])

    # Calculate days for each phase
    germination_days = max(1, int(total_days * ratios[0]))
    vegetative_days = max(1, int(total_days * ratios[1]))
    flowering_days = int(total_days * ratios[2])  # Can be 0
    fruiting_days = int(total_days * ratios[3])   # Can be 0
    harvest_duration_days = max(1, int(total_days * ratios[4]))

    # Adjust to match total (handle rounding)
    calculated_total = (
        germination_days + vegetative_days +
        flowering_days + fruiting_days + harvest_duration_days
    )

    if calculated_total != total_days:
        # Add/subtract difference to vegetative phase (largest phase)
        vegetative_days += (total_days - calculated_total)
        vegetative_days = max(1, vegetative_days)  # Ensure at least 1 day

    return {
        "germinationDays": germination_days,
        "vegetativeDays": vegetative_days,
        "floweringDays": flowering_days,
        "fruitingDays": fruiting_days,
        "harvestDurationDays": harvest_duration_days,
        "totalCycleDays": total_days
    }


if __name__ == "__main__":
    asyncio.run(migrate_plant_data())
