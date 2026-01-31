#!/usr/bin/env python3
"""
Parse standard_planning_rows.sql and extract plant data for migration.
Outputs JSON that can be used by mongosh for insertion.
"""

import re
import json

# Read the SQL file
with open("OldData/220126/standard_planning_rows.sql", "r") as f:
    content = f.read()

# The column order from the INSERT statement:
# __id__, Cleaningday, DaysOfFertilize, HarvestDurationday, Item, NetYieldPerDripkg,
# PlanningFertilizer, PollinationLosspercent, ProcessedFertilizerData, ProductsPerDripkg,
# SeedingType, SowingDurationday, TotalDurationday, harvestInterval, img, seedsPerDrip, ref

# Extract all value tuples - this is tricky due to nested JSON
# Let's use a simpler approach: find the VALUES section and parse tuple by tuple

# Find VALUES section
values_start = content.find("VALUES")
values_section = content[values_start + 7:]  # Skip "VALUES "

# Parse tuples manually by tracking parentheses and quotes
plants = []
current_tuple = []
current_value = ""
in_quotes = False
paren_depth = 0
i = 0

while i < len(values_section):
    char = values_section[i]

    if char == "'" and (i == 0 or values_section[i-1] != "\\"):
        in_quotes = not in_quotes
        current_value += char
    elif char == "(" and not in_quotes:
        paren_depth += 1
        if paren_depth == 1:
            current_value = ""
            current_tuple = []
    elif char == ")" and not in_quotes:
        paren_depth -= 1
        if paren_depth == 0:
            # End of tuple
            current_tuple.append(current_value.strip())
            if len(current_tuple) >= 17:  # We expect 17 columns
                plants.append(current_tuple)
            current_tuple = []
            current_value = ""
    elif char == "," and not in_quotes and paren_depth == 1:
        # Column separator within tuple
        current_tuple.append(current_value.strip())
        current_value = ""
    else:
        current_value += char

    i += 1

# Process and output
print(f"Found {len(plants)} plant records")
print("\n// Plant data for mongosh:")
print("const plants = [")

for plant in plants:
    try:
        # Extract values (removing quotes)
        def clean_val(v):
            v = v.strip()
            if v == "null" or v == "NULL":
                return None
            if v.startswith("'") and v.endswith("'"):
                return v[1:-1]
            return v

        # Column indices:
        # 0: __id__, 1: Cleaningday, 2: DaysOfFertilize, 3: HarvestDurationday, 4: Item
        # 5: NetYieldPerDripkg, 6: PlanningFertilizer, 7: PollinationLosspercent
        # 8: ProcessedFertilizerData, 9: ProductsPerDripkg, 10: SeedingType
        # 11: SowingDurationday, 12: TotalDurationday, 13: harvestInterval
        # 14: img, 15: seedsPerDrip, 16: ref

        item_name = clean_val(plant[4])
        ref = clean_val(plant[16])
        total_days = clean_val(plant[12])
        harvest_days = clean_val(plant[3])
        sowing_days = clean_val(plant[11])
        cleaning_days = clean_val(plant[1])
        yield_per_drip = clean_val(plant[5])
        seeding_type = clean_val(plant[10])
        harvest_interval = clean_val(plant[13])

        # Skip if no name or ref
        if not item_name or not ref or item_name == ", ":
            continue

        print(f'  {{name: "{item_name}", ref: "{ref}", totalDays: {total_days or 60}, harvestDays: {harvest_days or 14}, sowingDays: {sowing_days or 7}, yieldPerDrip: {yield_per_drip or 1}, seedingType: "{seeding_type or "Seedling"}", harvestInterval: {harvest_interval or 7}}},')

    except Exception as e:
        print(f"  // Error parsing: {e}", file=__import__("sys").stderr)

print("];")
