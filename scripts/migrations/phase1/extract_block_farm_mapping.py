#!/usr/bin/env python3
"""Extract block prefix to farm mapping from block_standard SQL"""

import re

with open('OldData/220126/block_standard_rows.sql') as f:
    content = f.read()

# The schema is: Area, BlockID, TotalDrips, ref, farm_details_ref, farm_types_ref, farm, type
# We need BlockID and farm columns

# Find all value tuples
values_start = content.find("VALUES")
values_section = content[values_start + 7:]

# Simple extraction - find patterns
block_pattern = r"'([A-Z]+\.?[A-Z]*-[0-9]+)'"
farm_pattern = r"', '([^']+)', '(Open Field|Green House|Hydroponic)'\)"

mapping = {}
prefixes = {}

# Parse each tuple
for match in re.finditer(r"\(([^)]+)\)", values_section):
    fields = match.group(1).split("', '")
    if len(fields) >= 8:
        try:
            # fields[1] is BlockID, fields[6] is farm name
            block_id = fields[1].replace("'", "")
            farm_name = fields[6].replace("'", "")
            prefix = block_id.split("-")[0]

            if prefix not in mapping:
                mapping[prefix] = farm_name

            if prefix not in prefixes:
                prefixes[prefix] = 0
            prefixes[prefix] += 1
        except:
            pass

print("Prefix → Farm Name Mapping:")
print("-" * 40)
for prefix, farm in sorted(mapping.items()):
    count = prefixes.get(prefix, 0)
    print(f"  {prefix:6} → {farm:25} ({count} blocks)")
