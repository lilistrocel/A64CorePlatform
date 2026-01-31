#!/usr/bin/env python3
"""
Phase 3: Migrate farm_block → Virtual Blocks (v2 - more robust parser)
"""

import re
import json

# State mapping
STATE_MAP = {
    "Planted": "growing",
    "Harvested": "harvesting",
    "Planned": "planned",
}


def extract_parent_code(block_id):
    """Extract parent physical block code from virtual block code."""
    parts = block_id.rsplit("-", 1)
    if len(parts) == 2 and parts[1].isdigit():
        return parts[0]
    return block_id


def parse_farm_block_sql(filepath):
    """Parse farm_block SQL using regex patterns"""
    with open(filepath) as f:
        content = f.read()

    blocks = []

    # Pattern to match each record's key fields
    # Looking for: drips, plannedseason, state, time_finish, time_start, ref, farm_ref, block_standard_ref, plant_ref, block_id, farm_name, Item
    # Format after JSON: ', 'drips', 'season', 'state', 'time_finish', 'time_start', 'ref', ...

    # More specific pattern - find the section after InventoryData JSON
    # The JSON ends with }' and then we have the remaining fields
    pattern = r"\}',\s*'(\d+)',\s*'(\d+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([a-f0-9-]+)',\s*'([a-f0-9-]+)',\s*'([a-f0-9-]+)',\s*'([a-f0-9-]+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'"

    for match in re.finditer(pattern, content):
        try:
            drips = match.group(1)
            season = match.group(2)
            state = match.group(3)
            time_finish = match.group(4)
            time_start = match.group(5)
            ref = match.group(6)
            farm_ref = match.group(7)
            block_standard_ref = match.group(8)
            plant_ref = match.group(9)
            block_id = match.group(10)
            farm_name = match.group(11)
            crop_name = match.group(12)

            parent_code = extract_parent_code(block_id)

            blocks.append({
                "blockId": ref,
                "legacyBlockCode": block_id,
                "parentLegacyCode": parent_code,
                "blockStandardRef": block_standard_ref,
                "plantRef": plant_ref if plant_ref != "null" else None,
                "drips": int(drips) if drips else None,
                "state": STATE_MAP.get(state, "empty"),
                "originalState": state,
                "timeStart": time_start if "null" not in time_start.lower() else None,
                "timeFinish": time_finish if "null" not in time_finish.lower() else None,
                "cropName": crop_name,
                "farmName": farm_name,
                "season": season,
            })
        except Exception as e:
            print(f"Error: {e}")
            continue

    return blocks


if __name__ == "__main__":
    blocks = parse_farm_block_sql("OldData/220126/farm_block_rows.sql")
    print(f"Parsed {len(blocks)} virtual blocks")

    # State distribution
    states = {}
    for b in blocks:
        s = b["originalState"]
        states[s] = states.get(s, 0) + 1
    print("\nState distribution:")
    for s, c in sorted(states.items(), key=lambda x: -x[1]):
        print(f"  {s} → {STATE_MAP.get(s, 'empty')}: {c}")

    # Farm distribution
    farms = {}
    for b in blocks:
        f = b["farmName"]
        farms[f] = farms.get(f, 0) + 1
    print("\nFarm distribution:")
    for f, c in sorted(farms.items(), key=lambda x: -x[1]):
        print(f"  {f}: {c}")

    print("\nSample blocks:")
    for b in blocks[:5]:
        print(f"  {b['legacyBlockCode']} → parent: {b['parentLegacyCode']}, crop: {b['cropName']}, state: {b['state']}")

    # Save to JSON
    with open('scripts/migrations/phase3/virtual_blocks.json', 'w') as f:
        json.dump(blocks, f, indent=2)
    print(f"\nWritten to scripts/migrations/phase3/virtual_blocks.json")
