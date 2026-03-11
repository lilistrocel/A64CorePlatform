"""
Migration Script: standard_planning (SQL) → plant_data_enhanced (MongoDB)

Migrates the 56 crop records from the old system into the enhanced plant data
collection, including fertigation card generation with pattern detection.

Fertigation logic:
- Parses day-by-day fertilizer JSON from old system
- Detects regular patterns (same dosage, consistent interval)
- Groups ingredients with the same frequency into "interval" rules
- Creates "custom" rules for irregular patterns (day-by-day)

Usage:
    python scripts/migrate_plant_data_enhanced.py [--dry-run]
"""

import re
import sys
import json
import math
from datetime import datetime, timezone
from collections import Counter, defaultdict
from pymongo import MongoClient

# --- Configuration ---
MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "a64core_db"
COLLECTION = "plant_data_enhanced"
SQL_FILE = "OldData/220126/standard_planning_rows.sql"

ADMIN_USER_ID = "bff26b8f-5ce9-49b2-9126-86174eaea823"
ADMIN_EMAIL = "admin@a64platform.com"

# Pattern detection: if >=80% of intervals match, it's a pattern
PATTERN_THRESHOLD = 0.75

# Ingredient category mapping
INGREDIENT_CATEGORIES = {
    "Urea": "macro_npk",
    "28.14.14": "macro_npk",
    "20.20.20": "macro_npk",
    "12.61.0": "macro_npk",
    "MAP": "macro_npk",
    "MKP": "macro_npk",
    "Potassium Sulfate": "potassium",
    "Potassium Sulfate ": "potassium",  # trailing space in some data
    "Pottassium sulfate ": "potassium",
    "Pottassium Nitrate": "potassium",
    "Potassium Nitrate": "potassium",
    "0.0.60": "potassium",
    "Cal Nitrate": "calcium",
    "Calmin Bor": "calcium",
    "Chelated Micro": "micronutrient",
    "Chaleted Micro": "micronutrient",  # typo in some data
    "Ferro": "micronutrient",
    "MG+Zn": "micronutrient",
    "Amino Acids": "supplement",
    "Humic": "supplement",
    "Mg Sulfate": "supplement",
    "Phosphoric Acid": "supplement",
    "Phosphric Acid": "supplement",  # typo in some data
    "7 Rocks": "supplement",
    "Amcoton": "supplement",
    "Tarvit": "supplement",
}

# Standardize ingredient names (fix typos)
INGREDIENT_NAME_FIXES = {
    "Pottassium sulfate ": "Potassium Sulfate",
    "Potassium Sulfate ": "Potassium Sulfate",
    "Pottassium Nitrate": "Potassium Nitrate",
    "Chaleted Micro": "Chelated Micro",
    "Phosphric Acid": "Phosphoric Acid",
}


def parse_sql_rows(filepath: str) -> list[dict]:
    """Parse standard_planning SQL INSERT into structured rows."""
    with open(filepath, "r") as f:
        content = f.read()

    values_start = content.find("VALUES")
    if values_start == -1:
        raise ValueError("No VALUES clause found in SQL file")

    values_str = content[values_start + 6:]
    raw_rows = []
    i = 0

    while i < len(values_str):
        if values_str[i] == "(":
            depth = 0
            j = i
            while j < len(values_str):
                if values_str[j] == "(":
                    depth += 1
                elif values_str[j] == ")":
                    depth -= 1
                    if depth == 0:
                        raw_rows.append(values_str[i + 1:j])
                        i = j + 1
                        break
                j += 1
            else:
                break
        i += 1

    return [r for r in (parse_row(s) for s in raw_rows) if r is not None]


def parse_row(row_str: str) -> dict | None:
    """Parse a single SQL row string."""
    # Extract fields before first JSON
    pre_json = re.match(
        r"(null|'[^']*'),\s*'(\d+)',\s*'(\d+)',\s*'(\d+)',\s*'([^']+)',\s*'([\d.]+)'",
        row_str.strip()
    )
    # Extract fields after last JSON
    post_json = re.search(
        r"'([\d.]+)',\s*'([^']+)',\s*'(\d+)',\s*'(\d+)',\s*'(\d+)',\s*(null|'[^']*'),\s*'([\d.]+|null)',\s*'([0-9a-f-]{36})'[^']*$",
        row_str
    )
    if not pre_json or not post_json:
        return None

    # Extract PlanningFertilizer JSON
    fertilizer_json = None
    fert_match = re.search(r"'(\{\"Day\".*?\})',\s*'[\d.]+'", row_str)
    if fert_match:
        try:
            fertilizer_json = json.loads(fert_match.group(1))
        except json.JSONDecodeError:
            pass

    # Extract ProcessedFertilizerData JSON (array of {identifier, value})
    processed_fert = None
    proc_match = re.search(r"'(\[\{\"identifier\".*?\}\])'", row_str)
    if proc_match:
        try:
            processed_fert = json.loads(proc_match.group(1))
        except json.JSONDecodeError:
            pass

    seeds_raw = post_json.group(7)
    seeds = 1
    if seeds_raw and seeds_raw != "null":
        try:
            seeds = max(1, int(float(seeds_raw)))
        except ValueError:
            seeds = 1

    return {
        "cleaningDays": int(pre_json.group(2)),
        "daysOfFertilize": int(pre_json.group(3)),
        "harvestDurationDays": int(pre_json.group(4)),
        "item": pre_json.group(5),
        "netYieldPerDripKg": float(pre_json.group(6)),
        "planningFertilizer": fertilizer_json,
        "processedFertilizer": processed_fert,
        "productsPerDripKg": float(post_json.group(1)),
        "seedingType": post_json.group(2),
        "sowingDurationDays": int(post_json.group(3)),
        "totalDurationDays": int(post_json.group(4)),
        "harvestInterval": int(post_json.group(5)),
        "seedsPerDrip": seeds,
        "ref": post_json.group(8),
    }


# ==================== Fertigation Pattern Detection ====================

def standardize_name(name: str) -> str:
    """Fix typos and standardize ingredient names."""
    return INGREDIENT_NAME_FIXES.get(name, name)


def get_category(name: str) -> str:
    """Get ingredient category."""
    std_name = standardize_name(name)
    return INGREDIENT_CATEGORIES.get(std_name, INGREDIENT_CATEGORIES.get(name, "other"))


def analyze_ingredient(days: list, values: list) -> dict:
    """Analyze a single ingredient's application pattern."""
    active = [(days[i], values[i]) for i in range(len(values)) if values[i] > 0]

    if not active:
        return {"type": "unused"}

    if len(active) == 1:
        return {
            "type": "interval",
            "dominant_interval": 0,  # one-time
            "dominant_dosage": active[0][1],
            "day_start": active[0][0],
            "day_end": active[0][0],
            "applications": 1,
            "pattern_confidence": 1.0,
            "active_days": active,
        }

    # Calculate intervals between applications
    intervals = [active[i + 1][0] - active[i][0] for i in range(len(active) - 1)]
    dosages = [a[1] for a in active]

    # Find dominant interval
    interval_counts = Counter(intervals)
    dominant_interval, dominant_count = interval_counts.most_common(1)[0]
    interval_confidence = dominant_count / len(intervals)

    # Find dominant dosage
    dosage_counts = Counter(dosages)
    dominant_dosage, dosage_count = dosage_counts.most_common(1)[0]
    dosage_confidence = dosage_count / len(dosages)

    # Combined confidence
    combined_confidence = (interval_confidence + dosage_confidence) / 2

    if combined_confidence >= PATTERN_THRESHOLD:
        return {
            "type": "interval",
            "dominant_interval": dominant_interval,
            "dominant_dosage": dominant_dosage,
            "day_start": active[0][0],
            "day_end": active[-1][0],
            "applications": len(active),
            "pattern_confidence": combined_confidence,
            "active_days": active,
        }
    else:
        return {
            "type": "custom",
            "dominant_interval": dominant_interval,
            "dominant_dosage": dominant_dosage,
            "day_start": active[0][0],
            "day_end": active[-1][0],
            "applications": len(active),
            "pattern_confidence": combined_confidence,
            "active_days": active,
        }


def build_fertigation_card(fert_json: dict, total_days: int, days_of_fertilize: int) -> dict | None:
    """Build a fertigation card from the old fertilizer schedule JSON."""
    if not fert_json:
        return None

    days = fert_json.get("Day", [])
    ingredients = {k: v for k, v in fert_json.items() if k != "Day"}

    if not days or not ingredients:
        return None

    # Analyze each ingredient
    analyses = {}
    for name, values in ingredients.items():
        if len(values) != len(days):
            continue
        analysis = analyze_ingredient(days, values)
        if analysis["type"] != "unused":
            analyses[standardize_name(name)] = analysis

    if not analyses:
        return None

    # Group interval-type ingredients by their frequency
    interval_groups = defaultdict(list)
    custom_ingredients = []

    for name, analysis in analyses.items():
        if analysis["type"] == "interval":
            freq = analysis["dominant_interval"]
            interval_groups[freq].append((name, analysis))
        else:
            custom_ingredients.append((name, analysis))

    # Build rules
    rules = []

    # Interval rules: group by frequency
    freq_labels = {
        0: "One-time Application",
        1: "Daily",
        2: "Every 2 Days",
        3: "Every 3 Days",
        7: "Weekly",
        14: "Bi-weekly",
        21: "Every 3 Weeks",
        28: "Monthly",
        42: "Every 6 Weeks",
    }

    for freq, group in sorted(interval_groups.items()):
        label = freq_labels.get(freq, f"Every {freq} Days")
        day_starts = [a["day_start"] for _, a in group]
        day_ends = [a["day_end"] for _, a in group]

        rule_ingredients = []
        for name, analysis in group:
            rule_ingredients.append({
                "name": name,
                "category": get_category(name),
                "dosagePerPoint": round(analysis["dominant_dosage"], 4),
                "unit": "g",
            })

        rule = {
            "name": label,
            "type": "interval",
            "frequencyDays": freq if freq > 0 else None,
            "activeDayStart": min(day_starts),
            "activeDayEnd": max(day_ends),
            "ingredients": rule_ingredients,
        }

        # For one-time applications, use custom type instead
        if freq == 0:
            rule["type"] = "custom"
            rule["frequencyDays"] = None
            rule["activeDayStart"] = None
            rule["activeDayEnd"] = None
            rule["applications"] = []
            for name, analysis in group:
                rule["applications"].append({
                    "day": analysis["day_start"],
                    "ingredients": [{
                        "name": name,
                        "category": get_category(name),
                        "dosagePerPoint": round(analysis["dominant_dosage"], 4),
                        "unit": "g",
                    }]
                })
            rule["ingredients"] = None

        rules.append(rule)

    # Custom rules: each irregular ingredient gets its own rule
    for name, analysis in custom_ingredients:
        applications = []
        for day, dosage in analysis["active_days"]:
            applications.append({
                "day": day,
                "ingredients": [{
                    "name": name,
                    "category": get_category(name),
                    "dosagePerPoint": round(dosage, 4),
                    "unit": "g",
                }]
            })

        rules.append({
            "name": f"{name} (Custom)",
            "type": "custom",
            "frequencyDays": None,
            "activeDayStart": None,
            "activeDayEnd": None,
            "ingredients": None,
            "applications": applications,
        })

    card_day_end = max(days) if days else total_days

    return {
        "cardName": "Full Cycle",
        "growthStage": "general",
        "dayStart": min(days) if days else 0,
        "dayEnd": card_day_end,
        "rules": rules,
        "notes": f"Migrated from legacy system. {len(rules)} rules, {len(analyses)} active ingredients.",
        "isActive": True,
    }


# ==================== Document Builder ====================

def generate_tags(item_name: str, seeding_type: str) -> list[str]:
    """Generate search tags from crop name and type."""
    tags = ["vegetable", "crop"]
    name_lower = item_name.lower()

    tag_map = {
        "lettuce": ["lettuce", "leafy-green"],
        "tomato": ["tomato", "fruit-vegetable"],
        "pepper": ["pepper", "spicy"],
        "capsicum": ["pepper", "spicy"],
        "chili": ["pepper", "spicy"],
        "habanero": ["pepper", "spicy"],
        "melon": ["melon", "fruit"],
        "watermelon": ["melon", "fruit"],
        "cabbage": ["brassica", "leafy-green"],
        "cauliflower": ["brassica", "leafy-green"],
        "bean": ["legume", "beans"],
        "zucchini": ["squash", "cucurbit"],
        "marrow": ["squash", "cucurbit"],
        "cucumber": ["cucumber", "cucurbit"],
        "pumpkin": ["squash", "cucurbit"],
        "gourd": ["squash", "cucurbit"],
        "butternut": ["squash", "cucurbit"],
        "corn": ["grain", "cereal"],
        "onion": ["allium", "root-vegetable"],
        "leek": ["allium", "root-vegetable"],
        "potato": ["tuber", "root-vegetable"],
        "eggplant": ["eggplant", "fruit-vegetable"],
        "okra": ["okra"],
        "celery": ["herb", "aromatic"],
        "fennel": ["herb", "aromatic"],
        "mulukhiyah": ["leafy-green"],
        "hydroponics": ["hydroponic"],
    }

    for keyword, extra_tags in tag_map.items():
        if keyword in name_lower:
            tags.extend(extra_tags)
            break

    if seeding_type.lower() == "seedling":
        tags.append("transplant")
    elif "seed" in seeding_type.lower():
        tags.append("direct-sow")

    return list(set(tags))


def convert_to_enhanced(row: dict) -> dict:
    """Convert a parsed old row into plant_data_enhanced document."""
    seeds = row["seedsPerDrip"]
    net_yield = row["netYieldPerDripKg"]
    yield_per_plant = round(net_yield / seeds, 4) if seeds > 0 else net_yield

    now = datetime.now(timezone.utc)

    # Build fertigation schedule
    fert_card = build_fertigation_card(
        row["planningFertilizer"],
        row["totalDurationDays"],
        row["daysOfFertilize"],
    )

    fertigation_schedule = None
    if fert_card:
        fertigation_schedule = {
            "cards": [fert_card],
            "totalFertilizationDays": row["daysOfFertilize"],
            "source": "legacy_migration",
        }

    # Build notes from unmapped fields
    notes_parts = []
    if row["cleaningDays"] > 0:
        notes_parts.append(f"Cleaning period: {row['cleaningDays']} days")
    if row["harvestInterval"] > 0:
        notes_parts.append(f"Harvest interval: {row['harvestInterval']} days")
    notes_parts.append(f"Seeding type: {row['seedingType']}")
    if net_yield != yield_per_plant:
        notes_parts.append(f"Original yield per drip: {net_yield} kg ({seeds} seeds/drip)")

    # Total fertilizer consumption from ProcessedFertilizerData
    total_fert_summary = None
    if row["processedFertilizer"]:
        total_fert_summary = {
            item["identifier"]: round(item["value"], 2)
            for item in row["processedFertilizer"]
            if item.get("value", 0) > 0
        }

    doc = {
        "plantDataId": row["ref"],
        "plantName": row["item"],
        "scientificName": None,
        "farmTypeCompatibility": ["open_field"],  # Default for legacy crops
        "growthCycle": {
            "germinationDays": row["sowingDurationDays"],
            "vegetativeDays": max(0, row["totalDurationDays"] - row["sowingDurationDays"] - row["harvestDurationDays"]),
            "floweringDays": 0,
            "fruitingDays": 0,
            "harvestDurationDays": row["harvestDurationDays"],
            "totalCycleDays": row["totalDurationDays"],
        },
        "yieldInfo": {
            "yieldPerPlant": yield_per_plant,
            "yieldUnit": "kg",
            "seedsPerPlantingPoint": seeds,
            "expectedWastePercentage": 0,
        },
        "environmentalRequirements": {
            "temperature": {
                "minCelsius": 15.0,
                "maxCelsius": 40.0,
                "optimalCelsius": 28.0,
            },
        },
        "wateringRequirements": {
            "frequencyDays": 1,
            "waterType": "tap",
            "droughtTolerance": "low",
        },
        "soilRequirements": {
            "phRequirements": {"minPH": 5.5, "maxPH": 7.5, "optimalPH": 6.5},
            "soilTypes": ["sandy"],
        },
        "lightRequirements": {
            "lightType": "full_sun",
            "minHoursDaily": 6,
            "maxHoursDaily": 12,
            "optimalHoursDaily": 8,
        },
        "economicsAndLabor": {
            "totalManHoursPerPlant": 0.1,
            "currency": "AED",
        },
        "additionalInfo": {
            "growthHabit": "bush",
            "spacing": {
                "betweenPlantsCm": 50,
                "betweenRowsCm": 100,
            },
            "supportRequirements": "none",
            "notes": " | ".join(notes_parts) if notes_parts else None,
        },
        "fertigationSchedule": fertigation_schedule,
        "spacingCategory": None,
        "contributor": "Legacy Migration (Agrinova)",
        "targetRegion": "UAE",
        "tags": generate_tags(row["item"], row["seedingType"]),
        "dataVersion": 1,
        "isActive": True,
        "createdBy": ADMIN_USER_ID,
        "createdByEmail": ADMIN_EMAIL,
        "createdAt": now,
        "updatedAt": now,
        "deletedAt": None,
        # Migration metadata (not part of schema, for reference)
        "_migration": {
            "source": "standard_planning",
            "migratedAt": now,
            "originalFields": {
                "netYieldPerDripKg": net_yield,
                "productsPerDripKg": row["productsPerDripKg"],
                "seedsPerDrip": row["seedsPerDrip"],
                "daysOfFertilize": row["daysOfFertilize"],
                "sowingDurationDays": row["sowingDurationDays"],
            },
        },
    }

    # Store total fertilizer consumption summary
    if total_fert_summary:
        doc["_migration"]["totalFertilizerConsumption"] = total_fert_summary

    return doc


def print_fertigation_summary(doc: dict):
    """Print a summary of the fertigation card for a crop."""
    name = doc["plantName"]
    fert = doc.get("fertigationSchedule")
    if not fert or not fert.get("cards"):
        print(f"  {name:<30} No fertigation data")
        return

    card = fert["cards"][0]
    interval_rules = [r for r in card["rules"] if r["type"] == "interval"]
    custom_rules = [r for r in card["rules"] if r["type"] == "custom"]
    total_ingredients = sum(
        len(r.get("ingredients", []) or []) for r in interval_rules
    ) + sum(
        len(set(
            ing["name"]
            for app in (r.get("applications") or [])
            for ing in app.get("ingredients", [])
        )) for r in custom_rules
    )

    print(
        f"  {name:<30} "
        f"Day {card['dayStart']}-{card['dayEnd']:>3} | "
        f"{len(interval_rules)} interval + {len(custom_rules)} custom rules | "
        f"{total_ingredients} ingredients"
    )


def main():
    dry_run = "--dry-run" in sys.argv

    print(f"{'[DRY RUN] ' if dry_run else ''}Migrating standard_planning → plant_data_enhanced")
    print(f"Source: {SQL_FILE}")
    print(f"Target: {DB_NAME}.{COLLECTION}")
    print()

    # Parse SQL
    rows = parse_sql_rows(SQL_FILE)
    print(f"Parsed {len(rows)} rows from SQL")

    # Filter placeholders
    rows = [r for r in rows if r["item"] != "Empty" and r["netYieldPerDripKg"] > 0]
    print(f"After filtering placeholders: {len(rows)} rows")
    print()

    # Convert
    documents = [convert_to_enhanced(r) for r in rows]

    # Print yield summary
    print(f"{'Crop':<30} {'Yield/Plant':>11} {'Seeds/Pt':>9} {'Yield/Pt':>9}")
    print("-" * 65)
    for doc in documents:
        yi = doc["yieldInfo"]
        yield_per_point = yi["yieldPerPlant"] * yi["seedsPerPlantingPoint"]
        print(
            f"{doc['plantName']:<30} "
            f"{yi['yieldPerPlant']:>11.4f} "
            f"{yi['seedsPerPlantingPoint']:>9} "
            f"{yield_per_point:>9.4f}"
        )

    # Print fertigation summary
    print()
    print("Fertigation Cards:")
    print("-" * 85)
    for doc in documents:
        print_fertigation_summary(doc)

    # Stats
    with_fert = sum(1 for d in documents if d.get("fertigationSchedule"))
    print(f"\nCrops with fertigation: {with_fert}/{len(documents)}")
    print(f"Total documents to insert: {len(documents)}")

    if dry_run:
        print("\n[DRY RUN] No changes made to database.")
        return

    # Insert into MongoDB
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    collection = db[COLLECTION]

    existing = collection.count_documents({})
    if existing > 0:
        print(f"\nWARNING: {COLLECTION} already has {existing} documents.")
        response = input("Drop existing and re-insert? [y/N]: ")
        if response.lower() != "y":
            print("Aborted.")
            return
        collection.drop()
        print(f"Dropped {COLLECTION}")

    result = collection.insert_many(documents)
    print(f"\nInserted {len(result.inserted_ids)} documents into {COLLECTION}")

    # Create indexes
    collection.create_index("plantDataId", unique=True)
    collection.create_index("plantName")
    collection.create_index("isActive")
    collection.create_index("tags")
    collection.create_index("farmTypeCompatibility")
    collection.create_index([("plantName", "text"), ("tags", "text")])
    print("Created indexes")

    count = collection.count_documents({})
    print(f"Verification: {count} documents in {COLLECTION}")

    client.close()
    print("\nMigration complete!")


if __name__ == "__main__":
    main()
