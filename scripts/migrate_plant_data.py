"""
Migration Script: standard_planning (SQL) → plant_data (MongoDB)

Migrates the 56 crop records from the old system's standard_planning table
into the new plant_data collection.

Key conversion:
- NetYieldPerDripkg / seedsPerDrip → expectedYieldPerPlant
- seedsPerDrip → seedsPerPlantingPoint
- Preserves old ref UUIDs as plantDataId

Usage:
    python scripts/migrate_plant_data.py [--dry-run]
"""

import re
import sys
import json
from datetime import datetime, timezone
from pymongo import MongoClient

# --- Configuration ---
MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "a64core_db"
COLLECTION = "plant_data"
SQL_FILE = "OldData/220126/standard_planning_rows.sql"

# Admin user for createdBy attribution
ADMIN_USER_ID = "bff26b8f-5ce9-49b2-9126-86174eaea823"
ADMIN_EMAIL = "admin@a64platform.com"

# Column order in SQL INSERT:
# 0: __id__, 1: Cleaningday, 2: DaysOfFertilize, 3: HarvestDurationday,
# 4: Item, 5: NetYieldPerDripkg, 6: PlanningFertilizer, 7: PollinationLosspercent,
# 8: ProcessedFertilizerData, 9: ProductsPerDripkg, 10: SeedingType,
# 11: SowingDurationday, 12: TotalDurationday, 13: harvestInterval,
# 14: img, 15: seedsPerDrip, 16: ref


def parse_sql_rows(filepath: str) -> list[dict]:
    """Parse standard_planning SQL INSERT into structured rows."""
    with open(filepath, "r") as f:
        content = f.read()

    # Find the VALUES section
    values_start = content.find("VALUES")
    if values_start == -1:
        raise ValueError("No VALUES clause found in SQL file")

    values_str = content[values_start + 6:]
    rows = []
    i = 0

    while i < len(values_str):
        if values_str[i] == "(":
            # Find matching closing paren, accounting for nested parens in JSON
            depth = 0
            j = i
            while j < len(values_str):
                if values_str[j] == "(":
                    depth += 1
                elif values_str[j] == ")":
                    depth -= 1
                    if depth == 0:
                        row_str = values_str[i + 1:j]  # Content between parens
                        rows.append(row_str)
                        i = j + 1
                        break
                j += 1
            else:
                break
        i += 1

    return [parse_row_values(r) for r in rows]


def parse_row_values(row_str: str) -> dict:
    """Parse a single SQL row string into a dict with named fields."""
    # Strategy: extract the non-JSON fields by finding known patterns
    # The JSON fields (PlanningFertilizer, ProcessedFertilizerData) make
    # simple comma-splitting impossible, so we parse around them.

    # Extract the ref UUID (always last field before closing)
    ref_match = re.search(
        r"'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'[^']*$",
        row_str
    )
    ref_uuid = ref_match.group(1) if ref_match else None

    # Extract fields before the first JSON blob
    # Pattern: __id__, Cleaningday, DaysOfFertilize, HarvestDurationday, Item, NetYieldPerDripkg
    pre_json = re.match(
        r"(null|'[^']*'),\s*'(\d+)',\s*'(\d+)',\s*'(\d+)',\s*'([^']+)',\s*'([\d.]+)'",
        row_str.strip()
    )

    # Extract fields after the last JSON blob
    # Pattern: ProductsPerDripkg, SeedingType, SowingDurationday, TotalDurationday,
    #          harvestInterval, img, seedsPerDrip, ref
    post_json = re.search(
        r"'([\d.]+)',\s*'([^']+)',\s*'(\d+)',\s*'(\d+)',\s*'(\d+)',\s*(null|'[^']*'),\s*'([\d.]+|null)',\s*'([0-9a-f-]{36})'[^']*$",
        row_str
    )

    if not pre_json or not post_json:
        return None

    # Extract PlanningFertilizer JSON (between NetYieldPerDripkg and PollinationLosspercent)
    fertilizer_json = None
    fert_match = re.search(r"'(\{\"Day\".*?\})',\s*'[\d.]+'", row_str)
    if fert_match:
        try:
            # The JSON uses double quotes inside SQL single quotes
            fertilizer_json = json.loads(fert_match.group(1))
        except json.JSONDecodeError:
            fertilizer_json = None

    # Extract PollinationLosspercent (after first JSON, before second JSON)
    poll_match = re.search(r"\}',\s*'([\d.]+)',\s*'", row_str)
    pollination_loss = float(poll_match.group(1)) if poll_match else 0

    return {
        "firebaseId": pre_json.group(1).strip("'") if pre_json.group(1) != "null" else None,
        "cleaningDays": int(pre_json.group(2)),
        "daysOfFertilize": int(pre_json.group(3)),
        "harvestDurationDays": int(pre_json.group(4)),
        "item": pre_json.group(5),
        "netYieldPerDripKg": float(pre_json.group(6)),
        "pollinationLossPercent": pollination_loss,
        "planningFertilizer": fertilizer_json,
        "productsPerDripKg": float(post_json.group(1)),
        "seedingType": post_json.group(2),
        "sowingDurationDays": int(post_json.group(3)),
        "totalDurationDays": int(post_json.group(4)),
        "harvestInterval": int(post_json.group(5)),
        "img": post_json.group(6).strip("'") if post_json.group(6) != "null" else None,
        "seedsPerDrip": parse_seeds(post_json.group(7)),
        "ref": post_json.group(8),
    }


def parse_seeds(val: str) -> int:
    """Parse seedsPerDrip, defaulting to 1 if null/0."""
    if val == "null" or val is None:
        return 1
    try:
        v = float(val)
        return max(1, int(v))
    except ValueError:
        return 1


def convert_to_plant_data(row: dict) -> dict:
    """Convert a parsed old row into the new plant_data document."""
    seeds = row["seedsPerDrip"]
    net_yield = row["netYieldPerDripKg"]

    # Core conversion: yield per plant = yield per drip / seeds per drip
    yield_per_plant = round(net_yield / seeds, 4) if seeds > 0 else net_yield

    now = datetime.now(timezone.utc)

    # Build notes from old data that doesn't have a direct field mapping
    notes_parts = []
    if row["cleaningDays"] > 0:
        notes_parts.append(f"Cleaning period: {row['cleaningDays']} days")
    if row["harvestInterval"] > 0:
        notes_parts.append(f"Harvest interval: {row['harvestInterval']} days")
    if row["pollinationLossPercent"] > 0:
        notes_parts.append(f"Pollination loss: {row['pollinationLossPercent']}%")
    notes_parts.append(f"Seeding type: {row['seedingType']}")
    notes_parts.append(f"Sowing duration: {row['sowingDurationDays']} days")
    notes_parts.append(f"Harvest duration: {row['harvestDurationDays']} days")
    notes_parts.append(f"Fertilization period: {row['daysOfFertilize']} days")
    if net_yield != yield_per_plant:
        notes_parts.append(f"Original yield per drip: {net_yield} kg (with {seeds} seeds/drip)")

    doc = {
        "plantDataId": row["ref"],
        "plantName": row["item"],
        "scientificName": None,
        "plantType": "Crop",
        "growthCycleDays": row["totalDurationDays"],
        "minTemperatureCelsius": None,
        "maxTemperatureCelsius": None,
        "optimalPHMin": None,
        "optimalPHMax": None,
        "wateringFrequencyDays": None,
        "sunlightHoursDaily": None,
        "expectedYieldPerPlant": yield_per_plant,
        "yieldUnit": "kg",
        "seedsPerPlantingPoint": seeds,
        "spacingCategory": None,
        "notes": " | ".join(notes_parts),
        "tags": _generate_tags(row["item"], row["seedingType"]),
        "contributor": {
            "name": "Legacy Migration",
            "organization": "Agrinova",
            "contributedAt": "January 2026 (migrated from old system)",
        },
        "dataVersion": 1,
        "createdBy": ADMIN_USER_ID,
        "createdByEmail": ADMIN_EMAIL,
        "createdAt": now,
        "updatedAt": now,
        # Preserve old data for reference
        "_migration": {
            "source": "standard_planning",
            "migratedAt": now,
            "originalFields": {
                "netYieldPerDripKg": net_yield,
                "productsPerDripKg": row["productsPerDripKg"],
                "seedsPerDrip": row["seedsPerDrip"],
                "firebaseId": row["firebaseId"],
            },
        },
    }

    # Store fertilizer schedule if available
    if row["planningFertilizer"]:
        doc["_migration"]["fertilizerSchedule"] = row["planningFertilizer"]

    return doc


def _generate_tags(item_name: str, seeding_type: str) -> list[str]:
    """Generate search tags from crop name and type."""
    tags = ["vegetable", "crop"]
    name_lower = item_name.lower()

    if "lettuce" in name_lower:
        tags.extend(["lettuce", "leafy-green"])
    elif "tomato" in name_lower:
        tags.extend(["tomato", "fruit-vegetable"])
    elif "pepper" in name_lower or "capsicum" in name_lower or "chili" in name_lower or "habanero" in name_lower:
        tags.extend(["pepper", "spicy"])
    elif "melon" in name_lower or "watermelon" in name_lower:
        tags.extend(["melon", "fruit"])
    elif "cabbage" in name_lower or "cauliflower" in name_lower:
        tags.extend(["brassica", "leafy-green"])
    elif "bean" in name_lower:
        tags.extend(["legume", "beans"])
    elif "zucchini" in name_lower or "marrow" in name_lower:
        tags.extend(["squash", "cucurbit"])
    elif "cucumber" in name_lower:
        tags.extend(["cucumber", "cucurbit"])
    elif "pumpkin" in name_lower or "gourd" in name_lower or "butternut" in name_lower:
        tags.extend(["squash", "cucurbit"])
    elif "corn" in name_lower:
        tags.extend(["grain", "cereal"])
    elif "onion" in name_lower or "leek" in name_lower:
        tags.extend(["allium", "root-vegetable"])
    elif "potato" in name_lower:
        tags.extend(["tuber", "root-vegetable"])
    elif "eggplant" in name_lower:
        tags.extend(["eggplant", "fruit-vegetable"])
    elif "okra" in name_lower:
        tags.extend(["okra"])
    elif "celery" in name_lower or "fennel" in name_lower:
        tags.extend(["herb", "aromatic"])

    if seeding_type.lower() == "seedling":
        tags.append("transplant")
    elif "seed" in seeding_type.lower():
        tags.append("direct-sow")

    return list(set(tags))


def main():
    dry_run = "--dry-run" in sys.argv

    print(f"{'[DRY RUN] ' if dry_run else ''}Migrating standard_planning → plant_data")
    print(f"Source: {SQL_FILE}")
    print(f"Target: {DB_NAME}.{COLLECTION}")
    print()

    # Parse SQL
    rows = parse_sql_rows(SQL_FILE)
    valid_rows = [r for r in rows if r is not None]
    print(f"Parsed {len(valid_rows)}/{len(rows)} rows from SQL")

    # Filter out placeholder entries (e.g., "Empty" with 0 yield)
    valid_rows = [r for r in valid_rows if r["item"] != "Empty" and r["netYieldPerDripKg"] > 0]
    print(f"After filtering placeholders: {len(valid_rows)} rows")

    # Convert to new schema
    documents = [convert_to_plant_data(r) for r in valid_rows]

    # Print summary
    print()
    print(f"{'Item':<30} {'OldYield/Drip':>13} {'Seeds/Drip':>10} {'NewYield/Plant':>14} {'Seeds/Point':>11}")
    print("-" * 80)
    for doc, row in zip(documents, valid_rows):
        print(
            f"{doc['plantName']:<30} "
            f"{row['netYieldPerDripKg']:>13.2f} "
            f"{row['seedsPerDrip']:>10} "
            f"{doc['expectedYieldPerPlant']:>14.4f} "
            f"{doc['seedsPerPlantingPoint']:>11}"
        )

    print()
    print(f"Total documents to insert: {len(documents)}")

    if dry_run:
        print("\n[DRY RUN] No changes made to database.")
        return

    # Insert into MongoDB
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    collection = db[COLLECTION]

    # Check for existing data
    existing = collection.count_documents({})
    if existing > 0:
        print(f"\nWARNING: {COLLECTION} already has {existing} documents.")
        response = input("Drop existing and re-insert? [y/N]: ")
        if response.lower() != "y":
            print("Aborted.")
            return
        collection.drop()
        print(f"Dropped {COLLECTION}")

    # Insert
    result = collection.insert_many(documents)
    print(f"\nInserted {len(result.inserted_ids)} documents into {COLLECTION}")

    # Create index on plantDataId
    collection.create_index("plantDataId", unique=True)
    collection.create_index("plantName")
    print("Created indexes on plantDataId (unique) and plantName")

    # Verify
    count = collection.count_documents({})
    print(f"Verification: {count} documents in {COLLECTION}")

    client.close()
    print("\nMigration complete!")


if __name__ == "__main__":
    main()
