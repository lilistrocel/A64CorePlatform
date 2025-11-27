#!/usr/bin/env python3
"""
Add spacingCategory field to all existing plant data

This migration adds the spacingCategory field to plant_data and plant_data_enhanced
collections. The spacing category determines plant density (plants per 100 m²) for
automatic plant count calculations.

Spacing Categories:
- xs: Extra Small (~20cm x 20cm) - microgreens, herbs
- s: Small (~25cm x 25cm) - lettuce, spinach, leafy greens
- m: Medium (~50cm x 50cm) - peppers, beans
- l: Large (~60cm x 90cm) - tomatoes, eggplant
- xl: Extra Large (~100cm x 100cm) - squash, melons
- bush: Bush (~140cm x 140cm) - blueberries
- large_bush: Large Bush (~200cm x 200cm) - larger bushes
- small_tree: Small Tree (~250cm x 250cm) - citrus, dwarf fruit
- medium_tree: Medium Tree (~300cm x 300cm) - apple, mango
- large_tree: Large Tree (~500cm x 500cm) - date palm, coconut

Run this script once to update the database schema.
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from datetime import datetime


# Mapping of plant names/types to suggested spacing categories
SPACING_CATEGORY_MAPPINGS = {
    # Trees
    "date palm": "large_tree",
    "palm": "large_tree",
    "coconut": "large_tree",
    "mango": "medium_tree",
    "apple": "medium_tree",
    "avocado": "medium_tree",
    "papaya": "medium_tree",
    "banana": "medium_tree",
    "guava": "medium_tree",
    "pomegranate": "small_tree",
    "citrus": "small_tree",
    "lemon": "small_tree",
    "lime": "small_tree",
    "orange": "small_tree",
    "grape": "small_tree",
    "fig": "small_tree",
    "olive": "medium_tree",
    "moringa": "medium_tree",
    "neem": "large_tree",

    # Bushes
    "blueberry": "bush",
    "raspberry": "bush",
    "blackberry": "bush",
    "strawberry": "s",
    "berry": "bush",

    # Vegetables - Large
    "tomato": "l",
    "eggplant": "l",
    "pepper": "m",
    "chili": "m",
    "capsicum": "m",
    "cucumber": "l",
    "zucchini": "xl",
    "squash": "xl",
    "pumpkin": "xl",
    "melon": "xl",
    "watermelon": "xl",
    "cantaloupe": "xl",
    "gourd": "xl",
    "okra": "m",
    "broccoli": "m",
    "cauliflower": "m",
    "cabbage": "m",
    "kale": "s",
    "kohlrabi": "m",
    "brussels": "m",

    # Vegetables - Medium
    "bean": "m",
    "pea": "s",
    "corn": "m",
    "maize": "m",

    # Vegetables - Small (leafy greens)
    "lettuce": "s",
    "spinach": "s",
    "arugula": "s",
    "rocket": "s",
    "chard": "s",
    "collard": "s",
    "endive": "s",
    "chicory": "s",
    "celery": "m",

    # Herbs
    "basil": "xs",
    "mint": "xs",
    "parsley": "xs",
    "cilantro": "xs",
    "coriander": "xs",
    "dill": "xs",
    "oregano": "xs",
    "thyme": "xs",
    "rosemary": "s",
    "sage": "s",
    "lavender": "s",
    "chive": "xs",
    "tarragon": "xs",

    # Root vegetables
    "carrot": "s",
    "radish": "xs",
    "beet": "s",
    "turnip": "s",
    "potato": "m",
    "sweet potato": "m",
    "onion": "s",
    "garlic": "xs",
    "leek": "s",
    "shallot": "s",
    "ginger": "s",
    "turmeric": "s",

    # Microgreens
    "microgreen": "xs",
    "sprout": "xs",

    # Default based on plant type
    "tree": "medium_tree",
    "herb": "xs",
    "vegetable": "m",
    "fruit": "l",
    "crop": "m",
}


def suggest_spacing_category(plant):
    """
    Suggest a spacing category based on plant name and type.
    Returns None if no suggestion can be made.
    """
    plant_name = plant.get("plantName", "").lower()
    scientific_name = plant.get("scientificName", "").lower()
    plant_type = plant.get("plantType", "").lower()

    # Check plant name matches
    for keyword, category in SPACING_CATEGORY_MAPPINGS.items():
        if keyword in plant_name or keyword in scientific_name:
            return category

    # Fall back to plant type
    if plant_type in SPACING_CATEGORY_MAPPINGS:
        return SPACING_CATEGORY_MAPPINGS[plant_type]

    # Check if spacing info exists in additionalInfo
    additional_info = plant.get("additionalInfo", {})
    spacing_between_plants = additional_info.get("spacingBetweenPlantsCm")
    spacing_between_rows = additional_info.get("spacingBetweenRowsCm")

    if spacing_between_plants:
        avg_spacing = spacing_between_plants
        if spacing_between_rows:
            avg_spacing = (spacing_between_plants + spacing_between_rows) / 2

        # Map spacing to category
        if avg_spacing <= 20:
            return "xs"
        elif avg_spacing <= 30:
            return "s"
        elif avg_spacing <= 60:
            return "m"
        elif avg_spacing <= 100:
            return "l"
        elif avg_spacing <= 150:
            return "xl"
        elif avg_spacing <= 200:
            return "bush"
        elif avg_spacing <= 250:
            return "large_bush"
        elif avg_spacing <= 300:
            return "small_tree"
        elif avg_spacing <= 400:
            return "medium_tree"
        else:
            return "large_tree"

    # No suggestion available
    return None


async def add_spacing_category():
    """Add spacingCategory field to all plant data documents"""

    # MongoDB connection
    mongo_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    database_name = os.getenv("DATABASE_NAME", "a64core_db")

    print(f"Connecting to MongoDB: {mongo_uri}")
    client = AsyncIOMotorClient(mongo_uri)
    db = client[database_name]

    print(f"Database: {database_name}")
    print("=" * 60)

    stats = {
        "plant_data_updated": 0,
        "plant_data_enhanced_updated": 0,
        "skipped_already_has": 0,
        "no_suggestion": 0,
        "categories_assigned": {}
    }

    # ============================================================
    # 1. Update plant_data collection
    # ============================================================
    print("\n[1/2] Updating plant_data collection...")

    if "plant_data" in await db.list_collection_names():
        plant_data_collection = db.plant_data
        total = await plant_data_collection.count_documents({})
        print(f"[OK] Found {total} plant_data documents")

        cursor = plant_data_collection.find({"spacingCategory": {"$exists": False}})
        async for plant in cursor:
            category = suggest_spacing_category(plant)
            if category:
                await plant_data_collection.update_one(
                    {"_id": plant["_id"]},
                    {
                        "$set": {
                            "spacingCategory": category,
                            "updatedAt": datetime.utcnow()
                        }
                    }
                )
                stats["plant_data_updated"] += 1
                stats["categories_assigned"][category] = stats["categories_assigned"].get(category, 0) + 1
                print(f"     Updated: {plant.get('name', 'N/A')} -> {category}")
            else:
                stats["no_suggestion"] += 1
                print(f"     [SKIP] {plant.get('name', 'N/A')} - no suggestion available")

        already_has = await plant_data_collection.count_documents({"spacingCategory": {"$exists": True}}) - stats["plant_data_updated"]
        if already_has > 0:
            stats["skipped_already_has"] += already_has
            print(f"     Skipped {already_has} documents that already have spacingCategory")
    else:
        print("[WARN] plant_data collection doesn't exist")

    # ============================================================
    # 2. Update plant_data_enhanced collection
    # ============================================================
    print("\n[2/2] Updating plant_data_enhanced collection...")

    if "plant_data_enhanced" in await db.list_collection_names():
        enhanced_collection = db.plant_data_enhanced
        total = await enhanced_collection.count_documents({})
        print(f"[OK] Found {total} plant_data_enhanced documents")

        cursor = enhanced_collection.find({"spacingCategory": {"$exists": False}})
        async for plant in cursor:
            category = suggest_spacing_category(plant)
            if category:
                await enhanced_collection.update_one(
                    {"_id": plant["_id"]},
                    {
                        "$set": {
                            "spacingCategory": category,
                            "updatedAt": datetime.utcnow()
                        }
                    }
                )
                stats["plant_data_enhanced_updated"] += 1
                stats["categories_assigned"][category] = stats["categories_assigned"].get(category, 0) + 1
                print(f"     Updated: {plant.get('plantName', 'N/A')} -> {category}")
            else:
                stats["no_suggestion"] += 1
                print(f"     [SKIP] {plant.get('plantName', 'N/A')} - no suggestion available")

        already_has = await enhanced_collection.count_documents({"spacingCategory": {"$exists": True}}) - stats["plant_data_enhanced_updated"]
        if already_has > 0:
            stats["skipped_already_has"] += already_has
            print(f"     Skipped {already_has} documents that already have spacingCategory")
    else:
        print("[WARN] plant_data_enhanced collection doesn't exist")

    # ============================================================
    # Summary
    # ============================================================
    print("\n" + "=" * 60)
    print("[SUCCESS] Spacing category migration completed!")
    print("=" * 60)
    print(f"\nStatistics:")
    print(f"  - plant_data updated: {stats['plant_data_updated']}")
    print(f"  - plant_data_enhanced updated: {stats['plant_data_enhanced_updated']}")
    print(f"  - Already had spacingCategory: {stats['skipped_already_has']}")
    print(f"  - No suggestion available: {stats['no_suggestion']}")

    if stats["categories_assigned"]:
        print(f"\nCategories assigned:")
        for category, count in sorted(stats["categories_assigned"].items()):
            print(f"  - {category}: {count}")

    print("\nNext steps:")
    print("  -> Review plants without spacingCategory and update manually")
    print("  -> Use the Standards Config page to adjust category densities")
    print("  -> Test auto-calculation in PlantAssignmentModal")

    # List plants without spacingCategory
    print("\n" + "=" * 60)
    print("Plants WITHOUT spacingCategory (manual update needed):")
    print("=" * 60)

    if "plant_data_enhanced" in await db.list_collection_names():
        missing = await db.plant_data_enhanced.find(
            {"spacingCategory": {"$exists": False}},
            {"plantName": 1, "plantType": 1}
        ).to_list(length=100)

        if missing:
            print(f"\nFound {len(missing)} plants without spacing category:")
            for plant in missing:
                print(f"  - {plant.get('plantName', 'N/A')} ({plant.get('plantType', 'N/A')})")
        else:
            print("\n[OK] All plants have spacingCategory assigned!")

    # Close connection
    client.close()
    print("\n[OK] Database connection closed")


if __name__ == "__main__":
    print("=" * 60)
    print("Spacing Category - Database Migration")
    print("=" * 60)
    asyncio.run(add_spacing_category())
