#!/usr/bin/env python3
"""
Phase 3: Migrate farm_block → Virtual Blocks (v3 - final parser)
"""

import re
import json

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
    """Parse farm_block SQL with comprehensive pattern matching"""
    with open(filepath) as f:
        content = f.read()

    blocks = []

    # First, find all records by matching the pattern after InventoryData JSON
    # Format: }', 'drips', 'season', 'state', 'time_finish', 'time_start', 'ref', 'farm_ref', 'block_std_ref', 'plant_ref', 'block_id', 'farm_name', 'Item', ...

    # Pattern for the fields we need (after JSON ends with }')
    main_pattern = r"\}',\s*'(\d+)',\s*'(\d+)',\s*'([^']+)',\s*'([^']*)',\s*'([^']*)',\s*'([a-f0-9-]+)',\s*'([a-f0-9-]+)',\s*'([a-f0-9-]+)',\s*'([a-f0-9-]+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'"

    for m in re.finditer(main_pattern, content):
        drips = m.group(1)
        season = m.group(2)
        state = m.group(3)
        time_finish = m.group(4)
        time_start = m.group(5)
        ref = m.group(6)
        farm_ref = m.group(7)
        block_std_ref = m.group(8)
        plant_ref = m.group(9)
        block_id = m.group(10)
        farm_name = m.group(11)
        crop_name = m.group(12)

        parent_code = extract_parent_code(block_id)

        blocks.append({
            "blockId": ref,
            "legacyBlockCode": block_id,
            "parentLegacyCode": parent_code,
            "blockStandardRef": block_std_ref,
            "plantRef": plant_ref if plant_ref and plant_ref != "null" else None,
            "drips": int(drips) if drips else None,
            "state": STATE_MAP.get(state, "empty"),
            "originalState": state,
            "timeStart": time_start if time_start and "null" not in time_start.lower() else None,
            "timeFinish": time_finish if time_finish and "null" not in time_finish.lower() else None,
            "cropName": crop_name,
            "farmName": farm_name,
            "season": int(season) if season else None,
        })

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

    # Crop distribution
    crops = {}
    for b in blocks:
        c = b["cropName"]
        crops[c] = crops.get(c, 0) + 1
    print(f"\nUnique crops: {len(crops)}")

    print("\nSample blocks:")
    for b in blocks[:5]:
        print(f"  {b['legacyBlockCode']} → parent: {b['parentLegacyCode']}, crop: {b['cropName']}, state: {b['state']}, drips: {b['drips']}")

    # Save to JSON
    with open('scripts/migrations/phase3/virtual_blocks.json', 'w') as f:
        json.dump(blocks, f, indent=2)
    print(f"\nWritten to scripts/migrations/phase3/virtual_blocks.json")
